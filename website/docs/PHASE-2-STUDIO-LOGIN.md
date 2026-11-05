# Phase 2 Studio login repair

Prepared November 5, 2026 (America/New_York). Scope: restore both existing owners' Studio access without changing Cloudflare Access or production data. Phase 3 is outside this change.

## Confirmed cause

The existing `rise-and-roost.com/studio*` Access application issues application sessions lasting **730 hours**. Its owner allow policy has no shorter session override. The deployed Worker instead rejects any JWT whose `exp - iat` exceeds 86,400 seconds, and independently sets JOSE `maxTokenAge: '24h'`.

Synthetic RS256 tokens reproduce the reported JSON exactly: both configured owner slots succeed on `/studio` and `/studio/api/studio` with 24-hour credentials and fail with HTTP 403 when the same signed identities receive a 730-hour expiration. This happens before database access. Leaving the age check at 24 hours would also break an otherwise valid session after one day.

Read-only inspection confirmed that the two Worker owner emails match the Access allow policy after case normalization, the issuer is the expected team domain, and the audience matches the Studio application. No owner's verification code or real authentication token was requested or used. The frontend already uses `/studio/api/*` and same-origin credentials. Production creates no independent Studio cookie or database owner session.

[Cloudflare's session documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/) establishes that the policy duration defaults to the application's duration and controls the signed application token's expiration.

## Implementation and source provenance

- Align both JWT age and lifetime ceilings with the **existing 730-hour Access session**. Shorter signed expirations still expire at their exact `exp`; no grace period is added to expiry.
- Require `exp > iat` in addition to existing integer, future-issued-at, signature, issuer, audience, application-type, subject, and owner-email checks.
- Retain per-request RS256 verification against the fixed issuer's JWKS. Unsigned tokens, substituted algorithms, wrong keys, wrong issuers/audiences, malformed claims, expired tokens, and unauthorized owners remain rejected.
- Add synthetic unit, browser, expiration/renewal, and Phase 1 transport regression coverage; exercise the actual local Worker bundle with a 730-hour token.

Branch: `security/phase-2-studio-login`, based on website branch `codex/production-launch-readiness` at `31312a0`, followed by the restored deployed Phase 1 transport correction (`669a260`). The Phase 1 branch/commit was absent from the remote checkout. Its Worker source was recovered verbatim from the active deployment's source map. All 16 mapped application modules were reconciled against the website base; only that Phase 1 Worker correction differed. The Phase 2 candidate changes only `server/production-access.mjs` relative to the active deployment; every other mapped application and dependency source remains identical.

No static assets, owner allowlist, Access policy/session setting, DNS, secret, payment configuration, D1 binding, schema, or production record is changed. Existing HTTP redirects, HSTS, other security headers, `security.txt` handling, canonical-host restrictions, CSRF controls, checkout lock, and ordering pause remain intact.

## Automated validation

| Check | Result |
| --- | --- |
| Full unit suite | 170 passed, no failures/skips |
| Main browser suite, desktop Chromium | 24 passed |
| Production browser suite, desktop Chromium and iPhone WebKit | All 10 cases passed; one existing QR-alert timing case passed on isolated retry after initial matrix result of 9/10 |
| New production Studio login browser cases | All four passed on the first full matrix |
| Commerce browser suite, desktop Chromium | Four passed |
| Production dry-run bundle | Passed |
| Local production guard Worker smoke | Passed before storage/asset access |
| Local production launch Worker/D1 smoke | Passed with a signed 730-hour synthetic owner token; zero remote requests/writes |
| Actual production configuration, evaluated offline | Valid, both owner slots retained, checkout disabled |
| Candidate comparison helper | Accepts identical configuration and rejects synthetic binding drift |
| Whitespace validation | Passed |

New JWT cases include both synthetic owners, mixed-case email matching, fresh and older-than-24-hour sessions, exact expiry, renewal, lifetime/age above the 730-hour ceiling, missing credentials, email-header/cookie substitution, signature/algorithm tampering, wrong issuer/audience, missing/malformed identity/time claims, private page/API navigation, distinct audited actors, and absence of local owner sessions. Browser cases retain unsaved forms through expiry and reauthentication. Mutation tests use disposable local databases and intercepted synthetic payment destinations.

## Deployment procedure and safeguards

The active baseline is freshly verified as `2e7ba726-ce89-4354-b62a-33dec9033a28` at 100% traffic. Its Worker SHA-256 is `f01f55761f26951a94f104cd96273fde22ca39e651dc2308edcd929ec17d2be7`.

The frozen Phase 2 bundle is 1,291,027 bytes, SHA-256 `a2a81ad4da597d223ed4d51677d3f18961e1446b8c91d0113c8f1c848cd26c13`. The checked-in preparation TOML is used only for offline bundling. Upload metadata is reconstructed privately from the actual active version, preserving all 16 bindings and their values/IDs, reusing existing assets with `keep_assets: true`, and retaining compatibility/runtime/asset routing. Private evidence and metadata are outside Git at `/workspace/phase2-private`; they contain owner configuration and must not be published.

Before upload and activation, re-read active deployment and configuration, compare the frozen artifact, verify unchanged Access/DNS/domains/routes/settings, obtain read-only D1 fingerprints, and check public routes and anonymous Studio challenges. Create an inactive version through the versions API, inspect its returned bindings/runtime/assets/handlers, and activate only after comparison succeeds. Never deploy from the incomplete preparation TOML.

Rollback is an application-only traffic switch to the verified baseline version using the deployments API. It requires no database restore or modification and retains HTTPS/Access protections. A serious post-deployment regression requires rollback after checking for concurrent configuration drift.

## Production result

Deployed successfully on **November 5, 2026, at 9:52 a.m. EST**.

- Worker version: `5bf5f229-8f34-4935-8699-4c6a6d78d055`, confirmed at **100% traffic**.
- Deployment ID: `57b0d6ba-dd66-4ce1-b9e5-5e473ac6ff28`.
- Application source commit: `0e1db86ddec07d1e055b82334552b87a1f37f517`.
- The inactive candidate's downloaded code matched the frozen artifact before activation. The active code matched that same hash after deployment.
- Candidate and active comparisons preserve all **16 bindings**, both owner identities, D1 identity, Access issuer/audience, runtime/compatibility settings, existing assets/routing, and handlers. Access application/policies, domains, routes, DNS, `workers.dev`/preview settings, TLS mode, and Always Use HTTPS compare unchanged. No security-setting change was required or made.
- HTTPS homepage, shop, basket, and `/api/site` returned **200** with HSTS. Checkout remains disabled and ordering paused.
- Anonymous `/studio`, `/studio.mjs`, `/studio/api/studio`, and `/studio/api/manage/snapshot` still return **302 Cloudflare Access challenges**. Protected site/export API routes also challenge requests carrying synthetic forged assertions. Legacy `/api/manage/snapshot` and `/api/studio` return **404**.
- HTTP `/`, `/api/site`, and a nonexistent path return **308**; `/studio` retains the existing **301**. Redirect checks on both apex and `www` preserve their hostname, path, repeated parameters, encoded values, and empty parameters. HTTPS `security.txt` retains its plain-text **404**.
- Fourteen core live checks and eleven additional redirect/unauthorized-route checks passed after deployment.
- **Production D1 was not modified.** Read-only schema/content fingerprints and row counts for **all 12 application tables** match the baseline exactly before upload, before activation, and after deployment. Every SELECT response reports zero rows written and no database change. No migration, reset, reseed, restore, payment action, or production business-data write occurred.
- The only production mutation requests were one inactive Worker version upload and one traffic activation. No rollback was needed; the verified Phase 1 version remains the prepared application-only rollback target.

The environment's default Python user agent received a pre-existing Cloudflare bot rejection on public pages. Normal verified HTTPS requests with the curl user agent succeeded; no Cloudflare setting or TLS verification was changed to perform these checks. Physical devices and Danielle's authenticated production session were not used.

## Danielle's verification

1. Open [Website Studio](https://rise-and-roost.com/studio) and reload once to replace a previously displayed JSON error.
2. If Cloudflare asks, enter your own existing authorized email and complete the email one-time PIN yourself.
3. Confirm the Studio dashboard loads, then open Products, Orders, and Calendar and check that the connection shows Connected. Viewing these pages requires no business-data edits.
4. If the browser retains a stale Access session, open [Cloudflare sign out](https://rise-and-roost.com/cdn-cgi/access/logout), then return to Studio and complete your own email verification again. Sign out only after preserving any unsaved edits.

Synthetic testing verifies the repair and live anonymous checks verify protection. Danielle's real owner login remains unconfirmed until she completes her own sign-in. There is no security/configuration blocker identified by this investigation.
