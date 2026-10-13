# Phase 1 PWA setup

## Deploy

1. Use Node 20.19+ (Node 22 or 24 recommended for this build dependency). From the repository root run `npm ci`, then `npm run build -w client`.
2. Deploy the frontend to Vercel using the existing project. For a Vercel project with Root Directory `client`, the build command is `npm run build`, output directory is `dist`, and `client/vercel.json` supplies cache headers. If the project builds from the repository root, keep its existing workspace build/output settings and merge the headers from `client/vercel.json` into its root Vercel configuration. Do not change API rewrites if any are configured in the dashboard.
3. **Phase 2A.1 supersedes the original bearer-token setup.** Follow [AUTH_MIGRATION.md](AUTH_MIGRATION.md) for the backend-first rollout, same-origin Vercel rewrite, secure session configuration and legacy-token revocation before deploying this frontend. Do not configure a frontend bearer token.
4. Use the canonical HTTPS production domain. Confirm `/manifest.webmanifest`, `/sw.js`, and `/apple-touch-icon.png` return their real files (not rewritten HTML). Check the worker response has the configured no-cache/no-store headers. The app navigates using React state at `/`; no new SPA rewrite is needed.

## Install and test on iPhone

1. Open the production HTTPS URL in **Safari**. Confirm your existing data loads and navigation works.
2. Tap **Share**, then **Add to Home Screen** (possibly under More). Keep **Open as Web App** enabled if your iOS version offers it, then tap **Add**.
3. Close Safari and tap **My Workspace** on the Home Screen. Confirm the teal lightning icon and launch without Safari address/tab bars.
4. Dismiss the welcome screen if it appears. Check the menu, all views, long lists, note editor, dialogs, calendar add button, grocery fullscreen view, and Pomodoro panel. Test portrait, landscape, light/dark mode, and keyboard opening/closing. Controls should remain clear of the notch and Home indicator; content should scroll within its panels.
5. Open a view and reload where available; confirm the view is restored during that session. Background and resume the app, then fully close/reopen it. API access should work without login. Navigation uses sessionStorage: a fresh OS session may return to Today; Safari preferences may not transfer to the installed app. Saved server data should remain available.
6. On a preview/test deployment, make a disposable task or note, save it, reopen the app, and verify persistence. Avoid test edits to production data unless intended.
7. After the first online load, enable Airplane Mode and relaunch. The cached app shell may open; personal data is not available offline and edits require connectivity. Disable Airplane Mode and verify data loads again. Existing in-memory data may remain visible while the app stays open.
8. Test updates on a stable deployment URL: deploy a visible frontend change, then reopen/resume the older installed version while online. It should offer **Reload** / **Later**. Choose Later and confirm editing is not interrupted. Save your work, reopen/resume to check again, and choose Reload; confirm the new version and server data. A worker cannot activate until all of its static assets download successfully.

## Caching, authentication, and limitations

- `vite-plugin-pwa` generates the manifest and Workbox worker only for production builds. `npm run dev` does not register a worker; use `npm run preview -w client` to test the build locally. Local preview uses the existing `/api` proxy and needs a separate local backend for data; it is not iPhone installation testing.
- Only build output and app icons are precached. There are no runtime caches for API responses, external fonts, images, or Railway requests. API fetches also use `cache: 'no-store'`. React Query's existing memory cache and existing local/session storage behavior remain in place. No offline datastore, sync queue, push subscription, widget APIs, or Scriptable integration was added.
- Authentication now uses the secure browser session described in [AUTH_MIGRATION.md](AUTH_MIGRATION.md). Authentication and private API requests remain network-only. Bring older installed versions online and accept Reload; after legacy revocation, an old cached bearer credential no longer grants API access. Safari and the installed app may require separate initial sign-ins.
- Updates remain pending until Reload or until older clients close. Checks run on load and on visible resume/reconnection. Save unsaved notes before accepting Reload. iOS can evict site storage/caches; offline shell availability is not guaranteed.
- Existing browser notification/timer features do not become native background services. iOS can suspend timers, and the existing `new Notification` implementation is not iOS Web Push. This phase does not add push or background scheduling.
- Physical iPhone installation, safe areas, keyboard behavior, suspend/resume, and deployed Railway authentication cannot be verified from Windows alone. Safari remote Web Inspector usually requires a Mac; the manual tests above do not.

## Verification

Run `npm run build -w client`, then `node client/scripts/check-pwa.mjs`. The artifact check validates the manifest, icon dimensions, iOS metadata, precache files, API fallback exclusions, and deferred worker activation. No existing test/lint scripts were found. Build output may warn about the existing large bundle and PostCSS module metadata. npm audit reports dependency vulnerabilities; resolving those is separate from the PWA change.

Implementation checks: the full root `npm run build` passed (server TypeScript plus frontend TypeScript/Vite), and the generated-artifact checks passed. A local browser preview rendered on desktop and at 390 x 844; the mobile drawer and Tasks navigation worked, Tasks survived reload, shell height matched the viewport, and document width remained 390px. Data requests failed as expected because the local backend was not running; production auth/data and physical iOS behavior remain unverified. The final lockfile install reported 18 audit findings (2 low, 3 moderate, 10 high, 3 critical). No blanket audit fix or major dependency migration was performed.

Icons reuse the application's teal (`#0d9488`) lightning mark. Their editable source is `client/public/icons/workspace.svg`; regenerate PNGs on Windows with `powershell -ExecutionPolicy Bypass -File client/scripts/generate-pwa-icons.ps1` (process-scoped policy only).

References: [Vite PWA registration](https://vite-pwa-org.netlify.app/guide/register-service-worker), [Apple web-app metadata](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html), [WebKit Home Screen apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
