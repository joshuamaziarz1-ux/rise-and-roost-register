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

## Production gate

Read-only checks found `REAL_CHECKOUT_ENABLED=false`, return credits paused (`returnCredits.enabled=false`), but **Cash at Pickup is ON** (`management.settings.cashPickupEnabled=true`). That current setting differs from the requested OFF prerequisite. No setting has been changed. An explicit decision is pending before activation; the completed UI change must not be described as live until the prerequisite is resolved, production concurrency is rechecked, and fresh public screenshots and asset/version checks pass.

Thirteen application tables were fingerprinted, including schema and all rows. Rechecking found every table unchanged. No database migration is needed. Preserve production bindings, original executable, asset routing and Cloudflare Access; do not deploy the preparation-only checked-in production config directly. Do not purge caches or modify security settings.

## Evidence

- [Production before: desktop Chromium](roost-login/before-desktop.png)
- [Production before: mobile WebKit](roost-login/before-mobile.png)
- [Candidate welcome: desktop](roost-login/welcome-desktop.png)
- [Candidate sign-in](roost-login/signin-desktop.png)
- [Candidate registration: desktop](roost-login/join-desktop.png)
- [Candidate authenticated dashboard: synthetic member](roost-login/dashboard-synthetic.png)
- [Candidate welcome: iPhone WebKit](roost-login/welcome-mobile.png)
- [Candidate registration: iPhone WebKit](roost-login/join-mobile.png)

The candidate screenshots are isolated local fixtures, not proof of production activation. Fresh public desktop Chromium and mobile WebKit checks confirm Studio still challenges through Cloudflare Access (302), checkout remains disabled, and the old layout remains active pending resolution of the setting conflict. Both public checks issued zero write requests and recorded zero JavaScript errors or horizontal overflow.

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
| Public desktop Chromium / mobile WebKit | Existing layout verified; Studio Access 302, checkout false, no JS errors/overflow/write requests |

The first affected browser run completed 58 cases with two trace-artifact errors caused by overlapping runs sharing an output directory. Those two cases passed when rerun in a separate output directory. The new entry suite also passed its complete clean rerun (5/5). No behavioral test failure remains. Physical biometric prompts remain unverified as explained above.
