# Studio Help Guide — production release

Deployed November 5, 2026 to the existing Rise & Roost website.

| Item | Result |
| --- | --- |
| Development branch | `feature/studio-help-guide` |
| Tested application source commit | `70ee699891693d873bbb4d87104de3ab0b5905a2` |
| Worker | `rise-roost-website-production` |
| Active version | `acd326e8-79bb-4893-a703-90f5df273aaa` |
| Deployment | `766c7e76-618e-4445-8fbb-2919a72bd723` |
| Traffic | 100% |
| Retained rollback version | `b18c3d75-f84d-4d8c-aad1-be5704c61552` |
| Production database | Existing `rise-roost-production-db`, preserved |

## Delivered

Open https://rise-and-roost.com/studio and choose **Settings → Studio Help Guide**. The guide includes real title/body/step search, expandable categories, FAQs, How Do I…?, literal warning explanations, payment/ordering distinctions and documentation of every existing Studio section. It uses the existing visual style with scoped help CSS. No guide entry was added to Home, other pages or main navigation.

Application changes: `public/help-content.mjs`, `public/help.mjs`, `public/management.mjs`, `public/management.css`. Verification changes: `tests/help.test.mjs`, `tests/browser/help.spec.mjs`, `playwright.help.config.mjs`. Maintenance instructions: `docs/STUDIO-HELP-GUIDE.md`. This report is the only additional file after the tested application commit.

## Tests

| Check | Result |
| --- | --- |
| Final backend/security suite | 212 passed, zero failures/skips |
| Production schema guards | 7 passed |
| Final Help Guide matrix | 10 passed across desktop Chromium/WebKit, iPhone WebKit, Android Chromium and tablet Chromium |
| Phase 3 browser matrix | 25 passed |
| Production browser regressions | All 10 unique cases verified: nine passed in the complete run; the single iPhone payment-choice assertion passed on a focused fresh rerun without application changes |
| Commerce browser regressions | 8 passed |
| Production dry builds, including exact-Worker version dry-run | Passed |
| Live public/security probes | 9 passed |
| Live Chromium customer rendering | Home, Shop and Basket rendered; zero JavaScript page errors |

The final help matrix checks Settings-only entry/return, every requested search term, empty results/clear, keyboard category expansion, focus, mobile widths, unchanged business records and signed production-owner sessions older than one day with checkout closed. Actual screenshot review covers desktop and iPhone. Earlier fixture/environment failures and their resolutions are disclosed in the maintenance report.

## Deployment and preservation evidence

The prior active Worker matched approved Phase 3 source `143b719`; newer base commits only recorded deployment/preflight results. Remote branches were freshly fetched before release and no newer website source appeared. The original worktree and unrelated development branches were retained.

This release reused the **exact active Worker executable and source map**. Downloaded post-release executable SHA-256 remains `c07ccc2c07f034f8ae363e43e5835de28eea8d1e34a5255db155b5e31d783911`. All server, customer application, authentication, schema and deployment configuration source files remain unchanged.

Wrangler staged an inactive version and its matching assets through the supported versions workflow: **4 changed/new assets uploaded, 24 content-addressed assets reused**. All 28 committed public files matched the source manifest. Candidate inspection verified identical executable etag, all 16 binding values, runtime/compatibility, asset routing, fetch/scheduled handlers and security handlers before activation. Immediately before activation, the existing deployment and all database fingerprints still matched the baseline. Staging changed only the expected release message/tag annotations, which were explicitly inspected; no configuration drift was accepted.

After activation:

- All **24 anonymously retrievable public files** matched the committed bytes, including `help.mjs`, `help-content.mjs`, `management.mjs` and scoped CSS. Access-protected Studio files remain protected; the complete staged manifest included them unchanged.
- Home, Shop, Basket and `/api/site`: 200. Public security headers are present. Chromium rendered all three customer pages without page errors. Browser verification used a temporary environment-proxy certificate pin for that browser process; no persistent trust-store change was made.
- `/studio` and `/studio/api/manage/snapshot`: 302 to the existing Cloudflare Access sign-in. Unprotected legacy `/api/manage/snapshot` and `/api/studio`: 404. `/.well-known/security.txt` retains its 404.
- `checkoutEnabled=false` and `orderingPaused=true` remain unchanged. Payment configurations, owner identities, Access audience and every runtime binding are preserved.
- Read-only fingerprints of the schema and **all 12 application tables** are identical before staging, immediately before activation and after release. Every D1 fingerprint query reported zero rows written and no database change.
- No migrations, initialization, reseeding, deletion, resets, database restores, production test orders/payments, payment-destination edits, activation-state edits, Access-policy changes, DNS changes or route changes occurred.

Private API metadata and row/fingerprint evidence remain outside Git in `/workspace/help-private`; no private payment, owner-account or customer values appear in the guide or committed report.

## Limits and rollback

No unresolved automated failures or production verification failures remain. The guide is verified through exact live asset bytes and local owner-authenticated browser tests; no real owner session was used for a signed-in live visual review. Browser device profiles are emulations, not physical-device signoff. These checks made no live business edits.

Rollback was unnecessary. If needed later, first check for concurrent changes, then switch traffic to retained version `b18c3d75-f84d-4d8c-aad1-be5704c61552` with its matching versioned assets. Preserve D1 and its current business records; never reset or restore the database for an application rollback.
