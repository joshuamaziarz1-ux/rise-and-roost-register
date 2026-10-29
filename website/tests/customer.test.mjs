import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { softwarePasskey } from './passkey-fixture.mjs';

const now = Date.parse('2026-10-29T12:00:00Z');
async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), config = { customerExperienceEnabled: true, publicWorkspaceId: '' }, origin = 'https://preview.test';
  const browser = () => new Map();
  const call = async (client, path, body, options = {}) => {
    const r = await api(new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...client].map(([k,v]) => k+'='+v).join('; '), ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db, options.now ?? now, config);
    for (const c of r.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); if(c.includes('Max-Age=0'))client.delete(k); else client.set(k,v); }
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
  const owner = browser(), guest = browser(), member = browser(), stranger = browser();
  const site = (await call(owner, '/api/workspaces', {})).data; config.publicWorkspaceId = site.id;
  const post = (client, path, body = {}, options) => call(client, path, { workspaceId: site.id, ...body }, options);
  const get = (client, path = '/api/roost/me', options) => call(client, path+'?workspace='+site.id, undefined, options);
  const register = async (client = member, key = softwarePasskey()) => {
    const options = (await post(client, '/api/roost/options', { kind: 'register', profile: { name: 'Test Neighbor', email: 'neighbor@example.test', phone: '555-0101' } })).data.options;
    const result = await post(client, '/api/roost/verify', { response: key.register(options, origin) });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { key, ...result.data };
  };
  const order = (client = guest, extra = {}) => post(client, '/api/orders', { storefront: 'main', revision: site.publishedRevision, requestId: crypto.randomUUID(), pickupId: site.published.pickups[0].id, lines: [{ productId: 'bread', variantId: 'classic', qty: 1, unitPrice: 900 }], total: 900, checkoutMode: 'guest', customerDetails: { name: 'Guest Neighbor' }, ...extra });
  return { sql, db, config, call, post, get, register, browser, owner, guest, member, stranger, site, order, origin };
}
test('guest checkout needs no account; names stay private and tracking/payment reporting remain intact', async () => {
  const h = await fixture(), before = h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n;
  const r = await h.order(); assert.equal(r.status, 201); assert.equal(r.data.paymentStatus, 'not_collected');
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, before);
  assert.equal((await h.get(h.guest)).data.member, null);
  assert.equal(JSON.stringify(r.data).includes('Guest Neighbor'), false);
  const tracking = new URL(r.data.trackingPath, h.origin), key = new URLSearchParams(tracking.hash.slice(1)).get('access');
  const reported = await h.call(h.guest, tracking.pathname.replace('/orders/', '/api/order-tracking/')+'/report', {}, { headers: { Authorization: 'Bearer '+key } });
  assert.equal(reported.data.paymentStatus, 'reported'); assert.equal(reported.data.status, 'pending'); assert.equal(reported.data.paidReceipt, undefined);
});
test('real WebAuthn enrollment and signed authentication create remembered HttpOnly sessions, independently of Studio', async () => {
  const h = await fixture(), joined = await h.register(); assert.ok(joined.recoveryKey);
  const me = await h.get(h.member); assert.equal(me.data.member.profile.name, 'Test Neighbor');
  assert.equal((await h.call(h.member, '/api/studio')).status, 401);
  assert.equal((await h.post(h.member, '/api/publish', { revision: 1 })).status, 401);
  assert.equal((await h.get(h.owner)).data.member, null);
  await h.post(h.member, '/api/roost/logout'); assert.equal((await h.get(h.member)).data.member, null);
  const options = (await h.post(h.member, '/api/roost/options', { kind: 'login' })).data.options;
  const r = await h.post(h.member, '/api/roost/verify', { response: joined.key.login(options, h.origin) }); assert.equal(r.status, 200);
  assert.match(r.headers.getSetCookie()[0], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000; Secure/);
  assert.equal((await h.get(h.member, undefined, { now: now + 29*86400000 })).data.member.id, joined.member.id);
  assert.equal((await h.get(h.member, undefined, { now: now + 31*86400000 })).data.member, null);
});
test('member checkout stores only the authenticated membership; another member cannot read orders or customer details', async () => {
  const h = await fixture(), a = await h.register(); await h.register(h.stranger);
  const r = await h.order(h.member, { checkoutMode: 'member', memberId: 'forged-other-member' }); assert.equal(r.status, 201);
  const me = (await h.get(h.member)).data; assert.equal(me.orders.length, 1); assert.equal(me.orders[0].id, r.data.id);
  assert.equal((await h.get(h.stranger)).data.orders.length, 0);
  assert.equal((await h.order(h.guest, { checkoutMode: 'member' })).status, 401);
  assert.equal((await h.get(h.guest)).data.member, null);
  const ledger = JSON.parse(h.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(h.site.id).ledger_json); assert.equal(ledger.orders[0].customer.memberId, a.member.id);
});
test('challenge verification rejects wrong origin, wrong signature, lack of user verification, replay, expiry and cross-browser use', async () => {
  const h = await fixture(), joined = await h.register(); await h.post(h.member, '/api/roost/logout');
  const begin = async () => (await h.post(h.member, '/api/roost/options', { kind: 'login' })).data.options;
  let options = await begin();
  assert.equal((await h.post(h.stranger, '/api/roost/verify', { response: joined.key.login(options, h.origin) })).status, 401);
  assert.equal((await h.post(h.member, '/api/roost/verify', { response: joined.key.login(options, 'https://evil.test') })).status, 401);
  assert.equal((await h.post(h.member, '/api/roost/verify', { response: joined.key.login(options, h.origin, { verified: false }) })).status, 401);
  const forged = joined.key.login(options, h.origin); forged.response.signature = 'AAAA';
  assert.equal((await h.post(h.member, '/api/roost/verify', { response: forged })).status, 401);
  const response = joined.key.login(options, h.origin), oldCookies = new Map(h.member);
  assert.equal((await h.post(h.member, '/api/roost/verify', { response })).status, 200);
  assert.equal((await h.post(oldCookies, '/api/roost/verify', { response })).status, 401);
  options = await begin(); assert.equal((await h.post(h.member, '/api/roost/verify', { response: joined.key.login(options, h.origin) }, { now: now+301000 })).status, 401);
});
test('registration requires user verification and account creation/session creation roll back together on DB failure', async () => {
  const h = await fixture(), key = softwarePasskey();
  const options = (await h.post(h.member, '/api/roost/options', { kind: 'register', profile: { name: 'New Neighbor' } })).data.options;
  assert.equal((await h.post(h.member, '/api/roost/verify', { response: key.register(options, h.origin, { verified: false }) })).status, 401);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, 0);
  h.sql.exec("CREATE TRIGGER fail_member_session BEFORE INSERT ON roost_sessions BEGIN SELECT RAISE(ABORT,'test-only failure'); END");
  assert.equal((await h.post(h.member, '/api/roost/verify', { response: key.register(options, h.origin) })).status, 500);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_members').get().n, 0);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM roost_challenges WHERE claimed_by IS NOT NULL').get().n, 0);
});
test('guest order claiming requires its private tracking secret and cannot transfer another member’s order', async () => {
  const h = await fixture(); await h.register(); await h.register(h.stranger);
  const guest = (await h.order()).data;
  assert.equal((await h.post(h.member, '/api/roost/claim-order', { link: guest.trackingPath.split('#')[0] })).status, 400);
  assert.equal((await h.post(h.member, '/api/roost/claim-order', { link: guest.trackingPath })).status, 200);
  assert.equal((await h.get(h.member)).data.orders.length, 1);
  assert.equal((await h.post(h.stranger, '/api/roost/claim-order', { link: guest.trackingPath })).status, 409);
});
test('one-time recovery keys are hashed, rotate after use, revoke old sessions, and never match email alone', async () => {
  const h = await fixture(), joined = await h.register(); const oldBrowser = new Map(h.member);
  const row = h.sql.prepare('SELECT * FROM roost_members').get(); assert.notEqual(row.recovery_hash, joined.recoveryKey);
  assert.equal((await h.post(h.stranger, '/api/roost/recover', { recoveryKey: 'neighbor@example.test' })).status, 401);
  const r = await h.post(h.stranger, '/api/roost/recover', { recoveryKey: joined.recoveryKey }); assert.equal(r.status, 200); assert.notEqual(r.data.recoveryKey, joined.recoveryKey);
  assert.equal((await h.get(oldBrowser)).data.member, null);
  assert.equal((await h.post(h.member, '/api/roost/recover', { recoveryKey: joined.recoveryKey })).status, 401);
});
test('comments remain private until exact-workspace owner approval; hiding preserves text and rejects stale actions', async () => {
  const h = await fixture(), body = '<img src=x onerror=alert(1)> A lovely loaf.';
  const submitted = await h.post(h.guest, '/api/comments', { name: 'Neighbor', body, publicConsent: true }); assert.equal(submitted.status, 201);
  assert.equal((await h.get(h.guest, '/api/comments')).data.comments.length, 0);
  assert.equal((await h.call(h.guest, '/api/studio-comments')).status, 401);
  let c = (await h.call(h.owner, '/api/studio-comments')).data.comments[0];
  assert.equal((await h.post(h.member, '/api/studio-comments', { id: c.id, version: c.version, status: 'approved' })).status, 401);
  assert.equal((await h.post(h.owner, '/api/studio-comments', { id: c.id, version: c.version, status: 'approved' })).status, 200);
  const publicComment = (await h.get(h.guest, '/api/comments')).data.comments[0]; assert.equal(publicComment.body, body); assert.equal(publicComment.id, undefined);
  assert.equal((await h.post(h.owner, '/api/studio-comments', { id: c.id, version: c.version, status: 'hidden' })).status, 409);
  c = (await h.call(h.owner, '/api/studio-comments')).data.comments[0];
  await h.post(h.owner, '/api/studio-comments', { id: c.id, version: c.version, status: 'hidden' });
  assert.equal((await h.get(h.guest, '/api/comments')).data.comments.length, 0);
  assert.equal(h.sql.prepare('SELECT body FROM customer_comments').get().body, body);
});
test('disabled experience hides all new APIs and CSRF cannot create memberships or comments', async () => {
  const h = await fixture();
  assert.equal((await h.post(h.guest, '/api/comments', { name: 'Test', body: 'comment', publicConsent: true }, { headers: { Origin: 'https://evil.test' } })).status, 403);
  h.config.customerExperienceEnabled = false;
  assert.equal((await h.get(h.member)).status, 404);
  assert.equal((await h.post(h.guest, '/api/comments', { name: 'Test', body: 'comment', publicConsent: true })).status, 404);
});
test('saved details validate input, persist across requests, and cannot be changed by a guest', async () => {
  const h = await fixture(); await h.register();
  const profile = { name: 'Updated Neighbor', email: 'updated@example.test', phone: '+1 (555) 010-0101' };
  assert.equal((await h.post(h.member, '/api/roost/profile', { profile })).status, 200);
  assert.deepEqual((await h.get(h.member)).data.member.profile, profile);
  assert.equal((await h.post(h.guest, '/api/roost/profile', { profile: { name: 'Intruder' } })).status, 401);
  assert.equal((await h.post(h.member, '/api/roost/profile', { profile: { name: 'Wrong', email: 'invalid' } })).status, 400);
  assert.deepEqual((await h.get(h.member)).data.member.profile, profile);
  assert.equal((await h.order(h.guest, { customerDetails: undefined })).status, 400);
});
test('a member credential, cookie and moderator authority cannot cross into a separate workspace', async () => {
  const h = await fixture(), joined = await h.register();
  await h.order(h.member, { checkoutMode: 'member' });
  await h.post(h.guest, '/api/comments', { name: 'Neighbor', body: 'Waiting for review', publicConsent: true });
  const c = (await h.call(h.owner, '/api/studio-comments')).data.comments[0];
  const otherOwner = h.browser(), other = (await h.call(otherOwner, '/api/workspaces', {})).data;
  assert.equal((await h.call(h.member, '/api/roost/me?workspace='+other.id)).data.member, null);
  const options = (await h.post(h.member, '/api/roost/options', { workspaceId: other.id, kind: 'login' })).data.options;
  assert.equal((await h.post(h.member, '/api/roost/verify', { workspaceId: other.id, response: joined.key.login(options, h.origin) })).status, 401);
  assert.equal((await h.post(otherOwner, '/api/studio-comments', { id: c.id, version: c.version, status: 'approved' })).status, 409);
  assert.equal((await h.get(h.guest, '/api/comments')).data.comments.length, 0);
  assert.equal((await h.get(h.member)).data.orders.length, 1);
});
