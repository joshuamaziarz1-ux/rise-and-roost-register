# Verification repair deployed — 2026-11-08

The user approved the exact T1–T3 cleanup and deployment. Both are complete. Public registration was not activated.

## Deployment

- Website: https://rise-and-roost.com
- Worker: `rise-roost-website-production`
- Deployed source: `46bddeb` on `feature/roost-coordinated-release`, including repair `2cf0ad4`.
- Cloudflare version: `a835f2e5-c6cd-430c-b47c-b4df569126cd`, 100%.
- Deployment: `6e399d3f-92fe-4013-b532-ef3df8c1d924`.
- Exact deployed Worker SHA256: `7f2d1d4d1d7c9a261abb126876ded905c1376beb45e6ae328e35bd389fee660b`. Downloaded active source matches the tested release byte-for-byte.
- Previous version retained for rollback: `2602b005-6d7d-43cc-866e-f14cf5bc8fa0`.

The release preserves direct production edits and the existing customer-module delivery mechanism. No alternate authentication route was introduced. Static assets were retained using `keep_assets=true`; all runtime settings and binding values/names, including both auth secret bindings, matched the original production version.

## Approved cleanup

Exactly three expired, unconsumed registration proofs T1–T3 were deleted in one statement guarded by all three full-row matches and zero customer-account dependencies. A fresh full D1 export was restored locally and passed integrity verification before deletion. Every other user table was unchanged, including legitimate Studio history and all fourteen unattributed passkey challenges. No customer, business, owner-access or email-provider data was removed.

Cleanup completed at `2026-11-08T05:13:43Z`. Private original-row backups, SQL export, before/after table snapshots and the audit receipt remain outside Git. No credentials or token values are included in this report.

## Verification

- Prior full backend regression: 368 passed.
- Reconciled source authentication/production-gate cases: 17 passed.
- Exact production-bundle authentication cases: 15 passed, including cross-browser verification, replay prevention, transaction rollback, login and reset.
- Reconciled browser lifecycle/cross-browser cases: 11 passed; one WebKit-only check intentionally skipped on Chromium. Desktop Chrome, desktop WebKit and iPhone WebKit emulation were exercised.
- Live root, Shop, Basket, Roost HTML, app module, password-policy module and logo bytes match pre-deployment checksums.
- Live customer module exactly matches the repaired source.
- Live auth metadata reports password login enabled, email login disabled, registration paused; a synthetic disabled-signup request returned 503 and created no records.
- All user tables matched their post-cleanup snapshot after deployment and live checks.
- Unauthenticated Studio test-route requests still hit the existing Cloudflare Access login gate (302 to the unchanged Access team); the downloaded deployed Worker contains the unconditional 404 origin closure. No owner credentials or Access settings were changed.

## Remaining activation checks

Real verification/reset delivery to an approved inbox and physical iPhone Gmail -> Safari / Chrome handoffs remain unconfirmed. No email was sent during this deployment. Public signup/auth email flags remain disabled, owner-test remains disabled, and password login remains enabled. Further public signup activation requires the remaining acceptance checks and explicit approval.

Rollback uses the retained previous Worker version and its assets while keeping registration disabled; it requires no schema migration or full-database restore.
