import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture, installProductionTestKeys } from './production-fixture.mjs';

const originalFetch = globalThis.fetch;
before(installProductionTestKeys);
after(() => { globalThis.fetch = originalFetch; });

test('Phase 3 owner actions require signed Access credentials and same-origin requests', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const actions = ['fresh-announcement', 'product-visibility', 'calendar', 'product'];
  const before = h.sql.prepare('SELECT * FROM workspaces').get();
  for (const action of actions) {
    const path = '/studio/api/manage/' + action;
    assert.equal((await h.call(path, { operationId: crypto.randomUUID() })).status, 401);
    assert.equal((await h.call(path, {}, { token: 'forged.jwt.assertion' })).status, 403);
    assert.equal((await h.call(path, {}, { token: h.ownerA, headers: { Origin: 'https://outsider.test' } })).status, 403);
    assert.equal((await h.call('/api/manage/' + action, {}, { token: h.ownerA })).status, 404);
  }
  assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').get(), before);
});

test('both long-lived owner identities can manage Phase 3 with distinct audit actors while ordering stays paused', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const saved = h.sql.prepare('SELECT published_json FROM workspaces').get();
  const doc = JSON.parse(saved.published_json); doc.orderingPaused = true;
  h.sql.prepare('UPDATE workspaces SET published_json=?,draft_json=?').run(JSON.stringify(doc), JSON.stringify(doc));
  const at = Math.floor(h.now / 1000), actors = [];
  for (const [email, sub] of [['owner-a@example.test', 'synthetic-owner-a'], ['owner-b@example.test', 'synthetic-owner-b']]) {
    const token = await h.auth.mint({ email, subject: sub, issuedAt: at - 48 * 3600, notBefore: at - 48 * 3600, expiresAt: at - 48 * 3600 + 730 * 3600 });
    const changed = await h.change('fresh-announcement', { announcement: 'Synthetic fresh finds' }, token);
    assert.equal(changed.status, 200, changed.data.error);
    actors.push(changed.data.actor.id);
    const p = changed.data.published.products[0];
    const save = await h.change('product', { product: { ...p, sellingMethod: 'in-store', archived: false, soldOut: false }, available: 2 }, token);
    assert.equal(save.status, 200, save.data.error);
    const hidden = await h.change('product-visibility', { id: p.id, hidden: true, confirmed: true }, token);
    assert.equal(hidden.status, 200, hidden.data.error);
    assert.equal((await h.change('product-visibility', { id: p.id, hidden: false, confirmed: true }, token)).status, 200);
  }
  assert.equal(new Set(actors).size, 2);
  const current = await h.snapshot();
  for (const actor of actors) assert.ok(current.management.audit.some(a => a.kind === 'fresh-announcement-history' && a.actor.id === actor));
  assert.equal(current.checkoutEnabled, false);
  assert.equal(current.published.orderingPaused, true);
  const blocked = await h.call('/api/orders', {});
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /checkout|ordering|paused/i);
  assert.equal((await h.snapshot()).orders.length, 0);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM sessions').get().n, 0);
});
