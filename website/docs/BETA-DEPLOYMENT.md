# Isolated beta deployment

Updated October 27, 2026 at 9:35 a.m. EDT (America/New_York).

| Item | Verified state |
| --- | --- |
| Website | https://rise-roost-beta.joshua-maziarz1.workers.dev/ |
| Website Studio | https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae |
| Worker | `rise-roost-beta` only |
| Database | Existing `rise-roost-beta-db`, UUID `7824ffe0-d69a-4221-9aec-0f335257477a`; exact `DB` binding verified through Cloudflare API |
| Other binding | Static website assets (`ASSETS`) and non-secret `PUBLIC_WORKSPACE_ID` routing identifier; no Square, Supabase, or Cloudflare credentials bound to the Worker |
| Deployment | `9f813872-b1d8-4ae9-8366-6ad05cf4b5b1` |
| Active version | `2dc22f14-5cb9-4deb-b3d6-2d77e0b5bd43`, 100% traffic |
| Application source | `f5bbdb275e6f36e0f45be2408ed6676e131d85c7`; subsequent changes are tests/documentation |
| workers.dev | Enabled; version previews disabled; no custom domain |
| Authentication | Account API token verified active; credentials never recorded here |
| Data preservation | No schema/reset/import on redeployment. The original saved workspace is checked against a private SHA-256 fingerprint of its draft, published content, history, order ledger, and revision fields. |
| Production | Register/Admin files match original main; no live Supabase, Square, DNS, custom-domain, or main-branch changes |

See [the synchronization correction report](PUBLISHING-SYNC.md) for hosted test evidence and screenshots.

## Deployment with the narrow token

Wrangler successfully uploaded the website and activated this version, then exited nonzero because its final account-wide workers.dev hostname lookup was denied. The actual deployment and 100% traffic were independently confirmed through the specific beta Worker's deployment API. Its only database binding remains the existing isolated D1 database; no database was recreated or migrated.

The main beta now reads the existing owner workspace selected by `PUBLIC_WORKSPACE_ID`; other demo publications cannot change that mapping. Root and explicit demo reads returned the same published revision 8 after deployment. No stored workspace content was changed to connect the root. The owner supplied the public workers.dev URL, so no account-wide permission expansion is required. The environment's exact beta hostname addition and updated startup instructions were saved as a configuration draft. Direct requests from this cloud instance require that draft to be reviewed/saved and published; GitHub Actions can perform public HTTPS acceptance without Cloudflare credentials. No DNS permission is needed.

The initial October 26 deployment was `ac8eb5e0-6201-4146-bbcb-7bcdc7dc3d34`, version `69e892e8-d827-4f7e-a46b-0622ee404689`. It created and initialized only the new beta D1 database. Current stabilization redeployments retained that database and all original saved workspace content.
