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
