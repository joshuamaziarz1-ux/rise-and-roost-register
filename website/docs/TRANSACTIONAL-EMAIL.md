# Rise & Roost transactional email

The existing Resend order outbox now supports branded HTML and plain-text order updates and owner-managed email settings. The production secret is used only on the Worker. Every email uses **Rise & Roost <orders@rise-and-roost.com>**; no Reply-To is set. Questions link to the existing `/contact` page. This does not establish a monitored inbox at the sending address.

## Owner controls

In **Studio → Settings → Customer Email**:

- Check Resend configuration, sender and customer availability. A configured secret means the connection can be tested; it is not a claim of successful delivery.
- Save the customer master switch and individual Order Received, Payment Confirmed, Preparing, Ready for Pickup, Order Canceled and Pickup Forfeited preferences. Preparing is optional. Disabling a type withdraws waiting messages; re-enabling does not replay that backlog.
- Send an explicitly confirmed test to **your own authenticated, configured owner address**. No recipient field accepts a customer address. One new test per minute and five per hour are permitted across owners. Tests work while customer sending is locked off.
- Refresh the 60 most recent message records to see attempt counts, safe error codes, retry times and service acceptance. Each message retains up to eight attempt results. No provider response body or credential is displayed/logged.
- Retry an eligible failed message after its retry time. Accepted, suppressed, invalid and expired messages cannot be resent. Retries use the original message identifier and frozen body. Direct contact is required when the safety window expires.

Email controls are separate from Studio’s existing in-app alert preferences. The Settings Help Guide explains the real controls. All mutations retain existing individual owner authentication, signed Access verification, same-origin checks, operation deduplication, audit and ledger concurrency checks. Preview/workspace sessions cannot request a live owner email test.

## Customer emails

Each template contains the official logo, escaped customer name, confirmation number, products, quantities, unit and extended prices, original total, applied credits/remaining amount when relevant, pickup window/address/instructions, payment method/status, private View Your Order link and Contact Danielle link. HTML uses responsive tables, warm cream, sage and dark green; plain text has the same information. A pending makeup date replaces the old travel instructions.

Order Received explicitly does **not** confirm payment. PayPal, Venmo and Cash App remain pending until the existing independent verification action. Payment Confirmed requires the saved verification. Cash at Pickup shows the server’s remaining cash amount after credits and stops claiming cash is due after receipt/cancellation. Cancellation and forfeiture never promise refunds or initiate collection. These messages observe the existing workflow and never alter payment, pickup, inventory or credit rules.

Customers must explicitly opt in at checkout. Missing email is allowed for ordinary guest/member checkout; malformed opted-in email is rejected before saving. Delivery revalidates the recipient. No new contact field or account linking was introduced. Passkeys, username login, remembered sessions, saved confirmations and private tracking remain available. Schedule-change notices continue through tracking/The Roost and the existing direct-contact process; no new schedule-change email is claimed.

## Reliability and limits

No migration is needed. Notifications remain in the existing order ledger and are committed atomically with their order transition; preferences and synthetic owner tests use additive fields under `ledger.management`. Existing `limits` records enforce 90 API attempts/day and 2,700 across the most recent 31 UTC dates. Retries/timeouts consume budget. No plan upgrade, overage or billing change is authorized by this integration.

An event is queued once per order/type. Leases, ledger compare-and-swap, the stable existing Resend idempotency key and frozen request body prevent duplicate submissions, including concurrent drains or uncertain timeouts. Requests time out after 15 seconds; leases last 90 seconds. Temporary errors back off and honor bounded Retry-After. Permanent errors retain the original payload for an authorized retry. No attempt may be submitted beyond eight attempts or the conservative 23-hour idempotency/event window. Terminal payloads are removed; expired permanent-failure payloads are cleared by the drain. Backup restoration clears owner-test outboxes and disables copied email preferences, as it already clears order notifications.

The drain rechecks the current saved state and preferences before submitting. Superseded Preparing/Ready notices, corrected payments and canceled active-order notices are suppressed. A message already submitted cannot be recalled. A later edit does not rewrite an uncertain retry body.

Resend **accepted** means its API returned a message ID. It does not mean delivered to an inbox. No delivery webhook was added, so no unsigned webhook or delivery claim exists. Test recipients should check inbox/spam and the Resend dashboard. Failed messages remain visible; saved orders are never removed because email failed.

## Initial production protection and later activation

Initial implementation must retain `REAL_CHECKOUT_ENABLED=false`, `ORDER_EMAIL_ENABLED=false`, existing false allowance/delivery-verification flags, ordering pause, cash setting and paused return-credit program. A key existing in Cloudflare does not bypass these gates. An owner can prepare preferences and test without enabling customer mail.

After Danielle explicitly approves **customer email activation**:

1. In Studio → Settings → Customer Email, send a test to the signed-in owner address. Confirm the actual inbox result and check the verified sending domain/account in Resend. No customer email is needed for this test.
2. Confirm the provider’s current free allowance and account-wide usage/overage policy. The application keeps its conservative attempt limits; unrelated account usage must be checked separately.
3. The operator performs one deliberate reviewed release setting `ORDER_EMAIL_ENABLED=true`, `ORDER_EMAIL_FREE_PLAN_CONFIRMED=true` and `ORDER_EMAIL_DELIVERY_VERIFIED=true`, preserving `ORDER_EMAIL_FROM=orders@rise-and-roost.com`, the existing secret, all other bindings and ordering controls. This one-time release lock is intentional; Studio cannot override an explicit deployment kill switch.
4. Danielle selects **Enable customer email notifications**, chooses types and **Save email settings** in Studio. She can then switch customer notifications/types off and on without code or Cloudflare. The independent checkout and ordering controls remain as they were; email approval does not activate checkout.
5. Confirm the five-minute retry trigger and review Recent email attempts. Use private order tracking/direct contact if submission fails. Do not label acceptance as delivery.

No live email is sent automatically by deployment. The owner test must be requested and confirmed in Studio. No actual customer was used for automated tests.

## Release evidence

The branch is based on `5d2d2f3090691a26bf984ba35633454f48f5d611` (`feature/order-confirmations-free`), including all deployed pickup approval/rescheduling, checkout, cash, credits and username login changes. The initial active Worker was `ab217cdf-28fb-42e7-a387-734cc9b187c6`, with executable SHA256 `1b6389dfd21e2284b9a5849a98e711fcab0d977fe580c59717c58715d5c6cbf6`, matching the prior source release. The newer dashboard version added the existing secret; it did not change executable code. Main and the other feature branches are preserved.

Real inbox delivery is not established by mocks or a configured secret. The validation and release receipt below distinguish automated verification from a live inbox test.

Read-only preflight confirmed all 15 table/schema fingerprints, Access configuration, bindings and deployment metadata unchanged during implementation. The existing saved `orderingPaused` value is **false** and is preserved exactly; the independent `REAL_CHECKOUT_ENABLED=false` gate prevents real checkout. Cash at Pickup and return-credit use are off. There are zero production orders; no live fixture was created to exercise email.

Public read-only checks of Home, Shop, The Roost and Contact passed across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium, with no JavaScript errors, overflow or write requests. All automated email responses use mocks. The production Resend secret is present, and the owner reports the domain verified; no live provider request or inbox-delivery verification has been performed by this task.

Rollback during the disabled release can select the retained previous Worker version after confirming all customer-email flags remain false. Existing data must be retained. Once sending is deliberately activated, review pending notification identifiers and preserved bodies before any rollback; never replay accepted or old uncertain submissions. No database rollback is required by this release.

Examples use synthetic local data: [desktop email](transactional-email/confirmation-desktop.png), [mobile email](transactional-email/confirmation-mobile.png), [plain-text confirmation](transactional-email/confirmation-example.txt), [desktop Studio controls](transactional-email/studio-desktop.png), [iPhone Studio controls](transactional-email/studio-iphone.png). Browser previews establish layout; actual Gmail/Outlook inbox rendering remains part of the owner test.


## Final validation

| Check | Result |
| --- | --- |
| Full backend/service/security/database suite | 327 passed; zero skipped |
| Main browser suite, five profiles | All 270 distinct cases verified: 269 passed in the complete run; the corrected existing contact-login case passed in its five-profile follow-up |
| Dedicated commerce suite | 8 passed |
| Production owner/launch/QR/authentication suite | 10 passed |
| Distinct automated cases | **615 passed** |
| New email-specific cases | 20 backend and 5 browser cases, included above |
| Production build check | Passed |
| Exact compiled Worker under local workerd/D1 | Passed, including 12 mocked email submissions; zero remote requests/writes |
| Read-only live public checks | Home, Shop, The Roost and Contact passed on five profiles |
| Live Resend/inbox test | Not performed; zero actual emails sent |
| Database migration | None |

The full `npm run test:all` invocation exposed one pre-existing browser-test race: the second simulated phone login read the previous mock code before the new verification screen was ready. The test now waits for Enter Your Code, as its first login already did. All five profiles passed the corrected journey; the remaining commerce and production phases were then run and passed separately. Product authentication was not changed for this test repair. The initial 269/270 result is not represented as a clean single-command run.

Initial deployment status: candidate ready, awaiting the final concurrent-change/preservation checks and disabled infrastructure release. All sending and checkout safety flags remain false.
