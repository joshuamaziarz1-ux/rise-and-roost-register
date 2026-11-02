# Rise & Roost final pre-launch audit — November 2, 2026

**BLOCKED: not ready for public launch.** This audit does not approve launch. No merge, official-domain deployment, DNS/nameserver/custom-route change, production provisioning, existing data deletion/reset, real checkout activation or protected-system change was performed. Code is isolated on `codex/final-prelaunch-audit`; the approved design is preserved.

[Machine-readable verification](prelaunch-audit/verification.json) accompanies this report. The private record-classification assessment is intentionally excluded from Git and public PR artifacts.

## Status

| Area | Status | Evidence / remaining action |
| --- | --- | --- |
| Existing website persistence | PASS for preview architecture and local tests | Business data resides in persistent D1, not browser-only storage. Device synchronization, reload/reconnection and failed-save recovery are exercised. Existing deployed records match protected baseline checks. |
| Preview vs original beta | PASS | Different Worker bindings and D1 UUIDs, listed below. |
| Production database and uploaded-file separation | BLOCKED | No dedicated production website database/Worker exists in the configured account. Production isolation cannot be claimed before provisioning and testing actual bindings. |
| Clean production / zero test sales | BLOCKED | Existing source activity lacks reliable test/real classification. The private owner review remains unresolved. No records were deleted, reclassified or copied. No $0 production dashboard is claimed because no production candidate exists. |
| Owner production authentication | BLOCKED | Current access is the temporary shared preview PIN. Runtime guards refuse public production use pending individual owner accounts and review. No production identity/recovery service is configured. |
| Customer/owner authorization | PASS in preview/local tests | Private tracking bearer, workspace isolation, owner-only actions, same-origin writes, session expiry/revocation and throttling are tested. This does not certify future production auth. |
| D1 Time Travel | PASS for actual preview DB; NEEDS ACTION for production | Actual bookmark retrieved from modern D1. No in-place restore performed. Production does not exist yet. |
| Daily production backups | BLOCKED / not operational | Encrypted job, private daily dispatcher, conditional writes, read-back verification, recovery CLI and tests are prepared. Production DB, R2 permissions/secrets, monitor, deployment and successful scheduled run remain missing. |
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
| Production customer website | **Not provisioned** | **None** |

Cloudflare reports the preview database engine `version: production`; that denotes modern D1 storage/Time Travel support, **not** a production customer website. Its actual schema has 14 application tables. Uploaded files currently live in that same preview database. A new production database must carry its own media blobs, workspace identity, auth and independent Worker binding; no live image URL may point back to preview storage. The production backup bucket must also be separate/private and absent from website bindings.

The configured credential could inspect website bindings, database metadata and Time Travel. R2 inventory and account subscription inspection returned **403**. Actual bucket policy/billing status is therefore unverified; do not interpret that as an empty bucket or confirmed subscription. Free-plan limits below refer to the intended plan stated by the owner.

**Domain state differs from the earlier project notes:** Cloudflare now reports `rise-and-roost.com` as an **Active** zone and assigns `faye.ns.cloudflare.com` / `uriah.ns.cloudflare.com`. The account has **no Worker Custom Domain mappings**. DNS-record, existing Worker-route and SSL inspection returned **403**, so actual parking records, authoritative delegation, any route-based mapping and served certificates remain unverified. An active zone is not a launched production website. No nameserver/DNS/route/SSL change was made. The domain checklist now starts from this observed state rather than assuming delegation is still undone.

## Clean-data gate

The private inspection identifies unclassified orders/payment history and a message in the main preview. No explicit trusted test/real marker distinguishes them. The current quote function assigns `simulated: true` to every new order, including commerce orders; that blanket legacy default cannot prove that no external funds were received. Preview location, names, timestamps or generic “Demo request” wording are also insufficient. A reviewed production mode must assign truthful environment metadata for new orders while preserving historical records. The exact owner-review references remain outside Git in the private assessment; customer details, private tracking capabilities and financial totals are excluded from this public report.

Before a clean candidate is populated, the owner must classify that activity and specify treatment of genuine records. Use an approved **configuration-only allowlist**, never a full disaster-recovery archive: published products/prices/descriptions, approved inventory/capacity, referenced image bytes, pickup/business settings, website copy and approved business destination URLs. Use a fresh production workspace, initial content revision and individual owner access; do not carry preview sessions, PINs, test customers/orders/payments/messages, operation history or verified-sale aggregates. Do not infer physical opening stock from test reservations. Confirm the actual stock counts, future pickup windows/business days and valid payment destinations.

Keep production ordering paused during preparation and payment destinations unavailable until Danielle confirms their recipient/business use in the production candidate and explicit checkout/launch approval is given. Retain all original preview workspaces, data and test activity for future testing. Genuine records cannot be silently discarded to obtain a $0 dashboard. No cleanup or production migration has run.

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

Fresh dependency scans reported zero runtime advisories and six high-severity entries in the existing Wrangler development tree. This audit does not silently upgrade the release toolchain; validate a tooling upgrade before production. A limited static scan found no matching private-key/live-token credential patterns in the current website source/workflows; this is not a complete secret-management audit. No provider account credentials are hard-coded. Backups contain private customer/auth data and must remain encrypted, private and excluded from public PR artifacts/logs.

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

## Public-launch handoff

1. Resolve the private data-classification review and approve the exact starting catalog, physical stock, pickup calendar and payment destinations.
2. Prepare a new production database/media store and secure individual owner accounts; prove actual environment separation, empty test history, correct treatment of genuine records, and expected opening sales.
3. Activate and validate encrypted daily backups, read-back, monitored scheduling and isolated recovery, then resolve capacity/tooling/legal prerequisites.
4. Complete hosted and physical iPhone/MacBook acceptance with payable checkout paused until approved.
5. Obtain explicit public-launch/DNS approval, then follow [the exact domain checklist](GODADDY-CLOUDFLARE-CHECKLIST.md). Verify certificates, HTTPS, protected `/studio`, both hostnames and private tracking. No domain action is authorized by this report.

Danielle's normal business work remains in Website Studio. Infrastructure activation, security setup, backup administration and recovery are operator responsibilities; they are not added to the customer/Studio navigation.
