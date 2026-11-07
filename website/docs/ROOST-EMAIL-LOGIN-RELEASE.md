# Roost email-login production preparation — 2026-11-07

The owner authorized deletion of the sole previous test membership and deployment/activation after backup, database, automated-test and owner-only live email checks. That authorization is recorded; another generic deployment approval is not needed. **Activation remains blocked by missing authenticated Resend account access for current plan/usage verification and live account-email testing. No Worker version has been deployed by this release attempt.**

## Source and production baseline

Used `feature/roost-simple-email-login`, starting from `2300dcaaba7602b7abf227aa24bfe7548353fbb2`, not main. Re-fetched the feature branch and PR #21. The Resend branch/PR head remained `d7dcd4d7f0915cce6ce6751a081ddf56ca12bb7c`; main remains the older Register tree.

Baseline Worker: `rise-roost-website-production`.
Active version: `3afe2f0a-0a83-4781-92fc-2bdd4576536a`.
Deployment: `2a3853c3-c3b7-4793-a9d3-0451ae075063`.
Production database: `889a4b96-cabd-43d1-ad45-79f65b0052b0`.

Existing encrypted `RESEND_API_KEY` and `ROOST_PASSWORD_PEPPER` bindings were verified by name/type and never read, replaced, or exposed. No Cloudflare Access, Studio owner identity, session duration, permissions, routing, or administrative authorization settings were changed.

## Verified backup and authorized test-member removal

The owner explicitly identified the sole existing membership as their personal test account. The member count was independently rechecked as one, the record exactly matched the verified production backup, and its email matched exactly one configured production owner. Ownership was based on the owner's explicit attestation plus these checks, not on trusting a claimed profile email alone.

Before deletion, an official consistent D1 export was encrypted using AES-256-GCM with a fresh local recovery key. The encrypted disk file was read back, decrypted and restored into a separate local SQLite database/media directory. Every record and schema object matched. All 15 production tables were included. The archive SHA-256 is `ce9c24534ba16edf2fc7a0d59f7ff6330b4ad7c1ea6e979751529f54af0c48ba`.

Encrypted archive: `/workspace/roost-email-release/production-before-email-login.rrbk`. A separate mode-0600 recovery key is retained in a private recovery directory outside the repository; no key value is in this report, logs or Git. These are private workspace backups, not an activated offsite/scheduled backup service. Preserve the recovery key through the owner's secure recovery process before retiring the environment.

The exact guarded deletion was first executed against the verified restored copy and rolled back. Production deletion then rechecked the sole member's ID/profile/recovery hash/creation time, workspace revision and ledger revision before every statement. It removed:

- One Roost member, including its stored recovery hash.
- One passkey credential.
- Two customer sessions and their two device-detail records.
- One associated authentication challenge.
- Zero password rows; none existed.

Member fingerprint: `3196d780f96a`. Full IDs and private credentials are omitted. Remaining members, passkeys, customer sessions, session-detail rows and passwords were confirmed zero. No live legacy challenges remain. Unrelated expired challenge rows were retained.

There were no orders, payments, benefits/credits or ledger references associated with the member. The complete business ledger, published/draft configuration, the existing customer comment, assets, Studio/legacy owner-session table, device links, previews and production identity marker were preserved; protected-table hashes and counts matched before/after. The sanitized deletion receipt is in `roost-email-login-release/deletion-receipt.json`.

## Database preparation

Applied the unchanged reviewed `migrations/0012-roost-email-login.sql`, SHA-256 `8cd6dba36060dcaca307091e9e623ef53f2576fd0f316e792f71c38de5da3cac`.

Verified empty new tables and their expected columns:

- `roost_email_identities`
- `roost_email_tokens`
- `roost_auth_events`

All previous 15 table definitions and row counts were unchanged by the migration; production now has 18 application tables. The same migration was tested twice on a restored copy for idempotence.

A second full encrypted export and restore verified the post-migration state, including zero members and all 18 tables. Archive: `/workspace/roost-email-release/production-after-email-migration.rrbk`; SHA-256 `f589fda58a9e160706801967407c2c886591e1e7d21ef67c083bb4c3af5b79bd`.

## Release defects corrected before deployment

The current Cloudflare export API nests its completed download URL in `result.result.signed_url`. The previous helper expected only `result.signed_url`, causing it to keep polling a completed export. The helper now handles the actual nested completion response and rejects explicit export errors, while retaining compatibility with older response shapes. A real-shape regression test and both actual production backup/restore checks pass.

The reviewed authentication module had not been added to the separate production HTTP route allowlist. Direct service tests passed, but a real production wrapper would have returned 404 for the new email endpoints. The exact POST routes are now included; unknown paths and wrong methods remain blocked. Production-wrapper tests exercise verification, email/password login, password reset, CSRF, session invalidation, disabled-feature behavior, closed checkout and unchanged private Studio protection. The native email smoke now uses actual production mode and identity checks instead of only the preview wrapper. This fix has not been deployed yet.

## Resend gate and remaining work

The owner's confirmation of the previous transactional test is recorded. It does not independently establish the current account plan or remaining daily/monthly allowance. The available environment has only a Cloudflare credential; the Worker stores the Resend secret encrypted/non-readable. No authenticated Resend dashboard or management API credential is available, and `api.resend.com` is not currently on this environment's outbound allowlist. The shared desktop is advertised as enabled/unknown, but no desktop JavaScript/browser-control tool is offered in this session. Runtime environment: `ccarenv_b64_Y2NhcmVudl81YTczMmYyYjI0YzA4MTkxODkxNzk4ZDgxMjI1M2QxZA`.

Requested secure Resend account access while continuing the independent backup/deletion/migration work. Do not paste secrets into chat. To resume, provide authenticated account access, or securely configure a management credential scoped to `api.resend.com` and permit that domain. Confirm verified sender/domain, recipient restrictions, free plan and actual remaining daily/monthly usage. The sender remains `Rise & Roost <orders@rise-and-roost.com>`.

Then run authorized owner-only registration verification, forgot-password, reset, password-changed notification, sign-in, persistence and sign-out checks using the existing encrypted Worker secret. General delivery must stay off throughout that test. Only after successful owner-only evidence should the already authorized activation set the requested email-login/free-plan/delivery flags, disable owner-test mode, deploy the exact reviewed build while preserving all live bindings/secrets, and verify the public site and protected Studio. No unsolicited messages may be sent.

At this checkpoint no new authentication flags have been configured, no live authentication email has been sent, and no authentication activation has occurred. `REAL_CHECKOUT_ENABLED=false` and `ORDER_EMAIL_ENABLED=false` remain mandatory and unchanged. Cash at Pickup and return-credit controls have not been activated.

The authorized old test account has already been removed. Do not rerun deletion against a later member set. On resumption, recheck for new registrations and preserve any new accounts, re-fetch the source/PR/active Worker state, and take a fresh verified backup if production records have changed.

## Validation completed for this release preparation

- **344 unit/security tests passed**, including the new production allowlist/CSRF/session/isolation tests and the real nested D1 export shape.
- Both native workerd/D1 smokes passed with synthetic data and zero remote requests: retained password compatibility, and new email authentication in full production mode. The production-mode smoke verifies the 409 closed-checkout response and 401/404 private/admin denials.
- **280 broad browser cases have passing results**: 168 Chromium cases (desktop, Android, tablet), plus 112 desktop/iPhone WebKit cases. The first full-suite command omitted the installed WebKit path and therefore failed those 112 runner launches; all were rerun with the configured browser path/library root and passed. This was a test-environment correction, not a product-code workaround.
- Real public Home, Shop, Cart and Roost documents returned 200. The public membership response confirmed no member session and inactive email login. Studio and private/legacy admin URLs remained inaccessible without owner authentication. No live owner session was impersonated or bypassed.
- Production configuration was re-read after database work: the active deployment and all binding metadata exactly matched the baseline; new auth flags remained absent/disabled, and checkout/order email remained false.
- No live Resend account-email tests have run. API/provider acceptance or delivery for this new flow must not be inferred from mocked tests or the owner's earlier transactional test.
- **8 commerce browser tests passed** using the configured single worker.
- **10 production-isolation browser tests passed**, including both owner identities, expired Access sessions, launch lock, payment QR behavior and public product workflows.

All required local automated cases now have passing results. Production deletion and migration are complete; Worker deployment and live email activation remain paused at the Resend access/allowance/owner-email-test gate. The owner already authorized conditional activation, so the missing item is access/evidence, not another generic permission prompt.
