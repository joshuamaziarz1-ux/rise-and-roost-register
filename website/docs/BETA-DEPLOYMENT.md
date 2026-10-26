# Isolated beta deployment

Activated October 26, 2026 at 4:47 p.m. EDT (America/New_York).

| Item | Verified state |
| --- | --- |
| Worker | `rise-roost-beta` only |
| Database | Newly created `rise-roost-beta-db`; exact `DB` binding verified through Cloudflare API |
| Other binding | Static website assets (`ASSETS`) only; no Cloudflare credentials in the Worker |
| Deployment | `ac8eb5e0-6201-4146-bbcb-7bcdc7dc3d34` |
| Active version | `69e892e8-d827-4f7e-a46b-0622ee404689`, 100% traffic, source `wrangler` |
| workers.dev | Enabled on this Worker; version previews disabled |
| Application source | `b776958272daecd8c2d474f217fb17787a70ca58`; public design/source unchanged |
| Authentication | Account API token verified active; credentials not recorded here |
| Production | Register/Admin files match original main; no live Supabase, Square, DNS, custom-domain, or main-branch changes |

The new database initially contained only Cloudflare's internal table. Its demo-only `workspaces`, `sessions`, `previews`, `assets`, and `limits` tables were initialized using the supported D1 query API. Wrangler's file-import path failed during upload processing; no production database was involved. Direct schema initialization and subsequent binding checks succeeded.

Wrangler uploaded the website and activated the version successfully, then exited nonzero because its final account-wide workers.dev hostname lookup was denied. The actual deployment and 100% traffic were independently confirmed through the specific beta Worker's deployment API. Its only database binding is the new isolated D1 database.

## Remaining HTTPS acceptance

The account-level `GET /accounts/{account_id}/workers/subdomain` endpoint requires **Workers Scripts Read** (or Write), which the current narrower token does not provide. Additional account-wide write permissions are unnecessary. Supplying the existing public workers.dev URL from the beta Worker's Dashboard **Visit** link avoids changing token scope.

The public hostname has been requested. Until it is supplied, the externally reachable HTTPS website and `/studio` cannot be opened or verified, and no URL is invented here. The configured network allowlist will also need the exact public beta hostname for remote testing if it is not already reachable.

Fresh automated checks passed: 17 backend tests and all 25 desktop/mobile Chromium and WebKit browser tests (42 total). These exercised the local application, not the unavailable public hostname. Hosted smoke, owner login/edit/draft/preview/publish/restore, and screenshots must run against the actual URL before claiming hosted readiness.
