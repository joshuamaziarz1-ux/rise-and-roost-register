# Email features continuation — November 7, 2026

This continues `feature/roost-coordinated-release` at `d78a362c`, whose prior application source is `3ab008b`. Guarded application commit `1de0ac10723a39e43609b90ed267d015936ab5e1` is deployed as Worker **29**, version `1fe1b834-660d-4372-b49a-ca3bee8b5fa3`, deployment `49699086-f49b-4229-a9b8-4ac5da1fd80c`. It does not use legacy main. See `EMAIL-FEATURES-RECEIPT.json` for the final deployment/test status. Authentication activation and live Marketing validation remain conditional on actual provider/mailbox evidence; mocked tests never satisfy these gates.

## What changed

The Marketing adapter uses a separate encrypted `RESEND_MARKETING_API_KEY`, Contacts, Segments and Broadcasts. It never falls back to `RESEND_API_KEY` or sends promotional payloads through `/emails`. The transactional endpoint remains only for the affirmative signup confirmation and existing account/order notifications.

Contacts synchronize only after recorded explicit consent and confirmation. Local unsubscribe suppresses immediately and attempts provider suppression; failures remain visible and pending. Provider unsubscribe always wins and is never automatically reversed. Pending/expired confirmation, accepted/failed/quota-paused confirmation delivery and provider synchronization errors are distinguishable. Membership and ordering do not enroll subscribers. Provider status is reconciled on synchronization and before delivery; no provider webhook is configured by this release.

Studio retains the four templates, existing product-photo selector and sandboxed preview. Owners can prepare an isolated test to one configured, confirmed, opted-in owner. Campaign activation has additional independent gates. Each delivery creates a dedicated segment and an unsent Broadcast. Studio shows the exact recipient emails, sender address, subject and physical mailing address before explicit confirmation. Reviews expire after 15 minutes; changed content, consent, provider audience or address prevents sending. Provider audience and draft contents are checked again immediately before send. Free-plan capacity is read from authenticated `/usage`, including contacts outside this application and segment capacity. Missing/unknown/exhausted or paid-tier allowances fail closed; no plan upgrade is performed.

Requests first persist in the existing compare-and-swap ledger. Studio's **Synchronize and process pending work** advances bounded, saved batches through separate authenticated owner requests until review or delivery completes; no new cron, background fanout or production email is triggered by deployment. One-shot durable claims prevent parallel execution or duplicate sends. Studio can resume completed batch checkpoints. Interrupted preparation/checking remains visible and requires operator reconciliation. An uncertain send is never automatically retried: use its saved Broadcast ID and **Refresh provider results**. Provider acceptance is distinct from sent status and per-recipient delivered/bounced/complained/unsubscribed/suppressed event results. A delivered event is not a claim that the owner saw the message. History is retained. Storage and capacity limits fail closed; old segments are not deleted automatically.

The new account owner-test gate allows the existing email endpoints to be exercised while `ROOST_EMAIL_LOGIN_ENABLED=false`. Every email action, including verification/reset token redemption, is restricted to configured production owner addresses while `ROOST_AUTH_OWNER_TEST=true`. Public `/api/roost/me` continues to report email login disabled. No Studio/Access bypass or production-owner identity change is introduced. When public email login is enabled after passing checks, the existing customer email UI hides normal username/passkey prompts and retains the explicit existing-member recovery path.

## Evidence needed from the owner

1. Open the authenticated Resend account. Verify `rise-and-roost.com`, `orders@rise-and-roost.com`, current transactional daily/monthly remaining allowance, recipient restrictions, current Marketing plan/contact/segment allowance and existing transactional-key permissions. Retain the existing restricted transactional key. The current official Usage API requires full access; a sending-only key cannot establish account usage. Never paste a key in chat.
2. Identify Danielle’s or Joshua’s existing configured owner mailbox from the live Worker’s `PRODUCTION_OWNERS`. The connected Gmail identity during this task differed from those configured addresses; it does not establish mailbox access to either owner address. Keep those private mailbox addresses out of public release evidence. A targeted search found no recent messages from the bakery sender in that connected inbox. Do not add an owner identity or expand a recipient allowlist just to bypass this requirement.
3. For Marketing, install a separate appropriately scoped key as the Cloudflare encrypted Worker secret `RESEND_MARKETING_API_KEY`, using Cloudflare's dashboard or an interactive secret command. Provide authenticated Resend access/secure environment binding and permit `api.resend.com` for operator inspection if using an external runner. Do not expose or replace `RESEND_API_KEY`.

These are access/evidence requirements, not another request for generic deployment permission.

## Exact account owner test (operator and mailbox owner)

After the account checks above, temporarily set only `ROOST_AUTH_OWNER_TEST=true` and `ROOST_AUTH_FREE_PLAN_CONFIRMED=true`. Preserve `ROOST_PASSWORD_LOGIN_ENABLED=true` and its encrypted pepper. Keep `ROOST_EMAIL_LOGIN_ENABLED=false`, general account delivery flags false/absent, checkout/order-email/Marketing gates false. Do not rerun migration 0012 or delete any account.

The owner opens `https://rise-and-roost.com/roost` in a private test browser and uses its developer console. This helper contains no credential; passwords/tokens stay in that browser and must never be pasted into chat, Git or logs:

```js
const workspaceId = '5c6b64c991570cc03df650282e1a5a90bf72283c1de5f542';
const account = async (action, fields = {}) => {
  const r = await fetch('/api/roost/' + action, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({workspaceId, ...fields})
  });
  return {status:r.status, result:await r.json()};
};
const me = async () => (await fetch('/api/roost/me?workspace=' + workspaceId)).json();
```

Use a fresh test password entered locally; do not put its value in a saved console transcript. If the configured address already has an account, use login/reset instead of trying to replace it. Preserve existing records.

1. `await account('email/register', {name: prompt('Your name'), email: prompt('Configured owner email'), password: prompt('Test password')})`. Confirm an unrelated non-owner request returns 503 and creates no pending registration. No order or payment is involved.
2. Confirm actual **Verify Your Email** mailbox receipt. Open the complete private verification link in the same browser profile where registration began; the pending registration cookie is required. On that Roost page, redefine the helper above if necessary, then run `await account('email/verify', {token: location.hash.split('.').at(-1)})`. If the browser has removed the fragment, copy only the token from the received link locally into the call. Do not share it. Confirm the link cannot be used twice and `await me()` shows the signed-in owner test member.
3. Reload and open a second tab in that same browser; confirm the same member remains signed in. Confirm the session cookie is Secure, HttpOnly and SameSite=Strict without copying its value. Call `await account('logout')`; confirm `await me()` returns `member:null` and the old session cannot authenticate.
4. Call `await account('email/login', {email: prompt('Owner email'), password: prompt('Test password')})`; confirm success and persistence. Call `await account('email/forgot', {email: prompt('Owner email')})`. Confirm actual **Reset Your Password** mailbox receipt, open that private link in the test browser, redefine the helper, then call `await account('email/reset', {token: location.hash.split('.').at(-1), password: prompt('New test password'), confirmPassword: prompt('Repeat new test password')})`.
5. Confirm reset token reuse fails, the old password fails, prior sessions are invalidated, and the new password signs in. Confirm actual **Password Changed** notification receipt. Reload/new-tab persistence and sign-out must pass again. Record only timestamps, action/outcome and confirmed receipt, never passwords, links, cookie values or keys.

After every check passes, the owner has already authorized activation. Set `ROOST_EMAIL_LOGIN_ENABLED=true`, `ROOST_PASSWORD_LOGIN_ENABLED=true`, `ROOST_AUTH_EMAIL_ENABLED=true`, `ROOST_AUTH_DELIVERY_VERIFIED=true`, `ROOST_AUTH_FREE_PLAN_CONFIRMED=true`; remove/disable `ROOST_AUTH_OWNER_TEST`. Keep `ROOST_SIMPLE_LOGIN_ENABLED=false`. Keep the unrelated legacy `ROOST_DELIVERY_VERIFIED=false` flag unchanged; it belongs to the older contact-code flow. Verify public registration/login/reset, session persistence, legacy recovery, Studio/Access and the disabled commerce gates. Never claim activation before these results exist.

## Marketing test and separate activation

Danielle first saves her accurate physical mailing address in **Studio → Marketing → Sender details**. No address is invented or copied from an unrelated pickup setting.

With account allowances verified, temporarily set `MARKETING_SIGNUP_OWNER_TEST=true`, `MARKETING_CONFIRMATION_EMAIL_ENABLED=true`, `ROOST_AUTH_FREE_PLAN_CONFIRMED=true`; keep `MARKETING_SIGNUP_ENABLED=false`. From the owner browser's same-origin console, submit `/api/marketing/signup` with `{email: '<configured owner address>', consent: true}`. Confirm actual confirmation-email receipt and use **Confirm My Subscription** in the received link. Check pending → confirmed and failed/accepted delivery status accurately. Verify unsubscribe locally and in Resend, with public signup still off. Unsubscribed contacts must never be automatically reactivated; use a different explicitly authorized configured owner address for a later owner send test if needed.

After a successful separate confirmation test, public signup may set `MARKETING_SIGNUP_ENABLED=true` and remove `MARKETING_SIGNUP_OWNER_TEST`; confirmation remains separately enabled. This does not activate campaigns or enroll existing customers.

After verifying the separate key/account APIs, set `MARKETING_PROVIDER_VERIFIED=true`, `MARKETING_FREE_PLAN_CONFIRMED=true`, `MARKETING_OWNER_TEST_ENABLED=true`. Keep `MARKETING_CAMPAIGNS_ENABLED=false`. A confirmed, opted-in configured owner can be selected with **Review owner test** on a saved draft. Process the review, inspect every recipient and exact content/address, then **Confirm owner test** and process the queued send. Check the provider Broadcast ID, results and actual owner mailbox receipt. Test suppression and uncertain-send recovery. Never use `/emails` for a campaign. No promotional campaign is authorized by this release.

Only Danielle's later separate approval may set all of `MARKETING_CAMPAIGNS_ENABLED=true`, `MARKETING_DELIVERY_VERIFIED=true`, `MARKETING_DANIELLE_APPROVED=true`. The address, separate provider/key/allowance checks, tested adapter, final audience review and explicit confirmation still apply. Owner test activation does not substitute for Danielle's campaign activation approval. Remove temporary owner-test gates after testing.

## Preservation and rollback

`PICKUP_REQUESTS_ENABLED=true` remains independent. Requests never change the schedule automatically or depend on email; Studio approval retains the existing deadline/calendar transaction. Keep `REAL_CHECKOUT_ENABLED=false`, `ORDER_EMAIL_ENABLED=false`, Cash at Pickup and return credits off. No production test orders/payments, migration, account deletion, plan upgrade or owner/access-policy change is part of this continuation.

A fresh read-only encrypted backup was restored and verified: `/workspace/roost-email-finish-audit/production-before-email-finish.rrbk`; separate recovery key `/workspace/.roost-release-recovery/roost-email-finish.key`. SHA-256 `6aadfc6bf491e4adfebf8bf0344180dd2988c892562b87b91cd83126574f48c5`; all 18 tables/records and schema matched. Preserve both private artifacts through the owner's secure recovery process. They are workspace artifacts, not an offsite service. Do not remove or replace earlier backups.

Disable only the affected feature gates to roll back availability. Retain all additive ledger history, auth accounts and schema. Restore the prior Worker version only if it supports every account already created; never overwrite current customer data with an earlier database snapshot.

Provider references reviewed: [Contacts](https://resend.com/docs/api-reference/contacts/create-contact), [Segments](https://resend.com/docs/api-reference/segments/create-segment), [Broadcast creation](https://resend.com/docs/api-reference/broadcasts/create-broadcast), [Broadcast sending](https://resend.com/docs/api-reference/broadcasts/send-broadcast), [Usage API](https://resend.com/changelog/account-usage-api), and [official OpenAPI schema](https://github.com/resend/resend-openapi/blob/main/resend.yaml). Documentation establishes supported interfaces, not this account's actual permissions or remaining allowance.

## Final automated validation

- 366 backend/security cases passed on the final source.
- All 295 broad browser cases have passing results: 262 passed initially; 32 WebKit executables were missing and one WebKit library was still being installed during launch. All 33 startup failures passed after installation on an unmodified application. This is not claimed as a clean first-pass broad run.
- Five new owner Marketing workflow cases passed across desktop Chromium/WebKit, iPhone WebKit emulation, Android and tablet using provider-shaped mocks, including review, explicit confirmation, a single test send, provider results and closed campaign gates.
- Eight commerce and ten production-isolation browser cases passed.
- Seven schema guards and both exact-bundle native workerd/D1 smokes passed, with synthetic records, mocked account delivery and zero remote sending.
- The downloaded deployed executable matches the tested SHA-256 `46fe328d55dfd52894ed608e4ce3b057b92d9cabb3118e1884e8dc1877d5871c`. All 18 application-table fingerprints/schema, original binding values/types and Access application/policies match baseline.
- Twenty pre-deployment read-only live page/profile checks passed. Post-deployment results are in the machine-readable receipt. Physical iPhone Safari and actual new-flow mailbox receipt are not claimed.

No live account email, confirmation email, owner Marketing test or promotional campaign was sent. Public email login/signup, all temporary test gates, campaigns, checkout and order emails remain off. Cash at Pickup and return credits were read-only verified off. The production mailing-address field is empty. Current Resend permissions/allowances, the separate Marketing secret, owner mailbox tests and Danielle’s later campaign approval remain external blockers. No additional generic activation permission is needed once the account authentication checks pass.
