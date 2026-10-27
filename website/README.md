# Rise & Roost Website + Danielle’s Website Studio

Isolated Issue #7 beta, based on production main `ab27be06d0ad7a999d4ca122ed30373c69b04435`. Issues #5 and #7 and Phase 1 PR #3 (`c3b28a369aa90c2f03895a9cf315f4e0f410cbb5`) were inspected. PR #3 remains unmerged and is not a dependency of this project. Its earlier 135-test result is not claimed as this website’s test result.

Everything in this project is separate from the existing Register: frontend assets, theme, backend, storage, orders, authentication, and deployment. There is no production Supabase client, Square integration, real payment status, production deployment, or DNS configuration. The original Register/Admin files remain unchanged.

## Run and test

Requires Node 24 or newer, npm, and browser/system libraries for Playwright.

```sh
cd website
npm ci
npm run dev
```

The development server uses `.data/demo.sqlite`, outside version control. It serves only `public/`, never the repository root, SQLite files, or server source. This is a real HTTP application; opening `index.html` from Finder will not work and is not the deployment method.

```sh
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run check
```

The browser matrix covers desktop Chromium, desktop WebKit (Safari analog), iPhone WebKit, Android Chromium, and landscape tablet Chromium. These are emulations, not physical Mac/iPhone signoff. Chromium uses `/usr/bin/chromium` when present, otherwise Playwright’s installed browser. The test server uses a fresh in-memory SQLite database. Browser test artifacts can contain disposable test credentials; keep `test-results/` and reports private and uncommitted.

## Danielle’s demo access — no software install

Open [the beta website](https://rise-roost-beta.joshua-maziarz1.workers.dev/) or [Website Studio](https://rise-roost-beta.joshua-maziarz1.workers.dev/studio). See [the synchronization correction report](docs/PUBLISHING-SYNC.md) for tested deployment details.

1. To edit the main beta, open [Studio for your existing website](https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae). The saved workspace ID is prefilled; sign in with your existing private key. Use this same URL/key on the other Mac. **Create my private demo** creates a separate test site and does not change the main website.
2. Save the workspace ID and randomly generated private access key shown once. **Copy private access details** copies both. Keep the key private; there is no shared/default password. Choose **I saved my access key** to dismiss it.
3. On the iMac, MacBook, or another device, open `/studio`, expand **Return to an existing workspace**, and sign in with that same ID/key. Drafts, assets, versions, and demo orders are stored on the backend, not solely in localStorage. Sessions expire after 12 hours. A lost key cannot be recovered; create another throwaway workspace.
4. Complete the five small Quick Setup steps. **Website · Simple Edit** is the normal editor. Double-click a section in the live preview or select it in the list. Reorder with drag-and-drop or arrow buttons. Edit all page/menu/section copy, add/hide/duplicate/delete sections, add/remove/reorder pages, and manage cards, FAQ, and galleries.
5. Use **Products** for names, descriptions, categories, varieties, prices, online/in-store visibility, stock, per-pickup production limits, multiple photos, featured ordering, alt text, and crop focal points. Upload from Finder. Images are resized in the browser to at most 1600 pixels and re-encoded to remove metadata. The approved logo is retained; all starter product illustrations are clearly marked placeholders.
6. Use **Pickup Schedule** for explicit pickup dates, start/end times, order-by dates and clock times, maximum orders, and closure overrides. All times use America/Indiana/Indianapolis. Tuesday/Friday examples are generated ahead of the current date and are fully editable. Invalid or ambiguous daylight-saving times are rejected. Choose additional pickup windows to add one-off or holiday schedules.
7. **Save draft** and one-second autosave only update the draft. **Preview link** creates a frozen, read-only seven-day preview that can be shared across devices. **Publish demo** requires confirmation. In the configured **BETA WEBSITE · OWNER** workspace it updates the root website and its `/demo/<workspace-id>` alias from the same published D1 record; separate test workspaces update only their own demo URL. Other visitors refresh published content within five seconds. **Version History → Restore this version** confirms and restores both published and draft content. Versions include author/time; the last 30 are retained, bounded further by a 1 MB history size limit.
8. **Advanced Design** provides global/per-section styles, supported system fonts, colors, typography, width, corners, alignment, spacing, and validated custom CSS. Undo/redo, restoring the farmhouse theme, and design JSON export/import are available. Rich text/HTML, untrusted JavaScript, and arbitrary embeds are intentionally not accepted. Layout responds automatically to mobile; preview toggles use real desktop/tablet/iPhone frame sizes.

Use **View published website** in the main workspace to share the root site. Separate test workspaces show **View published demo** and an explicit destination note. Sharing that URL or a read-only preview does not share owner access. Independent testers should create separate workspaces unless they intentionally share a workspace key. Draft conflicts are rejected instead of overwriting another Mac’s changes; export unsaved JSON, reload the latest draft, then reapply changes.

## Simulated commerce

Shop, product detail, basket quantities, varieties, integer-cent totals, pickup selection, and receipt pages work end to end. Every request rechecks the published revision, prices, sales channel, quantity, total, local cutoff, closed/full pickup, per-product pickup capacity, and total stock. Atomic compare-and-swap protects capacity; request IDs prevent duplicate orders on retries. Requests always remain **payment not collected / simulated**. No payment details or customer contact information are requested. Orders can move through pending, ready, picked-up, and canceled; cancellation releases capacity, and completed/canceled orders cannot be resurrected. All fulfillment changes are audited.

The basket uses localStorage only as an optional convenience for a visitor; it is never the authority for price, order acceptance, content, authentication, or publishing. Fulfillment management is under **Orders**. Customers/The Roost, Square, recipes, refunds, real customer accounts, and production tax rules remain later integrations, not simulated management screens that imply those services are connected.

## Architecture and isolation

- `public/`: framework-free ES modules; plain-text DOM construction, editorial farmhouse theme, approved logo and labeled sample illustrations. No third-party scripts, tracking, remote fonts, or external product images.
- `server/service.mjs`: shared authenticated content/commerce service. SHA-256 hashes of 192-bit random owner keys and session tokens; Secure/HttpOnly/SameSite cookies on HTTPS; same-origin POST enforcement; rate limits; schema, upload, and CSS validation; no public order/customer endpoint.
- `server/worker.mjs`: Cloudflare Worker with static assets, security headers, and isolated D1 binding. `schema.sql` only creates this demo’s tables; it must never run against production.
- `server/local.mjs`: Node HTTP adapter using Node’s SQLite engine and the same service/SQL interface. Database writes persist across development-server restarts. `RR_TEST_DB=:memory:` is for automated testing only.
- Published site, drafts, and previews are separate server records. No whole-store import, Register theme injection, database/schema changes to the current store, or forwarding to a live endpoint.
- CSS is parsed with css-tree, restricted to presentation properties, and selector-scoped to `.site-root`. At-rules, raw syntax, imports, resource URLs, unsupported functions, and positioning that could cover privileged UI are rejected. Custom CSS is never applied to Studio. Uploads accept raster formats only, with MIME/signature checks and strict size limits, and are served with nosniff; SVG/HTML uploads are rejected.

For future production, replace the small SQL adapter with migrations/auth/storage in the **single approved Supabase authority**, under a separate reviewed task. Adopt named, verified owner accounts with recovery/MFA and proper roles before real operations; the random-key model is for isolated demo workspaces. Migrate structured pages/theme/catalog/pickup schemas and versions, retain optimistic concurrency, and preserve server-side pricing/cutoff enforcement. Square requires the separately approved sandbox/webhook work in Issue #6. No preview writes should ever be pointed at the existing Supabase project to shortcut this.

## HTTPS deployment

See [DEPLOY.md](DEPLOY.md). The project targets a separate Cloudflare **Workers Static Assets + D1** preview rather than static-only Pages, because Studio needs a private backend. This is a Cloudflare hosting option with HTTPS and a commercial-site-compatible path, without changing existing Pages or any domain. The isolated beta hostname is listed above; hosted acceptance is recorded in [the stabilization report](docs/STABILIZATION.md).
