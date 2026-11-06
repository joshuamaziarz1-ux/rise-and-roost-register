# Member-only Cash at Pickup

Cash at Pickup is an optional benefit for authenticated Roost members. It starts **OFF**. Enabling it does not activate production checkout or resume paused ordering.

## Danielle's controls

- **Settings → Payments → Cash at Pickup → Allow Cash at Pickup for Roost Members** saves the master setting. Turning it off blocks new cash orders while retaining all existing orders and payment history.
- **The Roost → select a member → Cash at Pickup** shows Allowed or Disabled. Every real membership defaults to Allowed. **Disable cash privileges** and **Restore cash privileges** accept an optional internal reason; the customer never receives that note. Account access, other payment methods and return credits remain available.
- The member detail shows outstanding and previous cash orders alongside ordinary order history. Cash orders show their method, unpaid status, remaining amount, customer/member and pickup information in Orders.
- **Orders → cash order → Mark Cash Received** displays the exact cash amount and requires **I received the full cash amount shown → Confirm Cash Received**. The normal verification record, receipt, timestamp, owner audit and credit finalization are saved together. A retry cannot record payment twice.
- After the pickup deadline and resolution of open communications/disputes, **Close as Unpaid / Not Picked Up** requires a review reason and explicit confirmation. It preserves the outcome in history, releases reserved credit and the outstanding-cash restriction, and retains the existing forfeiture inventory accounting. Before the deadline, use the existing confirmed cancellation controls. Neither action charges a fee or automatically restricts the member.
- The existing **Settings → Studio Help Guide** explains these controls. No Help content was added to Studio Home.

## Checkout and security

Guests retain normal checkout and see a friendly Join The Roost link. Cash is shown only in authenticated member checkout when enabled, unrestricted and without another unresolved cash order. Only currently enabled/configured payment methods are displayed. Four payment cards use a two-by-two layout; narrow screens stack them. Existing desktop columns, pickup selection, policy acknowledgement, summary, focus and selected states are retained.

The server derives the member from the existing authenticated Roost session, never a submitted identity, name or contact information. It checks master and individual eligibility against the latest ledger on every order attempt. The single outstanding-order check and the order/inventory/credit reservation share the existing D1 workspace compare-and-swap transaction; conflicts retry against fresh state. Preparing, Ready and overdue cash orders remain unpaid and continue blocking another cash order. The member may still use another enabled payment method or credit-only checkout. Canceled, formally resolved or paid cash orders release the restriction.

Cash cannot be selected through the anonymous tracking API, and tracking cannot convert an existing cash order into another method to bypass the restriction. Customers cannot record receipt. All Studio changes retain individual Cloudflare Access owner authentication, same-origin checks, operation idempotency and the existing actor-tagged audit. Reopening canceled cash orders rechecks eligibility and outstanding orders. Voiding a mistaken cash receipt cannot introduce a second unresolved cash order.

Cash orders enter normal preparation immediately with `paymentStatus=awaiting_cash`, `selectedPaymentMethod=cash_pickup`, and the existing server-calculated `total` as the cash balance. Confirmation, private tracking and Roost history disclose the unpaid cash amount and pickup information. Ready never implies paid. Payment-app links are not shown on cash tracking pages.

## Return credits and storage

The existing server-authoritative monetary ledger is unchanged. A $20 order with $5 credit reserves $5 and owes $15 cash. Mark Cash Received finalizes that reservation once. Cancellation or unpaid closure releases a reservation once; normal paid-order cancellation restores used credit using the existing lifecycle. Full-credit orders finalize through the existing zero-balance path and never create an outstanding cash payment.

No schema migration, table, competing order/payment/credit system, account conversion, data reseed or production database write is required for deployment. New JSON fields are additive and lazy: `management.settings.cashPickupEnabled` defaults to false when absent; `management.cashPrivileges[memberId]` defaults to Allowed when absent. Existing order payment/verification/receipt/resolution records and audit operations hold the new cash events. Existing ledger storage and operation limits remain enforced.

## Verification

Use isolated local data only. Run `npm test`, `python tests/production_schema_guards.py`, the cash, cash-regression, production and commerce Playwright configurations, and `tests/production-launch-worker-smoke.mjs` against the exact dry-built production executable. The smoke uses real local workerd/D1, synthetic signed owners and software passkeys; it performs no hosted requests or writes.

Browser coverage includes desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. Emulation does not certify real biometric devices or external payment-provider applications.

Production release checks compare the live executable's source map with the approved source, current remote branches/deployments, all original database row/schema fingerprints, Access applications/policies, bindings and runtime/asset configuration. Preserve `REAL_CHECKOUT_ENABLED=false`, `orderingPaused=true`, and the absent/false cash master setting. Verify production with GET/HEAD only. Never restore D1 for a code rollback; retain a cash/credit-compatible Worker after cash orders exist.

## Visual evidence

Synthetic local checkout with three configured providers, eligible membership, $5 return credit and Cash at Pickup selected: [desktop](cash-at-pickup/desktop.png) and [iPhone WebKit](cash-at-pickup/iphone.png). No production order, account or payment was used.

## Final local results

All **397 distinct automated cases pass** after targeted reruns: 257 backend/security/financial tests (14 cash-specific), 7 production schema guards, 105 checkout/member/credit/pickup/Help/navigation browser cases, 10 cash browser cases across five profiles, 10 production-style owner/payment browser cases, and 8 commerce/payment-settings browser cases. The exact production executable additionally passes the actual local workerd/D1 smoke, including the concurrent cash-order race, authenticated eligibility, owner-only receipt, credit finalization, privileges and master toggle.

Initial browser helpers assumed desktop-only Studio controls and the old payment-to-policy tab order. They were corrected to follow mobile navigation/cards and the new guest invitation link. The final two cash mobile cases and all five payment-card focus/layout cases pass in their focused reruns; there are no unresolved test failures or skipped cases. Cash, checkout, credit, guest/member, passkey, remembered-session, favorites, pickup/inventory, confirmation/tracking, Studio orders, Help and ordering-pause coverage is retained. Public application and payment-provider biometric behavior is tested with browser emulation and synthetic local data, not real production payments.
