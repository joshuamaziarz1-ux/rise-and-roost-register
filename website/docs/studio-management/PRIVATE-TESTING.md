# Temporary owner PIN for the isolated Studio preview

This replaces the pending Cloudflare Access rollout at the user's request. No Access app or email login is required. Only `rise-roost-experience-preview`, its existing `rise-roost-experience-preview-db`, and its existing main workspace are in scope. Original beta, Register/Admin, Supabase, Square, customer records and domains remain untouched.

## Owner experience

An operator provides a **private, single-use HTTPS setup link** after verifying Cloudflare account ownership and the actual preview binding. Its random capability is in the URL fragment, never a query/path, repository or public PR. The frontend immediately removes it from browser history, retains it only in memory, and sends it in a same-origin POST. It expires in 24 hours and can be consumed once. Opening or refreshing an ordinary `/studio` cannot create a setup capability or reset a PIN.

The owner chooses and confirms the shared four-digit testing PIN. Setup opens the existing dashboard directly and remembers the device. On another device, open `/studio` and enter the same PIN. There are no workspace-ID/key/email/account screens. Sessions last up to 30 days, bounded by the explicit temporary preview expiry. **Lock Studio** revokes the current device's server session immediately and returns to the PIN screen; other authorized devices stay signed in. Unfinished product/calendar/content forms are restored after unlocking.

There are no IP allowlists. Devices can use home/work Wi-Fi, cellular and other networks. Private browsing/storage clearing/new browsers may require entering the PIN again. Actual iPhone/Mac remembered-device acceptance remains separate from browser emulation.

## Security and data separation

- The Worker checks the exact HTTPS preview hostname, database marker, existing main workspace, review/customer/management flags, disabled external email, private pepper and testing expiry. The operator additionally checks the **actual deployed D1 binding**; a marker alone is insufficient. Alternate version URLs stay disabled.
- Every administrative API is protected at the Worker boundary. Only explicitly enumerated customer routes remain public; unknown/new API routes fail closed. Legacy keys, owner cookies, Access claims and client-supplied workspace IDs cannot bypass PIN mode. Administration is fixed to the existing main preview. Workspace creation, legacy sign-in and pairing are disabled.
- PIN verification runs server-side using a random per-PIN salt, PBKDF2-SHA256 (100,000 iterations), and a separate 256-bit Worker-secret pepper. Neither the PIN nor pepper is sent with frontend assets. The chosen PIN is never stored in plaintext, in Git, logs or browser storage.
- Device cookies use a random 256-bit token with `__Host-` prefix, Secure, HttpOnly, SameSite=Strict and Path=/. D1 stores only the token hash, credential version and absolute expiry. Lock deletes that device's row; a verified operator PIN rotation invalidates all prior versions. Authentication errors/outages fail closed. All PIN-mode responses are private/no-store.
- Same-origin JSON and small request-size limits protect setup/unlock/lock. Network abuse buckets hold HMACs, not IP addresses. Global failed-guess reservations are atomic and cannot be evaded by parallel requests or changing networks. The fifth failure starts a 15-minute lock; subsequent failures re-lock and progressively reach one hour at ten failures and 24 hours at fifteen. A valid PIN after cooldown resets the failure count. Rate-limit responses include Retry-After.
- Three additive `studio_pin_*` tables hold only testing authentication state. Existing workspaces, photos, products, orders, old owner hashes and sessions remain intact. Audit identifies a trusted device using the shared testing PIN; it does not claim an individual owner's verified identity. Customer member authentication remains separate.

## Operator setup and deployment

1. Run `python website/scripts/configure-preview-pin.py --state-dir /private/path` to review the offline plan. The private directory must be outside Git.
2. Capture fresh original-beta/preview preservation fingerprints. Run the helper with `--apply` only for this exact preview. It verifies the active account token, actual binding/flags and disabled version URLs; saves a mode-0600 backup of every existing D1 table; restores that snapshot locally; verifies the main orders are simulated; and refuses to overwrite a configured PIN or unknown setup state.
3. The helper creates only the three auth tables, inserts the single-use setup-token **hash**, and installs `STUDIO_PIN_PEPPER` as a Worker secret. No workspace/business row is created, reset, merged, deleted or updated. Its private `owner-setup.json` contains the capability/pepper; never commit, print in logs or upload that file. The helper does not choose a PIN or deploy a Worker.
4. In `wrangler.experience.toml` only, set `PREVIEW_ACCESS_MODE = "pin"`, `PREVIEW_DATABASE_ID` and an ISO-UTC `PREVIEW_ACCESS_UNTIL` no more than 31 days ahead. Retain the exact existing D1/main ID and `preview_urls = false`. Run backend/browser/runtime and bundle checks, then deploy only `deploy:experience`. Missing configuration stays locked; never temporarily allow anonymous owner access.
5. Run the `[verify-pin-preview]` hosted checks. They require public customer pages and PIN-only Studio, and deny every sampled administrative API. They contain no PIN/setup capability, perform no setup or owner login, and create no workspace, order or business edit. Never opt into the older hosted suites that create private workspaces.
6. Recompare all existing original-beta and preview business tables/settings. Privately give only the owner the one-time setup link, with its expiry. Never put the link or chosen PIN in a PR, screenshot or public message. The owner completes the actual PIN setup; physical-device remembered sessions and their chosen PIN must then be tested by the owners.

If the setup link expires, use an explicitly owner-authorized Cloudflare control-plane operation to issue another capability after verifying existing state. The public website cannot recover/reset the PIN. A configured PIN is never overwritten by rerunning this helper. A wrong/unknown private operator file must be investigated without resetting a workspace.

## Replace before public launch

PIN mode is explicitly limited to this test preview and expiry. It is not individual-owner identity or a launch authentication system. Stronger owner accounts/passkeys/recovery can replace this adapter before launch. Setting the mode off restores the unchanged legacy authentication; do not do so until the intended owner system and access have been verified. Do not carry the testing PIN gate to production.

## Verification

The new backend checks cover real server hashing/cookies, single-use/concurrent/expired setup, global concurrent guessing and progressive lockouts, per-network throttling, CSRF/limits, expiry/lock/rotation, legacy-cookie rejection, fixed main routing, cross-device publication, guest ordering/tracking and original credential preservation. Browser tests cover all five profiles, two independent devices, remembered access, Lock Studio, unsuccessful PINs, expired-session form recovery and identical public Home/Shop pixels. A loopback-only adapter translates Secure-cookie transport for HTTP testing; deployed cookie security is checked independently. The actual local workerd/D1 smoke test checks Worker WebCrypto and SQL behavior. Final counts and actual hosted results are recorded in the PR.
