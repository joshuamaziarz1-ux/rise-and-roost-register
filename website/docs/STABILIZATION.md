# Beta stabilization — October 27, 2026

Website: https://rise-roost-beta.joshua-maziarz1.workers.dev/

Danielle’s Website Studio: https://rise-roost-beta.joshua-maziarz1.workers.dev/studio

The existing farmhouse design is retained. The stylesheet, default HTML, approved artwork/logo, D1 schema, and deployment target are unchanged. Only the isolated beta Worker was redeployed. Register/Admin files match stable main byte for byte; no production Supabase, Square, DNS, or custom domain was contacted or changed. Main and PR #3 remain unmerged.

## Results

| Check | Result |
| --- | --- |
| Local backend/security/commerce regression suite | **23 passed**, zero failed/skipped |
| Local browser matrix | **30 passed**, zero failed/skipped |
| GitHub local CI | **Passed** on `7cb44ff`: 23 backend + 30 browser tests, install, and build |
| Hosted Worker/D1 smoke | **Passed** on the final deployed version |
| Hosted API acceptance and response timings | **Passed**, 58 HTTP requests including expected rejection cases, 16 acceptance groups |
| Hosted browser matrix and screenshots | **30 passed** in 3.5 minutes, zero failed/skipped; fresh screenshots captured |
| Wrangler build/dry run | Passed; bindings are `DB` and `ASSETS` only |
| Runtime dependency audit | Zero reported vulnerabilities |
| Existing content preservation | **Passed**: original saved workspace fingerprint matches after all deployments and hosted tests |

The matrix uses desktop Chromium, desktop WebKit (Safari analog), iPhone 13 WebKit, Pixel 7 Chromium, and a landscape tablet viewport. These are automated emulations, not physical-device signoff. Local tests use an in-memory database; hosted tests create independent synthetic workspaces in `rise-roost-beta-db` and never reuse the owner’s saved workspace.

Both GitHub jobs passed in [run 40504092711](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40504092711) on application source `7cb44ff0175f950025c6eb180a1c1515d8f78fc2`. The deployed Worker remained version `39040f75-c99d-4305-a4d8-4a884998dea0` at 100% throughout this successful acceptance run, proving that saving and publishing changed D1 content without redeployment.

The successful hosted run completed October 27 at 8:35 a.m. EDT. Its **58 HTTP requests had a 195 ms median response time** from the GitHub runner. This is an observed small-sample network/API latency measurement, not a load test or physical-device Web Vitals certification. Browser acceptance loaded every public route and checked assets, theme, and overflow in all five profiles.

[Download fresh hosted desktop, mobile, Studio, and edited/published PNG screenshots plus request timings](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40504092711/artifacts/12735170082). The artifact contains eight credential-free PNGs and `qa-results/hosted-api.json`; GitHub retains it for seven days. The existing checked-in screenshots in [QA.md](QA.md) are the earlier local captures, not this hosted evidence. This environment's proxy blocked the GitHub artifact storage hostname, so those hosted images were not downloaded for local visual inspection. Their capture and upload steps passed; inspect them through GitHub. The exact observed storage hostname was added to the environment draft for future direct artifact access.

Reproduce the acceptance checks from `website/`:

```sh
npm test
RR_BETA_BASE_URL=https://rise-roost-beta.joshua-maziarz1.workers.dev npm run test:worker
RR_BETA_BASE_URL=https://rise-roost-beta.joshua-maziarz1.workers.dev node tests/hosted-api.mjs
RR_BETA_BASE_URL=https://rise-roost-beta.joshua-maziarz1.workers.dev npm run test:browser
RR_BETA_BASE_URL=https://rise-roost-beta.joshua-maziarz1.workers.dev npm run screenshots
```

Use the documented WebKit libraries/browser path on the restricted cloud machine, or the matching official Playwright image. The opt-in hosted CI job uses the exact beta origin and no account credentials. Use `[verify-beta]` in the operator commit subject for the full matrix; `[verify-pages]` selects only the five public-page profiles for a narrow public-page regression. Diagnostic failures, canceled runs, and initial jobs that skipped hosted execution are not counted as passing acceptance.

## Fixes verified by regression tests

- **Uploaded images on D1:** Hosted acceptance caught D1 returning BLOBs as number arrays, which `Response` converted into CSV text. The API now converts either D1 arrays or SQLite typed arrays to binary bytes. Existing image records remain intact; the regression checks exact returned bytes. Browser acceptance also verifies uploaded images actually decode.
- **Checkout during publishing:** The atomic reservation now checks the published revision as well as ledger version, preventing an order quoted before a concurrent price publication from being accepted.
- **Invalid pickup dates:** Invalid, nonexistent, and ambiguous dates/times return a useful validation error, preserving the previously saved draft.
- **Save outage recovery:** Non-JSON upstream failures show a readable error while retaining unsaved edits. A retry can save them normally.
- **Publishing on slower connections:** Studio shows a publishing state, prevents duplicate publish clicks, and preserves edits made while the publication request is in flight. A delayed-response browser regression confirms newer edits stay in the draft while the prior saved version is published. Tests wait for the exact success notice rather than matching the earlier draft-save wording.
- **Keyboard navigation:** The Skip to content link now targets a focusable main region on product, cart, and other public routes as well as the homepage.
- **Product categories:** Added an optional category field to the existing Products form and existing storefront labels. Legacy products without categories remain valid; no saved content migration is needed.
- **Availability:** Zero stock or zero per-pickup capacity displays Sold Out with a disabled purchase control. Public stock and pickup availability now reflect reserved demo orders, update independently of content publishing, and reopen after cancellation. Public responses include aggregates rather than order details; configured owner stock stays unchanged.
- **Root checkout and owner sessions:** Anonymous storefront simulations no longer replace Danielle’s Studio cookie or disclose a new owner key. Moving a basket into its isolated checkout demo preserves it through a failed request/reload and clears its originating root basket after success.
- **Hosted test runner:** Corrected container Git ownership handling so explicit hosted acceptance actually runs. Earlier green jobs that skipped hosted steps are not counted as hosted acceptance. Remote traces are disabled to avoid retaining private access keys; uploaded artifacts contain only screenshots and non-secret timing results.

## Coverage

Public routes/assets, farmhouse typography/colors, responsive overflow, cart empty states, product names/descriptions/categories/prices, JPG/PNG/WebP upload/re-encoding and crop, unsupported upload errors, product visibility and in-store restrictions, Sold Out, draft persistence after reload and another browser sign-in, frozen read-only previews, publishing and separate-browser updates without deployment, revision restore, undo/redo, safe custom CSS and literal XSS text.

Commerce/security coverage includes pickup dates and Indianapolis timezone/DST, exact deadline boundaries, closed/full pickups, integer-cent totals, authoritative prices, stale revisions, invalid quantities, concurrent reservations, idempotent retries, cancellation/fulfillment transitions, unpaid status, Secure/HttpOnly/SameSite cookies, CSRF, all anonymous administrative writes, cross-workspace image/order restrictions, session expiration/logout, validation errors, and save-error recovery.

## Square configuration

The beta has **no Square connection**: no Square SDK, credential binding, checkout/payment endpoint, or outgoing Square request. Its only Cloudflare bindings are the isolated D1 database and static assets. All requests are explicitly simulated and `paymentStatus=not_collected`; attempts to mark a request paid are rejected. Existing Square account/settings were not accessed or changed. Real or sandbox payment execution remains the separately approved Issue #6 work.

## Danielle’s access and publishing

Studio onboarding is public so independent testers can create their own isolated throwaway demo. Existing workspaces require their private key; creating another demo does not grant access to your drafts, orders, or publishing controls. This is demo authentication, not a production staff-account system.

If you already saved a workspace, choose **Return to an existing workspace** and enter its saved ID/private key. Use the same credentials on MacBook/iMac; do not create a replacement merely to sign in on another device. For a fresh independent demo, choose **Create my private demo**, save the one-time access details privately, then **I saved my access key**. No shared/default password is used.

**Save draft** persists work privately. **Preview link** shares a read-only draft. **Publish demo** updates that workspace’s **View published demo** URL under `/demo/<workspace-id>`; visitors receive changes within five seconds without another Worker deployment. The root website remains the shared farmhouse starter. Share the published demo URL, never the private access key. Normal editing needs no GitHub, code, or installation.

## Physical/manual acceptance still needed

- Danielle’s actual MacBook/iMac Safari and Chrome: sign in with the same saved workspace, upload owned photos from Finder, edit, preview, publish, and restore.
- Actual iPhone, Android, and tablet: touch controls, orientation changes, onscreen keyboard, photo selection, private browsing/storage restrictions, and real mobile-network behavior. Automation verifies engine/viewport behavior only.
- Owner-owned product photography, real copy/prices/categories, pickup dates/deadlines, business address/hours, and policies need owner review before any commercial launch. Existing sample illustrations/disclaimers remain clearly labeled.
- Account recovery/MFA, real customer data, production launch, custom-domain connection, and payment/webhook acceptance remain outside this isolated demo. No production readiness or real-payment claim is made.

The exact beta hostname and updated cloud startup instructions are saved in the environment draft. Reviewing/saving and publishing that environment permits direct requests from future cloud sessions; the GitHub hosted tests do not require a broader Cloudflare token.
