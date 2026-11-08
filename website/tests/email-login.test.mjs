import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api } from "../server/service.mjs";
import { sqliteD1 } from "../server/sqlite-adapter.mjs";
import {
  normalizeUsername,
  validatePassword,
  passwordVerifier,
  passwordLoginReady,
} from "../server/password-login.mjs";
import { softwarePasskey } from "./passkey-fixture.mjs";
const now = Date.parse("2026-11-07T12:00:00Z"),
  origin = "https://preview.test",
  password = "a friendly garden phrase",
  nextPassword = "another friendly garden phrase";
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const db = sqliteD1(sql),
    config = {
      customerExperienceEnabled: true,
      contactLoginEnv: {
        ROOST_PASSWORD_LOGIN_ENABLED: "true",
        ROOST_PASSWORD_PEPPER: "synthetic".repeat(8),
      },
    };
  const call = async (c, path, body, at = now, headers = {}) => {
    const r = await api(
      new Request(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...c].map(([k, v]) => k + "=" + v).join("; "),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      db,
      at,
      config,
    );
    for (const item of r.headers.getSetCookie()) {
      const [k, v] = item.split(";")[0].split("=");
      if (item.includes("Max-Age=0")) c.delete(k);
      else c.set(k, v);
    }
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
  const messages = [];
  config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  config.authSend = async (_db, _env, _w, _now, kind, email, secret) => {
    messages.push({ kind, email, secret });
    return true;
  };
  const owner = new Map(),
    client = new Map(),
    stranger = new Map(),
    site = (await call(owner, "/api/workspaces", {})).data;
  config.publicWorkspaceId = site.id;
  const post = (c, path, body = {}, at = now, headers) =>
    call(
      c,
      "/api/roost/" + path,
      { workspaceId: site.id, ...body },
      at,
      headers,
    );
  const me = (c, at = now) =>
    call(c, "/api/roost/me?workspace=" + site.id, undefined, at);
  const join = (c = client, username = "neighbor", at = now) =>
    post(c, "password/register", { username, password, name: "Neighbor" }, at);
  const login = (c = client, username = "neighbor", pwd = password, at = now) =>
    post(c, "password/login", { username, password: pwd }, at);
  const legacy = async (c = client) => {
    const key = softwarePasskey();
    const opts = (
      await post(c, "options", {
        kind: "register",
        profile: { name: "Existing", email: "legacy@example.test" },
      })
    ).data.options;
    const r = await post(c, "verify", { response: key.register(opts, origin) });
    assert.equal(r.status, 200);
    return { key, ...r.data };
  };
  return {
    sql,
    db,
    config,
    site,
    client,
    stranger,
    call,
    post,
    me,
    join,
    login,
    legacy,
    messages,
  };
}
const email = "neighbor@example.test";
const enroll = (h, c = h.client) =>
  h.post(c, "email/register", { name: "Friendly Neighbor", email, password });
const verify = (h, c = h.client, t = h.messages.at(-1).secret, at = now) =>
  h.post(c, "email/verify", { token: t }, at);
const signin = (h, c = h.client, p = password) =>
  h.post(c, "email/login", { email: email.toUpperCase(), password: p });
test("email registration stays pending with no account or session until single-use verification; normal sign-in persists", async () => {
  const h = await fixture();
  assert.equal((await enroll(h)).status, 200);
  assert.equal((await h.me(h.client)).data.member, null);
  assert.equal(
    h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    0,
  );
  const raw = h.messages[0].secret;
  assert.ok(
    !JSON.stringify(
      h.sql.prepare("SELECT * FROM roost_email_tokens").all(),
    ).includes(raw),
  );
  assert.equal((await verify(h)).status, 200);
  assert.equal((await verify(h, h.client, raw)).status, 401);
  assert.equal((await signin(h)).status, 200);
  const m = (await h.me(h.client)).data.member;
  assert.equal(m.verifiedEmail, email);
  assert.equal(m.profile.name, "Friendly Neighbor");
  assert.equal((await h.me(new Map(h.client))).data.member.id, m.id);
  await h.post(h.client, "logout");
  assert.equal((await h.me(h.client)).data.member, null);
  assert.equal((await signin(h, h.client, "wrong")).status, 401);
  const bad = await h.post(h.client, "email/login", {
    email: "unknown@example.test",
    password: "wrong",
  });
  assert.deepEqual(bad.data, (await signin(h, h.client, "wrong")).data);
});
test("password reset is neutral, single use, short lived, revokes sessions and notifies; old passwords stop working", async () => {
  const h = await fixture();
  await enroll(h);
  await verify(h);
  await signin(h);
  await signin(h, h.stranger);
  const a = await h.post(new Map(), "email/forgot", { email }),
    b = await h.post(new Map(), "email/forgot", {
      email: "absent@example.test",
    });
  assert.deepEqual(a.data, b.data);
  const reset = h.messages.at(-1).secret;
  const expired = await h.post(
    new Map(),
    "email/reset",
    { token: reset, password: nextPassword, confirmPassword: nextPassword },
    now + 900001,
  );
  assert.equal(expired.status, 401);
  const r = await h.post(new Map(), "email/reset", {
    token: reset,
    password: nextPassword,
    confirmPassword: nextPassword,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await h.me(h.client)).data.member, null);
  assert.equal((await h.me(h.stranger)).data.member, null);
  assert.equal(h.messages.at(-1).kind, "password");
  assert.equal(
    (
      await h.post(new Map(), "email/reset", {
        token: reset,
        password,
        confirmPassword: password,
      })
    ).status,
    401,
  );
  assert.equal((await signin(h, h.client, password)).status, 401);
  assert.equal((await signin(h, h.client, nextPassword)).status, 200);
});
test("legacy username account links only after authentication and mailbox proof; exact account data survives", async () => {
  const h = await fixture();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  const joined = await h.join();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  const before = h.sql.prepare("SELECT * FROM roost_members").all();
  const ledger = h.sql.prepare("SELECT ledger_json FROM workspaces").get();
  assert.equal(
    (
      await h.post(h.stranger, "email/link", {
        email,
        currentPassword: password,
      })
    ).status,
    401,
  );
  assert.equal(
    (await h.post(h.client, "email/link", { email, currentPassword: "wrong" }))
      .status,
    401,
  );
  assert.equal(
    (await h.post(h.client, "email/link", { email, currentPassword: password }))
      .status,
    200,
  );
  const t = h.messages.at(-1).secret;
  assert.equal((await verify(h, h.stranger, t)).status, 401);
  assert.equal((await verify(h, h.client, t)).status, 200);
  assert.deepEqual(h.sql.prepare("SELECT * FROM roost_members").all(), before);
  assert.deepEqual(
    h.sql.prepare("SELECT ledger_json FROM workspaces").get(),
    ledger,
  );
  assert.equal((await signin(h)).status, 200);
  assert.equal((await h.me(h.client)).data.member.id, before[0].id);
  await h.post(h.client, "logout");
  assert.equal((await h.login()).status, 200);
  assert.ok(joined.data.recoveryKey);
});
test("passkey-only member can verify email and set password; passkeys and recovery remain intact", async () => {
  const h = await fixture();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  const original = await h.legacy();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  const creds = h.sql.prepare("SELECT * FROM roost_credentials").all(),
    before = h.sql.prepare("SELECT * FROM roost_members").all();
  assert.equal(
    (await h.post(h.client, "email/link", { email, password })).status,
    200,
  );
  assert.equal((await verify(h)).status, 200);
  assert.equal((await signin(h)).status, 200);
  assert.equal((await h.me(h.client)).data.member.id, original.member.id);
  assert.deepEqual(
    h.sql.prepare("SELECT * FROM roost_credentials").all(),
    creds,
  );
  assert.deepEqual(h.sql.prepare("SELECT * FROM roost_members").all(), before);
});
test("conflicting verified and profile emails never merge; duplicate verification races create one identity", async () => {
  const h = await fixture();
  await enroll(h);
  const t = h.messages[0].secret;
  await enroll(h, h.stranger);
  const results = await Promise.all([
    verify(h, h.client, t),
    verify(h, h.stranger, h.messages.at(-1).secret),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(
    h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    1,
  );
  await enroll(h);
  assert.equal(
    h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    1,
  );
  const x = await fixture();
  x.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  await x.legacy();
  x.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  await x.post(new Map(), "email/register", {
    name: "Imposter",
    email: "legacy@example.test",
    password,
  });
  assert.equal(x.messages.length, 0);
  assert.equal(
    x.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    1,
  );
});
test("disabled or failed delivery never creates a member or usable token; sending and sign-in rate limits apply", async () => {
  const h = await fixture();
  h.config.authSend = async () => false;
  const r = await enroll(h);
  assert.match(r.data.message, /temporarily unavailable/);
  assert.equal(
    h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    0,
  );
  assert.equal(
    h.sql
      .prepare("SELECT COUNT(*) n FROM roost_email_tokens WHERE expires>" + now)
      .get().n,
    0,
  );
  for (let i = 0; i < 2; i++) await enroll(h);
  assert.equal((await enroll(h)).status, 429);
  const x = await fixture();
  x.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  assert.equal((await enroll(x)).status, 503);
});
test("email changes require password and new mailbox proof, revoke sessions, notify old address", async () => {
  const h = await fixture();
  await enroll(h);
  await verify(h);
  await signin(h);
  await signin(h, h.stranger);
  await h.post(h.client, "email/link", {
    email: "new@example.test",
    currentPassword: password,
  });
  assert.equal((await h.me(h.client)).data.member.verifiedEmail, email);
  assert.equal((await verify(h)).status, 200);
  assert.equal((await h.me(h.stranger)).data.member, null);
  assert.equal(h.messages.at(-1).kind, "changed");
  assert.equal((await signin(h)).status, 401);
  assert.equal(
    (
      await h.post(h.client, "email/login", {
        email: "new@example.test",
        password,
      })
    ).status,
    200,
  );
});
test("email mode closes legacy new-account bypasses but preserves existing authentication", async () => {
  const h = await fixture();
  assert.equal((await h.join()).status, 409);
  assert.equal(
    (
      await h.post(h.client, "options", {
        kind: "register",
        profile: { name: "Bypass" },
      })
    ).status,
    409,
  );
  const r = await h.post(
    h.client,
    "email/register",
    { name: "Neighbor", email, password },
    now,
    { Origin: "https://evil.test" },
  );
  assert.equal(r.status, 403);
});

test("verification expiry, resend with password proof, transaction rollback and concurrent resets fail safely", async () => {
  const h = await fixture();
  await enroll(h);
  const old = h.messages.at(-1).secret;
  assert.equal((await verify(h, h.client, old, now + 900001)).status, 401);
  assert.equal(
    (await h.post(h.client, "email/resend", { email, password: "wrong" }))
      .status,
    200,
  );
  assert.equal(h.messages.length, 1);
  assert.equal(
    (await h.post(h.client, "email/resend", { email, password })).status,
    200,
  );
  const fresh = h.messages.at(-1).secret;
  h.sql.exec(
    "CREATE TRIGGER deny_identity BEFORE INSERT ON roost_email_identities BEGIN SELECT RAISE(ABORT,'synthetic'); END",
  );
  assert.equal((await verify(h, h.client, fresh)).status, 500);
  assert.equal(
    h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n,
    0,
  );
  h.sql.exec("DROP TRIGGER deny_identity");
  assert.equal((await verify(h, h.client, fresh)).status, 200);
  assert.equal((await verify(h, h.client, old)).status, 401);
  // Use a separate rate-limit window after registration/resend.
  await h.post(h.client, "email/forgot", { email }, now + 3600000);
  const t = h.messages.at(-1).secret;
  const reset = () =>
    h.post(
      new Map(),
      "email/reset",
      { token: t, password: nextPassword, confirmPassword: nextPassword },
      now + 3600000,
    );
  const results = await Promise.all([reset(), reset()]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(
    h.sql.prepare("SELECT revision FROM roost_passwords").get().revision,
    2,
  );
});
test("failed delivery keeps a retryable pending registration and old link cannot authenticate", async () => {
  const h = await fixture();
  h.config.authSend = async (_db, _env, _w, _now, kind, email, secret) => {
    h.messages.push({ kind, email, secret });
    return false;
  };
  await enroll(h);
  assert.equal((await verify(h)).status, 401);
  h.config.authSend = async (_db, _env, _w, _now, kind, email, secret) => {
    h.messages.push({ kind, email, secret });
    return true;
  };
  assert.equal(
    (await h.post(h.client, "email/resend", { email, password })).status,
    200,
  );
  assert.equal((await verify(h)).status, 200);
});
test("email linking cannot finish after logout or password change and migration is idempotent", async () => {
  const h = await fixture();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  await h.join();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  await h.post(h.client, "email/link", { email, currentPassword: password });
  const t = h.messages.at(-1).secret;
  await h.post(h.client, "password/change", {
    currentPassword: password,
    password: nextPassword,
  });
  assert.notEqual((await verify(h, h.client, t)).status, 200);
  const before = h.sql.prepare("SELECT * FROM roost_members").all();
  const migration = readFileSync(
    new URL("../migrations/0012-roost-email-login.sql", import.meta.url),
    "utf8",
  );
  h.sql.exec(migration);
  h.sql.exec(migration);
  assert.deepEqual(h.sql.prepare("SELECT * FROM roost_members").all(), before);
});

test("mailbox verification works in a fresh browser without signing either browser in, and replay is rejected", async () => {
  const h = await fixture();
  await enroll(h);
  assert.equal(h.messages.length, 1);
  const t = h.messages.at(-1).secret;
  const results = await Promise.all([verify(h, h.stranger, t), verify(h, new Map(), t)]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n, 1);
  assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM roost_sessions").get().n, 0);
  assert.equal((await h.me(h.client)).data.member, null);
  assert.equal((await h.me(h.stranger)).data.member, null);
  assert.match((await verify(h, new Map(), t)).data.error, /already used successfully/);
  assert.equal(h.messages.length, 1);
  assert.equal((await signin(h, h.stranger)).status, 200);
});

test("invalid and expired links give distinct errors without email or authentication side effects", async () => {
 const h = await fixture(); await enroll(h);
 assert.match((await verify(h, h.stranger, '0'.repeat(48))).data.error, /invalid/);
 assert.match((await verify(h, h.stranger, h.messages[0].secret, now + 900001)).data.error, /expired/);
 assert.equal(h.messages.length, 1);
 assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n, 0);
});

test("migrated passkey-only member retains original recovery code through email-based legacy recovery", async () => {
  const h = await fixture();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  const original = await h.legacy();
  h.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  await h.post(h.client, "email/link", { email, password });
  await verify(h);
  const credentials = h.sql.prepare("SELECT * FROM roost_credentials").all();
  const recovered = await h.post(h.stranger, "email/recover", {
    email,
    recoveryKey: original.recoveryKey,
    password: nextPassword,
    confirmPassword: nextPassword,
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
  assert.equal((await h.me(h.stranger)).data.member.id, original.member.id);
  assert.notEqual(recovered.data.recoveryKey, original.recoveryKey);
  assert.deepEqual(
    h.sql.prepare("SELECT * FROM roost_credentials").all(),
    credentials,
  );
  assert.equal(
    (
      await h.post(new Map(), "email/recover", {
        email,
        recoveryKey: original.recoveryKey,
        password,
        confirmPassword: password,
      })
    ).status,
    401,
  );
  await h.post(h.stranger, "logout");
  assert.equal((await signin(h, h.stranger, nextPassword)).status, 200);
});

test('corrected production password policy permits eight characters and rejects common passwords', () => {
 assert.equal(validatePassword('Z7!mQ2xR'), 'Z7!mQ2xR');
 assert.throws(() => validatePassword('password'));
 assert.throws(() => validatePassword('12345678'));
 assert.throws(() => validatePassword('seven77'));
});
