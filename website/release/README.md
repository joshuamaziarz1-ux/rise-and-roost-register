# Approved post-order payment release

The production Worker contains later email, account, policy, cash and pickup fixes absent from this historical branch. Do **not** deploy the older `server/` tree over production. `post-order-payment.mjs` applies a bounded, digest-checked transform to the downloaded active production executable and inserts the three reviewed public modules, preserving the original asset binding and every other server byte.

Baseline: Worker `rise-roost-website-production`, version `0b940dd4-153f-4829-8725-4f989884341b`, deployment `2444c9fa-cdda-4489-8665-7e4df08d051d`, SHA-256 `127cfe8d792deecbf06d2923071ac2a514eadd7dda987731aa9f1567122a2e27`. Obtain that version's executable using the authenticated Cloudflare API. Credentials and original runtime configuration never belong in this repository. The transform refuses a different executable.

```sh
node release/post-order-payment.mjs /absolute/path/baseline.js /absolute/path/candidate.mjs
```

The three modules in `public/` start from the downloaded live frontend, retaining existing required contact validation, current no-refund policy, confirmations, account behavior and pickup handling. Compare them to the active assets when reviewing the narrowly scoped checkout change; the historical branch diff also includes already-deployed frontend changes.

Set `RR_CANDIDATE_MODULE` to the absolute candidate path, `RR_SYNTHETIC_SCHEMA` to `tests/fixtures/post-order-schema.sql` (absolute), and `RR_PUBLIC_ASSETS` to a local copy of current public assets. Use the root HTML response as `index.html`; the literal `/index.html` request does not return the application shell. Assets under `/studio*` are Access-protected: use repository frontend assets for the synthetic owner shell rather than copying an Access redirect. All tests use fresh in-memory SQLite/local D1 and synthetic owner identities, products, recipients and customer details. No production customer records or credentials are loaded.

```sh
npm run test:post-order-api
npm run test:post-order-worker
npm run test:post-order-browser
npm test
```

The API/edge acceptance checks exercise the **candidate executable**, not the older source tree. The general `npm test` suite is additional regression coverage of the retained repository modules. Browser tests cover all four methods on desktop Chrome, desktop WebKit, iPhone WebKit, Android Chrome and tablet Chrome, plus interruption recovery, private tracking, cancellation, and automatic paid-state updates. External URLs are intercepted synthetic destinations: no money is sent, and actual provider app authentication is outside this test.

For deployment, upload the exact tested candidate as a new Worker version with original assets retained, original secret bindings retained, and all original bindings/runtime settings preserved **except `REAL_CHECKOUT_ENABLED=false`**. Verify the staged version before assigning traffic. Recheck the active deployment/settings before staging and before deployment; stop on concurrent changes. Preserve D1 data and schema, payment destinations, Access, routes and DNS. Verify deployed module hashes, the disabled public checkout flag, and all original application row fingerprints. Live checkout requires separate owner authorization after this release.
