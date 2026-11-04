# Rise & Roost — November 4, 2026 readiness report

**Not yet open for real orders.** Development remains on `codex/production-launch-readiness`, draft PR #14. No merge, deployment, public-domain/DNS change or real-checkout activation was performed in this follow-up.

## Already implemented and preserved

The five-area Website Studio, persistent Payment Settings, guest checkout, private order tracking, owner-only manual verification, verified-sales reporting, three-stage fulfillment, messages, Customer Contacted indicators, owner-approved extensions, business-day pickup deadlines, flexible calendar, stock/production reservations, product/photo management and layout-preserving content editing were already implemented. They were continued rather than rebuilt.

The approved customer homepage, navigation, farmhouse palette, typography and product presentation are unchanged. Original Register/Admin, original beta, experience preview, Supabase and Square received no writes or deployments. No example products, orders or fictional customers were imported into production.

## Changes in this follow-up

- The saved order's payment page has one tappable QR tile per active, validated PayPal/Venmo/Cash App destination. The native link opens that exact destination directly on the same phone, with the order number and private tracking link already saved. QR codes are generated locally and independently decoded in tests to verify the same URL. No external QR service receives customer information, amount, order reference or private tracking capability.
- A changed destination still requires a new owner-confirmed link test. No customer payment-report button or automatic financial verification was added. Selecting/opening a destination only records a payment-method preference; financial status and verified sales remain unchanged. An interrupted preference save retains the order and reports the failure.
- Production tracking returns to the main shop rather than a demo path. Real tracking pages and receipts no longer show beta wording. Visual inspection also found and removed literal `null` placeholders created by optional page elements. Layout and branding were preserved.
- Prepared HTTPS `www` navigation redirects to the apex host. Cross-host writes are rejected, and both owner APIs and other Worker hostnames remain protected. These are code changes only: no DNS record or Worker custom-domain binding was created.
- The owner's reported 24-hour Access session is explicitly tested at the exact expiry boundary. The two supplied owner identities are prepared privately; their addresses are not committed to public source code. Actual application issuer/AUD values are still required.

## Tests and their limits

Locally passed: **163 backend tests**, **six desktop/iPhone-sized WebKit production browser tests**, production bundle dry run, launch-guard smoke, and actual local workerd/D1 owner/order/inventory/verification/fulfillment smoke. The browser tests decode the actual rendered QR SVGs, test all three provider handoffs using synthetic intercepted pages, preserve the private order page, test interrupted saves, and verify no payment or sale is created by opening a tile. Product creation/photo upload/archive and the full order journey remain covered. Dependency audit reports zero known advisories.

The independent CI workflow also runs the full 120-browser/eight-commerce regression, both production Worker checks and legacy classic/PIN compatibility checks. See the current PR #14 checks for its actual result; a queued/running check is not a passed check. All test customers/orders/provider pages are local synthetic fixtures, never hosted production purchases. An iPhone-sized WebKit profile is not a physical iPhone.

**Hosted checks have not passed in this follow-up.** Cloudflare rejects the configured credential with HTTP 401 and error 1000, `Invalid API Token`; relevant D1/zone requests also fail. This prevents fresh account, database, Access-policy, certificate, Worker-binding and deployment inspection. The secret binding being present does not establish valid Cloudflare authorization. There is no authentication bypass or attempted public deployment.

The owner reports that the Access application and two-email policy exist, its session is 24 hours, Zero Trust Free is active, DNS is active, Universal SSL and a backup certificate are issued, and SSL/TLS is Full. These are supplied facts, not independently verified account checks. No Let's Encrypt installation or certificate purchase is needed or proposed.

## Production data and deployment status

The last successful production inspection/initialization was November 2: `rise-roost-production-db`, UUID `889a4b96-cabd-43d1-ad45-79f65b0052b0`, with 12 application tables/two indexes, one business workspace, one identity marker, zero products/orders/sales/customers/messages, confirmed pickup address **3431 County Rd. 60, Auburn, IN 46706**, and ordering paused. That initialization must not be repeated to reset anything Danielle may subsequently add. Current remote contents cannot be reconfirmed until the invalid credential is replaced.

Preview remains configured for `21352b95-d7f6-406f-8527-4b8dbcebf1bf`; original beta remains configured for `7824ffe0-d69a-4221-9aec-0f335257477a`. The production profile binds only the new UUID. `PRODUCTION_RELEASE_APPROVED=false`, `REAL_CHECKOUT_ENABLED=false`, public workers.dev URLs and preview URLs remain disabled, and no public routes are configured in the preparation profile.

No live customer/Studio URL is claimed by this task. The intended destinations are `https://rise-and-roost.com` and `https://rise-and-roost.com/studio`; their current public behavior and mapping cannot be certified with the available access. Staging may proceed only after the security/configuration gates are satisfied and within the owner's approved rollout scope. Opening for orders requires Danielle's explicit approval and at least one saved, enabled and tested genuine business destination.

## Recovery protection

R2 remains postponed under the owner's earlier instruction. No independent automated archive, external retention or missing-backup monitor has been activated. D1 Time Travel is documented as seven days on Workers Free / 30 days on Workers Paid; the Workers/D1 plan cannot currently be inspected. **Zero Trust Free does not establish the Workers/D1 plan.** A production Time Travel bookmark was retrieved during the prior work, but no hosted/in-place restoration was attempted.

The November 2 actual production logical snapshot restored into a new local SQLite database with every record and schema object matching and integrity checks passing; source records stayed unchanged. Local encrypted recovery and refusal of existing restore targets are also tested. The provider-hosted SQL export download failed in that environment and is not claimed verified. These checks do not establish an operational daily backup or protect against loss outside the recovery window/account-wide access loss.

Before real checkout, verify a fresh private business/D1 export can be obtained and a restoration procedure/retention responsibility is established. Studio's existing business download excludes sign-in credentials/recovery secrets; a full D1/auth/configuration recovery needs an operator. Do not restore over live data as a drill. The strict no-refund/forfeiture policy still needs final Indiana legal/provider review before activation. Never automatically forfeit an order or infer extension approval from a message.

## Required dashboard actions — no programming or terminal commands

### 1. Replace the invalid Cloudflare credential securely

If a valid dedicated launch token already exists, use it; do not rotate credentials used by other systems. Otherwise:

1. Open the Cloudflare dashboard. Select the profile icon → **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Name it **Rise & Roost launch preparation** and restrict account resources to the account containing the Rise & Roost Workers/D1 database.
3. For this inspection/preparation phase, grant Account permissions **Workers Scripts: Edit**, **D1: Read**, **Access: Apps and Policies: Read**, and **Access: Organizations, Identity Providers, and Groups: Read**. Grant Zone **Read**, **DNS: Read**, **Zone Settings: Read**, **SSL and Certificates: Read**, and **Workers Routes: Read**, restricted to `rise-and-roost.com`. These are for the actual account/configuration checks; DNS/custom-routing writes remain separately controlled by launch approval. Do not add Supabase, Square, billing or R2 permissions.
4. Select **Continue to summary → Create Token**.
5. In this task's secure Cloud environment settings, replace the existing secret named **`CLOUDFLARE_API_TOKEN`**. Keep the existing account-ID setting. **Do not paste the token into chat, source code, screenshots or PR comments.** No terminal commands are needed. The current environment tooling can inspect readiness but cannot replace your secret for you.

### 2. Provide the two non-secret Access identifiers

1. In Cloudflare, open **Zero Trust → Access controls → Applications**.
2. Select **Edit** on **Rise & Roost Website Studio**.
3. Open **Additional settings** and copy **Application Audience (AUD) Tag**. Do not change the application or policy.
4. Open **Zero Trust → Reusable components → Custom pages** and find **Team domain**. Some dashboard views show **Custom pages → Team name and domain** directly. Copy the existing domain ending in `.cloudflareaccess.com`; do not rename it.
5. Send only the **AUD tag and team domain** here. They are configuration identifiers, not passwords or login codes. Both owner emails are already known and do not need to be resent.

These locations are documented in Cloudflare's official [AUD guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag) and [team-domain FAQ](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/). Menu wording can vary by dashboard view.

After access is restored, the operator can inspect the existing policy/certificates/routing, install production-only Access secret bindings, validate the exact D1 binding and prepare the separate production Worker. You do not need to edit code or run deployment commands. Public domain/parking-record changes and checkout activation will not occur as a side effect of supplying these identifiers. The managed environment also currently lacks direct hosted-site/Access-domain network access; no alternate proxy or hosted CI test is used to bypass that restriction.

### 3. Complete the paused staged setup and acceptance

After the staged rollout is authorized and its security gates pass:

- Danielle opens Studio on her iPhone and MacBook with her own email; the other owner repeats with their own email. Confirm sign-out/recovery and that a private, unsigned browser cannot read owner data. Never share email login codes.
- **Products → Add product**: enter real name/price/stock/production capacity, choose a photo, save, and confirm the other device/customer shop updates. Archive unwanted products rather than erase history. **Calendar**: confirm future pickup dates, hours, cutoffs, business days and closures.
- **More → Settings → Payments**: save an approved business URL, enable it, use **Test Link**, inspect the recipient and confirm the test without sending money. Repeat for any other method Danielle wants to offer.
- On iPhone Safari/MacBook, check basket/guest checkout, the acknowledged policy, exact amount, saved order number/private link, same-phone payment tile handoff and return/cancel behavior. Use the isolated preview for fictional purchases; keep production free of test orders. Actual provider/native-app and physical-device behavior are not certified by synthetic intercepted tests.
- Verify backup/recovery responsibility and the legal/provider policy review. Only after those checks and **Danielle's explicit approval** may the operator enable real checkout and Danielle unpause ordering. Verify the first genuine order, independent receipt of funds and owner payment confirmation.
