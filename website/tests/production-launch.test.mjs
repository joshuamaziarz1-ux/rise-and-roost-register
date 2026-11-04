import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture, installProductionTestKeys } from './production-fixture.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
import { api } from '../server/service.mjs';
import { TESTER_A } from './access-jwt-fixture.mjs';
import worker from '../server/worker.mjs';
const originalFetch = globalThis.fetch;
before(installProductionTestKeys); after(() => { globalThis.fetch = originalFetch; });

test('production needs exact configuration and explicit release approval before any storage access', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  for (const extra of [{ PRODUCTION_RELEASE_APPROVED: 'false' }, { PRODUCTION_DATABASE_ID: '21352b95-d7f6-406f-8527-4b8dbcebf1bf' }, { PREVIEW_ACCESS_MODE: 'pin' }, { PRODUCTION_OWNERS: '[]' }, { PRODUCTION_ACCESS_TEAM_DOMAIN: 'https://attacker.test' }, { PRODUCTION_OWNERS: JSON.stringify([{ email: TESTER_A, name: 'Unapproved role', role: 'member' }]) }]) {
    const before = { ...h.env }; Object.assign(h.env, extra);
    h.env.DB = new Proxy({}, { get() { throw Error('No DB access allowed.'); } });
    assert.equal((await h.call('/api/site')).status, 503);
    for (const key of Object.keys(h.env)) delete h.env[key]; Object.assign(h.env, before);
  }
});
test('private pages/APIs require signed individual identity; raw legacy owner routes and cookies cannot bypass it', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  for (const path of ['/studio', '/studio/api/studio', '/studio/api/manage/export', '/studio/api/upload', '/studio/preview/' + 'a'.repeat(48)]) assert.equal((await h.call(path, undefined, { headers: { Cookie: 'rr_studio=' + 'a'.repeat(48), 'Cf-Access-Authenticated-User-Email': TESTER_A } })).status, 401);
  for (const path of ['/api/workspaces', '/api/login', '/api/studio', '/api/manage/snapshot', '/api/device-start', '/api/studio-pin/setup', '/studio/api/workspaces', '/studio/setup', '/demo/' + PRODUCTION_WORKSPACE_ID]) assert.equal((await h.call(path, {}, { token: h.ownerA })).status, 404, path);
  assert.equal((await h.call('/api/site')).status, 200);
  assert.equal((await h.call('/studio/api/studio', undefined, { token: h.ownerA })).headers.has('set-cookie'), false);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM sessions').get().n, 0);
});
test('wrong signature, audience, issuer, subject, email, type and token lifetime fail closed', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const now = Math.floor(h.now / 1000), valid = { expiresAt: now + 3600 };
  for (const options of [{ audience: 'b'.repeat(64) }, { issuer: 'https://other.cloudflareaccess.com' }, { email: 'outsider@example.test' }, { subject: '' }, { claims: { type: 'service' } }, { expiresAt: now - 1 }, { expiresAt: now + 25 * 3600 }, { issuedAt: now + 600 }, { claims: { email: null } }]) {
    const r = await h.call('/studio/api/studio', undefined, { token: await h.auth.mint({ ...valid, ...options }) });
    assert.ok([401, 403].includes(r.status), JSON.stringify(options));
  }
  const tampered = h.ownerA.slice(0, -10) + 'badpayload'; assert.equal((await h.call('/studio', undefined, { token: tampered })).status, 403);
});
test('the configured 24-hour Access session is accepted until its expiry, without a shared PIN', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const now = Math.floor(h.now / 1000), token = await h.auth.mint({ issuedAt: now, notBefore: now, expiresAt: now + 86400 });
  assert.equal((await h.call('/studio/api/studio', undefined, { token })).status, 200);
  assert.equal((await h.call('/studio/api/studio', undefined, { token, at: (now + 86400) * 1000 })).status, 403);
});
test('www redirects only navigation to the canonical HTTPS host; alternate-host writes and bypasses stay closed', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const env = { ...h.env, DB: new Proxy({}, { get() { throw Error('No storage access is allowed for alias or rejected hosts.'); } }) };
  for (const path of ['/', '/shop', '/studio', '/studio/api/manage/snapshot', '/api/manage/export', '/orders/example?view=status']) {
    const r = await worker.fetch(new Request('https://www.rise-and-roost.com' + path), env, {});
    assert.equal(r.status, 308); assert.equal(r.headers.get('Location'), 'https://rise-and-roost.com' + path); assert.equal(await r.text(), '');
  }
  const denied = await worker.fetch(new Request('https://www.rise-and-roost.com/studio/api/manage/product', { method: 'POST', body: '{}' }), env, {});
  assert.equal(denied.status, 403);
  for (const origin of ['http://rise-and-roost.com', 'https://www.rise-and-roost.com:8443', 'https://rise-roost-website-production.example.workers.dev', 'https://rise-and-roost.com.attacker.test']) assert.equal((await worker.fetch(new Request(origin + '/studio/api/manage/snapshot', { headers: { 'Cf-Access-Jwt-Assertion': h.ownerA } }), env, {})).status, 503);
  assert.equal((await worker.fetch(new Request('https://www.rise-and-roost.com/studio'), { ...env, PRODUCTION_RELEASE_APPROVED: 'false' }, {})).status, 503);
});
test('both owners get distinct stable audited identities; removing an owner blocks their next request', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const a = await h.snapshot(), b = await h.snapshot(h.ownerB);
  assert.notEqual(a.actor.id, b.actor.id); assert.equal(a.owner, 'Synthetic Danielle'); assert.equal(a.studioPath, '/studio');
  assert.equal(a.productionOwnerAccess, true); assert.equal(a.management.ownerAccounts.configured, true);
  const saved = await h.change('notifications', { preferences: { orders: true, payments: true, stock: true, pickups: true, comments: true, errors: true } }, h.ownerB);
  assert.equal(saved.status, 200, saved.data.error);
  assert.equal((await h.snapshot()).management.audit[0].actor.id, b.actor.id);
  h.env.PRODUCTION_OWNERS = JSON.stringify([{ email: TESTER_A, name: 'Synthetic Danielle', role: 'owner' }]);
  assert.equal((await h.call('/studio/api/manage/snapshot', undefined, { token: h.ownerB })).status, 403);
  assert.equal((await h.call('/studio/api/manage/snapshot', undefined, { token: h.ownerA, headers: { 'CF-Connecting-IP': '198.51.100.2' } })).data.actor.id, a.actor.id);
});
test('database marker, workspace boundaries, draft preview and CSRF are protected in production', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  assert.equal((await h.call('/studio/api/manage/snapshot', undefined, { token: h.ownerA, headers: { 'X-RR-Workspace': 'b'.repeat(48) } })).status, 403);
  assert.equal((await h.call('/api/site?workspace=' + 'b'.repeat(48))).status, 403);
  assert.equal((await h.call('/studio/api/manage/notifications', { operationId: crypto.randomUUID(), preferences: {} }, { token: h.ownerA, headers: { Origin: 'https://attacker.test' } })).status, 403);
  const draft = await h.call('/studio/api/preview', { revision: 1 }, { token: h.ownerA });
  assert.equal(draft.status, 200); assert.match(draft.data.path, /^\/studio\/preview\//);
  const token = draft.data.path.split('/').at(-1);
  assert.equal((await h.call('/api/preview/' + token)).status, 404);
  assert.equal((await h.call('/studio/api/preview/' + token)).status, 401);
  assert.equal((await h.call('/studio/api/preview/' + token, undefined, { token: h.ownerA })).status, 200);
  h.sql.prepare('UPDATE deployment_identity SET database_id=?').run('wrong-database');
  assert.equal((await h.call('/api/site')).status, 503);
  assert.equal((await h.call('/studio/api/manage/snapshot', undefined, { token: h.ownerA })).status, 503);
  assert.equal((await api(new Request('https://rise-and-roost.com/api/studio'), h.env.DB, h.now, { publicWorkspaceId: PRODUCTION_WORKSPACE_ID, productionContext: { owner: { actor: {} }, workspaceId: PRODUCTION_WORKSPACE_ID } })).status, 403);
});
test('explicit checkout lock survives valid payment setup; missing, disabled and untested destinations block reservations', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  assert.equal((await h.order()).status, 409); assert.equal((await h.snapshot()).orders.length, 0);
  assert.equal((await h.configure()).status, 200);
  assert.equal((await h.call('/api/site')).data.checkoutEnabled, false);
  assert.equal((await h.order()).status, 409); assert.equal((await h.snapshot()).orders.length, 0);
  h.env.REAL_CHECKOUT_ENABLED = 'true';
  await h.change('payment-destination', { provider: 'paypal', url: 'https://www.paypal.com/ncp/payment/SYNTHETIC_ONLY', enabled: false, businessConfirmed: true });
  assert.equal((await h.order()).status, 409);
  await h.change('payment-destination', { provider: 'paypal', url: 'https://www.paypal.com/ncp/payment/UNTESTED_CHANGE', enabled: true, businessConfirmed: true });
  assert.equal((await h.order()).status, 409); assert.equal((await h.snapshot()).orders.length, 0);
});
test('production order confirmation, retry, private tracking, manual verification and three-stage fulfillment work end to end', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close()); await h.configure(); h.env.REAL_CHECKOUT_ENABLED = 'true';
  const requestId = crypto.randomUUID(), made = await h.order({ requestId }); assert.equal(made.status, 201, made.data.error);
  const o = made.data; assert.equal(o.simulated, false); assert.equal(o.paymentStatus, 'not_collected'); assert.match(o.orderNumber, /^RR-/);
  assert.equal((await h.order({ requestId })).data.id, o.id); assert.equal((await h.snapshot()).orders.length, 1);
  assert.equal((await h.track(o)).status, 200);
  assert.equal((await h.track(o, '', undefined, { Authorization: 'Bearer ' + 'a'.repeat(48) })).status, 404);
  assert.equal(JSON.stringify((await h.track(o)).data).includes('private-customer@example.test'), false);
  await h.track(o, '/payment-method', { method: 'paypal' });
  assert.equal((await h.snapshot()).management.today.verifiedSales, 0);
  assert.equal((await h.change('verify-payment', { id: o.id, orderVersion: o.version, method: 'paypal', independentlyVerified: false })).status, 400);
  const verified = await h.change('verify-payment', { id: o.id, orderVersion: o.version, method: 'paypal', independentlyVerified: true, evidence: '' });
  assert.equal(verified.status, 200, verified.data.error); assert.equal(verified.data.management.today.verifiedSales, o.total);
  const repeat = await h.change('verify-payment', { id: o.id, orderVersion: verified.data.orders[0].version, method: 'paypal', independentlyVerified: true });
  assert.equal(repeat.status, 200, repeat.data.error);
  assert.equal(repeat.data.management.today.verifiedSales, o.total); assert.equal(repeat.data.orders[0].verifications.length, 1);
  const tracked = (await h.track(o)).data; assert.equal(tracked.paymentStatus, 'verified'); assert.equal(tracked.paidReceipt.beta, false); assert.match(tracked.paidReceipt.number, /^RR-PAID-/);
  for (const status of ['preparing', 'ready']) {
    const current = (await h.snapshot()).orders[0]; assert.equal((await h.change('fulfillment', { id: o.id, orderVersion: current.version, status })).status, 200);
  }
  const current = (await h.snapshot()).orders[0];
  assert.equal((await h.change('fulfillment', { id: o.id, orderVersion: current.version, status: 'picked-up' })).status, 400);
  assert.equal((await h.track(o)).data.status, 'ready');
});
test('simultaneous production orders cannot oversell and canceling with inventory release restores availability', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close()); await h.configure(); h.env.REAL_CHECKOUT_ENABLED = 'true';
  const doc = JSON.parse(h.sql.prepare('SELECT published_json FROM workspaces').get().published_json); doc.products[0].stock = 1;
  h.sql.prepare('UPDATE workspaces SET published_json=?,draft_json=?').run(JSON.stringify(doc), JSON.stringify(doc));
  const results = await Promise.all([h.order(), h.order()]); assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const s = await h.snapshot(), o = s.orders[0]; assert.equal(s.orders.length, 1);
  const canceled = await h.change('fulfillment', { id: o.id, orderVersion: o.version, status: 'canceled', confirmCancellation: true, reason: 'Synthetic cancellation', releaseInventory: true });
  assert.equal(canceled.status, 200, canceled.data.error); assert.equal((await h.order()).status, 201);
});
