# Phase 4A — widget completion API

## Read-only historical recurrence diagnostic (before reconciliation)

From the repository root in PowerShell, using the existing installed tsx dependency:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\server\scripts\diagnose-recurrences.ts "C:\PrivateBackups\workspace-snapshot.json"
```

Replace that example with the absolute path of your **local offline snapshot**. No default path, DATA_DIR, dotenv, server startup, migration, network request or write operation is used. Missing/corrupt/non-regular inputs fail with a sanitized message and exit code 1. Relative paths and UNC/network paths are rejected; use a local drive, not a mapped network drive or linked directory. The tool does not validate unrelated database collections or certify backup recoverability.

Default output is JSON containing counts only. Categories are mutually exclusive, with G taking precedence, then A, F and B–E:

| Category | Meaning |
| --- | --- |
| A | Nonrecurring (recurrence=null), no detected classification errors; unaffected by the recurrence ambiguity guard |
| B | Valid recurring record with recurrenceIssued=false; explicit permission to generate a successor (the marker alone does not prove creation date) |
| C | Valid recurring record with recurrenceIssued=true; no further successor generation |
| D | Active historical recurring record, valid deadline, missing marker; completion blocked |
| E | Completed historical recurring record, valid deadline, missing marker; conservative issued fallback applies when touched |
| F | Otherwise valid recurring record with missing/invalid date-only deadline; inspect separately |
| G | Malformed or ambiguous record: duplicate/invalid ID, invalid status/marker/recurrence metadata, invalid title or non-object |

`activeRecurringTasksBlockedByAmbiguousRecurrence` counts records that would reach the shared business function's ambiguity error on a status-only completion: unique ID, valid active status, missing marker, and truthy recurrence/deadline. Thus it includes D and some F/G records (a nonempty malformed deadline/recurrence can trigger ambiguity before later validation). It does not exclude independently invalid titles, time fields or IDs: public route ID validation/widget eligibility can reject before reaching the business function. Null/empty deadlines do not trigger this guard. It is not a count of all possible completion failures.

The default summary now also reports:

- `reasonCounts`: number of records with each fixed validation reason. Multiple reasons can apply to one record; their sum is not a task count. Deadline errors are counted even when G takes precedence over F. No private field values are included.
- `historicalStates`: recognized recurring tasks missing the marker, split into active/completed, independently of A–G classification. These overlap the categories and reason counts.
- `ambiguityGuard.conditionMatches`: exact ambiguity expression matches, before earlier business validation; `preemptedByEarlierBusinessValidation`: matching records stopped first by duplicate IDs or invalid status; `reachesAmbiguousRecurrence`: the difference, equal to the existing blocked count. Invalid marker values cannot match the missing-marker predicate.

Correction to the first diagnostic: recurrence_time is free text in TaskForm (the UI explicitly suggests "afternoon" or "09:00"). Requiring HH:mm incorrectly placed valid historical records in G. String values are now accepted; non-string/non-null values remain a reason for review. Missing recurrenceIssued alone never causes G. G previously hid D/E whenever another check failed. No evidence supports a different recurrence enum; the application uses daily/weekly/monthly. Deadlines still require a real date-only calendar label for recurrence generation.

The reported 87 A / 44 G / 2 blocked / 42 completed-missing pattern can be reproduced synthetically by free-text times, but aggregate counts do not prove that is the cause in the actual snapshot. Rerun the updated summary before drawing conclusions. The 42 completed records can normally remain untouched under the conservative legacy fallback, provided no independent blocking problem (such as duplicate IDs) exists. Repeating completion, reopening, recompleting or editing unrelated fields marks a legacy done record as issued on that update and never generates a successor. This is a suppression policy, not proof of an existing successor.

For each of the two active records, a later explicit decision needs reliable operator history: whether that occurrence ever issued a successor, whether one was subsequently edited/deleted, and whether another issuance is intended. Current metadata has no authoritative predecessor/successor link. True permanently suppresses another issuance for that occurrence; false permits one on the next valid completion, then becomes true; leaving it missing retains the conflict. Similar titles/deadlines are not proof. Do not reconcile based only on the count or automatically adopt a flag.

`completedRecurringTasksMissingMetadata` includes completed records with recognized recurrence and missing marker across categories, including malformed deadlines. `malformedOrAmbiguousRecords` counts G, not D. `historicalReconciliationNecessary` flags any guard-matching blockers; `manualReviewNecessary` additionally flags F/G. E alone does not require reconciliation to avoid this specific blocker, but its conservative no-new-successor behavior merits awareness. No successor relationships are inferred.

For **private** details, append `--details`. This adds only task ID, status, recurrence, deadline, title, category and fixed reason labels. Notes, descriptions, credentials and other collections are never included. Do not run details in a recorded/shared terminal or paste the resulting report into public issues/chat. Avoid output redirection into the repository or over the snapshot. The tool never writes/uploads a report automatically.

After reviewing summary counts, review D and guard-matching F/G privately. An operator may approve true (do not issue again), false (permit one issuance), or leave unresolved, per record. A/B/C need no automatic flag changes; E already has a documented runtime fallback and does not prove a historical successor exists. F/G need validation before any decision. Nothing in these counts justifies guessing history or bulk-setting missing flags. The separate operator utility below requires backup, record preconditions and explicit approval; it refuses F/G datasets rather than guessing how to repair them.

Synthetic checks: `node .\node_modules\tsx\dist\cli.mjs --test .\server\tests\diagnose-recurrences.test.ts`. Nine tests pass, including free-text times, overlapping reasons, a synthetic 131-record dataset, corrupt JSON, all categories, duplicate IDs, privacy, explicit-path enforcement and unchanged snapshot bytes/mtime. Standalone TypeScript checks pass. The updated diagnostic has not been run against your actual backup; the actual reasons remain unknown until you rerun it manually.

Local implementation only. No real records/backups were opened, no credentials generated, and no production configuration, deployment, commit or push performed. Scriptable files are unchanged. Phase 4B can add iPhone action UI later.

## Targeted offline reconciliation (operator approval required)

`server/scripts/reconcile-recurrences.ts` is independent of server startup, dotenv and network access. It never selects DATA_DIR or a default database. It requires absolute local paths, rejects symbolic links and network-share paths, and does not initialize missing databases. No dependency or production startup changes are needed.

Planning reads the snapshot without changing its bytes or mtime. It creates a **new private plan file** containing only the active recurrence blockers' IDs, status, recurrence/day/time, deadline and SHA-256 record fingerprints, plus a SHA-256 fingerprint of the entire snapshot's original bytes. All decisions start as `"unresolved"`, and `operatorApproved` starts false. Titles/notes are not copied to the plan. Default console output contains counts only. Plan, backup and audit files refuse overwrite. Use a private folder with restricted Windows ACLs; Unix mode 0600 does not configure Windows ACLs. Never place these artifacts in Git, shared cloud folders or public logs.

From the repository root, with a private **offline working copy** and an existing private output folder:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\server\scripts\reconcile-recurrences.ts plan "C:\PrivateBackups\offline-working-copy.json" --out "C:\PrivateBackups\recurrence-plan.json"
notepad "C:\PrivateBackups\recurrence-plan.json"
```

To inspect titles privately, use the existing diagnostic with `--details` and match IDs locally. Its full report contains other tasks too; do not share it. The reconciliation utility's optional `--details` exposes the planned IDs and metadata in the terminal; omit it for aggregate-only output.

Review each occurrence's history yourself. Existing records have no reliable predecessor/successor link: matching titles, IDs or deadlines do not establish issuance. Edit only each `decision` and the root approval flag:

- JSON boolean `true`: suppress any further successor for this occurrence, including after reopening. Appropriate only when suppression is explicitly intended; it does not prove a successor exists.
- JSON boolean `false`: permit one successor on the next valid completion, then mark the parent true. This can duplicate an earlier successor if history is guessed incorrectly.
- String `"unresolved"`: leave the record unchanged, with completion still blocked. Do not use strings `"true"` or `"false"`.

Set `operatorApproved` to JSON boolean `true` only after explicitly approving the individual decisions. Do not edit IDs, fingerprints or metadata. Both blockers remain represented in the file even if one is unresolved. Preview without changing the database, even if approval is still false:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\server\scripts\reconcile-recurrences.ts apply "C:\PrivateBackups\offline-working-copy.json" --decisions "C:\PrivateBackups\recurrence-plan.json"
```

The `apply` mode defaults to dry-run; only the separate `--apply` switch permits mutation. The following is an **operator command for later approved use**, not a step automatically executed by this implementation:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\server\scripts\reconcile-recurrences.ts apply "C:\PrivateBackups\offline-working-copy.json" --decisions "C:\PrivateBackups\recurrence-plan.json" --apply --writer-stopped --backup "C:\PrivateBackups\before-reconciliation.json" --audit "C:\PrivateBackups\reconciliation-audit.jsonl"
```

`--writer-stopped` is an operator attestation, **not a lock**. The utility cannot detect another writer or stop Railway. Safe application requires exclusive offline ownership of the file and its directory for the entire operation. Do not use it with a running backend, another reconciliation process, filesystem synchronization, or other file writers. It rechecks the whole snapshot immediately before atomic rename, but this is not an interprocess compare-and-swap and cannot replace maintenance isolation.

Application checks the original byte fingerprint and each record's full JSON fingerprint and visible preconditions, validates unique IDs, refuses missing/extra/duplicate plan entries, and modifies only approved `recurrenceIssued` properties. All other semantic values, including timestamps, sequences, unrelated collections and all 42 completed legacy records, remain unchanged. JSON formatting may change during serialization. Unresolved decisions are never applied. F/G validation problems require separate review; the utility will not repair them.

Before replacement, it writes and fsyncs a new byte-for-byte backup, verifies its hash, and writes a private audit intent listing approved IDs and boolean decisions, the original hash, and the expected result hash. It uses the existing JsonStore same-directory temporary-file/fsync/atomic-rename implementation; it never calls initialization. After replacement it verifies the result hash and appends an audit result with changed IDs. Linux directory fsync follows the existing durability behavior; Windows does not support that directory operation. A filesystem that cannot atomically replace files causes failure without an unlink fallback.

If an operation fails or is interrupted, **do not retry or restore blindly**. A `prepared` audit without a `verified` result can mean either no replacement or an already-visible replacement. Keep writers stopped and compare the current file hash with `beforeSHA256` and `expectedAfterSHA256` in the audit (`Get-FileHash -Algorithm SHA256` on Windows). Preserve the backup and audit for review. The utility never automatically rolls back. A rollback must be explicitly approved, use a verified backup, maintain exclusive writer isolation, and verify that no intervening writes would be lost. An already-used plan is stale after successful application and cannot be replayed.

Verify success while still offline:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\server\scripts\diagnose-recurrences.ts "C:\PrivateBackups\offline-working-copy.json"
```

If both decisions were resolved, blocked count should be zero; any unresolved record remains counted. Category B/C increases reflect false/true decisions. The 42 E records must remain E and byte-equivalent as individual JSON values; the tool's synthetic tests verify preservation. Their existing runtime fallback marks a legacy done occurrence issued only when touched, suppressing successors on repeating completion, reopening, recompleting and unrelated edits. They require no proactive reconciliation for this blocker.

### Later production operation

A local backup edit **does not change Railway**. Do not deploy or upload an old edited snapshot over `/app/data/db.json`. Production may have changed since download. An authorized production operation requires a maintenance window: stop every backend replica/process and prevent scheduled/automatic restarts, deployments and other database writers; arrange operator-controlled offline access to the existing mounted volume; obtain a fresh consistent snapshot; generate a fresh plan; reapprove the individual choices and dry-run against the actual current file. Apply only while that same volume is exclusively offline, preserving a verified backup outside the replacement target and checking the live file's fingerprint against the approved plan. Keep it offline until the audit and diagnostic have been verified, then restart exactly one writer.

Use an approved offline volume helper/runtime if needed; this document does not assume that a stopped Railway service can run commands or supply a particular Railway CLI workflow. If exclusive volume access and restart prevention cannot be established, **do not apply**: arrange that operational boundary first. Changes made while staging/reviewing require a new snapshot, plan and approval. No startup reconciliation, automatic production import or environment changes are implemented.

Deployment remains **NO-GO for uninterrupted historical browser completion** until both actual active blockers have approved, verified decisions on the current production database. Unresolved choices intentionally retain conflicts. Tooling readiness alone is not production reconciliation.

Synthetic checks (no private snapshot access):

```powershell
node .\node_modules\tsx\dist\cli.mjs --test .\server\tests\reconcile-recurrences.test.ts .\server\tests\diagnose-recurrences.test.ts
```

Verified locally: 13 reconciliation tests plus 9 diagnostic tests pass (22 total). They cover explicit choices, unresolved decisions, stale/missing/duplicate records, corrupt input, approval gates, snapshot preservation, write/rename/post-publication failures, a last-moment external change, private summaries and the existing completion fallback. Tool/test standalone TypeScript checks and the backend no-emit TypeScript check pass. Windows fixture rename tests require execution outside this agent's filesystem sandbox; all files involved are generated synthetic fixtures.

## What the existing code did

`server/src/routes/tasks.ts` accepts browser PUT updates and delegates to `db.updateTask`. Previously every request with status=done and a recurrence/deadline cloned a successor, even when already done or previously reopened. Parent update and successor were already saved together, but no durable recurrence history existed. `useTasks` expects `{task,nextTask}` and deduplicates successors by ID, then invalidates React Query data; that response contract remains.

`POST /api/habit-logs` previously appended a fresh log on every call. DELETE removed only the requested ID, leaving duplicate same-day completions behind. `useHabits` creates an optimistic entry and sends either an ISO timestamp or offsetless local noon for a selected date. It invalidates the log cache after mutation. The success handler now also excludes the returned existing ID before inserting it, avoiding a temporary cache duplicate when completion was already recorded. Browser endpoint shapes remain unchanged; protected conflicts are intentional correctness changes.

## Endpoint contracts

| Endpoint | Scope |
| --- | --- |
| `GET /api/widgets/today` | Existing read credential only; unchanged schema version 1 |
| `PATCH /api/widgets/tasks/:id/completion` | Action credential only; sets done or todo |
| `PUT /api/widgets/habits/:id/completion` | Action credential only; sets that day's completion |

Both action bodies require `Content-Type: application/json` and exactly these required fields:

```json
{"date":"2026-10-13","completed":true}
```

`completed` must be a JSON boolean; date must be a real YYYY-MM-DD calendar date. IDs must be positive safe integers written without signs, decimals, exponents or leading zeros. Extra fields are rejected. JSON bodies are limited to 2 KiB. Tasks additionally accept optional `expectedUpdatedAt` (UTC ISO timestamp); mismatch returns 409 before changing state. Existing read snapshots do not expose this value, so current widget clients should omit it. It is a timestamp precondition, not a database-wide revision or a guarantee against every unrelated browser edit within one millisecond. Completion updates advance the task timestamp monotonically; repeated no-ops leave it unchanged. A retry with an old precondition can return 409 even if its first request committed: refresh state rather than retrying blindly.

Success is HTTP 200 with no titles, notes or other private record details:

```json
{"id":1,"date":"2026-10-13","completed":true,"outcome":"applied"}
```

An unchanged state returns `outcome: "already-applied"`. Every response inherits `Cache-Control: no-store` and CDN no-store headers. Responses are not cached. No generic update, delete, toggle, AI or settings endpoint is exposed through action auth. No task/habit deletion is performed by the action endpoint (explicit habit undo removes safe same-day completion logs only).

## Credentials and permissions

New backend-only settings:

- `WIDGET_ACTION_TOKEN_SHA256`: SHA-256 hexadecimal digest of a **separate** random 32-byte/base64url credential.
- `WIDGET_ACTION_TOKEN_EXPIRES_AT`: future UTC ISO timestamp, e.g. YYYY-MM-DDTHH:mm:ssZ.
- Existing `WIDGET_TIME_ZONE`: shared date contract, Europe/Paris by default.

Missing, malformed, expired or revoked action configuration disables writes without changing read credentials or browser session authentication. A digest equal to the configured read digest disables actions, preventing accidental promotion of the read token. The action token does not authorize widget reads, browser login, general tasks/habits/notes, settings or AI. Use a distinct newly generated value; never reuse legacy/general credentials. The backend stores only the digest. Both scopes share strict bearer parsing and timing-safe SHA-256 comparison.

Actions require `req.secure`: direct TLS or HTTPS recognized through the existing verified Express TRUST_PROXY setting. Never broaden TRUST_PROXY or trust arbitrary forwarded headers to fix a 403. Verify the existing proxy chain on Railway. No new proxy secret is introduced. Native Scriptable requests do not require Origin or CSRF; their explicit bearer capability is separate from browser ambient session authentication. Browser Origin/CSRF middleware is unchanged. No session is created by an action request.

Actions have a separate global limit of 30 requests/minute/process (including failed attempts); the existing widget-read budget remains separate. A valid read token used for an enabled action returns 403; unknown/missing/expired credentials return 401. Unsupported methods on action resources return 403. TLS is required even before authentication. Rate limits return 429 and reset after restart. They are not multi-replica protection; a hostile caller can consume the shared action budget.

## Durable recurrence safety

New tasks have optional durable `recurrenceIssued: false`. The first transition to done for an eligible recurring task computes its successor using the existing `nextDeadline`, marks the parent issued, creates a fresh unissued successor and saves everything in **one atomic JSON replacement**. Repeats and complete → reopen → complete do not issue another successor. Deleting the successor does not reset the parent's marker. Existing metadata and subtasks are retained; no successors are deleted automatically. This same business function serves browser PUT and widget PATCH.

Legacy policy (no bulk migration):

- An older already-done occurrence without the marker is conservatively treated as issued when touched. Reopening/recompleting it never recreates a successor, even if one is missing.
- An older incomplete recurring occurrence with a deadline and no marker returns **409 AMBIGUOUS_RECURRENCE** on completion, including browser completion. Its history could include an earlier completion/reopen cycle. Inferring lineage from matching titles/deadlines is not safe.
- **Review this policy before deployment.** Such records need deliberate operator reconciliation in a future authorized migration/tool; this phase provides no automatic override, lineage guessing, deletion or bulk rewrite. Do not set all markers to false. Nonrecurring records and newly created recurring records continue normally.

Existing recurrence calculations are intentionally preserved. In particular, the existing monthly algorithm rolls January 31 to March 31 rather than clamping to February's final day. This pre-existing scheduling limitation is separate from idempotency and was not silently changed. Recurring timestamp deadlines (rather than date-only labels) conflict if generating a successor would require an unsupported recurrence calculation.

## Habit completion and date rules

Completing a habit reuses an existing log for the same habit/calendar date. Duplicate historic logs count as one; completing does not clean or rewrite them. Explicit incomplete removes all same-day logs only when each has no nonempty note and no unknown metadata fields. An annotated/ambiguous set returns 409 with **no change**. Supplying a different note through the browser POST when an existing log would lose that note also conflicts. Repeating an action undo with no logs is a no-op. Legacy browser DELETE still returns its existing 404 if the selected ID no longer exists.

Daily, selected-weekday and weekly-count eligibility comes from the same widget snapshot logic. Archived/missing habits return 404. Invalid schedules, ambiguous IDs/log timestamps or ineligible dates conflict. Weekly-count membership uses distinct days before the requested date, so reaching the target today does not remove eligibility for undo/retry. Logs with annotations are preserved. No streak algorithm or historical duplicate cleanup runs.

Widget requests must specify the **current server widget day**, in WIDGET_TIME_ZONE. Yesterday/future dates return STALE_DAY rather than being shifted to today. Task eligibility is the full due-today cohort, not merely the first ten displayed items; habits use the full scheduled cohort. The server rechecks eligibility from freshly read data immediately before mutation.

ISO timestamps with offsets/Z convert to the configured local date. Date-only labels retain that date. The existing browser backdating format (offsetless YYYY-MM-DDTHH:mm:ss) is now explicitly interpreted as its supplied local calendar date, including in widget snapshots; this fixes its previous omission from widgets without rewriting historical timestamps. Daily boundaries, Monday-to-Sunday weeks and DST use the shared timezone. A browser in a different timezone can still display historical timestamps differently; no global browser date redesign was made. Browser log creation supports eligible past dates as before, rejects invalid/future dates, and uses the configured timezone for deduplication.

## Atomicity, retries and limitations

The entire read → eligibility check → mutation → save is synchronous with no awaits, and each request reads disk afresh. One Node process serializes overlapping HTTP operations; there is no in-memory completion flag. Database safety uses the existing temp-file/fsync/rename strategy. A pre-publication failure leaves both record and bookkeeping untouched. A post-publication fsync failure may return 503 even though the complete operation committed; a same-state retry reads durable state and does not create another successor/log.

Keep **one process/replica/writer**, including during rollout. There is no interprocess locking. Idempotent desired-state requests are not an ordered command queue: complete → undo → a delayed complete request will set complete again (but will not issue a second recurring successor). For future UI, refresh state after conflicts and avoid parallel opposing actions; a stronger revision/action-order protocol may be needed. JSON operations still read/write the full database synchronously. Expiration/revocation does not cancel a completed operation.

## Errors

| Status | Meaning / representative code |
| --- | --- |
| 400 | INVALID_PAYLOAD, INVALID_JSON, INVALID_DATE, INVALID_ACTION_PATH |
| 401 | Invalid/missing/expired credential or disabled action configuration |
| 403 | Read-only scope, unsupported method, HTTPS_REQUIRED |
| 404 | TASK_UNAVAILABLE or HABIT_UNAVAILABLE (including archived habit) |
| 409 | STALE_DAY, STALE_TASK, TASK_NOT_ELIGIBLE, HABIT_NOT_ELIGIBLE |
| 409 | AMBIGUOUS_RECURRENCE, INVALID_RECURRENCE/STATE, AMBIGUOUS_TASK_ID |
| 409 | AMBIGUOUS_HABIT_LOGS, ANNOTATED_LOG_CONFLICT, EXISTING_LOG_METADATA |
| 429 | Action budget exhausted; respect Retry-After |
| 503 | COMPLETION_UNAVAILABLE; check storage, never initialize/reset as a fix |

Errors contain no raw tokens, logs, record contents or filesystem exception details. The frontend build credential scan now also rejects action credential configuration in client artifacts. No real token was generated or scanned into output.

## Private Windows provisioning (later, operator only)

The new `widget:action-token` npm alias uses the existing secure generator. Run once **later** in a private PowerShell session without transcription/screen sharing, capturing its JSON instead of printing it:

```powershell
$actionProvision = npm run --silent widget:action-token -w server | ConvertFrom-Json
$actionExpiry = (Get-Date).ToUniversalTime().AddDays(90).ToString('yyyy-MM-ddTHH:mm:ssZ')
```

Store `$actionProvision.token` privately in your password manager, separately labeled from the read token. Transfer `$actionProvision.sha256` and `$actionExpiry` to the two new Railway variables. If using Set-Clipboard, disable clipboard history/cloud synchronization for secret handling and clear the clipboard after pasting. Never put the raw credential into Railway configuration, Git, frontend code, URLs or terminal command literals. Remove shell references when done with `Remove-Variable actionProvision, actionExpiry`; that is not guaranteed memory erasure.

Rotate by generating a distinct token, replacing digest/expiration on the correct revision, deploying configuration, then updating future action clients. Revoke by removing the action digest or configuring an expired timestamp and deploying that configuration. Both take effect when the running deployment receives the new configuration; expiration is checked per request. Do not replace the current Scriptable read Keychain value with the action token: Phase 3 scripts remain read-only and unchanged.

## Safe deployment and verification sequence

1. Review the legacy recurrence conflict policy and retain your verified backup privately. No production records were inspected to determine how many would conflict. If uninterrupted completion of legacy incomplete recurring tasks is essential, **hold deployment pending an explicit reconciliation plan**.
2. Publish the reviewed revision only when separately authorized. Verify Railway's source commit before editing variables so a configuration-triggered deployment cannot deploy an older GitHub revision.
3. Deploy backend code with action variables absent first. Keep existing volume /app/data, DATA_DIR, session configuration, read credential and proxy settings unchanged. No initialization or destructive migration is required. Existing browser correctness fixes become active immediately, even with widget writes disabled.
4. Verify browser login and widget reads. The small frontend cache deduplication improvement can be deployed through normal Vercel workflow; no Vercel configuration change is required. Old browser clients remain API-compatible and refetch on settlement.
5. Privately provision the action digest/expiration on the confirmed backend revision and deploy configuration. Verify HTTPS recognition through the existing proxy chain; do not weaken trust settings.
6. **Manual production action tests must use deliberately created disposable records only.** Create a new nonrecurring task due today and a new daily habit through the browser, record their IDs privately, and confirm their cohort eligibility. Never use a real task/habit or downloaded backup as a test fixture.
7. Test complete twice, incomplete twice, and confirm one log/no residual completion. For recurrence, create a separate disposable recurring task, complete → repeat → reopen → complete; confirm exactly one successor. Any cleanup is an explicit manual operation, not an API side effect.

Example manual request after creating a disposable record (not executed by implementation):

```powershell
$actionSecret = Read-Host 'Action token' -AsSecureString
$actionPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($actionSecret)
try {
    $actionRaw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($actionPointer)
    $actionHeaders = @{ Authorization = 'Bearer ' + $actionRaw }
    $disposableId = Read-Host 'ID of the deliberately created disposable task'
    if ($disposableId -notmatch '^[1-9][0-9]*$') { throw 'Invalid ID' }
    $widgetDate = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow, 'Romance Standard Time').ToString('yyyy-MM-dd')
    $actionBody = @{ date = $widgetDate; completed = $true } | ConvertTo-Json -Compress
    $actionResult = Invoke-RestMethod -Method Patch -Uri ('https://productivity-server-production-3494.up.railway.app/api/widgets/tasks/' + $disposableId + '/completion') -Headers $actionHeaders -ContentType 'application/json' -Body $actionBody
    Write-Host 'Disposable-record request succeeded.'
} catch {
    Write-Host 'Request failed. Inspect the status privately; do not share headers or raw error dumps.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($actionPointer)
    Remove-Variable actionRaw, actionHeaders, actionResult, actionSecret, actionPointer -ErrorAction SilentlyContinue
}
```

This example assumes the configured Europe/Paris zone on Windows. For the disposable habit use PUT and `/api/widgets/habits/{id}/completion`. For undo change the boolean to `$false`. Re-run only deliberately, with the same desired state for retry tests. Do not use automatic loops, redirects, verbose/debug logging or real record IDs. If midnight changes the day, refresh and stop retrying the old action.

## Rollback and validation

Revoke/disable action access first if needed. Rolling back to older business logic reintroduces duplicate-successor and duplicate-log behavior, even though extra JSON fields remain readable. Never clear recurrenceIssued markers or restore an old database over a live writer. Prefer a forward fix; database recovery requires a stopped writer and deliberate verified restore.

Tests use synthetic data in isolated temporary directories, child processes without dotenv/startup imports, and localhost HTTP. Coverage includes shared browser/widget operations, recurrence cycles, durable reloads, failure-before-rename, schedules, duplicate/annotated logs, DST/midnight, credentials/scopes/TLS, malformed payloads and independent rate limits. Existing auth, widget read and database safety suites remain included. No iPhone interaction changes are made here.

Run: `npm run test -w server`, `npm run test -w client`, `npm run build`, `node client/scripts/check-pwa.mjs`, `npm run check:auth -w client`, `npm audit --omit=dev`.

Local results: 61 backend tests (including 16 new action/business regression tests), 4 frontend tests, TypeScript checks (including the new test source), full production build and final backend rebuild all passed. PWA and credential-artifact checks passed. Production dependency audit: zero vulnerabilities. Existing Vite large-chunk and PostCSS module-type warnings remain. Linux volume/proxy behavior and real iPhone action requests require later manual validation; no production request was made.

## File inventory

Created: `server/src/db/completion.ts`, `server/src/widgets/actions.ts`, `server/src/widgets/bearer.ts`, `server/src/middleware/completionError.ts`, `server/tests/actions.test.ts`, and this document.

Modified: `server/src/db/database.ts`, `server/src/types.ts`, `server/src/widgets/config.ts`, `server/src/widgets/router.ts`, `server/src/widgets/snapshot.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/src/routes/tasks.ts`, `server/src/routes/habitLogs.ts`, `server/package.json`, `client/src/hooks/useHabits.ts`, and `client/scripts/check-auth-build.mjs`. No new dependency or lockfile change. Scriptable, browser-authentication, PWA, deployment configuration and JsonStore files are unchanged.
