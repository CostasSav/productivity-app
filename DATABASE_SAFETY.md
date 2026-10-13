# Phase 2A.2 — JSON database safety

Implemented locally only. Production, the downloaded backup, the untracked root db.json and the personal development database were not opened or modified. No production credentials, environment variables, session-store code, frontend/PWA code, API routing, task recurrence or habit scheduling logic changed. No commit, push or deployment was performed.

## Persistence behavior

Normal reads and startup now require an existing readable, valid database. There is no empty-data fallback and no automatic creation of a missing database, including in development. Startup validates authentication as before, then runs the existing migration backfills and stale-pin cleanup through `prepareDatabase()`. Any database failure stops startup before listening; failed migration persistence prevents pin cleanup. Runtime read failures throw instead of serving empty data.

Failures have sanitized `DatabaseError` codes; no JSON snippets, record contents or raw filesystem error messages are included:

| Code | Meaning |
| --- | --- |
| MISSING | Required database file or directory is absent. Verify the volume/path or recover the file. |
| CORRUPT | Invalid JSON, including an empty/truncated file. No reset or repair occurs. |
| FORMAT | Wrong top-level structure, invalid collection/settings/counter shape, or a non-regular file. |
| PERMISSION | Filesystem access denied. |
| IO | Other filesystem/storage failure, including a full device. |
| SERIALIZE | Serialization or validation of the serialized value failed before disk mutation. |
| EXISTS | Explicit initialization refused to replace an existing destination. |
| CLEANUP | A pre-publication failure also prevented removal of its temporary file; original remains intact. |
| COMMIT_UNCERTAIN | Replacement already occurred, but final directory synchronization or cleanup failed. Inspect before retrying: the operation may already have committed. |

The structural check requires the original tasks/notes collections and their counters. Historical optional collections still receive the existing backfills when absent. Present invalid values are rejected rather than converted to empty arrays/settings. Unknown fields are preserved. This is a storage envelope check, not full record-level schema validation, duplicate repair or a new migration format. A syntactically valid but semantically incorrect database cannot always be detected.

## Write strategy and limitations

1. Serialize and validate before creating any file.
2. For updates, re-read/validate the existing destination so a missing or corrupted file cannot be recreated by an ordinary save.
3. Exclusively create a randomly named `.db-<uuid>.tmp` in the database directory.
4. Write the full serialized JSON, fsync the file, and close it.
5. Rename it over db.json on the same filesystem. Never delete/truncate the original as a fallback.
6. On Linux, fsync the parent directory after publication. On Windows, directory fsync is skipped because that operation is not supported through the same API.
7. Clean the current operation's temporary file after failures; report cleanup failure instead of silently ignoring it.

Explicit initialization publishes the fully written file using a no-clobber hard link and then removes its temporary name. Even if another creator appears after the absence check, it cannot overwrite that file. Initialization fails safely on a filesystem without hard-link support; there is no unsafe fallback. Missing parent directories are not automatically created by the initializer.

Existing POSIX permission bits are used for replacements, subject to process umask; new databases use mode 0600. New files belong to the running process. Windows ACLs, special ACLs, ownership and extended attributes are not cloned: verify inherited directory permissions. The application needs write/rename access to the directory, not just write access to the original file. Antivirus or another process holding the file on Windows can make replacement fail; the original is retained.

Atomic visibility is not an absolute guarantee against hardware/volume failure. A crash before publication can leave a temporary file; it is never promoted automatically. On Windows, a machine/power failure after rename has weaker directory-durability guarantees. A Linux directory-fsync failure after rename yields COMMIT_UNCERTAIN, not a claim that the old data survived. Do not blindly retry non-idempotent operations in that case. Temporary files contain sensitive data; inspect/remove abandoned ones only during deliberate recovery with the writer stopped. Never clean the separate sessions directory as part of database recovery.

The existing **one Node process, one writer, one Railway replica** assumption remains. Synchronous operations serialize within that process, but there are no interprocess locks, optimistic version checks or multi-operation transactions. Do not run two overlapping deployments/writers, cluster workers, manual file editors or backup restoration while the service is writing. Future async read-modify-write flows would need additional coordination. Each save still rewrites the full JSON document and performs synchronous I/O, so large databases can block the event loop. Filesystem synchronization increases write latency in exchange for durability.

Node APIs used: [renameSync](https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath), [fsyncSync](https://nodejs.org/api/fs.html#fsfsyncsyncfd), and [linkSync](https://nodejs.org/api/fs.html#fslinksyncexistingpath-newpath).

## Explicit initialization for a genuinely new installation

**Do not run this for the existing Railway installation or as a deployment/start command.** It is not a recovery command. Missing data on an established installation should first be treated as a missing mount/path or recovery incident.

For a deliberately new disposable local installation, create a new directory, then from the repository root run:

```powershell
npm run db:init -w server -- "C:\absolute\path\to\new-disposable-data-directory"
```

The CLI requires an explicit absolute existing directory, loads no dotenv file, and overrides DATA_DIR only in its own process. It refuses an existing db.json, even if empty or corrupted, and never uses the personal database by default. The operator must separately choose the corresponding data directory when running the app. The CLI uses the existing development dependency tsx; a runtime installed with `--omit=dev` does not include this operator tool. No production setting needs to change for an existing valid database.

## Railway deployment checklist

Before a later, user-controlled deployment:

1. Keep the downloaded backup secured and verify your restore procedure independently. This implementation did not read or validate that backup.
2. Confirm the existing persistent volume is mounted at `/app/data`, existing DATA_DIR resolves there, and `/app/data/db.json` is present as a regular file. Do not initialize a replacement if it is unexpectedly missing.
3. Keep one writer/replica and avoid overlapping writers during rollout. Confirm the runtime user can read the database and create, synchronize, rename and remove files within the volume. Ensure free space for the old and new full database copies plus any abandoned temporary files and sessions.
4. Run `npm ci` from the repository root to use the updated lockfile. Keep the existing build/start settings and all environment values. No new environment variable is required.
5. In a separate disposable Linux/staging directory using synthetic data, verify real rename and directory-fsync behavior and ordinary API operations under the deployment filesystem/runtime. Windows tests simulate the Linux post-rename failure path but do not prove Railway volume guarantees.
6. On eventual normal startup, existing backfills and stale-pin cleanup still run against a successfully validated file. No new record migration is introduced. If startup reports MISSING/CORRUPT/FORMAT/PERMISSION/IO, stop and investigate; do not reset, run db:init, or auto-promote a temporary file.
7. Check login/session persistence independently after deployment. Session files remain in their existing separate directory and were not migrated or cleaned by this change.

Recovery should be deliberate: stop the writer, preserve the problematic file, verify the correct mounted volume, and restore only a verified backup under your control. Rolling back to the old persistence code would restore the silent-empty-fallback risk and is not a corruption repair.

## Dependency maintenance (2026-10-13)

Compatible runtime updates, without a major Express change or forced audit fix:

| Package | Previous | New |
| --- | --- | --- |
| express | 4.22.1 | 4.22.3 |
| body-parser | 1.20.5 | 1.20.8 |
| qs | 6.14.2 plus nested 6.15.1 | 6.16.0, deduplicated |

The server manifest now requires Express ^4.22.3; the root lockfile records all resolutions. No new package was introduced. The production audit (`npm audit --omit=dev`) reports **zero vulnerabilities**.

The full development/build dependency audit still reports **14 affected packages: 2 low, 1 moderate, 9 high, 2 critical**. These are outside the production-only result: @babel/core, braces, chokidar, concurrently, esbuild, fast-glob, micromatch, nanoid, postcss, postcss-selector-parser, shell-quote, source-map-js, tailwindcss and vite. Several entries share an underlying advisory (for example concurrently/shell-quote). They remain for a separate tooling maintenance pass; npm suggests a major Tailwind update for part of that chain, which would exceed this phase's compatibility constraints. Other tooling patches may be compatible, but were not mixed into this production-storage change. Do not interpret the clean runtime audit as a clean build/development toolchain, especially if a production start command runs development tools.

## Validation

- Temporary synthetic database tests cover absence, valid content, malformed/empty/truncated JSON, structure errors, read permission/I/O errors, write permissions, serialization, partial writes, fsync/close failures, replacement failures, cleanup failures, post-commit uncertainty, initialization races, reload, stale temporary files, and startup migration/pin-cleanup failures.
- Integration tests import only the database module in a child process with DATA_DIR already set to a newly generated temporary test directory. They never start server/src/index.ts or load dotenv. Filesystem faults are injected deterministically, so permission tests do not depend on Windows ACLs or administrator privileges.
- Existing authentication tests exercise only temporary synthetic sessions and stub routes; the session-store code is unchanged. Existing frontend API tests also remain unchanged.
- Full production build, backend TypeScript, frontend tests, PWA artifact checks and credential checks pass. Existing large-chunk and PostCSS module-type warnings remain.

Run from the repository root:

```powershell
npm run test -w server
npm run test -w client
npm run build
node client/scripts/check-pwa.mjs
npm run check:auth -w client
npm audit --omit=dev
```

Remaining application-level risks intentionally unchanged: repeated recurring-task completion can create duplicate successors; duplicate habit logs can produce inconsistent completion state. These need an idempotency design before interactive widget actions. Atomic file replacement does not resolve either issue. No widgets, data deduplication or recurrence/habit redesign were added.

## File inventory

Created: `server/src/db/jsonStore.ts`, `server/scripts/init-database.ts`, `server/tests/database.test.ts`, `DATABASE_SAFETY.md`.

Modified: `server/src/db/database.ts`, `server/src/index.ts`, `server/package.json`, `package-lock.json`.
