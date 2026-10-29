import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { drainNotifications } from '../server/notifications.mjs';
import { emailConfigured } from '../server/orders.mjs';

const now = Date.parse('2026-10-27T14:00:00Z');
async function fixture({ email = false } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async first() { return sql.prepare(query).get(...args) || null; },
    async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; },
  }; } }; } };
  const site = { publicWorkspaceId: '', emailEnabled: email };
  let cookie = '';
  async function call(path, body, options = {}) {
    const response = await api(new Request('https://beta.test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://beta.test', 'Content-Type': 'application/json', Cookie: options.anonymous ? '' : cookie, ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db, options.now || now, site);
    if (response.headers.has('set-cookie') && !options.anonymous) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json(), response };
  }
  const { data: workspace } = await call('/api/workspaces', {});
  site.publicWorkspaceId = workspace.id;
  const input = () => ({ workspaceId: workspace.id, revision: 1, requestId: crypto.randomUUID(), pickupId: workspace.published.pickups[0].id,
    lines: [{ productId: 'bread', variantId: 'classic', qty: 1, unitPrice: 900 }], total: 900 });
  const order = async (values = {}) => {
    const r = await call('/api/orders', { ...input(), ...values }, { anonymous: true });
    assert.equal(r.status, 201, r.data.error);
    return r.data;
  };
  const track = (o, report = false, key) => call(`/api/order-tracking/${workspace.id}/${o.id}${report ? '/report' : ''}`,
    report ? {} : undefined, { anonymous: true, headers: { Authorization: 'Bearer ' + (key || o.trackingPath.split('=')[1]) } });
  const ledger = () => JSON.parse(sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(workspace.id).ledger_json);
  const mutate = (fn) => { const l = ledger(); fn(l); sql.prepare('UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=?').run(JSON.stringify(l), workspace.id); };
  const verify = (o, extra = {}) => call('/api/order-payment', { id: o.id, version: o.version, independentlyVerified: true, method: 'bank_record', evidence: 'TEST-ONLY independent reference 001', ...extra });
  const env = { PUBLIC_WORKSPACE_ID: workspace.id, ORDER_EMAIL_ENABLED: 'true', ORDER_EMAIL_FROM: 'beta@example.test', RESEND_API_KEY: 'test-only-not-a-real-key' };
  return { call, db, site, workspace, order, track, ledger, mutate, verify, env, input };
}

test('orders have unique numbers and private cross-session tracking; public site and checkout omit internal records', async () => {
  const h = await fixture(); const a = await h.order(), b = await h.order();
  assert.notEqual(a.orderNumber, b.orderNumber);
  assert.match(a.orderNumber, /^RR-[A-F0-9]{16}$/);
  assert.match(a.trackingPath, new RegExp(`^/orders/${h.workspace.id}/${a.id}#access=[a-f0-9]{48}$`));
  for (const k of ['requestId', 'audit', 'verification', 'customer', 'trackingKey']) assert.equal(a[k], undefined);
  assert.equal((await h.track(a)).status, 200);
  assert.equal((await h.track(b, false, a.trackingPath.split('=')[1])).status, 404);
  const denied = await h.call(`/api/order-tracking/${h.workspace.id}/${a.id}`, undefined, { anonymous: true });
  assert.equal(denied.status, 401);
  const pub = await h.call('/api/site');
  assert.equal(JSON.stringify(pub.data).includes(a.id), false);
  assert.equal(pub.data.orders, undefined);
  assert.equal((await h.track(a)).response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await h.track(a)).response.headers.get('CDN-Cache-Control'), 'no-store');
});

test('payment reporting is persistent, idempotent and never verifies payment or starts preparation', async () => {
  const h = await fixture(), o = await h.order();
  const results = await Promise.all([h.track(o, true), h.track(o, true)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  const saved = (await h.track(o)).data;
  assert.equal(saved.paymentStatus, 'reported');
  assert.equal(saved.status, 'pending');
  assert.ok(saved.paymentReportedAt);
  assert.equal(saved.preparingAt, undefined);
  assert.equal(saved.paidReceipt, undefined);
  assert.equal(saved.version, 2);
  assert.equal(h.ledger().orders[0].audit.filter(a => a.action.includes('Payment reported')).length, 1);
});

test('independent verification requires owner authentication, an attestation and private evidence', async () => {
  const h = await fixture(), o = await h.order();
  for (const path of ['/api/order-payment', '/api/order-fulfillment', '/api/order-link'])
    assert.equal((await h.call(path, { id: o.id, version: 1 }, { anonymous: true })).status, 401);
  assert.equal((await h.verify(o, { independentlyVerified: false })).status, 400);
  assert.equal((await h.verify(o, { evidence: '' })).status, 400);
  assert.equal((await h.verify(o, { method: 'customer_claim' })).status, 400);
  assert.equal((await h.verify(o, { version: 9 })).status, 409);
  await h.call('/api/workspaces', {});
  assert.equal((await h.verify(o)).status, 400);
  assert.equal((await h.track(o)).data.paymentStatus, 'not_collected');
});

test('verification generates an immutable paid receipt without processing payment or changing fulfillment', async () => {
  const h = await fixture(), o = await h.order();
  const reported = (await h.track(o, true)).data;
  const result = await h.verify(reported);
  assert.equal(result.status, 200);
  const visible = (await h.track(o)).data;
  assert.equal(visible.paymentStatus, 'verified');
  assert.equal(visible.status, 'pending');
  assert.equal(visible.preparingAt, undefined);
  assert.equal(visible.verification, undefined);
  assert.equal(JSON.stringify(visible).includes('reference 001'), false);
  assert.equal(visible.paidReceipt.total, 900);
  assert.equal(visible.paidReceipt.websiteProcessedPayment, false);
  assert.equal(visible.paidReceipt.beta, true);
  const again = await h.verify(visible);
  assert.deepEqual(again.data.paidReceipt, visible.paidReceipt);
  assert.equal(h.ledger().orders[0].audit.filter(a => a.action.includes('receipt issued')).length, 1);
  assert.equal((await h.track(o, true)).data.paymentStatus, 'verified');
});

test('preparation and pickup advance only on explicit owner actions, independently of payment', async () => {
  const h = await fixture(), o = await h.order();
  const advance = async (value, status) => {
    const r = await h.call('/api/order-fulfillment', { id: o.id, version: value.version, status });
    assert.equal(r.status, 200, r.data.error); return r.data;
  };
  const p = await advance(o, 'preparing');
  assert.equal(p.paymentStatus, 'not_collected'); assert.ok(p.preparingAt);
  const ready = await advance(p, 'ready'); assert.ok(ready.readyAt);
  assert.equal((await h.track(o)).data.status, 'ready');
  const picked = await advance(ready, 'picked-up'); assert.ok(picked.pickedUpAt);
  assert.equal((await h.call('/api/order-fulfillment', { id: o.id, version: picked.version, status: 'preparing' })).status, 409);
  const other = await h.order(); const direct = await h.call('/api/order-fulfillment', { id: other.id, version: 1, status: 'ready' });
  assert.equal(direct.data.preparingAt, undefined);
});

test('a stale Studio or simultaneous payment and fulfillment update cannot overwrite newer order data', async () => {
  const h = await fixture(), o = await h.order();
  await h.track(o, true);
  assert.equal((await h.verify(o)).status, 409);
  const current = (await h.track(o)).data;
  const results = await Promise.all([h.verify(current), h.call('/api/order-fulfillment', { id: o.id, version: current.version, status: 'preparing' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(h.ledger().orders[0].version, 3);
});

test('old orders gain tracking without resetting their data and cancellation never claims a refund', async () => {
  const h = await fixture(), o = await h.order();
  h.mutate(l => { delete l.orders[0].trackingKey; delete l.orders[0].orderNumber; delete l.orders[0].version; });
  const before = h.ledger().orders[0];
  const linked = await h.call('/api/order-link', { id: o.id, version: 1 });
  assert.equal(linked.status, 200); assert.ok(linked.data.trackingPath);
  for (const k of ['id', 'at', 'requestId', 'pickup', 'lines', 'total', 'status']) assert.deepEqual(linked.data[k], before[k]);
  const cancel = await h.call('/api/order-fulfillment', { id: o.id, version: linked.data.version, status: 'canceled' });
  assert.equal(cancel.data.paymentStatus, 'not_collected');
  assert.equal((await h.track(linked.data, true)).status, 409);
  assert.equal((await h.verify(cancel.data)).status, 409);
});

test('email is optional, explicitly consented, validated, and only enabled on the configured primary workspace', async () => {
  const h = await fixture();
  assert.equal((await h.call('/api/orders', { ...h.input(), emailOptIn: true, email: 'test@example.test' })).status, 409);
  const o = await h.order({ email: 'ignored@example.test' });
  assert.equal(h.ledger().orders[0].customer.email, undefined);
  assert.deepEqual(o.notifications, []);
  const connected = await fixture({ email: true });
  assert.equal((await connected.call('/api/site')).data.notificationsEnabled, true);
  assert.equal((await connected.call('/api/orders', { ...connected.input(), emailOptIn: true, email: 'bad\r\nBcc:a@test.test' })).status, 400);
  connected.site.publicWorkspaceId = 'a'.repeat(48);
  assert.equal((await connected.call('/api/orders', { ...connected.input(), emailOptIn: true, email: 'test@example.test' })).status, 409);
});

test('email cannot be enabled without a valid sender, sending key, explicit flag and primary workspace', () => {
  const env = { PUBLIC_WORKSPACE_ID: 'a'.repeat(48), ORDER_EMAIL_ENABLED: 'true', ORDER_EMAIL_FROM: 'beta@example.test', RESEND_API_KEY: 'mock' };
  assert.equal(emailConfigured(env), true);
  for (const k of Object.keys(env)) assert.equal(emailConfigured({ ...env, [k]: '' }), false);
  assert.equal(emailConfigured({ ...env, ORDER_EMAIL_FROM: 'a@test.test\r\nBcc:x@x.test' }), false);
});

test('D1 outbox queues only opted-in lifecycle events and records provider acceptance without claiming delivery', async () => {
  const h = await fixture({ email: true }), o = await h.order({ emailOptIn: true, email: 'qa@example.test' });
  let calls = 0;
  const fetcher = async (url, init) => { calls++; assert.equal(url, 'https://api.resend.com/emails');
    const payload = JSON.parse(init.body); assert.equal(payload.to[0], 'qa@example.test');
    assert.ok(payload.text.includes(o.trackingPath)); assert.equal(payload.text.includes('being baked'), false);
    assert.match(payload.text, /Pickup: [A-Za-z]+, [A-Za-z]+ \d+ · 3:00 PM – 6:00 PM/);
    assert.equal(payload.text.includes('America/Indiana/Indianapolis'), false);
    return Response.json({ id: 'provider-accepted-' + calls }); };
  await Promise.all([drainNotifications(h.db, h.env, { fetcher, now }), drainNotifications(h.db, h.env, { fetcher, now })]);
  assert.equal(calls, 1);
  const customer = (await h.track(o)).data;
  assert.equal(customer.notifications[0].status, 'accepted');
  assert.ok(customer.notifications[0].acceptedAt);
  assert.equal(customer.notifications[0].delivered, undefined);
  assert.equal(customer.notifications[0].providerId, undefined);
  const p = (await h.track(o, true)).data;
  await h.verify(p);
  const v = (await h.track(o)).data;
  await h.call('/api/order-fulfillment', { id: o.id, version: v.version, status: 'preparing' });
  const prep = (await h.track(o)).data;
  await h.call('/api/order-fulfillment', { id: o.id, version: prep.version, status: 'ready' });
  assert.deepEqual(h.ledger().orders[0].notifications.map(n => n.event), ['received', 'verified', 'preparing', 'ready']);
  await drainNotifications(h.db, h.env, { fetcher, now });
  assert.equal(calls, 4);
});

for (const [label, response, expected] of [
  ['server error', () => Response.json({}, { status: 500 }), 'retry'],
  ['rate limit', () => Response.json({}, { status: 429 }), 'retry'],
  ['invalid provider configuration', () => Response.json({}, { status: 401 }), 'failed'],
  ['ambiguous success without an acceptance id', () => Response.json({}), 'retry'],
  ['network timeout', () => { throw new Error('timeout'); }, 'retry'],
]) test(`email ${label} never claims acceptance or delivery`, async () => {
  const h = await fixture({ email: true });
  await h.order({ emailOptIn: true, email: 'qa@example.test' });
  await drainNotifications(h.db, h.env, { fetcher: response, now });
  const n = h.ledger().orders[0].notifications[0];
  assert.equal(n.status, expected); assert.equal(n.acceptedAt, undefined); assert.equal(n.providerId, undefined);
});

test('uncertain email retries reuse the identical provider idempotency key and payload and stop before its expiry', async () => {
  const h = await fixture({ email: true }); await h.order({ emailOptIn: true, email: 'qa@example.test' });
  const submissions = [];
  await drainNotifications(h.db, h.env, { now, fetcher: async (_url, init) => { submissions.push(init); throw new Error('uncertain'); } });
  await drainNotifications(h.db, h.env, { now: now + 300000, fetcher: async (_url, init) => { submissions.push(init); return Response.json({ id: 'accepted' }); } });
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(submissions[0].body, submissions[1].body);
  h.mutate(l => { l.orders[0].notifications[0].status = 'sending'; l.orders[0].notifications[0].leaseUntil = now; });
  await drainNotifications(h.db, h.env, { now: now + 24 * 3600000, fetcher: async () => { assert.fail('must not resubmit outside provider idempotency window'); } });
  assert.equal(h.ledger().orders[0].notifications[0].status, 'expired');
});
