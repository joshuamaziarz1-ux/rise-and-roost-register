import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { parseAccessDetails } from '../public/access.mjs';
const now = Date.parse('2026-10-28T15:00:00Z');
async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), site = { publicWorkspaceId: '' };
  const browser = () => ({ cookies: new Map() });
  async function call(client, path, body, options = {}) {
    const r = await api(new Request('https://beta.test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://beta.test', 'Content-Type': 'application/json', Cookie: [...client.cookies].map(([k,v]) => k + '=' + v).join('; '), ...(options.workspaceId ? { 'X-RR-Workspace': options.workspaceId } : {}), ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db, options.now ?? now, site);
    for (const c of r.headers.getSetCookie()) {
      const [name,value] = c.split(';')[0].split('=');
      if (c.includes('Max-Age=0')) client.cookies.delete(name); else client.cookies.set(name,value);
    }
    return { status: r.status, data: await r.json(), headers: r.headers };
  }
  const a = browser(), b = browser(), attacker = browser();
  const { data: main } = await call(a, '/api/workspaces', {}); site.publicWorkspaceId = main.id;
  const scope = { workspaceId: main.id };
  const begin = async (client = b) => (await call(client, '/api/device-start', { workspaceId: main.id })).data;
  const approve = (pending, client = a, options = scope, extra = {}) => call(client, '/api/device-approve', { code: pending.code, requestId: pending.requestId, confirmed: true, ...extra }, options);
  return { sql, db, site, browser, call, a, b, attacker, main, scope, begin, approve };
}

test('saved ID/key bundles are parsed together and malformed details are rejected without a key in the URL', () => {
  const id = 'a'.repeat(48), key = 'b'.repeat(48);
  assert.deepEqual(parseAccessDetails(`Workspace ID: ${id}\r\nPrivate access key: ${key}\r\nSign in at: https://beta.test/studio?workspace=${id}`), { id, accessKey: key });
  assert.throws(() => parseAccessDetails(key));
  assert.throws(() => parseAccessDetails('Workspace ID: wrong\nPrivate access key: missing'));
});
test('workspace sessions stay isolated when another demo replaces the legacy cookie', async () => {
  const h = await fixture();
  const demo = (await h.call(h.a, '/api/workspaces', {})).data;
  assert.equal((await h.call(h.a, '/api/studio', undefined, h.scope)).data.id, h.main.id);
  assert.equal((await h.call(h.a, '/api/studio', undefined, { workspaceId: demo.id })).data.id, demo.id);
  assert.equal((await h.call(h.b, '/api/login', { id: h.main.id, accessKey: demo.accessKey }, h.scope)).status, 401);
  assert.equal((await h.call(h.b, '/api/login', { id: demo.id, accessKey: demo.accessKey }, h.scope)).status, 409);
  assert.equal((await h.call(h.b, '/api/login', { id: '  ' + h.main.id + '\n', accessKey: ' ' + h.main.accessKey + '\n' }, h.scope)).status, 200);
});
test('a valid legacy main session is promoted without changing credentials, workspaces or its expiry', async () => {
  const h = await fixture(); h.a.cookies.delete('rr_studio_' + h.main.id);
  const before = h.sql.prepare('SELECT owner_hash,draft_json,published_json,ledger_json FROM workspaces WHERE id=?').get(h.main.id);
  const r = await h.call(h.a, '/api/studio', undefined, { ...h.scope, now: now + 60000 });
  assert.equal(r.status, 200); assert.ok(h.a.cookies.has('rr_studio_' + h.main.id));
  assert.match(r.headers.getSetCookie()[0], /Max-Age=43140/);
  assert.deepEqual(h.sql.prepare('SELECT owner_hash,draft_json,published_json,ledger_json FROM workspaces WHERE id=?').get(h.main.id), before);
});
test('expired owner sessions do not authenticate, promote, review or approve device connections', async () => {
  const h = await fixture(), p = await h.begin(); const expired = { ...h.scope, now: now + 13 * 3600000 };
  for (const [path, body] of [['/api/studio', undefined], ['/api/device-review', { code: p.code }], ['/api/device-approve', { code: p.code, requestId: p.requestId, confirmed: true }]])
    assert.equal((await h.call(h.a, path, body, expired)).status, 401);
});
test('creating a separate demo preserves an unexpired legacy-only main session before replacing its generic cookie', async () => {
  const h = await fixture(); h.a.cookies.delete('rr_studio_' + h.main.id);
  const demo = await h.call(h.a, '/api/workspaces', {});
  assert.equal(demo.status, 201);
  assert.equal((await h.call(h.a, '/api/studio', undefined, h.scope)).data.id, h.main.id);
  assert.equal((await h.call(h.a, '/api/studio', undefined, { workspaceId: demo.data.id })).data.id, demo.data.id);
});
test('a pending device cannot access owner data and requires approval by the exact workspace owner', async () => {
  const h = await fixture(), p = await h.begin();
  assert.equal((await h.call(h.b, '/api/studio', undefined, h.scope)).status, 401);
  assert.equal((await h.call(h.b, '/api/device-claim', { requestId: p.requestId })).data.status, 'pending');
  assert.equal((await h.approve(p, h.b)).status, 401);
  const demo = (await h.call(h.attacker, '/api/workspaces', {})).data;
  assert.equal((await h.approve(p, h.attacker, { workspaceId: demo.id })).status, 403);
  assert.equal((await h.approve(p, h.a, h.scope, { confirmed: false })).status, 400);
  assert.equal((await h.approve(p, h.a, h.scope, { requestId: 'a'.repeat(48) })).status, 400);
});
test('approved pairing is tied to the requesting browser and creates only a normal scoped session', async () => {
  const h = await fixture(), p = await h.begin();
  const reviewed = await h.call(h.a, '/api/device-review', { code: p.code.toLowerCase() }, h.scope);
  assert.equal(reviewed.status, 200); assert.equal(reviewed.data.workspaceId, h.main.id);
  assert.equal((await h.approve(p)).status, 200);
  assert.equal((await h.call(h.attacker, '/api/device-claim', { requestId: p.requestId })).status, 401);
  const claim = await h.call(h.b, '/api/device-claim', { requestId: p.requestId });
  assert.equal(claim.status, 200); assert.equal(claim.data.id, h.main.id); assert.equal(claim.data.status, 'connected');
  assert.equal(claim.data.accessKey, undefined);
  assert.equal((await h.call(h.b, '/api/studio', undefined, h.scope)).data.id, h.main.id);
  assert.equal(claim.headers.getSetCookie().filter(c => c.includes('Max-Age=43200')).length, 2);
  assert.ok(claim.headers.getSetCookie().every(c => c.includes('HttpOnly; SameSite=Strict') && c.includes('Secure')));
  assert.equal((await h.call(h.b, '/api/device-claim', { requestId: p.requestId })).status, 401);
});
test('simultaneous claims consume a grant once and create exactly one owner session', async () => {
  const h = await fixture(), p = await h.begin(); await h.approve(p);
  const before = h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n;
  const c = h.browser(); c.cookies = new Map(h.b.cookies);
  const results = await Promise.all([h.call(h.b, '/api/device-claim', { requestId: p.requestId }), h.call(c, '/api/device-claim', { requestId: p.requestId })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sessions').get().n, before + 1);
});
test('expired links and revoked approval sessions never grant access', async () => {
  const h = await fixture(), p = await h.begin(); await h.approve(p);
  assert.equal((await h.call(h.b, '/api/device-claim', { requestId: p.requestId }, { now: now + 11 * 60000 })).status, 410);
  const q = await h.begin(); await h.approve(q);
  await h.call(h.a, '/api/logout', {}, h.scope);
  assert.equal((await h.call(h.b, '/api/device-claim', { requestId: q.requestId })).status, 401);
});
test('CSRF and invalid codes are rejected without exposing owner credentials', async () => {
  const h = await fixture(), p = await h.begin();
  assert.equal((await h.call(h.a, '/api/device-approve', { code: p.code }, { ...h.scope, headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await h.call(h.a, '/api/device-review', { code: 'not-valid' }, h.scope)).status, 400);
  assert.equal((await h.call(h.a, '/api/device-review', { code: 'ABCDEF1234' }, h.scope)).status, 404);
  const info = (await h.call(h.b, '/api/studio-info')).data;
  assert.equal(info.mainWorkspaceId, h.main.id); assert.equal(info.accessKey, undefined); assert.equal(info.orders, undefined);
});
test('signing out a demo preserves the main session and never removes any saved workspace', async () => {
  const h = await fixture(), demo = (await h.call(h.a, '/api/workspaces', {})).data;
  await h.call(h.a, '/api/logout', {}, { workspaceId: demo.id });
  assert.equal((await h.call(h.a, '/api/studio', undefined, h.scope)).status, 200);
  assert.equal((await h.call(h.a, '/api/studio', undefined, { workspaceId: demo.id })).status, 401);
  assert.equal(h.sql.prepare('SELECT count(*) AS n FROM workspaces').get().n, 2);
});
test('public checkout is stored in the main ledger even when a private demo is signed in', async () => {
  const h = await fixture(), demo = (await h.call(h.a, '/api/workspaces', {})).data;
  const input = { storefront: 'main', workspaceId: h.main.id, revision: 1, requestId: crypto.randomUUID(), pickupId: h.main.published.pickups[0].id,
    lines: [{ productId: 'bread', variantId: 'classic', qty: 1, unitPrice: 900 }], total: 900 };
  assert.equal((await h.call(h.a, '/api/orders', { ...input, workspaceId: demo.id })).status, 409);
  const order = await h.call(h.a, '/api/orders', input); assert.equal(order.status, 201);
  await h.call(h.b, '/api/login', { id: h.main.id, accessKey: h.main.accessKey }, h.scope);
  for (const client of [h.a,h.b]) assert.equal((await h.call(client, '/api/studio', undefined, h.scope)).data.orders[0].id, order.data.id);
  assert.equal((await h.call(h.a, '/api/studio', undefined, { workspaceId: demo.id })).data.orders.length, 0);
});
test('the local D1 batch rolls back consumption if session insertion fails', async () => {
  const h = await fixture(), p = await h.begin();
  const existing = h.sql.prepare('SELECT hash FROM sessions LIMIT 1').get().hash;
  await assert.rejects(h.db.batch([
    h.db.prepare('UPDATE device_links SET consumed_at=? WHERE id=?').bind(now,p.requestId),
    h.db.prepare('INSERT INTO sessions(hash,workspace_id,expires) VALUES(?,?,?)').bind(existing,h.main.id,now+1000),
  ]));
  assert.equal(h.sql.prepare('SELECT consumed_at FROM device_links WHERE id=?').get(p.requestId).consumed_at, null);
});
