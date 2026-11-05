# Phase 3 production deployment results

November 5, 2026 (America/New_York).

**Result: Phase 3 was staged and activated, then safely rolled back after production-data compatibility verification failed. Production is healthy on Phase 2. Do not reactivate the unchanged Phase 3 candidate.**

## Exact release and final production state

| Item | Value |
| --- | --- |
| Reviewed application source | `548b7deb2712cd8163830ca96ab57684ae7d5a65` |
| Phase 3 candidate/version | `a8aab028-139b-4040-b187-353dff8fa4f0` |
| Phase 3 activation deployment | `e9fa4760-6b69-4c17-9d71-ac607d86e4d8` (100% before rollback) |
| Final active version | **`5bf5f229-8f34-4935-8699-4c6a6d78d055` (Phase 2, 100%)** |
| Final rollback deployment | **`a58423ef-9e2e-46b5-9649-a864d1f7bf5e`** |
| Worker | `rise-roost-website-production` |
| Production database | Existing `rise-roost-production-db`, ID `889a4b96-cabd-43d1-ad45-79f65b0052b0`, unchanged |
| Checkout / ordering | **Disabled / paused**, unchanged |

The user's supplied production-deployment request explicitly authorized staging, activation, non-destructive verification and safe application rollback. No additional approval was requested. No unrelated features or design changes were made.

## Blocking calendar finding

Read-only verification against the actual preserved published document found a pre-existing Tuesday pickup. At Thursday, November 5, 2026, 6 PM Indiana time, the frozen Phase 3 calendar offers **Tuesday, November 10** before the required next regular pickup, **Wednesday, November 11**.

The cause is in `server/pickup-calendar.mjs`: it starts with every stored pickup, suppresses generated windows for dates already present, and applies the new cutoff to those stored windows. It treats existing nonregular windows as special dates without requiring an explicit special-date designation. The live legacy document therefore does not behave like the empty-calendar synthetic fixtures for the confirmed Thursday-evening example.

Special pickups are an authorized feature, so existing nonregular dates cannot safely be assumed either intentional exceptions or obsolete defaults. The frozen release has no explicit distinction. Silently deleting or changing those business records is outside this authorization, and deploying an unreviewed application change would exceed the specified frozen release. This is the genuine production-data compatibility blocker that stopped the release.

Checkout stayed disabled and ordering paused throughout. No customer pickup options were opened, no test orders/payments were submitted, and no existing order or pickup commitment was changed.

The next release needs an explicit, tested distinction between legacy nonregular windows and intentional special-date exceptions, while preserving stored records and booked commitments. Add regression coverage using a sanitized copy of the legacy calendar shape; verify the Thursday-evening example, genuine special dates and historical/booked windows together. Freeze and review the corrected source before another release. **No database reset, reseed, historical rewrite or schema migration is needed to investigate or correct this application behavior.**

## Artifact and asset verification

- Frozen source and all 26 public asset hashes matched the committed [verification manifest](phase3/automatic-calendar-verification.json).
- A fresh isolated build had identical embedded module contents to the reviewed build. Its local dependency-path labels changed its byte hashes. The exact reviewed Worker and matching source map were used for upload instead of substituting the rebuilt bytes.
- Uploaded Worker SHA-256: `c8271b9ca312c221ab99c6a5db98f0786211657bc2659be61459e62fe0ec68a6` (1,303,474 bytes).
- Uploaded source-map SHA-256: `b19caaad6f3aa36c1284de614e791a40f78ac008a2790980b69a7c7d308ae055`.
- Cloudflare's downloaded stored Worker and source-map parts matched the reviewed bytes.
- Cloudflare's supported `wrangler versions upload` asset workflow uploaded **five new/changed assets**, including `selling.mjs`, and reused **21 unchanged assets** from the complete matching manifest. It created an inactive version before activation. There was no Worker-only upload with old assets.
- Candidate bindings, runtime/compatibility, asset routing, fetch/scheduled handlers and named security handlers matched the retained Phase 2 version. The only expected metadata change was this release's version/deployment annotation.
- Immediately before activation, the active deployment was rechecked at the expected Phase 2 version; Access, configuration and infrastructure drift checks passed.

Cloudflare documents that a [version captures code, static assets, bindings and compatibility settings together](https://developers.cloudflare.com/workers/versions-and-deployments/). Rollback used that supported version/deployment mechanism. It did not assume that an unrelated Worker-only update would restore assets. After rollback, live `app.mjs`, `management.mjs`, `model.mjs` and `customer.css` matched the retained Phase 2 source byte-for-byte, confirming restoration of the changed asset set as well as Worker traffic.

## Seven features and calendar validation

The frozen source contains all seven reviewed features: three selling methods; Fresh at The Roost!; simplified inventory; automatic calendar controls; automatic adjustment audits; Hide/Show Product with retained history; and visible sold-out products. The prior local evidence records 206 backend passes and 163 distinct browser cases verified, plus targeted reruns, schema guards and local Worker/D1 smoke checks.

During this deployment, a fresh focused local run passed **24 calendar, Phase 1 transport and Phase 2 Studio authentication tests**. It covers strict noon boundaries, DST, rollover, capacity, exceptions, historical preservation, signed owner JWT validation and 730-hour session compatibility. These synthetic checks did not cover the newly identified legacy-date classification conflict.

While Phase 3 was active, real Chromium rendered Home, Shop and Basket successfully, found Fresh at The Roost! on Home and Shop, and reported no JavaScript page errors. Those were read-only visits. Authenticated Studio editing, inventory changes, audit writes and production checkout were deliberately not exercised with live data. All seven features are therefore **source/local-regression verified, not signed off as a successfully retained production release**.

The generated regular windows use Wednesday–Friday, at least eight weeks of lookahead and strict local noon two calendar days earlier. The legacy nonregular-window issue prevents unconditional confirmation of the requested next-date behavior against current production data. Ordering pause correctly kept the public pickup selection empty throughout.

## Production data, security and final live checks

Read-only SELECT fingerprints before staging and after rollback compare **identically for the schema and all 12 application tables**, including the complete workspace document/ledger. Every fingerprint query reported zero rows written. No concurrent owner changes were observed. Private row contents, owner configuration and detailed fingerprints are retained outside Git under `/workspace/phase3-deployment-private`; they are excluded from this report and commits.

No migration, initialization, reset, reseed, D1 restore, product/order deletion, inventory/price update, pickup mutation, test order or payment was performed.

Final verification:

| Check | Result |
| --- | --- |
| Home, Shop, Basket, public site API | HTTP 200 |
| Public API checkout enabled | `false` |
| Published ordering paused | `true`; no selectable pickups |
| HSTS on public pages/API | Present |
| HTTP → HTTPS | 308, with path/query retained |
| HTTPS www → canonical host | 308 |
| Anonymous Studio / Studio management API | Cloudflare Access 302 challenge |
| Legacy `/api/manage/snapshot`, `/api/studio` | 404 |
| `/.well-known/security.txt` | 404, retained Phase 1 behavior |
| Both owner identities, Access audience and session duration | Preserved; 730-hour compatibility retained |
| All 16 bindings and their values | Preserved |
| Access application/policies, domains, DNS, Worker routes, TLS, Always Use HTTPS, workers.dev/preview settings | Fresh comparisons unchanged |
| Phase 2 asset hashes after rollback | Four changed existing JS/CSS files match Phase 2 exactly |
| Schema and 12 application-table fingerprints | Identical before/after |

HTTP requests to `www` retain the existing two-step HTTPS-then-canonical redirect behavior. The environment's bare Python user agent received Cloudflare error 1010; ordinary browser-user-agent checks and the actual Chromium visits succeeded. No Cloudflare security setting or authentication control was disabled.

## Remaining work and rollback readiness

Production currently serves the known-good Phase 2 version and its matching assets. The Phase 3 version remains available as a retained candidate but must not be reactivated unchanged. The rollback was executed and verified successfully; no database restore was involved.

Resolve and regression-test the legacy calendar classification before freezing a replacement release. Owner-authenticated Phase 3 Studio checks and physical-device signoff remain outstanding because Phase 3 was rolled back. No owner login code or token is needed or requested for the present report.
