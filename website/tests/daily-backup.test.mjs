import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seed } from '../public/model.mjs';
import { captureSnapshot, encryptSnapshot, decryptSnapshot, dailyBackup } from '../server/daily-backup.mjs';
import { restoreNewLocalDatabase } from '../scripts/restore-business-backup.mjs';
import { loadProductionExport } from '../scripts/production-backup.mjs';

const databaseId = '7ab95a5a-6086-43cd-8247-fd481cf1ee91';
const workspaceId = 'a'.repeat(48), day = '2026-11-02';
const recoveryKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../production-identity.sql', import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO deployment_identity VALUES(?,?,?,?)').run('main', 'production', databaseId, workspaceId);
  const document = JSON.stringify(seed());
  const ledger = { orders: [{ id: 'b'.repeat(48), total: 900, customer: { name: 'Fictional Recovery Customer', email: 'recovery@example.test' }, messages: [{ body: 'Fictional recovery message' }], paymentStatus: 'verified', verifications: [{ at: '2026-11-02T01:00:00Z', actor: { id: 'owner-test' } }] }] };
  sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,ledger_json,created_at) VALUES(?,?,?,?,?,?,?)').run(workspaceId, 'fictional-owner-hash', document, document, '[]', JSON.stringify(ledger), new Date().toISOString());
  sql.prepare('INSERT INTO assets VALUES(?,?,?,?)').run('c'.repeat(48), workspaceId, 'image/png', Buffer.from([0, 1, 127, 255]));
  sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run('fictional-session-hash', workspaceId, Date.now() + 1000);
  sql.prepare('INSERT INTO roost_members VALUES(?,?,?,?,?)').run('d'.repeat(48), workspaceId, '{"name":"Fictional member"}', 'fictional-recovery-hash', Date.now());
  const db = {
    prepare(query) { return { bind(...args) { return { query, args, async all() { return { success: true, results: sql.prepare(query).all(...args) }; } }; } }; },
    async batch(statements) { sql.exec('BEGIN'); try { const results = statements.map(s => ({ success: true, results: sql.prepare(s.query).all(...s.args) })); sql.exec('COMMIT'); return results; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
  };
  const objects = new Map();
  const bucket = { async get(key) { const body = objects.get(key); return body === undefined ? null : { async text() { return body; } }; }, async put(key, body, options) { if (options?.onlyIf && objects.has(key)) return null; objects.set(key, body); return { key }; } };
  const env = { DB: db, ASSETS: { async fetch(request) { const path = new URL(request.url).pathname; return new Response(readFileSync(new URL('../public' + path, import.meta.url))); } }, BACKUP_BUCKET: bucket, BACKUP_ENABLED: 'true', BACKUP_DATABASE_ID: databaseId, BACKUP_WORKSPACE_ID: workspaceId, BACKUP_KEY_ID: 'recovery-2026', BACKUP_ENCRYPTION_KEY: recoveryKey() };
  return { env, sql, objects, ledger };
}

test('daily backup archives full records and both media stores; real local restore matches every row and schema without changing source', async () => {
  const h = fixture(), directory = await mkdtemp(join(tmpdir(), 'rr-backup-'));
  try {
    const source = h.sql.prepare('SELECT * FROM workspaces').all();
    const receipt = await dailyBackup(h.env, day), encrypted = h.objects.get(receipt.key);
    assert.equal(receipt.tableCount, 17); assert.equal(receipt.mediaCount, 4); assert.equal(receipt.rows.assets, 1);
    assert.equal(encrypted.includes('Fictional Recovery Customer'), false);
    assert.equal(JSON.stringify(receipt).includes('recovery@example.test'), false);
    const result = await restoreNewLocalDatabase({ encrypted, key: h.env.BACKUP_ENCRYPTION_KEY, databaseId, outputPath: join(directory, 'restored.sqlite') });
    assert.equal(result.everyRecordMatches, true); assert.equal(result.schemaMatches, true); assert.equal(result.remoteWrites, 0);
    const restored = new DatabaseSync(join(directory, 'restored.sqlite'));
    assert.deepEqual(restored.prepare('SELECT * FROM workspaces').all(), source);
    assert.deepEqual([...restored.prepare('SELECT bytes FROM assets').get().bytes], [0, 1, 127, 255]);
    assert.equal(restored.prepare('SELECT count(*) n FROM sessions').get().n, 1); restored.close();
    assert.deepEqual(await readFile(join(result.mediaDirectory, 'logo.webp')), readFileSync(new URL('../public/assets/logo.webp', import.meta.url)));
    assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), source);
    await assert.rejects(restoreNewLocalDatabase({ encrypted, key: h.env.BACKUP_ENCRYPTION_KEY, databaseId, outputPath: join(directory, 'restored.sqlite') }), /EEXIST/);
  } finally { h.sql.close(); await rm(directory, { recursive: true, force: true }); }
});
test('backup fails closed for preview/beta, disabled jobs, incorrect binding identity and missing required tables', async () => {
  const h = fixture();
  try {
    for (const bad of [{ BACKUP_ENABLED: 'false' }, { BACKUP_DATABASE_ID: '21352b95-d7f6-406f-8527-4b8dbcebf1bf' }, { BACKUP_DATABASE_ID: '7824ffe0-d69a-4221-9aec-0f335257477a' }, { BACKUP_DATABASE_ID: '00000000-0000-0000-0000-000000000000' }, { BACKUP_WORKSPACE_ID: 'f'.repeat(48) }, { BACKUP_ENCRYPTION_KEY: '' }]) await assert.rejects(dailyBackup({ ...h.env, ...bad }, day));
    assert.equal(h.objects.size, 0);
    h.sql.exec('DROP TABLE deployment_identity'); await assert.rejects(dailyBackup(h.env, day)); assert.equal(h.objects.size, 0);
  } finally { h.sql.close(); }
});
test('AES-GCM rejects wrong keys, substituted identity, tampered metadata/ciphertext and missing release media', async () => {
  const h = fixture();
  try {
    const snapshot = await captureSnapshot(h.env);
    const a = await encryptSnapshot(snapshot, h.env.BACKUP_ENCRYPTION_KEY, h.env.BACKUP_KEY_ID, day);
    const b = await encryptSnapshot(snapshot, h.env.BACKUP_ENCRYPTION_KEY, h.env.BACKUP_KEY_ID, day);
    assert.notEqual(a, b);
    await assert.rejects(decryptSnapshot(a, recoveryKey(), databaseId));
    await assert.rejects(decryptSnapshot(a, h.env.BACKUP_ENCRYPTION_KEY, '00000000-0000-0000-0000-000000000000'));
    for (const [field, value] of [['keyId', 'substituted'], ['day', '2026-11-03'], ['createdAt', '2020-01-01T00:00:00Z'], ['sha256', '0'.repeat(64)], ['ciphertext', JSON.parse(a).ciphertext.slice(0, -8) + 'AAAAAAAA']]) await assert.rejects(decryptSnapshot(JSON.stringify({ ...JSON.parse(a), [field]: value }), h.env.BACKUP_ENCRYPTION_KEY, databaseId));
    await assert.rejects(captureSnapshot({ ...h.env, ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } }), /image could not/);
  } finally { h.sql.close(); }
});
test('failed writes and corrupt read-back never produce a success receipt; local recovery never overwrites existing files or media', async () => {
  const h = fixture(), directory = await mkdtemp(join(tmpdir(), 'rr-backup-errors-'));
  try {
    await assert.rejects(dailyBackup({ ...h.env, BACKUP_BUCKET: { get: async () => null, put: async () => { throw new Error('storage unavailable'); } } }, day), /storage unavailable/);
    const bucket = h.env.BACKUP_BUCKET;
    h.env.BACKUP_BUCKET = { ...bucket, async get(key) { const value = await bucket.get(key); return value ? { text: async () => 'corrupted' } : null; } };
    await assert.rejects(dailyBackup(h.env, day)); assert.equal([...h.objects.keys()].some(k => k.startsWith('receipts/')), false);
    h.env.BACKUP_BUCKET = bucket; const receipt = await dailyBackup(h.env, day), encrypted = h.objects.get(receipt.key);
    const outputPath = join(directory, 'recovery.sqlite'); await writeFile(outputPath, 'existing real records');
    await assert.rejects(restoreNewLocalDatabase({ encrypted, key: h.env.BACKUP_ENCRYPTION_KEY, databaseId, outputPath })); assert.equal(await readFile(outputPath, 'utf8'), 'existing real records');
    await rm(outputPath); await mkdir(outputPath + '.media'); await writeFile(join(outputPath + '.media', 'keep'), 'existing photo');
    await assert.rejects(restoreNewLocalDatabase({ encrypted, key: h.env.BACKUP_ENCRYPTION_KEY, databaseId, outputPath }));
    assert.equal(await readFile(join(outputPath + '.media', 'keep'), 'utf8'), 'existing photo'); await assert.rejects(access(outputPath));
  } finally { h.sql.close(); await rm(directory, { recursive: true, force: true }); }
});
test('workflow retries and concurrent writers preserve the first verified daily archive; next day captures new orders', async () => {
  const h = fixture();
  try {
    const outcomes = await Promise.allSettled([dailyBackup(h.env, day), dailyBackup(h.env, day)]);
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    const first = await dailyBackup(h.env, day), original = h.objects.get(first.key);
    const ledger = { ...h.ledger, orders: [...h.ledger.orders, { id: 'e'.repeat(48), total: 0 }] };
    h.sql.prepare('UPDATE workspaces SET ledger_json=?').run(JSON.stringify(ledger));
    assert.equal((await dailyBackup(h.env, day)).sha256, first.sha256); assert.equal(h.objects.get(first.key), original);
    const next = await dailyBackup(h.env, '2026-11-03'); assert.notEqual(next.sha256, first.sha256);
    const { snapshot } = await decryptSnapshot(h.objects.get(next.key), h.env.BACKUP_ENCRYPTION_KEY, databaseId);
    assert.equal(JSON.parse(snapshot.tables.find(t => t.name === 'workspaces').rows[0].ledger_json).orders.length, 2);
    assert.deepEqual(JSON.parse(h.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json), ledger);
  } finally { h.sql.close(); }
});

test('scheduled runner restores an actual SQL export before encrypted backup and never sends API credentials to its download host', async () => {
  const h = fixture(); let source;
  try {
    const catalog = h.sql.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all();
    const dump = [];
    const quote = value => value === null ? 'NULL' : value instanceof Uint8Array ? "X'" + Buffer.from(value).toString('hex') + "'" : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
    for (const table of catalog.filter(c => c.type === 'table')) {
      dump.push(table.sql + ';');
      for (const row of h.sql.prepare('SELECT * FROM "' + table.name + '"').all()) dump.push('INSERT INTO "' + table.name + '" VALUES (' + Object.values(row).map(quote).join(',') + ');');
    }
    for (const c of catalog.filter(c => c.type !== 'table')) dump.push(c.sql + ';');
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      if (calls === 1) { assert.match(url, /api.cloudflare.com/); assert.equal(options.headers.Authorization, 'Bearer fixture-export-credential'); return Response.json({ success: true, result: { at_bookmark: 'fixture-bookmark', status: 'active' } }); }
      if (calls === 2) { assert.equal(JSON.parse(options.body).current_bookmark, 'fixture-bookmark'); return Response.json({ success: true, result: { signed_url: 'https://signed-export.example.test/fixture.sql' } }); }
      assert.equal(url, 'https://signed-export.example.test/fixture.sql'); assert.equal(options.headers, undefined); return new Response(dump.join('\n'));
    };
    source = await loadProductionExport({ accountId: 'f'.repeat(32), databaseId, token: 'fixture-export-credential', fetcher, sleep: async () => {} });
    const snapshot = await captureSnapshot({ ...h.env, DB: source.db });
    assert.equal(calls, 3); assert.equal(snapshot.tables.length, 17);
    assert.deepEqual(JSON.parse(snapshot.tables.find(t => t.name === 'workspaces').rows[0].ledger_json), h.ledger);
    assert.equal(snapshot.tables.find(t => t.name === 'assets').rows[0].bytes_hex, '00017FFF');
  } finally { source?.close(); h.sql.close(); }
});
test('scheduled runner rejects protected databases before networking, unsuccessful exports and unsafe download schemes', async () => {
  let calls = 0;
  const fields = { accountId: 'f'.repeat(32), databaseId, token: 'fixture', sleep: async () => {}, fetcher: async () => { calls++; return Response.json({ success: false }); } };
  for (const id of ['21352b95-d7f6-406f-8527-4b8dbcebf1bf', '7824ffe0-d69a-4221-9aec-0f335257477a', '00000000-0000-0000-0000-000000000000']) await assert.rejects(loadProductionExport({ ...fields, databaseId: id }));
  assert.equal(calls, 0);
  await assert.rejects(loadProductionExport(fields), /confirmed metadata/);
  await assert.rejects(loadProductionExport({ ...fields, fetcher: async () => Response.json({ success: true, result: { signed_url: 'http://unsafe.example.test/dump' } }) }), /secure provider URL/);
});
test('scheduled runner bounds export polling and never treats a pending export as a backup', async () => {
  let calls = 0;
  await assert.rejects(loadProductionExport({ accountId: 'f'.repeat(32), databaseId, token: 'fixture', sleep: async () => {}, fetcher: async () => { calls++; return Response.json({ success: true, result: { at_bookmark: 'still-working', status: 'active' } }); } }), /did not finish/);
  assert.equal(calls, 61);
});

test('encrypted backups persist through an actual local R2 runtime restart and restore into a new database and media directory', async () => {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const h = fixture(), directory = await mkdtemp(join(tmpdir(), 'rr-r2-recovery-'));
  const options = { ...convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("Not exposed", {status:404}); } }', compatibilityDate: '2025-10-01', r2Buckets: ['BACKUP_BUCKET'] }), resourcePersistencePath: join(directory, 'r2') };
  let mf = new Miniflare(options);
  try {
    h.env.BACKUP_BUCKET = await mf.getR2Bucket('BACKUP_BUCKET');
    const source = h.sql.prepare('SELECT * FROM workspaces').all();
    const receipt = await dailyBackup(h.env, day);
    assert.equal(await h.env.BACKUP_BUCKET.put(receipt.key, 'must never overwrite', { onlyIf: { etagDoesNotMatch: '*' } }), null);
    await mf.dispose(); mf = new Miniflare(options);
    const bucket = await mf.getR2Bucket('BACKUP_BUCKET'), object = await bucket.get(receipt.key);
    assert.ok(object); const encrypted = await object.text();
    const restored = await restoreNewLocalDatabase({ encrypted, key: h.env.BACKUP_ENCRYPTION_KEY, databaseId, outputPath: join(directory, 'independent-recovery.sqlite') });
    assert.equal(restored.everyRecordMatches, true); assert.equal(restored.schemaMatches, true); assert.equal(restored.mediaCount, 4);
    assert.ok(await bucket.get(`receipts/${databaseId}/${day}/${h.env.BACKUP_KEY_ID}.json`));
    assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(), source);
  } finally { await mf.dispose(); h.sql.close(); await rm(directory, { recursive: true, force: true }); }
});
