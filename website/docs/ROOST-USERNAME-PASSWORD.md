# Roost username and password login

The owner changed the requested design to simple username/password accounts without email or phone verification and without paid authentication/messaging services. This release uses the existing Cloudflare Worker and D1; it adds no provider subscription, purchased service, payment method or hosting-plan upgrade. Existing Cloudflare hosting/storage usage remains subject to the account's existing quotas and plan; unlimited free hosting is not promised. Email and SMS sign-in remain disabled.

## Customer experience

The Roost opens directly to a username/password form. Join asks only for preferred name, username and password. A browser can save/autofill credentials using standard `username`, `current-password`, and `new-password` autocomplete fields. No automatic passkey ceremony occurs. Optional passkeys and legacy recovery remain under Other sign-in options. Guest shopping is unchanged. Versioned app/customer/CSS URLs ensure fresh loads retrieve the release.

Usernames are case-insensitive, normalized lowercase and contain 3–30 letters/numbers/dots/dashes/underscores. Passwords allow spaces and Unicode, require 15–128 characters, reject a small set of obvious weak values and repeated characters, and are never trimmed, truncated, silently normalized, returned to customers, or logged. A short memorable phrase is encouraged. Credential drafts clear after submission, view changes, logout and pagehide. Native field values are read at submit to support password-manager autofill without relying on input events.

Signup displays a random 192-bit recovery code once. Customers must save it; without email/SMS, there is no message-based reset. Forgot password requires username plus the saved code, rotates both password verifier and recovery code, and revokes old sessions atomically. Names, pickup contact details or support guesses cannot reset an account. A forgotten username should be recoverable from the saved username/code record or password manager; no public username-lookup-by-name endpoint is exposed.

## Security and storage

`server/password-login.mjs` implements registration, login, authenticated setup, password change and recovery. `migrations/0011-roost-password-login.sql` adds `roost_passwords` and `roost_password_grants`, with unique workspace/username and workspace/member constraints. No old identity is inferred or remapped. Transactional grants guard member/credential/session writes in a D1 batch; duplicate or racing registration cannot leave partial or duplicate members. Recovery and sensitive changes use compare-and-swap on credential revision/verifier, recovery verifier and/or a still-valid owner session.

Each password has a random 24-byte salt. Native WebCrypto PBKDF2-HMAC-SHA256 derives 192 bytes using 100,000 iterations per 32-byte output block (six blocks, approximately 600,000 PRF operations per guess). workerd imposes a 100,000-iteration ceiling, so an unsupported 600,000-iteration call is not used. A constant-time comparison checks only HMAC-SHA256 of the complete derived output keyed by a separate random Worker secret, `ROOST_PASSWORD_PEPPER`; intermediate KDF output and plaintext are never stored. This is standard PBKDF2 output expansion plus post-hash peppering, not a claim of identical sequential latency to PBKDF2 with 600,000 iterations. Its exact parameters are versioned in each row. Native local workerd/D1 tests exercise the deployed implementation, including the KDF limit, rather than relying only on Node tests.

The production pepper is generated cryptographically and sent as a Cloudflare secret with the inactive candidate version. Its value is not committed, printed, exposed to browsers or stored in D1. Temporary upload input uses restrictive file permissions and is removed after upload. Preserve that secret across future releases. Do not rotate or delete it casually: existing password verification depends on it, and changing it needs a deliberate recovery/rehashing plan. Cloudflare's existing secret-management controls apply.

Unknown usernames perform the same KDF operation and return the same invalid-credentials response as wrong passwords. Requests require same-origin JSON. Atomic D1 budgets apply before KDF work: ten attempts per username per 15-minute bucket, fifty per IP/hour, one thousand globally/hour; enrollment is further capped at five/IP/hour and fifty globally/hour. Maximum 500 memberships is preserved. These are fixed windows; adjacent windows can allow two budgets close together. No email/SMS/provider requests occur.

Sessions reuse the original architecture: rolling 30-day inactivity, 90-day absolute lifetime, random opaque tokens with server-side SHA256 verifiers, HttpOnly/SameSite=Strict cookies and Secure on production HTTPS. Authentication tokens never enter localStorage. Logout revokes the current session and clears the cookie; all-device logout is retained. Password changes require the current password and revoke other sessions. Password-reset codes are high-entropy, hashed server-side, single-use and rotated on recovery; old password/code replays cannot create sessions.

## Existing accounts

Signed-in existing members see Add a username and password in Account Settings. Setup requires authentication within ten minutes and the same still-valid owner session in the commit transaction. Setup inserts credentials for that exact member and preserves its profile, recovery hash, passkeys, orders, credits, favorites and settings. Username conflicts never merge accounts. A member that already has a username must use the current-password change flow instead of replacing credentials through setup.

Existing members without a recent session sign in using their existing passkey or original recovery procedure, then set a username. Deliberate original recovery retains its established key rotation/session revocation/passkey-removal behavior for accounts without usernames. For username accounts, the legacy recovery endpoint directs customers to the password reset flow so that an old password cannot bypass a recovery action; its transaction also fences a racing username setup. Password recovery preserves optional passkeys; owners should still revoke remembered devices as needed. Existing sessions are not revoked by the deployment or migration.

New registration explicitly advises existing members to sign in first and attach a username to their current account. No process guesses whether a person is an existing customer from a preferred name or unverified email/phone. A deliberately chosen separate new account is not automatically merged.

## Deployment safeguards

Use freshly inspected production settings, preserve all original bindings and runtime/asset configuration, add only `ROOST_PASSWORD_LOGIN_ENABLED=true` and the new secret binding. Keep `ROOST_SIMPLE_LOGIN_ENABLED=false` and `ROOST_DELIVERY_VERIFIED=false`. Apply only the additive 0011 migration to the production DB; the dormant email/SMS migration is not needed. Never blindly deploy the historically guarded checked-in production config. Checkout, Cash at Pickup, return credits, Studio Access, pickups, payments, announcements and original business data must remain unchanged.

Rollback: set `ROOST_PASSWORD_LOGIN_ENABLED=false` in a version retaining the current code, tables and pepper to restore legacy entry. Preserve new account tables, member rows and sessions. Existing username-only customers will need password login re-enabled for a new sign-in; never delete their records. Do not reset or replace the production database to roll back UI.

## Validation

Tests use synthetic accounts, disposable SQLite/D1, software/virtual passkeys and blocked outbound network. New unit/service cases cover signup, policy, verifiers, generic invalid credentials, CSRF, uniqueness, rate budgets, cross-account recovery, existing-member setup, password changes, session expiry/revocation, single-use recovery, concurrency, rollback and additive/idempotent migration. Five browser profiles exercise signup, reopening remembered sessions, a fresh device, password login/reset, existing-account setup, optional passkeys, account history/favorites/pickup panels and guest shopping. Physical biometric hardware is not claimed tested; native Chromium virtual authenticators and WebKit signing fixtures exercise server verification.

## Verified ACTIVE production release — November 7, 2026

| Item | Value |
| --- | --- |
| Branch | `feature/roost-simple-login` |
| Runtime implementation commit | `8a3d8edc08dd3c57c7183184b342738b1aafa03f` |
| Worker | `rise-roost-website-production` |
| Active version, 100% traffic | `09e9a128-77cf-4cfa-81ee-21bbb80cab8e` |
| Deployment ID | `c5ca248d-3754-4f3c-831e-fc08287c585b` |
| Executable SHA256 | `62972402fa307ff13da038acf965429a5fd851cbf9de831e2a03ec3106382646` |
| Previous retained version | `067e51f1-ced0-48d6-87ab-0887df891080` |
| Username/password login | **ACTIVE** |
| Email and SMS login | **DISABLED**, no providers configured or needed |
| Paid service or hosting-plan upgrade | None |
| Applied migration | Additive `0011-roost-password-login.sql` only |

The active release and remote heads were checked before implementation and again before upload. No newer approved production/source changes were overwritten. The inactive candidate's original bindings, runtime and asset behavior, handlers and Studio Access configuration matched the live version; only the username flag and password secret were added. Cloudflare's settings endpoint reports latest-upload metadata/bindings even before traffic activation; the deployment/version API separately confirmed the old version remained active until the explicit activation.

The two new production authentication tables were empty after migration, and every original table fingerprint and schema remained identical before activation. Postdeployment, all customer/member records, recovery hashes, passkeys, sessions/session details, workspaces, orders, comments and original schemas remain unchanged. No account identity was reset, copied or merged. The new tables remain empty because no production test customers were enrolled. The only test-created production rows were three abuse-rate counters from one intentional failed login using a random unused synthetic username. That response was the expected generic HTTP 401 in approximately 0.56 seconds, confirming the actual edge password-verifier path runs without CPU/runtime errors. It created no member, password identity, grant or session and sent no message.

The active executable matches the tested build byte for byte. HTML (following its canonical `/index.html` → `/` redirect), app/customer modules and customer CSS match the checked-in candidate byte for byte. Fresh live desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium checks verified the username/password screen, Join fields without email/phone, password-manager autocomplete attributes, reset navigation, optional passkey view and guest shopping. All browser write requests were blocked; zero JavaScript errors, overflow or automatic WebAuthn requests occurred. No existing production session cookie was read or used for testing; returning-member behavior was tested with synthetic persistent contexts and disposable workerd/D1.

Studio and its private APIs retain the Cloudflare Access challenge. Access application fingerprints and every commerce setting remain identical. Public `/api/site` reports checkout disabled. Cash at Pickup remains OFF, and return credits were not activated. Pickup approvals/rescheduling, order tracking, products/inventory, payment/manual-verification logic, announcements, favorites and guest/member order behavior passed isolated regression checks. No real emails or SMS messages were sent, and no provider credentials/account/DNS configuration is required for this design.

| Final validation | Result |
| --- | --- |
| Full unit/service/security/database suite | 296 passed, 0 failed |
| Additional production-route/CSRF/Studio/all-device-logout regression | 1 passed |
| New username/password journeys across five profiles | 15 passed |
| Existing customer/passkey/recovery/guest/credits/cash/pickup browser regressions across five profiles | 65 passed |
| Exact compiled Worker in disposable workerd/D1, new password flow | Passed |
| Exact compiled Worker with password mode enabled through production routing, existing features and identity-preserving username setup | Passed |
| Read-only actual production browser journeys, five profiles | Passed |
| Actual edge verifier using one intentional failed synthetic login | Expected 401; no test account/session created |
| Exact deployed executable/assets, original customer data/schema and Access/commerce preservation | Passed |

Total: **377 automated cases**, two compiled edge-runtime smoke tests and production verification. The production smoke test initially found the new endpoints missing from the explicit public route allowlist; the required five password actions and authenticated all-device logout were added, then native production routing and a dedicated security regression passed. A cross-account recovery case also verifies recovery affects the code owner's account even when another account is signed in. No unresolved test failures remain. Physical biometric prompts remain outside automation and are never required for normal username/password signup or sign-in.

Actual live screenshots: [desktop sign-in](roost-password-login/live-signin-desktop-chromium.png), [desktop WebKit](roost-password-login/live-signin-desktop-webkit.png), [iPhone sign-in](roost-password-login/live-signin-iphone-webkit.png), [iPhone registration](roost-password-login/live-join-iphone-webkit.png). Synthetic candidate evidence: [dashboard](roost-password-login/dashboard-desktop-chromium.png), [reset](roost-password-login/reset-iphone-webkit.png).

Danielle has no provider, subscription or DNS setup remaining. New members select Join The Roost, choose a preferred name/username/password phrase, and save the recovery code. Existing members use Other sign-in options once, then add a username/password in their current Account Settings instead of creating another account. The 15-character password minimum permits simple memorable phrases; browsers can save and autofill them. Existing hosting and D1 quotas remain unchanged.
