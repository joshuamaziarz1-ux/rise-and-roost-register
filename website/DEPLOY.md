# Deploy the isolated HTTPS beta

The beta deployment targets only **rise-roost-beta**, with the dedicated **rise-roost-beta-db** D1 binding. Authenticate a Cloudflare account with rights to edit that isolated Worker and its demo database. Use a dedicated beta project, not the production Register, and do not attach the future custom domain. Cloudflare Workers Static Assets is used instead of static-only Pages so that owner sessions, drafts, publishing, uploads, and simulated orders have a backend. GitHub Pages is not the commercial hosting target.

## One-time account connection

Connect the owner’s Cloudflare account through a supported secure credential connection. Wrangler OAuth (`npx wrangler login`) is an alternative when an interactive browser callback is available. If using a narrowly scoped API token, supply it through secure environment settings, never chat, a committed file, frontend code, screenshots, or a PR. Scope access to the dedicated account/project: Workers Scripts edit, D1 edit, and the account-read permissions Wrangler needs. Confirm the current Cloudflare token UI and account limits/costs before granting it. No DNS or zone-edit permission is needed for a workers.dev beta.

The setup machine also needs access to `api.cloudflare.com` and the assigned `*.workers.dev` hostname. GitHub API and Playwright browser-download access were restored during implementation; the environment draft includes `api.github.com`, `api.cloudflare.com`, `cdn.playwright.dev`, and `playwright.download.prss.microsoft.com`. Keep those settings and add the actual assigned beta hostname when known. Do not replace other existing allowlist entries. Additional provider download redirects, if any, must be added only as observed. The draft also declares `CLOUDFLARE_ACCOUNT_ID` and a proxy-backed `CLOUDFLARE_API_TOKEN` requirement for secure entry; neither has an invented/default value.

## Commands for the coding/deployment operator

Run from `website/` after authentication. Danielle does not need a terminal for normal editing.

```sh
npm ci
npx wrangler whoami
npx wrangler d1 create rise-roost-beta-db
```

The configured beta database now exists and its binding is recorded in `wrangler.toml`. Create it only when absent; never replace a working database on redeployment. If creating a fresh beta environment, set the returned demo database ID in that binding and confirm its identity before running any schema command. Then:

```sh
npx wrangler d1 execute rise-roost-beta-db --remote --file=schema.sql
npm run check
npm run deploy
```

Record the actual HTTPS address printed by Wrangler, the website branch commit SHA, D1 ID, and deployment time. Add that specific preview host to the cloud environment’s allowlist if required for verification. Do not invent or assume a hostname. No Supabase credentials, Square credentials, production data copies, migration of PR #3, or custom-domain changes belong in this procedure.

## Main published site

`PUBLIC_WORKSPACE_ID` selects the existing owner workspace whose **published** D1 record the root website reads. It is a public identifier, not an access key. Do not automatically select the newest workspace, let arbitrary demo publishers replace it, or create/copy a new owner site during a deployment. The configured primary workspace shows **BETA WEBSITE · OWNER** in Studio and links to `/`; separate test workspaces link only to their own `/demo/<id>` site. The main `/studio?workspace=<id>` URL prefills the correct saved workspace and still requires the private key. Preserve existing rows and verify root and explicit workspace APIs return the same ID/revision/document.

Local integration fixtures set `RR_PUBLIC_WORKSPACE_ID` for their own temporary SQLite database. They never change the hosted owner’s data. Hosted primary-site checks are read-only; order/edit simulations use newly created demo workspaces.

## Required deployed acceptance

Open the actual HTTPS deployment in a browser, then repeat the automated flows against it using a dedicated test workspace:

- Home, shop/detail, About, Visit, Contact/FAQ, terms, basket, and pickup deadlines render on desktop and phone with no broken assets or horizontal overflow.
- Create a private demo, save the access details securely, and sign in from a separate context/device. Change headline, product price and real raster upload, and order deadline.
- Save draft: published site stays unchanged. Read-only preview: new content appears but Studio remains protected. Publish: a separate browser receives the update. Restore: published and draft return to the chosen version.
- Simulate an order; server rejects stale prices, cutoffs, stock, or full capacity. No real payment occurs. Owner can see the request and fulfillment audit. Anonymous users cannot read the owner’s orders, save drafts, or publish.
- Confirm HTTPS cookies include Secure/HttpOnly/SameSite and restrictive CSP/no-store/referrer headers are present. Never publish access keys in screenshots or logs.

The local automated tests are not proof of a working deployed hostname or of physical-device Safari acceptance. Run the full WebKit matrix once its signed browser download is available; do not disable TLS or artifact verification to install it.

For repeatable remote checks after deployment, set `RR_BETA_BASE_URL` to the actual isolated HTTPS workers.dev address and run `npm run test:worker`, `npm run test:browser`, and `npm run screenshots`. Remote test scripts reject production/custom-domain targets. Tests create separate synthetic workspaces; they never reuse the owner’s working demo. Without that variable, browser tests start an in-memory local server; the Worker smoke/screenshots expect the local Worker on port 4175.

## Domain and eventual production

The owner must register/confirm ownership of the desired domain in their own account, protect it with MFA and renewal settings, and approve a separate production launch. This beta makes no domain availability claim. A later reviewed launch must verify provider terms/plan/limits, Supabase owner auth/redirects/CORS, storage permissions, Square sandbox and verified webhooks, migrations/backups, fulfillment policies, and old kiosk bookmark continuity. Never redirect the existing kiosk as a beta side effect.

Rollback for this isolated beta is a previous Worker deployment with its compatible demo schema. Export design JSON before discarding a demo database; delete only the dedicated beta Worker/database when finished. No production rollback is needed because this project does not deploy to, migrate, or replace production.

## Scoped-token deployment status

See [the beta deployment record](docs/BETA-DEPLOYMENT.md). Account-scoped token verification is the appropriate check for the configured account API token; the user-token verification endpoint is not applicable. The token has successfully created the dedicated D1 database, initialized its schema through the supported D1 query API, uploaded the website, and activated the beta version.

Wrangler subsequently attempts `GET /accounts/{account_id}/workers/subdomain`, which is denied by this narrowly scoped token. Cloudflare documents **Workers Scripts Read** (or Write) at account level for this hostname lookup. No additional write access is needed for the completed beta deployment. Prefer supplying the existing public workers.dev URL from the beta Worker’s Dashboard **Visit** link, avoiding broader account-level access. A nonzero CLI result at this final lookup does not undo the upload: verify the target Worker’s active deployment and exact D1 binding before reporting status.
