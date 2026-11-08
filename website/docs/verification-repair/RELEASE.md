# Cross-browser email verification repair — prepared, not deployed

## Cause and scope

The active production Worker requires the `rr_roost_pending_<workspace>` cookie for registration verification and directs other browsers back to the registration browser. Gmail's external-browser selection loses that cookie, so a valid mailbox proof is rejected. Repeated manual resend cannot solve a browser mismatch. A synthetic reproduction with the original email-login module fails the new fresh-browser regression.

New-account verification now accepts the 192-bit random mailbox token independently of browser state. Only SHA-256 token hashes are stored; the existing 15-minute lifetime, conditional claim, guarded writes and transactional D1 batch remain intact. Concurrent token submissions create exactly one identity; transaction failure rolls back claim and account creation. Verification issues no login session. Existing-account email linking still requires the current password and recent original session, and never merges on profile email.

The UI consumes a verification link once on arrival, clears the fragment and in-memory token, displays a success confirmation, and offers password sign-in. Failure does not retry or resend automatically. Unknown, expired and consumed proofs have separate messages. Normal refresh cannot resubmit the proof. Successful verification hides the resend action on the confirmation screen.

Resend's sender, adapter, branded template, password derivation, rate limits, CSRF and business flows were not replaced. The eight-character/common-password-denylist policy was recovered exactly from the live Worker because the checked-in branch still had the earlier 15-character rule. Legacy customer UI hints were aligned with the deployed policy. Retired Studio owner-test paths are explicitly 404 regardless of flags; no owner-test UI or route was added.

## Validation

- Backend: 368 passed, zero failures, including new registration, duplicate registration, wrong passwords, separate-browser verification, concurrent replay, rollback, expiry, password-reset session revocation, persistence and logout.
- Browser: 11 passed, one intentional Chromium skip for a WebKit-specific test. Desktop Chromium, desktop WebKit and iPhone 13 WebKit emulation cover signup, email-link confirmation, sign-in, logout, persistence, reset, existing-account email linking and separate-profile replay. Explicit Chromium registration -> desktop/iPhone WebKit verification passes without storage transfer.
- Production-config build dry run passed. No upload/deployment was performed.
- Delivery is mocked in these isolated fixtures. No actual customers were used. Real Gmail delivery and physical iPhone Gmail -> Safari / Chrome handoff remain pending. Playwright's WebKit emulation is not a physical iPhone or Gmail.

## Current production evidence

Worker `rise-roost-website-production`; D1 `889a4b96-cabd-43d1-ad45-79f65b0052b0`. Active deployment `51639996-4de3-43d8-a389-e9a876ac90cb`, version `2602b005-6d7d-43cc-866e-f14cf5bc8fa0` at 100% when inspected. Password login true; email-login, auth-email-enabled, auth-delivery-verified and owner-test false. Both RESEND_API_KEY and ROOST_PASSWORD_PEPPER secret binding names exist; values were not retrieved or changed. Binding presence does not prove provider credentials are valid.

Private local backup includes live Worker source, settings, deployment metadata, full D1 SQL and affected authentication records. The D1 export restored successfully into a separate local SQLite database, `PRAGMA integrity_check=ok`, with all three pending registration proofs and the workspace present. SQL SHA256 `9a21f4dc16690b918dc7dfa700c43341216f9ced398a93ba2dc99eaeaa6a067e`, 171487 bytes. It contains database asset BLOBs; Cloudflare static-asset rollback relies on the retained deployed version. A separately restored static-asset release archive has not been verified. Do not describe this as a verified standalone full-site disaster-recovery archive.

## Safe deployment and activation plan

1. Obtain separate explicit approval for an isolated deployment and real delivery test to the approved inbox. Keep public signup disabled and retired owner-test routes closed. Provision the existing email adapter in the isolated environment through secret management; never expose secret values in chat, logs or Git. Verify one branded verification delivery and reset delivery, and complete physical iPhone Gmail -> Safari and Gmail -> Chrome checks. Record actual received-message evidence without recording bearer tokens.
2. Re-read the current live deployment and settings; abort if the baseline changed. Refresh and restore-check the database backup. Confirm retained Worker version and static assets can be rolled back. Compare/reconcile later production-only changes with this website branch before considering its rebuilt bundle deployable; the source branch predates several direct production edits. Do not blindly deploy its stale wrangler.production.toml variables.
3. Require explicit approval for production deployment separately from cleanup and public signup activation. Upload the reviewed repair while preserving every existing binding, secret, asset configuration, Access setting, custom domain and non-auth flag. Keep all public auth activation flags at their existing values for the first deployment. Verify password login and Studio protections; verify retired routes remain 404.
4. Only after delivery/device acceptance and explicit public-registration approval, set ROOST_EMAIL_LOGIN_ENABLED=true, ROOST_AUTH_EMAIL_ENABLED=true and ROOST_AUTH_DELIVERY_VERIFIED=true together. Preserve ROOST_PASSWORD_LOGIN_ENABLED=true and ROOST_AUTH_FREE_PLAN_CONFIRMED=true; retain WEBSITE_BASE_URL=https://rise-and-roost.com and both existing auth secrets. Keep ROOST_AUTH_OWNER_TEST=false, ROOST_SIMPLE_LOGIN_ENABLED=false and ROOST_DELIVERY_VERIFIED=false. Do not activate checkout, Marketing, order email or any retired test feature.
5. Smoke-test with only a confirmed disposable account and approved inbox. Confirm one email, successful cross-browser verification, no auto-login, password sign-in, logout, replay rejection and password reset. Observe error rates without logging tokens or passwords.
6. Roll back code to retained version `2602b005-6d7d-43cc-866e-f14cf5bc8fa0` and its associated assets if acceptance fails. Restore email-login/email-send flags to the recorded disabled values while leaving password login true and secrets intact. Rolling back reintroduces the browser-bound verifier, so signup must remain closed. No schema migration is needed; do not restore the whole database or delete newly legitimate accounts.

Production cleanup is a separate exact-record approval: the private cleanup report proposes only three expired, unconsumed registration proof rows. Legitimate Studio audit history and unattributed passkey challenges must remain. No cleanup or production record modification has occurred.

Status: code and isolated tests prepared; **not ready for public activation** until real delivery/device acceptance, production-source reconciliation and separate deployment/activation approval.

## Approved deployment preparation (2026-11-08)

The user approved cleanup T1–T3 and deployment, without requesting public signup activation. Cleanup completed in one guarded DELETE: exactly three rows removed, all other user tables unchanged, with a fresh restore-verified backup and private receipt.

Production-only changes are now reconciled for this release. Preserve the existing deployed module delivery for customer.mjs and the password-policy module; do not replace Cloudflare static assets or deploy the older whole-source build. The deterministic `scripts/prepare-verification-production.mjs` applies the auth repair and reconciled customer source to the backed-up live bundle and leaves every other byte unchanged. It also preserves the live resend cooldown while removing the original-browser requirement. `scripts/test-verification-bundle.mjs` runs the same synthetic authentication cases against that exact resulting API implementation; 15 passed. Reconciled source auth/production-gate tests: 17 passed. Reconciled browser tests: 11 passed, with one intentional WebKit-only case skipped on Chromium.

This is an update to the existing production implementation and its existing module-serving mechanism. No alternate owner-test route, auth endpoint or temporary sign-in method is introduced. Use the version upload API with inherited bindings/secrets and `keep_assets=true`, inspect the staged version, then deploy it at 100% while retaining the prior version for rollback. All signup/email activation flags remain disabled and password login remains enabled.
