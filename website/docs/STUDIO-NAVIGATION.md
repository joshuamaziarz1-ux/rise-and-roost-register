# Studio Back and Home

The Studio header has compact Home and Back controls, in that order. Both are omitted from the main Home dashboard, including the control group itself so no empty toolbar row remains. They remain available in other sections and in edits opened from Home. Home always opens the Studio dashboard. Back uses only entries created by the same workspace's Studio; a fresh/direct entry falls back to Studio Home rather than following an unrelated browser history entry. Existing dashboard and primary navigation stay in place. Redundant contextual return buttons in order details, member details, Payments and the Help Guide are removed.

Studio uses native pushState/popstate history for sections, order/member selections, pickup lists and edit screens. Valid Studio history survives reload, including native browser Back/Forward. Form values and search text stay out of serialized history state and URLs. Each navigation adds one native history entry; redundant replaceState writes are avoided to stay within Safari’s History API rate limit during rapid navigation. In-memory form snapshots retain unfinished fields, while existing session draft recovery, unsaved-change prompts, revision conflict review, beforeunload protection and operation reconciliation remain in use. Navigation is blocked while a save is pending; saved/canceled forms are removed from retained edit snapshots.

The earlier readiness failure was caused by the production browser fixture leaving its global fetch mock installed. Cleanup now restores the original fetch. A regression reproduces the production-owner-fixture then local-server-fixture sequence. Navigation browser coverage uses the real production owner path with signed synthetic identities and an in-memory database; it never borrows a live owner's session.

## Validation

Commands run from `website/`:

- `npm test`: backend/security and fixture cleanup.
- `python tests/production_schema_guards.py`: production schema protection.
- `npx playwright test --config playwright.navigation.config.mjs`: sections, nested order/payment/help views, product-edit prompts, draft retention, native Back/Forward, reload history, direct-entry Home fallback, widths and unchanged fixture business records. Desktop Chromium/WebKit, iPhone WebKit, Android Chromium and tablet Chromium.
- `npx playwright test --config playwright.phase3.config.mjs`: selling/pickup regression matrix.
- `npx playwright test --config playwright.production.config.mjs`: production owner authentication, session expiration, launch lock and customer/payment flows.
- `npx playwright test --config playwright.commerce.config.mjs`: commerce/payment configuration regression.
- `npx playwright test --config playwright.navigation-regression.config.mjs`: desktop/iPhone Studio saves, interrupted saves, conflicts, multi-device synchronization and unchanged customer layout.
- Exact production Worker versions-upload dry build, preserving its executable byte-for-byte.

Browser profiles emulate devices; no physical-device certification is claimed. Desktop and iPhone screenshots were visually reviewed. All mutations in tests use disposable local databases.

## Production release

Base application source: `22bcece6c36fd17fc68990754d18f7056dd88eb9`, including the Help Guide and checkout pickup cards. Active version inspected before release: `bef9b83c-f674-4787-9b70-3cc7d5a6d7fb`.

Only five deployed assets change: `management.mjs`, `management.css`, `studio.mjs`, `help.mjs` and the new `studio-history.mjs`. No server, schema, dependency, production deployment configuration or business data changes are part of this release.

Stage with the original executable and source map, actual runtime configuration and all matching assets. Executable SHA-256: `c07ccc2c07f034f8ae363e43e5835de28eea8d1e34a5255db155b5e31d783911`. Do not deploy the preparation-only checked-in production configuration. Inspect the inactive candidate's 16 bindings, handlers, security headers and runtime before activation. Recheck that production deployment, settings, schema and all 12 application table fingerprints remain unchanged before staging/activation; stop on unexplained drift and never restore/overwrite live data.

This release makes no D1 write and does not change checkout activation, ordering pause, payment configuration, Cloudflare Access, DNS/routes, authentication duration or owner sessions. Existing tabs continue running their loaded application; no forced refresh, logout or maintenance window is used. Retain the previous version and matching assets for an application-only rollback. Post-release checks verify deployed assets, public pages/API, Access challenges, closed legacy APIs, runtime settings and read-only data fingerprints. Cloudflare's existing Analytics injection is accounted for when comparing served HTML; the source asset and analytics configuration are preserved.

Private baseline/configuration, raw test logs and release receipts remain outside Git under `/workspace/studio-nav-release`.

## Completed predeployment results

- Backend/security and fixture cleanup: **213 passed**.
- Production schema guards: **7 passed**.
- Navigation/Help matrix: **15 passed**, covering all five profiles and all 13 previously blocked cases. Mobile navigation uses touch taps; the suite asserts zero browser JavaScript errors.
- Pickup/selling regressions: **25 passed**.
- Production owner/session/payment browser regressions: **10 passed**.
- Commerce/payment-settings regressions: **8 passed**.
- Studio saves/conflicts/multi-device/customer-layout regressions: **12 passed**.
- Total: **290 passed**, no unresolved failures or skipped final checks.
- Exact production executable dry build: passed, identical SHA-256; no incidental modules.
- Read-only public/security preflight: **11 passed**. Production source assets, operational settings, schema and all 12 application-table fingerprints match the baseline before staging.

## Header refinement

Based on approved production source `32fd1d0c365fbe9182448ed235a2c08c7a197ae1`, deployed as `76a3e8ab-09e4-4ce4-b85a-f30cf83403f2`. Only `public/management.mjs` and `public/management.css` change deployed assets. The checkout pickup fix, navigation history implementation, Studio entry/authentication, Help Guide and all server code are retained byte-for-byte. Separate Customer Accounts development is untouched.

Home is first in DOM, visual and keyboard order; Back is second. The entire navigation group is conditionally omitted only for the actual Home dashboard, not edit screens. The group uses the existing green/cream palette, subtle borders, rounded corners, decorative SVG icons, readable labels, 44-pixel minimum targets and a visible keyboard focus outline. Styles apply only to the two controls. The existing section navigation and dashboard remain otherwise unchanged.

The navigation matrix checks every section, Settings/Payments and Help, nested order/member views, all main edit families, Home edits, safe direct-entry fallback, native history/reload, unsaved forms, touch activation, left/right order, keyboard order, control absence on Home, the reduced mobile header height, width and unchanged synthetic business records. Desktop and mobile screenshots are reviewed before release.

Release follows the same exact-executable, existing-runtime and read-only data safeguards above. No database migration, application-data write, payment/ordering change or authentication change is included. No owner session or open tab is refreshed or signed out.

Refinement validation: **257 passed** (213 backend/security, 7 schema guards, 15 navigation/Help across all five browser profiles, 12 desktop/iPhone Studio regressions, 10 production-owner/session/payment browser regressions). No failed or skipped final tests. Desktop and iPhone screenshots confirm the section controls and compact Home header; exact-Worker dry build retains the current executable SHA-256. Baseline live verification passed all 11 public/security probes and checked all 29 assets, with Access-protected files preserved through the matching deployed version.
