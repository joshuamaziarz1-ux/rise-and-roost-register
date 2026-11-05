import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';

async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), now = Date.parse('2026-10-30T14:00:00Z'), origin = 'https://phase3.test';
  const config = { publicWorkspaceId: '', customerExperienceEnabled: true, studioManagementEnabled: true, reviewBuild: true };
  const owner = new Map(), guest = new Map();
  async function call(client, path, body, at = now) {
    const response = await api(new Request(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...client].map(([k,v]) => k + '=' + v).join('; '), ...(config.publicWorkspaceId && path.startsWith('/api/manage/') ? { 'X-RR-Workspace': config.publicWorkspaceId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db, at, config);
    for (const cookie of response.headers.getSetCookie()) {
      const [key, value] = cookie.split(';')[0].split('=');
      if (cookie.includes('Max-Age=0')) client.delete(key); else client.set(key, value);
    }
    return { status: response.status, data: await response.json() };
  }
  const site = (await call(owner, '/api/workspaces', {})).data;
  config.publicWorkspaceId = site.id;
  const snapshot = async () => (await call(owner, '/api/manage/snapshot')).data;
  const change = async (path, body, at = now) => {
    const s = await snapshot();
    return call(owner, '/api/manage/' + path, { revision: s.revision, ledgerVersion: s.ledgerVersion, operationId: crypto.randomUUID(), ...body }, at);
  };
  const order = async () => {
    const s = await snapshot(), p = s.published.products[0];
    return call(guest, '/api/orders', { workspaceId: site.id, storefront: 'main', revision: s.publishedRevision, requestId: crypto.randomUUID(), pickupId: s.published.pickups[0].id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Phase 3' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price });
  };
  return { sql, now, owner, guest, call, snapshot, change, order };
}

test('Phase 3 method changes retain product identity, reservations, order snapshots and automatic audit', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const original = (await h.order()).data;
  const s = await h.snapshot(), p = { ...s.published.products[0], sellingMethod: 'online', inventoryMode: 'legacy', channel: 'store', archived: false, soldOut: false, price: 1200 };
  const saved = await h.change('product', { product: p, available: 2 });
  assert.equal(saved.status, 200, saved.data.error);
  const next = await h.snapshot(), product = next.management.products[0];
  assert.equal(product.id, p.id); assert.equal(product.sellingMethod, 'online'); assert.equal(product.inventoryMode, 'physical'); assert.equal(product.channel, 'preorder');
  assert.equal(product.stock, 3); assert.equal(product.available, 2);
  assert.deepEqual(next.orders[0].lines, original.lines); assert.equal(next.orders[0].total, original.total);
  const audit = next.management.audit.find(a => a.kind === 'inventory');
  assert.equal(audit.reason, 'Product details and availability saved by owner'); assert.equal(audit.after.sellingMethod, 'online'); assert.ok(audit.actor);
  const inStore = await h.change('product', { product: { ...product, sellingMethod: 'in-store' }, available: 0 });
  assert.equal(inStore.status, 200, inStore.data.error);
  assert.equal((await h.order()).status, 400);
  const final = await h.snapshot(); assert.equal(final.management.products[0].stock, 1); assert.deepEqual(final.orders[0].lines, original.lines);
});

test('Phase 3 hiding requires confirmation, preserves history and showing does not change stock', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const original = (await h.order()).data, s = await h.snapshot(), p = s.published.products[0];
  assert.equal((await h.change('product-visibility', { id: p.id, hidden: true })).status, 400);
  assert.equal((await h.change('product-visibility', { id: p.id, hidden: true, confirmed: true })).status, 200);
  let next = await h.snapshot();
  assert.equal(next.published.products[0].active, false); assert.equal(next.published.products[0].archived, true);
  assert.deepEqual(next.orders[0].lines, original.lines);
  const history = next.management.audit.find(a => a.kind === 'product-visibility-history');
  assert.equal(history.before.active, true); assert.equal(history.after.active, false);
  assert.equal((await h.call(h.guest, '/api/site')).data.document.products.some(v => v.id === p.id), false);
  assert.equal((await h.change('product-visibility', { id: p.id, hidden: false, confirmed: true })).status, 200);
  next = await h.snapshot(); assert.equal(next.published.products[0].stock, p.stock); assert.equal(next.published.products[0].active, true);
  assert.equal(next.published.products[0].archived, false); assert.deepEqual(next.orders[0].lines, original.lines);
});

test('Phase 3 announcement edit, clear, retry, length and owner safeguards', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  assert.equal((await h.call(h.guest, '/api/manage/fresh-announcement', { operationId: crypto.randomUUID(), announcement: 'No' })).status, 401);
  assert.equal((await h.change('fresh-announcement', { announcement: 'x'.repeat(241) })).status, 400);
  const s = await h.snapshot(), input = { revision: s.revision, ledgerVersion: s.ledgerVersion, operationId: crypto.randomUUID(), announcement: '  Fresh cookies available today!  ' };
  assert.equal((await h.call(h.owner, '/api/manage/fresh-announcement', input)).status, 200);
  const retry = await h.call(h.owner, '/api/manage/fresh-announcement', input);
  assert.equal(retry.status, 200); assert.equal(retry.data.duplicate, true);
  assert.equal((await h.call(h.guest, '/api/site')).data.document.freshAnnouncement, 'Fresh cookies available today!');
  const next = await h.snapshot(); assert.equal(next.draft.freshAnnouncement, next.published.freshAnnouncement); assert.equal(next.hasContentDraft, false);
  assert.equal(next.management.audit.filter(a => a.kind === 'fresh-announcement').length, 1);
  assert.equal((await h.change('fresh-announcement', { announcement: '' })).status, 200);
  assert.equal((await h.call(h.guest, '/api/site')).data.document.freshAnnouncement, '');
});

test('Phase 3 content editing and history restore cannot replace the current daily announcement', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const old = await h.snapshot(), doc = structuredClone(old.draft);
  doc.pages[0].sections[0].title = 'Synthetic saved draft';
  assert.equal((await h.change('fresh-announcement', { announcement: 'Today only' })).status, 200);
  assert.equal((await h.change('content', { document: doc })).status, 200);
  assert.equal((await h.snapshot()).draft.freshAnnouncement, 'Today only');
  assert.equal((await h.change('publish', {})).status, 200);
  const versions = JSON.parse(h.sql.prepare('SELECT versions_json FROM workspaces').get().versions_json);
  const version = versions.find(v => (v.document.freshAnnouncement || '') !== 'Today only');
  assert.ok(version, 'a pre-announcement version is retained');
  assert.equal((await h.change('restore-content', { versionId: version.id })).status, 200);
  assert.equal((await h.call(h.guest, '/api/site')).data.document.freshAnnouncement, 'Today only');
});

test('Phase 3 changing deadlines warns about booked orders and preserves their exact commitments', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const original = (await h.order()).data, s = await h.snapshot(), pickups = structuredClone(s.published.pickups);
  pickups[0].cutoffTime = '09:00';
  assert.equal((await h.change('calendar', { pickups, paused: false })).status, 409);
  const saved = await h.change('calendar', { pickups, paused: false, confirmExistingOrders: true });
  assert.equal(saved.status, 200, saved.data.error); assert.equal(saved.data.result.affectedOrders, 1);
  const next = await h.snapshot(); assert.equal(next.published.pickups[0].cutoffTime, '09:00');
  assert.deepEqual(next.orders[0].pickup, original.pickup); assert.equal(next.orders[0].pickupDeadline, original.pickupDeadline);
  assert.deepEqual(next.orders[0].policyAcceptance, original.policyAcceptance);
});

test('Phase 3 removal retains booked date and canceled order history behind explicit confirmation', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const original = (await h.order()).data;
  let s = await h.snapshot();
  assert.equal((await h.change('fulfillment', { id: original.id, orderVersion: s.orders[0].version, status: 'canceled', confirmCancellation: true, releaseInventory: true, reason: 'Synthetic cancellation' })).status, 200);
  s = await h.snapshot(); const pickups = s.published.pickups.filter(p => p.id !== original.pickup.id);
  assert.equal((await h.change('calendar', { pickups, paused: false })).status, 409);
  const saved = await h.change('calendar', { pickups, paused: false, confirmExistingOrders: true });
  assert.equal(saved.status, 200, saved.data.error);
  s = await h.snapshot(); assert.equal(s.published.pickups.find(p => p.id === original.pickup.id).closed, true);
  assert.deepEqual(s.orders[0].pickup, original.pickup); assert.equal(s.orders[0].status, 'canceled');
  assert.equal((await h.call(h.guest, '/api/site')).data.document.pickups.some(p => p.id === original.pickup.id), false);
});

test('Phase 3 past dates remain immutable in history and disappear from active customer dates', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const row = h.sql.prepare('SELECT * FROM workspaces').get();
  const published = JSON.parse(row.published_json), draft = JSON.parse(row.draft_json);
  for (const doc of [published, draft]) Object.assign(doc.pickups[0], { date: '2026-10-29', cutoffDate: '2026-10-28' });
  h.sql.prepare('UPDATE workspaces SET published_json=?,draft_json=?').run(JSON.stringify(published), JSON.stringify(draft));
  const s = await h.snapshot(), at = h.now;
  const pickups = structuredClone(s.published.pickups), original = structuredClone(pickups[0]);
  pickups[0].cutoffTime = '08:00';
  assert.equal((await h.change('calendar', { pickups, paused: false }, at)).status, 409);
  assert.equal((await h.change('calendar', { pickups: s.published.pickups.slice(1), paused: false }, at)).status, 200);
  const next = await h.snapshot(); assert.deepEqual(next.published.pickups.find(p => p.id === original.id), original);
  const live = await h.call(h.guest, '/api/site', undefined, at);
  assert.equal(live.data.document.pickups.some(p => p.id === original.id), false);
});

test('Phase 3 calendar stale-ledger changes cannot overlook newly arrived orders', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const before = await h.snapshot(); assert.equal((await h.order()).status, 201);
  const r = await h.call(h.owner, '/api/manage/calendar', { revision: before.revision, ledgerVersion: before.ledgerVersion, operationId: crypto.randomUUID(), pickups: before.published.pickups.slice(1), paused: false, confirmExistingOrders: true });
  assert.equal(r.status, 409); assert.equal((await h.snapshot()).published.pickups[0].id, before.published.pickups[0].id);
});
