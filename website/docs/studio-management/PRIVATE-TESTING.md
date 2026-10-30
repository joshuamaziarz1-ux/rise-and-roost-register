# Direct Studio access on approved private networks

## Current rollout status

The implementation is prepared and gated off. The deployed preview still uses its existing owner authentication. No live workspace has been created, reset, merged or deleted for this change. Activation must wait for the user's exact approved public IP addresses and verification of the restriction. Never publish an unprotected administration endpoint as an interim step.

Cloudflare authentication is active, but Access application discovery returned HTTP 403, code 9999, `access.api.error.not_enabled`. Access organization discovery also returned code 10000, `Authentication error`. This does not prove which Access token scopes would be sufficient after enabling that service. No Cloudflare account settings or permissions were changed. The temporary network restriction below needs no new Access organization, tester account, email code or additional account-wide Access permission.

## Temporary authorization boundary

The Worker checks every request before serving **any asset, page or API**, including `/studio`, customer pages, upload routes, drafts, tracking and management APIs. It requires:

- The exact existing experience-preview HTTPS hostname, its expected D1 binding marker and main workspace, review/management/customer feature flags and external email disabled.
- A nonempty exact IP allowlist, stored privately as the `PREVIEW_TESTER_IPS` Worker secret. No CIDR ranges, wildcards, forwarded headers, client identity assertions, login cookies or access keys grant entry around this check.
- Cloudflare request metadata and Cloudflare's `CF-Connecting-IP`. Optional client headers such as `CF-Connecting-IPv6` and `X-Forwarded-For` are ignored. See Cloudflare's [request-header contract](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip).
- An explicit UTC expiry no more than 31 days ahead. Missing/bad configuration or expired authorization fails closed, never to an anonymous dashboard.

All responses in this mode are private/no-store. Worker version preview URLs must remain disabled; no alternate hostname or custom domain is added. The application accepts only an internal, unforgeable grant created by this boundary. Client JSON, cookies or headers cannot construct one. Same-origin JSON POST/CSRF validation still applies.

An approved network opens the existing main dashboard at `/studio`. Studio has no sign-in, ID/key inputs, pairing, logout or new-workspace controls. APIs cannot create/login/pair/reset workspaces in this mode, and owner operations are fixed to the existing main preview. Saved credentials, sessions, products, orders, documents and private workspaces remain intact. Audit entries identify an approved preview network; they do not pretend to identify an individual owner.

**Scope:** everyone sharing an approved public IP receives test-management access. Use private home/staff networks, never guest/public/shared business Wi-Fi. Phones need approved Wi-Fi. Cellular addresses, IPv6 privacy addresses, VPNs and iCloud Private Relay can rotate and may require renewed approval or a different external restriction. This is network authorization, not individual-owner authentication.

## Activation procedure

1. Obtain the user's approved public addresses from each testing device/network. Never infer the user's address from the Codex runner, permit all addresses, automatically approve CI runner ranges, or publish their IPs in Git/PRs. Devices can display their current public address at `https://api64.ipify.org`.
2. Capture a fresh read-only preservation baseline and private preview backup. Verify the actual Cloudflare Worker binding is `rise-roost-experience-preview-db` (`21352b95-d7f6-406f-8527-4b8dbcebf1bf`) and `PUBLIC_WORKSPACE_ID` remains `2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204`. A marker alone is not a substitute for checking the actual binding. Existing main orders were inspected in aggregate and are simulation orders; no customer information was displayed.
3. Store a JSON array of exact approved addresses using `wrangler secret put PREVIEW_TESTER_IPS --config wrangler.experience.toml` through private stdin. Target only the existing preview Worker. Do not change unrelated secrets or settings. Keeping the mode off while installing this secret preserves the current protection.
4. In the experience-preview configuration only, set `PREVIEW_ACCESS_MODE = "trusted-network"`, `PREVIEW_DATABASE_ID` to the preview database UUID and `PREVIEW_ACCESS_UNTIL` to an explicit near-term ISO UTC expiry (recommended initial window: 14 days). Keep `preview_urls = false`. Run all checks, review the exact configuration, then deploy only `deploy:experience`.
5. From an unapproved external network, confirm `/`, `/studio`, `/api/studio`, `/api/manage/snapshot` and POST management/upload/workspace routes are blocked **before D1/asset access**. Confirm forged identity/forwarded headers do not help. These probes must not create a workspace or modify live data.
6. On the actual approved iPhones/Macs, open `/studio` directly in independent sessions with no owner cookies, ID, key or login prompt. Verify the expected dashboard. Local browser tests simulate the trusted Cloudflare boundary; they do not prove an actual device's public IP or Private Relay behavior. Do not claim that physical-device approval worked until it is observed.
7. Cross-device saves and matching storefront synchronization are automated using isolated **local fixture databases**. No new hosted workspace is created. Any additional hosted mutation must use existing approved test records and preserve prior content/history; do not silently generate, reset or replace a site for testing.
8. Recompare all pre-existing workspace/product/order/photo/member/comment data, original beta deployment/settings and actual preview binding. Verify no original beta, Register/Admin, Supabase, Square or custom-domain changes.

## Re-enabling owner authentication

Set `PREVIEW_ACCESS_MODE = "off"` or remove it and deploy to the experience preview. The existing secure owner login immediately becomes required again, using the unchanged saved credential hashes and session rules. This does not activate Descope or authorize a public launch. Individual owner accounts/passkeys/recovery still require setup, both owners' testing, and explicit approval under the earlier plan. An expired network window remains blocked until the operator intentionally renews it or restores owner authentication.

## Tests

`preview-access.test.mjs` covers exact IPv4/IPv6 validation, blocked assets/pages/APIs before DB access, spoofed headers/cookies, missing/wrong scope, expiry, no-created-workspace/session behavior, root-only administration, forged grants, CSRF, live product publication, guest orders/tracking and restoring saved-key authentication. `preview-network.spec.mjs` exercises direct dashboard navigation, two independent browser sessions, no credential UI/cookies, live product changes, network denial/recovery and identical customer Home/Shop screenshots on five device profiles. Cloudflare metadata is simulated only in the loopback-bound local test server, never through a deployed Worker debug flag.

### Local verification result

The complete backend suite passes **91/91** tests. All **15/15** new browser cases pass across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. Customer Home/Shop pixel comparisons remain identical. Both Worker bundle dry runs pass. No hosted direct-access success is claimed: activation and live approved-network checks are pending the user's addresses. The existing owner-authenticated deployment remains unchanged.

The `[verify-network-preview]` CI marker runs denial-only probes after activation. It does not sign in, create a workspace, place an order or edit business data. The older `[verify-studio-preview]` hosted mutation marker must not be used for this rollout because it creates synthetic hosted workspaces; the user has explicitly prohibited creating another workspace. Local ephemeral fixture databases remain separate from all Cloudflare data.
