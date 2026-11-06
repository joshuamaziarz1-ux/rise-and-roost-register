# The Roost customer login — deployed November 6, 2026

The completed customer-only upgrade is live at https://rise-and-roost.com/roost. Traffic is 100% on the tested release.

| Release item | Value |
| --- | --- |
| Development branch | `feature/roost-customer-login` |
| Tested and deployed application source | `42d2b4aa52bb8bde7a604779ed3f10712d0d5ea5` |
| Approved production base | `1a8c793ec9b41d782c701482190777f831583528` |
| Production Worker | `rise-roost-website-production` |
| Active Worker version | `fe73af43-c04b-4611-ab5c-03746d4a4fad` |
| Deployment ID | `a9e5ed86-04a6-45c3-b9c3-3a6797f7a981` |
| Production D1 | Existing `rise-roost-production-db` |
| Retained application rollback version | `e2d01fc9-b0d8-4da7-817c-5eaf54f26157` |
| Compiled executable SHA-256 | `10df65d611fc2eaeb90cd604dae4ae23b29c3c378a1b00ee9c80cecfdf4c39cc` |

This report is documentation added after the tested application commit. It does not change deployed application bytes.

## Customer behavior

1. Returning customers see **Sign in with a passkey** before the optional join form. Standard WebAuthn uses the device's supported biometric, device PIN, Windows Hello or security key, with user verification required. No routine emailed verification code or password is needed.
2. A new customer establishes a new membership by verifying their new passkey. The existing production system was already passkey-based, with a saved recovery key; no email-code account migration was required. Existing member identities, credentials, recovery hashes, sessions and order relationships are preserved. Unverified contact details never grant access or automatically link guest orders.
3. The persistent customer cookie is HttpOnly, SameSite=Strict and Secure over HTTPS. Only a random opaque token is in the cookie; its hash is stored server-side. No authentication secret is written to localStorage.
4. Remembered sessions renew toward 30 days of inactivity, no more than once every six hours. Every session has an enforced 90-day absolute maximum. Expired and revoked tokens cannot renew or access private account data. Existing valid sessions retain their identity and acquire compatible metadata on use.
5. **Log Out** revokes the current session, expires its cookie and clears private customer fields. Browser Back/history restoration rechecks authentication. Other independent devices stay signed in unless explicitly revoked through **Account Settings → Remembered devices**. Customer A cannot revoke Customer B's sessions.
6. Saved recovery keys provide an accessible fallback without WebAuthn. Recovery atomically rotates the key, signs out old devices and removes old passkeys while retaining the member and orders. The customer saves the replacement key and can add a new passkey. Enrollment requires recent verified authentication, including a transaction check against concurrent logout.

## Final validation

| Suite | Final result |
| --- | --- |
| Backend/security | 221 passed |
| Production schema guards | 7 passed |
| Customer passkey/remembered-session/guest browser matrix | 30 passed |
| Pickup/selling/inventory browser matrix | 25 passed |
| Production owner/session/payment browser regressions | 10 passed |
| Commerce/payment-settings browser regressions | 8 passed |
| Studio navigation and Help Guide browser matrix | 15 passed |
| Total automated cases above | **316 passed; zero final failures or skips** |
| Compiled Worker in real local workerd/D1 | Passed customer registration/login/recovery/replacement passkey/device revocation, signed owner authorization, guest orders, payment verification, atomic inventory and calendar preservation |
| Production builds and exact-runtime version dry build | Passed |
| Focused desktop/iPhone visual/recovery rerun | 2 passed |
| Live read-only/public security checks after activation | 20 passed |
| Live desktop and mobile Chromium rendering | Roost sign-in, Shop and Basket passed; zero JavaScript errors |

The customer matrix covers desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium and tablet Chromium. Chromium uses native WebAuthn with a virtual CTAP2 authenticator. Linux WebKit uses a signing software authenticator with real server cryptographic verification. All account/order/payment mutations in tests used synthetic isolated fixtures. Browser profiles are emulations, not physical-device biometric certification. Earlier obsolete expiry/schema-count assertions and overlapping Playwright artifact directories were corrected; final complete runs above have no unresolved failures.

## Production and Studio preservation

The latest production deployment, repository branches and active executable were inspected before development. All 13 original application server modules matched the base through the active source map; the two existing customer assets also matched. The newer checkout pickup selection, Studio Help Guide and Studio navigation improvements were retained.

The release used a private Wrangler configuration generated from all actual existing production bindings and runtime settings. The staged candidate retained identical bindings, compatibility settings, asset routing and exported security handlers. Its downloaded executable matched the tested local workerd bundle byte-for-byte. Source-map contents also matched; generated path fields differ between staging and the dry build. The active executable was downloaded and checked again after activation.

The only production schema change was the reviewed, additive, idempotent `roost_session_details` metadata table. It was tested twice against synthetic legacy data before production use. Every original table definition and all twelve original application-table row fingerprints matched before staging, after migration, immediately before activation and after deployment. The new table remained empty during anonymous live verification. Existing accounts, passkeys, recovery hashes, orders, inventory, payments, content, comments and business settings were preserved. No reset, reseed, truncate, restore or production business mutation was used.

Guest checkout remains supported without an account. **The preexisting `checkoutEnabled=false` and `orderingPaused=true` settings remain unchanged**; this release does not activate ordering. Guest pickup/payment/order journeys passed in isolated fixtures with ordering enabled.

Danielle's Studio authentication was not changed. Cloudflare Access application and policy fingerprints remain identical, including owner session settings. The production owner authentication source, Studio login code and Studio UI assets were retained. Live `/studio` and `/studio/api/manage/snapshot` still challenge through the existing Cloudflare Access application. Unprotected legacy Studio APIs remain closed. A valid customer session cannot authorize Studio access.

No production test accounts, orders or payments were created. Negative live checks denied anonymous profile/device changes and cross-origin login before any challenge was issued. No real customer session or real owner login was borrowed for testing. Payment destinations, checkout activation, ordering pause, Access policies, DNS, routes and schedules were not modified.

## Limits and rollback

Initial joining needs a WebAuthn-capable browser/device or security key. An existing membership can use its saved recovery key on an unsupported browser. Recovery by email/name/phone alone is intentionally unavailable; without any usable passkey or saved recovery key, access cannot safely be restored. Customers should save their recovery key and may register multiple passkeys. These limitations are explained in the account interface.

The retained previous application version and its versioned assets remain available. Before any rollback, check for newer production changes. An application rollback must leave the additive table and current records intact. Never restore D1 for a code rollback, and never undo customer-initiated credential revocation or recovery-key rotation. No rollback was needed.

Implementation details and maintenance commands are in `ROOST-CUSTOMER-LOGIN.md`. Private configuration, read-only fingerprints, raw logs, screenshots and API receipts remain outside Git under `/workspace/roost-login-audit`.
