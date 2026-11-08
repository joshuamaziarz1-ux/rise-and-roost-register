# Coordinated Roost release — 2026-11-07

**Latest continuation:** the separately gated email/Marketing implementation continues in [EMAIL-FEATURES-ACTIVATION.md](EMAIL-FEATURES-ACTIVATION.md) and [EMAIL-FEATURES-RECEIPT.json](EMAIL-FEATURES-RECEIPT.json). The original version-28 receipt and its validation below are historical evidence, preserved unchanged. Public authentication/signup and campaigns still require the documented live checks; the new Marketing adapter is implemented and mock-tested rather than claimed live-verified.

Integration branch: `feature/roost-coordinated-release`, based on reviewed `feature/roost-simple-email-login` at `4d6a38d`. That branch already contains the deployed transactional Resend work. Main was not used. All remote branches and open PRs were inspected. No other local editing process or worktree was present before this worktree was created.

## Independent gates

- Email authentication: the reviewed registration, verification, password login/reset, email changes and sessions are retained. The customer emails now use the official logo. **Live owner verification/reset tests have not run; activation is blocked.** Existing username/password configuration and all existing encrypted secrets are preserved. No additional generic permission is required after the documented checks pass.
- Pickup requests: new `PICKUP_REQUESTS_ENABLED` gate. Guests use their valid private tracking capability; members use authenticated ownership. Requests are conversation records in the existing order ledger, with original schedule, requested schedule, optional message and pending/approved/declined status. Danielle approves through the existing extension transaction and deadline calculation. Decline leaves the schedule unchanged. Studio attention, audit, order history and tracking carry the request without email. No parallel calendar or scheduling system is introduced.
- Marketing: Studio drafts, four templates, authentic product-photo selection, preview, subscriber status totals and immediate local suppression are implemented. Campaign delivery and tests are deliberately blocked server-side. **Resend Marketing contacts/broadcast delivery, provider results and owner test sending still require integration and permission verification. These are not represented as completed.** No promotional message is sent by deployment or by a draft save.
- Public signup has its own `MARKETING_SIGNUP_ENABLED` gate, off pending live confirmation checks. Confirmation delivery also requires `MARKETING_CONFIRMATION_EMAIL_ENABLED` and the separate confirmed free-plan gate. Signup is independent from membership/ordering. Consent is affirmative and recorded with time/source/text; confirmation is single use and expires after 24 hours. Unsubscribe works even when signup is off. No existing customer email is imported. Suppressed contacts are never automatically reactivated.

Marketing contacts and campaigns are additive fields in the existing versioned ledger; no schema migration is needed. Limits are 1,000 local contact records and 100 campaign drafts, with the existing 1.2 MB ledger bound. This local cap does not establish remaining capacity in Resend or count contacts created elsewhere. Confirmation mail shares the existing conservative transactional allowance and has an additional ten/day cap to preserve account-email capacity. It does not consume or establish a marketing broadcast allowance. Provider acceptance is not inbox delivery. No promotional fanout uses the transactional `/emails` endpoint.

## Backup and production preservation

Production was rechecked as 18 application tables and zero members. The earlier authorized test-account deletion was not repeated, and migration 0012 was not reapplied. No production schema or business record change is part of this release.

A fresh read-only export was encrypted, read back, decrypted and restored into a separate local database/media directory. All records and schema matched. Archive: `/workspace/roost-coordinated-backup/production-before-email-login.rrbk`, SHA-256 `2a63f725e2b486a80ac16b71e0c30f0f3c0ce7e5ef3aae2cf4700c4a71ef896b`. Its separate recovery key is retained privately at `/workspace/.roost-release-recovery/roost-coordinated-release.key`; no value is in Git or logs.

The two earlier backups and their recovery-key retention are documented in `ROOST-EMAIL-LOGIN-RELEASE.md`; those files are not present in this resumed workspace. Their references were preserved and no replacement/deletion was attempted. Their continued availability outside this workspace cannot be independently verified here. The new verified backup is a private workspace artifact, not offsite backup service.

Read-only table/schema fingerprints, Access configuration, active deployment and binding metadata are retained privately under `/workspace/release-audit`. Public source does not contain those records, credentials or private export URLs.

## Resend requirements

The owner's dashboard observations establish historical free-plan figures, not current usage. Do not upgrade any plan, replace `RESEND_API_KEY`, or expand its permissions silently.

1. Use authenticated Resend account access to verify the current free plans, remaining transactional usage, verified `rise-and-roost.com` sender, and recipient restrictions. This environment has only Cloudflare credentials; no authenticated Resend session or browser-control tool is available.
2. Complete the authorized owner-only verification/reset/sign-in/session/sign-out checks using the existing encrypted transactional secret and the documented owner-test gate. Confirm actual mailbox receipt; never infer it from a mock or earlier transactional test. Activate only after all separate conditions pass.
3. Inspect the existing key's scope in Resend. If it is sending-only, retain it for authentication/orders. Configure a separate appropriately scoped Marketing credential through Cloudflare's encrypted Worker secret settings, never chat or browser code. `RESEND_MARKETING_API_KEY` is the intended separate binding. Before implementing/activating delivery, verify the supported Contacts/Segments/Broadcast APIs against current provider documentation and the actual account, enforce confirmation/suppression during provider audience synchronization, and reconcile accurate results. Do not simply set a flag and assume this missing adapter exists.
4. Danielle must configure the accurate physical mailing address in Marketing. Live campaign testing requires authorized owner-only recipients; promotional sending requires her separate deliberate approval, audience review, final confirmation and idempotent delivery. These controls remain unavailable/blocked until the adapter and its tests are complete.

## Rollback

Before public email authentication activation, restore the recorded prior Worker version to roll back application changes. Leave all additive ledger fields and auth tables/records intact. Customer request messages remain visible in the existing Studio conversation workflow even to the previous implementation. Never restore an old database over later customer records. Disable pickup requests independently if needed. Do not roll publicly created email accounts back to a legacy-only recovery path; retain compatible endpoints when that future activation occurs.

Checkout, customer order emails, Cash at Pickup, return credits and marketing campaign delivery must remain disabled. Studio authentication and Cloudflare Access are unchanged.

## Validation

Results and deployment identifiers are recorded in the final release receipt. All fixtures use isolated databases and synthetic identities. Browser WebKit/iPhone profiles are emulation, not a physical iPhone Safari claim. No live customer email, marketing campaign, test order, member or payment was created in production.

### Reviewed candidate evidence

Application commit: `3ab008b676ecb8345179ee59025554cb068a54a4`. Compiled Worker SHA-256: `ff5f9ab8f99d73ef38d4f73fd5caf481426aeeeea1fbc24638d3932154dba9b9`. All 65 server/public file hashes were frozen and rechecked unchanged.

- 351 backend/security tests passed, including seven coordinated-release cases.
- New responsive component/Studio workflow checks have passing results on desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium: 15 distinct cases. Tests cover actual guest request → Studio approval → tracking update, drafts/previews and subscriber suppression, as well as default-unchecked consent and form width.
- Eight commerce browser tests and ten production-isolation browser tests passed.
- Both exact-bundle native workerd/D1 authentication checks passed, with mocked Resend, zero remote requests and zero remote writes.
- Read-only live baseline: Home, Shop, Roost and Cart passed on all five profiles (20 page checks); checkout was false and unauthenticated Studio redirected to Access. No form was submitted.
- Initial WebKit launches lacked the Playwright-matched executable. The matching official WebKit bundle was installed and all affected checks rerun successfully using the existing user-space libraries. Physical iPhone Safari was not tested.
- New integration-test setup initially selected a desktop-hidden mobile order card, shared an unnecessary fixed-port fixture and asserted a missing flag as literal false. These test assumptions were corrected to use visible controls, avoid the unnecessary fixture and explicitly set the disabled-email scenario. The actual responsive journey now passes on all five profiles.

The broad browser suite and deployment receipt are recorded separately when complete. Its first Chromium legacy-recovery case timed out waiting for Log Out after a passkey ceremony; the same unmodified case passed in isolation. No customer-authentication behavior was changed to mask that timeout.

## Production release receipt

**Partial coordinated release deployed:** pickup requests and guarded Studio Marketing infrastructure. The three-workstream objective is not fully complete: account-email activation and the Marketing delivery adapter/owner tests remain blocked/unfinished as described above.

- Application source: `3ab008b676ecb8345179ee59025554cb068a54a4`; later commits update documentation only. Draft PR: https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/22, stacked on the reviewed email-login branch. Main and other feature branches remain unmerged.
- Worker version **28**, `226d4ce9-4fdf-41bc-bd34-af6b131bbbc7`; deployment `1c7c79c0-cc04-4d19-8982-659309e047c5`, 100% traffic.
- Downloaded deployed executable is byte-for-byte identical to the tested artifact, SHA-256 `ff5f9ab8f99d73ef38d4f73fd5caf481426aeeeea1fbc24638d3932154dba9b9`. Nine public entry/helper/logo assets match source. `/studio.mjs` redirects to Access and was not retrieved anonymously; the protected Studio UI was tested only with synthetic local owner identities.
- All 18 application-table record fingerprints, schema and Access configuration match baseline. Every original binding and both encrypted secret bindings were preserved. Only the four documented independent pickup/marketing gates were added. No migration, repeated account deletion, production customer/order/payment fixture or unauthorized customer-record change occurred. Production still has zero members.
- `PICKUP_REQUESTS_ENABLED=true`; `REAL_CHECKOUT_ENABLED=false`, `ORDER_EMAIL_ENABLED=false`, `MARKETING_CAMPAIGNS_ENABLED=false`, `MARKETING_SIGNUP_ENABLED=false`, `MARKETING_CONFIRMATION_EMAIL_ENABLED=false`. Authentication activation remains unchanged/off. Existing Cash at Pickup and return-credit controls remain unchanged/off.
- Final broad browser run: **284/285 passed** on its first run; the one Chromium legacy recovery timeout passed in isolation, and its other four profiles passed the broad run. All **664 distinct backend/browser cases have passing results**, including 351 backend, 285 main browser, ten additional Studio/pickup browser cases, eight commerce and ten production-isolation cases. This does not represent a clean first-pass broad run. Two exact-bundle native workerd/D1 smokes also passed.
- Post-deployment public checks passed all 20 read-only page/profile combinations: Home, Shop, Roost and Cart on all five profiles, with no JavaScript errors/overflow, checkout false and Studio redirected to Access. No physical iPhone Safari claim is made.
- No live authentication or marketing email was sent or represented as received. The earlier owner-confirmed transactional test remains separate evidence.

Machine-readable sanitized receipt: [coordinated-release/receipt.json](coordinated-release/receipt.json). Private full audit evidence remains outside Git under `/workspace/release-audit`. Public asset verification initially encountered Python HTTP-client denials; verification succeeded with the same Node HTTP transport used by the passing public browser checks. A direct Studio-module comparison correctly encountered Access; it was excluded from anonymous byte comparisons rather than bypassed.
