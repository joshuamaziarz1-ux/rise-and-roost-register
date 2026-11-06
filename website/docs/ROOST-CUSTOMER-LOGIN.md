# The Roost customer login

This release starts from approved production source `1a8c793ec9b41d782c701482190777f831583528`, preserving the checkout pickup cards, Studio Help Guide and Studio navigation. Development branch: `feature/roost-customer-login`. The production executable's source map was checked against the base application sources before development.

## Customer experience and identity

Returning customers choose **Sign in with a passkey**, now presented before joining. Standard WebAuthn verifies the device's passkey with user verification required. Face ID, Touch ID, fingerprint, device PIN, Windows Hello and security keys depend on the customer's device. The website never receives biometric data or a private passkey. The existing SimpleWebAuthn server library validates challenges, origins, RP IDs, signatures, counters and user verification; challenges expire after five minutes and are consumed atomically.

New memberships establish a new identity by verifying possession of the newly registered passkey. Names, email addresses and phone numbers remain unverified pickup contact details. They cannot identify, merge, recover or grant access to an existing account. No email-code identity system was present in the inspected production source. Existing member IDs, passkeys, recovery hashes, order associations and valid sessions remain valid. A signed-in customer is directed to add a passkey rather than accidentally creating another account. Signed-out customers are reminded to sign in or recover their existing membership.

The account area provides My Orders, existing private order tracking, pickup details, Account Settings, remembered devices and **Log Out**. Historical guest orders can only be claimed with their complete private tracking link; matching contact details never attach them automatically. Member checkout derives ownership from the server-side customer session, never a browser-supplied customer ID.

## Remembered sessions and logout

Customer cookies remain separate from every Studio cookie and Cloudflare Access identity. The cookie contains a random 192-bit opaque identifier; D1 stores its SHA-256 hash. Cookies are persistent, HttpOnly, SameSite=Strict and Secure on HTTPS. Authentication secrets are never stored in localStorage.

Sessions expire after approximately 30 days without a visit, with an absolute limit of 90 days from authentication. Renewal is limited to once per six hours to avoid database writes on every background poll, so the effective inactivity period can be up to six hours shorter than 30 days. Renewals and cookie lifetime are capped at the absolute limit. Expired or revoked sessions cannot renew. Existing unexpired fixed-lifetime sessions acquire metadata lazily, deriving their original issue time from their original 30-day expiry. An expired legacy session is never revived.

Log Out invalidates the current token server-side, expires its cookie and clears private in-memory fields and the one-time recovery display. Other independent devices remain signed in. Remembered devices can be individually logged out from Account Settings; each operation checks account ownership server-side. Reauthentication replaces the current browser's old token. Other tabs receive a secret-free BroadcastChannel notification, and server checks also detect expiry/revocation during normal refresh. Private responses and HTML are not cacheable. Pagehide scrubs private state before browser history caching; pageshow rechecks restored pages. Background responses cannot repaint a previous account after logout or authentication. Failed account refreshes remove private content.

Adding a passkey requires authentication within the last ten minutes. If needed, the UI asks for a fresh passkey sign-in first. Enrollment rechecks the live session within the same D1 transaction that consumes the challenge, preventing a concurrent logout from creating a new credential or session.

## Recovery and unsupported devices

The existing high-entropy recovery key is the passwordless fallback. Customers save it in a password manager when joining. **Another way to sign in / recover my membership** works without WebAuthn support. Recovery verifies its hash, rotates the key, revokes existing sessions and removes old passkeys in one atomic transaction. The same member and order history are retained. Save the replacement key, then add a new passkey on a supported device. A failed transaction retains the old recovery key, credentials and sessions. Old recovery keys cannot be reused.

Recovery never trusts an email address, name or phone number. No email delivery service is configured for customer identity, and no mail-based bypass was introduced. Without any usable passkey or the saved recovery key, access cannot safely be restored. Initial enrollment requires a WebAuthn-capable browser/device or security key; an existing membership can be recovered on an unsupported browser. Guest shopping remains available to everyone, including unsupported devices. Browser emulation does not certify physical biometric prompts or passkey synchronization by a device vendor.

## Schema, production protection and rollback

`migrations/0003_customer_remembered_sessions.sql` adds only the idempotent `roost_session_details` table. It contains session metadata and opaque device IDs. It does not alter existing tables or insert/update existing account, order, inventory, payment, content or Studio records. `schema.sql` includes it for local development. The frozen production initialization schema remains unchanged; fresh installations must apply the migration after that baseline schema. Backup tests verify that the dynamic full-database backup and local restore include the new table.

Before release, compare the current production deployment and configuration with the inspected baseline, fetch newer repository refs, and compare all existing application-table/schema fingerprints. Stop on unexplained drift. Test the migration twice against synthetic legacy records and check existing records remain byte-for-byte intact. Apply only this migration to the existing production database. Recheck every original table, and require that the sole schema change is the reviewed metadata table.

Build and stage through Wrangler versions using a private configuration generated from the actual production runtime and all existing binding values. The preparation-only checked-in production config must not be deployed directly. Preserve asset routing, compatibility date/flags, bindings, disabled checkout, ordering pause, payment destinations and Cloudflare Access. Inspect the inactive candidate and its compiled executable before activating it. No production test memberships, orders or payments are needed: actual registration, recovery, ordering and payment mutations use disposable local fixtures, including a real local workerd/D1 instance running the compiled candidate.

For rollback, first check for newer production work, then restore traffic to retained version `e2d01fc9-b0d8-4da7-817c-5eaf54f26157` with its matching assets. Leave the additive table and all current business/account records in place. The previous application ignores the metadata and continues to respect persisted session expiry and revocation. Recovery already performed is intentionally not undone: removed credentials and rotated keys must remain revoked. Never restore, reset, truncate or reseed D1 for an application rollback.

## Validation

Run from `website/`:

- `npm test`: backend security, real signed WebAuthn, ownership, challenge replay/expiry, session rolling/inactivity/absolute limits, device isolation/revocation, CSRF, rate limiting, legacy preservation, recovery rollback and concurrent logout/enrollment.
- `python tests/production_schema_guards.py`: existing initialization protection remains intact.
- `npx playwright test --config playwright.roost-login.config.mjs`: guest checkout and tracking, passkey registration/login, persisted-cookie restoration, recovery without WebAuthn, replacement passkeys, logout/Back, cross-tab invalidation and history restoration across desktop Chromium/WebKit, iPhone WebKit, Android Chromium and tablet Chromium.
- Existing `playwright.phase3`, `playwright.production`, `playwright.commerce` and `playwright.navigation` configurations: pickup, selling, inventory, guest payment selection, Studio owner authentication, session duration, Help Guide and navigation regressions.
- Wrangler production dry builds and `RR_PRODUCTION_WORKER_BUNDLE=/absolute/path/to/worker.js node tests/production-launch-worker-smoke.mjs`: compiled customer passkeys/recovery/sessions/revocation and existing owner/guest/commerce behavior in disposable local workerd/D1, with no hosted business writes.

WebKit uses a signing software authenticator because its Linux automation runtime has no OS biometric implementation; Chromium exercises its native WebAuthn implementation with a virtual CTAP2 authenticator. All fixtures are synthetic. Private production configuration, fingerprints, raw verification logs and deployment receipts stay outside Git under `/workspace/roost-login-audit`.
