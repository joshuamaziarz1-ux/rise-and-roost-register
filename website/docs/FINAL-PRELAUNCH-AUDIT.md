# Rise & Roost final pre-launch audit — November 2, 2026

**Latest update:** The owner approved an empty production catalog and confirmed the pickup address. Production now contains one business workspace and one identity marker, with zero products/orders/sales/customer activity. R2 backups are postponed by owner decision. [The current launch report](FAST-PRODUCTION-LAUNCH.md) supersedes older provisioning, initialization and mandatory-R2 launch gates below; earlier test evidence remains historical. Hosted individual owner authentication and explicit launch approvals are still required.

**BLOCKED: not ready for public launch.** This audit does not approve launch. The original audit performed no merge, official-domain deployment, DNS/nameserver/custom-route change, production provisioning, existing data deletion/reset, real checkout activation or protected-system change. The November 2 follow-up below adds only the expressly authorized empty production schema. The approved design is preserved.

[Machine-readable verification](prelaunch-audit/verification.json) accompanies this report. The private record-classification assessment is intentionally excluded from Git and public PR artifacts.

## Production-database follow-up

The owner subsequently created `rise-roost-production-db` (`889a4b96-cabd-43d1-ad45-79f65b0052b0`). Its exact identity and empty catalog were verified, then **12 empty application tables and two indexes** were installed under the new authorization. No business/customer/credential rows were inserted; no preview/beta writes, deployment, merge, domain change or checkout activation occurred. A production configuration and review-only business initialization package are prepared on `codex/production-database-preparation`. Individual owner authentication and automated backups remain blocked. See [the current production preparation report](PRODUCTION-DATABASE-PREPARATION.md) for current evidence and the single next Cloudflare step.

## Status

| Area | Status | Evidence / remaining action |
| --- | --- | --- |
| Existing website persistence | PASS for preview architecture and local tests | Business data resides in persistent D1, not browser-only storage. Device synchronization, reload/reconnection and failed-save recovery are exercised. Existing deployed records match protected baseline checks. |
| Preview vs original beta | PASS | Different Worker bindings and D1 UUIDs, listed below. |
| Production database and uploaded-file separation | PASS for separate database/config; deployment pending | Dedicated production UUID and empty assets table verified; production configuration binds it exclusively. No production Worker is deployed, so hosted binding acceptance remains pending. |
| Clean production / zero test sales | PASS for empty schema; initialization BLOCKED | All 12 production tables have zero rows. Existing source classification and business seed review remain unresolved. No live dashboard is available yet; no genuine records were deleted, reclassified or copied. |
| Owner production authentication | BLOCKED | Current access is the temporary shared preview PIN. Runtime guards refuse public production use pending individual owner accounts and review. No production identity/recovery service is configured. |
| Customer/owner authorization | PASS in preview/local tests | Private tracking bearer, workspace isolation, owner-only actions, same-origin writes, session expiry/revocation and throttling are tested. This does not certify future production auth. |
| D1 Time Travel | PASS for actual preview and new production DB | Read-only bookmarks retrieved for both. No in-place restore performed. Independent encrypted backups still require setup. |
| Daily production backups | BLOCKED / not operational | Encrypted job, private daily dispatcher, conditional writes, read-back verification, recovery CLI and tests are prepared. Production initialization/identity, R2 permissions/secrets, monitor, deployment and successful scheduled run remain missing. |
| Isolated recovery | PASS locally | Actual preview snapshot restored into a new local DB; encrypted synthetic backup persisted through a real local R2 runtime restart and restored records/media separately. Hosted production/R2 disaster recovery remains untested. |
| Payment settings and manual verification | PASS locally; NEEDS ACTION for actual destinations | All three provider settings, tests, enable/disable, conflicts and manual financial verification pass. No business payment destinations are saved in the main preview. No real account or money was tested. |
| Customer checkout | PASS on local audit candidate | Only configured/enabled/tested methods appear. No ready method blocks payable orders server-side before stock reservation. Opening links never proves payment. Interrupted/duplicate submissions and corrections/refunds are covered. |
| Studio and customer journeys | PASS for completed local tests | Dashboard, products/photos, sold out, inventory, arbitrary pickup days, deadlines, fulfillment, messages, extensions, content and reports are covered on desktop/mobile profiles. Final counts are recorded below. |
| Physical iPhone/MacBook and hosted acceptance | NEEDS ACTION | Actual native payment-app handoff/return, HEIC/photo-library behavior, real passkeys/recovery, weak cellular behavior and hosted HTTPS acceptance remain. Preview hostname is blocked by this environment's proxy (CONNECT 403). |
| Free-plan budget and lifetime limits | NEEDS ACTION before launch | Confirm billing/quotas, CPU capacity, polling budget, archive size and hard app caps. Several constraints can pause orders; see below. |
| Pickup-policy/legal and commercial terms | NEEDS ACTION | Indiana no-refund/forfeiture review, business-account approval and provider terms require qualified owner review. No approval is implied by URL validation. |
| Official domain / SSL / `/studio` | BLOCKED until approval and production readiness | The separate connection checklist is preparation only. DNS does not secure Studio; production owner authorization must pass before any domain is connected. |

## Exact storage map

| Information | Existing storage |
| --- | --- |
| Orders, historical product prices, pickup snapshots, accepted policy, fulfillment, extensions | `workspaces.ledger_json.orders` in the bound D1 database |
| Manually verified payments, verifier/time/reference, receipts, refunds/corrections/disputes and sales inputs | Per-order ledger records (`verifications`, receipt/payment fields, refunds/corrections/audit). Reports are derived from these; opening a payment link does not create a verified sale. |
| Guest customer contact and order messages/replies | Customer/message fields inside the correct order ledger; private bearer access controls the customer response |
| The Roost contacts, credentials, recovery hashes and sessions | `roost_members`, `roost_credentials`, `roost_sessions`, `roost_challenges` in the same bound D1; no production Register/Supabase membership data is used |
| Products, prices, base inventory/capacity and categories/variants | Workspace `published_json` / `draft_json`; order ledger reservations determine current availability atomically |
| Uploaded product/site photographs | D1 `assets` table (`workspace_id`, MIME and `bytes` BLOB); public `/api/assets/...` routes serve business images, not order messages or customer records |
| Bundled logo/starter photos and application assets | Versioned `website/public/assets` and the corresponding Worker's `ASSETS` deployment binding |
| Pickup windows, ordering cutoffs, closures/business days | Published/draft pickup settings and ledger management calendar; existing order schedules/deadlines retain their snapshot/history |
| Website text, images, revision history | Workspace draft/published documents and `versions_json` |
| PayPal/Venmo/Cash App destinations, enable setting, commercial confirmation, link-test audit/version | `ledger_json.management.settings.payments` and management audit. Public APIs omit inactive URLs and private test/owner metadata. |
| Existing workspace owner access and preview PIN | `workspaces.owner_hash`, `sessions`, `device_links`; `studio_pin_settings`, `studio_pin_sessions`, `studio_pin_limits`. PIN pepper is a private Worker secret. No individual production owner accounts exist yet. |
| In-progress UI forms / retry identifiers | Browser session storage is only recovery support. Server-confirmed D1 writes are authoritative; local storage is not the business database. |

D1 data persists independently of application assets/deployments. `schema.sql` uses additive `CREATE ... IF NOT EXISTS`; normal Worker deployment does not seed/reset the database. Existing restore APIs refuse the primary/occupied workspace, and the new recovery CLI refuses existing targets and has no remote write operation. Secrets are separate Worker/runner settings and need their own recovery kit. Future migrations and production deploys still require backup, binding verification and approval.

## Bindings verified through Cloudflare

| Existing Worker | D1 database | UUID |
| --- | --- | --- |
| `rise-roost-experience-preview` | `rise-roost-experience-preview-db` | `21352b95-d7f6-406f-8527-4b8dbcebf1bf` |
| Protected `rise-roost-beta` | `rise-roost-beta-db` | `7824ffe0-d69a-4221-9aec-0f335257477a` |
| Production website (configuration only, no Worker deployed) | `rise-roost-production-db` | `889a4b96-cabd-43d1-ad45-79f65b0052b0` |

Cloudflare reports the preview database engine `version: production`; that denotes modern D1 storage/Time Travel support, **not** a production customer website. Its actual schema has 14 application tables. Uploaded files currently live in that same preview database. The separate new production database must receive reviewed media blobs, workspace identity, auth and an independent deployed Worker binding; no live image URL may point back to preview storage. The production backup bucket must also be separate/private and absent from website bindings.

The configured credential could inspect website bindings, database metadata and Time Travel. R2 inventory and account subscription inspection returned **403**. Actual bucket policy/billing status is therefore unverified; do not interpret that as an empty bucket or confirmed subscription. Free-plan limits below refer to the intended plan stated by the owner.

**Domain state differs from the earlier project notes:** Cloudflare now reports `rise-and-roost.com` as an **Active** zone and assigns `faye.ns.cloudflare.com` / `uriah.ns.cloudflare.com`. The account has **no Worker Custom Domain mappings**. DNS-record, existing Worker-route and SSL inspection returned **403**, so actual parking records, authoritative delegation, any route-based mapping and served certificates remain unverified. An active zone is not a launched production website. No nameserver/DNS/route/SSL change was made. The domain checklist now starts from this observed state rather than assuming delegation is still undone.

## Clean-data gate

The private inspection identifies unclassified orders/payment history and a message in the main preview. No explicit trusted test/real marker distinguishes them. The current quote function assigns `simulated: true` to every new order, including commerce orders; that blanket legacy default cannot prove that no external funds were received. Preview location, names, timestamps or generic “Demo request” wording are also insufficient. A reviewed production mode must assign truthful environment metadata for new orders while preserving historical records. The exact owner-review references remain outside Git in the private assessment; customer details, private tracking capabilities and financial totals are excluded from this public report.

Before a clean candidate is populated, the owner must classify that activity and specify treatment of genuine records. Use an approved **configuration-only allowlist**, never a full disaster-recovery archive: published products/prices/descriptions, approved inventory/capacity, referenced image bytes, pickup/business settings, website copy and approved business destination URLs. Use a fresh production workspace, initial content revision and individual owner access; do not carry preview sessions, PINs, test customers/orders/payments/messages, operation history or verified-sale aggregates. Do not infer physical opening stock from test reservations. Confirm the actual stock counts, future pickup windows/business days and valid payment destinations.

Keep production ordering paused during preparation and payment destinations unavailable until Danielle confirms their recipient/business use in the production candidate and explicit checkout/launch approval is given. Retain all original preview workspaces, data and test activity for future testing. Genuine records cannot be silently discarded to obtain a $0 dashboard. No cleanup or business-data migration has run; the separately authorized empty production schema is documented in the follow-up above.

## Backup/recovery implementation

See [the production backup runbook](PRODUCTION-BACKUP-RUNBOOK.md) for activation, retention, permissions, AES-256-GCM encryption, independent private R2 storage, key recovery, missing-run alerts and tested isolated restoration. New backup/dispatch defaults are disabled. The planned daily trigger keeps bulk work off the website and Free-plan request CPU budget. No backup storage permission, scheduled run or production restore is claimed verified until actual setup and drills succeed.

## Free-plan and application limits that affect orders

Official Cloudflare documentation was checked through `cloudflare/cloudflare-docs` during the audit:

- Workers Free: **100,000 dynamic requests/day per account**, **10 ms CPU per HTTP/Cron invocation**. Workflows Free also documents **10 ms CPU per step**. Quota/CPU exhaustion can fail requests. Schema/JSON processing, growing ledgers, image handling and authentication need hosted measurements before relying on Free.
- Five-second polling can be material: one continuously visible tab can issue roughly **17,280 polls/day**; six such tabs exceed 100,000 before shopping traffic. Hidden tabs reduce activity. Preview and live Workers in one account share account quotas even with separate databases. Data isolation does not isolate Free-plan availability limits; consider separate accounts or Paid capacity if needed.
- D1 Free: **5 million rows read/day, 100,000 rows written/day**, **500 MB per database**, **5 GB account storage**, **10 databases/account**, **50 queries per Worker invocation**; Time Travel **7 days**. Exceeding the daily read/write quota makes D1 queries return errors until the daily reset at 00:00 UTC; storage exhaustion blocks further writes/schema growth. Whole-ledger writes make capacity/CPU monitoring important even when row counts are small.
- R2 Standard includes **10 GB-month**, **1 million Class A** and **10 million Class B operations/month** in its documented free tier. Eligibility, billing setup, lifecycle, retention and least-privilege access are still unverified. Independent backups consume storage; Free is not a promise of no charges at all sizes.
- Existing app safeguards: **300 orders/workspace, 2,000 audited operations, 100 messages/order, 1.2 MB ledger, 30 revisions/1.5 MB history, 500 directory records**, 12 MB input-photo limit and bounded business-export media. They fail safely rather than delete financial history, but can stop new orders/saves. The 300-order cap is a lifetime retained-order cap, not daily capacity. Establish an approved storage expansion/archive plan before business growth reaches these limits; a Workers Paid upgrade alone does not remove app caps.
- New encrypted backup/export limit: **32 MiB**; over-limit jobs fail and must alert. R2 archival retention does not purge primary business records. GitHub runner/service availability and the independent monitor must be validated before claiming dependable daily backups.

Sources: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workflows](https://developers.cloudflare.com/workflows/reference/limits/), [R2](https://developers.cloudflare.com/r2/pricing/).

## Security and acceptance limits

Production auth, recovery, remembered sessions and permissions must be tested with individual owners before lifting existing launch guards. Do not transplant the four-digit PIN, preview bypass flags, shared workspace keys, preview pepper or test owner sessions into production. Customer private-order and workspace boundaries pass existing tests, but secure preview access is not proof of configured production identity.

The review build also supports demo/workspace provisioning and preview/setup routes. A production variant must restrict or exclude these developer paths (`/api/workspaces`, `/demo/...`, preview APIs and testing PIN setup). The current top-level production guard blocks them before storage access; removing that guard without a reviewed production route/authentication policy would be unsafe.

The security follow-up upgraded the pinned Wrangler toolchain from 4.46.0 to **4.156.1**. Fresh dependency scans now report **zero known advisories across both runtime and development dependencies**, resolving the six earlier development-tool findings. The affected 140-test server/recovery suite, both actual Worker/D1 smoke tests and all three configuration dry runs passed. Local test harnesses use the SDK's published compatibility converter and explicit persistent storage; encrypted R2 archives still survive a runtime restart. No customer application behavior, live deployment or remote data was changed by this tooling upgrade. A limited static scan found no matching private-key/live-token credential patterns in the current website source/workflows; this is not a complete secret-management audit. No provider account credentials are hard-coded. Backups contain private customer/auth data and must remain encrypted, private and excluded from public PR artifacts/logs.

Local iPhone-sized WebKit is an automated browser profile, not a physical iPhone. Real recipient/business approval, native PayPal/Venmo/Cash App handoff/return, failed/canceled external payments, exact requested amount entry, device photo selection/HEIC, physical passkey/recovery hardware, and weak-network acceptance still require the owner. No money was sent. Hosted preview requests remain proxy-blocked; no other hostname, proxy or CI job was used to bypass that restriction.

## Automated test record

- Backend/security/backup/launch guards: **140 passed**, zero failures/skips/cancellations.
- Dedicated desktop Chromium/iPhone WebKit commerce/Payment Settings: **8 passed** after the available-methods-only change.
- Full five-profile browser regression: **120 passed** in the final repeat (desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium).
- Actual local workerd/D1 PIN setup, remembered sessions, isolated access, persisted payment settings, checkout, private messages, manual verification, fulfillment and extensions: passed.
- Existing classic Worker smoke: passed through a file-based isolated local runtime wrapper, covering assets/security headers, new D1 workspace, authenticated draft/save/publish and anonymous denial. Initial inline harness starts stalled before assertions; the file wrapper completed without an application change or hosted beta access.
- Isolated preview and original-beta configurations: dry-run compilation passed; private backup-trigger template: dry-run passed with activation false. No deployment occurred.
- Complete actual preview backup/SQLite restore and encrypted synthetic R2-runtime restart/restore: passed as described above.
- Hosted/production/R2 provider tests: blocked or not configured, explicitly excluded from passing totals. Other opt-in hosted scripts can create data in protected targets and were not run there.

The audit's small checkout change is a **development candidate**, not a claim that the deployed preview was updated. It hides inactive methods rather than presenting them as disabled options. Studio still lists all three providers for setup. No layout, typography, colors or navigation redesign was made.

## What you need to do before going live

### Owner decisions and checks

1. **Classify the five orders in the privately supplied review.** Confirm they are all tests, or identify genuine order numbers and how those records should be retained. A clean $0 test-free dashboard cannot be achieved by silently discarding genuine paid orders. All preview records stay intact.
2. **Approve the opening business setup.** Confirm product prices/photos, actual physical stock, preorder capacity, future pickup windows, business days/closures and the pickup-policy/legal review. Preview inventory reservations are not a substitute for a real stock count.
3. **Identify each authorized owner.** Supply the approved login email/identity and permissions for Danielle and the other owner, and agree on recovery access. Do not send passwords, recovery codes or private keys in chat. The temporary shared PIN is not production authentication.
4. **Save and inspect the actual business payment destinations.** In Studio, use **More → Settings → Payments**. Save each approved business URL with **Enabled for customer payments off**. Use **Test Link**, inspect the recipient on the same iPhone/MacBook, return and confirm the link test without sending money. Keep methods disabled until explicit checkout approval. No valid destination is currently saved in the main preview.
5. **Provide approved operator access through secure secret settings.** Backup storage, bucket-only S3 credentials, a separate encryption/recovery key, the backup-dispatch credential and missing-run monitoring must be configured. DNS/route/certificate inspection needs read access; current inspection permissions return 403. Full variable/secret names and permission boundaries are in the [backup runbook](PRODUCTION-BACKUP-RUNBOOK.md). These are infrastructure setup tasks, not Danielle's normal Studio work.

### Operator work after those decisions and the required approvals

1. Complete an unpublished production candidate using the **already-created separate D1 database** `889a4b96-cabd-43d1-ad45-79f65b0052b0` and its own uploaded media. Its empty schema is installed. After owner review, initialize only approved business configuration, handle any genuine records as explicitly agreed, and verify no test customers/orders/messages/payment verifications/sales remain. Confirm the deployed preview and production UUID bindings differ; preserve the preview and original beta. Do not create a duplicate database.
2. Implement/configure and test individual production owner sign-in, permissions, remembered sessions, sign-out and recovery. Exclude development/demo/setup routes from production. Keep the existing launch guard until those checks pass; never substitute the preview PIN or bypass flags.
3. Configure the private R2 backup bucket, encryption key recovery, retention and missing-run alerts. The prepared scheduler uses the protected `main` workflow: placing that reviewed code on `main` requires a **separate preparation-only merge approval**, before scheduler activation. It does not authorize public launch. While merging remains prohibited, scheduled production backups stay blocked. Prove an actual provider upload/read-back, a successful scheduled backup, a deliberately failed isolated job/missing-success alert, and a restore into a new isolated database/media directory. **Production backups remain disabled and not operational until this succeeds.**
4. Check real Free-plan request/CPU/D1 headroom and the application's 300-retained-order/2,000-operation limits. Agree on monitoring and a storage expansion plan. A Workers Paid upgrade alone does not remove application caps; any paid-plan change needs approval.
5. Complete hosted and physical iPhone/MacBook acceptance: photo-library/HEIC uploads, secure owner recovery, pickup deadlines, same-phone external payment handoff/return, private order messaging and interrupted-network recovery. Use preview/disposable test data; keep production ordering paused and genuine records untouched. Do not send money without separate authorization.

### Final approval

After separately approved preparation work and the preceding evidence are reviewed, give **final explicit approval** for the production website rollout, official-domain changes and enabling real checkout. Preparation approval does not imply launch approval. Follow [the exact domain checklist](GODADDY-CLOUDFLARE-CHECKLIST.md), recheck existing DNS/route purpose before replacing any parking records, verify certificates/HTTPS and protected `/studio` on both hostnames, and preserve the original Register/Admin access. The Active Cloudflare zone already exists; a nameserver change must not be repeated blindly. No merge, launch or domain approval is requested or assumed by this report.

Danielle's normal business work remains in Website Studio. Infrastructure activation, ongoing backup monitoring, security maintenance and recovery are operator responsibilities; they are not added to the customer/Studio navigation.
