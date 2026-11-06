# Checkout pickup cards

This fix is based on `9e2cf94` (`feature/studio-help-guide`), including the deployed Help Guide application release `70ee699`. The active production version before the fix was `acd326e8-79bb-4893-a703-90f5df273aaa`. Its executable SHA-256 is `c07ccc2c07f034f8ae363e43e5835de28eea8d1e34a5255db155b5e31d783911`; all 18 bundled repository modules match the checked-out source. The live `app.mjs` also matched the base exactly.

## Reproduction and limits

At inspection, the real `/api/site` reported `checkoutEnabled=false`, `document.orderingPaused=true` and `document.pickups=[]`. Replaying that exact response against the verified production application in a loopback-only browser reproduced a select containing only its placeholder and an unavailable Place preorder button. The old interface did not explain why no pickup could be chosen. This evidence establishes the launch/pause gates as the cause of the observed live checkout block; it does not establish a separate native Safari select defect.

The launch and pause settings remain unchanged. This release cannot make live orders available while those gates remain closed. It provides the new date-card interface and a clear pause/unavailable message. Successful checkout is verified using a disposable local production Worker fixture with synthetic identities, payments, products and SQLite data. No production order/payment or business edit is part of verification.

## Implementation

Only `public/app.mjs` and `public/style.css` change deployed application assets. Date buttons use the same server-returned calendar, capacity and existing browser eligibility predicates, including summed quantities for every product/variant in the basket. Only eligible dates render. The current selection is indicated by color, border, checkmark and `aria-pressed`; buttons are at least 56 CSS pixels tall and retain keyboard focus after selection. Later selected dates remain visible within the list after checkout redraws without moving the page. Date labels and ordering deadlines retain the existing Indiana timezone formatting.

The selected ID remains in the existing persisted basket, is retained across payment choices/reloads, and is included in the existing order payload. The first eligible date remains the default for the automatic calendar. Invalidated selections advance using the existing logic while retaining their retry ID. Tapping the already-selected date retains the same ID. Required customer fields and policy consent immediately update submission validity.

An in-flight guard survives rendering/background refreshes, blocks overlapping submissions and basket mutations, and leaves server idempotency intact. The backend remains authoritative for price, stock, production limits, closed/full/expired windows, daily capacity, mixed baskets, identity and checkout activation. No server, schema, dependency, deployment configuration, authentication, payment destination, scheduling rule or Help Guide source changes are included.

## Verification

Run from `website/`:

- `npm test`
- `python tests/production_schema_guards.py`
- `npx playwright test --config playwright.checkout.config.mjs`
- `npm run test:phase3-browser`
- `npm run test:production-browser`
- `npm run test:commerce-browser`
- `npx playwright test --config playwright.help.config.mjs`

The new checkout matrix covers desktop Chromium/WebKit, iPhone WebKit, Android Chromium and tablet Chromium. It exercises real taps, selected state, reload/payment persistence, name/email/policy validation, exact submitted pickup snapshots, repeated clicks and idempotent request replay, mixed-product capacities, quantity changes, live closures, empty availability, and unchanged production gates. Existing calendar tests cover noon, Indiana DST, special dates, overrides, full/expired rejection and existing-order protection. Existing browser selectors now use date buttons; commerce asserts policy-gated submission is disabled until acknowledgment.

WebKit profiles emulate Safari behavior; they are not physical iPhone certification. Initial test setup required the matching official Playwright WebKit binary. Initial new-test assertions were corrected to use the existing order-response contract and valid owner product payloads. A commerce assertion expecting an enabled button before policy acknowledgment was updated for the required validation behavior. The payment smoke test now observes the transient failed-choice alert from the start of the request, so popup focus/background refresh cannot erase it before the assertion. Payment application code is unchanged. Deployment requires all final relevant checks to pass.

## Production deployment safeguards

Reuse the exact active Worker executable and source map with the complete committed public asset set. Derive private staging configuration from the actual active version/settings; never deploy the preparation-only checked-in production configuration directly. Stage through Wrangler versions upload, inspect the candidate, and activate only after confirming the previous deployment is still current and every database fingerprint matches the baseline.

Verify identical script resources, all 16 bindings, runtime/asset routing/security handlers, public assets and Access challenges. Compare read-only schema and all 12 application-table fingerprints before staging, before activation and after release. Preserve activation, ordering pause, owner identities, payment destinations, existing D1, Access, DNS and routes. Retain the previous version with its matching assets for application-only rollback; never restore/reset the database for this UI release.

## Final predeployment results

- Backend/security: 212 passed, zero failures/skips.
- Production schema guards: 7 passed.
- Checkout cards: 15 passed across all five browser/device profiles, including later-date visibility.
- Pickup/selling regressions: 25 passed across all five profiles.
- Production authentication/payment journeys: 10 passed on desktop Chromium and iPhone WebKit.
- Commerce/payment settings: 8 passed on desktop Chromium and iPhone WebKit.
- Help Guide: 10 passed across all five profiles.
- Customer, member/passkey, orders, workspace access, Studio and website regressions: 34 passed on desktop Chromium and iPhone WebKit.
- Exact active-Worker versions-upload dry build: passed.
- Baseline live assets: 25 exact byte matches, 3 Access-protected files; 28 total. Nine public/security probes passed.
- Schema/all 12 application tables and production settings still match the private read-only baseline before staging.

Final automated runs have no unresolved failures. Test-generated historical screenshots were removed from the diff. Private configuration, fingerprints, screenshots and raw deployment metadata stay outside Git in `/workspace/checkout-private`.
