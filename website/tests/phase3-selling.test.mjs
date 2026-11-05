import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api, quote, validateDocument, availableDocument } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed } from '../public/model.mjs';
import { sellingMethod, inventoryMode, normalizeSellingMethod } from '../public/selling.mjs';

const now = Date.parse('2026-11-05T15:00:00Z');
const basket = (doc, qty = 1, pickup = doc.pickups[0]) => ({ pickupId: pickup.id, lines: [{ productId: doc.products[0].id, variantId: doc.products[0].variants[0].id, qty, unitPrice: doc.products[0].price }], total: doc.products[0].price * qty });
function document(method, values = {}) {
  const doc = seed(now);
  Object.assign(doc.products[0], { sellingMethod: method, archived: false, soldOut: false, stock: 1, capacity: 1, ...values });
  if (method === undefined) delete doc.products[0].sellingMethod;
  return validateDocument(doc);
}
async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), config = { customerExperienceEnabled: true, studioManagementEnabled: true, reviewBuild: true };
  let cookie = '';
  async function call(path, body, { guest = false } = {}) {
    const response = await api(new Request('https://phase3.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://phase3.test', 'Content-Type': 'application/json', Cookie: guest ? '' : cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db, now, config);
    if (!guest && response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  const created = await call('/api/workspaces', {}); config.publicWorkspaceId = created.data.id;
  const snapshot = async () => (await call('/api/manage/snapshot')).data;
  async function save(method, values = {}, quantity = 1) {
    const s = await snapshot(), product = { ...s.published.products[0], sellingMethod: method, archived: false, soldOut: false, ...values };
    return call('/api/manage/product', { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, product, ...(method === 'preorder' ? {} : { available: quantity }) });
  }
  async function order(values = {}) {
    const s = await snapshot();
    return call('/api/orders', { ...basket(s.published), workspaceId: s.id, storefront: 'main', revision: s.publishedRevision, requestId: crypto.randomUUID(), checkoutMode: 'guest', customerDetails: { name: 'Synthetic Phase Three Customer' }, ...values }, { guest: true });
  }
  return { sql, config, call, snapshot, save, order };
}

test('selling methods are explicit per product and preserve legacy accounting until changed', () => {
  assert.equal(sellingMethod({ channel: 'store' }), 'in-store');
  assert.equal(sellingMethod({ channel: 'preorder', inventoryMode: 'physical' }), 'online');
  assert.equal(sellingMethod({ channel: 'preorder' }), 'preorder');
  assert.equal(inventoryMode({ channel: 'preorder' }), 'legacy');
  assert.equal(inventoryMode({ channel: 'store', capacity: 0 }), 'physical');
  for (const [method, mode, channel] of [['online', 'physical', 'preorder'], ['preorder', 'production', 'preorder'], ['in-store', 'physical', 'store']]) {
    const p = normalizeSellingMethod({ sellingMethod: method, channel: 'store', inventoryMode: 'legacy' });
    assert.equal(p.inventoryMode, mode); assert.equal(p.channel, channel); assert.equal(sellingMethod(p), method);
  }
  const legacy = { channel: 'preorder', stock: 12, capacity: 3 };
  assert.deepEqual(normalizeSellingMethod(legacy), legacy);
  assert.throws(() => document('something-else'), /Choose Online Ordering/);
});

test('direct quotes enforce all three methods even when supplied channel or inventory fields disagree', () => {
  for (const method of ['online', 'preorder']) {
    const doc = document(method, { stock: method === 'online' ? 1 : 0 });
    assert.equal(quote(doc, { orders: [] }, basket(doc), now).lines.length, 1);
    assert.throws(() => quote(doc, { orders: [] }, basket(doc, 2), now), /capacity/);
  }
  const store = document('in-store'); store.products[0].channel = 'preorder'; store.products[0].inventoryMode = 'production';
  assert.throws(() => quote(store, { orders: [] }, basket(store), now), /unavailable/);
});

test('online and in-store items stay visible at zero and recover when restocked', () => {
  for (const method of ['online', 'in-store']) {
    const doc = document(method, { stock: 0 });
    const sold = availableDocument(doc, { orders: [] }, { managed: true, now });
    assert.equal(sold.products.find(p => p.id === doc.products[0].id).stock, 0);
    assert.equal(sold.products[0].active, true); assert.equal(sold.products[0].archived, false);
    doc.products[0].stock = 4;
    assert.equal(availableDocument(doc, { orders: [] }, { now }).products[0].stock, 4);
    if (method === 'online') assert.equal(quote(doc, { orders: [] }, basket(doc), now).lines.length, 1);
    else assert.throws(() => quote(doc, { orders: [] }, basket(doc), now), /unavailable/);
  }
  const legacyStore = document(undefined, { channel: 'store', stock: 3, capacity: 0 });
  const listed = availableDocument(legacyStore, { orders: [] }, { managed: true, now }).products[0];
  assert.equal(listed.stock, 3, 'An unused preorder limit cannot mark an in-store product sold out.');
  assert.equal(inventoryMode(listed), 'physical');
});

test('preorder availability accounts for date capacity, shared windows, full dates and canceled reservations', () => {
  const doc = document('preorder', { stock: 0, capacity: 1 }), first = doc.pickups[0];
  doc.pickups = [first, { ...first, id: 'second-same-day', start: '18:01', end: '19:00' }];
  const booked = { ...quote(doc, { orders: [] }, basket(doc), now), id: 'synthetic', originalPickup: structuredClone(first) };
  const ledger = { orders: [booked] }, sold = availableDocument(doc, ledger, { managed: true, now });
  assert.equal(sold.products[0].stock, 0); assert.equal(sold.products[0].active, true);
  assert.ok(sold.pickups.every(p => p.productionRemaining[doc.products[0].id] === 0));
  assert.throws(() => quote(doc, ledger, basket(doc, 1, doc.pickups[1]), now), /capacity/);
  doc.products[0].capacity = 2;
  assert.equal(availableDocument(doc, ledger, { managed: true, now }).products[0].stock, 1);
  booked.status = 'canceled'; doc.products[0].capacity = 1;
  assert.equal(availableDocument(doc, ledger, { managed: true, now }).products[0].stock, 1);
  booked.keepInventory = true;
  assert.equal(availableDocument(doc, ledger, { managed: true, now }).products[0].stock, 0);
  ledger.orders = []; doc.pickups.forEach(p => { p.capacity = 0; });
  assert.equal(availableDocument(doc, ledger, { managed: true, now }).products[0].stock, 0);
});

test('legacy preorders retain both stock and pickup limits while explicit preorders use make-ahead limits', () => {
  const doc = document(undefined, { stock: 0, capacity: 4 });
  assert.equal(availableDocument(doc, { orders: [] }, { managed: true, now }).products[0].stock, 0);
  assert.throws(() => quote(doc, { orders: [] }, basket(doc), now), /capacity/);
  doc.products[0].sellingMethod = 'preorder';
  assert.equal(availableDocument(doc, { orders: [] }, { managed: true, now }).products[0].stock, 4);
  assert.equal(quote(doc, { orders: [] }, basket(doc), now).total, doc.products[0].price);
  delete doc.products[0].sellingMethod; doc.products[0].inventoryMode = 'legacy';
  doc.products[0].stock = 3; doc.products[0].capacity = 0;
  doc.pickups.forEach(p => { p.productionLimits = { [doc.products[0].id]: 2 }; });
  assert.equal(availableDocument(doc, { orders: [] }, { managed: true, now }).products[0].stock, 2);
  assert.equal(quote(doc, { orders: [] }, basket(doc), now).lines.length, 1);
});

test('past windows never appear in the customer calendar, while hidden history and zero-stock catalog entries are distinct', () => {
  const doc = document('online', { stock: 0 });
  const historical = structuredClone(doc.pickups[0]); historical.id = 'past-date'; historical.date = '2026-11-01'; historical.cutoffDate = '2026-10-31';
  doc.pickups.push(historical);
  const ledger = { orders: [{ pickupId: historical.id, pickup: structuredClone(historical), lines: [], status: 'picked-up' }] }, before = structuredClone(ledger);
  assert.ok(availableDocument(doc, ledger, { now }).pickups.every(p => p.id !== historical.id));
  doc.products[1].active = false; doc.products[2].archived = true;
  const publicDoc = availableDocument(doc, ledger, { managed: true, now });
  assert.deepEqual(publicDoc.products.map(p => p.id), [doc.products[0].id]);
  assert.equal(publicDoc.products[0].stock, 0); assert.deepEqual(ledger, before);
});

test('daily announcement validation accepts clearing and rejects malformed or oversized text', () => {
  const doc = document('online');
  for (const value of ['', 'Fresh cookies available today!']) { doc.freshAnnouncement = value; assert.equal(validateDocument(doc).freshAnnouncement, value); }
  for (const value of [null, {}, 'x'.repeat(241)]) { doc.freshAnnouncement = value; assert.throws(() => validateDocument(doc), /daily announcement/); }
});

test('direct API purchases reject in-store-only products and switching preserves existing order snapshots', async () => {
  const h = await fixture();
  assert.equal((await h.save('online')).status, 200);
  const first = await h.order(); assert.equal(first.status, 201);
  assert.equal((await h.save('in-store', {}, 3)).status, 200);
  assert.equal((await h.order()).status, 400);
  let s = await h.snapshot(); assert.deepEqual(s.orders[0].lines, first.data.lines); assert.equal(s.orders[0].total, first.data.total);
  assert.equal((await h.save('preorder', { capacity: 2 })).status, 200);
  assert.equal((await h.order()).status, 201); assert.equal((await h.order()).status, 409);
  assert.equal((await h.save('online', {}, 2)).status, 200);
  assert.equal((await h.order()).status, 201);
  s = await h.snapshot(); assert.equal(s.orders.find(o => o.id === first.data.id).lines[0].unitPrice, first.data.lines[0].unitPrice);
  const store = s.published.products[0]; assert.equal(store.id, first.data.lines[0].productId);
});

test('two concurrent direct requests cannot oversell the last online item or preorder unit; restocking restores orders', async () => {
  for (const method of ['online', 'preorder']) {
    const h = await fixture(); assert.equal((await h.save(method, { capacity: 1 }, 1)).status, 200);
    const s = await h.snapshot();
    assert.equal((await h.call('/api/manage/calendar', { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, pickups: [s.published.pickups[0]], paused: false })).status, 200);
    const attempts = await Promise.all([h.order(), h.order()]);
    assert.deepEqual(attempts.map(r => r.status).sort(), [201, 409]);
    const catalog = (await h.call('/api/site', undefined, { guest: true })).data.document;
    assert.equal(catalog.products[0].stock, 0); assert.equal(catalog.products[0].active, true);
    assert.equal((await h.snapshot()).management.products[0].availableToOrder, 0);
    assert.equal((await h.save(method, { capacity: 2 }, 1)).status, 200);
    assert.equal((await h.snapshot()).management.products[0].availableToOrder, 1);
    assert.equal((await h.order()).status, 201);
  }
});
