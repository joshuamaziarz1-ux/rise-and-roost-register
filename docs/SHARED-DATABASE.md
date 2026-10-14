# Shared database rollout and test results

The application on this branch uses the existing RiseAndRoost Supabase project (`vveahfizojxwfwnqiuyv`). Canonical Register and Admin pages use one adapter and one server contract. Production has **not** been merged or switched to this branch.

## Ready for real-device testing

Private preview deployed October 14, 2026, at **3:09 PM America/New_York**:

- [Admin](https://rise-roost-sync-testing.mysticchub64.chatgpt.site/admin-v5.html)
- [Register](https://rise-roost-sync-testing.mysticchub64.chatgpt.site/register-v5.html)

Open these as the owning ChatGPT account. Admin also requires an existing approved Supabase email/password account. The preview uses `rise-roost-sync-preview`, permanently bound to the isolated `rr_preview` schema in the existing project. The approved admin allowlist is checked against `public.admins`. Products and members in the preview are synthetic. No real payments should be made. Example member phone: `2025550100`.

Production counts and full record fingerprints for all 16 business tables were unchanged before and after preview setup and live preview integration tests. Only preview records were used for write tests.

## What changed

- Replaced `v5-cloud-sync.js`; retired the competing `rise-roost-cloud.js` snapshot adapter and stopped loading `v5-live-refresh.js` on real pages.
- Supabase is authoritative for vendors, products, prices, visibility, stock, settings/payment QR codes, pickups, sales, members, credits and history. Browser storage holds Auth tokens, kiosk session identity and idempotent pending-operation receipts. Previous local store records are preserved and are not loaded as cloud data.
- Realtime revision notifications trigger a fresh snapshot; 15-second foreground polling repairs missed events. Focus, visibility and online events recover sleeping mobile browsers. Unchanged snapshots do not redraw the UI. Cart, payment amount and Admin edit state are protected during updates.
- Admin uses the pinned Supabase Auth SDK with token refresh. Edge Auth verifies each administrator with `getUser`, and SQL verifies the approved `admins` row. Direct browser DML and execution of privileged RPCs are denied. No service/secret key is in browser assets.
- Admin sends record diffs with row versions. Conflicting edits are rejected and reload current data; the attempted draft remains exportable. All changes in a batch commit or roll back together. Offline writes retry the same operation ID and never show a confirmed save prematurely.
- Checkout, inventory, credits, sale lines and stock history commit in one PostgreSQL transaction. Consistent locking and server-side price/reservation validation prevent overselling. Idempotency covers lost responses, retries and page reloads. Voids restore stock and credit balances once.
- Restored shared pickup completion, member profile editing, returns, credit spending and free-dozen redemption. The existing cash and four QR payment methods retain their self-confirmation flow. QR uploads remain Admin-only.
- Backup import adds missing IDs, including history, and skips existing records. Imported historical sales do not deduct inventory again. Export Previous Device Data preserves access to older local records for deliberate migration.
- Decoded the existing compressed kiosk script into reviewable source and restored the complete existing logo from its committed base64 chunks.

## Verification

**44 automated tests passed**: 16 Node/PostgreSQL/handler tests, one isolated deployment/preservation test, and 27 browser cases across desktop Chromium, iPhone WebKit and Android Chromium. PostgreSQL 17.6 runs locally with a schema fixture reconstructed from the project's schema and constraints, and synthetic records only. No live-project connection is used by default.

Coverage includes hide/show, brands, price and stock changes, sold-out state, two independent Registers, concurrent last-unit checkout, stale Admin edits, server total changes, negative/fractional quantities, credit debit/restore, profile and return changes, pickup reservations/completion, rewards, backup preservation, network loss/reconnect, offline Admin retries, expired Admin sessions, signed member capability expiry/tampering, a simulated six hours open, recovery after reload, RLS and unauthorized RPC/Admin access. Mobile layouts were visually checked.

Live opt-in tests against the isolated preview confirmed real Supabase Realtime events, duplicate-sale prevention, member credit synchronization and rejection of unauthorized requests. They deliberately cannot target the production RPC. Run them only with `RR_PREVIEW_ONLY=1` using `node tests/live-preview.mjs`. These tests consume synthetic preview inventory; they do not reset any records.

```powershell
npm ci
npx playwright install chromium webkit
npm run test:all
```

The GitHub Actions workflow runs the same isolated suite and has no deployment or production database credentials.

## Production cutover

Complete phone/tablet checks against the private preview first. Verify an approved administrator can log in on the actual device and that hide/show, pricing, checkout, member credits and reconnect behavior match expectations. Browser emulation does not replace this physical-device check.

1. Export a Supabase backup and export/review any previous device-only records. Do not reset schemas or import a whole-store replacement.
2. Apply the tracked `supabase/migrations/20261014182217_shared_database_sync.sql` to the existing schema using the approved migration workflow. It adds metadata/version columns and private idempotency/document tables without updating existing business records. It also blocks old snapshot saves and direct browser table writes. Those protections intentionally require old Admin tabs to reload.
3. Deploy both server entrypoints from this branch. The legacy API bridge rejects `admin_save` rather than replacing the database:

```powershell
npx supabase functions deploy rise-roost-sync rise-roost-api --project-ref vveahfizojxwfwnqiuyv --use-api --no-verify-jwt
```

The custom handler verifies Admin JWTs and signed member capabilities. The functions must retain access to Supabase's server-only service/secret key; never put it in `cloud-config.js`, static files or GitHub Pages.

4. Perform read-only catalog and approved Admin-load checks. Recheck business record counts/fingerprints excluding the newly added metadata/version columns. Run Supabase advisors.
5. Review and merge PR #1 only after those checks and physical-device testing. Publish the static files together, with the pinned vendored SDK and cache-busted adapter. Reopen existing Admin tabs. Canonical production URLs after cutover are `https://joshuamaziarz1-ux.github.io/rise-and-roost-register/admin-v5.html` and `https://joshuamaziarz1-ux.github.io/rise-and-roost-register/register-v5.html`.

Keep the additive schema on rollback; restore a compatible client or stop writes. Re-enabling the destructive legacy whole-state saver is not a safe rollback.

## Existing security/behavior limits

The existing phone-number member sign-in and self-confirmed cash/QR payments are preserved. A signed capability binds subsequent member operations to that account and expires after two hours; kiosk inactivity signs out after two minutes. Phone knowledge is not verified phone ownership, and the app does not independently verify a wallet payment. Administrator access uses Supabase password authentication and the server-maintained allowlist.

Supabase's advisor reported an existing warning that leaked-password protection is disabled. Enable it in Auth settings if supported by the account plan before the live rollout. Service-only tables deliberately have RLS with no browser policies, so their informational `RLS Enabled No Policy` findings represent denied browser access.

The production migration and production function cutover are intentionally not applied during preview testing. The live store remains unchanged until rollout.
