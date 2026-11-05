# Phase 3 website and Studio release candidate

**Final automatic calendar:** see [the current implementation and release report](PHASE-3-AUTOMATIC-CALENDAR.md). The verification numbers below record the earlier Phase 3 candidate; the linked report supersedes its calendar behavior and release gates.

Prepared November 5, 2026 (America/New_York). **Development only: Phase 3 has not been uploaded, deployed, or activated.** Production remains on Phase 2 with checkout disabled and ordering paused.

## Source and production baseline

Branch: `feature/phase-3-website-studio`, created from `security/phase-2-studio-login` at `006feacc8471532531555fae826e663fddf1a846`. Its only difference from the supplied Phase 2 application commit `0e1db86ddec07d1e055b82334552b87a1f37f517` is the subsequent deployment report. The old Register on `main` was not used as the website source.

Read-only Cloudflare inspection confirms version `5bf5f229-8f34-4935-8699-4c6a6d78d055` at 100% traffic. Its downloaded Worker is 1,291,027 bytes with SHA-256 `a2a81ad4da597d223ed4d51677d3f18961e1446b8c91d0113c8f1c848cd26c13`. All 16 application modules in its source map match the supplied Phase 2 commit exactly. No source reconstruction was needed.

## Seven implemented improvements

| Feature | Result |
| --- | --- |
| Three selling methods | Each product offers **Online Ordering**, **Preorder**, or **In-Store Only**. Switching retains its ID, photos, order references, and historical prices. Direct API checkout rejects in-store products. Online stock and preorder limits remain enforced on the server. |
| Fresh at The Roost! | A permanent section on Home and Shop displays every visible in-store product, including sold-out products, with its photo, name, price, description and availability. The daily announcement can be replaced or cleared in Studio. |
| Plain inventory controls | Online uses **How many are available?**, preorder uses **How many can I make?**, and in-store uses **How many are in the store?**. Only relevant controls appear. Existing products constrained by both total stock and pickup limits retain both clearly worded quantities until an owner changes their method. |
| Pickup dates and deadlines | Add, copy, edit and remove future dates; change ordering deadlines; inspect associated orders. Booked changes require confirmation. Moving a booked date/time creates a new window and closes the old one to new orders. Existing order snapshots, accepted pickup policies and pickup deadlines remain unchanged. Past dates leave the customer calendar and remain in history. |
| No adjustment reason | Product price/quantity saves need no explanation. Automatic audit records include before/after values, the owner actor and time. Historical entries are retained. |
| Intentional hiding and history | **Hide Product** and **Show Product** require clear confirmation. Hidden products remain editable, with their photos and order history. There is no normal-editing archive checkbox or permanent deletion. |
| Sold-out visibility everywhere | Zero stock or exhausted preorder capacity retains the listing and disables purchase. Restocking or increasing capacity restores availability. Product cards, details, basket checks, customer APIs and catalog filtering follow this rule. |

The approved farmhouse palette, fonts, hero, navigation, existing customer journeys and responsive layouts are retained. The new Fresh section uses the existing product grid. In-store items have no Add to Basket control. Administrative wording was removed from customer photo placeholders.

## Files and data compatibility

- `public/selling.mjs`: shared method interpretation and normalization.
- `server/service.mjs`: compatible document validation, authoritative purchase rules, stock/capacity availability and past-date filtering.
- `server/management.mjs`: product saves, explicit visibility, announcement saves, automatic audits and calendar safeguards.
- `public/management.mjs`: product controls, announcement editor, hiding/restoration and safe calendar interface.
- `public/app.mjs`, `public/customer.css`: Fresh section, status display, product details and basket availability checks.
- `tests/phase3-selling.test.mjs`, `phase3-management.test.mjs`, `phase3-production.test.mjs`, `tests/browser/phase3.spec.mjs`: new synthetic regression coverage.
- Existing customer, management, website and production browser tests now assert the requested controls and wording.
- `playwright.phase3.config.mjs`, `package.json`, `.github/workflows/website-beta.yml`: repeatable focused checks and production regression coverage for this branch. CI has no deploy step.

**No SQL schema migration is needed.** Existing D1 tables, indexes and migration files are unchanged. New fields are optional JSON document properties:

| Field | Values / behavior |
| --- | --- |
| `product.sellingMethod` | `online`, `preorder`, `in-store`. Optional for existing records. |
| `document.freshAnnouncement` | Optional plain text, at most 240 characters; empty means cleared. |

Explicit methods also save the existing compatible fields: online → `channel: preorder`, `inventoryMode: physical`; preorder → `channel: preorder`, `inventoryMode: production`; in-store → `channel: store`, `inventoryMode: physical`. Products without the new property keep their existing accounting. Legacy in-store products use stock, including when their unused preorder capacity is zero. No product-specific assumptions are introduced.

Existing revision checks, ledger versions, compare-and-swap order reservations, idempotent operation IDs, per-date limits, combined order limits and transactional writes remain in place. Changing a method does not release existing reservations or rewrite historical lines. Content publishing/restoration cannot replace the current operational announcement, products or calendar.

There is no migration to apply or reverse. A future application rollback does **not** undo owner edits, announcements, inventory adjustments, new orders or audit history. Do not restore D1 to roll back a Worker. A Phase 2 rollback restores its older presentation; normalized legacy fields keep saved selling/accounting settings interpretable.

## Verification

Final results and artifact hashes are recorded in `phase3/verification.json`. All mutations in development and browser tests use synthetic records and disposable local SQLite/D1 instances. Payment destinations are intercepted fictional pages; no real order or payment is sent.

| Check | Final result |
| --- | --- |
| Backend automated suite | 189 passed; no failures or skips. The final 19-case Phase 3 integration subset also passed. |
| Local production-schema guard tests | 7 passed. |
| Main browser matrix | 135 unique cases verified across all five profiles. Initial run: 123 passed; the 12 wording/selector assertion failures passed in a fresh 20-case corrected rerun. |
| Production browser regression | All 10 cases verified on desktop Chromium and iPhone WebKit; the two photo/hide cases passed after updating removed-control assertions. |
| Commerce browser regression | 8 passed on desktop Chromium and iPhone WebKit. |
| Worker build and actual local D1 runtime | Production dry-run, closed-launch guard, signed 730-hour owner access, concurrent stock reservation, manual payment/fulfillment, classic compatibility and PIN/commerce smoke checks passed. |
| Production dependency audit | Zero known vulnerabilities. |
| Read-only live checks | 21 passed: public HTTPS/HSTS, checkout lock/pause, anonymous Access challenges, closed legacy owner routes, exact HTTP redirects and plain-text security.txt behavior. |
| Production preservation | All 12 application table fingerprints, schema, inspected configuration and active deployment match their before-development snapshots. |

There are no unresolved test failures. Older browser runners had loaded the previous wording and controls before their assertion updates; the fresh rerun covers every failed case and the final availability changes. Hosted mutation suites and physical-device tests were not run.

Synthetic screenshot evidence: [desktop Fresh section](phase3/fresh-home-desktop-chromium.png), [iPhone Fresh section](phase3/fresh-home-iphone-webkit.png), [sold-out Shop](phase3/sold-out-shop-iphone-webkit.png), and [safe calendar management](phase3/calendar-iphone-webkit.png).

Coverage includes all three methods and switching, zero/restock, preorder exhaustion, direct API rejection, concurrent last-item requests, announcement save/clear/retry, hiding and immutable order history, future deadlines and removals, stale calendar changes, past-date filtering, automatic audit actors, responsive layouts, unsaved forms and reauthentication.

Security regression coverage retains Phase 1 HTTP-to-HTTPS redirects/HSTS and Phase 2 RS256 signature, issuer, audience, owner identity, expiry and 730-hour session verification. Both synthetic owner identities are exercised with older-than-one-day sessions and distinct audit actors. Unauthorized, forged and cross-origin requests to the new management actions are denied; legacy unprotected owner URLs stay closed. Manual PayPal, Venmo and Cash App verification and New → Preparing → Ready fulfillment remain covered.

Browser checks use desktop Chromium, desktop WebKit, iPhone-sized WebKit, Android-sized Chromium and tablet-sized Chromium. These are browser/device profiles, not physical-device certification. Screenshots include synthetic example products only. Danielle has personally confirmed that she successfully signed into the live Phase 2 Studio. This confirmation comes from the owner, independently of these synthetic tests.

## Production data and configuration

The only actions against production in this task are read-only inspections and anonymous GET checks. No production Worker version, asset upload, deployment, business-data write, schema change, reset, reseed, restore, order or payment was made. DNS, Access policies, owner identities, routes and TLS settings were not changed.

The active configuration has 16 bindings. Offline evaluation confirms its exact existing configuration is valid, both owners match the Access allow policy, the audience matches the Studio application, the existing session duration is 730 hours, and no preview/PIN bypass is configured. `REAL_CHECKOUT_ENABLED=false`; the published document has `orderingPaused=true`.

Read-only SELECT fingerprints cover all 12 application tables and their schema. Each provider query reports zero rows written and no database change. Private configuration and fingerprints remain outside Git in `/workspace/phase3-private`; owner addresses, credentials and business records are excluded from committed evidence.

## Safe release procedure and remaining gates

1. **Phase 2 sign-in confirmation received:** Danielle has successfully signed into the existing live Studio. No code or authenticated token is needed from her. Use the final automatic-calendar report for the current release procedure.
2. Obtain explicit Phase 3 production release authorization. This development request is not deployment authorization. Keep checkout disabled and ordering paused. No database migration approval is needed for this implementation; any later schema change requires its own review and authorization.
3. Freeze the tested branch commit and build the production Worker and all static assets, including the new `selling.mjs`. Freshly read the active version, all 16 bindings and values, runtime/compatibility settings, asset routing, handlers, owner/Access configuration, custom domains/routes/DNS/TLS and read-only D1 fingerprints. Stop on unexplained drift. The checked-in `wrangler.production.toml` is a preparation profile and lacks actual owner configuration: **do not deploy directly from it**.
4. After authorization, use the supported Cloudflare asset/version workflow to upload the full matching static asset set and an **inactive** Worker version. Preserve the actual production bindings and runtime settings. Phase 2's `keep_assets` shortcut alone is insufficient because Phase 3 adds and changes assets. Inspect and compare the inactive version before any traffic activation; do not let a deployment change Access, DNS, identities, D1 or checkout configuration.
5. Activate only the reviewed candidate, repeat the anonymous HTTPS/redirect/Access/checkout-pause checks, verify unchanged D1 fingerprints and have Danielle check her authenticated Studio. Do not create live synthetic orders or payments.
6. If application rollback is needed, verify concurrent configuration changes first, then switch traffic to the retained verified Phase 2 version. Preserve the database and all owner edits; a Worker rollback is not a database rollback.

Phase 3 is a development-complete release candidate after its recorded checks pass. Danielle has confirmed real Phase 2 sign-in. Production activation still requires explicit Phase 3 release authorization; this task expressly excludes deployment.
