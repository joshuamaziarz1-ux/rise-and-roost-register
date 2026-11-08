# Roost settings and checkout review — undeployed

## Current result

The live website inspected on November 8, 2026 already contained the dedicated `/roost/settings` route, bottom Account Settings link, single dashboard credit balance, disabled deletion control, and automatic authenticated checkout prefill with edit protection. Those changes were absent from the latest repository branch. This review branch recovers the exact public `app.mjs`, `customer.mjs` and root HTML to avoid undoing that live behavior. It does not deploy anything.

The additional frontend change displays the actual saved name, pickup email and phone in Pickup Details. Empty saved fields are labeled “Not saved” on Settings and remain empty in checkout. Existing profile saves, verified email, password/security controls, sign-out, guest checkout, payment/order creation and pickup scheduling code are retained.

The personalized heading, time-dependent greeting and upper dashboard are checked against hashes of the captured live source. Checkout code in `app.mjs` and the `style.css`/`customer.css` styles remain identical to their live baseline. The only app/root HTML changes after recovery are the module cache-version references for this review build. No server, schema, migration, Cloudflare configuration, Studio, catalog, inventory, payment, Resend or customer-record changes are included.

## Deletion and autofill

Autofill uses the existing authenticated `/api/roost/me` response. Settings uses the existing `/api/roost/profile` endpoint. No new backend/database work is required for autofill.

Secure self-deletion does not exist in the inspected membership server or the downloaded active executable's Roost routes. The option stays disabled. See [separate backend plan](ACCOUNT-DELETION-PLAN.md). No destructive implementation is included or authorized by this frontend review.

## Exact files

Relative to the recovered live frontend baseline:

- `website/public/customer.mjs` — show saved pickup contacts on the dedicated settings page.
- `website/public/app.mjs`, `website/public/index.html` — update only the module cache-version references after live baseline recovery.
- `website/tests/account-settings-navigation.mjs` — shared settings navigation for regression tests.
- `website/tests/account-settings-preservation.test.mjs` — enforce preservation of the captured live greeting, upper dashboard, checkout source and styles.
- `website/tests/browser/account-settings.spec.mjs` — settings/profile saves, order preservation, private prefill, editable order contacts, late profile loading, guest behavior, account switching and all greeting periods.
- `website/tests/browser/customer.spec.mjs`, `contact-login.spec.mjs`, `email-login.spec.mjs`, `password-login.spec.mjs`, `return-credits.spec.mjs`, `roost-login.spec.mjs` — retain existing assertions while navigating to the new settings destination; align verification assertions with the current live confirmation screen and scope verified email to the security section.
- `website/playwright.account-settings.config.mjs` — focused five-profile settings/checkout browser suite.
- `website/docs/roost-account-settings/README.md`, `ACCOUNT-DELETION-PLAN.md`, `live-baseline.json` — review instructions, backend approval plan and preservation fingerprints.
- Evidence screenshots and test receipts in this directory are generated from isolated synthetic local records.

The baseline recovery additionally changes `website/public/app.mjs` and `website/public/index.html` to the currently served versions. It also captures already-live customer module changes. These are preserved existing behavior, including already-live registration/verification screens; they are not new authentication changes made in this task.

## Screenshots and validation

Evidence and exact final results are recorded in `test-results.json` after completion. The minimal patch against the captured live frontend is `frontend-review.patch`. Automated browser profiles cover desktop Chromium, desktop WebKit, iPhone WebKit emulation, Android Chromium and landscape tablet. All writes, registrations, mock email delivery, orders and payments used disposable local fixtures. Screenshots show synthetic customer data and the local review banner. This does not claim physical iPhone Safari testing or a live mailbox/payment test.

| View | Desktop | iPhone WebKit |
| --- | --- | --- |
| Dashboard | [Screenshot](screenshots/dashboard-desktop-chromium.png) | [Screenshot](screenshots/dashboard-iphone-webkit.png) |
| Settings | [Screenshot](screenshots/settings-desktop-chromium.png) | [Screenshot](screenshots/settings-iphone-webkit.png) |
| Editable checkout | [Screenshot](screenshots/checkout-desktop-chromium.png) | [Screenshot](screenshots/checkout-iphone-webkit.png) |

## Deployment hold and rollback

Nothing has been deployed and no production database changes have been made. Do not deploy the old kiosk or use a general `wrangler deploy` from this checkout: the production runtime and its current flags/bindings are newer than the repository's preparation configuration.

The inspected production baseline is Worker `rise-roost-website-production`, deployment `4bcab291-cbdc-404f-8229-4b10697a5677`, at 100% Worker version `fb329604-df73-4e5c-b1b4-8fd1b4dafe08`. Its downloaded `worker.js` SHA-256 is `b63c34e094544603e6c50a40bead2974d6891f7ee89ff21ba003c3cc446940dc`. See `live-baseline.json`. These are observations, not permission to deploy.

After explicit frontend deployment approval, first reread the active deployment and reconcile any concurrent changes. Prepare an asset-only release that retains the exact current executable, asset metadata semantics, runtime settings, bindings, secrets, routes and Access policies. Recheck all unchanged asset hashes; change only the reviewed customer module and the already-prepared module cache-version references in `app.mjs` and `index.html`. Do not migrate or alter D1. If that exact preservation cannot be verified, stop and report the discrepancy.

Rollback after an approved deployment: return 100% traffic to the immediately preceding captured Worker version, including its matched asset set. If the baseline remains current, that is `fb329604-df73-4e5c-b1b4-8fd1b4dafe08`; otherwise use the freshly captured predecessor. Verify the prior public asset hashes, settings route, guest checkout and owner account flow. No database rollback is needed or appropriate for this frontend-only change. Keep historic order/profile records intact.

Frontend deployment and account-deletion backend implementation require separate explicit approvals.
