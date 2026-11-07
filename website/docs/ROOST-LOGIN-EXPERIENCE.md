# Roost login experience investigation — November 7, 2026

## Verified root cause

The prior simplified anonymous experience was never implemented in the deployed source. Commit `42d2b4aa52bb8bde7a604779ed3f10712d0d5ea5` improved authentication and recovery but explicitly retained a sign-in section and registration form appended together inside the two-column `.roost-layout`. Commit `7e28b32b14fe06ccbd0d755a37dca33096a4185f` added the personalized dashboard and credits without removing this anonymous branch. Subsequent cash and pickup releases retained it. Existing tests exercised security and member journeys but did not prohibit simultaneous anonymous forms.

At investigation time, production serves Worker `777bc9f9-2dd8-4a15-a067-3ae79efeeddb` at 100%, deployment `267522c3-7002-4e38-bb15-cb68ad65a1f6`. The active executable was downloaded and retained unchanged for packaging. Public browser requests confirmed `customer.mjs`, `customer.css`, `app.mjs`, and `style.css` match the pickup release source byte for byte. Scripts and CSS use `public, max-age=0, must-revalidate`; markup uses `no-store`. Desktop and mobile reproduce the same anonymous branch. This is neither a cache mismatch nor an authenticated-only or responsive-only regression.

The default repository branch contains the older register application. This fix starts from `27db8a0` (the documented pickup release on `feature/pickup-approvals-rescheduling`), including implementation `07f5523`, rather than replacing newer website work from the default branch.

## Change

Anonymous customers now see an explicit welcome view, then either sign-in or registration. Only the selected view is mounted. Recovery appears under “Need help signing in?” and stays open through failed attempts. Back returns to welcome, and guest navigation opens the existing shop. Registration retains the same four fields, only Name required, and the original passkey calls. One-time recovery-key saving remains in the authenticated experience. No server, migration, session policy, dashboard, checkout, payment, pickup, inventory or customer record changes are included.

CSS scopes the anonymous views to a centered 560px maximum with large controls and the existing typography/colors. Authenticated dashboard CSS is preserved.

## Regression coverage

`npm run test:roost-entry` covers the anonymous journey, cancellation, recovery, remembered sessions, signed-out privacy, membership enrollment/sign-in, guest/member orders, favorites, credits, cash eligibility and rescheduling on desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. The explicit anonymous regression fails if `.join-roost` and `.roost-signin` are simultaneously visible and checks no technical copy/forms on welcome, no horizontal overflow and no JavaScript errors. The existing CI browser job discovers the new regression on website pull requests. Existing tests now navigate through the explicit entry choices.

Native virtual CTAP2 authenticators exercise Chromium WebAuthn. WebKit uses a test-only signing authenticator with real server verification. Physical biometrics and real customer credentials cannot be automated or claimed verified. All mutation tests use isolated local databases; no production synthetic accounts/orders are created.

## Production gate resolved

Initial read-only checks found checkout disabled and return credits paused, but Cash at Pickup ON. The owner explicitly authorized switching it OFF before deployment. A guarded update matched the full original ledger, workspace revision and ledger version, then changed only `management.settings.cashPickupEnabled` to false, added one clearly attributed owner-authorized deployment audit entry and incremented `ledger_version` once. Original ledger content and every other workspace field were compared and retained. No customer, credential, session, recovery, order, payment or inventory record was changed. No migration was needed.

The inactive candidate was inspected before activation: its executable metadata/etag, handlers (including security headers and scheduled handler), runtime/asset behavior and every binding exactly matched the prior version. Checkout remained disabled, return credits paused, and production/source had not advanced. All application-table fingerprints other than the explicitly updated workspace matched the original baseline; every table and schema then matched the preactivation snapshot after deployment. Cloudflare Access applications remained identical. No cache purge or security configuration change occurred.

## Evidence

- [Production before: desktop Chromium](roost-login/before-desktop.png)
- [Production before: mobile WebKit](roost-login/before-mobile.png)
- [Candidate welcome: desktop](roost-login/welcome-desktop.png)
- [Candidate sign-in](roost-login/signin-desktop.png)
- [Candidate registration: desktop](roost-login/join-desktop.png)
- [Candidate authenticated dashboard: synthetic member](roost-login/dashboard-synthetic.png)
- [Candidate welcome: iPhone WebKit](roost-login/welcome-mobile.png)
- [Candidate registration: iPhone WebKit](roost-login/join-mobile.png)

The candidate screenshots are isolated local fixtures, not proof of production activation. Predeployment public checks reproduced the old layout. Postdeployment public desktop Chromium and mobile WebKit checks confirm the new welcome layout, Cloudflare Access protection and disabled checkout, as detailed below. Both public checks issued zero write requests and recorded zero JavaScript errors or horizontal overflow.

The retained executable and dry-run output both have SHA-256 `0183895028bb98a5ba14731499b1d3fa717612f94f953e6cba5e7e36a639c327`. Only `public/customer.mjs` and `public/customer.css` change in runtime assets. No cache purge or security configuration change was made.

## Completed test results

| Verification | Result |
| --- | --- |
| Unit, service, security and database tests | 267 passed |
| Affected member/customer/credits/cash/pickup browser cases, five profiles | 60 distinct cases passed |
| New exclusive-entry/cancellation regression, five profiles | 5 passed |
| Checkout regression, five profiles | 20 passed |
| Commerce and payment settings, desktop Chromium / iPhone WebKit | 8 passed |
| **Distinct automated cases** | **360 passed** |
| Exact deployed executable in disposable workerd/D1 | Passed; zero remote requests or writes |
| Production packaging dry-run | Passed; executable hash identical |
| Public desktop Chromium / mobile WebKit | New layout and anonymous navigation verified; Studio Access 302, checkout false, no JS errors/overflow/write requests |

The first affected browser run completed 58 cases with two trace-artifact errors caused by overlapping runs sharing an output directory. Those two cases passed when rerun in a separate output directory. The new entry suite also passed its complete clean rerun (5/5). No behavioral test failure remains. Physical biometric prompts remain unverified as explained above.

## Verified production release — November 7, 2026

| Item | Value |
| --- | --- |
| Branch | `fix/roost-login-experience` |
| Tested/deployed implementation commit | `cc1d0594c4bb830ef18d602999df5ea8ad8ee61c` |
| Production Worker | `rise-roost-website-production` |
| Active Worker version, 100% traffic | `6aad782d-3aa7-4f59-8016-213a2f2447c7` |
| Deployment ID | `4994f42b-e98e-430a-a170-edb866e18226` |
| Previous retained Worker version | `777bc9f9-2dd8-4a15-a067-3ae79efeeddb` |
| Executable SHA-256, before and after | `0183895028bb98a5ba14731499b1d3fa717612f94f953e6cba5e7e36a639c327` |
| Checkout / Cash at Pickup / return credits | Disabled / OFF / PAUSED |
| Database migration | None |

The actual public homepage was opened and its The Roost link followed in desktop Chromium and iPhone-sized WebKit. Fresh screenshots show the simple welcome screen. Both public journeys exercised Sign In, hidden recovery/reveal, Back, Join, Back and Continue as a Guest. Sign-in and registration were never present together. Assets `customer.mjs`, `customer.css`, `app.mjs` and `style.css` match the tested source byte for byte. The active Worker executable also matches the retained original byte for byte. There were no JavaScript errors, horizontal overflow or browser write requests.

`/studio` and `/studio/api/manage/snapshot` return the Cloudflare Access challenge (302). The unprefixed private API correctly returns 404. An initial verification assertion used the unprefixed route and expected a challenge; the corrected verifier checks both intended responses. No application/security change was needed. Public `/api/site` confirms checkout disabled.

Existing authentication, dashboard, favorites, credits, member cash eligibility, guest checkout and pickup/payment behavior passed the 360 isolated cases plus actual workerd/D1 testing. No real production member was enrolled or signed in for testing, and physical biometric prompts remain manual. All newer server functionality and settings other than the explicitly authorized cash toggle were preserved. No unresolved implementation or deployment blocker remains.

Fresh **production** screenshots:

- [Desktop welcome](roost-login/live-desktop.png)
- [Mobile welcome](roost-login/live-mobile.png)
- [Desktop sign-in](roost-login/live-signin-desktop.png)
- [Mobile sign-in](roost-login/live-signin-mobile.png)
- [Desktop registration](roost-login/live-join-desktop.png)
- [Mobile registration](roost-login/live-join-mobile.png)

The authenticated dashboard screenshot above uses a synthetic local member. This release record and its screenshots are documentation only; runtime assets remain those tested and deployed from `cc1d059`.
