import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api, availableDocument, quote, validateDocument } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed, localInstant } from '../public/model.mjs';
import { calendarPickups, orderingDeadline, storeDay, addCalendarDays } from '../server/pickup-calendar.mjs';

const monday = localInstant('2026-11-02', '10:00');
function document(now = monday) {
  const doc = seed(now); doc.pickups = [];
  doc.pickupSchedule = { start: '15:00', end: '18:00', capacity: 3 };
  doc.products.slice(0, 2).forEach(p => Object.assign(p, { sellingMethod: 'preorder', capacity: 2, stock: 0 }));
  return doc;
}
const basket = (doc, pickupId, quantities = [1]) => {
  const lines = quantities.map((qty, i) => ({ productId: doc.products[i].id, variantId: doc.products[i].variants[0].id, qty, unitPrice: doc.products[i].price }));
  return { pickupId, lines, total: lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) };
};
const visible = (doc, at, orders = []) => availableDocument(doc, { orders }, { managed: true, now: at });

for (const [date, cutoff] of [['2026-11-04', '2026-11-02'], ['2026-11-05', '2026-11-03'], ['2026-11-06', '2026-11-04']]) {
  test(`${date}: server permits one millisecond before noon and rejects exact noon and after`, () => {
    const doc = document(), id = 'recurring-' + date, deadline = localInstant(cutoff, '12:00');
    for (const delta of [-1, 0, 1]) {
      assert.equal(visible(doc, deadline + delta).pickups.some(p => p.id === id), delta < 0);
      const reserve = () => quote(doc, { orders: [] }, basket(doc, id), deadline + delta, { recurring: true });
      if (delta < 0) assert.equal(reserve().pickup.cutoffDate, cutoff);
      else assert.throws(reserve, /deadline/);
    }
  });
}

test('Thursday at 6 PM rolls to next Wednesday; no next-day exceptions on any weekday', () => {
  const doc = document(), at = localInstant('2026-11-05', '18:00');
  assert.equal(visible(doc, at).pickups[0].date, '2026-11-11');
  for (let i = 0; i < 7; i++) {
    const day = addCalendarDays('2026-11-01', i), now = localInstant(day, '18:00');
    for (const p of visible(doc, now).pickups) {
      assert.ok(p.date > addCalendarDays(day, 1));
      assert.ok(localInstant(p.cutoffDate, p.cutoffTime) > now);
    }
  }
});

test('rolls indefinitely across week, month and year boundaries with at least eight weeks ahead', () => {
  const doc = document(), before = JSON.stringify(doc);
  for (const day of ['2026-11-05', '2026-12-31', '2027-01-01', '2027-09-30', '2030-12-31']) {
    const result = visible(doc, localInstant(day, '18:00')).pickups;
    assert.ok(result.length >= 24); assert.ok(result.at(-1).date >= addCalendarDays(result[0].date, 55));
    assert.equal(new Set(result.map(p => p.id)).size, result.length);
    assert.ok(result.every(p => [3, 4, 5].includes(new Date(p.date + 'T12:00Z').getUTCDay())));
  }
  assert.equal(JSON.stringify(doc), before, 'reads never materialize or delete stored windows');
});

test('Indiana spring and fall DST use local noon two calendar days before regular and special dates', () => {
  for (const [pickup, cutoffUTC] of [
    ['2027-03-16', '2027-03-14T16:00:00Z'], ['2027-03-17', '2027-03-15T16:00:00Z'],
    ['2026-11-03', '2026-11-01T17:00:00Z'], ['2026-11-04', '2026-11-02T17:00:00Z'],
  ]) {
    const doc = document(), p = { id: 'special', date: pickup, start: '15:00', end: '18:00', capacity: 3, ...orderingDeadline(pickup) };
    doc.pickups = [p]; const cutoff = Date.parse(cutoffUTC);
    assert.equal(localInstant(p.cutoffDate, p.cutoffTime), cutoff);
    assert.ok(visible(doc, cutoff - 1).pickups.some(p => p.id === 'special'));
    assert.ok(!visible(doc, cutoff).pickups.some(p => p.id === 'special'));
    assert.equal(storeDay(Date.parse(pickup + 'T03:00:00Z')), addCalendarDays(pickup, -1));
  }
});

test('future legacy cutoffs follow the confirmed policy while historical records remain unchanged', () => {
  const doc = document(), old = { id: 'old', date: '2026-10-30', start: '15:00', end: '18:00', cutoffDate: '2026-10-29', cutoffTime: '18:00', capacity: 1 };
  const legacy = { ...old, id: 'legacy', date: '2026-11-04', cutoffDate: '2026-11-03' };
  doc.pickups = [old, legacy]; const before = JSON.stringify(doc);
  assert.equal(calendarPickups(doc, monday).find(p => p.id === 'legacy').cutoffDate, '2026-11-02');
  assert.ok(!visible(doc, monday).pickups.some(p => p.id === 'old'));
  assert.deepEqual(calendarPickups(doc, monday).find(p => p.id === 'old'), old);
  legacy.cutoffDate = '2026-11-01';
  assert.equal(visible(doc, monday).pickups.find(p => p.id === 'legacy').cutoffDate, '2026-11-02');
  legacy.cutoffDate = '2026-11-03'; assert.equal(JSON.stringify(doc), before);
});

test('all preorder products and variants reserve per-date capacity; a full date rolls to another date', () => {
  const doc = document(), id = 'recurring-2026-11-04';
  const order = { ...quote(doc, { orders: [] }, basket(doc, id, [2, 1]), monday, { recurring: true }), id: 'order' };
  const site = visible(doc, monday, [order]), first = site.pickups.find(p => p.id === id);
  assert.equal(first.productionRemaining[doc.products[0].id], 0);
  assert.equal(first.productionRemaining[doc.products[1].id], 1);
  assert.equal(site.products[0].stock, 2, 'later dates retain independent production capacity');
  assert.throws(() => quote(doc, { orders: [order] }, basket(doc, id, [1, 1]), monday, { recurring: true }), /capacity/);
  assert.equal(quote(doc, { orders: [order] }, basket(doc, 'recurring-2026-11-05', [2, 2]), monday, { recurring: true }).lines.length, 2);
});

test('existing date-specific production limits do not become defaults for later weeks', () => {
  const doc = document(); delete doc.pickupSchedule;
  doc.pickups = [{ id: 'limited-day', date: '2026-11-04', start: '15:00', end: '18:00', capacity: 3, ...orderingDeadline('2026-11-04'), productionLimits: { [doc.products[0].id]: 0 } }];
  const dates = visible(doc, monday).pickups;
  assert.equal(dates.find(p => p.id === 'limited-day').productionRemaining[doc.products[0].id], 0);
  assert.equal(dates.find(p => p.id === 'recurring-2026-11-05').productionRemaining[doc.products[0].id], 2);
});

async function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = sqliteD1(sql), config = { studioManagementEnabled: true, customerExperienceEnabled: true };
  let cookie = '';
  async function call(path, body, at = monday, guest = false) {
    const response = await api(new Request('https://calendar.test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://calendar.test', 'Content-Type': 'application/json', Cookie: guest ? '' : cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db, at, config);
    if (!guest && response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  const created = await call('/api/workspaces', {}); config.publicWorkspaceId = created.data.id;
  const doc = document(); sql.prepare('UPDATE workspaces SET published_json=?,draft_json=?').run(JSON.stringify(doc), JSON.stringify(doc));
  const snapshot = async (at = monday) => {
    if (at !== monday) await call('/api/login', { id: created.data.id, accessKey: created.data.accessKey }, at);
    return (await call('/api/manage/snapshot', undefined, at)).data;
  };
  async function change(body, overrides = {}) {
    const s = await snapshot();
    return call('/api/manage/calendar-date', { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, pickup: body, ...overrides });
  }
  async function order(id = 'recurring-2026-11-04', at = monday, extra = {}) {
    const site = (await call('/api/site', undefined, at, true)).data;
    return call('/api/orders', { ...basket(doc, id), workspaceId: config.publicWorkspaceId, revision: site.revision, requestId: crypto.randomUUID(), ...extra }, at, true);
  }
  return { sql, doc, call, snapshot, change, order };
}

test('HTTP server rejects a forged late pickup despite fresh or stale browser data', async t => {
  const h = await fixture(t), boundary = localInstant('2026-11-02', '12:00');
  assert.equal((await h.order('recurring-2026-11-04', boundary - 1)).status, 201);
  assert.equal((await h.order('recurring-2026-11-04', boundary)).status, 409);
  assert.equal((await h.order('recurring-2026-11-04', boundary + 1)).status, 409);
  assert.equal((await h.snapshot()).orders.length, 1);
});

test('a checkout retry after automatic rollover recovers the saved order without duplicating or moving it', async t => {
  const h = await fixture(t), requestId = crypto.randomUUID(), boundary = localInstant('2026-11-02', '12:00');
  const accepted = await h.order('recurring-2026-11-04', boundary - 1, { requestId });
  assert.equal(accepted.status, 201);
  const recovered = await h.order('recurring-2026-11-05', boundary + 1, { requestId });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.id, accepted.data.id);
  assert.deepEqual(recovered.data.pickup, accepted.data.pickup);
  assert.equal((await h.snapshot()).orders.length, 1);
});

test('skip, reopen and special dates persist without creating weekly records or changing orders', async t => {
  const h = await fixture(t), original = (await h.order()).data;
  let s = await h.snapshot(), p = s.management.pickups.find(p => p.id === original.pickup.id);
  assert.equal((await h.change({ ...p, closed: true })).status, 409);
  const closed = await h.change({ ...p, closed: true }, { confirmExistingOrders: true });
  assert.equal(closed.status, 200, closed.data.error);
  assert.equal(closed.data.published.pickups.length, 1, 'only exceptions are stored');
  assert.equal((await h.order()).status, 409);
  assert.equal((await h.call('/api/site', undefined, monday, true)).data.document.pickups[0].date, '2026-11-05');
  s = await h.snapshot(); assert.deepEqual(s.orders[0].pickup, original.pickup);
  assert.equal((await h.change({ ...p, closed: false }, { confirmExistingOrders: true })).status, 200);
  assert.equal((await h.order()).status, 201);
  const special = { ...p, id: 'special-saturday', date: '2026-11-07', event: 'Saturday market', capacity: 1, closed: false };
  assert.equal((await h.change(special)).status, 200);
  const publicSite = (await h.call('/api/site', undefined, monday, true)).data.document;
  assert.equal(publicSite.pickups.find(p => p.id === special.id).cutoffDate, '2026-11-05');
  assert.equal(publicSite.pickups.find(p => p.id === special.id).cutoffTime, '12:00');
  assert.equal((await h.change({ ...special, id: 'duplicate' })).status, 409);
});

test('capacity exceptions, stale editors, idempotency and competing reservations remain atomic', async t => {
  const h = await fixture(t), s = await h.snapshot(), p = s.management.pickups.find(p => p.id === 'recurring-2026-11-04');
  const payload = { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, pickup: { ...p, capacity: 1, dailyCapacity: 1 } };
  assert.equal((await h.call('/api/manage/calendar-date', payload)).status, 200);
  assert.equal((await h.call('/api/manage/calendar-date', payload)).data.duplicate, true);
  assert.equal((await h.change(p, { revision: s.revision })).status, 409);
  const results = await Promise.all([h.order(), h.order()]); assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const publicSite = (await h.call('/api/site', undefined, monday, true)).data.document;
  assert.equal(publicSite.pickups[0].date, '2026-11-05');
  const current = await h.snapshot(); assert.equal(current.orders.length, 1);
  assert.equal(current.management.audit.filter(a => a.kind === 'calendar-date').length, 1);
  assert.ok(current.management.audit[0].actor); assert.ok(current.management.audit[0].at);
});

test('generated bookings survive horizon rollover in Studio history; past dates cannot be edited', async t => {
  const h = await fixture(t), original = (await h.order()).data;
  const later = localInstant('2026-11-06', '10:00'), s = await h.snapshot(later);
  assert.deepEqual(s.orders[0].pickup, original.pickup);
  assert.ok(s.management.pickups.some(p => p.id === original.pickup.id && p.closed));
  assert.equal(s.published.pickups.length, 0);
  const changed = await h.call('/api/manage/calendar-date', { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, pickup: { ...original.pickup, capacity: 9 }, confirmExistingOrders: true }, later);
  assert.equal(changed.status, 409);
});

test('calendar writes retain owner, CSRF and ordering-pause controls', async t => {
  const h = await fixture(t), s = await h.snapshot(), p = s.management.pickups[0];
  assert.equal((await h.call('/api/manage/calendar-date', { operationId: crypto.randomUUID(), pickup: p }, monday, true)).status, 401);
  assert.equal((await h.call('/api/manage/calendar', { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, pickups: [], paused: true })).status, 200);
  assert.equal((await h.order()).status, 409);
  assert.equal((await h.call('/api/site', undefined, monday, true)).data.document.pickups.length, 0);
});

test('automatic schedule configuration rejects invalid hours and limits', () => {
  for (const change of [{ capacity: -1 }, { start: '18:00', end: '15:00' }, { productionLimits: { unknown: 1 } }]) {
    const doc = document(); Object.assign(doc.pickupSchedule, change); assert.throws(() => validateDocument(doc));
  }
});
