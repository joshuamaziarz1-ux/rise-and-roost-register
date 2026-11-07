# Roost email-or-phone login

Status: implementation behind a fail-closed gate. Real email and SMS delivery are NOT configured or verified. Existing passkey welcome/login remains the production fallback. No subscription, sender number, DNS record or provider account was purchased or activated.

## Production inspection

Started from `fix/roost-login-experience` at `11a4a761f3a26a8682224619bc60f897a8260666`, including deployed implementation `cc1d059`. Default main is the older register application and is not the production base. Every application source in the active Worker source map matched the branch HEAD before implementation. Active version at inspection: `6aad782d-3aa7-4f59-8016-213a2f2447c7`, deployment `4994f42b-e98e-430a-a170-edb866e18226`.

Production bindings contain no Resend key, email sender, Twilio credentials or SMS sender; order email is also disabled. Existing notification code has a Resend adapter but no usable production delivery configuration. D1 has one member, one passkey, two sessions and no verified-contact identity table. The member has email and phone pickup details; both are unverified. No production customer record was used for testing or changed.

## Architecture

`server/contact-login.mjs` handles contact recognition, delivery adapters, send budgets and transactional authentication. One field accepts normalized lowercase email or US ten-digit phone formats and stores phone identities as +1 E.164. International numbers, extensions and malformed numbers are rejected. SMS delivery can fail for landlines or unavailable recipients; the provider must accept delivery before the code screen appears. Acceptance is not proof of arrival; actual code entry proves possession.

Codes use rejection-sampled cryptographic six-digit randomness. Only challenge-specific HMAC-SHA256 verifiers are persisted, with a separately configured secret pepper. Challenges are bound to workspace, origin and a random HttpOnly cookie; expire in five minutes; permit at most five failed attempts; and are consumed atomically with session/contact/account writes. Replay or a failed transaction cannot create partial accounts. Verification for new contacts grants a short continuation in the same five-minute challenge; a preferred name completes registration. No account exists before contact verification.

Resends invalidate previous codes. Atomic sliding contact cooldown: 60 seconds; sends: five per identity/hour, twenty per IP/hour and two hundred globally/hour. Verification requests: one hundred per IP/hour plus five incorrect guesses per challenge. Hour budgets use fixed windows, so adjacent windows can permit two budgets in quick succession; the sliding contact cooldown still applies. Provider failures consume send budgets, mark challenges unusable and return friendly errors. No provider payloads, codes or raw provider errors are logged. Mock delivery is dependency-injected only by test fixtures, never selected by a production flag or HTTP endpoint.

Verified identities use a separate unique `(workspace_id, contact)` table; pickup fields cannot authenticate. A verified contact that matches legacy pickup details cannot create or claim an account. Its owner must use the existing passkey/recovery process and explicitly verify the contact in Account Settings. Linking requires authentication within ten minutes, the same still-valid session at challenge creation and completion, and code possession. A verified identity already owned by another member cannot be transferred or merged. Ambiguities require existing recovery or support. No passkeys, recovery credentials, sessions, orders or member IDs are migrated automatically.

Sessions reuse `customer-sessions.mjs`: rolling 30-day inactivity, maximum 90 days; server verifiers and HttpOnly/SameSite=Strict cookies, Secure on HTTPS. Tokens never enter localStorage. Logout revokes the server session and clears the cookie; all-device logout revokes every session for that member. Passkeys remain an explicit secondary action. Guest shopping, original recovery and device controls are retained. Studio authentication is unchanged.

## Danielle's setup before activation

1. Approve delivery providers and their recurring/usage costs. Implemented adapters: Resend transactional email and Twilio Programmable SMS. Existing Resend code can be reused; it does not establish an existing paid account or sender verification.
2. Configure an approved sender domain in Resend, publish its supplied SPF/DKIM records, verify domain status, and create a narrowly scoped sending API key. Set `ROOST_EMAIL_FROM` to the verified sender. Store `RESEND_API_KEY` with Cloudflare Worker secrets, never in git.
3. Configure a Twilio account, an approved SMS-capable US sender and the applicable A2P 10DLC brand/campaign or toll-free verification. Approve number, registration, recurring campaign, per-segment and carrier fees. Set `ROOST_SMS_FROM`; store `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` as Worker secrets. Confirm the production account can send to real US recipients rather than only trial recipients.
4. Store a cryptographically generated, at least 32-character `ROOST_CODE_PEPPER` as a Worker secret. Protect it separately from D1 exports. Rotation invalidates pending codes without changing remembered sessions.
5. Back up and apply additive `migrations/0010-roost-contact-login.sql` to `rise-roost-production-db`. Do not backfill identities from pickup details. Reapplying the migration is safe. The disabled release does not need to apply it to production.
6. Run authorized, controlled real delivery checks for both channels, inspect provider domain/account/sender readiness and accepted/delivered status, and have the intended recipients confirm arrival. Automated tests and deployment checks must continue using mocks and must never send real codes. Delivery has not been verified by this implementation task.
7. After all checks, set BOTH `ROOST_DELIVERY_VERIFIED=true` and `ROOST_SIMPLE_LOGIN_ENABLED=true` on the exact production Worker. Missing either flag, pepper, email configuration or SMS configuration keeps the existing login active. Recheck current deployment, source and settings before release. No partial phone support is advertised.
8. Verify returning sessions, optional passkeys, guest shopping, Studio Access and unchanged commerce settings. Turning `ROOST_SIMPLE_LOGIN_ENABLED=false` immediately restores the original entry flow without deleting identities or revoking existing sessions. Retain the prior Worker version for rollback.

Production configuration should be generated from freshly inspected live settings; the checked-in `wrangler.production.toml` intentionally retains its historical launch guard and must not be blindly deployed. Preserve all live bindings, Access settings, assets configuration, schedules and disabled checkout. No production data mutations are needed for disabled deployment.

## Costs

No purchase was made. Resend offers a free transactional tier; public pricing currently lists 3,000 emails/month and 100/day, with entry paid service around $20/month for 50,000. Confirm the account's current quote and overage policy before approval: https://resend.com/pricing . Twilio US local numbers typically start at $1.15/month, with additional SMS segment/carrier charges, one-time registration and recurring campaign fees: https://www.twilio.com/en-us/phone-numbers and https://www.twilio.com/en-us/sms/pricing/us . These are indicative list prices, not an approved quote or a promise of availability. Danielle must approve the selected account's actual total. A2P registration and DNS verification may add lead time. Cloudflare Workers/D1 usage continues under the existing account plan.

## Test evidence

Synthetic contacts and mock providers only. `tests/contact-login.test.mjs` covers recognition, verification, expiry, replay, wrong guesses, budgets, delivery failure, rollback, persistent sessions, logout/all devices, isolation, legacy takeover prevention, verified linking and real signed passkey compatibility. `playwright.contact-login.config.mjs` runs the new journey in desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. Virtual CTAP2 and a WebKit signing fixture test WebAuthn server verification; physical biometric hardware is not claimed tested. Screenshots in `roost-simple-login/` are synthetic local candidate evidence, not production activation evidence.

## Verified disabled production release — November 7, 2026

- Branch: `feature/roost-simple-login`.
- Runtime implementation commit: `4a395e4999e9440b486941db3c4ded6cf901180e`.
- Worker: `rise-roost-website-production`.
- Active version, 100% traffic: `99a47674-dcf3-4754-8d33-28cca7fc056c`.
- Deployment: `bb0d120c-16af-4520-915e-1500c15ee2f1`.
- Exact deployed executable SHA-256: `24d90d2a82488878104b40f68f60302c96a9402c98ad801fe0d853553b640b25`.
- Previous version retained: `6aad782d-3aa7-4f59-8016-213a2f2447c7`.
- `ROOST_SIMPLE_LOGIN_ENABLED=false`, `ROOST_DELIVERY_VERIFIED=false`.
- Email: Resend adapter implemented and mocked; credentials/sender/delivery NOT configured or verified.
- SMS: Twilio adapter implemented and mocked; credentials/sender/delivery NOT configured or verified.
- D1 migration deliberately NOT applied to production while disabled; no production schema or customer/business data changes.

All existing bindings, asset/runtime behavior and handlers were compared before activation; only the two false flags were added. The active deployment, production settings, every table fingerprint/schema and Access application were checked again before activation. Remote heads had no concurrent changes beyond this task's new branch. Postdeployment executable and `customer.mjs`, `customer.css`, `app.mjs`, `style.css` match the tested artifacts byte for byte. All thirteen original application tables retain identical fingerprints and schema, including members, passkeys, recovery hashes, sessions, workspaces, orders and comments. Access configuration and every commerce setting remain identical. Checkout remains disabled; Cash at Pickup remains OFF; return credits were not activated.

Fresh read-only public desktop and mobile Chromium checks followed Home → The Roost → Sign In → Back → Continue as a Guest. Existing welcome/passkey actions and guest shopping work; the single-field screen is deliberately absent. Zero JavaScript errors, horizontal overflow or write requests occurred. `/api/roost/me` reports `simpleLoginEnabled:false`; `/api/site` reports checkout disabled. `/studio` and `/studio/api/manage/snapshot` return the Cloudflare Access challenge. No real member was signed in for production testing; returning-member behavior is verified with isolated synthetic browser and workerd/D1 fixtures, without reading or using real session cookies.

| Final validation | Result |
| --- | --- |
| Clean unit/service/security/database suite | 283 passed, 0 failed |
| New single-field journey, five browser profiles | 5 passed |
| Existing customer/passkey/recovery/guest/credits/cash/pickup regressions, five profiles | 65 passed |
| Final compiled production Worker in actual local workerd/D1 | Passed; zero remote requests/writes |
| Compiled enabled contact flow in local workerd/D1 with mocked outbound delivery | Passed; code/session/atomic cooldown/replay/logout checked |
| Production executable/assets, Access and data preservation | Passed |

Total: 353 automated cases plus two local edge-runtime smoke tests. Early failures were corrected: the matching WebKit executable was installed, its test authenticator was initialized before navigation, and schema/backup tests were updated to include the two additive tables. The clean final runs above have no unresolved failures. No automated or production-verification check sent real email/SMS. Physical biometrics remain outside automation.

Candidate screenshots (synthetic, enabled locally): [desktop welcome](roost-simple-login/welcome-desktop-chromium.png), [iPhone welcome](roost-simple-login/welcome-iphone-webkit.png), [code entry](roost-simple-login/code-iphone-webkit.png), [synthetic dashboard](roost-simple-login/dashboard-desktop-chromium.png).

Actual production after deployment (feature disabled): [desktop](roost-simple-login/production-disabled-desktop.png), [mobile](roost-simple-login/production-disabled-mobile.png).

Danielle's remaining actions are the provider/cost approval, sender/domain configuration, secure credentials, additive migration and controlled real delivery checks listed above. Only after both channels are genuinely ready should both gates be enabled in a freshly reviewed production release. Existing working authentication remains available throughout.

## Follow-up: explicit passkey wording

The fallback button previously said “Sign In Securely” despite offering only WebAuthn. Runtime asset commit `1692214` changes it to “Sign in with a Passkey” and explicitly states email/phone sign-in is unavailable while the delivery gate is closed. The native Safari prompt is still expected when customers deliberately select passkeys. No code automatically invokes WebAuthn when opening The Roost or its sign-in view.

Five existing entry/cancellation/recovery/guest browser cases passed across all five profiles. Production version `d31565e8-0383-4e12-9cb3-690b790f9cf7`, deployment `3dd08743-625b-4b16-a1c6-e949762a5d5e`, serves the wording change. Candidate resources (including executable etag, all bindings, runtime and handlers) matched the preceding production version exactly. All production table/schema fingerprints, Access configuration and commerce settings remained unchanged. Read-only public desktop/mobile checks verified the explicit label, availability message, guest navigation, zero JS errors and zero write requests. Both login flags remain false; provider configuration is still outstanding.

Live sign-in screenshots: [desktop](roost-simple-login/production-explicit-passkey-desktop.png), [mobile](roost-simple-login/production-explicit-passkey-mobile.png).

## Follow-up: refresh versioned entry modules

Both apex and www returned the corrected customer module, but the reported browser screen still showed the old text. Added content-derived version queries to the HTML application script and its customer module import, so fresh navigation requests distinct module URLs. This does not activate email/SMS verification. Runtime asset commit `930ed2e`; Worker version `067e51f1-ced0-48d6-87ab-0887df891080`; deployment `8fd467e9-4cd0-4d06-8c84-60cdbf7d0116`. The executable and every binding/runtime resource match the preceding version exactly.

Five entry/browser regressions passed. Read-only live desktop Chromium, desktop WebKit and iPhone WebKit verified `/app.mjs?v=d08e8c5dbe66` and `/customer.mjs?v=e744885a4c55`, the explicit passkey label and unavailable-delivery notice, guest navigation, zero JS errors/overflow and zero write requests. No WebAuthn request occurred on opening welcome or the sign-in view. Customer/member/credential/session/workspace tables, commerce settings and Access were unchanged. One additional authentication challenge appeared during the verification window; the verification browsers blocked all write requests, and no production records were reset or used for testing.

Fresh navigation: https://rise-and-roost.com/roost?release=d08e8c5dbe66

Live screenshots: [desktop WebKit](roost-simple-login/versioned-signin-desktop-webkit.png), [iPhone WebKit](roost-simple-login/versioned-signin-iphone-webkit.png).
