# Customer email accounts and My Roost

Development branch: feature/roost-customer-accounts. Based on the recovered approved production commit 32fd1d0c365fbe9182448ed235a2c08c7a197ae1, merged without changing Studio Back/Home navigation or moving the Help Guide outside Settings. The original preflight report is historical; its missing-source blocker is resolved.

## Experience

Join The Roost takes a name and email. Sign In takes email only. Both send a six-digit code and let the customer select Remember me on this device (selected by default). Verification creates a free member or signs into the existing verified email account. No passwords, marketing enrollment, paid membership, rewards, discounts or payment processing are added.

My Roost displays verified email, editable display name, free membership status and orders attached to that authenticated member ID. Guest checkout is unchanged. Member checkout prefills the existing contact fields. Login, logout and account navigation do not clear the basket. Existing passkey members can use the separate Existing passkey membership option. Email verification does not merge a legacy member or claim guest history by matching profile email. The new email account UI has no historical guest-claiming form; the existing capability-based claim API remains protected by the private tracking secret, authenticated CSRF checks and ownership checks.

## Security and lifetime

- Cryptographically random six-digit codes use rejection sampling. Codes expire at 10 minutes, work once, and allow five attempts, including malformed submissions. Resending invalidates previous address challenges. Atomic D1 consumption guards account/session creation; a failed transaction rolls back creation and code consumption.
- Code verifiers use HMAC-SHA-256 with a separate Worker secret, bound to a random browser challenge. Plain codes exist only transiently for delivery. Public responses do not reveal account existence. No code/provider response/credential is logged.
- Sending limits: 20 requests per IP per hour, 5 per address per hour, a strict 60-second address cooldown across clock boundaries, and 500 per workspace per UTC day. Verification is limited to 50 attempts per IP per hour plus five per challenge. Rate-limit keys are hashed. These caps apply to both known and unknown accounts.
- Cookies are always Secure, HttpOnly, SameSite=Strict, Path=/, with __Host- prefixes and no Domain attribute. Only token hashes persist server-side. No auth tokens go into localStorage.
- Remembered sessions have a 30-day inactivity window and a fixed absolute 90-day maximum from verification. Active /me requests renew at most once per day and rotate identifiers, allowing the preceding identifier for 120 seconds for concurrent browser requests. Renewal never changes the absolute expiry.
- Without Remember me the cookie has no Max-Age/Expires and the server expires it after 12 hours. Browser session restore may preserve session cookies; customers should sign out on shared devices.
- Sign Out revokes the current session, including the preceding rotation token, and clears the cookie. New sign-ins replace the current browser's earlier email session and invalidate its legacy passkey cookie/session. Expired and revoked sessions cannot read private orders or perform member checkout.
- Same-origin JSON enforcement protects all mutations. A session-bound CSRF token kept only in browser memory additionally protects email profile/logout and member checkout/legacy member mutations involving an email session. CSRF values rotate with session tokens.
- Customer cookies never authorize Studio. Existing Cloudflare Access checks, owner allowlists, /studio routing and production identity guards remain intact. Production email endpoints require the exact public workspace.

## Configuration: release remains blocked

Production currently has no Resend secret/sender binding, and no customer-email configuration. Existing order mail remains disabled and must remain unchanged. Configure these values only after independent provider/domain verification:

| Setting | Requirement |
| --- | --- |
| RESEND_API_KEY | Worker secret; authorized transactional sending key. Reuses the existing provider integration. |
| CUSTOMER_EMAIL_CODE_SECRET | Separate Worker secret, at least 32 characters generated with a cryptographically secure source; never commit it. Rotating it invalidates pending codes, not existing sessions. |
| CUSTOMER_EMAIL_FROM | Verified transactional sender email address, such as an owner-approved address on the authenticated domain. No invented sender. |
| CUSTOMER_EMAIL_DOMAIN_VERIFIED | Set to true only after the actual Resend domain status, DKIM, SPF/return-path and DMARC alignment are verified. |
| CUSTOMER_EMAIL_ENABLED | Set to true only when all other release prerequisites pass. |

Missing or false settings fail closed: no codes are sent, and the UI offers Continue as Guest. Do not deploy an unavailable email signup as the completed feature. Never enable ORDER_EMAIL_ENABLED to enable customer codes. This implementation has no test-provider bypass flag in production; delivery injection exists only in direct isolated API tests and fake network calls in local test fixtures.

Owner actions still required: authenticate a Resend sending domain with the provider-generated DNS records, preserving existing email DNS; securely supply the sender/key and code secret; permit api.resend.com in this managed runtime for provider checks; confirm one delivery to an owner-controlled inbox and complete the real code flow. Automated tests use synthetic recipients and a fake sender; no live emails have been sent.

## Additive database migration and recovery

The original production-schema.sql and legacy schemas are unchanged. Apply migrations/0003_customer_email_accounts.sql explicitly after backup/recovery verification. It adds four namespaced tables (verified email/member association, protected challenges, revocable sessions, rate limits) and three indexes. It does not edit legacy table columns, profiles, orders, ledger/payment data, pickups or settings. Reapplication is idempotent, but does not replace the need to verify existing table definitions.

Before applying remotely:

1. Recheck active Worker/source/settings and D1 schema, especially if Studio has changed since development. Preserve every current binding and secret, including checkout gates, owner Access, payment destinations and pause state. The repository's preparation-only wrangler.production.toml is not an authoritative copy of live runtime settings; do not blindly deploy it.
2. Follow PRODUCTION-BACKUP-RUNBOOK.md to capture an encrypted current production snapshot and matching static media, verify read-back, and restore into a new isolated database. Compare all schema and record hashes. Confirm durable recovery-key custody and a recovery receipt. A Time Travel bookmark alone does not prove recovery readiness. Never reset/import/restore over production for a drill.
3. Test the migration against that isolated restored snapshot and compare every existing row and schema object before/after. Confirm new tables/columns/indexes match the migration. Recheck production compatibility before applying. The current tests use synthetic databases, not a real production snapshot.
4. Apply only the additive migration, then upload/deploy the tested candidate while preserving exact live configuration. Leave the added tables in place on code rollback; never drop them or overwrite business records.
5. Verify live homepage, Studio owner sign-in, unchanged checkout/pause/payment settings, real test-inbox signup, remembered return, profile, logout, and unavailable-session privacy. If verification fails, roll back code/assets to the recorded prior version with all settings/data preserved. Revoke test sessions and disable customer email if necessary. Do not replay mail or create production test orders.

Do not migrate or deploy until both email and recovery prerequisites pass. No production migration, backup export, mail or deployment has been performed by this feature work.

## Reproducible tests

Run in website/:

- npm test
- python tests/production_schema_guards.py
- npm run check:production (dry run only)
- npx playwright test --config playwright.customer-email.config.mjs
- npx playwright test --config playwright.customer-regression.config.mjs

The email browser matrix uses a disposable local HTTPS server, ephemeral self-signed certificate and fake Resend responses. Certificate trust relaxation is confined to local test contexts; production TLS validation is unchanged. Every database and order is synthetic. Desktop Chromium/WebKit, iPhone WebKit, Android Chromium and tablet Chromium profiles cover the new UI. Regression coverage includes guest/member checkout, basket persistence, pickup cards/calendar, payment options, order isolation, Studio navigation/management, owner login and Settings help. WebKit emulation is not a physical iPhone certification.
