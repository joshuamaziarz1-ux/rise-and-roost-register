import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../server/worker.mjs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed } from '../public/model.mjs';
import { previewAccess, normalizeIP, PREVIEW_HOST, PREVIEW_DATABASE, PREVIEW_WORKSPACE } from '../server/preview-access.mjs';
const origin = 'https://' + PREVIEW_HOST;
function config(extra = {}) {
  return { PREVIEW_ACCESS_MODE: 'trusted-network', PREVIEW_DATABASE_ID: PREVIEW_DATABASE,
    PREVIEW_TESTER_IPS: JSON.stringify(['203.0.113.10', '2001:db8::1']), PREVIEW_ACCESS_UNTIL: new Date(Date.now()+86400000).toISOString(),
    PUBLIC_WORKSPACE_ID: PREVIEW_WORKSPACE, REVIEW_BUILD: 'true', STUDIO_MANAGEMENT_ENABLED: 'true', CUSTOMER_EXPERIENCE_ENABLED: 'true', ORDER_EMAIL_ENABLED: 'false', ...extra };
}
function request(path, body, { ip = '203.0.113.10', cf = true, headers = {}, host = origin } = {}) {
  const r = new Request(host+path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: host, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (cf) Object.defineProperty(r, 'cf', { value: { colo: 'TEST' } });
  return r;
}
function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const doc = seed(), key = 'synthetic-existing-key', ownerHash = createHash('sha256').update(PREVIEW_WORKSPACE+key).digest('hex');
  for (const id of [PREVIEW_WORKSPACE, 'b'.repeat(48)]) sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').run(id, ownerHash, JSON.stringify(doc), JSON.stringify(doc), '[]', new Date().toISOString());
  const db = sqliteD1(sql), env = config({ DB: db, ASSETS: { fetch: async () => new Response('synthetic assets') } });
  const call = async (path, body, opts) => { const r = await worker.fetch(request(path, body, opts), env); return { status: r.status, headers: r.headers, data: r.headers.get('Content-Type')?.includes('application/json') ? await r.json() : await r.text() }; };
  return { sql, db, env, doc, key, ownerHash, call };
}

test('temporary network restriction accepts exact canonical IPs and rejects wildcards, ranges and malformed input', () => {
  assert.equal(normalizeIP('203.0.113.10'), '203.0.113.10'); assert.equal(normalizeIP('2001:0DB8:0000::0001'), '2001:db8::1');
  for (const value of ['*', '0.0.0.0/0', '203.0.113.0/24', '::/0', '001.2.3.4', '999.1.1.1', ' 203.0.113.10', '[::1]', '203.0.113.10:80', 'example.com', '2001:db8::1%eth0']) assert.equal(normalizeIP(value), null);
});
test('unapproved clients cannot reach pages, assets or any API, even with spoofed headers or saved owner cookies', async () => {
  let calls = 0;
  const env = config({ DB: { prepare() { calls++; throw Error('D1 must not be reached'); } }, ASSETS: { fetch() { calls++; throw Error('Assets must not be reached'); } } });
  for (const path of ['/', '/shop', '/studio', '/management.mjs', '/api/studio-info', '/api/studio', '/api/manage/snapshot', '/api/site']) {
    const r = await worker.fetch(request(path, undefined, { ip: '198.51.100.20', headers: { 'X-Forwarded-For': '203.0.113.10', 'CF-Connecting-IPv6': '2001:db8::1', 'Cf-Access-Authenticated-User-Email': 'owner@example.test', Cookie: 'rr_studio='+'a'.repeat(48) } }), env);
    assert.equal(r.status, 403); assert.match(r.headers.get('Cache-Control'), /no-store/); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    const body = await r.text(); assert.ok(!body.includes('owner@example.test') && !body.includes('203.0.113.10'));
  }
  assert.equal((await worker.fetch(request('/api/manage/product', {}, { ip: '198.51.100.20' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/api/studio', undefined, { cf: false }), env)).status, 403);
  assert.equal(calls, 0);
});
test('missing configuration, wrong deployment scope or expired approval never enables anonymous administration', async () => {
  for (const extra of [{ PREVIEW_TESTER_IPS: undefined }, { PREVIEW_TESTER_IPS: '[]' }, { PREVIEW_TESTER_IPS: '["0.0.0.0/0"]' }, { PREVIEW_TESTER_IPS: '["::"]' }, { PREVIEW_ACCESS_MODE: 'true' }, { PREVIEW_DATABASE_ID: 'production' }, { PUBLIC_WORKSPACE_ID: 'b'.repeat(48) }, { REVIEW_BUILD: 'false' }, { STUDIO_MANAGEMENT_ENABLED: 'false' }, { ORDER_EMAIL_ENABLED: 'true' }, { PREVIEW_ACCESS_UNTIL: '' }, { PREVIEW_ACCESS_UNTIL: new Date(Date.now()+32*86400000).toISOString() }]) assert.equal((await previewAccess(request('/studio'), config(extra))).status, 503);
  for (const host of ['http://'+PREVIEW_HOST, 'https://rise-roost-beta.joshua-maziarz1.workers.dev', 'https://other.workers.dev']) assert.equal((await previewAccess(request('/studio', undefined, { host }), config())).status, 503);
  assert.equal((await previewAccess(request('/studio'), config({ PREVIEW_ACCESS_UNTIL: new Date(Date.now()-1000).toISOString() }))).status, 403);
  assert.ok((await previewAccess(request('/studio', undefined, { ip: '2001:0db8::1' }), config())).grant);
});
test('approved network opens the existing main Studio without keys, new sessions, or workspace creation', async () => {
  const h = fixture(), before = h.sql.prepare('SELECT * FROM workspaces').all();
  const info = await h.call('/api/studio-info'); assert.equal(info.data.previewDirectAccess, true); assert.equal(info.data.mainStudioPath, '/studio');
  const r = await h.call('/api/studio'); assert.equal(r.status, 200); assert.equal(r.data.id, PREVIEW_WORKSPACE); assert.equal(r.data.studioPath, '/studio'); assert.equal(r.data.accessKey, undefined); assert.equal(r.headers.get('Set-Cookie'), null);
  const snapshot = await h.call('/api/manage/snapshot'); assert.equal(snapshot.status, 200); assert.equal(snapshot.data.actor.authentication, 'preview_network');
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n, 0); assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), before);
  assert.equal((await h.call('/api/manage/snapshot', undefined, { headers: { 'X-RR-Workspace': 'b'.repeat(48) } })).status, 403);
});
test('network mode cannot create, reset, sign into, pair or sign out any workspace', async () => {
  const h = fixture(), before = h.sql.prepare('SELECT * FROM workspaces').all();
  for (const path of ['/api/workspaces', '/api/login', '/api/logout', '/api/device-start', '/api/device-review', '/api/device-approve', '/api/device-claim']) assert.equal((await h.call(path, { id: PREVIEW_WORKSPACE, accessKey: h.key })).status, 403);
  assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), before); assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const forged = { workspaceId: PREVIEW_WORKSPACE, expiresAt: Date.now()+86400000, actor: { authentication: 'preview_network' } };
  assert.equal((await api(request('/api/studio'), h.db, Date.now(), { publicWorkspaceId: PREVIEW_WORKSPACE, previewGrant: forged, reviewBuild: true, studioManagementEnabled: true })).status, 403);
});
test('network-approved product saves publish to the same website with audit, while unrelated workspace data and credentials stay intact', async () => {
  const h = fixture(), other = h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get('b'.repeat(48));
  const s = (await h.call('/api/manage/snapshot')).data, product = { ...s.published.products[0], name: 'Synthetic direct-access loaf', price: 1250, archived: false, soldOut: false };
  const payload = { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, product, available: 4 };
  assert.equal((await h.call('/api/manage/product', payload, { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await h.call('/api/manage/product', payload)).status, 200);
  const published = (await h.call('/api/site')).data; assert.equal(published.document.products[0].name, product.name); assert.equal(published.document.products[0].price, 1250); assert.equal(published.studioPath, '/studio');
  const after = (await h.call('/api/manage/snapshot')).data; assert.equal(after.management.audit[0].actor.authentication, 'preview_network');
  assert.equal(h.sql.prepare('SELECT owner_hash FROM workspaces WHERE id=?').get(PREVIEW_WORKSPACE).owner_hash, h.ownerHash);
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM workspaces').get().n, 2); assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get('b'.repeat(48)), other);
});
test('guest orders and tracking remain associated with the existing preview under the external restriction', async () => {
  const h = fixture(), site = (await h.call('/api/site')).data, p = site.document.products[0], pickup = site.document.pickups[0];
  const made = await h.call('/api/orders', { workspaceId: PREVIEW_WORKSPACE, storefront: 'main', revision: site.revision, requestId: crypto.randomUUID(), pickupId: pickup.id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Direct Preview Guest' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price });
  assert.equal(made.status, 201); let s = (await h.call('/api/manage/snapshot')).data; assert.equal(s.orders.length, 1); assert.equal(s.orders[0].id, made.data.id);
  assert.equal((await h.call('/api/manage/fulfillment', { operationId: crypto.randomUUID(), id: made.data.id, orderVersion: s.orders[0].version, status: 'ready' })).status, 200);
  const tracking = new URL(made.data.trackingPath, origin), secret = new URLSearchParams(tracking.hash.slice(1)).get('access');
  const tracked = await h.call(tracking.pathname.replace('/orders/', '/api/order-tracking/'), undefined, { headers: { Authorization: 'Bearer '+secret } });
  assert.equal(tracked.data.status, 'ready'); assert.notEqual(tracked.data.paymentStatus, 'verified');
});
test('turning temporary access off restores existing key authentication without resetting any owner credentials', async () => {
  const h = fixture(); h.env.PREVIEW_ACCESS_MODE = 'off';
  assert.equal((await h.call('/api/studio')).status, 401);
  const logged = await h.call('/api/login', { id: PREVIEW_WORKSPACE, accessKey: h.key }); assert.equal(logged.status, 200); assert.equal(logged.data.previewDirectAccess, false);
  assert.equal(h.sql.prepare('SELECT owner_hash FROM workspaces WHERE id=?').get(PREVIEW_WORKSPACE).owner_hash, h.ownerHash);
  const cookie = logged.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  h.env.PREVIEW_ACCESS_MODE = 'trusted-network'; assert.equal((await h.call('/api/studio', undefined, { ip: '198.51.100.20', headers: { Cookie: cookie } })).status, 403);
});
