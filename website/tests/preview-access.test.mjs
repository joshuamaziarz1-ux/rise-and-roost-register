import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../server/worker.mjs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed } from '../public/model.mjs';
import { previewAccess, PREVIEW_HOST, PREVIEW_DATABASE, PREVIEW_WORKSPACE } from '../server/preview-access.mjs';
import { accessAuthority, TESTER_A, TESTER_B } from './access-jwt-fixture.mjs';
const origin = 'https://' + PREVIEW_HOST, servers = new Map();
globalThis.fetch = async (url, init) => {
  const entry = servers.get(String(url));
  if (!entry || entry.offline) throw new TypeError('Synthetic signing-key service unavailable');
  assert.equal(init.redirect, 'error');
  return new Response(JSON.stringify({ keys: entry.keys }), { headers: { 'Content-Type': 'application/json' } });
};
async function authority() { const a = await accessAuthority(); servers.set(a.team+'/cdn-cgi/access/certs', { keys: [a.jwk] }); return a; }
function config(a, extra = {}) {
  return { PREVIEW_ACCESS_MODE: 'cloudflare-access', PREVIEW_DATABASE_ID: PREVIEW_DATABASE,
    PREVIEW_TESTER_EMAILS: JSON.stringify([TESTER_A, TESTER_B]), PREVIEW_ACCESS_UNTIL: new Date(Date.now()+86400000).toISOString(),
    CF_ACCESS_TEAM_DOMAIN: a.team, CF_ACCESS_AUD: a.aud,
    PUBLIC_WORKSPACE_ID: PREVIEW_WORKSPACE, REVIEW_BUILD: 'true', STUDIO_MANAGEMENT_ENABLED: 'true', CUSTOMER_EXPERIENCE_ENABLED: 'true', ORDER_EMAIL_ENABLED: 'false', ...extra };
}
function request(path, body, { token, headers = {}, host = origin } = {}) {
  return new Request(host+path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: host, 'Content-Type': 'application/json', ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function fixture() {
  const auth = await authority(), sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const doc = seed(), key = 'synthetic-existing-key', ownerHash = createHash('sha256').update(PREVIEW_WORKSPACE+key).digest('hex');
  for (const id of [PREVIEW_WORKSPACE, 'b'.repeat(48)]) sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').run(id, ownerHash, JSON.stringify(doc), JSON.stringify(doc), '[]', new Date().toISOString());
  const db = sqliteD1(sql), env = config(auth, { DB: db, ASSETS: { fetch: async () => new Response('synthetic assets') } });
  const call = async (path, body, opts = {}) => { const r = await worker.fetch(request(path, body, { token: auth.token, ...opts }), env); return { status: r.status, headers: r.headers, data: r.headers.get('Content-Type')?.includes('application/json') ? await r.json() : await r.text() }; };
  return { sql, db, env, doc, key, ownerHash, call, auth };
}

test('unverified clients cannot reach pages, assets or APIs using forged identity/IP headers, owner cookies or app cookies alone', async () => {
  const a = await authority(); let calls = 0;
  const env = config(a, { DB: { prepare() { calls++; throw Error('D1 must not be reached'); } }, ASSETS: { fetch() { calls++; throw Error('Assets must not be reached'); } } });
  for (const path of ['/', '/shop', '/studio', '/management.mjs', '/api/studio-info', '/api/studio', '/api/manage/snapshot', '/api/site']) {
    const r = await worker.fetch(request(path, undefined, { headers: { 'X-Forwarded-For': '203.0.113.10', 'CF-Connecting-IP': '203.0.113.10', 'Cf-Access-Authenticated-User-Email': TESTER_A, Cookie: 'rr_studio='+'a'.repeat(48)+'; CF_Authorization='+a.token } }), env);
    assert.equal(r.status, 403); assert.match(r.headers.get('Cache-Control'), /no-store/); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.ok(!(await r.text()).includes(TESTER_A));
  }
  assert.equal((await worker.fetch(request('/api/manage/product', {}), env)).status, 403); assert.equal(calls, 0);
});
test('bad scope, missing allowlist, obsolete IP mode and unsafe signing-key domains fail closed', async () => {
  const a = await authority();
  for (const extra of [{ PREVIEW_TESTER_EMAILS: undefined }, { PREVIEW_TESTER_EMAILS: '[]' }, { PREVIEW_TESTER_EMAILS: '["*@example.test"]' }, { PREVIEW_ACCESS_MODE: 'trusted-network' }, { PREVIEW_ACCESS_MODE: 'true' }, { PREVIEW_DATABASE_ID: 'production' }, { PUBLIC_WORKSPACE_ID: 'b'.repeat(48) }, { REVIEW_BUILD: 'false' }, { STUDIO_MANAGEMENT_ENABLED: 'false' }, { ORDER_EMAIL_ENABLED: 'true' }, { PREVIEW_ACCESS_UNTIL: '' }, { PREVIEW_ACCESS_UNTIL: new Date(Date.now()+32*86400000).toISOString() }, { CF_ACCESS_AUD: '' }, { CF_ACCESS_TEAM_DOMAIN: 'http://localhost' }, { CF_ACCESS_TEAM_DOMAIN: 'https://attacker.example' }, { CF_ACCESS_TEAM_DOMAIN: a.team+'@attacker.example' }, { CF_ACCESS_TEAM_DOMAIN: a.team+'/arbitrary' }]) assert.equal((await previewAccess(request('/studio', undefined, { token: a.token }), config(a, extra))).status, 503);
  for (const host of ['http://'+PREVIEW_HOST, 'https://rise-roost-beta.joshua-maziarz1.workers.dev', 'https://other.workers.dev']) assert.equal((await previewAccess(request('/studio', undefined, { host, token: a.token }), config(a))).status, 503);
  assert.equal((await previewAccess(request('/studio', undefined, { token: a.token }), config(a, { PREVIEW_ACCESS_UNTIL: new Date(Date.now()-1000).toISOString() }))).status, 403);
});
test('signed JWT verification rejects wrong audience, issuer, signature, email, type, lifetime and missing claims', async () => {
  const a = await authority(), other = await accessAuthority(), now = Math.floor(Date.now()/1000);
  const values = [
    await a.mint({ audience: 'b'.repeat(64) }), await a.mint({ issuer: other.team }), await a.mint({ key: other.privateKey }),
    await a.mint({ email: 'outsider@example.test' }), await a.mint({ claims: { type: 'service' } }),
    await a.mint({ expiresAt: now-1, issuedAt: now-600, notBefore: now-600 }), await a.mint({ notBefore: now+3600 }),
    await a.mint({ issuedAt: now+3600 }), await a.mint({ expiresAt: now+32*86400 }), await a.mint({ claims: { email: undefined } }),
    await a.mint({ subject: '' }), await a.mint({ claims: { type: undefined } }), 'not.a.jwt',
    Buffer.from(JSON.stringify({ alg: 'none', kid: a.kid })).toString('base64url')+'.'+a.token.split('.')[1]+'.',
  ];
  for (const token of values) assert.equal((await previewAccess(request('/api/studio', undefined, { token }), config(a))).status, 403);
});
test('both approved email identities have stable distinct audit actors and remain authorized when IP addresses change', async () => {
  const a = await authority(), cfg = config(a);
  const first = await previewAccess(request('/studio', undefined, { token: a.token, headers: { 'CF-Connecting-IP': '198.51.100.1' } }), cfg);
  const moved = await previewAccess(request('/studio', undefined, { token: a.token, headers: { 'CF-Connecting-IP': '2001:db8::abc' } }), cfg);
  const second = await previewAccess(request('/studio', undefined, { token: a.secondToken }), cfg);
  assert.ok(first.grant && moved.grant && second.grant); assert.equal(first.grant.actor.id, moved.grant.actor.id); assert.notEqual(first.grant.actor.id, second.grant.actor.id);
  assert.equal(first.grant.actor.name, TESTER_A); assert.equal(second.grant.actor.name, TESTER_B);
  cfg.PREVIEW_TESTER_EMAILS = JSON.stringify([TESTER_B]); assert.equal((await previewAccess(request('/studio', undefined, { token: a.token }), cfg)).status, 403);
});
test('unavailable signing keys deny before data access; current and previous published signing keys verify', async () => {
  const a = await authority(); servers.get(a.team+'/cdn-cgi/access/certs').offline = true;
  assert.equal((await previewAccess(request('/studio', undefined, { token: a.token }), config(a))).status, 503);
  const rotated = await authority(), previous = await accessAuthority(); servers.get(rotated.team+'/cdn-cgi/access/certs').keys.push(previous.jwk);
  assert.ok((await previewAccess(request('/studio', undefined, { token: rotated.token }), config(rotated))).grant);
  const priorToken = await rotated.mint({ header: { kid: previous.kid }, key: previous.privateKey });
  assert.ok((await previewAccess(request('/studio', undefined, { token: priorToken }), config(rotated))).grant);
});
test('approved Access identity opens the existing main Studio without keys, new sessions or workspace creation', async () => {
  const h = await fixture(), before = h.sql.prepare('SELECT * FROM workspaces').all();
  const info = await h.call('/api/studio-info'); assert.equal(info.data.previewDirectAccess, true); assert.equal(info.data.mainStudioPath, '/studio');
  const r = await h.call('/api/studio'); assert.equal(r.status, 200); assert.equal(r.data.id, PREVIEW_WORKSPACE); assert.equal(r.data.studioPath, '/studio'); assert.equal(r.data.accessKey, undefined); assert.equal(r.headers.get('Set-Cookie'), null);
  const snapshot = await h.call('/api/manage/snapshot'); assert.equal(snapshot.status, 200); assert.equal(snapshot.data.actor.authentication, 'cloudflare_access'); assert.equal(snapshot.data.previewTesterEmail, TESTER_A);
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n, 0); assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), before);
  assert.equal((await h.call('/api/manage/snapshot', undefined, { headers: { 'X-RR-Workspace': 'b'.repeat(48) } })).status, 403);
});
test('temporary Access mode cannot create, reset, pair, sign into or sign out a workspace, and forged internal grants fail', async () => {
  const h = await fixture(), before = h.sql.prepare('SELECT * FROM workspaces').all();
  for (const path of ['/api/workspaces', '/api/login', '/api/logout', '/api/device-start', '/api/device-review', '/api/device-approve', '/api/device-claim']) assert.equal((await h.call(path, { id: PREVIEW_WORKSPACE, accessKey: h.key })).status, 403);
  assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), before); assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const forged = { workspaceId: PREVIEW_WORKSPACE, expiresAt: Date.now()+86400000, actor: { authentication: 'cloudflare_access' } };
  assert.equal((await api(request('/api/studio'), h.db, Date.now(), { publicWorkspaceId: PREVIEW_WORKSPACE, previewGrant: forged, reviewBuild: true, studioManagementEnabled: true })).status, 403);
});
test('approved saves synchronize publication with per-owner audit; CSRF, other workspaces and original credentials stay protected', async () => {
  const h = await fixture(), other = h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get('b'.repeat(48));
  const s = (await h.call('/api/manage/snapshot')).data, product = { ...s.published.products[0], name: 'Synthetic direct-access loaf', price: 1250, archived: false, soldOut: false };
  const payload = { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, product, available: 4 };
  assert.equal((await h.call('/api/manage/product', payload, { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await h.call('/api/manage/product', payload)).status, 200);
  const published = (await h.call('/api/site')).data; assert.equal(published.document.products[0].name, product.name); assert.equal(published.document.products[0].price, 1250); assert.equal(published.studioPath, '/studio');
  await h.call('/api/manage/notifications', { operationId: crypto.randomUUID(), preferences: { orders: true, payments: true, stock: true, pickups: true, comments: true, errors: true } }, { token: h.auth.secondToken });
  const after = (await h.call('/api/manage/snapshot')).data; assert.equal(after.management.audit[0].actor.name, TESTER_B); assert.ok(after.management.audit.some(v => v.actor.name===TESTER_A));
  assert.equal(h.sql.prepare('SELECT owner_hash FROM workspaces WHERE id=?').get(PREVIEW_WORKSPACE).owner_hash, h.ownerHash);
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM workspaces').get().n, 2); assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get('b'.repeat(48)), other);
});
test('guest orders and tracking remain associated with the existing preview behind Access', async () => {
  const h = await fixture(), site = (await h.call('/api/site')).data, p = site.document.products[0], pickup = site.document.pickups[0];
  const made = await h.call('/api/orders', { workspaceId: PREVIEW_WORKSPACE, storefront: 'main', revision: site.revision, requestId: crypto.randomUUID(), pickupId: pickup.id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Direct Preview Guest' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price });
  assert.equal(made.status, 201); const s = (await h.call('/api/manage/snapshot')).data; assert.equal(s.orders.length, 1); assert.equal(s.orders[0].id, made.data.id);
  assert.equal((await h.call('/api/manage/fulfillment', { operationId: crypto.randomUUID(), id: made.data.id, orderVersion: s.orders[0].version, status: 'ready' })).status, 200);
  const tracking = new URL(made.data.trackingPath, origin), secret = new URLSearchParams(tracking.hash.slice(1)).get('access');
  const tracked = await h.call(tracking.pathname.replace('/orders/', '/api/order-tracking/'), undefined, { headers: { Authorization: 'Bearer '+secret } });
  assert.equal(tracked.data.status, 'ready'); assert.notEqual(tracked.data.paymentStatus, 'verified');
});
test('disabling temporary Access restores original key authentication without changing credentials; old cookies cannot bypass Access', async () => {
  const h = await fixture(); h.env.PREVIEW_ACCESS_MODE = 'off'; assert.equal((await h.call('/api/studio')).status, 401);
  const logged = await h.call('/api/login', { id: PREVIEW_WORKSPACE, accessKey: h.key }); assert.equal(logged.status, 200); assert.equal(logged.data.previewDirectAccess, false);
  assert.equal(h.sql.prepare('SELECT owner_hash FROM workspaces WHERE id=?').get(PREVIEW_WORKSPACE).owner_hash, h.ownerHash);
  const cookie = logged.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  h.env.PREVIEW_ACCESS_MODE = 'cloudflare-access'; assert.equal((await h.call('/api/studio', undefined, { token: null, headers: { Cookie: cookie } })).status, 403);
});
