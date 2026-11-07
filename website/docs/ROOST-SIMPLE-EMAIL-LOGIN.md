# The Roost: simple email login

Feature branch: `feature/roost-simple-email-login`.
Base: `d7dcd4d7f0915cce6ce6751a081ddf56ca12bb7c` (`feature/resend-transactional-email`), containing deployed implementation `8de96be`. Main is an older Register tree and is not an appropriate deployment base. Open PR #21 and the earlier website PRs remain unmerged; do not replace their newer production code with main.

## Release state

Prepared for review; **not deployed or activated**. No production database writes, settings updates, secret changes, or live email sends were performed. Existing sign-in remains functional. Checkout, order email, cash, and credits controls are unchanged.

The active Worker at inspection was `rise-roost-website-production`, version `3afe2f0a-0a83-4781-92fc-2bdd4576536a`, deployment `2a3853c3-c3b7-4793-a9d3-0451ae075063` (2026-11-07 15:43 UTC). Re-read these immediately before a future release. Production `REAL_CHECKOUT_ENABLED=false`, `ORDER_EMAIL_ENABLED=false`, `ROOST_PASSWORD_LOGIN_ENABLED=true`, and `ROOST_SIMPLE_LOGIN_ENABLED=false` were confirmed. Resend and the existing password pepper are present as secret bindings; their values were never read.

Production aggregate account audit: one member; one passkey account; one recovery-hash path; zero password accounts; zero accounts without a supported legacy path. There is no production verified-contact table. Stored profile emails are unverified and must never be promoted automatically. Aggregate coverage establishes available methods, not whether a customer still possesses their passkey/recovery key.

## Customer behavior

Registration asks only for full name, email, and password. Verification also requires a separate HttpOnly pending-browser cookie, preventing pre-account takeover through an unsolicited registration email. Open the link in the requesting browser; otherwise resend verification in the new browser using the chosen password. Password reset works across devices. The existing 15–128 character phrase policy and peppered PBKDF2 verifier are reused. Visibility toggles and password-manager attributes are provided. A pending registration is not a member and cannot obtain member privileges. Verification creates the member and verified identity atomically; it then asks the customer to sign in normally.

Sign-in asks for email/password, with Create an Account, Forgot Password, resend verification, and a collapsed existing-member path. Normal registration, login, verification, and reset never invoke browser credentials APIs. Fully migrated settings hide username/passkey management and display verified email separately from editable pickup contact details. Device revocation and sign-out remain available.

Verification links need no typed code or account information: open the link and tap Verify My Email. This explicit confirmation avoids consuming links solely because an email viewer opens a page. Reset links ask for the new password twice. Link secrets are held only in the URL fragment, removed from browser history upon capture, and posted to same-origin endpoints. Same-tab links and links opened while already signed in are handled.

## Migration and identity safety

Existing member IDs, profiles, passkeys, recovery hashes, orders, favorites, return credits, and settings are preserved. No account is recreated to migrate it. Members sign in with their existing username/password, passkey, or recovery path, then verify an email from Account Settings. Username/password members supply their current password. A passkey-only member chooses a password after recent authenticated sign-in. Linking requires the same recently authenticated session again when the email link is consumed; open it in the requesting browser within ten minutes. A new request is needed if that session expires or changes.

Email changes require current-password proof and verification of the new mailbox. The old identity remains active until proof succeeds. Confirmation revokes sessions, notifies the old mailbox when delivery is allowed, and requires a fresh sign-in. A unique workspace/email key and unique workspace/member key prevent conflicting verified identities. Legacy profile-email collisions block new registration rather than merging or appropriating an account. Support must resolve ambiguous records with independent ownership proof; claimed contact details alone are insufficient.

Legacy backend authentication remains available. New username/passkey enrollment is blocked when email mode is active, including in-flight legacy enrollment, so it cannot bypass verification. Fully migrated accounts retain their stored legacy methods for safe rollback and recovery. The collapsed existing-member help also supports verified email plus the original recovery code: it resets the password, rotates that code, invalidates sessions and preserves passkeys. This specifically keeps the original recovery path usable for passkey-only members after they add a password, without exposing a generated internal username. If a member has lost all legacy proof, there is no automatic migration: retain the account and use owner-assisted identity recovery without trusting a claimed email.

## Schema and security

Apply only `migrations/0012-roost-email-login.sql` after backup and compatibility checks. It is additive and idempotent:

- `roost_email_identities`: normalized, unique, verified mailbox ownership mapped to original member ID.
- `roost_email_tokens`: SHA-256 hashes of random 192-bit verification/reset secrets, purpose, expiry, member/session constraints, and claim state. Pending registration stores only the existing salted/peppered password verifier, never the password.
- `roost_auth_events`: credential-free event ID, workspace/member ID, event name and timestamp.

Fifteen-minute token expiry, single-use atomic claims, D1 transactional batches, password-revision checks, recent-session fences, and verified-identity checks protect concurrent changes. Password reset revokes all existing sessions and in-flight account ceremonies. Password changes invalidate older reset/link requests by password revision. New login rotates the active session; existing HttpOnly/Secure/SameSite=Strict cookies and 30-day inactivity/90-day maximum remain intact.

Existing same-origin JSON CSRF protection applies to all new routes. Identity/IP/global authentication limits and send limits run before expensive work or delivery. Forgot-password responses are neutral for absent accounts and delivery failures. No provider body, password, token, or recipient is logged. Reset/password-change notifications are best-effort; provider failure does not undo an already successful security change. Expired token rows are pruned during subsequent email requests; expired links are rejected immediately regardless of cleanup.

Backups enumerate schema dynamically and include all new tables. Restore/schema compatibility tests were updated accordingly. Studio Access, owner identity validation, permissions, sessions, and administrative API authorization are unchanged.

## Resend controls and activation

The sender remains `Rise & Roost <orders@rise-and-roost.com>`. The existing Resend account/secret, sender policy, and conservative shared free-plan reservation (90 requests/day, 2,700 over a rolling 30-day window) are reused. Verification, reset, password-changed and email-changed messages have cream/sage HTML plus plain text. No other provider is introduced. The order notification outbox and its flags are untouched.

All new controls default to disabled when absent. No production values have been added:

- `ROOST_EMAIL_LOGIN_ENABLED=true` enables the new customer experience; also requires the existing password feature and pepper.
- `ROOST_AUTH_FREE_PLAN_CONFIRMED=true` is required before **any** real auth email, including owner tests. Confirm the actual Resend plan, remaining shared usage, verified sender/domain and recipient restrictions first. Local quotas do not measure mail sent outside this app.
- `ROOST_AUTH_OWNER_TEST=true` permits only addresses belonging to configured production owners, even while general auth email is disabled. Use only after configuration/allowance checks. Remove/disable it after testing.
- General sending requires **both** `ROOST_AUTH_EMAIL_ENABLED=true` and `ROOST_AUTH_DELIVERY_VERIFIED=true` plus the free-plan confirmation. Do not set them until an owner-only end-to-end test has passed and the owner explicitly approves activation.

The environment exposes no Resend management credential or dashboard and no authenticated Resend configuration/quota read was possible. Presence of the Worker secret is not proof of sender verification, remaining quota, or successful delivery. No live message was sent. These are release blockers, not completed checks.

Before release: re-fetch branches and PR #21, compare the current deployed source/settings, capture a verified encrypted backup, re-audit migration coverage, apply the additive migration, run all checks and native D1 smoke, verify owner-only delivery, record approval, and deploy an exact reviewed bundle preserving every current production binding/secret. Never apply a stale Wrangler file over newer live settings. Keep checkout/order email/cash/credits disabled.

Rollback: disable the new email UI/sending controls and redeploy the previously verified Worker version with its original bindings. Leave additive tables and member records intact. Existing passkey/username/recovery backend methods remain. Accounts created through email must retain a supported email-login/recovery path during rollback; do not roll back to legacy-only UI after public activation without preserving email endpoints or providing a tested recovery route. The prepared feature has never been public, so no new production email accounts currently require this exception.

## Verification

Tests use isolated SQLite/loopback/native D1 fixtures and mocked email only. The new API suite covers registration, pending privileges, normalization, duplicate/conflicting identities, password compatibility, incorrect credentials, verification/reset expiry and reuse, provider failure, disabled sending, quotas, CSRF, session persistence/revocation, migration, email change, stale links, concurrency and transaction rollback. Native workerd/D1 smoke exercises the compiled Worker, real password KDF, mocked Resend submission, verification, reset, session invalidation, and retained member identity.

Browser evidence uses desktop Chrome, desktop WebKit, iPhone WebKit, Android Chrome and tablet Chrome. It verifies the complete new journey, password visibility, responsive width and zero passkey ceremonies. Linux WebKit with an iPhone profile is emulation, not a physical iPhone Safari test. Physical-device confirmation remains a release checklist item.

### Final local results

- Node/security tests: **342 passed**, zero failures or skips.
- Dedicated new-flow/migration/recovery browser tests: **10 passed** across all five desktop/mobile profiles. Registration/password reset, signed-in email linking and retained recovery-code UI all pass; no normal-path passkey ceremony occurs.
- Broad existing browser run: **274 passed / 1 timeout** in the existing desktop WebKit Studio navigation case. That exact case **passed on an isolated rerun** without Studio changes. This timing failure is retained here rather than represented as a clean first run.
- Production Worker dry-run build: passed; native workerd/D1 email smoke: passed with mocked Resend and zero remote requests/writes.
- Migration/schema/backup and restoration tests pass, including all three new tables.
- Source base and active production deployment were rechecked unchanged before finalization; new authentication flags remain absent/disabled and production order-email free-plan/delivery confirmation flags remain false.
- Screenshot evidence: `roost-email-login/join-desktop.png`, `roost-email-login/join-iphone-webkit.png`; password fields are deliberately masked.
- Commerce suite: **8 passed** with its configured single worker. An earlier two-worker attempt had one iPhone WebKit setup failure; its fixed-port fixtures must run serially. No commerce or Studio code was changed to obtain the passing result.
- Production-isolation browser suite: **10 passed**, including owner sessions/reauthentication, launch lock, manual payment handling, and saved payment QR behavior.

Every required local test case has a passing result; the broad run's initial Studio timeout and the nondefault parallel commerce attempt remain disclosed above. Live Resend delivery/quota and physical-device Safari are not represented as tested. Deployment is intentionally blocked pending those release checks and explicit activation approval.
