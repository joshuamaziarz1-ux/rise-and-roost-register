# Customer experience review

This change is isolated on `codex/customer-experience-roost`, based on the existing beta release candidate. It has **not** been deployed to `rise-roost-beta`. It does not change Studio owner authentication, Register/Admin, Supabase, Square, DNS, or a custom domain.

## What customers can do

- Home is a dedicated welcome page with **Start Shopping**, **The Roost**, and **Leave a Comment**. It retains the saved welcome, original logo, imagery, farmhouse colors, and typography. Product grids, shopping controls, comment forms, extra story/pickup sections, and decorative labels no longer appear underneath. Saved documents and sections are retained unchanged.
- **Start Shopping** opens `/shop` directly on the catalog. Inner pages have a single Shop / The Roost / Comments navigation with an active-page indicator; the logo returns home. A sticky basket shows its count throughout shopping and remains available on Home when it has items. The compact footer keeps the original closing message and terms link without repeating the navigation. On tested phone sizes, all three welcome choices fit on the first screen.
- Add a product/variety directly from the catalog. The basket stays prominent, with a count and one checkout containing pickup details, date, deadline, and authoritative total.
- Checkout, order confirmation, and tracking show **Pickup Location** with **Rise & Roost, 3431 County Rd. 60, Auburn, IN 46706**. Clicking the address opens Apple Maps on Apple devices, the device map handler on Android, or web directions on other desktops. Pickup times and stored order data are unchanged.
- Customer pickup windows use full weekday/month names and 12-hour AM/PM clocks, for example **Tuesday, November 3 · 3:00 PM – 6:00 PM**. Order-by dates use **Monday, November 2 at 6:00 PM**. Checkout, confirmations, tracking/status/receipt timestamps, refresh clocks, and Roost history share the format without technical zone labels. Stored schedules and Indiana time-zone/DST calculations are unchanged.
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

The existing Cloudflare token authenticated successfully. No credential value was displayed or replaced. The simplified Home/Shop update was deployed only to the preview on October 29, 2026 at 2:59 PM EDT. Deployment `3f6e8b8d-6f4c-403e-b100-edc28969b211`, version `e1167a96-8502-4f58-b4c6-0ab37f7d2ec1`, contains application source `a07434bd68f0873e781539904691f3db3ec713c1`. Only `app.mjs` and `customer.css` changed in the uploaded public assets; no D1 migration or workspace write was performed. All six bindings remain unchanged, including the separate D1 UUID, both review/experience flags, and disabled email. workers.dev is enabled; no custom domain was configured. The [landing preservation check](landing-preservation.json) verifies every one of the 125 original workspaces and all 12 preview workspaces that existed before this update are unchanged, along with original beta deployment/settings.

The subsequent pickup-address-only update is deployment `31cbd117-86c6-435f-82d4-e894dbf323a9`, version `e4844db0-0c3e-403f-aa5f-a121f3be73f6`. Its four public asset changes add the same address block to checkout, confirmation, and tracking. The existing 125 original workspaces and 23 preview workspaces, original beta deployment/settings, and six preview bindings remain unchanged. Local guest checkout/address/directions checks passed across all five browser profiles; the opt-in PR checks verify the hosted update. No D1 writes or migrations were performed for the display change.

The subsequent customer time-format update is deployment `84d56c71-f8d8-41df-806c-1cf87cc77041`, version `c62cb140-5ec7-46c3-a240-bad8071ed1c5`. It changes three public JavaScript assets and the inactive email template's pickup label only. Email remains disabled. All 125 original workspace rows, all 34 preview workspaces present before the update, original beta deployment/settings, and preview bindings remain unchanged. Local backend checks (66) and customer journeys (15 across five profiles) pass, including midnight/noon, daylight-saving offsets, a 24-hour browser locale, and a device time zone different from Indiana. The opt-in PR checks verify the deployed format.

This cloud environment's egress policy blocks direct requests to the new hostname, so hosted acceptance runs on GitHub's runner with normal HTTPS verification. It checks deployed asset hashes, passkey registration/sign-in, remembered sessions, guest/member checkout, tracking/payment reporting, and owner-only comment moderation. All mutations use fresh synthetic private workspaces; neither the review landing workspace nor the existing beta is a test-data target.

Deploy only with `npm --prefix website run deploy:experience`. The opt-in `[verify-experience-preview]` CI job uses the exact new preview origin and rejects the original beta as a target. It has no Cloudflare credentials or deployment step. Hosted browser tests cover the same five profiles using virtual/signing test authenticators; physical biometrics remain owner acceptance.

For local development: `npm --prefix website run dev:experience`. It uses `.data/customer-experience/review.sqlite`, independent of the existing local demo database. Existing review data is retained on restart. Local URLs are developer-only and are not a hosted preview on the user's computers.

## Verification

Latest landing/shop validation: **66 backend tests**, **15 customer journeys across five profiles**, and the preview dry-run build passed locally. The full regression matrix and live acceptance run in [PR #9 checks](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/9/checks) for the opt-in verification commit. Live checks include read-only Home/Shop assertions and screenshots on the actual public preview; account/order mutations use only new synthetic workspaces.

Previous complete customer-release verification (before this display refinement):

| Check | Result |
| --- | --- |
| Backend regression, membership, privacy, CSRF, recovery, comments | 66 passed |
| Browser matrix: desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium, tablet Chromium | 60 passed |
| New guest/member/comment journeys within that matrix | 15 passed |
| Default beta bundle and separate preview bundle | Dry-run builds passed |
| Runtime dependency audit | 0 reported vulnerabilities |
| Hosted experience verification | API acceptance and all 10 hosted browser journeys passed across five profiles |

Hosted acceptance and the complete regression/build checks passed in [CI run 40927841192](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40927841192). API tests verify deployed asset hashes against this branch and exercise the live D1-backed application; browser tests use fresh private test workspaces on the real HTTPS preview. The original public beta is never a hosted test target. The [preservation report](preservation.json) confirms all 125 original workspaces, the beta deployment, and settings remained unchanged after the preview deployment.

The landing/shop journey also checks active navigation, all three homepage destinations, logo/back navigation, direct `/shop` loading, basket persistence in a reopened tab, and refresh. The Linux Playwright WebKit build crashes certain sequences combining multi-entry `pushState` history, reload, and subsequent document navigation; this was reproduced on minimal HTML without application code. Navigation/refresh assertions therefore use a separate context from the checkout assertions, with both behaviors still covered. Please include back → another destination → refresh → checkout in physical Safari acceptance.

Chromium uses native WebAuthn APIs with a virtual CTAP2 authenticator. Linux WebKit lacks an OS authenticator API, so its test uses a signing software authenticator through the frontend ceremony and the same real server verification. It does **not** validate Apple's Touch ID UI, iCloud Keychain synchronization, or physical Android device prompts. Those require owner acceptance on physical devices. Cookies, cryptographic signatures, challenge replay/expiry, wrong origin, user verification, and cross-workspace isolation are checked automatically.

Screenshots contain only fictional test details and exclude owner keys, recovery keys, and private tracking URLs:

- [Desktop home](screenshots/home-desktop.png)
- [Mobile home](screenshots/home-mobile.png)
- [Desktop shop](screenshots/shop-desktop.png)
- [Mobile shop](screenshots/shop-mobile.png)
- [Guest checkout on mobile](screenshots/guest-checkout-mobile.png)
- [Member dashboard](screenshots/member-roost-desktop.png)
- [Studio comment moderation](screenshots/studio-comments.png)

Acceptance on the hosted preview:

1. Open Home and confirm there is only the welcome and three choices, with no catalog or comment form below. Start Shopping opens `/shop`; verify the logo returns home, the active page is marked, and browser back works. As a guest, choose a variety, add to basket, navigate home and return, reopen/reload the site and check that the basket persists, select pickup, place a test preorder, and retain the private tracking link. Open it in a second browser. Report payment and confirm it remains awaiting verification.
2. Join The Roost on each intended physical device. Save the recovery key privately. Reload/reopen the browser and confirm it opens the dashboard without another code. Place a member order, verify saved details/history/pickup, sign out, and sign in again with the passkey. Another anonymous customer must see no member details.
3. Submit a comment and confirm it is not public. In an authenticated **isolated review workspace**, approve it, reload the storefront, then hide it and confirm the text is preserved in Studio. Studio's existing **Create my private demo** remains available on the review host for a separate editor-owned copy; it is not recovery for the original main workspace.

Only after review and explicit approval may any of this change be considered for `rise-roost-beta`.

## Future bottle returns, credits, and rewards

Keep this out of the visible checkout until the rules are approved. There are no placeholder balances, promised rewards, issued credits, or Register connections in this change.

Use the stable customer membership ID for a future, separate append-only benefits ledger. Each event needs an immutable source/idempotency ID, event type, quantity/value, unit, original order reference when applicable, actor, timestamp, and reversal reference. Bottle returns require a recorded count and an authorized acceptance event. Credits/rewards require separate approved earning, expiry, reversal, and redemption policies. Redeeming a monetary credit must use an atomic reservation/commit process tied to checkout and cannot be inferred from a payment report. A future Register adapter would require its own approval, mapping, reconciliation, and isolation tests; no current roadside Register records are read or written.
