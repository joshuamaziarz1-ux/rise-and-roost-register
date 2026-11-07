// Scheduled operator job, never part of customer requests or a deployment.
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dailyBackup, PROTECTED_DATABASES, MAX_SNAPSHOT_BYTES } from '../server/daily-backup.mjs';

const run = promisify(execFile);
const validId = id => /^[a-f0-9-]{36}$/.test(id || '') && !PROTECTED_DATABASES.has(id);
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
async function limitedText(response) {
  requireValue(response.ok, 'The D1 SQL export download was not confirmed.');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw new Error('SQL export exceeds the tested backup limit.'); } chunks.push(value); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function loadProductionExport({ accountId, databaseId, token, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  requireValue(validId(databaseId), 'A new dedicated production database is required; preview/beta are prohibited.');
  requireValue(/^[a-f0-9]{32}$/.test(accountId || '') && token, 'Configure the dedicated D1 export identity.');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/export`;
  const request = async body => {
    const response = await fetcher(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    requireValue(response.ok, 'The D1 export request was not confirmed.');
    const data = await response.json(); requireValue(data.success && data.result && data.result.success !== false && !data.result.error, 'The D1 export did not return confirmed metadata.');
    // Completed Cloudflare exports place the download inside result.result.
    // Retain top-level support for older responses, without logging either URL.
    return { ...data.result, signed_url: data.result.signed_url || data.result.result?.signed_url };
  };
  let result = await request({ output_format: 'polling' });
  requireValue(result.at_bookmark || result.signed_url, 'The D1 export bookmark is missing.');
  const bookmark = result.at_bookmark;
  for (let attempt = 0; !result.signed_url && attempt < 60; attempt++) {
    requireValue(result.status !== 'error', 'The database export failed.');
    await sleep(1000);
    result = await request({ output_format: 'polling', current_bookmark: bookmark });
  }
  requireValue(result.signed_url, 'The D1 export did not finish within the backup window.');
  const download = new URL(result.signed_url);
  requireValue(download.protocol === 'https:' && !download.username && !download.password, 'The export download is not a secure provider URL.');
  // This URL is supplied by the authenticated Cloudflare API, never by a customer.
  // It is deliberately not logged and receives no Cloudflare authorization header.
  const dump = await limitedText(await fetcher(download.href, { redirect: 'error', signal: AbortSignal.timeout(60000) }));
  const sql = new DatabaseSync(':memory:');
  try { sql.exec(dump); } catch { sql.close(); throw new Error('The database export could not be restored for verification.'); }
  const db = {
    prepare(query) { return { bind(...args) { return { query, args, async all() { return { success: true, results: sql.prepare(query).all(...args) }; } }; } }; },
    async batch(statements) { sql.exec('BEGIN'); try { const rows = statements.map(s => ({ success: true, results: sql.prepare(s.query).all(...s.args) })); sql.exec('COMMIT'); return rows; } catch (error) { sql.exec('ROLLBACK'); throw error; } },
  };
  return { db, close: () => sql.close() };
}
export function r2Client({ accountId, bucket, directory }) {
  requireValue(/^[a-f0-9]{32}$/.test(accountId || '') && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || ''), 'Configure a separate private backup bucket.');
  const endpoint = 'https://' + accountId + '.r2.cloudflarestorage.com';
  async function aws(args) { return run('aws', ['--endpoint-url', endpoint, '--region', 'auto', 's3api', ...args], { maxBuffer: 1000000, env: { ...process.env, AWS_PAGER: '', AWS_EC2_METADATA_DISABLED: 'true', AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required', AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required' } }); }
  return {
    async get(key) {
      const path = join(directory, crypto.randomUUID() + '.encrypted');
      try { await aws(['get-object', '--bucket', bucket, '--key', key, path]); return { text: () => readFile(path, 'utf8') }; }
      catch (error) { if (/NoSuchKey|\(404\)|Not Found/.test(error.stderr || '')) return null; throw new Error('Backup storage read was not confirmed; inspect the restricted runner permissions.'); }
    },
    async put(key, body, options) {
      const path = join(directory, crypto.randomUUID() + '.encrypted'); await writeFile(path, body, { mode: 0o600, flag: 'wx' });
      try { await aws(['put-object', '--bucket', bucket, '--key', key, '--body', path, '--content-type', 'application/octet-stream', ...(options?.onlyIf ? ['--if-none-match', '*'] : [])]); return { key }; }
      catch (error) { if (/PreconditionFailed|\(412\)/.test(error.stderr || '')) return null; throw new Error('Backup upload was not confirmed; no success receipt was issued.'); }
    },
  };
}
export async function main() {
  process.umask(0o077);
  requireValue(process.env.RR_PRODUCTION_BACKUP_ENABLED === 'true', 'Production backup activation is required.');
  requireValue(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.RR_BACKUP_ENCRYPTION_KEY, 'Configure separate private backup credentials and the recovery key.');
  const heartbeat = new URL(process.env.RR_BACKUP_SUCCESS_HEARTBEAT_URL || 'http://invalid');
  requireValue(heartbeat.protocol === 'https:' && !heartbeat.username && !heartbeat.password, 'Configure a private missing-backup heartbeat monitor before activation.');
  const directory = await mkdtemp(join(tmpdir(), 'rr-encrypted-backup-')); let source;
  try {
    const env = { BACKUP_ENABLED: 'true', BACKUP_DATABASE_ID: process.env.RR_PRODUCTION_DATABASE_ID, BACKUP_WORKSPACE_ID: process.env.RR_PRODUCTION_WORKSPACE_ID, BACKUP_KEY_ID: process.env.RR_BACKUP_KEY_ID, BACKUP_ENCRYPTION_KEY: process.env.RR_BACKUP_ENCRYPTION_KEY };
    source = await loadProductionExport({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: env.BACKUP_DATABASE_ID, token: process.env.RR_D1_EXPORT_TOKEN });
    env.DB = source.db;
    env.ASSETS = { async fetch(request) { const path = new URL(request.url).pathname; requireValue(/^\/assets\/[A-Za-z0-9._-]+$/.test(path) && !['.', '..'].includes(path.slice(8)), 'Invalid release media path.'); return new Response(await readFile(new URL('../public' + path, import.meta.url))); } };
    env.BACKUP_BUCKET = r2Client({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, bucket: process.env.RR_PRODUCTION_BACKUP_BUCKET, directory });
    let receipt;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { receipt = await dailyBackup(env, new Date().toISOString().slice(0, 10)); break; }
      catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 5000)); }
    }
    const monitored = await fetch(heartbeat, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
    requireValue(monitored.ok, 'The successful-backup heartbeat was not confirmed.');
    console.log(JSON.stringify({ backupVerified: true, monitoringConfirmed: true, capturedAt: receipt.capturedAt, verifiedAt: receipt.verifiedAt }));
  } finally { source?.close(); await rm(directory, { recursive: true, force: true }); }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(() => { console.error('Production backup job did not complete all verification/monitoring steps. Review the restricted job configuration; no customer data or credentials are logged.'); process.exitCode = 1; });
