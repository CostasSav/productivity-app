# Phase 2B: read-only widget API

Implemented locally. No deployment, production data access, environment changes or real widget credential generation is part of implementation. Scriptable code and write endpoints belong to later phases.

## Architecture and security

`GET /api/widgets/today` uses a separate 256-bit bearer credential, independent of browser cookies. The operator utility creates 32 random bytes encoded as a 43-character base64url token. Only its SHA-256 hex digest is configured on the backend; the raw token belongs in private operator storage and, in Phase 3, Scriptable Keychain. Never put either widget configuration or the raw credential in Vite variables, frontend code, Git, URLs, logs or public files. Use a newly generated credential, never an existing browser/legacy token.

The router sits behind existing security/no-store headers but before session middleware and the general API authentication boundary. It authenticates its own namespace, terminates unknown paths and cannot authorize general task, habit, note or AI APIs. Browser authentication, CSRF, session storage, API caching and PWA behavior are unchanged. A browser session alone does not authorize widgets. Native Scriptable HTTPS requests need no Origin header or CORS permission; CORS is not authentication. OPTIONS preflight follows existing CORS middleware and exposes no snapshot.

Digest comparison uses `timingSafeEqual` on fixed-size SHA-256 buffers. A strict bearer format, valid configuration and future expiration are required. Missing, malformed, rotated or expired credentials return the same generic 401. Authenticated non-GET methods return 403. Unknown widget paths return 404. No per-token permission database exists: the one configured credential has only the fixed widget-read capability.

There is a global budget of 60 widget requests/minute per process, including invalid attempts, returning 429 and Retry-After when exceeded. This avoids trusting spoofable IP headers, but an attacker can consume the shared widget budget. Counters reset on restart. Keep the existing single-process/single-writer deployment. No widget route logs credentials; ensure any externally configured request logging also redacts Authorization.

## Backend configuration

| Variable | Value |
| --- | --- |
| `WIDGET_READ_TOKEN_SHA256` | 64-character SHA-256 hexadecimal digest, never the raw token |
| `WIDGET_READ_TOKEN_EXPIRES_AT` | Explicit UTC ISO expiration, e.g. a future `YYYY-MM-DDTHH:mm:ssZ` or millisecond equivalent |
| `WIDGET_TIME_ZONE` | IANA timezone; defaults to `Europe/Paris` |

Absent or malformed digest/expiration/timezone disables widgets with 401 without stopping browser authentication. Expiration is checked on every request. Configuration is read at backend startup, so rotation/revocation requires the updated configuration to reach the running deployment. No new DATA_DIR, SESSION_DIR, proxy secret, Vercel setting or database is required.

## Private Windows provisioning (operator runs later)

Use a private PowerShell window without transcription or screen sharing. From the repository root, capture the generator output rather than displaying it:

```powershell
$widgetProvision = node .\server\node_modules\tsx\dist\cli.mjs .\server\scripts\generate-widget-token.ts | ConvertFrom-Json
$widgetExpiry = (Get-Date).ToUniversalTime().AddDays(90).ToString('yyyy-MM-ddTHH:mm:ssZ')
```

The existing workspace currently installs tsx under server/node_modules. If installation layout changes, use `npm exec --workspace server -- tsx scripts/generate-widget-token.ts` and capture its JSON output instead. `npm run widget:token -w server` is also provided, but displays the credential; do not run it in a recorded/shared console or CI.

Privately transfer `$widgetProvision.token` into a password manager for later Scriptable Keychain provisioning. For example, copy the value with `Set-Clipboard -Value $widgetProvision.token`, paste into the password manager, then clear the clipboard with `Set-Clipboard -Value ''`. Avoid clipboard history/cloud sync for this operation. Do not paste the credential into shell commands, chats or a plaintext file.

Copy `$widgetProvision.sha256` into Railway's WIDGET_READ_TOKEN_SHA256, and `$widgetExpiry` into WIDGET_READ_TOKEN_EXPIRES_AT, using the same private clipboard procedure. Set WIDGET_TIME_ZONE to Europe/Paris if desired. Do not print the provision object. Remove it from the shell when provisioning finishes: `Remove-Variable widgetProvision, widgetExpiry`. This removes references, not a guarantee of memory erasure. No utility is run automatically by tests, builds or startup.

## Manual deployment order

1. Review the local changes and retain the existing database backup. Verify the eventual deployment includes all new widget source files; exclude local db.json and secrets. Commit/push/deploy are separate operator actions, not performed in this phase.
2. Before editing Railway variables, check the service's connected branch and deployment source commit. **Do not trigger a variable-driven redeployment while Railway still points at an older GitHub revision.** First publish the reviewed revision through your normal process and verify the intended commit is selected. If the dashboard offers staged variable changes, keep them staged until the intended source revision is confirmed.
3. Safest rollout: deploy the new backend code with widget configuration absent first. Verify its successful source revision and existing browser login/data access. Widgets return 401 while disabled. Then provision the three backend settings on that confirmed revision and deploy those changes. Verify the resulting deployment's source revision again. Do not bundle unrelated pending variables or roll back source accidentally.
4. Preserve the existing /app/data volume, DATA_DIR, SESSION_DIR, authentication secrets, build/start commands and single-writer behavior. Never run db:init or copy a database as a deployment step. Use the existing production Node start command, not the token generator.
5. Test the direct Railway HTTPS endpoint privately as below. Verify desktop and installed iPhone PWA login/navigation still work. No frontend deployment or Vercel rewrite change is required for direct Scriptable access.

## Private PowerShell endpoint test

This is a manual production read, to run only when you intend to access your data. The implementation tests use synthetic data instead. Enter the raw token through a hidden prompt; do not put it literally on the command line. This example does not print the token or snapshot contents:

```powershell
$widgetSecure = Read-Host 'Widget token' -AsSecureString
$widgetPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($widgetSecure)
try {
    $widgetRaw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($widgetPointer)
    $widgetHeaders = @{ Authorization = 'Bearer ' + $widgetRaw }
    $widgetResult = Invoke-RestMethod -Method Get -Uri 'https://productivity-server-production-3494.up.railway.app/api/widgets/today' -Headers $widgetHeaders
    Write-Host ('Widget response received; schema version: ' + $widgetResult.schemaVersion)
} catch {
    Write-Host 'Widget request failed. Check HTTP status privately; do not share request headers or snapshot contents.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($widgetPointer)
    Remove-Variable widgetRaw, widgetHeaders, widgetResult, widgetSecure, widgetPointer -ErrorAction SilentlyContinue
}
```

Use HTTPS, the verified fixed hostname, and no redirects to other hosts. Do not use verbose/debug HTTP logging or share automatic error dumps. The raw token necessarily exists briefly in client process memory.

401: check configuration, token, expiration and deployment revision privately; do not fall back to browser credentials. 403: use GET only. 404: verify path/revision. 429: respect Retry-After and reduce polling. 503: data could not be read/processed; investigate storage without initializing or resetting it. Responses, including errors, inherit no-store headers.

## Rotation and revocation

Generate a fresh credential privately, replace the configured digest/expiration on the correct deployed revision, deploy configuration, then update the iPhone Keychain in Phase 3. Only one token is supported; the old token stops working after the new configuration becomes active. Remove the digest or set an expired expiration and deploy configuration to revoke all widget access. Browser login remains independent. A deployment/configuration delay is also a revocation delay; expiration still applies per request without a restart.

## Snapshot contract (schemaVersion 1)

Top-level fields: `schemaVersion`, `date` (YYYY-MM-DD), `timeZone`, `generatedAt` (UTC ISO timestamp), `tasks`, `habits`.

Both cohorts have `total`, `completed`, `remaining`, `progress` (fraction 0..1 rounded to four decimal places, null for empty), `truncated`, and `items`. Multiply progress by 100 for display percentage. Counts cover the entire cohort, not just items. Each list is limited to 10, names/titles to 160 UTF-16 code units and icons/colors to 32; response is bounded below 40 KiB even with JSON-escaped strings. Incomplete items come first, with stable task ID and habit order/ID tie-breaking. Text may be truncated.

- Tasks also have `scope: "due-today"`. Items contain `id`, `title`, `status` (`todo`, `in_progress`, `done`), `priority` (`low`, `medium`, `high`), and normalized calendar `deadline`. Done tasks count toward completion. Overdue/future/missing/invalid deadlines are excluded. This is deliberately narrower than the Today page's pinned and suggested task selection; recurrence/pinning behavior is untouched.
- Habits contain `id`, `name`, `icon`, `color`, `frequency` (`daily`, `weekly`, `weekly_count`), `completedToday`, and `weekly`. Daily habits have weekly=null. Weekly progress includes `completed`, `target`, `remaining`; selected-weekday habits count scheduled distinct dates so far this week, weekly-count habits count all distinct dates so far this week.
- Archived habits are excluded. Weekly schedules use Sunday=0 through Saturday=6. Empty/invalid weekday schedules and targets outside 1..7 are excluded; a null weekly-count target retains the frontend default of 1. No streak is returned because existing streak helpers are browser-timezone-dependent and include unbounded historical loops.
- Weekly-count eligibility uses completions **before today** in the Monday-to-Sunday week. Reaching the target today retains the habit and its completed state until the next day. A target already met before today excludes it. This corrects the disappearing-cohort issue without changing browser logic. Future-dated logs are ignored. Duplicate logs count once per habit/local calendar date and are never cleaned on disk.

Calendar labels YYYY-MM-DD are interpreted directly. Timestamp inputs require ISO date/time with Z or explicit numeric offset, then convert using WIDGET_TIME_ZONE. Invalid/missing/offsetless timestamps are ignored. Server-local timezone is never used; Monday arithmetic operates on calendar labels, so DST and midnight transitions are deterministic. Changing WIDGET_TIME_ZONE changes which day a timestamp belongs to. This configured zone can differ from a traveling browser's device zone.

## Database and verification

The widget reads tasks/habits/logs in one existing `load()` call via `db.getWidgetData()`. Existing legacy defaults may be applied to the in-memory copy, but no save, migration flush, stale-pin cleanup, session write, AI call or record mutation is invoked by a widget request. Normal application startup behavior is unchanged. The existing single-writer JSON-store constraints remain; reading/parsing still scales with database size even though the response is capped. Invalid record IDs/statuses/priorities and invalid schedules are excluded; this API does not repair historical data.

Focused tests cover auth, isolation, expiry/revocation/configuration, rate limits, failure sanitation, schedules/cohort stability, duplicates, dates/DST, bounded responses and byte-for-byte read-only database access. Synthetic fixed test credentials are not usable production secrets. Integration fixtures use isolated temporary directories and do not import server startup or dotenv. No new dependencies are required.

Verification commands from the repository root:

```powershell
npm run test -w server
npm run test -w client
npm run build
node client/scripts/check-pwa.mjs
npm run check:auth -w client
npm audit --omit=dev
```

Before Phase 3, manual deployment, configuration, iPhone connectivity, secure Keychain provisioning and real widget refresh behavior remain to be verified. No native iOS tooling is required by this backend phase.

Local validation completed: 45 backend tests (14 widget, 8 authentication, 23 database), 4 frontend tests, production build, separate TypeScript checks for widget tests/operator utility, PWA checks, frontend credential checks and git diff whitespace checks passed. Production dependency audit reported zero vulnerabilities. Initial sandbox runs blocked localhost connections and filesystem operations; unrestricted local reruns passed with synthetic fixtures. Existing Vite large-chunk and PostCSS module-type warnings remain. The generator was inspected/type-checked only, never executed.
