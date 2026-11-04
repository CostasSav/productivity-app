# Phase 3A — Read-only external calendar feeds

Server side in Phase 3A; the Week/Day client is Phase 3B and release preparation Phase 3C. Commits are local until the release checklist below says to push. The productivity database (`db.json`) and the sessions directory are never read or written by this feature.

The server periodically downloads published `.ics` feeds (Outlook and Google), keeps only each occurrence's title and time, and serves them to the signed-in owner for a date range.

## Railway variable

| Name | Purpose |
| --- | --- |
| `CALENDAR_FEEDS` | Optional. A single-line JSON array of up to 5 feeds. Absent or `[]` disables the feature. |

Format (placeholders shown — never paste a real link into code, tickets, chat or docs):

```json
[
  { "id": "work", "label": "Work", "color": "#1F6FEB", "url": "https://outlook.office365.com/owa/calendar/<ID>/<SECRET>/calendar.ics" },
  { "id": "personal", "label": "Personal", "color": "#2DA44E", "url": "https://calendar.google.com/calendar/ical/<ADDRESS>/private-<SECRET>/basic.ics" }
]
```

Rules:

- `id`: lowercase slug (`a-z`, `0-9`, single hyphens between words), max 32 characters, unique. It is the stable key for cached events; changing it discards that feed's cache.
- `label`: 1–60 characters, shown to the client.
- `color`: `#RRGGBB`.
- `url`: `https://` only, host exactly `outlook.office365.com`, `outlook.office.com` or `calendar.google.com`; no port or embedded credentials. If you were given a `webcal://` link, replace `webcal://` with `https://`.

If the value is invalid, the server logs one line such as `[calendar] CALENDAR_FEEDS invalid: feed_2_invalid_url; calendar disabled` and keeps running with the calendar disabled. **A calendar problem never stops startup.** The log names only the problem and the feed position, never the URL or the JSON.

Set it as a Railway service variable (backend only). Do not put it in any `VITE_` variable, client env file, or committed `.env`. No other variable changes; `DATA_DIR` is reused for the cache location.

## Getting the links

These links are bearer secrets: anyone holding one can read that calendar without signing in. Copy them straight into Railway's variable editor.

### Outlook (Microsoft 365 / Outlook on the web)

1. Open Outlook on the web → **Settings** (gear) → **Calendar** → **Shared calendars**.
2. Under **Publish a calendar**, choose the calendar and a permission level:
   - **Can view when I'm busy** — titles are not published; every event shows as `Busy`.
   - **Can view titles and locations** — recommended: titles are published (locations are discarded by this server anyway).
   - Avoid **Can view all details**: it publishes descriptions and attendees that this server would only throw away.
3. Select **Publish**, then copy the **ICS** link (not the HTML link).

Your organization's administrator may disable calendar publishing; if the Publish section is missing, the feature cannot be used for that calendar.

**Reset:** on the same page, select **Reset links** (old links stop working immediately) or **Unpublish**. Then update `CALENDAR_FEEDS` with the new ICS link.

### Google Calendar

1. Open Google Calendar on the web → **Settings** → under **Settings for my calendars**, select the calendar.
2. Open **Integrate calendar** and copy **Secret address in iCal format**. (Do not use the *public* address: that requires making the calendar public.)

Google Workspace administrators may hide the secret address. Google refreshes these feeds on its own schedule, so changes can take several hours to appear even though this server polls every 10 minutes.

**Reset:** next to the secret address, select **Reset**. The old address stops working; update `CALENDAR_FEEDS` with the new one.

After any reset, the feed shows `http_error` until the variable is updated; its last good events remain visible until then (see below). To remove a calendar immediately, delete its entry from `CALENDAR_FEEDS` and restart: its cached events are dropped on load.

## Data minimization

- At parse time each occurrence is reduced to `{ id, feedId, title, start, end, allDay }`. Descriptions, locations, attendees, organizers, URLs, conference links, alarms and all other properties are discarded before anything is stored. The raw `.ics` body is never written anywhere.
- `title` is SUMMARY with control characters removed, trimmed to 200 characters, or `Busy` when absent.
- `id` is an opaque hash of feed id, event UID and occurrence (the RECURRENCE-ID for a moved occurrence, so it keeps the identity of the slot it replaces). UIDs are not exposed.
- `start`/`end` are UTC ISO strings. All-day events use midnight UTC of their calendar dates with an exclusive end, e.g. a one-day event on 20 October is `2026-10-20T00:00:00.000Z` → `2026-10-21T00:00:00.000Z`, `allDay: true`.
- Cancelled events and cancelled occurrences (`STATUS:CANCELLED`, EXDATE) are excluded. Recurring series are expanded with time zones honoured, including Outlook's Windows zone names (e.g. `Romance Standard Time`) and DST changes.
- Only occurrences within **today − 14 days to today + 90 days** (UTC days) are kept, with at most 5,000 per feed.
- Feed URLs are held only in process memory from the environment variable. They are never logged, returned by the API, written to the cache or included in error messages (errors carry only a status code).

## Fetching and refresh

- Each feed is fetched server-side with a 15-second total timeout and a 5 MB cap (checked against `Content-Length` and while streaming). Redirects are followed manually, at most 5, and only while every hop stays on the HTTPS host allowlist.
- The first refresh starts after the server begins listening and does not delay startup. Then it runs every 10 minutes on an unref'd timer. Refreshes never overlap: a refresh requested while one is running joins it.
- Per feed status: `pending` (not fetched yet and nothing cached), `ok`, `timeout`, `http_error` (network failure, non-2xx, oversize, or a redirect off the allowlist), `parse_error` (body is not an iCalendar). `disabled` is reserved; a disabled feature reports `enabled: false` with no feeds.
- **A failed feed keeps its last good events and `lastSuccessAt`;** only its status changes. Failures log one line, e.g. `[calendar] feed work refresh failed: timeout`.

## Cache

- Events are kept in memory and in a single file, `<DATA_DIR>/calendar-cache/events.json` (directory mode 0700, file 0600), written atomically: a uniquely named temp file in the same directory, fsync, then rename. On startup the file is loaded so events show before the first refresh. A missing file is normal; an unreadable or invalid file is logged and ignored, never repaired or deleted.
- If the cache directory would coincide with or contain the session directory (an unusual `SESSION_DIR`), the feature runs memory-only.
- Deleting `calendar-cache/` is always safe: it only removes cached events until the next refresh. It is separate from `db.json` and `sessions/`, which this feature never touches.
- Same single-process, single-replica assumption as the rest of the backend.

## API

Both routes are under `/api`, so the existing session authentication, Origin/CSRF checks, `no-store` headers and global rate limit apply.

`GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD`

- `from`/`to` are inclusive **UTC** days, `to ≥ from`, at most 62 days. Invalid input returns 400.
- Returns events overlapping `[from 00:00Z, to+1 00:00Z)`. A client in Europe/Paris that wants local days should request one extra day on each side and filter locally.

```json
{
  "enabled": true,
  "feeds": [{ "id": "work", "label": "Work", "color": "#1f6feb", "lastSuccessAt": "2026-11-04T09:00:00.000Z", "status": "ok" }],
  "events": [{ "id": "3f…", "feedId": "work", "title": "Weekly sync", "start": "2026-11-09T08:00:00.000Z", "end": "2026-11-09T08:30:00.000Z", "allDay": false }]
}
```

`POST /api/calendar/refresh` (requires CSRF like other mutations) — runs a refresh, waits for it and returns `{ enabled, feeds }`. Limited to one per minute (429 with `Retry-After`); 409 when the feature is disabled.

## Tests

`npm run test -w server` now includes `server/tests/calendar.test.ts`. It uses only synthetic fixtures in `server/tests/fixtures/calendar/` and placeholder URLs, and an injected fake `fetch` (no network). It covers: config validation and host allowlist; an Outlook-style feed with a Windows TZID and a weekly series with one moved, one EXDATE-excluded and one `STATUS:CANCELLED` occurrence; a Google-style Europe/Paris feed; an all-day event; occurrences across the March and October 2026 DST changes; output containing no description, attendees or URLs; redirect, size and timeout limits; last-good data surviving a failed refresh; atomic cache write and reload; refresh de-duplication and the manual rate limit; range validation; and feed URLs never appearing in errors, logs, snapshots or the cache. `server/tests/calendarCheck.test.ts` covers the owner check script with the same fixtures and a fake fetch: grouping, markers, argument limits, refusal of piped input and URL arguments, and that nothing is printed or written.

## Files

Created: `server/src/calendar/config.ts`, `server/src/calendar/sync.ts`, `server/src/calendar/service.ts`, `server/src/calendar/router.ts`, `server/tests/calendar.test.ts`, `server/tests/fixtures/calendar/outlook.ics`, `server/tests/fixtures/calendar/google.ics`, `CALENDAR_FEEDS.md`.

Modified: `server/src/index.ts` (wiring), `server/package.json` (dependency `node-ical@^0.27.3`, test script), `server/tests/auth.test.ts` (mounted private prefix count 21 → 22), `package-lock.json`.

New dependency `node-ical` 0.27.3 (Apache-2.0, requires Node ≥ 22) brings `rrule-temporal`, `temporal-polyfill`, `temporal-spec` and `temporal-utils`. None appear in `npm audit --omit=dev`.

## Checking a real feed from your own terminal

`npm run calendar:check -w server` lets the owner see exactly what the server would extract from one feed before trusting the Week view. **Run it yourself, in your own interactive terminal.** Never paste a feed URL into chat, tickets or an AI assistant, and never give one to anyone else to run.

```powershell
npm run calendar:check -w server
npm run calendar:check -w server -- --from 2026-11-09 --to 2026-11-15
```

- It asks for **one** feed URL at a hidden prompt. It does not accept the URL as an argument, environment variable, file or piped input (non-interactive stdin is refused). `CALENDAR_FEEDS` and `.env` files are not read.
- The URL is never printed and nothing is written to disk.
- It uses the server's own code: the `CALENDAR_FEEDS` URL validation, the fetch limits (15 s, 5 MB, allowlisted redirects) and the parser (time zones, recurrences, EXDATE, moved and cancelled occurrences).
- `--from`/`--to` (YYYY-MM-DD) default to today → today + 7 and must stay inside the sync window (today − 14 to today + 90 days).
- Output is grouped by day in Europe/Paris: `start–end` (`(+1)` when it ends the next day) or `all day`, `rec` for an occurrence of a recurring series, and the title cut to 40 characters. It ends with totals and the feed status (`ok`, `timeout`, `http_error`, `parse_error`). Titles are your calendar data: keep the output private.

## Deploy order and Node version

- The client treats `/api/calendar/*` as optional. A 404, network error or unexpected response (for example the old server, or a frontend deployed before the backend) shows no events, no legend and no error, and does not poll until the next focus or navigation. Week/Day views keep working with tasks only. Deploying the server first is still the cleaner order.
- `server/package.json` declares `"engines": { "node": ">=22" }` (node-ical requirement). The repository has no `.nvmrc`, `.node-version`, `railway.json`, `nixpacks.toml`, Procfile or Dockerfile, so nothing in the repo pins or overrides the Node version. Whether Railway's builder honours `engines` must be confirmed in the Railway build logs; the repo cannot show it.

## Release checklist

1. While signed in, open `/api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD` on the Vercel domain (at most 62 days) and confirm every feed reports `"status": "ok"`.
2. Compare real events with Outlook and Google, with `calendar:check` or directly in the Week view, especially recurring meetings around a time change (29 March / 25 October) and moved or cancelled occurrences.
3. Push the remaining commits; confirm both the server and client deployments succeed.
4. On iPhone, accept the PWA "Reload" prompt, then check the mobile agenda (including "calendar hidden · Show all") and dark mode.
5. Test task drag-and-drop in the Week all-day row with a real mouse.

What the repository shows about automatic deploys: `client/vercel.json` and a local, gitignored `.vercel/repo.json` link this repository to a Vercel project with root directory `client`, but nothing in the repo proves that a push to `main` triggers a Vercel build (that is a Vercel project setting). There is no Railway configuration file and no CI workflow (`.github/` is absent), so the repo shows nothing about Railway auto-deploys. Check both dashboards before pushing.
