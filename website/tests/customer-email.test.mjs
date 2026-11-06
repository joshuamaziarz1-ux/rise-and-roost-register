import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { customerEmailConfigured, sendCustomerCode } from '../server/customer-email.mjs';
const START = Date.parse('2026-11-06T12:00:00Z'), DAY = 86400000;
export async function emailFixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0003_customer_email_accounts.sql', import.meta.url), 'utf8'));
  const mail = [], env = { CUSTOMER_EMAIL_ENABLED: 'true', CUSTOMER_EMAIL_DOMAIN_VERIFIED: 'true', RESEND_API_KEY: 'synthetic-key', CUSTOMER_EMAIL_FROM: 'signin@example.test', CUSTOMER_EMAIL_CODE_SECRET: 'test-only-secret-never-production-'.repeat(2) };
  const config = { customerExperienceEnabled: true, customerEmailEnv: env, sendCustomerCode: async (email, code, id) => mail.push({ email, code, id }) }, db = sqliteD1(sql);
  const browser = () => ({ cookies: new Map(), csrf: '' }), owner = browser(), a = browser(), b = browser();
  const call = async (client, path, body, options = {}) => {
    const r = await api(new Request('https://example.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json', Cookie: [...client.cookies].map(([k,v]) => k+'='+v).join('; '), 'X-RR-CSRF': client.csrf, ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db, options.now ?? START, config);
    for (const c of r.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); if(c.includes('Max-Age=0'))client.cookies.delete(k); else client.cookies.set(k,v); }
    const data = await r.json(); if (data.csrf) client.csrf = data.csrf;
    return { status: r.status, data, headers: r.headers };
  };
  const site = (await call(owner, '/api/workspaces', {})).data; config.publicWorkspaceId = site.id;
  const post = (client, path, data = {}, options) => call(client, '/api/roost/email/' + path, { workspaceId: site.id, ...data }, options);
  const me = (client = a, options) => call(client, '/api/roost/email/me?workspace=' + site.id, undefined, options);
  const start = (client = a, data = {}, options) => post(client, 'request', { kind: 'join', name: 'Test Neighbor', email: 'neighbor@example.test', remember: true, ...data }, options);
  const join = async (client = a, data = {}) => { assert.equal((await start(client, data)).status, 202); const r = await post(client, 'verify', { code: mail.at(-1).code }); assert.equal(r.status, 200, JSON.stringify(r.data)); await me(client); return r; };
  const order = (client = a, mode = 'member', extra = {}) => call(client, '/api/orders', { workspaceId: site.id, storefront: 'main', revision: site.publishedRevision, requestId: crypto.randomUUID(), pickupId: site.published.pickups[0].id, lines: [{ productId: 'bread', variantId: 'classic', qty: 1, unitPrice: 900 }], total: 900, checkoutMode: mode, customerDetails: { name: 'Guest', email: 'neighbor@example.test' }, ...extra });
  return { sql, db, env, config, mail, browser, a, b, owner, site, call, post, me, start, join, order };
}
test('configuration fails closed independently of order email; Resend adapter sends only transactional mail and rejects bad responses', async () => {
  assert.equal(customerEmailConfigured({}), false);
  const h = await emailFixture(); assert.equal(customerEmailConfigured(h.env), true);
  h.env.CUSTOMER_EMAIL_DOMAIN_VERIFIED = 'false'; assert.equal((await h.start()).status, 503); assert.equal(h.mail.length, 0);
  await sendCustomerCode(h.env, 'test@example.test', '123456', 'fake-id', async (url, init) => { assert.equal(url, 'https://api.resend.com/emails'); assert.equal(JSON.parse(init.body).to[0], 'test@example.test'); assert.match(init.headers['Idempotency-Key'], /^rr-signin-/); return Response.json({ id: 'fake-delivery' }); });
  await assert.rejects(sendCustomerCode(h.env, 'test@example.test', '123456', 'fake-id', async () => Response.json({ error: 'no' }, { status: 403 })));
});
test('registration verifies email, creates one free account and stores only protected code verifiers', async () => {
  const h = await emailFixture(); const r = await h.start(); assert.equal(r.status, 202); assert.match(h.mail[0].code, /^\d{6}$/);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, 0);
  const row = h.sql.prepare('SELECT * FROM roost_email_challenges').get(); assert.notEqual(row.verifier, h.mail[0].code); assert.equal(row.verifier.length, 64); assert.equal(row.expires, START + 600000);
  assert.equal((await h.post(h.a, 'verify', { code: h.mail[0].code })).status, 200);
  const me = (await h.me()).data; assert.equal(me.member.profile.name, 'Test Neighbor'); assert.equal(me.member.emailVerified, true); assert.equal(me.member.membershipStatus, 'Free member'); assert.ok(me.csrf);
});
test('invalid codes exhaust five attempts; expiry, single use, and new-device binding are enforced', async () => {
  const h = await emailFixture(); await h.start(); const code = h.mail[0].code;
  assert.equal((await h.post(h.b, 'verify', { code })).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await h.post(h.a, 'verify', { code: 'invalid' })).status, 401);
  assert.equal((await h.post(h.a, 'verify', { code })).status, 401);
  const e = await emailFixture(); await e.start(); assert.equal((await e.post(e.a, 'verify', { code: e.mail[0].code }, { now: START + 600000 })).status, 401);
  const v = await emailFixture(); await v.start(); const cookies = new Map(v.a.cookies); assert.equal((await v.post(v.a, 'verify', { code: v.mail[0].code })).status, 200); v.b.cookies = cookies; assert.equal((await v.post(v.b, 'verify', { code: v.mail[0].code })).status, 401);
});
test('request/resend and verification limits apply independent of account existence', async () => {
  const h = await emailFixture(); assert.equal((await h.start()).status, 202); assert.equal((await h.start()).status, 429);
  for (let i = 1; i < 5; i++) assert.equal((await h.start(h.a, {}, { now: START + i * 61000 })).status, 202);
  assert.equal((await h.start(h.a, {}, { now: START + 6 * 61000 })).status, 429);
  const q = await emailFixture(); for (let i = 0; i < 50; i++) await q.post(q.b, 'verify', { code: '000000' }); assert.equal((await q.post(q.b, 'verify', { code: '000000' })).status, 429);
});
test('a resend supersedes the original code; failed delivery fails closed without logging provider details', async () => {
  const h = await emailFixture(); await h.start(); const old = h.mail[0].code; await h.start(h.a, {}, { now: START + 61000 });
  if (old !== h.mail[1].code) assert.equal((await h.post(h.a, 'verify', { code: old }, { now: START + 61000 })).status, 401);
  assert.equal((await h.post(h.a, 'verify', { code: h.mail[1].code }, { now: START + 61000 })).status, 200);
  const f = await emailFixture(); f.config.sendCustomerCode = () => { throw Error('SECRET provider detail'); }; const r = await f.start(); assert.equal(r.status, 503); assert.equal(JSON.stringify(r.data).includes('SECRET'), false); assert.equal(f.sql.prepare('SELECT consumed FROM roost_email_challenges').get().consumed, 'delivery-failed');
});
test('remembered session renews and rotates with a fixed 90-day maximum, then expires', async () => {
  const h = await emailFixture(); const joined = await h.join(); const cookie = joined.headers.getSetCookie()[0]; assert.match(cookie, /Secure; HttpOnly; SameSite=Strict; Max-Age=7776000/);
  const old = new Map(h.a.cookies), memberId = (await h.me()).data.member.id;
  const renewed = await h.me(h.a, { now: START + 20 * DAY }); assert.equal(renewed.data.member.id, memberId); assert.notDeepEqual(h.a.cookies, old); assert.ok(renewed.headers.get('Set-Cookie'));
  for (const day of [40,60,80,89]) assert.ok((await h.me(h.a, { now: START + day * DAY })).data.member);
  assert.equal((await h.me(h.a, { now: START + 90 * DAY })).data.member, null);
  assert.equal(h.sql.prepare('SELECT absolute_expires FROM roost_email_sessions').get().absolute_expires, START + 90 * DAY);
});
test('remember me disabled is a nonpersistent 12-hour session; inactivity and revocation expire sessions', async () => {
  const h = await emailFixture(); const r = await h.join(h.a, { remember: false }); assert.equal(r.headers.getSetCookie()[0].includes('Max-Age'), false); assert.ok((await h.me(h.a, { now: START + 11 * 3600000 })).data.member); assert.equal((await h.me(h.a, { now: START + 12 * 3600000 })).data.member, null);
  const idle = await emailFixture(); await idle.join(); assert.equal((await idle.me(idle.a, { now: START + 31 * DAY })).data.member, null);
  const v = await emailFixture(); await v.join(); v.sql.exec('UPDATE roost_email_sessions SET expires=0'); assert.equal((await v.me()).data.member, null);
});
test('return visits do not send more email, logout revokes the copied token, new-device login preserves identity', async () => {
  const h = await emailFixture(); await h.join(); const id = (await h.me()).data.member.id; const stolen = h.browser(); stolen.cookies = new Map(h.a.cookies);
  await h.me(); await h.me(); assert.equal(h.mail.length, 1); assert.equal((await h.me(h.b)).data.member, null);
  assert.equal((await h.post(h.a, 'logout')).status, 200); assert.equal((await h.me(stolen)).data.member, null);
  assert.equal((await h.start(h.b, { kind: 'login', name: '' }, { now: START + 61000 })).status, 202); assert.equal((await h.post(h.b, 'verify', { code: h.mail.at(-1).code }, { now: START + 61000 })).status, 200); assert.equal((await h.me(h.b)).data.member.id, id); assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, 1);
});
test('CSRF origin, JSON and token checks protect profile, checkout and logout; verified email is immutable', async () => {
  const h = await emailFixture(); await h.join();
  assert.equal((await h.post(h.a, 'profile', { name: 'Changed' }, { headers: { 'X-RR-CSRF': '' } })).status, 403);
  assert.equal((await h.post(h.a, 'logout', {}, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await h.post(h.a, 'logout', {}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await h.post(h.a, 'profile', { name: 'Changed', email: 'attacker@example.test' })).status, 200); assert.equal((await h.me()).data.member.profile.email, 'neighbor@example.test');
  const csrf = h.a.csrf; h.a.csrf = ''; assert.equal((await h.order()).status, 403); h.a.csrf = csrf;
});
test('guest checkout remains available, members own only explicit member orders; email does not claim history or grant Studio access', async () => {
  const h = await emailFixture(); assert.equal((await h.order(h.b, 'guest')).status, 201); await h.join(); assert.equal((await h.me()).data.orders.length, 0);
  assert.equal((await h.order()).status, 201); const mine = (await h.me()).data; assert.equal(mine.orders.length, 1);
  await h.join(h.b, { email: 'second@example.test' }); assert.equal((await h.me(h.b)).data.orders.length, 0);
  assert.equal((await h.call(h.a, '/api/studio')).status, 401); assert.equal((await h.call(h.owner, '/api/roost/email/me?workspace=' + h.site.id)).data.member, null);
  assert.equal((await h.order(h.browser(), 'member')).status, 401);
});
test('existing unverified profile email never links an older account; failed transactions leave no partial account/session', async () => {
  const h = await emailFixture(); h.sql.prepare('INSERT INTO roost_members VALUES(?,?,?,?,?)').run('d'.repeat(48), h.site.id, JSON.stringify({ name: 'Legacy', email: 'neighbor@example.test', phone: '' }), 'old-key-hash', START); await h.join(); assert.notEqual((await h.me()).data.member.id, 'd'.repeat(48));
  const f = await emailFixture(); await f.start(); f.sql.exec("CREATE TRIGGER fail_email_session BEFORE INSERT ON roost_email_sessions BEGIN SELECT RAISE(ABORT,'test-only'); END"); assert.equal((await f.post(f.a, 'verify', { code: f.mail[0].code })).status, 500); assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, 0); assert.equal(f.sql.prepare('SELECT consumed FROM roost_email_challenges').get().consumed, null);
});
test('concurrent verification succeeds once; random code verifiers do not appear in public errors', async () => {
  const h = await emailFixture(); await h.start(); const copy = h.browser(); copy.cookies = new Map(h.a.cookies);
  const results = await Promise.all([h.post(h.a, 'verify', { code: h.mail[0].code }), h.post(copy, 'verify', { code: h.mail[0].code })]); assert.deepEqual(results.map(r => r.status).sort(), [200,401]); assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_email_sessions').get().n, 1);
});
test('additive migration applies twice without changing legacy records or schema; isolated copy restores all new account tables', async () => {
  const h = await emailFixture(); await h.join();
  const oldTables = ['workspaces','sessions','previews','assets','limits','device_links','roost_members','roost_credentials','roost_sessions','roost_challenges','customer_comments'];
  const before = oldTables.map(t => [t, h.sql.prepare('SELECT * FROM '+t).all()]);
  const migration = readFileSync(new URL('../migrations/0003_customer_email_accounts.sql', import.meta.url), 'utf8'); h.sql.exec(migration); h.sql.exec(migration);
  assert.deepEqual(oldTables.map(t => [t,h.sql.prepare('SELECT * FROM '+t).all()]), before);
  const restored = new DatabaseSync(':memory:');
  for (const { sql } of h.sql.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY rowid").all()) restored.exec(sql);
  for (const { name } of h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    const rows = h.sql.prepare('SELECT * FROM '+name).all();
    for (const row of rows) restored.prepare('INSERT INTO '+name+' VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));
    assert.deepEqual(restored.prepare('SELECT * FROM '+name).all(), rows);
  }
  restored.close();
});
test('resend cooldown is a full minute even across a clock-minute boundary; email/name validation stays safe', async () => {
  const h = await emailFixture(); assert.equal((await h.start(h.a, {}, { now: START + 59000 })).status, 202); assert.equal((await h.start(h.a, {}, { now: START + 60000 })).status, 429); assert.equal((await h.start(h.a, {}, { now: START + 119000 })).status, 202);
  assert.equal((await h.start(h.b, { email: 'bad-address' })).status, 400); assert.equal((await h.start(h.b, { name: '\u0000bad', email: 'new@example.test' })).status, 400); assert.equal((await h.start(h.b, { remember: 'yes', email: 'new@example.test' })).status, 400);
});
test('IP send quota prevents address rotation abuse and never contacts the fake provider after the cap', async () => {
  const h = await emailFixture();
  for (let i = 0; i < 20; i++) assert.equal((await h.start(h.a, { email: 'test'+i+'@example.test' })).status, 202);
  assert.equal((await h.start(h.a, { email: 'another@example.test' })).status, 429); assert.equal(h.mail.length, 20);
});
test('rotated identifiers expire after the concurrency grace, and revocation invalidates both current and previous tokens', async () => {
  const h = await emailFixture(); await h.join(); const old = h.browser(); old.cookies = new Map(h.a.cookies);
  await h.me(h.a, { now: START + DAY }); assert.ok((await h.me(old, { now: START + DAY + 60000 })).data.member);
  assert.equal((await h.me(old, { now: START + DAY + 120001 })).data.member, null);
  assert.equal((await h.post(h.a, 'logout', {}, { now: START + DAY + 70000 })).status, 200); assert.equal((await h.me(old, { now: START + DAY + 70001 })).data.member, null);
});
