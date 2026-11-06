# Studio Help Guide

The owner manual opens only through **Settings → Studio Help Guide**, with the shared Studio header Back/Home controls. Back returns to the preceding Studio screen, or Studio Home for a direct entry with no Studio history. See [Studio navigation](STUDIO-NAVIGATION.md). Home and the existing navigation entries and page layouts are retained. No customer or backend behavior changes; no schema or data migration.

## Maintenance

- `public/help-content.mjs` holds plain-text categories, titles, explanations and numbered steps. Update this alongside Studio feature changes. The How Do I…? index reuses task topics rather than keeping duplicate instructions.
- Review literal labels in `public/management.mjs`, payment/fulfillment labels in `public/orders.mjs`, the customer app, and the server before changing instructions. Inventory rules live in `selling.mjs`, `server/management.mjs` and the order reservation service; recurrence and cutoffs live in `server/pickup-calendar.mjs`.
- Keep the two deadlines distinct: the noon deadline to **order** is two calendar days before pickup; the deadline to **collect an accepted order** uses the recorded business-day policy. Preserve original commitments.
- Document production Cloudflare Access, never preview PIN/key workflows as production instructions. Do not include owner identities, credentials, payment account values or customer records.
- `public/help.mjs` renders semantic details/summary categories, plain-text DOM nodes, numbered lists, labelled search, polite result counts, empty results and Clear search. Search matches category/title/body/steps, case-insensitively, requiring every entered word. Search and expansion state survive background snapshots; focused help controls are preserved. No remote documentation service.
- Help styling is scoped to `.ms-help`. `management.mjs` adds the Settings entry and internal Settings/Help view only. No new main navigation item.

## Verification commands

From `website/`: `npm test`, `python tests/production_schema_guards.py`, `npx playwright test --config playwright.help.config.mjs`, `npm run test:phase3-browser`, `npm run test:production-browser`, `npm run test:commerce-browser`, `npm run check:production`.

All order/payment/content mutations in tests use disposable synthetic local fixtures. Production inspection is read-only. Emulated browser profiles are not physical-device certification.

## Release safeguards

Base: `a9691b9` (only deployment/preflight documentation follows the approved application source `143b719`). Confirmed active production version before development: `b18c3d75-f84d-4d8c-aad1-be5704c61552`, deployment `e1505cc7-5e99-4cb8-99ac-ce3a0f97e7e3`.

Production runtime and all server sources are unchanged. For this asset-only release, retain the exact downloaded, verified production Worker executable (`c07ccc2c07f034f8ae363e43e5835de28eea8d1e34a5255db155b5e31d783911`) and source map. Stage it with the complete matching asset set using supported Wrangler versions upload and the actual existing bindings/runtime/asset configuration. Do not deploy the preparation-only checked-in production config directly.

Before staging and activation, compare current deployment/configuration and read-only schema/all-table fingerprints against the private baseline. Preserve `checkoutEnabled=false`, `orderingPaused=true`, the D1 identity and every binding. No initialization, migration, seed, business mutation, Access policy, DNS, route or account change is part of this release. After activation verify assets, public pages/API, Access challenges, closed legacy APIs and the unchanged fingerprints/settings. Retain the prior version and its matching assets for a guarded application-only rollback; never restore D1 for an application rollback.

## Completed development validation

- Backend/security suite: **212 passed**, zero failures/skips on the final run.
- Production schema guards: **7 passed**.
- Help browser matrix: **10 passed** on the final run (desktop Chromium/WebKit, iPhone WebKit, Android Chromium, tablet Chromium). Covers Settings-only entry, return, all requested search terms, empty/clear, semantic keyboard expansion, focus, width, unchanged business state, and signed production-owner sessions including reload with checkout closed.
- Phase 3 regression matrix: **25 passed**.
- Production/browser regressions: **10 unique cases verified**; complete run had nine passes and one transient iPhone payment-choice assertion failure; its focused fresh rerun passed without an application change.
- Commerce/browser regressions: **8 passed**.
- Production build dry-run passed. No production dependency or server-source changes.
- Desktop and iPhone help screenshots were visually reviewed; CSS now correctly hides Clear search when the query is empty.

Early local attempts exposed restricted cache/log paths, a missing matching WebKit binary and overlapping fixed fixture ports. Cache/log paths and browser setup were repaired outside the application; Help uses its own fixture port and asserts login success. Final clean checks above supersede those attempts. No production mutation was used for testing. A real owner's authenticated live visual review and physical-device certification remain outside the automated checks.
