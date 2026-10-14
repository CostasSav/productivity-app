# My Workspace widgets and actions for Scriptable

Four standalone scripts run directly on iPhone. No build, Mac or native development tools are needed. The Tasks and Habits widgets keep their existing layout, colors, counts and read-only GET behavior. Completion is performed only by the separate action script after confirmation.

## Install or update

1. Transfer `MyWorkspaceSetup.js`, `MyWorkspaceTasks.js`, `MyWorkspaceHabits.js` and the new `MyWorkspaceAction.js` privately from Windows. Paste each complete source into Scriptable scripts named exactly **MyWorkspaceSetup**, **MyWorkspaceTasks**, **MyWorkspaceHabits** and **MyWorkspaceAction**. Replace existing source rather than creating duplicates. Do not transfer `tests` or paste Markdown fences.
2. Your existing read token remains under `myworkspace.widget.read.v1`. If needed, run Setup → **Save or replace credential** and paste the raw read token in the masked field. Read-token replacement is validated with GET before saving.
3. A **separately provisioned action token** is required. Its matching digest and future expiration must already be configured on Railway as described in [WIDGET_ACTION_API_SETUP.md](../WIDGET_ACTION_API_SETUP.md#private-windows-provisioning-later-operator-only). This implementation does not generate credentials, configure variables or deploy anything. If those settings are absent, completion remains disabled on the server while reads keep working.
4. Run Setup → **Save or replace action token**. Paste the distinct raw 43-character token from your password manager into the masked field, then confirm **Save action token**. It is stored only in Keychain as `myworkspace.widget.action.v1`; your read token is unchanged. Neither token may equal the other. Saving checks format/separation but **does not validate action authorization**, because there is no read-only action-token validation endpoint. No test write is sent during setup.
5. Run both widget scripts again. Keep/add **medium or large** Scriptable Home Screen widgets, selecting the corresponding Tasks/Habits script with an empty Parameter. If shown, select **Run Script** for interaction. Medium shows three rows, large four; small keeps its summary and has no individual action targets.
6. Tap an incomplete row → **Complete**, or a completed row → **Mark incomplete**. Scriptable opens, fetches current state and asks for confirmation. Cancel sends no change. Run the widget script again to preview fresh results; iOS may refresh the Home Screen later.

Updating files on Windows alone does not update scripts previously pasted onto the iPhone. Use your normal private Files/iCloud transfer, or GitHub Raw source only after a separately authorized commit/push. Never transfer tokens in source files.

## Website taps

Keep/reapply `WEBSITE_URL` near the top of both widgets to your verified public HTTPS frontend **origin**, optionally ending in `/`. No credentials, query string, fragment or guessed deep link. Invalid values are ignored; leave empty for Scriptable's default behavior. The background/header/footer and small widget open that website when configured, while actionable medium/large rows launch MyWorkspaceAction. iOS may open Safari rather than the installed PWA; a normal HTTPS link cannot guarantee standalone PWA launch. Verify tap targets on your actual iPhone.

Per-row URLs use Scriptable's [run scheme](https://docs.scriptable.app/urlscheme/) and [WidgetStack URL](https://docs.scriptable.app/widgetstack/) support. They carry only kind, numeric ID, server calendar date, expected state and explicit desired completion. No title, notes, token or credential is put into a URL. IDs/state are non-secret action parameters, not authentication. Without an action Keychain entry, no row action links are rendered and read-only behavior is retained.

## State checks and requests

The action script runs only inside Scriptable, reads both tokens from Keychain and uses the fixed verified Railway HTTPS host. Redirects are refused, requests use no-store headers and a 12-second idle timeout; there are no automatic retries, caches or ordinary data files.

It fetches `GET /api/widgets/today` with the **read** token before confirmation, checks schema version 1, unique displayed IDs, the server date and the exact expected task status/habit completion, then fetches again after confirmation. A changed item, changed timezone/day or missing row is refused. The snapshot exposes at most ten items; a row that falls outside that list must be refreshed or handled in the web app. All scheduling and weekly-count logic remain on the backend.

One confirmed action uses only the **action** token:

| Item | Request | JSON body |
| --- | --- | --- |
| Task | `PATCH /api/widgets/tasks/:id/completion` | `{ "date": "server-day", "completed": true or false }` |
| Habit | `PUT /api/widgets/habits/:id/completion` | Same explicit desired-state body |

No blind server toggle or fabricated `expectedUpdatedAt` is sent. The read snapshot has no record revision/timestamp, so these client checks **cannot guarantee atomic protection against a concurrent browser change between the final GET and the write**, or detect complete→undo cycles that return to the same visible state. Avoid overlapping opposing actions and refresh before another tap. Closing that remaining race would need a backend precondition, outside this phase.

## Messages, refresh and privacy

- Missing/invalid local tokens: run Setup. Rejected/expired/disabled action token: check its separate provisioning/expiration; leave the read token alone.
- Changed state/day or unavailable item: no write is sent; refresh or use My Workspace.
- 409: review the item in the web app, then refresh. The two accepted historical recurring-task conflicts and annotated habit-log undo conflicts are preserved; scripts do not reconcile or bypass them.
- `already-applied`: show success without retrying. 429: wait. 403: check scope/HTTPS. Network, 5xx or invalid action response: the write may have applied; refresh before trying again, never retry blindly.

The existing 60-minute refresh request is retained. **iOS controls actual refresh timing**, including after an action; Scriptable cannot force immediate Home Screen redraw. Its Updated age and server-date footer remain visible. Running a widget script gives a fresh preview but does not guarantee an immediate Home Screen refresh. [ListWidget refresh documentation](https://docs.scriptable.app/listwidget/).

Task/habit titles remain visible on the Home Screen and privately in the confirmation dialog. Scripts never log tokens, raw API responses or private data. Only credentials are explicitly persisted, in Keychain; iOS may retain rendered widgets. Scriptable scripts share the app's Keychain namespace, so install only trusted scripts. Clear any copied token from clipboard history after setup.

To remove only write access on this phone: Setup → **Remove action token** → confirm, then rerun both widgets. Read access is preserved. Cancellation keeps the saved token. Server-side revocation/rotation is separate; local removal does not change Railway. Removing the read credential still stops widget reads. No backend, authentication, database, Vercel or Scriptable file transfer is automated by these scripts.

## Local checks and iPhone verification

From Windows at the repository root:

```powershell
node --test scriptable/tests/widgets.test.mjs scriptable/tests/actions.test.mjs
```

53 synthetic tests pass, including full-script JavaScript syntax (Scriptable top-level await), unchanged layouts, both desired states and HTTP methods, secure setup/removal/cancellation, token separation, privacy-safe URLs, stale state before/after confirmation, malformed parameters, auth/conflict/network errors and already-applied responses. Regression tests execute the actual widget scripts, decode their generated URLs into query parameters, and run the actual action script. The Request mock returns a copied headers dictionary to detect lost nested header mutations. The mock runtime cannot make HTTP requests and is not an iOS rendering simulator. No production data or credentials were accessed. No frontend/backend rebuild is needed for these standalone scripts.

If an earlier action script shows "Action request rejected. Update your Scriptable scripts.", that message indicates an HTTP 400 response, not local URL validation or cancelled confirmation. Replace **MyWorkspaceAction** with the updated source: it assigns the complete headers dictionary (including Content-Type) in one operation instead of mutating a value read from a native property. Existing Tasks/Habits links and Keychain entries need no replacement. The updated script distinguishes invalid links, cancellation, authentication, request rejection and server errors. Native iPhone behavior still needs on-device verification; no production response was inspected during this fix.

On iPhone, first verify the preview/layout and website taps, then cancel one row action to verify no change. After separately enabling the token, test completion/undo only on an item you intentionally choose to change, verify the result in the web app, and refresh the widget preview. Check small/medium/large sizes, long titles, VoiceOver/Display Zoom, Airplane Mode and the stale-day message when appropriate. Actual URL launch, Keychain dialogs and iOS refresh timing require on-device validation.
