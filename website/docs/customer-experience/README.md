# Customer experience review

This change is isolated on `codex/customer-experience-roost`, based on the existing beta release candidate. It has **not** been deployed to `rise-roost-beta`. It does not change Studio owner authentication, Register/Admin, Supabase, Square, DNS, or a custom domain.

## What customers can do

- Home offers **Start Shopping**, **The Roost**, and **Leave a Comment** in the existing farmhouse theme. Existing branding, imagery, colors, and saved content are retained. Known starter instructions are omitted from the customer display only.
- Add a product/variety directly from the catalog. The basket stays prominent, with a count and one checkout containing pickup details, date, deadline, and authoritative total.
- Check out as a guest, without signing up. Contact fields are limited to a pickup name and optional email/phone. The confirmation retains the private cross-device tracking link.
- Optionally join **The Roost** using a passkey. It has its own customer identity, saved pickup details, private order history, tracking links, and pickup information. A valid remembered session opens the dashboard directly for up to 30 days. Reauthentication uses a passkey; no email code is sent on each visit.
- Recover a **preview customer** membership with the one-time recovery key shown at enrollment. Recovery rotates the key and revokes prior sessions. Email is optional and unverified; knowing an email address cannot recover an account or expose its orders. Save a passkey on another device or keep the recovery key in a password manager.
- Add a guest order to a membership only with its complete private tracking link. An order already linked to another membership cannot be transferred.
- Leave a comment without an account. It remains private until Danielle approves it in Studio's **Comments** panel. Hiding it removes public visibility while preserving the original text. Comments render as text, including any HTML-looking input.

Customer membership uses the pinned SimpleWebAuthn server library. It is separate from the proposed Descope **owner** account setup, which remains pending and unchanged. Customer cookies cannot authorize Studio, and Studio cookies do not establish customer membership. No existing customer records or orders have been imported.

Payment reporting remains explicit: **I've Sent Payment** records a report. It does not verify a payment, generate a paid receipt, or move an order into preparation. The existing independently verified payment and fulfillment workflows remain covered by regression tests. Email sending and payment processing are disabled in this review.

## Review hosting and data isolation

`wrangler.experience.toml` targets only:

- Worker: `rise-roost-experience-preview`
- D1: `rise-roost-experience-preview-db` (`21352b95-d7f6-406f-8527-4b8dbcebf1bf`)
- A newly generated public workspace, separate from the original main website
- `CUSTOMER_EXPERIENCE_ENABLED=true`, `REVIEW_BUILD=true`, `ORDER_EMAIL_ENABLED=false`

The database has been created and seeded with the public catalog, its existing image references, and future **test** pickup dates. Original draft, owner hash, orders, customer information, and credentials were not copied. Migration `0002_roost_and_comments.sql` is additive and was applied only to this new preview database. It has not been applied to the public beta database.

**Live HTTPS review website:** https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/

The existing Cloudflare token authenticated successfully after its account-level Workers Scripts Write permission was updated. No credential value was displayed or replaced. Deployment `17bae09e-5829-4d2b-b96f-b3b0fed0aa5f`, version `edd8b26f-9fe9-4b56-8d69-2fbf4ea22b30`, was activated October 29, 2026 at 2:02 p.m. EDT. The six expected bindings were read back from Cloudflare and verified, including the separate D1 UUID, both review/experience flags, and disabled email. workers.dev is enabled; version preview URLs and custom domains are not configured.

Deployed application source is `5c3116e57f6e80c25943af66e8230c2caf93c8c4`. Subsequent changes are test automation and documentation. This cloud environment's egress policy blocks direct requests to the new hostname, so hosted acceptance runs on GitHub's runner with normal HTTPS verification. It checks deployed asset hashes, passkey registration/sign-in, remembered sessions, guest/member checkout, tracking/payment reporting, and owner-only comment moderation. All mutations use fresh synthetic private workspaces; neither the review landing workspace nor the existing beta is a test-data target.

Deploy only with `npm --prefix website run deploy:experience`. The opt-in `[verify-experience-preview]` CI job uses the exact new preview origin and rejects the original beta as a target. It has no Cloudflare credentials or deployment step. Hosted browser tests cover the same five profiles using virtual/signing test authenticators; physical biometrics remain owner acceptance.

For local development: `npm --prefix website run dev:experience`. It uses `.data/customer-experience/review.sqlite`, independent of the existing local demo database. Existing review data is retained on restart. Local URLs are developer-only and are not a hosted preview on the user's computers.

## Verification

Local results:

| Check | Result |
| --- | --- |
| Backend regression, membership, privacy, CSRF, recovery, comments | 66 passed |
| Browser matrix: desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium, tablet Chromium | 60 passed |
| New guest/member/comment journeys within that matrix | 15 passed |
| Default beta bundle and separate preview bundle | Dry-run builds passed |
| Runtime dependency audit | 0 reported vulnerabilities |
| Hosted experience verification | API acceptance and all 10 hosted browser journeys passed across five profiles |

Hosted acceptance and the complete regression/build checks passed in [CI run 40927841192](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40927841192). API tests verify deployed asset hashes against this branch and exercise the live D1-backed application; browser tests use fresh private test workspaces on the real HTTPS preview. The original public beta is never a hosted test target. The [preservation report](preservation.json) confirms all 125 original workspaces, the beta deployment, and settings remained unchanged after the preview deployment.

Chromium uses native WebAuthn APIs with a virtual CTAP2 authenticator. Linux WebKit lacks an OS authenticator API, so its test uses a signing software authenticator through the frontend ceremony and the same real server verification. It does **not** validate Apple's Touch ID UI, iCloud Keychain synchronization, or physical Android device prompts. Those require owner acceptance on physical devices. Cookies, cryptographic signatures, challenge replay/expiry, wrong origin, user verification, and cross-workspace isolation are checked automatically.

Screenshots contain only fictional test details and exclude owner keys, recovery keys, and private tracking URLs:

- [Desktop home](screenshots/home-desktop.png)
- [Mobile home](screenshots/home-mobile.png)
- [Guest checkout on mobile](screenshots/guest-checkout-mobile.png)
- [Member dashboard](screenshots/member-roost-desktop.png)
- [Studio comment moderation](screenshots/studio-comments.png)

Acceptance on the hosted preview:

1. As a guest, start shopping, choose a variety, add to basket, select pickup, place a test preorder, and retain the private tracking link. Open it in a second browser. Report payment and confirm it remains awaiting verification.
2. Join The Roost on each intended physical device. Save the recovery key privately. Reload/reopen the browser and confirm it opens the dashboard without another code. Place a member order, verify saved details/history/pickup, sign out, and sign in again with the passkey. Another anonymous customer must see no member details.
3. Submit a comment and confirm it is not public. In an authenticated **isolated review workspace**, approve it, reload the storefront, then hide it and confirm the text is preserved in Studio. Studio's existing **Create my private demo** remains available on the review host for a separate editor-owned copy; it is not recovery for the original main workspace.

Only after review and explicit approval may any of this change be considered for `rise-roost-beta`.

## Future bottle returns, credits, and rewards

Keep this out of the visible checkout until the rules are approved. There are no placeholder balances, promised rewards, issued credits, or Register connections in this change.

Use the stable customer membership ID for a future, separate append-only benefits ledger. Each event needs an immutable source/idempotency ID, event type, quantity/value, unit, original order reference when applicable, actor, timestamp, and reversal reference. Bottle returns require a recorded count and an authorized acceptance event. Credits/rewards require separate approved earning, expiry, reversal, and redemption policies. Redeeming a monetary credit must use an atomic reservation/commit process tied to checkout and cannot be inferred from a payment report. A future Register adapter would require its own approval, mapping, reconciliation, and isolation tests; no current roadside Register records are read or written.
