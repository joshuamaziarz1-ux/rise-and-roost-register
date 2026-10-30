# Rise & Roost Website Studio preview

Customer preview: https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/

Main preview Studio: https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/studio

Both computers must open the same saved preview workspace. Generic `/studio` selects the configured main preview, not a random demo cookie. Separate private demos stay separate. Existing matching access details remain required; creating a demo does not recover the original website.

## Daily work

- **Home:** today's independently verified payments, order value, payments/new orders/pickups/low stock/comments, and configurable attention alerts. Each card opens matching records; upcoming means the next 48 hours.
- **Orders:** search or filter; open an order for customer contacts, immutable product/price/pickup snapshots, separate payment and preparation status, private tracking, and history. Verify only after checking an independent full-payment record. Refund recording confirms an external refund; it does not send money. Mistaken verification can be voided with a reason while retaining the original audit/receipt. Cancellations never automatically refund, and inventory releases require an explicit choice.
- **Products:** save names, descriptions, photos, categories, variants, prices and availability immediately to the matching preview. Choose physical stock or per-pickup production; existing products retain their existing model until explicitly changed. Available physical units means units free after booked orders. Archive hides a product while preserving order history. To restore, clear Archived and enable Visible as appropriate.
- **Calendar:** any weekday, individual or recurring dates (up to 90 days per generated schedule), 12-hour windows, deadlines, per-date product limits, special events, blocked dates, copy and ordering pause. Existing orders keep original pickup details; changing a booked date/time creates a new slot and closes the old slot to new orders. Pickup/production lists print from the selected day.
- **More → The Roost:** member directory, contacts, orders, and separately recorded bottle returns/credits. No Register integration, checkout credit redemption, or reward policy is activated.
- **More → Website Content:** wording, business/address/payment instructions, content images. Save a draft, preview it, then publish. Product/calendar saves preserve unrelated content drafts. Content publish/restore keeps current operational products/prices/schedules. The approved theme and layout are locked on the server.
- **More → Customer Comments:** review, search, approve or hide. Hidden original text remains private and retained.
- **More → Sales Reports:** Indiana-local Today/Week/Month/Year/Custom; verified payments, external refunds, order value, outstanding balances, cancellations, returning identified members, popular products, CSV. Voided verifications restate verified totals; corrections are disclosed separately and never deducted twice. Refunds use their record date. Guest identities are not guessed.
- **More → Settings:** secure device pairing, backups, in-app alert preferences and audit. External messaging remains disabled. Individual owner accounts are pending Descope setup and approval.

## Reliable saves

Connected polling runs every five seconds while visible and on focus/reconnect. An open form is never replaced by incoming data. Offline fields remain unsaved; reconnect and retry. If a response is lost after a server commit, Check connection confirms the original operation instead of applying it twice. Resolve previous save can fence an unconfirmed request before starting a different action. Conflicting edits require review; the rebase keeps edited fields and adopts other-device changes to untouched fields. Product/content/calendar form drafts are scoped to this workspace in this tab's session storage; payment/customer data is not put in that draft store.

## Devices and limits

Safari → Share → Add to Home Screen is supported through a Studio manifest. Native installation, camera/photo-library behavior, screen-reader ergonomics, real passkeys/Touch ID and real-world connectivity still need physical-device testing. No private API service-worker cache is created.

This is an isolated management preview, not a production-ready business system yet. Existing storage guards are 300 orders, 60 products, 100 pickup slots, 500 visible members/comments and 2,000 management operations per workspace; ledger/history byte guards fail closed. Content history retains up to 30 revisions. A normalized, paginated storage migration is needed before business-scale adoption. A complete in-app photo backup is capped at 8 MB; see RECOVERY.md. Owner audits identify the authenticated workspace session until individual accounts are configured; they do not pretend to distinguish Danielle and Joshua.
