# Pickup week approvals and emergency rescheduling

Implementation branch: `feature/pickup-approvals-rescheduling`, based on the approved `feature/member-cash-at-pickup` commit `0e1e93fad3a1981cd8dae4572bc04375cfb9a9f5`. That base includes the current checkout redesign, Studio pickup-history correction, Roost accounts/credits and Cash at Pickup, including the plain-text cash label. The downloaded active Worker source map matched every original server source before implementation.

## Danielle's controls

The existing Calendar layout, recurring rules, editing controls and past/legacy history remain in place. **Review Upcoming Weeks** opens a separate Monday–Sunday approval list with date ranges, eligible dates, existing orders, review details, **Approve Week**, **Close Week** and **Reopen / Approve Week**. Closing a week warns about existing orders and never changes them. Date cards add **Show at Checkout: Yes / No**. Calendar and Home link to **Pickup Schedule Changes**. The Help Guide remains accessible only from Settings.

The compact **Upcoming Pickup Weeks** Home panel lists actionable approved weeks, the next unapproved week and currently bookable dates. It distinguishes the global checkout pause, approval needs, closed/no-eligible schedules, passed deadlines, and capacity/product restrictions. Approvals do not activate checkout. There are no reminder emails or push notifications.

A customer date must satisfy the existing schedule, deadlines, product and capacity rules plus an approved week and individual visibility. Both the published availability and order-creation quote enforce the extra controls on the server. Date visibility cannot bypass an unapproved week. Closing an original date through a schedule event is independent of recurring generation. Explicitly showing it again still requires its week's approval and all normal rules.

## Schedule changes and customer responses

1. Choose the original pickup date and **Preview affected orders**. Review order/customer counts, statuses, saved arrangements and communications/disputes requiring manual review. Only pending, preparing and ready unresolved orders are affected; terminal and unknown statuses are excluded.
2. Select an internal reason and **Set a Makeup Date** with valid future local times, or **Date To Be Announced**. The customer message defaults to neutral wording and can be edited without exposing the internal reason.
3. Review and explicitly confirm. The original date closes to new bookings. Orders receive a unique event/version and retain original snapshots, order numbers, secure tracking links, financial records and inventory reservations. Pending dates remain explicitly pending. Makeup appointments never enter the customer booking calendar automatically.
4. The event shows confirmations, requests for another arrangement, nonresponses and direct-contact needs. Studio order details expose the latest notice and earlier proposals/responses. Updating the proposal creates a new notice version, preserves earlier acknowledgements and requires a fresh response.

Members see notices on their Roost dashboard, affected orders and tracking. Guests use their existing secure tracking capability without registering. **The new pickup day works for me.** records acknowledgement; **I need a different arrangement.** flags owner attention without canceling/refunding. Viewing a notice does not acknowledge it. Member responses require the authenticated order owner; guest responses require the private tracking bearer. A stale notice version is rejected. Retrying an identical response is safe.

Production has no enabled, verified outbound email/SMS service. Notices are persisted in-app. The private Studio event contact list provides customer contact details, order references and copyable text. **Mark customer contacted** records Danielle's chosen method and timestamp. It never claims that an automatic email/text was delivered. Proposal updates mark the newer notice as needing contact again, retaining earlier contact history.

## Data, safety and initial transition

No SQL table/column migration, destructive operation, reseed or restore is required. Additive fields use the existing workspace JSON ledger:

- `pickupBooking`: explicitly approved/closed Monday week keys, per-date visibility, schedule-change date closures, and one-time transition receipt.
- `pickupChanges`: versioned schedule events, internal reason, public message, proposal history and private contact records.
- Order `pickupChange` and `pickupChangeHistory`: latest arrangement, original date, previous arrangements/acknowledgements and owner-delay protection.

Owner operations use the existing signed individual Cloudflare Access identity, same-origin protection, unique operation ID/fingerprint, audit history and optimistic workspace transaction. The event, date closure, all affected orders and audit are written together in one D1 compare-and-swap statement guarded by revision and ledger version. Stale reviews cannot omit newly arrived orders; a failed write rolls everything back. No duplicate email records are created. Storage limits continue to fail without deleting history.

Payments, receipts, manual verification, cash status, order totals/lines, credit balances/reservations and inventory reservations are preserved. Reservations stay associated with the original production date/ID. Rescheduling does not charge, refund, verify payment, deduct credit or release inventory. Owner-initiated changes block missed-pickup forfeiture, unpaid cash closure and expiration of reserved credits. Existing explicit cancellation/refund/credit-reversal workflows remain available.

Production inspection found **zero customer orders**, checkout disabled by `REAL_CHECKOUT_ENABLED=false`, and the separate persisted calendar pause toggle **false**. Both values must stay unchanged; “ordering paused” means checkout remains disabled, not that the calendar toggle is changed. Cash stays OFF and outbound order email stays disabled.

The one-time reviewed transition preserves only **November 9–15 and November 16–22, 2026**: November 11, 12, 13, 18, 19 and 20 under their existing rules/hours. Later weeks remain unapproved. `server/pickup-approval-transition.mjs` builds this conservative plan without mutating its inputs and refuses to run twice. Normal requests never invoke it or approve rolling weeks. The operator applies the metadata plus audit through a guarded additive ledger update, rechecking production deployment and complete row equality first. Saved pickup windows, custom hours, recurring settings, document revisions, business settings and orders are not rewritten.

Production enables `PICKUP_APPROVALS_REQUIRED=true`; a missing transition fails closed instead of exposing legacy rolling availability. Legacy isolated beta workspaces retain their previous behavior until deliberately transitioned. Do not remove this guard or deploy a pre-approval executable after Danielle starts using approvals. Retain an approval-compatible release for code rollback; never restore production D1 as a code rollback.

## Validation and evidence

All automated writes target disposable local SQLite or actual local workerd/D1 with synthetic owners, customers, passkeys and orders. Production verification is read-only except the authorized, additive one-time transition. No production orders, accounts, payments or notifications are created for testing.

The backend tests cover approvals/visibility, direct requests, closures/reopening, exact noon cutoff, Indiana week/year/DST boundaries, one-time transition, reminders, active/terminal order selection, pending and known makeup dates, payment/cash/credit/inventory preservation, private guest/member responses, stale versions, event/contact history, duplicate submissions, CAS conflicts and rollback. Existing scheduling, authentication, checkout, payment, credit, inventory and Help suites remain in place.

Browser evidence covers desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. The new workflows cover weekly approval, visibility, emergency review/confirmation, secure guest acknowledgement, pending makeup in Roost, revised notices, alternate arrangements and contact tracking. The exact production executable also runs under local workerd with real D1 and synthetic signed Access identities, including the missing-transition fail-closed check.

Screenshots reviewed: [iPhone schedule-change review](pickup-approvals/iphone-review.png) and [desktop customer notice](pickup-approvals/desktop-notice.png). Additional synthetic screenshots and private audit/deployment receipts remain under ignored `website/qa-results/pickup-approvals` and `/workspace/pickup-audit`.

Browser emulation does not certify physical biometric prompts or external payment applications. Production owner sessions were not borrowed. There is no outbound-delivery guarantee: Danielle records direct outreach herself.

## Completed automated checks

| Suite | Passing cases |
| --- | ---: |
| Backend/security/business rules, including 10 new pickup cases | 267 |
| Production schema safety guards | 7 |
| Broad checkout, pickup, passkey, credit, inventory, calendar, Studio and Help browser matrix | 105 |
| New approval/rescheduling, guest/member response and contact browser matrix | 10 |
| Cash at Pickup browser matrix | 10 |
| Production owner Access/payment/checkout browser cases | 10 |
| Commerce and payment-settings browser cases | 8 |
| **Total** | **417** |

The exact final Worker additionally passes actual local workerd/D1 checks for existing passkeys/sessions, payment verification, inventory concurrency, credits/cash, pickup approval enforcement, pending/makeup proposals, member acknowledgement, retained history and missing-transition fail-closed behavior. No hosted writes are used in those tests. All five requested browser/layout profiles pass; there are no unresolved test failures or skipped cases. Early test runs exposed a missing browser bundle and test-helper navigation/checkout-field assumptions; the corrected runs pass.

## Files changed

- `website/docs/PICKUP-APPROVALS-RESCHEDULING.md`
- `website/docs/pickup-approvals/desktop-notice.png`
- `website/docs/pickup-approvals/iphone-review.png`
- `website/playwright.pickup-approvals.config.mjs`
- `website/public/commerce.mjs`
- `website/public/customer.mjs`
- `website/public/help-content.mjs`
- `website/public/management.css`
- `website/public/management.mjs`
- `website/public/pickup-notice.mjs`
- `website/public/style.css`
- `website/public/tracking.mjs`
- `website/server/management.mjs`
- `website/server/orders.mjs`
- `website/server/pickup-approval-transition.mjs`
- `website/server/pickup-booking.mjs`
- `website/server/pickup-changes.mjs`
- `website/server/production-runtime.mjs`
- `website/server/roost.mjs`
- `website/server/service.mjs`
- `website/tests/browser/pickup-approvals.spec.mjs`
- `website/tests/member-checkout-fixture.mjs`
- `website/tests/pickup-approvals.test.mjs`
- `website/tests/production-launch-worker-smoke.mjs`
- `website/wrangler.production.toml`
