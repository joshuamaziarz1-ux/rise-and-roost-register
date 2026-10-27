# Beta customer order tracking and notifications

The isolated beta now has customer status pages, manual independent payment verification, paid beta receipts, and separate preparation/pickup controls. This feature never charges a customer, calls Square or Supabase, changes Register/Admin, connects a custom domain, or changes the approved farmhouse design.

## Danielle and customer walkthrough

1. Open [the website](https://rise-roost-beta.joshua-maziarz1.workers.dev/) and place a beta preorder. The confirmation has a unique `RR-…` order number and **Track your order** link.
2. Save the entire private link, including `#access=…`. Open it on another computer or phone: no account or Studio key is needed. The order number alone never grants access. Losing this link requires contacting Danielle; there is no public order lookup or list.
3. On the status page, **I've Sent Payment** immediately reports the payment after D1 accepts the update. The acknowledgment explicitly says it is awaiting independent verification and has not been accepted or processed by the website. It creates no paid receipt and starts no preparation. Duplicate clicks/retries do not create duplicate events.
4. Danielle opens [the existing owner Studio](https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae), signs in with her existing private key, selects **Orders**, and uses **Refresh orders**. Do not create another private demo to manage main-site orders.
5. Expand **Verify payment against independent records**. Check the actual independent bank, cash, or external payment record for the full order total. Select the record type, enter a private reference without bank/card details, confirm the checkbox, and select **Record independently verified payment**. A customer's report by itself is not sufficient. This is manual verification by Danielle, not automated verification by Square or the email service.
6. The customer's page updates automatically within five seconds. It shows **Payment Verified** and a stored, timestamped **BETA · PAID RECEIPT** with immutable item prices, total, merchant details, and a print/save-PDF control. The receipt clearly says this website did not process the payment. Private verification references never appear on the customer page or email.
7. Set **Fulfillment status → Preparing Your Order** only when preparation actually begins. Set **Ready for Pickup** when ready, and **Picked Up** after collection. These changes save directly to D1; no website publish or redeployment is required. They do not change payment status. Marking ready directly never invents an earlier preparation timestamp.
8. New orders have tracking automatically. Existing saved orders are retained unchanged; **Create customer tracking link** enables a link on an old order without rewriting its products, prices, pickup, or history. Canceling releases availability; it does not issue or claim a refund. Completed/canceled orders cannot be reopened.

The page records these stages separately: Order Received, Payment Reported, Payment Verified, Preparing Your Order, Ready for Pickup, Picked Up. Unrecorded stages stay unrecorded. The last successful check time is visible; refresh failures leave the last known status with an error instead of inventing a successful update.

## Optional email — currently off

There are no email-service credentials in the beta environment. `ORDER_EMAIL_ENABLED="false"` is deployed intentionally. Checkout explains that email is not connected, leaves the email controls disabled, and always offers the working private status page. No email is sent or claimed to be sent.

Resend support is implemented for four explicitly opted-in transactional events: order receipt, independently verified payment, entering preparation, and pickup readiness. Only the configured primary workspace can collect an email address and enqueue notifications. Private test workspaces cannot enable sending, claim the root site, or send messages through an operator's account.

To enable this later, the exact required configuration is:

1. Use an existing Resend account or create one. Choose a sender **already verified with Resend**. This task does not change `rise-and-roost.com`, DNS, or any other custom-domain settings. If no verified sender exists, that separate provider verification is still required; Resend's trial sender has recipient restrictions and is not suitable for arbitrary customer emails.
2. Create a **Sending access** API key restricted to that sender's domain, dedicated to this beta. Store it as the **`RESEND_API_KEY` secret on the `rise-roost-beta` Worker only** (Cloudflare Dashboard → Workers & Pages → rise-roost-beta → Settings → Variables and Secrets). Never paste it into chat or commit it. No Register/Square/Supabase key is needed.
3. Configure the non-secret **`ORDER_EMAIL_FROM`** variable as the verified plain email address and change **`ORDER_EMAIL_ENABLED`** to `"true"` for this beta only. Preserve the existing DB/ASSETS/PUBLIC_WORKSPACE_ID bindings. Keep the sender in the deployment configuration as well so a later deployment retains it; keep its key solely in secret storage. Provider requests go only to `https://api.resend.com/emails`. The operator environment may need `api.resend.com` allowed for a controlled setup check; Worker egress uses Cloudflare.
4. Place one consented synthetic order with an address you control. Check provider acceptance in Studio/the customer's status page, then inspect the actual recipient inbox/spam folder. Exercise all four events and review the provider dashboard before opening optional email to customers. Do not interpret provider acceptance as delivery.

Email entries are committed in the same D1 ledger compare-and-swap as the order transition. Requests drain the outbox in the background; a five-minute beta Worker cron handles retries after interrupted requests. A short claim lease and stable provider idempotency key protect concurrent Workers and ambiguous timeouts. Retries stop before the provider's 24-hour idempotency window expires. HTTP errors/timeouts/missing acceptance IDs never produce a success claim. Permanent configuration errors remain visible as failed submissions; diagnose them in the email provider before attempting any manual resend. Automatic retries cover transient errors; failed/expired entries are not silently replayed.

The interface says **Email service accepted the message; delivery is not confirmed** only after Resend returns a successful response with its acceptance ID. There is no delivery webhook or delivered-state claim. Status pages work regardless of email availability. Email sending and real inbox delivery have not been tested against a live provider because none is configured.

## Security and preservation

- Tracking uses a new independent random 192-bit capability per order, carried in the URL fragment and sent only as an Authorization header. It is never a Studio key. Missing/wrong capabilities cannot read orders; the number alone is insufficient. Keep the link private: its holder can view this order and report payment, but cannot verify payment, edit products, publish, or change fulfillment.
- HTTPS, no-store browser/CDN responses, no-referrer, a restrictive CSP, and noindex tracking pages protect private data. No third-party browser scripts or analytics receive a tracking token. Customer responses exclude email addresses, request IDs, audit records, and verification evidence. Studio lists orders only for its authenticated workspace.
- Payment/fulfillment updates use independent fields and an optimistic order version; D1's existing ledger CAS prevents conflicting writes, duplicate reports/receipts, and capacity loss. Notification delivery bookkeeping never rewrites content drafts or publications.
- No schema change or data migration is needed. The existing `rise-roost-beta-db` binding is retained. The release deploys only the beta Worker and adds fields lazily on new orders or explicit owner actions. Existing saved records are fingerprinted before and after acceptance tests; hosted tests write only fresh synthetic workspaces.

## Verification

`npm test` covers private tracking access, repeated reporting, independent verification, receipt snapshots, owner isolation, stale/concurrent changes, existing orders, cancellation, opt-in validation, configuration guards, outbox claims, provider acceptance, transient/permanent errors, uncertain retries and idempotency expiry. Provider tests use local mocks and never send email.

The Playwright order flow uses an owner session and two independent customer sessions, creates its own synthetic workspace, checks checkout/tracking/reporting, performs explicit **test-only** verification, advances preparation/readiness/collection, reloads persisted data, and denies unauthenticated administration. It runs on desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium, and tablet Chromium. Hosted mode still uses new synthetic workspaces and never edits Danielle's existing site. Physical-device Safari, real printers/PDF dialogs, and a configured sender's real inbox remain manual checks.


### Release checks on October 27, 2026

The recovered workspace retained every source change after the app restart. Before deployment, account authentication and the existing `rise-roost-beta` → `rise-roost-beta-db` binding were verified without displaying credentials. All 86 existing workspace rows matched their earlier content/history/order fingerprints; the owner publication was preserved. No schema/reset/import is part of this release.

- 41 backend tests passed, including notification tests with mocked providers. No live email was sent.
- The complete 40-case local browser suite passed; the final order/receipt/error-handling recheck also passed all five profiles after recovery.
- The Worker deployment dry run passed. Register/Admin source, the approved farmhouse stylesheet, HTML, artwork, and schema match the pre-change baseline. Existing screenshot edits were preserved.
- Hosted acceptance uses fresh synthetic workspaces and no real payments. The real owner's publication and order ledger are read-only in automated acceptance.


Synthetic acceptance screenshots: [desktop tracking](screenshots/order-tracking-desktop.png), [iPhone tracking](screenshots/order-tracking-iphone.png), and [Studio orders](screenshots/studio-orders-desktop.png). They contain no owner access key, customer email address, or private tracking URL.


Active beta deployment: `6ab2c002-f1b3-4c66-a719-96f14bf15b60`, version `bb9a5c9f-dc36-45df-b53b-2db8bb2b732b`, deployed October 27, 2026 at 4:29 p.m. EDT. Source: `12e0bd9d1dab61adc47a6dbcda3ea1c7a84d50e0`. HTTPS website/Studio and all new static asset hashes were verified after deployment. The five-minute beta retry schedule is configured; email stays off.


Post-deployment API acceptance passed 58 HTTPS requests (including security/auth, persistence, publishing, uploads, pricing, capacity, and cutoff cases). Its observed median response time from the coding environment was 401 ms; this is a smoke measurement, not a load test. [GitHub source CI and hosted tracking acceptance](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40578755961) records the independent checks for this release.


**Final source CI passed:** 41 backend tests and 40 browser cases, the independent HTTPS root/demo synchronization check, Worker smoke, hosted API acceptance, and all five hosted order-tracking browser flows. All jobs in [run 40578755961](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40578755961) are green on deployed application source `12e0bd9d1dab61adc47a6dbcda3ea1c7a84d50e0`. Hosted order screenshots are attached to that run as `hosted-order-tracking-screenshots`. The final data preservation check after hosted acceptance retained every one of the original 86 workspace fingerprints.
