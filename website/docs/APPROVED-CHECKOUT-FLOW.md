# Final approved checkout flow

The customer reviews their basket, enters required name/email/phone, selects pickup, accepts the existing Sales, Cancellation & Pickup Policy including no-refund terms, and presses **Place Order**. No payment controls or payment method are included in the submission. The saved order starts unpaid with no selected method.

Only after a successful persistent save, **Order Received!** displays the order number, scheduled pickup/location, line items, total, and one choice each for PayPal, Venmo, Cash App and Cash at Pickup. External choices use the existing validated destinations and native new-tab/app handoff. Cash opens no external link. The same choices remain available through the private tracking capability. A failed choice save keeps the original order and offers retry; creating an order is never part of selection.

The existing bearer-authenticated payment-method endpoint uses optimistic ledger updates and retries. Repeating the same choice returns the existing version without another audit entry. Cash records `cash_pickup` / `awaiting_cash`; external choices record their method / `not_collected`. Neither produces a paid receipt, verified sale or paid timestamp. This approved four-choice flow makes Cash at Pickup available to guest orders after creation as well as member orders; the former pre-submission membership selection is gone. Existing Studio **Mark Cash Received** and independent external-payment verification remain unchanged. Verified, canceled, resolved and zero-due orders reject selection. Paid confirmation/tracking replace choices with **Paid** automatically.

Current required contact validation, owner authentication, transactional confirmations, private tracking, customer messages/cancellation, pickup approvals/deadlines/rescheduling, inventory, return credits and the November 9 no-refund policy are retained from the actual active production runtime. The release transform retains every unrelated server byte and the existing static asset binding. No database migration or production test records are needed.

## Verification and release record

Validation is performed with the exact candidate executable and isolated synthetic SQLite/local D1, products, owner identities, customers and payment destinations. Payment URLs in browser tests are intercepted; no money is sent. See `website/release/README.md` for the pinned active-production baseline and reproduction procedure.

- Seven exact-candidate API acceptance cases: all methods, manual owner confirmation, idempotent/concurrent retries, unavailable/invalid methods, private-link denial, unselected orders, activation guard, policy/contact validation, canceled/zero-due guards.
- Real local workerd/D1 smoke: all four methods, durable saves, repeated order submissions and idempotent selection.
- General retained-source regression suite: 243 passed, zero failed/skipped.
- Final browser matrix and deployment identifiers are recorded below after verification.

Live checkout must be disabled in the deployed release (`REAL_CHECKOUT_ENABLED=false`). Activation requires separate authorization. Preserve every other runtime setting, secret binding, D1 record/schema, configured payment destination, asset binding, Access policy and route/DNS configuration.

## Deployed result — November 9, 2026 (Eastern)

- Tested application source: `af1b9c1f9e9b3ee1392853992089dd8bf5da9ba0`.
- Production Worker version **52**: `0261b295-cab6-4022-8ec8-67e95157fd28`, 100% traffic.
- Deployment: `08dbd273-82cc-4cf3-bea7-90becf33231d`.
- Exact candidate executable SHA-256: `88c777dceb4902934a26ecccb7d0ae7589c332fd1bb815ea9797b610f5a4affc`. Downloaded staged bytes matched the tested candidate before deployment; the active deployment references that version.
- **30 final browser cases passed** across all five profiles, zero failed/skipped. Each provider completes order creation, post-save selection, private tracking/reload, unpaid status, owner confirmation and removal of payment controls. Additional cases cover leaving unpaid, failed-save retry, cancellation, and the original confirmation's automatic paid update. The heading is visible after submission and tested screens have no horizontal overflow or JavaScript errors.
- **7 exact-candidate API cases passed**, real local workerd/D1 four-method smoke passed, and **243 existing backend regressions passed**. No real provider payment was sent.
- Public 390px/1440px checks passed after deployment using GET/HEAD requests only. Required contact fields and no-refund acknowledgment remain; no pre-order payment controls appear, and **Place Order is disabled** with the verified public `checkoutEnabled=false` response.
- All three changed public modules match committed file hashes. Original production payment destinations and the published business document match exactly. Every row fingerprint across **18 application tables**, plus the complete schema, matches the pre-work baseline. All original bindings/secret names remain; only `REAL_CHECKOUT_ENABLED` changed from `true` to `false`. No production records, payment links, Access policies, DNS or routes were mutated by this task.
- Previous active version `0b940dd4-153f-4829-8725-4f989884341b` is retained. It had live checkout enabled: a rollback must preserve the disabled checkout state rather than blindly restoring its flags.
- [Draft PR #23](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/23) contains the implementation and release procedure; no branch was merged. The historical branch cannot safely replace the newer production runtime through an ordinary source deploy.

**Readiness:** the approved flow is tested and deployed, ready for separate owner authorization to activate. Checkout remains off. Private raw configuration, hashes, executable, logs and synthetic screenshot evidence are retained under `/workspace/checkout-flow-audit` and ignored `website/qa-results/post-order`; no production data or credentials are committed.
