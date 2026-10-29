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

**Hosting blocker:** Cloudflare denies both Wrangler's preflight lookup and the standard Worker creation request for this new Worker with HTTP 403, `No access to the specified resource.` The existing token is active, Worker listing works, and separate D1 creation succeeded. The Worker list confirms the proposed name is absent. **There is no hosted preview URL yet.** The existing beta is not a fallback deployment target.

To enable hosting, Cloudflare must authorize `Workers Scripts: Edit` for creating/deploying the new preview Worker in this account. The exact denied operation is `PUT /accounts/<account-id>/workers/scripts/rise-roost-experience-preview`. Supply credentials through Network secrets, never chat. Alternatively, an account owner can create this separate Worker and configure its Git deployment from this branch using the `website` root and `npm run deploy:experience`. No production deployment or custom domain is needed. Account-wide protection/routing settings must remain unchanged.

Once authorized, deploy with `npm --prefix website run deploy:experience`, verify the Worker bindings and deployment, then opt into the hosted acceptance probe. Its fixed target rejects the original beta URL, and it creates only its own synthetic private workspaces. A hosted verification run is **not** represented as passed while the Worker is unavailable.

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
| Hosted experience verification | Blocked by Worker creation authorization; not run |

Chromium uses native WebAuthn APIs with a virtual CTAP2 authenticator. Linux WebKit lacks an OS authenticator API, so its test uses a signing software authenticator through the frontend ceremony and the same real server verification. It does **not** validate Apple's Touch ID UI, iCloud Keychain synchronization, or physical Android device prompts. Those require owner acceptance on physical devices. Cookies, cryptographic signatures, challenge replay/expiry, wrong origin, user verification, and cross-workspace isolation are checked automatically.

Screenshots contain only fictional test details and exclude owner keys, recovery keys, and private tracking URLs:

- [Desktop home](screenshots/home-desktop.png)
- [Mobile home](screenshots/home-mobile.png)
- [Guest checkout on mobile](screenshots/guest-checkout-mobile.png)
- [Member dashboard](screenshots/member-roost-desktop.png)
- [Studio comment moderation](screenshots/studio-comments.png)

Acceptance after hosted preview is available:

1. As a guest, start shopping, choose a variety, add to basket, select pickup, place a test preorder, and retain the private tracking link. Open it in a second browser. Report payment and confirm it remains awaiting verification.
2. Join The Roost on each intended physical device. Save the recovery key privately. Reload/reopen the browser and confirm it opens the dashboard without another code. Place a member order, verify saved details/history/pickup, sign out, and sign in again with the passkey. Another anonymous customer must see no member details.
3. Submit a comment and confirm it is not public. In an authenticated **isolated review workspace**, approve it, reload the storefront, then hide it and confirm the text is preserved in Studio. Studio's existing **Create my private demo** remains available on the review host for a separate editor-owned copy; it is not recovery for the original main workspace.

Only after review and explicit approval may any of this change be considered for `rise-roost-beta`.

## Future bottle returns, credits, and rewards

Keep this out of the visible checkout until the rules are approved. There are no placeholder balances, promised rewards, issued credits, or Register connections in this change.

Use the stable customer membership ID for a future, separate append-only benefits ledger. Each event needs an immutable source/idempotency ID, event type, quantity/value, unit, original order reference when applicable, actor, timestamp, and reversal reference. Bottle returns require a recorded count and an authorized acceptance event. Credits/rewards require separate approved earning, expiry, reversal, and redemption policies. Redeeming a monetary credit must use an atomic reservation/commit process tied to checkout and cannot be inferred from a payment report. A future Register adapter would require its own approval, mapping, reconciliation, and isolation tests; no current roadside Register records are read or written.
