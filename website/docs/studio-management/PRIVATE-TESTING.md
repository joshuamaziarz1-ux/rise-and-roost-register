# Remembered Cloudflare Access sessions for Studio testing

## Current rollout status

The Access implementation is prepared but **not activated or deployed**. The experience preview still uses its existing secure owner authentication. No hosted workspace, product, order, photo, saved credential or session was created, reset, merged, deleted or replaced for this change. The original beta and production services remain untouched.

The existing account API token verifies as active and can read the preview Worker settings. Access organization discovery and attempted organization creation returned HTTP 403, code 10000, `Authentication error`. Application discovery returned HTTP 403, code 9999, `access.api.error.not_enabled`. No Access organization, provider or application was successfully created. The required account-scoped API permissions are:

- **Access: Apps and Policies — Edit**
- **Access: Organizations, Identity Providers, and Groups — Edit**

Add these to the existing token for the same account; do not replace its value, request general administration, change billing or grant DNS access. If initial Zero Trust onboarding subsequently requires a plan choice, the account owner must select **Free**. Do not purchase a subscription or accept upgrades. Cloudflare documents a Free plan supporting up to 50 users; this test requires two. The account's actual entitlement must be checked during onboarding.

## Testing experience

The approved testers open the existing preview's `/studio` directly. Cloudflare verifies each approved email initially, outside the Studio UI, then remembers that browser for an application/policy session of up to **30 days** (`720h`). A valid session opens the dashboard immediately. No Studio workspace ID, private key, new workspace or Studio account is needed.

Verification can be required again after session expiry, Access logout, storage clearing or use of another browser/device. A temporary testing expiry can shorten access. Private browsing does not provide lasting remembered-device behavior. Phones can move between work, home, Wi-Fi and cellular networks: **there are no IP restrictions**. Only the two explicitly approved email identities are permitted; their addresses remain private outside Git.

Cloudflare's one-time PIN provider handles authentication email. This does not enable customer/order email, Descope, permanent owner accounts or a production launch. Actual PIN delivery, physical-device behavior and an activated gate must be verified separately.

## Authorization boundary

Protect the **entire exact hostname** `rise-roost-experience-preview.joshua-maziarz1.workers.dev` with one self-hosted Access application and one Allow policy containing only the two exact approved emails. Do not protect all Workers, add domains or account-wide restrictions, allow email domains/everyone, or add Bypass/service-token policies. The customer preview is private to testers too; its approved design remains unchanged.

The Worker independently checks every request before **any asset, page or API**. Cloudflare documents that Static Assets do not propagate `ctx.access` through their internal router, so explicit JWT verification is required. The Worker requires:

- The exact HTTPS preview host, expected D1 marker and existing main workspace, review/management/customer flags enabled and external order email disabled.
- A signed `Cf-Access-Jwt-Assertion`, verified with Cloudflare's HTTPS team-domain JWKS using `jose`, RS256, exact issuer/audience, expiry, issued-at, subject, application-token type and exact approved email.
- The private `PREVIEW_TESTER_EMAILS` JSON-array Worker secret. A claimed email/IP/forwarded header, owner cookie, Access cookie alone or client JSON cannot grant Worker access.
- An explicit UTC testing expiry no more than 31 days ahead. Missing/bad configuration, expired/revoked identity or failed key verification fails closed. Signing keys are cached briefly; rotated key IDs are supported.

An internal unforgeable grant fixes management to the **existing main preview workspace**. Other workspace selection, creation, login, logout and device-pairing APIs are disabled in temporary mode; no owner credential or application session is minted. Audit records identify the verified tester. Saved hashes and other private workspaces remain intact. Same-origin JSON/CSRF checks remain. All active-mode responses are private/no-store; Worker version preview URLs stay disabled.

## Setup and activation

1. Keep both approved addresses in a mode-0600 JSON file outside Git, shaped as `{"emails":["first@example.test","second@example.test"]}`. Never commit real addresses, credentials, tokens or Access snapshots.
2. Review the plan using `python website/scripts/configure-preview-access.py --testers /private/testers.json --state-dir /private/access-state`. The default makes no network calls or changes.
3. Once required permissions work, rerun with `--apply`. The helper first verifies the **actual deployed** preview D1 binding/main workspace, external email disabled and version preview URLs disabled. It can create an Access organization, OTP provider and exact-host application; it never calls billing, DNS, D1, workspace or Worker mutation APIs. It saves private snapshots and refuses to overwrite existing app/policy configuration. It will not add an OTP provider to an organization with unrelated apps that might inherit a changed login method. Investigate unexpected configuration before proceeding.
4. Verify the live application/policy: exact host, exactly two approved emails, no broad/bypass/service rules, OTP provider and `720h` app/policy sessions. Keep existing global organization/session settings unchanged. Confirm an unverified external client is denied or redirected to the correct Access team **before** enabling direct Studio access.
5. Capture a fresh read-only preservation baseline and private preview backup. Verify `rise-roost-experience-preview-db` (`21352b95-d7f6-406f-8527-4b8dbcebf1bf`) and `PUBLIC_WORKSPACE_ID = 2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204`. Do not seed/migrate/reset data. The actual binding must be checked; an application marker alone is insufficient.
6. Privately install only `PREVIEW_TESTER_EMAILS` on the preview Worker while direct mode is off. In `wrangler.experience.toml` only, set `PREVIEW_ACCESS_MODE = "cloudflare-access"`, `PREVIEW_DATABASE_ID`, `CF_ACCESS_TEAM_DOMAIN` (HTTPS issuer), `CF_ACCESS_AUD` and a near-term ISO-UTC `PREVIEW_ACCESS_UNTIL`. Retain `preview_urls = false`. Test/bundle, review the exact target, then deploy only `deploy:experience` after policy verification.
7. Run denial-only hosted probes using the `[verify-access-preview]` CI marker. They check pages/assets/metadata/read APIs and deliberately invalid product/upload requests. They never create a workspace/order, authenticate a tester or edit business records. **Do not use `[verify-studio-preview]`**, whose older hosted suite creates synthetic workspaces.
8. Each tester opens `/studio` on their actual iPhone/Mac, verifies email at Cloudflare once and checks remembered access by closing/reopening the tab. Use independent devices to check dashboard access and live saves appearing on `/shop`. Automated synchronization tests use local ephemeral fixture databases; any hosted edit must use existing approved test records and preserve prior content/history.
9. Recompare pre-existing workspace/product/order/photo/member/comment data, the original beta deployment/settings and the actual preview binding. Report hosted/physical results separately from local simulations.

## Restoring owner authentication

Set `PREVIEW_ACCESS_MODE = "off"` or remove it and deploy **only the experience preview**. Original saved credential hashes and secure owner session rules become required again. The external gate can remain during rollback review. An expired testing window stays blocked until deliberately renewed or rolled back. Permanent owner accounts/passkeys/recovery remain separate and require both owners' testing and approval.

## Verification

The backend suite passes **93 tests**, including ten Access cases covering real RSA signatures, claim/issuer/audience checks, signed outsider rejection, forged headers/cookies/grants, missing configuration, key outage/rotation, independent tester identities, CSRF, unchanged credentials, fixed existing-workspace routing, guest orders, publication and restored original authentication.

The Access browser suite contains **15 cases** across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. It covers signed independent/remembered sessions, no old login UI, changing networks, cross-session product saves, denied writes, renewal preserving unsaved fields and identical customer Home/Shop pixels. Its loopback-only adapter simulates the Access edge with ephemeral signing keys; the Worker verifies real signatures. No debug identity mechanism is deployed. Full regression/CI results belong in the PR. Actual Cloudflare OTP delivery and physical-device sessions remain unverified until activation.

## Official references

- [Protect Workers with Access](https://developers.cloudflare.com/workers/configuration/access/), including the Static Assets limitation.
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/).
- [Session management](https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/), including the one-month maximum.
- [One-time PIN provider](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/).
- [Getting started FAQ](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/), including plan selection.

These documents were also consulted through Cloudflare's official `cloudflare-docs` GitHub repository where direct documentation-host access was unavailable.
