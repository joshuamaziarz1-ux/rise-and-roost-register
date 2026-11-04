# Production database preparation — November 2, 2026

**Latest update:** The owner approved an empty production catalog and confirmed the pickup address. Production now contains one business workspace and one identity marker, with zero products/orders/sales/customer activity. R2 backups are postponed by owner decision. [The current launch report](FAST-PRODUCTION-LAUNCH.md) supersedes older provisioning, initialization and mandatory-R2 launch gates below; earlier test evidence remains historical. Hosted individual owner authentication and explicit launch approvals are still required.

**Prepared, not launched.** The owner-created `rise-roost-production-db` now has its empty application schema. No Worker was deployed, no checkout enabled, no branch merged and no DNS/domain changed. Preview and beta received no writes.

## Verified configuration and schema

| Environment | D1 UUID | Changes during this preparation |
| --- | --- | --- |
| New production | `889a4b96-cabd-43d1-ad45-79f65b0052b0` | Verified exact name/UUID and empty catalog, then installed 12 empty tables and two indexes |
| Experience preview | `21352b95-d7f6-406f-8527-4b8dbcebf1bf` | Read published configuration/settings only; no writes, reset or deployment |
| Original beta | `7824ffe0-d69a-4221-9aec-0f335257477a` | Untouched |

`wrangler.production.toml` binds **only** the new production UUID. It has no routes, custom domains, public workers.dev/preview URL, scheduled trigger, preview PIN or testing bypass. Its base URL is prepared for `https://rise-and-roost.com`. The default deployment command still targets the isolated experience preview. `npm run check:production` is a dry run, not a deployment command.

`production-schema.sql` contains no seed rows, credentials or destructive statements. The tables are `workspaces`, `sessions`, `previews`, `assets`, `limits`, `device_links`, `roost_members`, `roost_credentials`, `roost_sessions`, `roost_challenges`, `customer_comments` and `deployment_identity`. **All 12 table counts were zero after installation.** The `previews` table supports Website Content draft previews; it does not connect to the preview database. Shared testing-PIN tables are excluded. The deployment identity table is empty pending reviewed initialization.

Schema SHA-256: `1354925d169b39908082d1f9380ba23141ac8cd168b26a3cf880094bed49dc5f`.

The fixed-target installer `scripts/prepare-production-schema.py` refuses another database identity, unknown/partial schema or any populated application table. It has no reset, force, seed or database-override option. A default/`--plan` invocation is offline. Installation evidence is private; a sanitized summary is in `docs/prelaunch-audit/production-database-verification.json`.

The production guard remains active. Unit tests and an actual local Worker runtime confirm `/`, `/studio`, order and management routes return 503 before storage/assets access. This is intentionally an incomplete production runtime: individual owner authentication, production route policy and truthful production-order metadata still require implementation/review. Do not remove the guard to expose the website.

## Business initialization: reviewed separately, not applied

The current published source configuration was read without extracting customer/order records, credentials, owner hashes, messages or financial history. The review package contains **three products and four pickup windows**, published design/content, calendar settings and no saved payment destinations. No uploaded `/api/assets` photo was referenced; bundled photos remain versioned release assets. These counts do not establish owner approval of current stock, dates or prices.

The pure `reviewBusinessInitialization()` function creates a private review artifact with a fresh reserved production workspace ID, `orderingPaused: true`, zero orders and fresh empty audit/history inputs. It preserves only allowlisted published configuration and business settings. Referenced uploaded photos, if present in a future review, must belong to the source workspace and get new production IDs with identical bytes. Payment destination URLs require business-use confirmation and are carried disabled, without preview test certificates. Each must be tested anew in production before enabling. No full backup is used as a seed.

No workspace, identity row, stock, payment setting or business record has been inserted in production. Therefore a live Studio $0 dashboard is **not yet available**; all new production tables are empty, and the proposed ledger calculates $0 verified sales.

The source still contains unclassified customer activity. No reliable marker proves all purchases fictional. This blocks application of the initialization package until the owner reviews the private classification list and determines how any genuine business records must be preserved. Source data remains unchanged. Owner review must also approve actual opening inventory/capacity, future pickup dates/business days, prices, images, website copy and commercial payment recipients. Review artifacts remain outside Git; no customer data or payment destinations are published in this PR.

## Additional Cloudflare resources

| Purpose | Needed before launch | Current state |
| --- | --- | --- |
| Product/site media | Production D1 `assets` plus the production Worker's static `ASSETS` binding | Empty assets table exists; static files will accompany an approved future deployment. No extra public R2 bucket or Images subscription is needed for the current implementation. Monitor D1 size/photo limits. |
| Individual owner access | A reviewed identity service and individual Danielle/other-owner accounts, with server validation, recovery, permissions and audit | Not implemented/configured for production. Cloudflare Access with an identity provider is an option; enabling Access alone does not implement app authorization. Keep customer checkout/tracking public and owner APIs protected. Do not transplant the preview PIN or protect the whole public site as a workaround. |
| Independent encrypted backups | A dedicated **private R2 Standard bucket** named `rise-roost-production-backups` | Not verified/created by this task. Existing credential cannot inspect R2 (403). No binding to the customer Worker. |
| Daily backup scheduling | Dedicated private Cron Worker; protected GitHub backup environment/workflow; least-privilege D1 export, R2 S3 and dispatch credentials; encryption/recovery key; independent missing-run monitor | Code prepared and disabled. Actual hosted upload/read-back, recovery, missing-run alerts and scheduled execution remain untested. Requires separate reviewed activation; no merge or activation now. |
| D1 short-term recovery | Time Travel on the exact new database | A current bookmark was retrieved read-only. No restore was run. Documented retention is seven days on Free / 30 on Paid; this is additional protection, not the independent encrypted backup. |

The detailed backup sequence and recovery-key safeguards are in [PRODUCTION-BACKUP-RUNBOOK.md](PRODUCTION-BACKUP-RUNBOOK.md). No secrets should be sent in chat or committed to Git. Subscription/billing and hosted CPU/quota capacity remain unverified; creating a bucket may require enabling R2 billing.

## Next Cloudflare action — do this one step now

In the same Cloudflare account, open **R2 Object Storage → Create bucket**. Name it **`rise-roost-production-backups`**, choose **Standard** storage, and keep it private: no public `r2.dev` access, custom domain or public-access configuration. Do not add lifecycle deletion, Worker bindings or credentials yet. If the bucket already exists, inspect it rather than creating a duplicate.

After the bucket exists, the next guided step is to verify its privacy and prepare restricted backup credentials. Individual owner authentication and the recovery drill follow separately. None of these steps authorizes public launch, domain changes, a merge or real checkout.

## Tests and remaining launch gates

- Passed: **148 backend tests**, including empty-schema/application compatibility, fixed-target installer safeguards, configuration-only review and zero-sales calculations. Seven Python installer cases are included through the backend suite.
- Passed: production bundle dry run against the exact new UUID; actual local production Worker guard smoke test, with zero remote writes.
- Passed: actual remote schema matches the reviewed file; 12 empty tables/two indexes; production Time Travel bookmark retrieval without restore.
- Existing frontend evidence remains 120 browser and eight commerce tests; no website/Studio design was changed here. Current PR CI runs the same regression suites; pending results must not be counted as passed.
- Still required: owner classification/approved initialization, production owner auth and route policy, business payment links and native-device handoff, hosted production isolation/CPU/quotas, hosted backup/recovery/alerts, legal/provider policy review, and explicit launch/merge/domain/checkout approvals.

Original Register/Admin, Supabase, Square, beta, preview records, GoDaddy DNS and official-domain routing were not modified.
