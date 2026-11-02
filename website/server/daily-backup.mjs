// This module only reads D1. Recovery writes are confined to a new local database.
export const PROTECTED_DATABASES = new Set(['21352b95-d7f6-406f-8527-4b8dbcebf1bf', '7824ffe0-d69a-4221-9aec-0f335257477a', '00000000-0000-0000-0000-000000000000']);
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder();
const schemaSQL = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name";
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const canonical = value => JSON.stringify(value);
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); };
const unb64 = value => { ensure(typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'Invalid backup encoding.'); return Uint8Array.from(atob(value), c => c.charCodeAt(0)); };
const aad = e => encoder.encode(canonical({ format: e.format, databaseId: e.databaseId, environment: e.environment, keyId: e.keyId, day: e.day, createdAt: e.createdAt, sha256: e.sha256 }));
function identity(env) {
  ensure(env.BACKUP_ENABLED === 'true', 'Production backups are not enabled.');
  ensure(/^[a-f0-9-]{36}$/.test(env.BACKUP_DATABASE_ID || '') && !PROTECTED_DATABASES.has(env.BACKUP_DATABASE_ID), 'Use a new dedicated production database, never preview or beta.');
  ensure(/^[a-f0-9]{48}$/.test(env.BACKUP_WORKSPACE_ID || ''), 'Configure the production workspace.');
  ensure(/^[a-zA-Z0-9_-]{1,48}$/.test(env.BACKUP_KEY_ID || ''), 'Configure the recovery key identifier.');
  ensure(unb64(env.BACKUP_ENCRYPTION_KEY || '').length === 32, 'Configure a separate 256-bit recovery key.');
}
export async function captureSnapshot(env, now = Date.now()) {
  identity(env);
  const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
  const catalog = (await db.prepare(schemaSQL).bind().all()).results;
  const names = catalog.filter(s => s.type === 'table').map(s => s.name);
  for (const name of ['deployment_identity', 'workspaces', 'assets', 'sessions', 'roost_members', 'roost_credentials', 'customer_comments']) ensure(names.includes(name), 'A required business/authentication table is missing.');
  ensure(names.length <= 32, 'Backup table limit reached; expand and retest before enabling backups.');
  // D1 batch is a transaction: all rows and the identity marker share one snapshot.
  const statements = catalog.filter(s => s.type === 'table').map(s => db.prepare(s.name === 'assets' ? 'SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' : 'SELECT * FROM ' + quote(s.name)).bind());
  const results = await db.batch([...statements, db.prepare(schemaSQL).bind()]);
  ensure(results.every(r => r.success !== false && Array.isArray(r.results)), 'The database snapshot was not confirmed.');
  ensure(canonical(results.at(-1).results) === canonical(catalog), 'Schema changed while preparing the snapshot; retry safely.');
  const tables = names.map((name, i) => ({ name, rows: results[i].results }));
  const marker = tables.find(t => t.name === 'deployment_identity').rows;
  ensure(marker.length === 1 && marker[0].id === 'main' && marker[0].environment === 'production' && marker[0].database_id === env.BACKUP_DATABASE_ID && marker[0].workspace_id === env.BACKUP_WORKSPACE_ID, 'The bound database does not match the production identity marker.');
  ensure(tables.find(t => t.name === 'workspaces').rows.some(r => r.id === env.BACKUP_WORKSPACE_ID), 'The production workspace is missing.');
  const serialized = canonical(tables);
  ensure(encoder.encode(serialized).length < MAX_SNAPSHOT_BYTES, 'Snapshot exceeds the tested size limit; expand backup storage before growth.');
  const media = [];
  for (const path of new Set(serialized.match(/\/assets\/[A-Za-z0-9._-]+/g) || [])) {
    ensure(env.ASSETS, 'Referenced static media requires the matching release assets binding.');
    const response = await env.ASSETS.fetch(new Request('https://backup.invalid' + path));
    ensure(response.ok, 'A referenced release image could not be backed up.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    ensure(bytes.length <= 2 * 1024 * 1024, 'Release image exceeds the tested backup size.');
    media.push({ path, sha256: await hash(bytes), bytes: b64(bytes) });
  }
  const snapshot = { format: 'rr-business-snapshot-v1', databaseId: env.BACKUP_DATABASE_ID, workspaceId: env.BACKUP_WORKSPACE_ID, environment: 'production', createdAt: new Date(now).toISOString(), schema: catalog, tables, media };
  ensure(encoder.encode(canonical(snapshot)).length <= MAX_SNAPSHOT_BYTES, 'Snapshot and media exceed the tested backup size.');
  return snapshot;
}
export async function encryptSnapshot(snapshot, key, keyId, day) {
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day, 'Use a valid scheduled date.');
  const bytes = encoder.encode(canonical(snapshot));
  ensure(bytes.length <= MAX_SNAPSHOT_BYTES, 'Snapshot exceeds the tested size limit.');
  const envelope = { format: 'rr-encrypted-business-backup-v1', databaseId: snapshot.databaseId, environment: snapshot.environment, keyId, day, createdAt: snapshot.createdAt, sha256: await hash(bytes) };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(envelope), tagLength: 128 }, aes, bytes);
  return canonical({ ...envelope, iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) });
}
export async function decryptSnapshot(serialized, key, expectedDatabaseId) {
  ensure(typeof serialized === 'string' && serialized.length <= MAX_SNAPSHOT_BYTES * 1.4 + 4096, 'Invalid or oversized encrypted backup.');
  const e = JSON.parse(serialized);
  ensure(e.format === 'rr-encrypted-business-backup-v1' && e.environment === 'production' && e.databaseId === expectedDatabaseId, 'Backup identity mismatch.');
  const iv = unb64(e.iv); ensure(iv.length === 12, 'Invalid encryption nonce.');
  const aes = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['decrypt']);
  const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(e), tagLength: 128 }, aes, unb64(e.ciphertext)));
  ensure(bytes.length <= MAX_SNAPSHOT_BYTES && await hash(bytes) === e.sha256, 'Backup integrity verification failed.');
  const snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  ensure(snapshot.format === 'rr-business-snapshot-v1' && snapshot.databaseId === e.databaseId && snapshot.environment === 'production' && snapshot.createdAt === e.createdAt, 'Snapshot identity mismatch.');
  for (const media of snapshot.media) ensure(/^\/assets\/[A-Za-z0-9._-]+$/.test(media.path) && await hash(unb64(media.bytes)) === media.sha256, 'Release media integrity verification failed.');
  return { envelope: e, snapshot };
}
export async function dailyBackup(env, day, now = Date.now()) {
  identity(env);
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(day), 'Use a scheduled date.');
  const boundIdentity = (await env.DB.prepare('SELECT * FROM deployment_identity').bind().all()).results;
  ensure(boundIdentity?.length === 1 && boundIdentity[0].environment === 'production' && boundIdentity[0].database_id === env.BACKUP_DATABASE_ID && boundIdentity[0].workspace_id === env.BACKUP_WORKSPACE_ID, 'The bound database is not the configured production source.');
  const key = `business/v1/${env.BACKUP_DATABASE_ID}/${day}/${env.BACKUP_KEY_ID}.rrbk`;
  // Reuse a verified completed archive on workflow retry; never replace it.
  let object = await env.BACKUP_BUCKET.get(key);
  if (!object) {
    const snapshot = await captureSnapshot(env, now);
    const encrypted = await encryptSnapshot(snapshot, env.BACKUP_ENCRYPTION_KEY, env.BACKUP_KEY_ID, day);
    const written = await env.BACKUP_BUCKET.put(key, encrypted, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/octet-stream' } });
    ensure(written, 'Another backup writer saved first; retry and verify the saved object.');
    object = await env.BACKUP_BUCKET.get(key);
  }
  ensure(object, 'The uploaded backup could not be read back.');
  const verified = await decryptSnapshot(await object.text(), env.BACKUP_ENCRYPTION_KEY, env.BACKUP_DATABASE_ID);
  ensure(verified.envelope.day === day && verified.envelope.keyId === env.BACKUP_KEY_ID && verified.snapshot.workspaceId === env.BACKUP_WORKSPACE_ID, 'The stored backup does not match the scheduled job.');
  const receipt = { databaseId: env.BACKUP_DATABASE_ID, workspaceId: env.BACKUP_WORKSPACE_ID, key, keyId: env.BACKUP_KEY_ID, scheduledDay: day, capturedAt: verified.snapshot.createdAt, verifiedAt: new Date(now).toISOString(), sha256: verified.envelope.sha256, tableCount: verified.snapshot.tables.length, mediaCount: verified.snapshot.media.length, rows: Object.fromEntries(verified.snapshot.tables.map(t => [t.name, t.rows.length])) };
  await env.BACKUP_BUCKET.put(`receipts/${env.BACKUP_DATABASE_ID}/${day}/${env.BACKUP_KEY_ID}.json`, canonical(receipt));
  return receipt; // Private R2 metadata; the runner logs only success timestamps.
}
