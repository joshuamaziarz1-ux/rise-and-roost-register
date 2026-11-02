# Payment Settings and launch readiness

Payment destinations belong to Danielle's authenticated Studio workspace. No account identifiers are embedded in application code. Use **More → Settings → Payments** on an iPhone, or **Settings → Payments** in the desktop sidebar. Studio is available even when all payment methods are unconfigured.

[iPhone preview](payment-settings/iphone.png) · [Desktop preview](payment-settings/desktop.png). These screenshots use fictional local destinations.

## Danielle's setup

1. Choose **Add PayPal link**, **Add Venmo link** or **Add Cash App link**. Paste the complete HTTPS destination supplied by the provider for your approved business sales. The validator accepts supported provider payment/profile paths and rejects other hosts, credentials, unsafe schemes, added query parameters and fragments. A URL alone cannot establish account ownership or commercial approval.
2. Select **Enabled for customer payments** and confirm that the destination is approved for business sales. Choose **Save payment link**. Save errors keep your fields; no successful-save notice appears until the server confirms persistence.
3. Choose **Test … Link**. Inspect the recipient in the new tab and return to Studio. If a popup was blocked, use **Open saved … test link**. **Do not send money for this test.**
4. Check **I opened the … link and confirmed the correct business recipient**, then choose **Confirm … Link Test**. Opening the link alone does not complete the test. Confirmation must occur within 30 minutes; otherwise start a new test.
5. Confirm the method says **Ready**. Customer checkout now uses this exact saved destination. Repeat for the other methods as needed. At least one enabled, valid destination with an owner-confirmed test is required for payable orders.
6. Open Studio on your other device. Saved destinations, enable settings and test confirmations synchronize automatically. **Disable …** removes a method from checkout. **Enable …** can reuse a confirmed test of the unchanged URL. Editing a URL invalidates its prior test, and the replacement cannot be used until tested again. Cancel discards an unsaved edit.

The launch-audit candidate displays only configured, enabled, tested providers at checkout and on private tracking. Unavailable methods remain rejected server-side. When no tested method is active, customers can browse and use their basket, but cannot place a positive-total order. The server independently enforces this before reserving inventory, including a concurrent owner disable. Zero-total orders do not require external payment. These audit changes remain on the development branch pending review; the earlier deployed preview displayed unavailable methods as disabled buttons.

Orders are saved before payment links are offered. Opening, canceling, abandoning or returning from a provider page never changes payment status or verified sales. Danielle must continue to check her independent provider records and use **Verify Payment** with its confirmation. Disabling or editing a link does not cancel an existing order, release its reservation or erase its financial history. Existing tracking pages receive the current active destinations and preserve Contact Danielle.

## Persistence and protection

- Owner sessions and same-origin JSON are required for payment writes. Customer responses contain active URLs only, excluding disabled/untested destinations and owner/test audit metadata.
- Server-side validation and version checks prevent unsafe destinations and silent overwrites between devices. Existing operation IDs prevent duplicated actions after lost responses. Malformed success responses cannot clear a form or show a save-success message.
- The existing isolated D1 ledger stores each destination, enable setting, commercial-use acknowledgment, owner-device identity, timestamps, test confirmation and before/after audit. No credentials or payment account tokens are needed.
- Business-backup restoration retains the saved URLs privately but disables destinations and removes test certifications. The owner must enable and retest them in the restored copy. Source settings remain unchanged.
- Existing shared preview PIN access is for testing. Individual owner identity and production authentication remain launch prerequisites.

## Required launch-readiness acceptance

Automated coverage runs through `npm test`, `npm run test:commerce-browser` and the local workerd/D1 smoke test. The commerce browser suite includes the following on desktop Chromium and iPhone-sized WebKit:

- Access Studio with no configured links; unavailable checkout methods are hidden and positive-total ordering is disabled.
- Save all three supported destinations; reject unsafe and provider-mismatched URLs without losing edits.
- Open a test without confirming: checkout remains paused. Confirm a test: only the saved active destination becomes available. A forged client test field cannot enable checkout.
- Enable/disable from a second independent owner session; confirm checkout and Studio update. Reject stale snapshots and conflicting edits; review and retry safely.
- Edit a URL: invalidate its test and remove it from customer payment choices until retested. Preserve existing orders and payment status.
- Simulate failed and malformed successful saves, Cancel, PIN lock/unlock and draft recovery. Do not show success for an unconfirmed save.
- Place an order only after readiness, open/cancel each intercepted provider destination without sending money, return to tracking and verify manually. Sales update only after owner verification; duplicate verification is prevented. Existing commerce tests retain correction/refund coverage.
- Server tests check expired tests, stale test confirmations, strict owner authorization, concurrent disable/checkout races, zero-total exemptions and restored-copy payment safety.

Before launch, Danielle must additionally inspect her actual recipient identities, approved business-account status and provider terms; test the actual links on her iPhone and MacBook; and confirm returning from the real apps preserves the order page. Automated provider pages are fictional intercepts, not proof that a real account, payment or native handoff works. No money is sent by these tests.

The isolated preview hostname is currently blocked by this environment's network allowlist, so hosted HTTP/browser acceptance must be performed from an authorized network. Local browser and workerd results and Cloudflare deployment records are reported separately in [the Payment Settings release report](PAYMENT-SETTINGS-RESULTS.md). Do not activate the official domain or use production data for this acceptance.
