# Rise & Roost Register

Self-service Register and authenticated Admin with Supabase as the shared store database.

This branch replaces local-only persistence with transactional cloud writes, automatic updates, conflict protection and idempotent checkout. It preserves the kiosk design, members, pickups, inventory history and cash/QR payment methods.

Read [rollout and test results](docs/SHARED-DATABASE.md) before deploying. Production has not been merged or changed. The private preview uses isolated synthetic records in the existing RiseAndRoost project.

```powershell
npm ci
npx playwright install chromium webkit
npm run test:all
```

The original live GitHub Pages layout is restored at `index.html`. Its existing Admin button opens the embedded Admin; `index.html?admin=1` opens it directly. The separate v5 pages remain supported with their existing cash/QR checkout. Historical demo/test pages remain local sandboxes.
