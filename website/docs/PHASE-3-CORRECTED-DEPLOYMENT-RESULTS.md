# Phase 3 corrected production deployment results

November 5, 2026 — America/New_York.

**SUCCESS: the corrected Phase 3 release is active at 100% traffic and live read-only verification passes. Checkout remains disabled and ordering remains paused. No production D1 records were modified.**

This is a new deployment report. `PHASE-3-DEPLOYMENT-RESULTS.md` remains unchanged and records the earlier failed attempt and rollback.

## Exact deployed release

| Item | Verified value |
| --- | --- |
| Source commit | **`143b719ad03847fa7111eefe442a382fcf32bebf`** |
| Branch / repository | `feature/phase-3-website-studio`, `joshuamaziarz1-ux/rise-and-roost-register` — corrected source pushed before staging |
| Active Worker version | **`b18c3d75-f84d-4d8c-aad1-be5704c61552`** |
| Deployment ID | **`e1505cc7-5e99-4cb8-99ac-ce3a0f97e7e3`** |
| Traffic | **100%** |
| Worker | `rise-roost-website-production` |
| Website / Studio | https://rise-and-roost.com / https://rise-and-roost.com/studio |
| Retained rollback version | `5bf5f229-8f34-4935-8699-4c6a6d78d055` — Phase 2 and its versioned assets |
| Database | Existing `rise-roost-production-db`, ID `889a4b96-cabd-43d1-ad45-79f65b0052b0`, unchanged |

The new release is not the old failed Phase 3 candidate `a8aab028-139b-4040-b187-353dff8fa4f0`.

## New source and pre-activation calendar verification

Git history and the commit diff confirm the six corrected source/test files:

- `website/server/pickup-calendar.mjs`
- `website/server/management.mjs`
- `website/public/model.mjs`
- `website/public/management.mjs`
- `website/tests/pickup-calendar.test.mjs`
- `website/tests/fixtures/legacy-pickup-calendar.json`

The corrected commit was checked out in a separate frozen worktree and built there. Every public asset matched that Git commit, and all **18 embedded application modules** in the build source map matched the frozen source.

Fresh read-only production snapshots were obtained before staging and immediately before activation. Both were tested with the corrected frozen calendar implementation, without changing the document's ordering pause or writing records:

- Thursday, November 5, 2026, **6 PM Indiana time → Wednesday, November 11**.
- Both unmarked legacy Tuesday windows are excluded from customer ordering and remain unchanged in the owner/history projection.
- **26 upcoming eligible regular windows**, spanning November 11, 2026 through January 7, 2027, provide at least eight weeks ahead.
- Wednesday/Thursday/Friday deadlines remain Monday/Tuesday/Wednesday at **12:00 PM America/Indiana/Indianapolis**, two calendar days before pickup. Exact noon and later are ineligible; no next-day exception is introduced.
- Stored pickup records and order snapshots remain unchanged. Named events and explicit `special: true` dates retain special-pickup behavior, with the same strict notice requirement. New Studio-created special dates are explicitly marked, including unnamed dates.

The same logic is in the deployed Worker whose downloaded bytes were verified. The public API correctly returns no selectable pickups while ordering is paused. No production order or payment was submitted to test the calendar.

## Fresh test results

| Check from the corrected frozen source | Result |
| --- | --- |
| Complete backend suite | **210 passed; zero failures or skips** |
| Phase 3 browser matrix | **25 passed; zero failures**, across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium |
| Production Worker dry build | Passed |
| Actual local production Worker/D1 smoke | Passed: closed production guard, signed individual owner identity, generated pickup reservations/concurrency, calendar closure preserving orders, independent payment verification and fulfillment |
| Actual production calendar compatibility projection | Passed twice before activation; Thursday-evening result is Wednesday, not Tuesday |

Coverage includes the sanitized legacy Tue/Fri calendar, direct rejection of legacy Tuesday reservations, unchanged owner/history records, named and unnamed special dates, cutoff boundaries, DST, week/month/year rollover, multiple preorder products, stock/production limits, concurrency, idempotent retries, automatic audits, hiding/history and all three selling methods.

## Worker and static assets deployed together

The supported `wrangler versions upload` workflow staged a new **inactive** candidate and its complete matching asset set. It uploaded **two changed assets** and reused **24 already stored assets** by content hash. Reusing unchanged content-addressed assets did not reuse the old failed release's changed calendar modules: the new `model.mjs` and `management.mjs` were included, alongside the correct Phase 3 `app.mjs`, CSS and `selling.mjs`.

Candidate inspection verified all 16 bindings/values, D1 identity, compatibility/runtime settings, asset routing, fetch/scheduled handlers and named security handlers against the actual retained production configuration. Downloaded stored Worker bytes match the newly built artifact exactly.

| Artifact | SHA-256 |
| --- | --- |
| Deployed Worker JavaScript | `c07ccc2c07f034f8ae363e43e5835de28eea8d1e34a5255db155b5e31d783911` |
| Local build source map | `4c4684eeccd2daeb37ecdfd281ecb1e0a2ea2948b171943acb27bf9144676df9` |
| Cloudflare-stored source map | `539d96211743c298b8333bdfc6c33b92138bcf0e57845af9de84b4e30bc9737f` |

Wrangler rewrote only the source map's `file` and `sources` path labels during upload. All embedded source contents, mappings and remaining fields match. The executable Worker JavaScript did not change.

[Machine-readable deployment evidence and complete 26-asset hash manifest](phase3/corrected-deployment-verification.json) accompany this report.

Immediately before activation, the active version was freshly checked as the expected Phase 2 version at 100%. Security/configuration drift checks and both fresh test suites passed. Only then was the corrected candidate activated at 100%.

## Live verification and all seven Phase 3 improvements

Real Chromium rendered **Home, Shop and Basket** successfully and reported **zero JavaScript page errors**. Fresh at The Roost! was present on Home and Shop. Public branding and layout use the matching frozen assets; no redesign was made.

Live asset verification confirms:

- **22 public assets match byte-for-byte**, including the corrected JavaScript, Phase 3 CSS and `selling.mjs`.
- `index.html` uses Cloudflare's normal canonical redirect to `/`; the served HTML matches the source after excluding Cloudflare's managed analytics-beacon injection.
- `studio-pin.mjs`, `studio.mjs` and `studio.webmanifest` remain challenged by the existing Cloudflare Access policy. Their hashes were verified in the complete staged Git manifest; anonymous verification did not bypass Access to retrieve them.

| Phase 3 improvement | Verification |
| --- | --- |
| Online Ordering, Preorder, In-Store Only | Exact deployed source plus passing backend/browser selling-method and stock/capacity tests |
| Fresh at The Roost! | Present on live Home and Shop; announcement and multiple in-store product tests pass locally |
| Simplified inventory | Correct deployed Studio source and passing method-specific quantity controls/tests |
| Fully automatic calendar | Actual production-document compatibility gate passes; legacy windows remain history-only; recurring dates/cutoffs, exceptions and capacities tested |
| Automatic adjustment audits | Correct deployed source and passing automatic before/after/actor/time audit tests |
| Hide/Show Product with history | Correct deployed source and passing visibility/history/order-snapshot tests |
| Sold-out products stay visible | Correct deployed source and passing zero-stock/restocking/production-capacity browser tests |

Owner mutations were not exercised against production. These features are verified through the exact deployed code, local synthetic regression coverage and applicable read-only live checks, without changing business records.

## Security, configuration and D1 preservation

Final live checks:

- Home, Shop, Basket and `/api/site`: **200**.
- HSTS, CSP, Referrer-Policy, X-Content-Type-Options (`nosniff`) and Permissions-Policy: present on public pages/API.
- HTTP → HTTPS: **308**, retaining path/query. Existing www HTTPS-then-canonical behavior is preserved.
- Anonymous `/studio` and `/studio/api/manage/snapshot`: **302 Cloudflare Access challenges**.
- Unprotected legacy `/api/manage/snapshot` and `/api/studio`: **404**.
- `/.well-known/security.txt`: uncached plain-text **404**, preserving Phase 1 behavior.
- Public API: **`checkoutEnabled=false`, `orderingPaused=true`, no selectable pickups**.

Fresh comparisons confirm unchanged bindings/values, both owner identities, Access audience/application/policies and **730-hour session compatibility**, Worker runtime/compatibility and asset routing, domains/DNS/routes, TLS, Always Use HTTPS and workers.dev/preview settings. Only expected release version/deployment annotations changed. Phase 1/2 authentication and transport modules were not modified by the fix and are covered by the backend regression suite.

Read-only fingerprints of the **schema and all 12 application tables are identical** before staging, before activation and after deployment/live verification. All fingerprint queries reported zero rows written. No concurrent owner edits were observed. Existing products, inventory, prices, payment settings, orders, original pickup commitments and historical records are preserved.

There were no migrations, initialization scripts, resets, reseeds, deletes, D1 restores, production test orders, production payments or business-data writes. Owner configuration and private row/fingerprint evidence remain outside Git under `/workspace/phase3-corrected-private`.

## Final status, rollback and remaining manual verification

**The corrected Phase 3 release remains live at 100%; no rollback was needed for this release.** There are no unresolved automated-check failures or deployment blockers.

Phase 2 version `5bf5f229-8f34-4935-8699-4c6a6d78d055` remains retained for an application rollback. A guarded rollback payload is prepared privately. Cloudflare's [version model retains Worker code, static assets, bindings and compatibility together](https://developers.cloudflare.com/workers/versions-and-deployments/); the earlier rollback verified restoration of Phase 2's matching live asset hashes. Any future rollback must recheck configuration/traffic drift, deploy that retained version and its matching assets, preserve the current database, and keep checkout disabled/ordering paused. Never restore D1 to roll back application code.

Danielle's owner-authenticated visual check of the new Studio controls and physical-device signoff remain manual. Existing owner authentication is preserved; no owner login code or token was requested. Production business edits and enabling checkout were outside this release authorization and were not performed.
