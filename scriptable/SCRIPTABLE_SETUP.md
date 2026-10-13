# My Workspace widgets for Scriptable

These three scripts run directly in the iPhone Scriptable app. No npm, build, Mac, Xcode, developer membership or backend change is needed. Tasks and Habits each include their own request/validation/rendering code; there are no shared modules to transfer. The tests directory is desktop-only.

Implementation follows the complete Phase 3 request. All scripts are read-only; tapping a row does not change data.

## Install from Windows

1. Install Scriptable on the iPhone from the App Store.
2. Transfer the three JavaScript files through your preferred private file transfer (for example iCloud Drive/Files), or copy each script's complete source into a new Scriptable script. The files contain no credentials. In Scriptable create three scripts named exactly `MyWorkspaceSetup`, `MyWorkspaceTasks`, and `MyWorkspaceHabits`; paste each matching file and save. Do not paste Markdown fences.
3. Open `MyWorkspaceSetup` inside Scriptable and tap Run. Choose **Save or replace credential**. Paste the existing raw widget token from your password manager into the masked input, then choose **Validate and save**. Use the raw token, not its digest or a Bearer prefix. Do not enter it in the editor, widget parameters or URLs.
4. Setup makes one authenticated GET to the existing Railway endpoint. It saves only after a successful schema-version-1 response. A failed validation leaves the previously saved credential unchanged. Network failures are distinguished from a rejected/expired credential using safe messages. The server intentionally does not distinguish invalid from expired credentials.
5. Run `MyWorkspaceTasks`, then `MyWorkspaceHabits` inside Scriptable to preview the medium widgets. Both use Keychain identifier `myworkspace.widget.read.v1`.
6. Long-press the iPhone Home Screen, choose the option to add a widget, find Scriptable and choose **Medium**. Add it, long-press it, choose **Edit Widget**, and select `MyWorkspaceTasks` as its Script. Leave Parameter empty. Repeat with `MyWorkspaceHabits`. Choose **Run Script** for interaction if that option is shown. UI labels can vary by iOS version.
7. Large widgets show four rows; medium widgets show three. Small widgets show totals/progress only. To preview other sizes inside Scriptable temporarily change `const family = config.widgetFamily || "medium"` to default to `"small"` or `"large"`; widget instances use their actual family automatically. Lock Screen/accessory widgets are outside this phase.

## Open your website on tap

The repository does not establish a public frontend URL. Set `const WEBSITE_URL = "";` near the top of **both** widget scripts to your verified Vercel/custom-domain HTTPS homepage, copied from your existing browser bookmark or Vercel project. Use only the origin, optionally ending in `/`; do not add a query string, fragment, credentials or a guessed deep link. Leave this empty if you prefer Scriptable's configured tap behavior. Invalid/non-HTTPS values are ignored. This is a navigation-only setting: API requests always use the fixed Railway endpoint.

With a valid WEBSITE_URL, Scriptable's widget URL opens that website on tap, overriding its configured interaction. iOS may open Safari rather than the installed standalone PWA; no reliable PWA-launch deep link is assumed. Without it, choose Run Script in widget settings to open/run the script. Neither mode completes tasks or habits.

## Transfer and later updates

**iCloud Drive:** Copy the three `.js` files from Windows into an iCloud Drive folder using your normal iCloud Drive setup. On iPhone, open them in Files and copy their text into the matching Scriptable editors. You can also use Scriptable's import/share option if offered by your installed version. Verify the script names before selecting them in widget settings. Keep the credential in the password manager/Keychain, never in these files.

**GitHub alternative (only after a separately authorized commit/push):** Open your repository in Safari on iPhone, navigate to each `scriptable/MyWorkspace*.js` file, choose its Raw view, copy all source and paste into the matching Scriptable editor. Do not copy the GitHub page markup. No GitHub publication is performed by this implementation. Private repository access does not require publishing the scripts publicly.

For updates, replace the source inside the existing named Scriptable scripts rather than creating duplicate scripts. Reapply your public WEBSITE_URL setting if needed. The stable Keychain identifier preserves the existing credential; rerun each widget script to preview and request updated content. Do not transfer the desktop-only `tests` folder. Updating files on Windows alone does not update scripts already pasted on the iPhone.

## Display and data contract

The scripts request only `GET https://productivity-server-production-3494.up.railway.app/api/widgets/today`, with the Keychain token in the Authorization bearer header. Redirects are refused, HTTPS certificate validation stays enabled, and requests have a 12-second idle timeout. No database, browser session, CSRF token, AI call or write endpoint is used.

Schema version 1 supplies `date`, `timeZone`, `generatedAt`, `tasks`, and `habits`. Each cohort supplies full `total`, `completed`, `remaining`, `progress`, `truncated` and at most ten `items`. Counts and progress are taken from the server, not reconstructed from visible rows. The scripts validate the response and show an error instead of invented zero counts if it is malformed or incompatible.

- Tasks show only the backend's **due-today** cohort, including completed tasks. Status values are todo/in_progress/done; priority and deadline are validated but not displayed. Pinned/suggested tasks are not added.
- Habits use the server's `completedToday`, frequency and weekly progress. Weekly-count rows show `completed/target wk`. All scheduling, duplicate-log handling and timezone decisions remain on the backend; scripts never inspect logs or recalculate schedules.
- Incomplete rows come first. The footer's `+N more` uses the full total, including any items omitted by the backend. Titles use one line with truncation; unsupported habit symbols fall back to a bullet and emoji can render as text. Decorative icons never replace the completion checkmark or title.
- Dark charcoal/teal colors, light text and explicit counts/checkmarks avoid relying on color alone. Font sizes are deliberately compact for medium widgets. iOS text scaling, VoiceOver reading order, long emoji and Display Zoom need on-device verification; full Dynamic Type behavior is not guaranteed by this custom layout.

## Refresh, errors and privacy

Refresh is requested no earlier than 60 minutes after a run. **This is not a guaranteed schedule**: iOS controls widget refreshes. Each widget performs one request per execution, with no automatic retry loops. A 429 shows a wait message and the next requested refresh remains 60 minutes away. Manual repeated runs can still reach the backend's 60/minute global limit. Every successful refresh uses the latest server calendar date, including after midnight; no device-local scheduling calculation or precise midnight wake-up is attempted.

The native relative Updated timestamp continues showing age as iOS renders it. The footer also includes the snapshot's calendar date and, on medium/large widgets, server timezone, so yesterday's snapshot is not silently relabeled as today. Widgets use the server date even if the phone travels to another zone.

No snapshot or credential is written to ordinary files, iCloud files, parameters, logs or URLs. Only the token is explicitly persisted in Keychain. No last-good data cache is implemented: an executed refresh that fails shows an error. iOS may retain the previous rendered widget until it runs again, including after credential removal. Task/habit titles are visible on the Home Screen; remove widget instances if immediate visual removal is needed.

Scriptable scripts share the app's Keychain namespace. Install only trusted scripts. Secure input does not make a copied token disappear from your clipboard/password manager history; use your password manager's private paste/autofill workflow and clear any copied value afterward. The raw token necessarily exists briefly in memory to make the request. Errors never include raw exceptions, credentials or server response bodies.

Error handling:

| Message | Action |
| --- | --- |
| Run MyWorkspaceSetup | Save the existing credential inside Scriptable. |
| Credential rejected or expired | Check backend expiration/configuration privately, then replace the local token if it was rotated. |
| Cannot connect | Check connectivity, then run the script again later. The stored credential is unchanged. |
| Refresh limit reached | Stop manual retries and wait. |
| Service unavailable | Investigate the backend separately; never initialize/reset the database as a widget fix. |
| Unexpected response | Check that the deployed API still serves schema version 1. |
| Redirect blocked / API not found | Check the verified endpoint/deployment, without sending credentials to another host. |

## Replace or remove credentials

After deliberate server-side rotation, rerun Setup and choose Save or replace. A validated replacement overwrites the same Keychain entry for both widgets. To remove it, choose Remove saved credential and confirm the second prompt. Removal affects only this iPhone's Keychain entry; server-side revocation remains the separate process documented in `../WIDGET_API_SETUP.md`. No Railway or Vercel configuration is changed by these scripts.

## Verification

From Windows, run `node --test scriptable/tests/widgets.test.mjs`. The desktop harness mocks Scriptable APIs and uses only synthetic responses/credentials; it cannot make HTTP requests. It checks medium/large/small layouts structurally, full totals and row limits, empty/overflow states, long text, missing credentials, response validation, safe HTTP/network errors, blocked redirects, setup save/cancel/removal and lack of credential output. It is not an iOS rendering simulator.

Local result: all 30 tests passed, including syntax parsing of each complete script, 60-minute refresh configuration, safe navigation URLs and missing/unusual icons. No production API was contacted and no credential was generated. Existing application files and deployment settings were unchanged; a frontend/backend rebuild is not needed for these standalone scripts.

If Scriptable is missing from the widget picker, open the installed app once, create/run the scripts, and retry the Home Screen picker. If the wrong widget appears, check its selected Script name and size. If counts look incorrect, compare the backend's due-today/scheduled cohort and server timezone, then check the displayed snapshot date/age; do not compare task totals with pinned/suggested Today items. An unchanged image may simply mean iOS has not rerun the widget yet.

For Phase 4, rows already have a separate native stack and retain the backend item IDs in memory. No per-row URLs, write capability or interactive completion control is enabled now. A later phase must design a separately authorized write API, replay/idempotency protection and secure action handling before adding completion taps; do not expand this read-only token's scope casually.

Manual iPhone checklist:

1. Validate/save the existing token and preview both scripts; confirm due-today totals match the API's cohort (not the full Today page).
2. Add two medium widgets and check spacing, long titles, checkmarks, habit icon fallback and weekly progress. Test large/small if you use them.
3. Check completed and empty cohorts when those occur naturally; no test requires changing production records.
4. Turn on Airplane Mode and run a script to confirm a safe connection error; restore connectivity and rerun.
5. Cancel setup replacement/removal and verify the prior credential still works. Test confirmed removal only when you have the token safely retained, then save it again.
6. Check VoiceOver, Display Zoom and readability on your actual device. Verify relative Updated age and the date across midnight; iOS may delay refresh.
7. Confirm existing browser login and the installed PWA still work. No application/backend files are changed in this phase.

Official APIs consulted: [Request](https://docs.scriptable.app/request/), [Keychain](https://docs.scriptable.app/keychain/), [Alert](https://docs.scriptable.app/alert/), [ListWidget](https://docs.scriptable.app/listwidget/), [WidgetText](https://docs.scriptable.app/widgettext/), [WidgetStack](https://docs.scriptable.app/widgetstack/), [SFSymbol](https://docs.scriptable.app/sfsymbol/), and [DrawContext](https://docs.scriptable.app/drawcontext/).
