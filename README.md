# Rise & Roost Register

Self-service cash register, inventory, pickup, vendor, and customer rewards system for Rise & Roost.

Candidate version: **5.2.0-rc.3** — draft for [Issue #2](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/issues/2). Production remains on main until explicit owner approval.

Current screens are `register-cloud-beta.html` and `admin-cloud-beta.html`. See [source audit, file map, rollback and device checklist](docs/PHASE-1-RELEASE.md) and [executed QA report](docs/PHASE-1-QA.md). [Using the new controls](docs/PHASE-1-CONTROLS.md) covers Comments, Roost credits and pickup appointments.

```powershell
npm ci
node node_modules/@playwright/test/cli.js install chromium webkit
npm run test:all
```

Tests use disposable local PostgreSQL and synthetic data. No production credentials or writes are needed. `npm run test:serve` provides a local synthetic test server; its simulated Admin sessions are for automation, not real email delivery. The fullscreen manifest does not provide OS kiosk lockdown or a service-worker offline app shell.

## Historical v5 features (not all controls are present in the approved current split UI)

- Simple kiosk-style home screen with Shop, Pickup Order, and The Roost
- Self-serve tap-to-buy checkout and exact-cash checkout
- Vendors / brands, inventory, low-stock tracking, sales history, and pickup orders
- **The Roost** member signup with name, phone number, and email
- Required member notification preference: **Text, Email, or Both**
- Optional store-news / specials preference
- Egg-carton return tracking and configurable cartons-per-free-dozen reward threshold
- Automatic detection when a member crosses a free-dozen reward threshold
- Automatic **Roost Alert** creation for earned rewards
- Reward alerts show the member, date/time, notification preference, delivery state, and redemption state
- Reward redemption continues to reduce egg inventory automatically
- Separate **Danielle** and **Ivan** admin identities with individual PINs
- Inventory adjustments and carton-credit corrections record the signed-in admin
- Admin dashboard includes Roost alert counts and recent admin activity
- Notification connection settings for automatic email/text delivery
- Backup and restore includes member preferences, Roost alerts, notification logs, and admin audit history

## Notification delivery

The register automatically creates reward notifications and queues the channels selected by the member. External email/text delivery requires a notification endpoint to be connected under **Admin → Settings & Backup → Member Notifications**. Until an endpoint is connected, the alert remains visible in **Roost Alerts** as **Not Connected** instead of falsely reporting that a message was sent.

This keeps the register honest and preserves every reward alert while the free notification service is being connected.

Live site: https://joshuamaziarz1-ux.github.io/rise-and-roost-register/
