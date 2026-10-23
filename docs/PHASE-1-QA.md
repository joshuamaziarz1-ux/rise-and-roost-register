# Phase 1 QA evidence — 5.2.0-rc.3

## October 23 rc.3 validation

Executed on October 23:

| Command | Result |
| --- | --- |
| `npm run test:all` | **131 passed, 0 failed**: 27 database/handler/model, 1 preservation rehearsal, 103 browser cases. Browser duration 9.2 minutes. This complete run preceded the final unchanged-appointment-time preservation guard. |
| Focused profile/return lost-response regression | Reproduced the old blocked profile retry; all 3 browser engines passed after recovery changes. |
| Final appointment workflow repeat | Verifies linking an existing order, exact saved timestamp precision, approval, conflict rejection and reload recovery. **3 passed, 0 failed in 2.4 minutes**, across desktop Chromium, iPhone WebKit and Android Chromium. Final-head CI is pinned in PR #3. |

The expanded suite contains **131 checks**: 27 Node/PostgreSQL/handler/model, one preview-preservation rehearsal and 103 browser cases. Six new control workflows run in desktop Chromium, iPhone WebKit and Android Chromium, including actual phone viewports for the additional Admin/Register contexts. Existing split-layout comparisons still run at all four viewports, including landscape tablet.

Executed during implementation: 27 Node checks passed; four new desktop workflows passed immediately. The appointment workflow exposed a test comparing equivalent ISO timestamp strings with different UTC offsets, corrected to compare instants. A later iPhone run found a real repeated-render bug: identical account polling replaced pickup buttons during scrolling/tapping. Cards now redraw only when their data changes; the complete iPhone appointment workflow then passed in 47.4 seconds. No forced clicks, arbitrary sleeps or retries hide that failure. The final run additionally checks appointment recovery after page reload and the availability form's confirmed Saved status.

New coverage includes Comments receive/review/resolve/reopen across independent Admins, escaped request text, partial/full credit spending, duplicate/lost-response protection, a changed credit value with unchanged cash due, scoped history, store-time-zone slots, concurrent booking rejection, member ownership, approval gates, appointment-version conflicts, and preserving private access metadata. An explicit profile lost-response regression reproduced the old retry becoming blocked after polling updated its version. Profile/return retries now confirm the original request; member operations retain their original actor, and another account cannot submit them. Three focused recovery cases passed in 27.2 seconds before the final full run. The test API deadline is 10 seconds (production uses 20), with 300-millisecond polling retained; interrupted-network tests explicitly abort responses. No sleeps or successful-operation retries disguise product failures. Windows test cleanup retains durable checkpoints and allows 120 seconds for shutdown after resume. Final full-suite results and exact-head CI are recorded in PR #3 after execution.

Further testing found the same repeated-render tap loss in return steppers. Unchanged return controls now remain stable; an empty configured return list stays empty, disables submission and recovers when eligible types return. Private selection/DOM caches clear on logout. Conflict tests assert the explicit rejection dialog, canonical data and recovery draft instead of a connection badge that polling can replace.

The original-interface layout test temporarily detaches only the newly authorized Comments tab before comparing prior controls/positions against main. The baseline sales label is normalized only for the newly supported Roost Credits payment value, whose old generic label was Prepaid. Actual expanded-interface screenshots from `controls.spec.js` separately show Comments, partial/full credit confirmation, member scheduling and Admin approval, including linking an existing order. No original stylesheet, logo asset, landscape CSS or manifest is changed.

The October 22 full run was interrupted by the host sleeping overnight; its timing failures are superseded by a fresh October 23 run. The layout measurement now uses rendered text, since textContent counted an invisible credit button.

No rc.3 deployment, production data write or production DDL has occurred. The Supabase connector required reauthentication on October 23, so a new live fingerprint read could not be completed. The retained October 22 18-table audit is the latest successful production audit; do not describe it as a fresh rc.3 live audit. The older hosted preview is not rc.3. Real magic-link and physical-device checks remain outstanding.

## Historical rc.2 validation

The final suite contains **109 checks**: 23 Node/PostgreSQL/handler/model, one preview-preservation rehearsal, and 85 browser cases. The eight new session/live-account scenarios and deterministic rapid-cart regression run in desktop Chromium, iPhone WebKit and Android Chromium. The existing full split-UI screenshot comparison also runs on the landscape tablet.

Regression tests first reproduced a restored member token after logout and an accepted empty checkout in the old candidate. A separate deterministic probe then reproduced an Admin read restoring four synthetic private member records and removing the gate after SDK sign-out. The final guard verifies the active session and authentication generation before applying any Admin response. Conflict exports retain the exact unconfirmed changes even when a session transition has cleared displayed records.

Executed rc.2 commands:

| Command | Result |
| --- | --- |
| `npm ci` | 39 packages; zero reported vulnerabilities |
| `npm run test:all` | 23 Node checks and 1 preview-preservation check passed. An early browser failure exposed a test comparing reserved availability with stock on hand; the comparison and synthetic pickup cleanup were corrected. |
| `npm run test:browser -- --reporter=line --max-failures=1` | 76 passed in 4.8 minutes, including all four immutable-baseline layout comparisons, before the final delayed-Admin-read guard. |
| `npm run test:browser -- tests/browser/recovery.spec.js tests/browser/session-safety.spec.js tests/browser/sync.spec.js --reporter=line --max-failures=1 --output=work/rc2-final-behavior` | Interim 75 affected scenarios passed, 0 failed in 2.4 minutes, including the delayed Admin read and exact conflict recovery data; this preceded the catalog/signup correction below. |

**Final local result:** `npm run test:all` passed all **109 checks** (23 Node/PostgreSQL/handler/model, 1 preview-preservation, 85 browser; browser duration 4.9 minutes), with zero failures, skips or retries. This includes the final catalog/signup correction and all four immutable-main layout comparisons. All 32 selected before/after screenshot files were refreshed from this passing run. The final pushed commit and its independent CI run/result are pinned in [PR #3](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/3).

The first pushed rc.2 CI run passed all 24 Node/preservation checks and 78 of 79 browser cases. The remaining iPhone failure occurred before the malformed-response assertion: the cart closed during rapid navigation. Inspection found a real 20-millisecond delayed cart reset in the original Start Shopping handler. A deterministic clock test reproduced the class being removed after the cart was opened. Initialization now finishes in the initial handler, with no delayed navigation reversal; no extra sleeps or retries were added to hide the defect. Final-commit CI results and the new three-engine regression run are recorded in PR #3.

A subsequent local run caught a catalog revision arriving while signup was in flight. Guest-state cleanup had advanced the member identity generation and incorrectly discarded the valid signup response. A deterministic held-response test failed before the fix. Public refreshes now clear private guest data without canceling a pending signup; explicit logout still invalidates outstanding member responses. All 12 focused signup, logout and account-switch cases passed across the three engines after the correction. The prior commit passed 106 checks in [CI run 39830087651](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/39830087651), but that result does not cover this newly reproduced regression. Final full-suite results are recorded below and in PR #3.

The current run uses only disposable local PostgreSQL databases, the actual candidate Edge handler and intercepted synthetic authentication. No candidate site, Edge Function or migration has been deployed. Real magic-link email delivery and physical-device acceptance remain outstanding. The existing hosted Sites preview must not be mistaken for rc.2.

Read-only production checks across 18 tables returned identical counts and full-record fingerprints before and after development. No raw customer records were exported. Supabase `rise-roost-api` remains version 13 and the older preview function remains version 3. The six deployed source files matched main. Evidence is in `phase1-production-preservation-20261022.json` and `phase1-deployed-source-20261022.json`.

Supabase advisory review still reports [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth setting was changed. No-policy informational entries deny direct browser access to service-only tables. Missing foreign-key indexes were reported only in the old synthetic preview schema; production's corresponding indexes exist. Unused-index notices alone are not a reason to delete production indexes. These existing settings and informational items are separate from the candidate's tested access controls.

## Historical rc.1 evidence

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
| `npm run test:browser -- tests/browser/recovery.spec.js --grep 'unconfirmed Admin edits' --reporter=line --output=work/final-status-validation` | 3 passed, 0 failed; both the badge and existing Settings save status accurately report an unconfirmed save |
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

No production merges, deployments, migrations, payment-provider changes, real payments or OS kiosk/unlock changes occurred. Physical-device acceptance and the owner release review in the release report remains open. Passing automation alone is not owner approval.

| Viewport | Home pair | Shop pair | Cash pair | Admin pair |
| --- | --- | --- | --- | --- |
| chromium | [before](qa/chromium/home-before.png) / [after](qa/chromium/home-after.png) | [before](qa/chromium/shop-before.png) / [after](qa/chromium/shop-after.png) | [before](qa/chromium/cash-before.png) / [after](qa/chromium/cash-after.png) | [before](qa/chromium/admin-dashboard-before.png) / [after](qa/chromium/admin-dashboard-after.png) |
| iphone-webkit | [before](qa/iphone-webkit/home-before.png) / [after](qa/iphone-webkit/home-after.png) | [before](qa/iphone-webkit/shop-before.png) / [after](qa/iphone-webkit/shop-after.png) | [before](qa/iphone-webkit/cash-before.png) / [after](qa/iphone-webkit/cash-after.png) | [before](qa/iphone-webkit/admin-dashboard-before.png) / [after](qa/iphone-webkit/admin-dashboard-after.png) |
| android-chromium | [before](qa/android-chromium/home-before.png) / [after](qa/android-chromium/home-after.png) | [before](qa/android-chromium/shop-before.png) / [after](qa/android-chromium/shop-after.png) | [before](qa/android-chromium/cash-before.png) / [after](qa/android-chromium/cash-after.png) | [before](qa/android-chromium/admin-dashboard-before.png) / [after](qa/android-chromium/admin-dashboard-after.png) |
| tablet-landscape | [before](qa/tablet-landscape/home-before.png) / [after](qa/tablet-landscape/home-after.png) | [before](qa/tablet-landscape/shop-before.png) / [after](qa/tablet-landscape/shop-after.png) | [before](qa/tablet-landscape/cash-before.png) / [after](qa/tablet-landscape/cash-after.png) | [before](qa/tablet-landscape/admin-dashboard-before.png) / [after](qa/tablet-landscape/admin-dashboard-after.png) |

## Actual rc.3 control screenshots

These 15 files show the expanded interface with synthetic records and real release labels; the earlier 32 normalized before/after layout files compare the pre-existing controls to immutable main.

| Browser | Comments | Partial credits | Full credits | Member schedule | Admin appointment |
| --- | --- | --- | --- | --- | --- |
| Desktop | [view](qa/rc3/chromium/phase1-comments.png) | [view](qa/rc3/chromium/phase1-partial-credits.png) | [view](qa/rc3/chromium/phase1-full-credits.png) | [view](qa/rc3/chromium/phase1-member-schedule.png) | [view](qa/rc3/chromium/phase1-admin-appointment.png) |
| iPhone | [view](qa/rc3/iphone-webkit/phase1-comments.png) | [view](qa/rc3/iphone-webkit/phase1-partial-credits.png) | [view](qa/rc3/iphone-webkit/phase1-full-credits.png) | [view](qa/rc3/iphone-webkit/phase1-member-schedule.png) | [view](qa/rc3/iphone-webkit/phase1-admin-appointment.png) |
| Android | [view](qa/rc3/android-chromium/phase1-comments.png) | [view](qa/rc3/android-chromium/phase1-partial-credits.png) | [view](qa/rc3/android-chromium/phase1-full-credits.png) | [view](qa/rc3/android-chromium/phase1-member-schedule.png) | [view](qa/rc3/android-chromium/phase1-admin-appointment.png) |
