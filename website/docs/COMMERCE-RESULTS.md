# Isolated preview release report — November 1, 2026

**Payment Settings follow-up:** the new [Payment Settings release report](PAYMENT-SETTINGS-RESULTS.md) records the current deployment, setup flow, checkout readiness enforcement and additional launch tests. The deployment/test counts below describe the earlier coordinated release.

This update continues the existing approved website and Studio from draft PR #10 in [draft PR #11](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/pull/11). It remains unmerged. The customer Home/Shop design, branding, colors, typography, navigation, basket and product presentation are preserved.

## Completed changes

- Configurable, server-validated PayPal, Venmo and Cash App business destinations. Orders/private links save before external navigation. Selecting/opening/returning from payment never verifies it. No customer “I've Sent Payment” step in the preview.
- Owner confirmation of independently received payment, optional reference, authenticated owner-device/timestamp audit, one receipt, duplicate/stale-write prevention and synchronized verified sales. Refunds, corrections and disputes remain separate. Reports add Yesterday and payment-method totals to existing date ranges, product sales, outstanding value, refunds, corrections and counts.
- Order Received → Preparing → Ready for Pickup, with one next logical action. Payment and preparation actions appear first on iPhone; details/history collapse. Backward corrections and cancellations require confirmation/reasons. Historical Picked Up records cannot be rewritten.
- Exact requested pickup policy, mandatory acknowledgment, policy version/server timestamp, original pickup, calendar snapshot and actual deadline. Any weekdays/closures and Indiana DST are supported; no retroactive deadlines for historical orders.
- Private, account-free Contact Danielle messages, owner replies and requested alternatives. Private bearer access, same-origin JSON, validation, throttling, honeypot, bounded storage and idempotent requests protect saves. Lost-confirmation retries do not duplicate messages.
- One persistent Customer Contacted attention item per order. A request leaves pickup/deadline unchanged. Only the owner approves extensions; original arrangements, requests, previous deadlines, approver/time and full audit remain. New messages reopen review.
- Manual overdue/forfeiture review. Unresolved messages or disputes block forfeiture. No automatic collection, forfeiture, refund or retention of disputed money. Resolutions leave active production counts without inventing a collection event.
- Daily production capacity across multiple pickup windows, optional combined daily order limits and existing atomic physical-stock reservations. Calendar changes preserve existing confirmed orders. Existing product/photo management, membership, content drafts/preview/publish/history, backups and synchronization continue.
- Environment base URL configuration and relative tracking paths prepare eventual official-domain use. Runtime guards block production use of the testing configuration.

## Tests actually performed

| Check | Result |
| --- | --- |
| Backend/security/commerce | 120 passed, zero failures/skips/cancellations |
| Full browser regression sweep | 120 passed: desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium |
| Final commerce journeys | 4 passed (desktop Chromium and iPhone WebKit); three independent sessions cover intercepted payment destinations, verified sales, sequential fulfillment, message recovery through reload, blocked session storage, malformed/mismatched success replies, replies and extensions |
| Follow-up customer regression | 12 passed across desktop Chromium, desktop WebKit and iPhone WebKit: guest checkout, membership, comments and private order tracking |
| Actual local Cloudflare workerd/D1 | Passed PIN setup/unlock/device isolation, D1 checkout, private messaging, verification, fulfillment and extensions |
| Worker bundles | Isolated preview and original-beta configurations passed dry-run compilation; neither dry run deploys |
| Syntax/whitespace | All public/server modules parsed and git diff checks passed |
| Backup/restore | All 14 preview application tables and both explicit indexes privately backed up and restored locally with every record and schema matching; commerce business-backup restore retained messages/approvals/payment audit and rotated restored private tracking secrets |
| Preservation before deployment | All 70 pre-existing preview workspaces and other existing application rows preserved; one separate synthetic fixture workspace/order added. Original beta's six application tables, settings and deployment matched the baseline |
| Hosted HTTP/browser acceptance | Blocked: the environment proxy returns CONNECT 403 for the isolated preview hostname, absent from its network allowlist |

The full sweep covered the coordinated development build; final affected commerce journeys, backend and workerd checks were repeated after follow-up safeguards. The full 120-case local sweep was repeated during the unattended follow-up and passed again. Pending CI is not counted as passed. Earlier failing/interrupted development runs are excluded from passing totals.

Provider pages were intercepted with fictional pages. No money was sent and no real provider account, recipient, commercial approval, native app handoff or automatic return was certified. Physical iPhone/MacBook Safari, weak cellular networks, photo-library/HEIC selection, passkey hardware/recovery and production restoration remain separate acceptance.

## Database and fictional order

**No SQL migration or schema change.** New fields are additive in the existing versioned JSON ledger. No existing workspace was replaced, reset, merged or deleted. One separate synthetic workspace contains a fictional “do not fulfill” order; its private link is supplied separately. It does not appear in the fixed main Studio: place a fresh fictional order on the main preview for Danielle's full workflow test.

The fixture used the checkout handler locally, then the permitted D1 API to insert its new row. This is not a hosted HTTP checkout test. No hosted owner session was minted; the owner's configured PIN was neither read nor changed. Full private backup/capability files stay outside Git with restricted filesystem permissions.

## Incomplete setup, blockers and security concerns

1. Danielle must supply and independently validate business-approved payment destinations and recipient identities. They remain unconfigured on the main preview. URL validation cannot prove ownership, business account status, applicable terms, an invoice's validity or the amount on the provider page. Amount/reference instructions are displayed; unsupported prefill/return parameters are not invented. Provider-specific prefilling and real app/return acceptance remain unverified.
2. Confirm actual business weekdays/closures before relying on deadlines. The explicit initial default is all seven days. Saved existing deadlines remain unchanged.
3. Review strict no-refund/forfeiture wording against Indiana law and all three providers' requirements before production. No legal approval is claimed.
4. Shared testing PINs identify owner devices, not an individually proven Danielle identity. Individual accounts/permissions, recovery/passkeys and production acceptance remain launch blockers; production guards are active.
5. Notifications are persistent in-app attention indicators. External/background email/push delivery is unconfigured and not claimed.
6. Preview limits remain: 300 orders, 2,000 audited operations, 100 messages/order, 1.2 MB ledger, 30 revisions/1.5 MB history, 500 directory records and an 8 MB in-app photo archive. Unsafe writes are refused rather than silently deleting financial/order history. Expand audited storage and establish scheduled backups/retention and production restoration before business-scale launch.
7. Hosted acceptance needs the exact isolated preview hostname added to the environment's allowed hosts. DNS/production permissions are unnecessary for that test.

## Links and Danielle's test steps

- [Customer preview](https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/)
- [Website Studio](https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/studio)
- Fictional tracking example: handed over separately with its complete `#access=` fragment; keep it private.
- Follow [Danielle's step-by-step guide](COMMERCE-UPDATE.md#danielles-preview-test): configure business days and approved business destinations, place a fictional main-preview order, open/cancel each payment destination without sending money, verify the fictional payment, progress preparation, exchange messages, approve an extension and check the second device.
- [Separate GoDaddy-to-Cloudflare checklist](GODADDY-CLOUDFLARE-CHECKLIST.md): preparation only, requiring later production approval.

## Production protection

No merge to main, production deployment, original beta deployment/data change, Register/Admin change, Supabase write/migration, Square change, live-customer modification, GoDaddy/DNS/nameserver change, custom routing or official-domain activation was performed. No DNS/zone mutation API was called. `rise-and-roost.com` remains a later connection and is not assumed active.

## Deployment record

- Deployment confirmed by Cloudflare at **November 01, 2026 at 02:44 PM EST**; CLI exited successfully.
- Worker: `rise-roost-experience-preview`; source commit: `f6771fdd3bb9dbcb2bca184b5349a0b749ad844e`.
- Deployment: `836a2977-3254-437a-bd76-ab2d42c609f5`; version: `cb19c0f3-651c-48d8-a8d2-f9f729ed1399` at **100% traffic**.
- D1: `21352b95-d7f6-406f-8527-4b8dbcebf1bf` (`rise-roost-experience-preview-db`). Every original binding is preserved, including the private PIN pepper; only the commerce flag and base URL were added. workers.dev remains enabled; alternate version preview URLs remain disabled.
- Post-deployment comparison confirms all existing rows in all 14 preview application tables are unchanged. Only one synthetic workspace row was added. All 70 pre-existing workspace documents, products, photos, orders, membership and authentication rows match their baseline. All six original-beta application tables and its Worker settings/deployment are unchanged.
- No SQL migration, schema write, production deployment, domain change or hosted owner-session creation occurred.
- Hosted pages and the fictional tracking link remain **unverified over HTTPS from this environment**, because its proxy blocks the preview hostname. Deployment metadata and D1 preservation checks do not substitute for hosted browser acceptance.
- Final date-only requests show “time not specified”; approved appointments display a single 12-hour time. The final desktop/iPhone journeys and 120 backend tests were repeated after this correction.
- A preview-only rollback can select the previously deployed version `0fcb8816-7fba-420c-a859-fed441482d20` on this exact Worker. Export a fresh private backup first. No database downgrade is needed for these additive fields; do not overwrite the current database with an older snapshot. Rollback was not performed.

## Review evidence

[Verification metadata](commerce-update/verification.json) · [iPhone dashboard](commerce-update/dashboard-iphone.png) · [iPhone order actions](commerce-update/studio-iphone.png) · [iPhone private tracking](commerce-update/tracking-iphone.png). Screenshots use fictional local data, never the owner PIN or live customer records.

## Unattended follow-up

Pickup-help requests without an alternative date now raise the extension-request indicator; order questions remain separate. Unfinished and unconfirmed contact drafts survive reload in the same browser tab, using a capability-bound recovery key and the original request identifier. An explicit acknowledgment of the exact persisted message is required before clearing the draft. A generic HTTP 200 page, wrong-order response or response without the message acknowledgment cannot count as a successful send. If browser storage is denied, the form explains that the tab must remain open for recovery. Neither request type changes pickup times or approves an extension.

Both normal deployment commands now explicitly select the isolated experience configuration; the default can no longer accidentally select the original beta. `test:all` includes the new commerce journeys. The new read-only operator backup tool supports a no-network plan, refuses database overrides and existing output paths, restores all application tables/indexes locally, and verifies every record and schema while detecting changed remote data. Actual backup/restoration and three scope/overwrite guard checks passed with zero remote writes. Background scheduled backups are still not configured.

Time-only pickup suggestions are supported without inventing a date; backend and browser checks confirm that the original pickup and deadline remain unchanged until explicit owner approval. The final local suite passed **120 backend checks, 120 browser regression cases, four expanded commerce journeys and 12 targeted customer regression cases**. The latter targeted cases overlap the broad regression coverage and are not claimed as additional unique features.
