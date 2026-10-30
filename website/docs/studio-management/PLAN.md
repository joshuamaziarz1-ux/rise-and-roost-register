# Rise & Roost Website Studio

This branch builds on PR #9 (`4fbe3ab`). PRs #8 and #3 remain separate drafts. No merges, original beta deployments, Register/Admin, Supabase, Square, DNS, or custom-domain changes are authorized.

## Inspection and risks

- The existing Studio is a general website builder. Its layout/theme controls do not belong in Danielle's management app. The new Studio must expose content fields only and enforce that restriction on the server.
- Workspace-scoped owner cookies, cross-device pairing, CSRF/origin checks, draft revision checks, server quotes, order idempotency, and compare-and-swap ledger writes already work. Reuse these protections.
- Stock currently combines a lifetime stock allowance and one per-pickup capacity. Add explicit physical/production models and per-date production limits without reinterpreting existing saved products automatically.
- Orders preserve product/price/pickup snapshots. Keep those immutable. Schedule changes must not silently move existing orders; new pickup identities are needed when dates/times change.
- Payment verification exists, but financial summaries must use verification timestamps, distinguish order value/refunds/corrections, and avoid treating cancellation as a refund.
- Existing orders are stored in a bounded workspace ledger (300-order guard). Preserve the guard rather than silently exceeding storage limits. A production-scale normalized-order migration needs a separate, tested rollout before live use.
- No Descope configuration is present. The earlier requirement to test both owner accounts and obtain approval before switching authentication still applies. Build management behind the existing secure owner access; no new provider or weakened recovery shortcut is enabled.
- The preview has existing saved workspaces and customer data. Test mutations must use fresh synthetic workspaces. Keep a read-only preservation fingerprint, and test export/restore using synthetic data only.

## Implementation stages

1. Add a preview-only management API and iPhone/desktop Studio shell (Home, Orders, Products, Calendar, More); keep legacy authentication and current customer layout.
2. Add immediate, validated product saves, physical stock adjustments, archive/restore, date-specific production capacity, and server-side concurrency protection.
3. Add owner order search, filters, payment verification, recorded external refunds/corrections, audit history, protected cancellation/status corrections, pickup/production print lists.
4. Add arbitrary-day/recurring calendars, blocked dates, copied schedules, pause ordering, and warnings/protection for existing orders.
5. Add business-local dashboard/report ranges, verified receipts/refunds/net totals, attention cards, exports, and in-app alerts.
6. Add member directory/activity and separately recorded returns/credits; no Register integration or automatic reward/redemption policy.
7. Add layout-locked content drafts/preview/publish/history/restore and comment management; ensure immediate operational saves preserve unpublished content.
8. Test the requested reliability matrix, actual synthetic backup/restore, two independent browser contexts, mobile layouts, offline/reconnect, and unauthorized access. Deploy verified management changes to the experience preview only. Report provider/account and physical-device checks honestly.

## Reliability rules

- Store money as integer cents. Verified receipts use verification time, not order creation/report time. Refunds record independently verified external transactions; this app never transfers funds.
- Every mutation has a unique operation ID, expected document/ledger revision, and owner audit entry. Conflict/offline failures preserve unsaved form values and never display success.
- Cart contents do not reserve stock. Only successful server order commits consume stock/capacity; abandoned baskets cannot strand inventory. Cancellations release only inventory that was actually returned to availability.
- Operational product/calendar saves update published and draft operational fields together, preserving unrelated unpublished copy. Content publish cannot roll back newer operational changes.
- Do not cache private API responses in a PWA service worker. Poll/reconnect only re-fetches; never silently retries a financial action with a new operation ID.

## Acceptance

Use fresh synthetic owner/customer workspaces for simultaneous last-item orders, duplicate requests, concurrent edits, save failure, archiving/history, schedule changes with orders, payment/report/refund totals, notifications disabled/failure, tracking/member privacy, image errors, DST boundaries, backup restoration, and reconnect tests. Customer screenshots must show the approved design unchanged. Owner-account/provider enrollment remains pending until both real owners are configured and approve activation.
