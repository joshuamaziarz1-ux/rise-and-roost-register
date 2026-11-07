# Free order confirmations and optional receipt email

Username/password login remains active and does not require email or phone. This change adds Save Confirmation, Print / Save as PDF and Copy Order Link to the initial order confirmation and the private tracking page. It preserves guest orders and My Orders. Checkout is not activated by this release.

## Customer experience

A saved UTF-8 text confirmation contains the order number, order/items/amount, payment status, pickup information, private tracking link and snapshot timestamp. The print button opens the browser's print/PDF dialog with a confirmation-only layout. It explicitly says an order confirmation does not itself confirm payment. The original separately verified paid-receipt print behavior remains available. No paid PDF service, external file service or customer account is needed for these controls. Keep the downloaded/printed private link safe; anyone holding it can open that order page.

The download respects native browser downloads rather than being intercepted by the SPA router. Link construction rejects external URLs, absent/invalid capabilities and a mismatching order ID. The saved document omits email, internal notes, provider credentials and other private account details. Guest customers can reopen their saved private link on another browser without creating an account. Signed-in orders remain accessible under My Orders.

Checkout uses the existing optional contact email field, with an explicit, unchecked email-receipt/update opt-in only when sending is genuinely configured. A second competing email field is not shown for the customer experience. An optional email is not an account identifier, login credential, password-reset address or proof of account ownership. No marketing is enabled. When email is off, customers are told to save their on-screen order number/private link. The confirmation does not falsely claim that an email was sent.

## Email integration and free-plan controls

The existing Resend outbox has been made production-ready: production APIs expose actual readiness, successful production mutations schedule the drain, and real-format transactional messages include the order number, items, amount, pickup and private status link. Production templates no longer describe orders as beta/test orders. The payment-verification step stays independent of receipt submission; provider acceptance is never labeled inbox delivery.

Sending requires all of:

- `ORDER_EMAIL_ENABLED=true`.
- `ORDER_EMAIL_FREE_PLAN_CONFIRMED=true` after the owner verifies a Free account with paid upgrades/overages disabled.
- `ORDER_EMAIL_DELIVERY_VERIFIED=true` after authorized domain/account/sender and controlled delivery checks.
- Secure `RESEND_API_KEY`, a verified `ORDER_EMAIL_FROM` sender and the correct public workspace.

The site enforces an atomic D1 budget of 90 provider API attempts per UTC day and 2,700 attempts in any rolling 31-day window. Retries and uncertain timeouts consume budget conservatively, so the application's own usage stops below the advertised 100/day and 3,000/month free allowance. These limits do not measure unrelated applications using the same provider account; the account must remain on its provider-enforced free plan. No code upgrades the plan or authorizes billing. A quota pause makes no provider call and directs customers to save/use their order page. Old queued events expire after 23 hours rather than sending stale confirmations much later.

Outbox leases and ledger compare-and-swap prevent concurrent submissions. A complete payload is frozen before first provider submission so payment/pickup edits cannot change an idempotent retry's body. Accepted/permanently failed/expired payload snapshots are removed to limit storage. Existing Resend idempotency keys remain stable. Provider errors are not printed to customer pages or logs; private emails and capabilities are not logged by this change.

No email is sent without explicit checkout consent, and provider errors or quota exhaustion cannot remove a successfully stored order. Automated tests use mocks only. No real customer email, SMS or production test order was sent/created.

## Cloudflare's free email option

Cloudflare's Email Routing forwards incoming email for free. Sending transactional receipts to arbitrary customers requires Workers Paid. Current documentation lists 3,000 outbound emails included per account/billing cycle, followed by usage charges: https://developers.cloudflare.com/email-service/platform/pricing/ . An account already on Workers Paid may be able to use that included allowance without a new subscription, but account-wide usage and a strict stop policy must be verified first. Free sending to verified account destination addresses is not a general customer-receipt service.

The connected Cloudflare credential can manage the website but `/accounts/{id}/subscriptions` returned HTTP 403, so the account's paid/free subscription could not be verified. `default_usage_model=standard` does not establish subscription status. No billing, plan, DNS, mailbox, Email Routing or Email Sending setting was changed. Native Cloudflare sending was not enabled or falsely advertised as free customer mail.

The delivery integration in this release uses the previously existing Resend adapter. A free Resend account is not yet connected. We can reconsider native Cloudflare delivery if the owner confirms an existing eligible plan; this release does not add an unverified native mail binding or automatically enroll a paid plan.

## Remaining owner setup before email activation

If Cloudflare Workers is Free (or paid-plan eligibility remains unknown), the no-upgrade option is a free transactional sender account:

1. Create the Resend **Free** account at https://resend.com/signup . Do not select a paid plan, add paid upgrades, or enable paid overages. Check its current quota/settings at https://resend.com/pricing .
2. Verify the existing Rise & Roost sending domain using the exact SPF/DKIM records supplied by the provider. Do not replace existing incoming-mail MX records or invent DNS record values. An existing domain can be verified without buying another domain or mailbox.
3. Store a sending API key as the production Worker secret `RESEND_API_KEY` through secure Cloudflare configuration, not in chat or git. Set `ORDER_EMAIL_FROM` to an approved sender on the verified domain.
4. Confirm the Free plan, sender/domain status and intended delivery recipient. Perform an explicitly authorized controlled real delivery check; automated/deployment tests must continue using synthetic identities and mock delivery. Provider acceptance alone is not proof of inbox arrival.
5. Only then enable the three readiness flags above in a freshly reviewed production version. Ensure the existing scheduled handler has an approved retry trigger (for example every five minutes) before claiming automatic retries work without later site mutations. The inactive release does not add or change cron schedules.

If the owner already has Workers Paid, inspect its Email Sending eligibility, included usage, verified sending domain and allowance controls first. Do not upgrade the account to obtain email. No real delivery can be claimed until those steps are complete.

## Deployment scope

Dedicated branch: `feature/order-confirmations-free`, based on the approved active username/password release. Original settings, secret bindings, runtime/asset behavior and Studio Access must be retained. `ORDER_EMAIL_ENABLED` remains false; this candidate adds explicit false free-plan/delivery flags. No database migration or production data update is required. The existing `limits` table is used only when the mail sender is enabled. Checkout, Cash at Pickup, credits and pickup/payment policies remain unchanged.

Tests cover confirmation content/private links, atomic daily/rolling limits, opt-in/readiness, provider errors, unchanged retry payloads, printable payment distinctions, reopening guest tracking, actual downloads, print/PDF layout dispatch, production routing/background drain and existing customer/checkout flows. Physical printers and real inbox delivery are not claimed tested. Candidate screenshots use isolated synthetic local orders, not production customer records.
