# Cross-device publishing correction — October 27, 2026

Website: https://rise-roost-beta.joshua-maziarz1.workers.dev/

Studio for the saved main site: https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae

Published demo alias: https://rise-roost-beta.joshua-maziarz1.workers.dev/demo/be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae

## Cause and reproduction

The owner’s product changes had already reached `rise-roost-beta-db`: the original workspace’s draft and published document matched at published revision **8**. The root `/api/site` endpoint instead returned a newly generated starter document at revision **1**. The root and `/demo/<workspace-id>` routes therefore selected different content. Browser refresh could not fix that selection.

[Read-only reproduction in two independent HTTPS browser sessions](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40509015552) confirmed different storefront products and root revision 1 versus saved-site revision 8. Existing API responses already used `Cache-Control: no-store`; this was a content-selection error, not a failed D1 publish or a cache containing an old publication.

## Correction

- The root now reads the existing workspace selected by the Worker’s non-secret `PUBLIC_WORKSPACE_ID` variable, using its D1 `published_json` and `published_revision`. Its explicit demo alias reads that same row. No content was copied, reset, or migrated.
- Only the owner session for that workspace may save/publish it. Creating or publishing a different demo does not replace the root mapping. A missing configured row reports an error instead of displaying unrelated starter content.
- Studio identifies **BETA WEBSITE · OWNER**, shows **View published website** linking to the root, and explains the publication destination. The canonical Studio URL and public storefront’s **Open Website Studio** link include the workspace ID and prefill it on another device, while the private key remains required. Existing sessions for a different workspace cannot silently override an explicit Studio destination.
- Drafts, frozen previews, and published documents remain separate. **Save draft** does not change public content; **Publish demo** still requires confirmation and updates the same persisted D1 publication.
- Root tabs continue requesting the root API instead of pinning an inferred demo selection. Refresh/poll/focus/visibility/reconnect requests use no-store behavior, reject older published/availability revisions, and prevent out-of-order responses from rolling the page backward. Studio also rechecks local edits after a focus refresh before adopting another device’s saved draft.
- JSON responses include browser and CDN no-store headers. Background polling remains every five seconds; returning to a tab also refreshes it.

## Deployment and preservation

Application source: `f5bbdb275e6f36e0f45be2408ed6676e131d85c7`.

Only Worker `rise-roost-beta` was deployed, on October 27 at **9:35 a.m. EDT**. Deployment `9f813872-b1d8-4ae9-8366-6ad05cf4b5b1`, version `2dc22f14-5cb9-4deb-b3d6-2d77e0b5bd43`, 100% traffic. The exact `rise-roost-beta-db` binding and primary workspace variable were checked through Cloudflare’s API. HTTPS root and alias API documents matched at revision 8 with browser/CDN `no-store` headers.

A private fingerprint baseline covers all 45 workspace records present at the start of this fix, including their draft, published document, versions, ledger, and revisions. All 45 original workspace fingerprints still match after deployment and hosted tests; the owner remains at published revision 8. The owner’s publication was not edited during tests. Mutating root-publication browser tests use a separate temporary local database; hosted mutation tests use new independent demos.

Register/Admin, production Supabase, existing Square settings, main, DNS, and the custom domain were not changed. The approved stylesheet, default HTML, artwork, and logo remain byte-for-byte unchanged. No production deployment or merge occurred.

## Verification

- **25 backend tests passed**, including root selection, draft isolation, no-store headers, other-demo isolation, and missing-workspace handling.
- **35 local browser tests passed** across desktop Chromium, desktop WebKit, iPhone WebKit, Android Chromium, and tablet. Each profile exercises two independent sessions publishing a primary-site product name/price, unchanged public data after draft-only saves, public updates after publish, reload persistence, explicit-alias equivalence, a deliberately stale API response, and another session signing into the same saved draft.
- [CI application checks](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40510674669): the **test** job passed (25 backend + 35 local browser cases), and the **hosted-beta** job passed (hosted API/Worker checks and all **35 hosted browser cases**, including five read-only checks of the actual primary site). These job outcomes were confirmed from GitHub’s public run page after API credentials expired.
- The separate read-only helper initially compared one refreshed page before its client content had finished rendering. That test timing error was corrected by waiting for the rendered page after reload. The corrected **root-sync** job [passed in CI on the final application source](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40513403490), verifying root/alias equivalence and refresh persistence in two independent Chromium sessions. It also passed directly against the live HTTPS site in two independent WebKit sessions, with revision 8, no-store headers, and no owner-data modifications.
- [Final-source CI](https://github.com/joshuamaziarz1-ux/rise-and-roost-register/actions/runs/40513403490) reran all **60 application tests** (25 backend + 35 local browser) successfully after the Studio destination link update. The full hosted matrix remains the separately linked 35-case run above; the final-source root check is read-only.
- Live HTTP checks independently confirmed root and explicit-demo JSON are identical at revision 8 and the Worker serves 100% traffic on the new version.

The environment’s Chromium HTTPS attempt required changing its shared trust store; automatic approval review rejected that persistent security-setting change. Reproduction used GitHub’s isolated Chromium runner, and final live verification also succeeded in isolated WebKit sessions using the existing managed proxy and OS certificate bundle. No shared trust store was changed and no TLS verification was disabled. Local mutating primary-site fixtures use loopback HTTP and temporary SQLite only. These are engine/viewport emulations, not physical-device acceptance.

## Verify on your two computers

1. On computer A, open [Studio for the existing main website](https://rise-roost-beta.joshua-maziarz1.workers.dev/studio?workspace=be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae). Sign in with your saved private key. The workspace ID is prefilled. Do not create a new private demo to resume this website. Confirm the **BETA WEBSITE · OWNER** label.
2. Edit a product name or price and choose **Save draft**. The other computer should still show the last published version.
3. Choose **Publish demo**, confirm, and wait for **Published to the beta website**. This writes the publication to D1; no Worker deployment is needed for future content changes.
4. On computer B, open [the shop](https://rise-roost-beta.joshua-maziarz1.workers.dev/shop) and refresh, or return to its tab and wait up to five seconds. No Studio sign-in is required to see published changes. The [published demo alias](https://rise-roost-beta.joshua-maziarz1.workers.dev/demo/be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae/shop) should show the same products/prices.
5. To edit from computer B too, use the same Studio URL and saved private key. Save Draft remains private until Publish. A fresh separate demo is intentionally a different test site and displays its own destination warning.

Keep the private key private. The Studio and demo URLs contain only a public workspace identifier. Physical MacBook/iMac Safari and actual phone/tablet behavior still need owner testing.


GitHub briefly returned expired-credential errors during verification; access recovered and no new permission or connection action is required.
