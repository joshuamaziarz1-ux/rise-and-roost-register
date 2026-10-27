# Isolated beta deployment

Updated October 27, 2026 at 4:29 p.m. EDT (America/New_York).

| Item | Verified state |
| --- | --- |
| Website | https://rise-roost-beta.joshua-maziarz1.workers.dev/ |
| Website Studio | https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae |
| Worker | `rise-roost-beta` only |
| Database | Existing `rise-roost-beta-db`, UUID `7824ffe0-d69a-4221-9aec-0f335257477a`; exact `DB` binding verified through Cloudflare API |
| Other binding | Static website assets (`ASSETS`), non-secret `PUBLIC_WORKSPACE_ID`, and `ORDER_EMAIL_ENABLED="false"`; no email, Square, Supabase, or Cloudflare credentials bound to the Worker |
| Deployment | `6ab2c002-f1b3-4c66-a719-96f14bf15b60` |
| Active version | `bb9a5c9f-dc36-45df-b53b-2db8bb2b732b`, 100% traffic |
| Application source | `12e0bd9d1dab61adc47a6dbcda3ea1c7a84d50e0`; subsequent changes are documentation |
| workers.dev | Enabled; version previews disabled; no custom domain |
| Authentication | Account API token verified active; credentials never recorded here |
| Data preservation | No schema/reset/import on redeployment. The original saved workspace is checked against a private SHA-256 fingerprint of its draft, published content, history, order ledger, and revision fields. |
| Production | Register/Admin files match original main; no live Supabase, Square, DNS, custom-domain, or main-branch changes |

See [customer tracking and notification setup](ORDER-TRACKING.md) for the new ordering release and screenshots, and [the synchronization correction report](PUBLISHING-SYNC.md) for the earlier publishing fix.

## Deployment with the narrow token

Wrangler successfully uploaded the website and activated this version, then exited nonzero because its final account-wide workers.dev hostname lookup was denied. The actual deployment and 100% traffic were independently confirmed through the specific beta Worker's deployment API. Its only database binding remains the existing isolated D1 database; no database was recreated or migrated.

The main beta now reads the existing owner workspace selected by `PUBLIC_WORKSPACE_ID`; other demo publications cannot change that mapping. Root and explicit demo reads returned the same published revision 9 after deployment. No stored workspace content was changed to connect the root. The owner supplied the public workers.dev URL, so no account-wide permission expansion is required. The environment's exact beta hostname addition and updated startup instructions were saved as a configuration draft. The beta hostname is allowed in the current coding environment; direct HTTPS verification and GitHub Actions acceptance work without exposing Cloudflare credentials. No DNS permission is needed.

The initial October 26 deployment was `ac8eb5e0-6201-4146-bbcb-7bcdc7dc3d34`, version `69e892e8-d827-4f7e-a46b-0622ee404689`. It created and initialized only the new beta D1 database. Current stabilization redeployments retained that database and all original saved workspace content.


## Customer order tracking release

The order-tracking source was deployed to the beta Worker only. Static asset hashes match the tested source. HTTPS website/Studio routes, anonymous Studio denial, tracking noindex headers, browser/CDN API no-store, and root/demo publication equality were verified directly. The existing database and all 86 pre-existing saved workspaces retained their fingerprints; acceptance tests use new synthetic records. No D1 schema command, reset, or migration ran.

Payment reporting never verifies payment. Danielle records verification against independent records in Studio; the system then creates a beta paid receipt without charging or contacting Square. Preparation and pickup remain separate explicit actions. Email sending remains disabled pending a beta-only Resend sending key and verified sender.

Wrangler's final account-wide hostname lookup again returned a permission error after the successful upload. The new active version and 100% traffic were independently verified via the specific beta Worker API, as were the live asset hashes. The beta-only five-minute retry schedule was then applied through that Worker's schedules API and verified. No broader account or DNS access was required; while email is off, the scheduled handler performs no D1 or provider requests.


[Source CI 40578755961](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40578755961) completed successfully: 41 backend tests, 40 browser cases, two-session HTTPS root synchronization, Worker/API acceptance, and all five hosted order-tracking flows. Hosted tests used fresh synthetic workspaces and left all 86 original workspace fingerprints intact.
