# Cash at Pickup — verified production release

Deployed November 6, 2026. Cash at Pickup remains **OFF** and online ordering remains **paused**.

| Release item | Value |
| --- | --- |
| Branch | `feature/member-cash-at-pickup` |
| Tested/deployed source commit | `77a2ba468d99549c437c4e14e41d391aee4f1b83` |
| Approved production base | `0d5439b152c3aed69543c4e8d616ac79b68db414` (Studio pickup-history fix, including deployed checkout redesign and Roost credits) |
| Worker | `rise-roost-website-production` |
| Active Worker version, 100% traffic | `814a6962-eb45-42ba-aa3b-31cae7c2cdcf` |
| Deployment ID | `59e260ed-41ec-42a6-9b0b-c0906b85b9b3` |
| Retained previous Worker version | `9f903ae5-4eb4-4518-b0c2-75d9286b1388` |
| Active executable SHA-256 | `170baa0854b6f4ced43be587c5f31337e11d85ee53153502e7851c171c9888c4` |
| Database | Existing `rise-roost-production-db` |
| Database migrations / deployment data writes | None |
| Cash master setting | Absent, interpreted as OFF; never activated in production |
| Ordering gates | `REAL_CHECKOUT_ENABLED=false`, `orderingPaused=true`, unchanged |

The implementation and operator guide are in [CASH-AT-PICKUP.md](CASH-AT-PICKUP.md). This release report is documentation only and does not alter the deployed executable.

## Delivered and verified

1. Only signed-in, eligible Roost members can select or submit Cash at Pickup. The server derives the actual member from the existing authenticated session and refuses guest/forged identity submissions.
2. Danielle can enable/disable the persistent master switch in Settings → Payments → Cash at Pickup. Existing orders stay manageable when disabled.
3. The Roost member detail provides Allowed / Disabled cash privileges, restoration and optional owner-only notes. Membership, other payments, history and credit access remain intact.
4. One unresolved cash order per actual member is enforced in the existing atomic D1 ledger update, including simultaneous requests. Preparing, Ready and overdue remain unpaid. Paid, canceled and formally resolved orders release the restriction.
5. Mark Cash Received confirms the exact remaining amount and saves a normal verification, receipt, timestamp and owner audit. Concurrent or repeated confirmation cannot record a second payment. Customers cannot record receipt.
6. Close as Unpaid / Not Picked Up requires confirmation, a reason, a passed deadline and resolved communications/disputes. It records member history without a fee, charge, collection workflow or automatic privilege restriction. Existing cancellation and forfeiture inventory behavior is retained.
7. Partial return credit reserves through the existing ledger; receipt finalizes it once. Unpaid closure/cancellation releases reserved credit once. Credit-only orders follow the existing zero-balance process without outstanding cash. No competing credit system was introduced.
8. Guest checkout retains its existing enabled PayPal, Venmo and Cash App options, with an optional friendly Roost invitation. No registration is required. Provider links, QR generation, manual verification and return-credit functionality remain integrated.
9. The deployed checkout redesign is retained, adding a fourth card in a balanced two-by-two grid. Desktop columns, mobile stacking, summary, pickup information, acknowledgement, focus and submission protections remain. The newer Studio legacy-pickup-history fix is also retained.
10. Confirmation, tracking and private Roost history disclose Cash at Pickup and cash due. Cash orders enter normal preparation unpaid and have no payment-app redirect. Studio orders show cash method, balance, member/customer, pickup and statuses.
11. The existing Settings-only Studio Help Guide documents the actual implemented controls.
12. Production ordering is still paused and Cash at Pickup is still OFF. No real production order, account, payment or credit transaction was created for testing.

## Automated verification

| Suite | Distinct passing cases |
| --- | ---: |
| Backend/security/financial integrity, including 14 cash cases | 257 |
| Production schema guards | 7 |
| Checkout, member, passkeys, remembered sessions, favorites, credits, pickup, Studio navigation/Help/history browser matrix | 105 |
| Cash checkout, confirmation/tracking, member privileges, master switch and Studio receipt browser matrix | 10 |
| Production-style owner/payment/QR/login regressions | 10 |
| Commerce/payment-settings regressions | 8 |
| **Total** | **397** |

All five requested profiles are covered: desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. There are no unresolved failures or skipped cases. The initial broader run had two old keyboard-order assertions; the updated five-profile focus/layout rerun passes. The initial cash browser helpers used desktop-only Studio navigation and order selectors; the final mobile rerun passes after correcting those test helpers. The exact final executable also passes real local workerd/D1 smoke checks, including cash concurrency, member authentication, master/privilege settings, owner-only cash receipt and credit finalization. All automated mutations used disposable local data and synthetic owners/passkeys.

## Production preservation and read-only verification

Before coding, all 15 deployed server sources matched the approved base. The November 6 Roost release was followed by the checkout redesign and Studio history fix; both were incorporated through the latest approved branch. Remote source branches and the active production deployment were rechecked immediately before staging and again before activation; no newer development or release was overwritten.

The candidate retained every original binding, runtime/asset setting, fetch/scheduled handler and security header declaration. All original row fingerprints across 13 application tables, the complete schema and Cloudflare Access applications/policies match before and after deployment. The cash feature uses additive lazy JSON settings in the existing ledger; production required no migration, schema change, reseed or data write. Historical orders/accounts and legitimate ledger state are preserved.

The active downloaded executable matches the tested bytes exactly. The uploaded source map retains identical source contents, names and mappings; Wrangler normalizes upload-relative paths. Eleven publicly accessible application assets match the committed candidate; Studio and protected scripts/private API retain their original HTTP 302 Access challenge. Public document, revision, payment destinations/readiness, customer/commerce settings and disabled checkout remain unchanged. Database inspection confirms cash OFF and zero production orders.

GET/HEAD-only production browser verification passed for desktop and mobile populated baskets and the anonymous Roost page: no POST requests, JavaScript errors or horizontal overflow; cash remained hidden and the order action stayed disabled. Actual owner sessions were not borrowed. Real biometric-device prompts and external provider payments were not exercised.

Private baseline fingerprints, deployment receipts, exact bundles, logs and live screenshots remain outside Git under `/workspace/cash-audit`. Retain a cash/credit-compatible version after the feature starts being used; a code rollback must never restore D1 or erase legitimate customer activity.

## Files changed

The implementation changes these 22 files; this release report is the only additional file:

- `website/docs/CASH-AT-PICKUP.md`
- `website/docs/cash-at-pickup/desktop.png`
- `website/docs/cash-at-pickup/iphone.png`
- `website/playwright.cash-regression.config.mjs`
- `website/playwright.cash.config.mjs`
- `website/public/app.mjs`
- `website/public/customer.css`
- `website/public/customer.mjs`
- `website/public/help-content.mjs`
- `website/public/management.mjs`
- `website/public/orders.mjs`
- `website/public/tracking.mjs`
- `website/server/cash-pickup.mjs`
- `website/server/management.mjs`
- `website/server/roost.mjs`
- `website/server/service.mjs`
- `website/tests/browser/cash-pickup.spec.mjs`
- `website/tests/browser/checkout-pickup.spec.mjs`
- `website/tests/cash-pickup.test.mjs`
- `website/tests/member-checkout-fixture.mjs`
- `website/tests/production-launch-worker-smoke.mjs`
- `website/tests/return-credits.test.mjs`
