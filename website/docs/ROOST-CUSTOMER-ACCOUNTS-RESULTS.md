# Customer accounts verification and release status

**Implemented and isolated-tested; production deployment blocked by email and recovery configuration.**

Branch: feature/roost-customer-accounts. Approved source baseline: 32fd1d0c365fbe9182448ed235a2c08c7a197ae1 from feature/studio-back-home, fetched and merged into the existing feature branch. Implementation commit: 15b9f6adfb5329c9923240ff0c7ad331691f7cc9.

## Tests

| Check | Result |
| --- | --- |
| npm test | 229 passed, 0 failures; includes 16 new email security/migration cases and existing regression coverage |
| python tests/production_schema_guards.py | 7 passed |
| npm run check:production | Passed; Wrangler dry run only, no upload/deployment |
| playwright.customer-email.config.mjs | 15 passed across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium |
| playwright.customer-regression.config.mjs | 57 passed in the full desktop/iPhone matrix; one legacy passkey selector failed, was corrected, and its affected desktop case passed a targeted rerun. All 58 scenarios are verified; no unresolved failures. |
| git diff --check / syntax checks | Passed |

The new tests exercise six-digit registration, valid/invalid/expired/reused codes, five-attempt exhaustion, browser challenge binding, strict resend cooldown across minute boundaries, IP/address quotas, fake delivery failures, remembered/nonpersistent sessions, fixed maximum lifetime, renewal and identifier rotation/grace, inactivity expiry, revocation and logout, returning/new devices, profile validation, unchanged verified email, CSRF, guest/member checkout, basket retention, member-ID ownership, cross-account privacy, Studio isolation, additive migration replay, transaction rollback and isolated restore preservation. Browser tests cover remembered return via a restored cookie jar, short session cookies, responsive layout, member contact prefill/order history, basket across login/logout, guest navigation, unavailable email configuration, and Settings help with retained Back/Home controls.

All authentication messages were captured by fake senders. All databases, orders, payment destinations and certificates used in tests are synthetic and isolated. Browser tests use local HTTPS so Secure/__Host- cookies are exercised without weakening production behavior. WebKit profiles emulate Safari; no physical iPhone certification is claimed.

## Production read-only verification

Inspected 2026-11-06 UTC. Worker: rise-roost-website-production. Existing active version: 76a3e8ab-09e4-4ce4-b85a-f30cf83403f2. Existing deployment: da02d4fb-6ca8-4cd1-b6f5-6afcc36550b3. These remained unchanged after implementation.

- Homepage / and /api/site returned HTTP 200.
- /api/site still reported checkoutEnabled=false and orderingPaused=true.
- /studio returned HTTP 302 to Cloudflare Access. Unprotected /api/studio returned HTTP 404. No live authenticated Studio edits or account tests were attempted.
- Production D1 schema was inspected read-only and still has its original tables. Current Time Travel bookmark retrieval succeeded, but no production export/restore was performed.
- Studio navigation modules, Help Guide renderer, production owner Access code, production configuration file and original production schema remain byte-identical to the recovered source. Help content gained the customer-account topics under Settings.
- No production Worker upload, deployment, secret/settings mutation, database migration/business write, order, payment or email was performed. Existing orders, payment destinations, pause/checkout gates and owner authentication were not changed.

## Pending release prerequisites

1. Resend: existing integration reused. Production has ORDER_EMAIL_ENABLED=false and no RESEND_API_KEY or sender binding. Authenticate the actual sending domain using provider-generated DNS records, verify sender and DMARC alignment, and securely supply RESEND_API_KEY, CUSTOMER_EMAIL_CODE_SECRET and CUSTOMER_EMAIL_FROM. The dedicated CUSTOMER_EMAIL_ENABLED and CUSTOMER_EMAIL_DOMAIN_VERIFIED flags must only be enabled after verification. Existing order email settings must remain unchanged.
2. Managed runtime: api.resend.com must be allowed for provider/domain and delivery checks. Current network policy does not allow it. The code has not sent live mail or verified actual inbox delivery; complete one owner-controlled test-inbox round trip before release. Never paste API credentials into Git or browser code.
3. Recovery: establish durable encryption-key custody and a verified current production backup, read-back and restore into a separate isolated database/media directory using PRODUCTION-BACKUP-RUNBOOK.md. Verify every existing record/schema before testing/applying the additive migration. A Time Travel bookmark and synthetic restore tests do not satisfy this production recovery gate.
4. Migration: migrations/0003_customer_email_accounts.sql adds four tables and three indexes, with no legacy table/row modifications. It was tested only in isolated databases and was **not applied to production**. Recheck exact schema compatibility, recovery receipt and current live source/settings before applying it.

When these prerequisites and live delivery verification pass, the existing owner authorization permits automatic deployment. Preserve every live binding/secret/configuration value; do not use the preparation-only production TOML as a replacement for actual live settings. Reverify the website, owner Studio and test-inbox authentication after rollout. Roll back code/assets to the recorded active version if verification fails; retain added tables and all customer/business data. See ROOST-CUSTOMER-ACCOUNTS.md for configuration, session policy and release steps.
