import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { initializeProduction, validateInitialization } from '../scripts/initialize-production.mjs';
import { reviewBusinessInitialization, PRODUCTION_DATABASE_ID } from '../server/production-preparation.mjs';
import { seed } from '../public/model.mjs';

async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../production-schema.sql', import.meta.url), 'utf8'));
  const doc = seed(); doc.products = []; doc.business.pickupAddress = { name: 'Rise & Roost', street: 'Synthetic street', city: 'Synthetic Indiana city' };
  const plan = await reviewBusinessInitialization({ id: 'a'.repeat(48), published_json: JSON.stringify(doc) });
  let writes = 0, failIdentity = false;
  const api = async (path, body) => {
    assert.ok(path.startsWith('/d1/database/' + PRODUCTION_DATABASE_ID));
    if (!body) return { uuid: PRODUCTION_DATABASE_ID, name: 'rise-roost-production-db' };
    if (body.sql.startsWith('SELECT')) return [{ success: true, results: sql.prepare(body.sql).all(...body.params) }];
    if (failIdentity && body.sql.startsWith('INSERT INTO deployment_identity')) throw Error('Synthetic provider outage');
    assert.ok(body.sql.startsWith('INSERT INTO ')); writes++;
    return [{ success: true, meta: { changes: sql.prepare(body.sql).run(...body.params).changes } }];
  };
  return { sql, plan, api, writes: () => writes, failIdentity: () => { failIdentity = true; }, resume: () => { failIdentity = false; } };
}
test('reviewed empty-catalog initialization inserts only one workspace and identity; repeating it is read-only', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const result = await initializeProduction(h.api, h.plan); assert.equal(result.initializationWrites, 2); assert.equal(result.products, 0); assert.equal(result.orders, 0); assert.equal(result.verifiedSales, 0);
  const repeat = await initializeProduction(h.api, h.plan); assert.equal(repeat.initializationWrites, 0); assert.equal(h.writes(), 2);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM sessions').get().n, 0);
});
test('populated, changed or wrong-identity databases cannot be overwritten; customer data cannot be seeded', async t => {
  const h = await fixture(); t.after(() => h.sql.close());
  const forbidden = structuredClone(h.plan); forbidden.ledger.orders.push({ customer: { name: 'DO NOT COPY' } }); assert.throws(() => validateInitialization(forbidden));
  const products = structuredClone(h.plan); products.published.products = seed().products; assert.throws(() => validateInitialization(products));
  await assert.rejects(initializeProduction(async () => ({ uuid: 'preview', name: 'rise-roost-production-db' }), h.plan), /identity/);
  assert.equal(h.writes(), 0);
  await initializeProduction(h.api, h.plan);
  const modified = structuredClone(h.plan); modified.published.business.tagline = 'Changed without owner review';
  await assert.rejects(initializeProduction(h.api, modified), /differ/);
  h.sql.prepare("UPDATE workspaces SET ledger_json=?").run('{"orders":[{"id":"genuine-record"}]}');
  await assert.rejects(initializeProduction(h.api, h.plan), /differ/);
  assert.equal(h.writes(), 2); assert.match(h.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json, /genuine-record/);
});
test('a partial initialization remains without an identity marker and only the identical seed can safely finish', async t => {
  const h = await fixture(); t.after(() => h.sql.close()); h.failIdentity();
  await assert.rejects(initializeProduction(h.api, h.plan), /provider outage/);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM deployment_identity').get().n, 0);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM workspaces').get().n, 1);
  h.resume(); const result = await initializeProduction(h.api, h.plan); assert.equal(result.initializationWrites, 1); assert.equal(h.writes(), 2);
});
