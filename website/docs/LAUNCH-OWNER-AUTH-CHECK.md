# Owner authentication handoff — 7 November 2026

Public membership is temporarily paused. Worker 30 closes legacy username and passkey registration on the server, including completion of old registration challenges. Existing-member sign-in and recovery remain available under **Existing member access**. No email-login safety gate was bypassed.

## Required authenticated evidence before testing

In the authenticated Resend account, confirm that `rise-and-roost.com` is verified, `orders@rise-and-roost.com` is an allowed transactional sender, the existing transactional key can send, recipient restrictions permit the existing configured owner address, and the current transactional plan and remaining daily/monthly allowance permit the test. Record the check time and outcomes only. A configured Worker secret, DNS check, or earlier email is insufficient evidence of current usage or delivery. No Marketing configuration is needed for this authentication test.

This runner has only Cloudflare credentials. It has no authenticated Resend account session/management credential, no `api.resend.com` outbound permission, and no owner-mailbox connector. The existing encrypted Worker secret cannot be read back. Owner testing has therefore not been enabled and no live email has been sent.

## Operator setup after evidence is confirmed

Preserve `PRODUCTION_OWNERS` and both encrypted authentication secrets. Temporarily set only `ROOST_AUTH_OWNER_TEST=true` and `ROOST_AUTH_FREE_PLAN_CONFIRMED=true` on the current Worker. Keep `ROOST_PASSWORD_LOGIN_ENABLED=true`; keep `ROOST_EMAIL_LOGIN_ENABLED`, `ROOST_AUTH_EMAIL_ENABLED`, and `ROOST_AUTH_DELIVERY_VERIFIED` false. Keep checkout, order email and all Marketing gates disabled. Do not migrate or delete anything.

## Mailbox owner procedure

Use a private browser window at https://rise-and-roost.com/roost and its developer console. Use only an existing configured production-owner mailbox. Never send passwords, email links, recovery codes or mailbox addresses to chat or save them in console history as literals. The helper below prompts locally, keeps secrets in memory, and returns only status codes. Disable console/network recording and do not export a HAR.

Paste this helper once:

```js
const rr = (() => {
  const workspaceId = '5c6b64c991570cc03df650282e1a5a90bf72283c1de5f542';
  let email, oldPassword, newPassword, verifyToken, resetToken;
  const call = async (action, fields = {}) => {
    const r = await fetch('/api/roost/' + action, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({workspaceId, ...fields})
    });
    await r.json(); // Never print response credentials/recovery codes.
    return r.status;
  };
  const linkToken = kind => {
    const u = new URL(prompt('Paste the private '+kind+' email link here only'));
    if (u.origin !== location.origin || u.pathname !== '/roost') throw Error('Unexpected link');
    const match = new RegExp('^#auth='+kind+'\\.([a-f0-9]{48})$').exec(u.hash);
    if (!match) throw Error('Unexpected link');
    return match[1];
  };
  return {
    register: () => { email = prompt('Existing configured owner email'); oldPassword = prompt('New test password (15+ characters)'); return call('email/register', {name:prompt('Full name'),email,password:oldPassword}); },
    verify: () => { verifyToken = linkToken('verify'); return call('email/verify',{token:verifyToken}); },
    reuseVerify: () => call('email/verify',{token:verifyToken}),
    signedIn: async () => !!(await (await fetch('/api/roost/me?workspace='+workspaceId)).json()).member,
    logout: () => call('logout'),
    loginOld: () => call('email/login',{email,password:oldPassword}),
    forgot: () => call('email/forgot',{email}),
    reset: () => { resetToken = linkToken('reset'); newPassword = prompt('Different new password (15+ characters)'); return call('email/reset',{token:resetToken,password:newPassword,confirmPassword:prompt('Repeat new password')}); },
    reuseReset: () => call('email/reset',{token:resetToken,password:newPassword,confirmPassword:newPassword}),
    loginNew: () => call('email/login',{email,password:newPassword}),
    clear: () => { email=oldPassword=newPassword=verifyToken=resetToken=undefined; }
  };
})();
```

Run commands individually with `await`:

1. `rr.register()` → 200. Confirm actual **Verify Your Email** receipt in inbox/spam. Keep the original registration browser window open: its pending cookie is required. Do not open the email link yet; paste it only into the helper's prompt.
2. `rr.verify()` → 200; `rr.signedIn()` → true. `rr.reuseVerify()` must fail. Open a second tab and reload that second tab: confirm the same signed-in membership persists. Keep the original helper tab open without reloading. Confirm the session cookie has Secure, HttpOnly and SameSite=Strict attributes without copying the value.
3. In the original tab, `rr.logout()` → 200 and `rr.signedIn()` → false; `rr.loginOld()` → 200. `rr.forgot()` → 200. Confirm actual **Reset Your Password** mailbox receipt. Paste that private link into `rr.reset()` → 200, within its 15-minute expiry.
4. `rr.reuseReset()` must fail; `rr.loginOld()` must fail. Confirm the earlier session in the second tab is invalidated. `rr.loginNew()` → 200 and `rr.signedIn()` → true. Confirm actual **Password Changed** receipt. Repeat reload/new-tab persistence in the second tab, then sign out and confirm signed-out state. `rr.clear()` erases helper memory. Retain the test account; do not delete it.

Use the second tab for reload checks to preserve helper memory in the first tab. Failed/expired tests require a fresh requested email, never gate bypasses. Record only action, timestamp, status, and confirmed receipt. Report these nonsecret outcomes to the operator. Registration and delivery acceptance alone are not completion.

## Activation only after all results pass

Set `ROOST_EMAIL_LOGIN_ENABLED=true`, `ROOST_PASSWORD_LOGIN_ENABLED=true`, `ROOST_AUTH_EMAIL_ENABLED=true`, `ROOST_AUTH_DELIVERY_VERIFIED=true`, `ROOST_AUTH_FREE_PLAN_CONFIRMED=true`; set `ROOST_AUTH_OWNER_TEST=false`. Keep `ROOST_SIMPLE_LOGIN_ENABLED=false` and the unrelated `ROOST_DELIVERY_VERIFIED=false`. Preserve all other bindings. Verify full-name/email/password registration, email verification, sign-in, forgot/reset, sessions and sign-out on desktop/mobile. The temporary message then yields to the existing approved email UI. Keep checkout, ordering submissions, order notifications and promotional sending disabled.

Detailed existing operator runbook: [EMAIL-FEATURES-ACTIVATION.md](EMAIL-FEATURES-ACTIVATION.md). No new owner recipient or generic deployment approval is needed.
