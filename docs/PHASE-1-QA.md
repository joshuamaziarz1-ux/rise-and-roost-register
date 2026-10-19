# Phase 1 QA evidence — 5.2.0-rc.1

Status: **81 automated checks passed** (22 Node/PostgreSQL/handler/model, 1 preview-preservation, 58 browser). The release remains unapproved; see the three current-design acceptance gaps in `PHASE-1-RELEASE.md`.

Environment: Windows, Node 24.16.0, pinned Supabase JS 2.117.3, PostgreSQL 17.6, Playwright 1.64.1. All default tests use synthetic disposable local databases and the actual candidate Edge handler. They do not connect to production. Supabase service/secret keys are not required or included.

| Command | Executed result |
| --- | --- |
| `npm ci` | 39 packages installed, zero reported vulnerabilities |
| `node node_modules/@playwright/test/cli.js install chromium webkit` | Browsers available |
| `npm test` | 22 passed, 0 failed; includes all-table migration preservation and appointment/privacy coverage |
| `npm run test:preview` | 1 passed, 0 failed; isolated-schema rehearsal preserves canonical rows and public function ACLs |
| `npm run test:browser -- --reporter=line --max-failures=1` | 58 passed, 0 failed in 4.3 minutes |
| `npm run test:browser -- tests/browser/recovery.spec.js tests/browser/sync.spec.js --reporter=line --max-failures=1 --output=work/final-browser-validation` | 54 affected cases rerun after stronger receipt/save confirmation validation; 54 passed, 0 failed in 2.1 minutes |
| `RR_PREVIEW_ONLY=1 node tests/live-preview.mjs` | Passed against the existing isolated preview endpoint; 4 actual Realtime events, idempotent sale, shared member credits, rejected unauthorized requests |
| Read-only production fingerprint comparison | All 18 tables unchanged before/after isolated preview writes |
| Read-only deployed-source comparison | Register, Admin, data adapter, cloud adapter, landscape CSS and manifest each returned HTTP 200 and matched the pinned main source |

The live-preview smoke verifies the **existing** deployed `rise-roost-sync-preview` / `rr_preview_sync`, whose binding was inspected first. It does not imply this candidate's changed SQL/Edge code or static pages were deployed. Candidate behavior is verified by the disposable PostgreSQL/handler/browser suite. The public production `rise-roost-api` stayed at version 13; the existing preview function stayed at version 3. The production shared-database migration is absent.

## Browser coverage and screenshot methodology

Desktop Chromium, iPhone 13 WebKit, Pixel 7 Chromium and a 1180×820 landscape tablet are emulated. Each layout test serves immutable approved `main` source `ab27be06d0ad7a999d4ca122ed30373c69b04435` beside the candidate with identical synthetic data and viewports. Baseline external requests are intercepted; no baseline script can reach production. CSS geometry, font, weight, color, background, radius and text are compared, then PNGs must pass `maxDiffPixels: 0` with Playwright's default per-pixel color tolerance after these explicitly limited normalizations:

- Release/version labels and cloud connection/status metadata differ intentionally.
- The former device-local storage description now truthfully says shared Supabase storage.
- Positive customer stock counts are replaced by **Available**, as Issue #2 requires; SOLD OUT remains visible with the item card.

These exceptions are functional/metadata corrections, not a style redesign. Stylesheets, landscape CSS, manifest and logo assets are retained byte-for-byte. Screens include home, product cards, cart, payment choices, cash confirmation, Roost authentication and six Admin tabs including Settings. The Roost profile, returns, history and signout also have functional coverage; no physical phone/tablet or real magic-link email delivery is claimed.

Browser scenarios include two independent Registers plus Admin, hide/show, price/stock/sold-out, cart preservation, quote changes during payment, double taps, malformed successful HTTP response, failed/lost response, recovery after reload, Admin offline edits and reload recovery, stale modal conflicts, token refresh/expiry, API outages and cached read-only catalog, six-hour resume, signup/revisit/member attribution, scoped private history and inactivity logout, cross-device returns and comments, and export retaining separate legacy device/recovery data.

## Regressions found and corrected

Testing exposed an early-load race where the legacy cash-only handler could briefly handle checkout, duplicate unconfirmed-save risks, stale price quotes, missing member-history application on sign-in, and a preview SQL namespace hazard that could have changed canonical function grants. The candidate installs one payment handler before interaction, requires cloud confirmation and durable request IDs, freezes quotes, applies the scoped member response, and confines generated preview grants to the preview schema. Preview ACL preservation is now asserted.

Test harness corrections included stable screenshot CSS scaling on high-density phones, matching immutable baseline metadata, controlling timers before creating the member session, and distinguishing an API outage from an unavailable HTML app shell. Superseded failing runs are not reported as final passing results.

## Evidence and remaining signoff

GitHub CI uploads the complete `test-results` directory as `phase-1-browser-evidence` on every run, including before/after PNGs and failure traces when applicable. 32 selected before/after images are retained under `docs/qa/` in this candidate. Their release metadata is normalized as described above. The branch/commit and CI URL are recorded in the PR.

No production merges, deployments, migrations, payment-provider changes, real payments or OS kiosk/unlock changes occurred. Physical-device acceptance and the three UI scope decisions in the release report remain open. Passing automation alone is not owner approval.

| Viewport | Home pair | Shop pair | Cash pair | Admin pair |
| --- | --- | --- | --- | --- |
| chromium | [before](qa/chromium/home-before.png) / [after](qa/chromium/home-after.png) | [before](qa/chromium/shop-before.png) / [after](qa/chromium/shop-after.png) | [before](qa/chromium/cash-before.png) / [after](qa/chromium/cash-after.png) | [before](qa/chromium/admin-dashboard-before.png) / [after](qa/chromium/admin-dashboard-after.png) |
| iphone-webkit | [before](qa/iphone-webkit/home-before.png) / [after](qa/iphone-webkit/home-after.png) | [before](qa/iphone-webkit/shop-before.png) / [after](qa/iphone-webkit/shop-after.png) | [before](qa/iphone-webkit/cash-before.png) / [after](qa/iphone-webkit/cash-after.png) | [before](qa/iphone-webkit/admin-dashboard-before.png) / [after](qa/iphone-webkit/admin-dashboard-after.png) |
| android-chromium | [before](qa/android-chromium/home-before.png) / [after](qa/android-chromium/home-after.png) | [before](qa/android-chromium/shop-before.png) / [after](qa/android-chromium/shop-after.png) | [before](qa/android-chromium/cash-before.png) / [after](qa/android-chromium/cash-after.png) | [before](qa/android-chromium/admin-dashboard-before.png) / [after](qa/android-chromium/admin-dashboard-after.png) |
| tablet-landscape | [before](qa/tablet-landscape/home-before.png) / [after](qa/tablet-landscape/home-after.png) | [before](qa/tablet-landscape/shop-before.png) / [after](qa/tablet-landscape/shop-after.png) | [before](qa/tablet-landscape/cash-before.png) / [after](qa/tablet-landscape/cash-after.png) | [before](qa/tablet-landscape/admin-dashboard-before.png) / [after](qa/tablet-landscape/admin-dashboard-after.png) |
