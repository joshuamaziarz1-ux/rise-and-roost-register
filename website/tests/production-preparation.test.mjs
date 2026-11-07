import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { seed } from '../public/model.mjs';
import { reviewBusinessInitialization, PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
import { financialReport, reportRange } from '../server/management.mjs';
import worker from '../server/worker.mjs';

const root = new URL('../', import.meta.url).pathname;
const source = () => ({ id: 'a'.repeat(48), owner_hash: 'PRIVATE_OWNER_DO_NOT_COPY', published_json: JSON.stringify(seed()), draft_json: '{"private":"UNPUBLISHED_DO_NOT_COPY"}', versions_json: '["PRIVATE_HISTORY_DO_NOT_COPY"]', ledger_json: JSON.stringify({ orders: [{ customer: { name: 'PRIVATE_CUSTOMER_DO_NOT_COPY' }, paymentVerifiedAt: '2026-11-02T10:00:00Z', total: 900 }], management: { benefits: ['PRIVATE_CREDIT_DO_NOT_COPY'], audit: ['PRIVATE_AUDIT_DO_NOT_COPY'] } }) });

test('production schema is compatible with the application, empty, and excludes PIN credentials', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../production-schema.sql', import.meta.url), 'utf8'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'").all().map(r => r.name);
    assert.equal(tables.length, 12); assert.equal(tables.some(n => n.startsWith('studio_pin_')), false);
    for (const name of tables) assert.equal(db.prepare('SELECT count(*) n FROM "' + name + '"').get().n, 0);
    db.exec(readFileSync(new URL('../migrations/0003_customer_remembered_sessions.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../migrations/0010-roost-contact-login.sql', import.meta.url), 'utf8'));
    const baseline = new DatabaseSync(':memory:'); baseline.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
    for (const { name } of baseline.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) assert.deepEqual(db.prepare('PRAGMA table_info("' + name + '")').all(), baseline.prepare('PRAGMA table_info("' + name + '")').all());
    baseline.close();
  } finally { db.close(); }
});
test('production config binds the exact new database without public routes, testing access or checkout', async () => {
  const config = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json;print(json.dumps(tomllib.load(open("wrangler.production.toml","rb"))))'], { cwd: root, encoding: 'utf8' }));
  assert.equal(config.d1_databases[0].database_id, PRODUCTION_DATABASE_ID); assert.equal(config.d1_databases[0].database_name, 'rise-roost-production-db');
  assert.equal(config.vars.PUBLIC_WORKSPACE_ID, PRODUCTION_WORKSPACE_ID); assert.equal(config.vars.REVIEW_BUILD, 'false');
  assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false); assert.equal(config.routes, undefined); assert.equal(config.triggers, undefined);
  for (const name of Object.keys(config.vars)) assert.equal(/PIN|PREVIEW_ACCESS|PREVIEW_DATABASE/.test(name), false);
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(packageJson.scripts.deploy, /wrangler.experience.toml/);
  for (const path of ['/', '/studio', '/api/orders', '/api/manage/snapshot']) {
    const response = await worker.fetch(new Request('https://rise-and-roost.com' + path), { ...config.vars, DB: new Proxy({}, { get() { throw Error('No production access permitted.'); } }) }, {});
    assert.equal(response.status, 503); assert.match(await response.text(), /individual owner accounts/);
  }
});
test('business review preserves approved content but copies no customer, payment history, credentials or draft records', async () => {
  const row = source(), before = structuredClone(row), result = await reviewBusinessInitialization(row);
  assert.deepEqual(row, before); assert.equal(result.status, 'REVIEW ONLY — not applied');
  assert.equal(result.databaseId, PRODUCTION_DATABASE_ID); assert.notEqual(result.workspaceId, row.id);
  assert.deepEqual(result.published, { ...JSON.parse(row.published_json), orderingPaused: true });
  assert.deepEqual(result.ledger.orders, []); assert.equal(result.sourceHasCustomerActivity, true);
  assert.equal(JSON.stringify(result).includes('DO_NOT_COPY'), false);
  assert.equal(financialReport(result.ledger.orders, reportRange('today')).verifiedSales, 0);
  assert.equal(result.sourceDraftNotCopied, true);
  const configOnlySource = { ...row, order_count: 1, ledger_json: '{"management":{"settings":{}}}' };
  assert.equal((await reviewBusinessInitialization(configOnlySource)).sourceHasCustomerActivity, true);
});
test('business review remaps only referenced owned photos to production without changing their bytes', async () => {
  const row = source(), doc = JSON.parse(row.published_json), oldId = 'b'.repeat(48);
  doc.business.logo = '/api/assets/' + oldId; row.published_json = JSON.stringify(doc);
  const photo = { id: oldId, workspace_id: row.id, mime: 'image/png', bytes_hex: '89504E470D0A1A0A' };
  const result = await reviewBusinessInitialization(row, [photo]);
  assert.equal(result.assets.length, 1); assert.notEqual(result.assets[0].id, oldId); assert.equal(result.assets[0].workspace_id, PRODUCTION_WORKSPACE_ID);
  assert.equal(result.assets[0].bytes_hex, photo.bytes_hex); assert.equal(result.published.business.logo, '/api/assets/' + result.assets[0].id);
  await assert.rejects(reviewBusinessInitialization(row, [{ ...photo, workspace_id: 'c'.repeat(48) }]));
  await assert.rejects(reviewBusinessInitialization(row, []));
  doc.business.logo = 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev/api/assets/' + oldId;
  row.published_json = JSON.stringify(doc);
  await assert.rejects(reviewBusinessInitialization(row, [photo]), /environment-specific/);
});
test('saved business destinations are retained disabled with no preview link-test certificates', async () => {
  const row = source(); row.ledger_json = JSON.stringify({ orders: [], management: { settings: { calendar: { days: [0, 3, 6], closures: [] }, payments: { paypal: { url: 'https://paypal.me/FictionalApprovedBusiness', businessConfirmed: true, enabled: true, tested: { actor: { id: 'PRIVATE_TESTER' }, at: new Date().toISOString() } } } } } });
  const result = await reviewBusinessInitialization(row);
  assert.deepEqual(result.ledger.management.settings.payments.paypal, { url: 'https://paypal.me/FictionalApprovedBusiness', businessConfirmed: true, enabled: false });
  assert.deepEqual(result.ledger.management.settings.calendar.days, [0, 3, 6]);
  assert.equal(JSON.stringify(result).includes('PRIVATE_TESTER'), false);
});
test('unknown public data fields and unapproved payment destinations require review', async () => {
  const row = source(), doc = JSON.parse(row.published_json); doc.orders = ['PRIVATE_CUSTOMER']; row.published_json = JSON.stringify(doc);
  await assert.rejects(reviewBusinessInitialization(row), /document structure/);
  const second = source(); second.ledger_json = JSON.stringify({ management: { settings: { payments: { paypal: { url: 'https://paypal.me/Unapproved', businessConfirmed: false } } } } });
  await assert.rejects(reviewBusinessInitialization(second), /Business approval/);
});
test('production schema CLI plan has no network/write action or database override', () => {
  const plan = JSON.parse(execFileSync('python3', ['scripts/prepare-production-schema.py', '--plan'], { cwd: root, encoding: 'utf8' }));
  assert.equal(plan.databaseId, PRODUCTION_DATABASE_ID); assert.equal(plan.networkRequests, 0); assert.equal(plan.businessRowsInserted, 0);
  assert.throws(() => execFileSync('python3', ['scripts/prepare-production-schema.py', '--plan', '--database', 'preview'], { cwd: root, stdio: 'pipe' }));
});
test('production schema installer safety cases preserve occupied or unexpected databases', () => {
  execFileSync('python3', ['tests/production_schema_guards.py'], { cwd: root, stdio: 'pipe' });
});
