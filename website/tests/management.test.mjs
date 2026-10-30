import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { businessDay, reportRange, financialReport, productionList } from '../server/management.mjs';

async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), now = Date.parse('2026-10-30T14:00:00Z'), origin = 'https://studio.test';
  const config = { publicWorkspaceId: '', customerExperienceEnabled: true, studioManagementEnabled: true, reviewBuild: true };
  const owner = new Map(), guest = new Map(), other = new Map();
  const call = async (client, path, body, options = {}) => {
    const response = await api(new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json', Cookie: [...client].map(([k,v]) => k+'='+v).join('; '),
      ...(config.publicWorkspaceId && path.startsWith('/api/manage/') ? { 'X-RR-Workspace': options.workspace || config.publicWorkspaceId } : {}), ...options.headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db, options.now ?? now, config);
    for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(';')[0].split('='); if (cookie.includes('Max-Age=0')) client.delete(key); else client.set(key, value); }
    return { status: response.status, data: await response.json(), response };
  };
  const site = (await call(owner, '/api/workspaces', {})).data; config.publicWorkspaceId = site.id;
  const snapshot = async (options = {}) => (await call(options.client || owner, '/api/manage/snapshot'+(options.query || ''), undefined, options)).data;
  const change = async (path, data, options = {}) => {
    const s = await snapshot(options);
    return call(options.client || owner, '/api/manage/'+path, { revision: s.revision, ledgerVersion: s.ledgerVersion, operationId: crypto.randomUUID(), ...(path === 'fulfillment' && data.status === 'canceled' ? { confirmCancellation: true } : {}), ...data }, options);
  };
  const product = async (values = {}) => {
    const s = await snapshot(); const p = { ...s.published.products[0], archived: false, soldOut: false, inventoryMode: 'physical', lowStockThreshold: 2, ...values };
    return change('product', { product: p, available: values.stock ?? 10, reason: 'Synthetic inventory test', confirmArchive: !!values.archived });
  };
  const order = async (values = {}, options = {}) => {
    const s = await snapshot(), pickup = s.published.pickups[0], p = s.published.products[0];
    return call(options.client || guest, '/api/orders', { workspaceId: site.id, storefront: 'main', revision: s.publishedRevision, requestId: crypto.randomUUID(), pickupId: pickup.id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Neighbor' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price, ...values }, options);
  };
  const verify = async (o, options = {}) => change('verify-payment', { id: o.id, orderVersion: o.version, independentlyVerified: true, method: 'cash_record', evidence: 'SYNTHETIC cash receipt 001' }, options);
  return { sql, db, now, origin, config, owner, guest, other, call, site, snapshot, change, product, order, verify };
}
test('Studio API requires exact-workspace owner authentication and preserves customer privacy', async () => {
  const h = await fixture();
  assert.equal((await h.call(h.guest, '/api/manage/snapshot')).status, 401);
  assert.equal((await h.call(h.guest, '/api/manage/export')).status, 401);
  const other = (await h.call(h.other, '/api/workspaces', {})).data;
  assert.equal((await h.call(h.other, '/api/manage/snapshot')).status, 401);
  assert.equal((await h.call(h.owner, '/api/manage/snapshot', undefined, { workspace: other.id })).status, 401);
  const valid = await h.call(h.owner, '/api/manage/snapshot'); assert.equal(valid.status, 200); assert.equal(valid.data.id, h.site.id);
  assert.equal(valid.response.headers.get('Cache-Control'), 'no-store'); assert.equal(valid.data.management.ownerAccounts.configured, false);
  assert.equal((await h.call(h.owner, '/api/manage/notifications', { operationId: crypto.randomUUID(), preferences: {} }, { headers: { Origin: 'https://evil.test' } })).status, 403);
});
test('two customers cannot buy the last physical item; duplicate submissions reserve once', async () => {
  const h = await fixture(); assert.equal((await h.product({ stock: 1 })).status, 200);
  const input = { requestId: crypto.randomUUID() }, results = await Promise.all([h.order(input), h.order()]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const saved = await h.snapshot(); assert.equal(saved.orders.length, 1); assert.equal(saved.management.products[0].available, 0);
  const requestId = saved.orders[0].requestId;
  assert.equal((await h.order({ requestId })).status, 200); assert.equal((await h.snapshot()).orders.length, 1);
});
test('production capacity is per date and separate from physical stock', async () => {
  const h = await fixture(); assert.equal((await h.product({ inventoryMode: 'production', stock: 0, capacity: 1 })).status, 200);
  let s = await h.snapshot(), pickups = structuredClone(s.published.pickups);
  pickups[1].productionLimits = { bread: 2 };
  assert.equal((await h.change('calendar', { pickups, paused: false })).status, 200);
  assert.equal((await h.order()).status, 201); assert.equal((await h.order()).status, 409);
  assert.equal((await h.order({ pickupId: pickups[1].id })).status, 201);
  assert.equal((await h.order({ pickupId: pickups[1].id })).status, 201);
  assert.equal((await h.order({ pickupId: pickups[1].id })).status, 409);
  const publicSite = (await h.call(h.guest, '/api/site')).data;
  assert.equal(publicSite.document.pickups.find(p => p.id === pickups[1].id).productionRemaining.bread, 0);
});
test('operational saves preserve unpublished content and publish cannot restore stale prices', async () => {
  const h = await fixture(); let s = await h.snapshot(), doc = structuredClone(s.draft);
  doc.pages[0].sections[0].title = 'A saved unpublished welcome';
  assert.equal((await h.change('content', { document: doc })).status, 200);
  assert.equal((await h.snapshot()).hasContentDraft, true);
  assert.notEqual((await h.call(h.guest, '/api/site')).data.document.pages[0].sections[0].title, doc.pages[0].sections[0].title);
  assert.equal((await h.product({ price: 1200 })).status, 200);
  assert.equal((await h.snapshot()).hasContentDraft, true);
  s = await h.snapshot(); assert.equal(s.draft.pages[0].sections[0].title, doc.pages[0].sections[0].title); assert.equal(s.published.products[0].price, 1200);
  assert.equal((await h.change('publish', {})).status, 200);
  assert.equal((await h.snapshot()).hasContentDraft, false);
  const live = (await h.call(h.guest, '/api/site')).data.document;
  assert.equal(live.products[0].price, 1200); assert.equal(live.pages[0].sections[0].title, doc.pages[0].sections[0].title);
  s = await h.snapshot(); doc = structuredClone(s.draft); doc.theme.primary = '#000000';
  assert.equal((await h.change('content', { document: doc })).status, 400);
});
test('concurrent owner edits conflict and uncertain retries cannot apply an adjustment twice', async () => {
  const h = await fixture(), s = await h.snapshot();
  const p = { ...s.published.products[0], archived: false, soldOut: false, inventoryMode: 'physical' };
  const input = { revision: s.revision, ledgerVersion: s.ledgerVersion, operationId: crypto.randomUUID(), product: p, available: 4 };
  const results = await Promise.all([h.call(h.owner, '/api/manage/product', input), h.call(h.owner, '/api/manage/product', { ...input, operationId: crypto.randomUUID(), available: 5 })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const retry = await h.call(h.owner, '/api/manage/product', input); assert.equal(retry.status, 200); assert.equal(retry.data.duplicate, true);
  assert.equal((await h.call(h.owner, '/api/manage/product', { ...input, available: 9 })).status, 409);
  assert.equal((await h.snapshot()).management.products[0].available, 4);
});
test('abandoning an unconfirmed operation fences late arrival without undoing a committed save', async () => {
  const h = await fixture(), operationId = crypto.randomUUID(), s = await h.snapshot();
  assert.equal((await h.call(h.owner, '/api/manage/abandon-operation', { operationId })).status, 200);
  const late = await h.call(h.owner, '/api/manage/product', { operationId, revision: s.revision, ledgerVersion: s.ledgerVersion, product: { ...s.published.products[0], archived: false, soldOut: false }, available: 7 });
  assert.equal(late.status, 409); assert.notEqual((await h.snapshot()).management.products[0].available, 7);
});
test('archiving keeps historical order snapshots and blocks future checkout', async () => {
  const h = await fixture(), order = (await h.order()).data;
  assert.equal((await h.product({ archived: true, price: 1400 })).status, 200);
  let s = await h.snapshot(); assert.equal(s.orders[0].lines[0].unitPrice, 900); assert.equal(s.orders[0].total, order.total);
  assert.equal((await h.order()).status, 400);
  assert.equal((await h.product({ archived: false, active: true })).status, 200); assert.equal((await h.order()).status, 201);
});
test('changing booked pickup dates requires confirmation and never moves historical orders', async () => {
  const h = await fixture(), o = (await h.order()).data; let s = await h.snapshot(), pickups = structuredClone(s.published.pickups);
  pickups[0].date = pickups[1].date;
  assert.equal((await h.change('calendar', { pickups, paused: false })).status, 409);
  const r = await h.change('calendar', { pickups, paused: false, confirmExistingOrders: true }); assert.equal(r.status, 200);
  s = await h.snapshot(); assert.deepEqual(s.orders[0].pickup, o.pickup);
  assert.equal(s.published.pickups.find(p => p.id === o.pickup.id).closed, true);
  assert.equal((await h.call(h.guest, '/api/site')).data.document.pickups.some(p => p.id === o.pickup.id), false);
  assert.equal((await h.change('calendar', { pickups: s.published.pickups, paused: true, confirmExistingOrders: true })).status, 200);
  assert.equal((await h.order()).status, 409); assert.equal((await h.call(h.guest, '/api/site')).data.document.pickups.length, 0);
});
test('payment reports never become sales; independently verified refunds are idempotent and separate from cancellation', async () => {
  const h = await fixture(), o = (await h.order()).data;
  const tracking = new URL(o.trackingPath, h.origin), secret = new URLSearchParams(tracking.hash.slice(1)).get('access');
  await h.call(h.guest, tracking.pathname.replace('/orders/', '/api/order-tracking/')+'/report', {}, { headers: { Authorization: 'Bearer '+secret } });
  let s = await h.snapshot(); assert.equal(s.management.today.verifiedSales, 0); assert.equal(s.management.today.reportedValue, 900);
  assert.equal((await h.verify(s.orders[0])).status, 200); s = await h.snapshot(); assert.equal(s.management.today.verifiedSales, 900);
  assert.equal((await h.change('fulfillment', { id: o.id, orderVersion: s.orders[0].version, status: 'canceled', reason: 'Synthetic cancellation', releaseInventory: true })).status, 200);
  s = await h.snapshot(); assert.equal(s.management.today.netVerifiedReceipts, 900);
  const refund = { operationId: crypto.randomUUID(), id: o.id, orderVersion: s.orders[0].version, amount: 300, evidence: 'SYNTHETIC refund 001', reason: 'Synthetic refund', independentlyVerified: true };
  assert.equal((await h.change('refund', refund)).status, 200); assert.equal((await h.change('refund', refund)).status, 200);
  s = await h.snapshot(); assert.equal(s.management.today.refunds, 300); assert.equal(s.management.today.netVerifiedReceipts, 600); assert.equal(s.orders[0].paymentStatus, 'partially_refunded');
  assert.equal((await h.change('refund', { ...refund, operationId: crypto.randomUUID(), orderVersion: s.orders[0].version, amount: 700, evidence: 'SYNTHETIC refund 002' })).status, 400);
  const publicOrder = (await h.call(h.guest, tracking.pathname.replace('/orders/', '/api/order-tracking/'), undefined, { headers: { Authorization: 'Bearer '+secret } })).data;
  assert.equal(publicOrder.refunds[0].amount, 300); assert.equal(JSON.stringify(publicOrder).includes('SYNTHETIC refund'), false);
});
test('business-local reports use verification time and correct DST date boundaries', () => {
  assert.equal(businessDay('2026-10-31T03:30:00Z'), '2026-10-30');
  const range = reportRange('today', Date.parse('2026-10-31T03:30:00Z'));
  const o = { at: '2026-10-29T14:00:00Z', paymentVerifiedAt: '2026-10-31T03:30:00Z', total: 900, lines: [], refunds: [], status: 'pending' };
  const r = financialReport([o], range); assert.equal(r.orderValue, 0); assert.equal(r.verifiedSales, 900);
  const spring = reportRange('today', Date.parse('2026-03-08T12:00:00Z')), fall = reportRange('today', Date.parse('2026-11-01T12:00:00Z'));
  assert.equal(spring.until - spring.first, 23*3600000); assert.equal(fall.until - fall.first, 25*3600000);
});
test('production lists combine varieties and exclude canceled or collected orders', async () => {
  const h = await fixture(); await h.order(); await h.order(); const s = await h.snapshot();
  const list = productionList(s.orders, s.orders[0].pickup.date); assert.equal(list.products[0].quantity, 2);
  assert.equal((await h.change('fulfillment', { id: s.orders[0].id, orderVersion: s.orders[0].version, status: 'canceled', reason: 'Synthetic', releaseInventory: true })).status, 200);
  const next = await h.snapshot(); assert.equal(productionList(next.orders, next.orders[0].pickup.date).products[0].quantity, 1);
});
test('comment moderation is versioned, audited and preserves hidden text', async () => {
  const h = await fixture();
  await h.call(h.guest, '/api/comments', { workspaceId: h.site.id, name: 'Synthetic Neighbor', body: 'A lovely synthetic loaf.', publicConsent: true });
  let s = await h.snapshot(), c = s.management.comments[0]; assert.equal(s.management.attention.comments, 1);
  assert.equal((await h.change('comment', { id: c.id, version: c.version, status: 'approved' })).status, 200);
  assert.equal((await h.change('comment', { id: c.id, version: c.version, status: 'hidden' })).status, 409);
  s = await h.snapshot(); c = s.management.comments[0]; await h.change('comment', { id: c.id, version: c.version, status: 'hidden' });
  s = await h.snapshot(); assert.equal(s.management.comments[0].body, 'A lovely synthetic loaf.'); assert.equal(s.management.audit[0].actor.authentication, 'workspace_access');
});
test('actual business backup restores into a private copy without credentials, old links, or source changes', async () => {
  const h = await fixture();
  const memberId = 'ab'.repeat(24);
  h.sql.prepare('INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) VALUES(?,?,?,?,?)').run(memberId, h.site.id, JSON.stringify({ name: 'Synthetic Member', email: 'restore@example.test', phone: '' }), 'never-export-this-recovery-hash', h.now);
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const asset = (await h.call(h.owner, '/api/upload', { mime: 'image/png', data: image })).data;
  await h.product({ images: [{ src: asset.src, alt: 'Synthetic restored photo', x: 50, y: 50 }] });
  await h.order();
  const ledger = JSON.parse(h.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(h.site.id).ledger_json); ledger.orders[0].customer.memberId = memberId;
  h.sql.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').run(JSON.stringify(ledger), h.site.id);
  await h.call(h.guest, '/api/comments', { workspaceId: h.site.id, name: 'Synthetic Neighbor', body: 'Restore this original comment.', publicConsent: true });
  const before = h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get(h.site.id);
  const backup = (await h.call(h.owner, '/api/manage/export')).data;
  assert.equal(backup.owner_hash, undefined); assert.equal(backup.sessions, undefined);
  assert.equal(backup.members[0].recovery_hash, undefined);
  const target = (await h.call(h.other, '/api/workspaces', {})).data;
  const newAsset = (await h.call(h.other, '/api/upload', { mime: 'image/png', data: image }, { headers: { 'X-RR-Workspace': target.id } })).data;
  const restored = await h.change('import', { backup, confirmPrivateCopy: true, assetMap: { [asset.src.split('/').at(-1)]: newAsset.src } }, { client: h.other, workspace: target.id });
  assert.equal(restored.status, 200, restored.data.error); assert.equal(restored.data.orders.length, 1);
  assert.deepEqual(restored.data.orders[0].lines, backup.ledger.orders[0].lines);
  assert.notEqual(restored.data.orders[0].trackingKey, backup.ledger.orders[0].trackingKey);
  assert.equal(restored.data.management.comments[0].body, 'Restore this original comment.');
  assert.equal(restored.data.published.products[0].images[0].src, newAsset.src);
  assert.equal(restored.data.orders[0].customer.memberId, restored.data.management.members[0].id);
  assert.notEqual(restored.data.management.members[0].id, memberId);
  assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces WHERE id=?').get(h.site.id), before);
  assert.equal((await h.change('import', { backup, confirmPrivateCopy: true })).status, 409);
});
test('mistaken verification corrections preserve history and never double-deduct sales', async () => {
  const h = await fixture(), o = (await h.order()).data;
  await h.verify(o); let s = await h.snapshot(); const receipt = s.orders[0].paidReceipt.number;
  const corrected = await h.change('payment-correction', { id: o.id, orderVersion: s.orders[0].version, independentlyChecked: true, reason: 'Synthetic wrong payment record' });
  assert.equal(corrected.status, 200); s = await h.snapshot();
  assert.equal(s.management.today.verifiedSales, 0); assert.equal(s.management.today.netVerifiedReceipts, 0); assert.equal(s.management.today.verificationCorrections, 900);
  assert.equal(s.orders[0].receiptHistory[0].number, receipt); assert.ok(s.orders[0].receiptHistory[0].voidedAt); assert.equal(s.orders[0].paidReceipt, undefined);
  await h.verify(s.orders[0]); s = await h.snapshot();
  assert.equal(s.management.today.verifiedSales, 900); assert.equal(s.management.today.netVerifiedReceipts, 900); assert.notEqual(s.orders[0].paidReceipt.number, receipt);
});
test('member returns/credits and alert preferences persist without changing financial receipts', async () => {
  const h = await fixture(), memberId = 'cd'.repeat(24);
  h.sql.prepare('INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) VALUES(?,?,?,?,?)').run(memberId, h.site.id, JSON.stringify({ name: 'Synthetic Member', email: '', phone: '' }), 'not-a-real-key', h.now);
  assert.equal((await h.change('benefit', { memberId, kind: 'bottle_return', amount: 2, reason: 'Synthetic two bottles checked' })).status, 200);
  assert.equal((await h.change('benefit', { memberId, kind: 'credit', amount: 300, reason: 'Synthetic credit adjustment' })).status, 200);
  assert.equal((await h.change('benefit', { memberId, kind: 'debit', amount: 400, reason: 'Must not overdraw' })).status, 400);
  const preferences = { orders: true, payments: true, stock: false, pickups: true, comments: false, errors: true };
  assert.equal((await h.change('notifications', { preferences })).status, 200);
  const s = await h.snapshot(); assert.deepEqual(s.management.notifications.preferences, preferences); assert.equal(s.management.members[0].benefits.length, 2); assert.equal(s.management.today.netVerifiedReceipts, 0);
});

test('canceled unverified reports stay out of actionable financial balances and returning-customer counts', () => {
  const range = reportRange('today', Date.parse('2026-10-30T14:00:00Z'));
  const prior = { id: 'earlier', at: '2026-10-29T14:00:00Z', total: 900, status: 'picked-up', paymentStatus: 'verified', paymentVerifiedAt: '2026-10-29T14:00:00Z', customer: { memberId: 'synthetic' }, lines: [] };
  const canceled = { ...prior, id: 'canceled', at: '2026-10-30T14:00:00Z', status: 'canceled', paymentStatus: 'reported', paymentVerifiedAt: undefined };
  const r = financialReport([prior, { ...prior, id: 'other-prior' }, canceled], range);
  assert.equal(r.reportedValue, 0); assert.equal(r.outstandingValue, 0); assert.equal(r.returningMembers, 0);
  assert.equal(r.orderValue, 900); assert.equal(r.canceledOrderValue, 900); assert.equal(r.verifiedSales, 0);
});

test('editing the business pickup address cannot rewrite a confirmed order location', async () => {
  const h = await fixture(), original = (await h.order()).data;
  assert.equal(original.pickupAddress.street, '3431 County Rd. 60');
  const s = await h.snapshot(), doc = structuredClone(s.draft);
  doc.business.pickupAddress = { name: 'Synthetic future event', street: '123 Test Lane', city: 'Auburn, IN 46706' };
  assert.equal((await h.change('content', { document: doc })).status, 200);
  assert.equal((await h.change('publish', {})).status, 200);
  const order = (await h.snapshot()).orders[0];
  assert.deepEqual(order.merchant.pickupAddress, original.pickupAddress);
  const next = (await h.order()).data; assert.equal(next.pickupAddress.street, '123 Test Lane');
});
