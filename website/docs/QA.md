# Website beta verification — October 26, 2026

This report covers the new `website/` project on `codex/issue-7-website-studio`. It does not reuse PR #3’s historical test count. Main remains `ab27be06d0ad7a999d4ca122ed30373c69b04435`; PR #3 remains open/draft and unmerged at `c3b28a369aa90c2f03895a9cf315f4e0f410cbb5`.

## Completed results

| Check | Result |
| --- | --- |
| Frozen dependency install: `npm ci` | Passed |
| `npm test` | **17 passed**, 0 failed, 0 skipped |
| `npm run test:browser -- --project=desktop-chromium --project=android-chromium --project=tablet-chromium` | **15 passed**, 0 failed |
| `npm run test:browser -- --project=desktop-webkit --project=iphone-webkit` | **10 passed**, 0 failed |
| `npm run test:worker` against actual local Cloudflare Worker/D1 | Passed: assets, CSP, owner session, draft/save/publish, separate public read, anonymous denial |
| `npm run check` / Wrangler deploy dry run | Passed |
| Runtime dependency audit (`npm audit --omit=dev`) | Zero reported vulnerabilities |
| `npm run screenshots` against local development server | Passed: default desktop/mobile, fully loaded Studio, edited preview, matching published desktop/mobile; credentials excluded |
| Production preservation | Existing index, Register/Admin HTML, core, stylesheet, and cloud adapter matched stable main byte for byte; all changed paths are new website/CI files |

Total: **42 automated tests passed**, plus the Worker runtime smoke, build, install, audit, and screenshot checks. There are no intentionally disabled or expected-failure assertions in these suites. These are local results. GitHub CI and hosted HTTPS acceptance are distinct and must be reported separately.

The five browser workflows, repeated across all five projects, verify public routes/assets/overflow/theme rendering; first-run owner onboarding and cross-context sign-in; draft vs published separation; read-only previews; explicit publish and separate-browser propagation; version restoration and reload; product text, price, raster upload and crop, pickup deadline, cart math and simulated receipt; page/section creation/duplication/hiding, undo/redo, advanced font/color/CSS, XSS safety; and anonymous denial/logout. Backend coverage includes cutoff boundaries, summer/winter and invalid/ambiguous DST, authoritative prices, stock and per-pickup capacity, simultaneous reservations, duplicate request IDs, stale revisions, cancellation transitions, CSRF, session expiry, image MIME/size checks, and cross-workspace asset rejection.

## Fixes found during development

- Corrected local server root routing and CSS custom-property application; added font/background assertions so the farmhouse theme cannot silently fall back.
- Preserved form-object identity across autosaves, preventing later edits from targeting stale objects.
- Prevented a late default-document fetch from overwriting an editor’s in-frame preview. Checkout is disabled in editing and saved-preview contexts.
- Added explicit form-control labels and waited for completed workspace creation before reading test credentials.
- Rejected opaque/raw CSS values that could conceal nested resource URLs, and kept the immutable beta notice outside editable CSS scope.
- Prevented canceled or completed requests from reopening and reclaiming capacity incorrectly.
- Used one browser worker and a proportional end-to-end timeout for the multi-device workflow. Early timeout/initialization failures were investigated and affected flows rerun; the results above are the completed passing runs.

## Safari-compatible runtime preparation

This restricted machine provides Chromium but not WebKit’s system libraries. The official Playwright WebKit 26.0/build 2215 bundle was downloaded with normal TLS verification. Debian packages were fetched using APT’s signed Debian 13 repository metadata/checksums, extracted outside the checkout under `/workspace/rise-roost-system`, and verified with the native dynamic loader. No package checksum or TLS check was disabled.

The upstream bundled MiniBrowser wrapper replaces `LD_LIBRARY_PATH`; the optional `RR_WEBKIT_LIBRARY_ROOT` launch configuration therefore uses the same original bundled executable and supplies its documented runtime paths directly. The successful WebKit matrix used:

```sh
RR_WEBKIT_LIBRARY_ROOT=/workspace/rise-roost-system/libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/workspace/rise-roost-browsers \
npm run test:browser -- --project=desktop-webkit --project=iphone-webkit
```

No host-check bypass is needed for this supported custom-executable configuration. Standard developer installations use `npx playwright install --with-deps chromium webkit` and the ordinary bundled launcher. CI uses the matching official `mcr.microsoft.com/playwright:v1.56.1-noble` image with browser/system dependencies already installed, Ubuntu 24.04, and Node 24 actions. This avoids a moving host distribution and repeated browser/OS installation. The initial GitHub runs stopped during browser dependency installation; they did not execute application tests. Final GitHub status is tracked on PR #8 separately from the passing local results.

## Screenshots and remaining acceptance

[Desktop default](screenshots/desktop-storefront.png), [mobile default](screenshots/mobile-storefront.png), [iPhone WebKit default](screenshots/iphone-webkit-default.png), [Studio onboarding](screenshots/desktop-studio.png), [Simple Edit](screenshots/studio-simple-edit.png), [customized published desktop](screenshots/customized-published.png), and [customized mobile](screenshots/mobile-customized.png).

These show locally served content, not a deployed HTTPS hostname. No physical MacBook, iMac, iPhone, Android, or Windows acceptance is claimed. All product imagery is explicitly marked sample illustration or synthetic upload; the approved logo is reused.

**HTTPS acceptance remains blocked by Cloudflare authentication.** Wrangler `whoami` reports no authenticated account; `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are absent from this runtime. The environment draft records these secure connection requirements. After connection, create a new isolated Worker/D1 project, deploy, record the actual URL/commit, and rerun the smoke/browser/screenshot commands with `RR_BETA_BASE_URL`. The scripts reject remote production/custom-domain targets. No production Supabase, Square, DNS, Register, or PR #3 deployment was performed.
