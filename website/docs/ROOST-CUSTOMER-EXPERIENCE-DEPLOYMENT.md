# The Roost customer experience — production deployment

Deployed November 06, 2026 at 08:41 AM EST. The production Worker serves 100% of traffic from the tested version below.

| Release item | Value |
| --- | --- |
| Development branch | `feature/roost-customer-experience` |
| Tested and deployed source commit | `7e28b32b14fe06ccbd0d755a37dca33096a4185f` |
| Approved base | Customer-login deployment report `7e41464`; deployed application `42d2b4aa52bb8bde7a604779ed3f10712d0d5ea5` |
| Worker | `rise-roost-website-production` |
| Active Worker version | `bfd42207-f4c8-476c-b13c-9c0a0d617373` |
| Deployment ID | `029f09ce-6847-4ed3-8616-658f5d1c91d5` |
| Compiled executable SHA-256 | `7207f528e8f931490e6c5da922a383fb4a543cd6a499840b9e148163ce44f4db` |
| Retained previous version | `fe73af43-c04b-4611-ab5c-03746d4a4fad` |
| Production database | Existing `rise-roost-production-db` |
| Database migrations | **None.** No schema or production business-record mutation. |
| Ordering / checkout | Preserved: `orderingPaused=true`, `REAL_CHECKOUT_ENABLED=false` |
| Return program at deployment | **Paused**, pending Danielle's legal/accounting review and deliberate activation; no default return items or dollar amounts |

This report is a documentation-only follow-up. It does not change the deployed application bytes.

## Delivered behavior

The Roost now has a personal, preferred-name welcome, upcoming pickup, the existing Studio-managed Fresh at The Roost! announcement, available/reserved return-credit balance, private order history, current-product reorder links and private favorites. Current product prices, variants, inventory and pickup checks still apply. Existing passkeys, recovery keys, rolling remembered sessions and logout/device behavior remain integrated; no competing authentication system was created.

Danielle can add and edit return items and dollar values, disable or retire them, view inactive/retired items and reactivate them through **Studio → The Roost → Return Credits**. There are no assumed bottle/jar values and no automatic egg-carton eligibility. Historical returns snapshot the accepted quantities, names and values. Item changes never recalculate old credits. She can search actual accounts, review multi-item returns and confirm an award, inspect balances/history, and make reasoned corrections or one-time referenced reversals. Reserved credit cannot be spent by a correction or produce a negative balance. The existing Settings-only Help Guide explains these controls.

Customers can view My Return Credits and What Can I Return? after signing in. Once Danielle activates the return program, active item settings supply the displayed values. Customers cannot issue their own credits or access another account's money, orders or favorites.

Member checkout supports partial credit, full available credit and credit-only orders. Credit and inventory reservations commit atomically with the order, retries cannot spend twice, and mixed-payment credit finalizes after Danielle independently verifies the remaining external amount. Credit-only orders need no payment-app step. Cancellation releases reserved or restores used credit once. Expired/abandoned reservations remain held until owner review and cancellation; they never silently disappear. Reopening checks available credit and inventory again, and cannot reuse a refunded external payment. PayPal, Venmo, Cash App and manual verification are preserved. Guest checkout remains supported without an account; production ordering has not been opened.

## Final automated verification

| Suite | Passed |
| --- | ---: |
| Backend / security / monetary integrity | 243 |
| Production schema guards | 7 |
| New return-credit / favorites browser matrix | 10 |
| Customer / remembered-login browser matrix | 30 |
| Pickup / selling / inventory browser matrix | 25 |
| Production owner / payment browser regressions | 10 |
| Commerce / payment-settings browser regressions | 8 |
| Studio navigation / Help Guide browser matrix | 15 |
| Legacy preview Access/PIN browser regressions | 30 |
| **Total** | **378** |

The final focused runs have zero unresolved failures or skips. The initial broader GitHub run passed 185 of 200 browser cases; its 15 failures were outdated preview Studio URL expectations from before the approved Home/Back navigation. A test-only follow-up aligns those expectations with `/studio#Home`. All 30 preview Access/PIN cases passed across the five profiles after correction; three local startup failures from an interrupted fixture were resolved by a clean Chromium rerun. The deployed application files did not change. Desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium are covered. The exact prebuilt executable additionally passed actual local workerd/D1 tests for customer authentication/recovery/devices, owner authorization, guest checkout, payment verification, inventory concurrency, favorites, credit reservation/finalization/cancellation and credit-only checkout. New backend tests include adversarial amounts/quantities, multi-item returns, idempotency, concurrent spending and adjustments, failed commits, ownership isolation, reversals and expired reservations.

Earlier browser runs identified a shared local fixture port and geometry checks reading a replaced header. The new fixture uses a unique port, startup validates the responding database identity, and geometry assertions read one polled DOM snapshot. Final affected suites passed. Signing software authenticators exercise real server verification in Linux WebKit; physical-device biometric prompts are not certified by emulation.

## Production verification and preservation

Before development, all 14 deployed server sources matched the approved customer-login base through its source map. Newer repository branches and production deployments were rechecked before staging and activation. Help, navigation, pickup selection and customer login were retained.

The release staged the exact tested prebuilt executable and current assets using a private configuration copied from every actual production binding and runtime/asset setting. Candidate bindings, runtime settings and exported handlers matched the previous version. The downloaded active executable matches the tested bytes exactly; all 15 current server source-map contents match. Eleven publicly readable HTML/JS/CSS assets match the committed files byte-for-byte. Studio's protected resources and management API still challenge through the original Cloudflare Access application; unprotected legacy Studio APIs remain closed. No real owner session was borrowed.

Read-only audits before development, before staging, immediately before activation and after deployment matched **every original row fingerprint across all 13 application tables**, plus the complete original schema. Cloudflare Access application/policy fingerprints and all runtime bindings remain identical. Customer accounts, credentials, sessions, order/history storage, products, inventory, payment settings, pickup calendar, comments and content are preserved. No reset, reseed, truncate, restore or migration was used. The original ledger had no monetary benefit entries requiring migration; no duplicate opening balance was created.

Live public Roost, Shop and Basket return successfully, anonymous Roost requests disclose no private member information, and public checkout data still reports disabled checkout and paused ordering. Read-only desktop and mobile Chromium rendering of Roost, Shop and Basket passed with zero JavaScript errors; screenshots remain in the private audit directory. No production test accounts, orders, payments or credit transactions were created. DNS, routes, Access login/policies, payment destinations and scheduled triggers were not changed.

## Activation and limits

The complete program remains paused until Danielle reviews applicable store-credit classification, gift-certificate/store-credit rules, unclaimed property, tax treatment and liability/accounting with her adviser, then confirms Review program settings. The software cannot establish those business/legal facts. No expiration, cash redemption, transfer or tax policy was invented. This review does not activate production checkout.

The current workspace ledger has a 1.2 MB safety limit and 2,000 owner-operation limit. It rejects further work before exceeding limits; durable history is never pruned. Arrange storage expansion before reaching them. Existing full-database backup/recovery preserves original monetary ownership. Contact-only business-copy imports refuse monetary histories instead of assigning money to newly generated account identities.

Rollback, if needed after checking for newer releases, must shift traffic to the retained previous version and matching assets. Leave D1 and legitimate customer actions intact; never restore a database for a code rollback. The retained customer-login version is suitable only for an immediate rollback before any monetary events exist. After the program is used, keep ordering and credits paused during repair and use a version that supports the credit lifecycle or a forward fix; the older version cannot finalize or release reservations. No rollback was needed.

## Files changed

The implementation commit changes these 24 files; this deployment report is the sole additional documentation file:

- `website/docs/ROOST-RETURN-CREDITS.md`
- `website/playwright.return-credits.config.mjs`
- `website/public/app.mjs`
- `website/public/credit-money.mjs`
- `website/public/customer.css`
- `website/public/customer.mjs`
- `website/public/help-content.mjs`
- `website/public/management.mjs`
- `website/public/tracking.mjs`
- `website/server/management-backup.mjs`
- `website/server/management.mjs`
- `website/server/orders.mjs`
- `website/server/production-runtime.mjs`
- `website/server/return-credits.mjs`
- `website/server/roost.mjs`
- `website/server/service.mjs`
- `website/tests/browser/customer.spec.mjs`
- `website/tests/browser/navigation.spec.mjs`
- `website/tests/browser/return-credits.spec.mjs`
- `website/tests/browser/roost-login.spec.mjs`
- `website/tests/experience-browser/journeys.spec.mjs`
- `website/tests/primary-fixture.mjs`
- `website/tests/production-launch-worker-smoke.mjs`
- `website/tests/return-credits.test.mjs`

The test-only follow-up also updates `website/tests/browser/preview-cloudflare.spec.mjs` and `website/tests/browser/studio-pin.spec.mjs`. The complete change spans 27 files, including this report.

See [implementation and operator details](ROOST-RETURN-CREDITS.md). Private configuration, fingerprints, receipts, raw test logs and screenshots remain outside Git under `/workspace/roost-experience-audit`.
