# Rise & Roost Register 5.2.0-rc.3

This is a review candidate for Issue #2, based on production `main` at `ab27be06d0ad7a999d4ca122ed30373c69b04435`. It is not a production release. Owner approval and physical-device acceptance are outstanding. No production branch, function, schema or business record was changed.

## Owner-authorized controls in rc.3

On October 22 the owner selected option 2: add the three missing controls using the existing design. They are implemented in this same RC branch and PR #3; this is a bounded Phase 1 scope update, not Phase 2 authorization.

- **Comments & Requests:** an appended Admin tab uses existing card/button/field styles. Customer submissions arrive automatically; Admins can review, resolve and reopen them with row-version conflict checks. Original text, IDs and review timestamps remain in the existing comment records. Comment text is escaped and remains absent from public catalog responses.
- **Roost credit spending:** signed-in members can opt in at the existing payment chooser. It shows credit value, discount and remaining cash/QR amount; a fully covered purchase confirms with credits without requesting a cash or wallet payment. Server totals, balance, credit value, credits used and member identity validate the frozen quote. Lost responses retry the same transaction. Member history shows credits spent and Admin sales label fully credit-paid purchases as Roost Credits.
- **Pickup appointments:** Admins can link a new or existing pickup to a member without changing saved contact details, configure weekly availability/time zone/appointment length and schedule, approve or decline a time. Members request offered times for existing linked orders in My Roost. Pending requests reserve the appointment window; competing bookings and stale editors are rejected atomically. Requests recover after reload using their original request IDs. Unchanged member cards retain their DOM during polling so phone scrolling/taps remain stable.

`phase1-admin-controls.js` adds only these Admin controls; `v4.8-payments-cloud.js` and `v4.8-roost.js` connect the member controls to the same service. `supabase/appointments.sql` uses the existing `pickup_appointments` table; its tracked source is included in the previously unshipped generated migration. There is no competing database and no new access-code generation, delivery or unlock integration. Scheduling changes never rewrite existing PIN/access metadata. Approving without editing the time also retains the original timestamp precision and daylight-saving-time instant. Availability is disabled until configured when no prior schedule exists; the editable store-time-zone default is America/New_York. Members see the next 45 days of configured future times. Existing active pickup flows remain usable without an appointment.

See [Using the Phase 1 controls](PHASE-1-CONTROLS.md) for the operator steps. The original stylesheets, branding, assets, landscape CSS and manifest remain unchanged. Existing tab order is retained, with the new tab appended. Layout QA temporarily detaches that single authorized new tab while comparing pre-existing geometry to immutable main; separate actual-interface screenshots capture the additions. Browser emulation and synthetic authentication do not replace physical-device and real magic-link acceptance.

## October 22 consolidation and fixes

The existing `codex/phase-1-release-candidate` branch and PR #3 are retained as the single Phase 1 candidate. Its two previously tested rc.1 commits (`e263962`, `674b73e`) already descend from the latest main. This avoids a competing RC or an indiscriminate PR #1 merge. All current remote branch heads were fetched again; main remains unchanged. Six deployed UI/data/CSS/manifest files again matched main after newline normalization. The October 15 private Sites preview is an older implementation and **is not this candidate**.

The rc.2 audit reproduced and corrected these defects with synthetic fixtures:

- A delayed sign-in or return response could restore a previous member's token/private records after sign-out. Requests now reject responses from an obsolete identity; a stale account-expiry response cannot sign out the next member.
- A catalog revision arriving during signup incorrectly canceled the pending member session. Guest data cleanup no longer advances the member identity generation; explicit logout still does. A held-response test reproduces the original failure and verifies signup survives live catalog changes.
- A queued Admin edit could retry using a different account after a session switch. The original actor is checked against both the sending session and any refreshed session. Sign-out clears private in-memory store data, and a late Admin read cannot restore it. Unconfirmed requests and exact conflict changes remain available for recovery/export.
- Missing/null transaction arrays bypassed SQL three-valued checks and could create an empty zero-total sale. Arrays, payment methods and whole return quantities are now validated before any mutation. All failed-input tests assert the full canonical store is unchanged.
- An already-open Roost account did not redraw newly configured return types or new pickup cards. Those existing views now refresh automatically while retaining selected return quantities and profile fields. Scheduled pickup time appears as data inside the existing pickup detail line; no new scheduling flow or unlock control is added.
- Member account responses now include only that member's credit-use audit entries. Reward transactions use the existing history row with the correct event type.
- A real rapid-navigation race appeared in Linux iPhone CI: a delayed Start Shopping callback could close a cart opened immediately afterward. A deterministic clock test reproduced it; synchronous initialization removes the delayed reversal without altering the approved interface.

Styles, branding, navigation, checkout methods, landscape CSS and PWA manifest remain unchanged. No Phase 2 processors, payment-method controls, refunds or expanded customer-authentication scheme were implemented.

## Source and feature audit

All 22 remote branch heads were fetched and reviewed on October 19, 2026. The October 14 local Codex checkout is clean at `4e106502eda4024079ffc2c85b3d0d7199a484ef`, matching open/unmerged PR #1. Its thread and implementation were reviewed. That PR's original `index.html` interface is not the approved current split interface.

| Source | State and decision |
| --- | --- |
| `main` `ab27be0` | Current split cloud UI, persistent layer, 30-second fallback, landscape CSS and fullscreen manifest. All six deployed HTML/data/CSS/manifest files compared byte-for-byte after newline normalization and matched main. Preserve this visual baseline. |
| PR #1 `4e10650` | Twelve unique commits; strong transactional, row-version, idempotency, auth and isolated tests. Reuse selectively; do not merge its old UI or version labels. Prior reported 68 checks are historical evidence, not this candidate's result. |
| `saved-before-persistent-layer-2026-10-16` `c94d4b6` | Main ancestor, eight commits behind. Safe browser-local sync only. Superseded by one server adapter. |
| `saved-before-tablet-landscape-kiosk-2026-10-16` `24ea283` | Main ancestor, four commits behind. Preserve current landscape CSS and manifest exactly. |
| `feature/supabase-live` `abb7a61` | Six unique older cloud-bridge commits. No missing transaction protection beyond the selected replacement. |
| `locked-before-pickup-pin-2026-10-06` `412b8d3` | Divergent 35-commit line: credit controls, Roost Admin, grouped catalog, sales insights, dedicated comments tab. Data/contracts reviewed; its different UI was not copied. |
| `saved-before-removing-pickups-2026-10-06` `4613d41` | Divergent 63-commit line includes pickup approval/scheduling. Preserve existing pickup/appointment records and server operations; do not copy a different flow. |
| `saved-before-full-ui-redesign-2026-10-06` `421643f` | Divergent 92-commit line includes styling and later explicit pickup removal. The branch name alone is not an approval source. Do not copy its UI. |
| Other 12 backup/checkpoint heads | v4.8.7, v4.8.9, v4.9.2, v4.9.7, v4.9.10, v4.9.11, v4.10.0, v4.10.1, v4.10.2, v5 first split, v5.0.2 and v5.0.4 are all main ancestors. `saved-v4.10.3` and `saved-before-roost-credit-2026-10-06` are also ancestors. Existing branches remain intact. |

The local rollback branch `codex/phase-1-rollback-main` pins the exact original main commit. No backup branch was deleted or rewritten.

## Consolidated implementation

- `register-cloud-beta.html` / `admin-cloud-beta.html`: original body, CSS and logo retained; load pinned SDK and shared adapter. `index.html` and old v5 URLs converge on these screens. The customer stock line says **Available** rather than leaking stock numbers, as Issue #2 requires; the SOLD OUT overlay and existing line geometry remain. Version and confirmed cloud-status metadata accurately identify this candidate.
- `cloud-config.js`, `cloud-model.js`, `v5-cloud-sync.js`: one service contract, revision Realtime, 15-second polling, focus/online/resume, refreshed Admin sessions, stable edit baselines and row diffs. Removed whole-store snapshot saving and same-browser authoritative refresh.
- `rise-roost-data.js`: scoped public catalog cache only, tab-scoped pending Admin recovery and conflict drafts. Existing legacy device backups are preserved, never automatically imported. Pending Admin requests are bound to their original administrator. The existing Export Backup control includes canonical cloud data plus explicitly separate `unsavedDraft` and `previousDeviceData` fields for recovery review; imports do not silently apply those supplemental fields.
- `v4.8-payments-cloud.js`: same cash/four-wallet markup and flow; frozen payment quote, no local checkout fallback, duplicate-tap lock, durable request ID, response validation and lost-response recovery. No processor, wallet or payment-method redesign. Receipts record `paymentConfirmation=self-reported` and `providerVerified=false`.
- `v4.8-roost.js`, `customers.js`: signed member scope, signup/revisit, correct member checkout attribution, profile versions, shared returns and history, inactivity signout and clearing private data. UI lookups never use another person's name as identity.
- `supabase/checkout.sql`, `contract.sql`, `legacy-guard.sql`, `scripts/build-contract.mjs`: server prices, stock/reservation checks, atomic sale/inventory/credits, idempotency, immutable sale history, one-time voids, missing-only imports and service-only privileged RPCs. Appointment projection/import preserves existing access metadata and excludes access codes from member/public results.
- `supabase/migrations/20261014182217_shared_database_sync.sql`: the previously unshipped PR #1 migration, extended before release, not a migration that has run in production. Generated from the reviewed sources above. Additive metadata/private tables; no seed, reset, truncation or wholesale replacement of production data.
- `supabase/functions/rise-roost-sync/`: candidate handler and production entry point, not deployed. `rise-roost-api` entry point becomes a compatible bridge after approved cutover.

The October 17 production migration `fix_checkout_unassigned_customer_record` was observed. The candidate independently uses a typed optional customer row and tested guest/member checkout; it does not overwrite the old production checkout function during development.

## Release status

The prior three UI scope gaps are now implemented under the owner's explicit option-2 authorization. Keep PR #3 draft until final automated results, actual expanded-interface screenshots, physical-device/magic-link acceptance and the owner release review are complete. No production or preview cutover, schema/function deployment, customer communication or Phase 2 work is authorized by that scope choice. The Supabase connector requires reauthentication as of October 23; repeat the read-only production/version audit after reconnecting, before any approved preview or cutover. The October 22 preservation evidence is retained as historical evidence.

## Existing-data preservation and approved cutover plan

Do not execute this section without explicit owner production approval.

1. Recheck main and database/function versions. Freeze Admin writes briefly; retain current static files and function source. Export a provider backup and each device's legacy backup; inventory records, members, histories and appointments must be included.
2. Rehearse the candidate migration on a disposable restoration of the current schema/data. Resolve source drift before any production migration. Confirm all business rows, not just counts, survive; metadata columns may be newly added. Verify legacy RPC grants, RLS and Supabase advisors.
3. Apply the tracked migration transactionally using the normal migration workflow, and deploy both candidate function entry points with the approved origin and server-only service secrets. Never expose those secrets to static files.
4. Verify catalog and authorized Admin reads and preservation fingerprints before allowing writes. Publish static pages/SDK/adapter together. Reload existing Admin tabs so the destructive legacy saver cannot run.
5. Perform a separately approved synthetic checkout/member return in production only after approval. Confirm one receipt, correct stock/credit changes and live updates, then remove the temporary test records using an audited procedure.

Rollback: before migration, return to pinned main. After migration, retain additive tables and idempotency receipts; stop writes or use a compatible candidate client. Do not re-enable the old whole-store replacement saver or silently switch Admin to local persistence. Restore the provider backup only under a separately reviewed recovery procedure to avoid losing later real transactions.

## Physical-device acceptance (not yet performed)

Approval sequence: review the exact PR commit and automated/screenshot evidence; review the three authorized controls and their screenshots; authorize an isolated candidate preview and real-device/magic-link checks; complete the checklist below; then give separate explicit production migration/deployment approval. There is no automatic merge, cutover or Phase 2 authorization when tests pass.

- iPhone Safari: open Register, verify home/logo/cards/cart/payment and Roost readability, join/revisit/logout, scroll/keyboard/safe areas, background/resume and reconnect. Use synthetic preview data only.
- Android Chrome: repeat above; test QR scanning on a second device without sending money.
- Landscape tablet: 1180×820 automated comparison is available; check the real tablet's native resolution, tap targets, cart/checkout, rotation, installed-app/fullscreen and reopen behavior. Fullscreen manifest is not OS kiosk lockdown.
- Admin on a separate real device: approved magic-link delivery and callback, allowlist rejection, price/hide/show/stock/sold-out, simultaneous edits and expired-session recovery. Verify Register receives changes without refresh and that an open cart/quote or edit is protected.
- Exercise pickup reservation/completion, member returns/rewards, backup export and receipt/inventory history with synthetic fixtures. Verify Comments review/reopen on two Admin devices, partial/full credit spending and lost-response recovery, and member appointment request/reload recovery with Admin approval/stale-edit rejection before signoff.

## Known limits carried into Phase 2

Cash and QR-wallet confirmation are customer self-report, not provider-verified settlement. Phone knowledge is not verified phone ownership. No refund/dispute/provider integration was added. Browser storage can be cleared by the user or OS; durable server receipts protect retries while client recovery records remain available. The manifest provides fullscreen installation metadata, not a service-worker offline app shell; an already-loaded/cached catalog is read-only when the API is unavailable. Fresh navigation with no cached HTML requires a connection.
