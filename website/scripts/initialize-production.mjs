// Fixed-target, insert-only business initialization. No preview/beta writer.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { validateDocument } from '../server/service.mjs';
import { PRODUCTION_DATABASE_ID as DATABASE_ID, PRODUCTION_WORKSPACE_ID as WORKSPACE_ID } from '../server/production-preparation.mjs';

const tables = ['workspaces', 'deployment_identity', 'sessions', 'previews', 'assets', 'limits', 'device_links', 'roost_members', 'roost_credentials', 'roost_sessions', 'roost_challenges', 'customer_comments'];
const digest = value => createHash('sha256').update(value).digest('hex');
export function validateInitialization(plan) {
  if (plan.databaseId !== DATABASE_ID || plan.workspaceId !== WORKSPACE_ID || !Array.isArray(plan.assets) || plan.assets.length || plan.published?.products?.length !== 0 || plan.published?.orderingPaused !== true) throw Error('Initialize only the reviewed empty product catalog, paused, on the exact new production database.');
  validateDocument(structuredClone(plan.published));
  const address = plan.published.business.pickupAddress;
  if (!address?.name?.trim() || !address.street?.trim() || !address.city?.trim()) throw Error('The owner-approved pickup address is required.');
  if (JSON.stringify(plan.ledger) !== JSON.stringify({ orders: [], management: { settings: plan.ledger?.management?.settings, audit: [], operations: [], benefits: [] } }) ||
      Object.keys(plan.ledger.management.settings || {}).sort().join(',') !== 'calendar,payments,paymentsVersion' || Object.keys(plan.ledger.management.settings.payments).length || plan.ledger.management.settings.paymentsVersion !== 0) throw Error('No customer activity, history, credentials or payment destinations may be seeded.');
  return { document: JSON.stringify(plan.published), ledger: JSON.stringify(plan.ledger) };
}
const normalizeCatalog = rows => rows.map(r => [r.type, r.name, r.sql.replace(/\s+/g, ' ').trim()]).sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
export async function initializeProduction(api, plan, now = new Date().toISOString()) {
  const { document, ledger } = validateInitialization(plan);
  const metadata = await api('/d1/database/' + DATABASE_ID);
  if (metadata.uuid !== DATABASE_ID || metadata.name !== 'rise-roost-production-db') throw Error('Wrong production database identity. No writes allowed.');
  const query = async (sql, params = []) => {
    const result = await api('/d1/database/' + DATABASE_ID + '/query', { sql, params });
    if (!result?.[0]?.success) throw Error('The database did not confirm the operation. Do not reset or claim success.');
    return result[0];
  };
  const catalogSQL = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name";
  const baseline = new DatabaseSync(':memory:');
  let expected; try { baseline.exec(readFileSync(new URL('../production-schema.sql', import.meta.url), 'utf8')); expected = normalizeCatalog(baseline.prepare(catalogSQL).all()); } finally { baseline.close(); }
  if (JSON.stringify(normalizeCatalog((await query(catalogSQL)).results)) !== JSON.stringify(expected)) throw Error('Unexpected production schema. Stop without resetting.');
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async name => [name, (await query('SELECT count(*) AS n FROM "' + name + '"')).results[0].n])));
  const before = await counts();
  if (tables.some(name => before[name] > (['workspaces','deployment_identity'].includes(name) ? 1 : 0))) throw Error('Existing records found. Initialization cannot overwrite or clean them.');
  const existing = (await query('SELECT * FROM workspaces WHERE id=?', [WORKSPACE_ID])).results[0];
  if (before.workspaces && (!existing || existing.published_json !== document || existing.draft_json !== document || existing.ledger_json !== ledger || existing.versions_json !== '[]')) throw Error('Existing business records differ. Nothing may be overwritten.');
  const identity = (await query("SELECT * FROM deployment_identity WHERE id='main'")).results[0];
  if (before.deployment_identity && (!identity || identity.environment !== 'production' || identity.database_id !== DATABASE_ID || identity.workspace_id !== WORKSPACE_ID || !existing)) throw Error('Existing deployment identity differs. Stop without changes.');
  let writes = 0;
  if (!existing) {
    // No usable legacy owner key is created or copied. Production uses Access.
    const disabledHash = digest(randomBytes(32));
    const result = await query('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,revision,published_revision,versions_json,ledger_json,ledger_version,created_at) SELECT ?,?,?,?,1,1,?, ?,1,? WHERE NOT EXISTS (SELECT 1 FROM workspaces)', [WORKSPACE_ID, disabledHash, document, document, '[]', ledger, now]);
    if (result.meta.changes !== 1) throw Error('Concurrent initialization detected. Inspect without overwriting.');
    writes++;
  }
  if (!identity) {
    // Identity is installed last. A partial failure stays inaccessible. Reruns
    // can only finish this exact unchanged, empty initialization; never reset.
    const result = await query("INSERT INTO deployment_identity(id,environment,database_id,workspace_id) SELECT 'main','production',?,? WHERE NOT EXISTS (SELECT 1 FROM deployment_identity) AND EXISTS (SELECT 1 FROM workspaces WHERE id=? AND published_json=? AND ledger_json=?)", [DATABASE_ID, WORKSPACE_ID, WORKSPACE_ID, document, ledger]);
    if (result.meta.changes !== 1) throw Error('Production identity was not confirmed. Checkout must remain locked.');
    writes++;
  }
  const after = await counts();
  if (tables.some(name => after[name] !== (['workspaces','deployment_identity'].includes(name) ? 1 : 0))) throw Error('Post-initialization counts differ. Inspect without resetting.');
  const saved = (await query('SELECT published_json,ledger_json FROM workspaces WHERE id=?', [WORKSPACE_ID])).results[0];
  if (saved.published_json !== document || saved.ledger_json !== ledger) throw Error('Server persistence differs. No successful initialization claimed.');
  return { databaseId: DATABASE_ID, workspaceId: WORKSPACE_ID, rows: after, products: 0, orders: 0, verifiedSales: 0, paymentDestinations: 0, orderingPaused: true, documentSha256: digest(document), initializationWrites: writes, previewOrBetaWrites: 0, deployed: false };
}
async function main() {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  const allowed = new Set(['--review', '--approved-sha256', '--evidence', '--apply', '--plan']);
  for (let i = 0; i < args.length; i++) { if (!allowed.has(args[i])) throw Error('Unknown option. No database override/reset is supported.'); if (!['--apply','--plan'].includes(args[i])) i++; }
  if (!args.includes('--review')) throw Error('Provide the private reviewed initialization file.');
  const bytes = readFileSync(value('--review')), plan = JSON.parse(bytes); validateInitialization(plan);
  if (!args.includes('--apply') || args.includes('--plan')) { console.log(JSON.stringify({ mode: 'plan', databaseId: DATABASE_ID, products: 0, orders: 0, orderingPaused: true, reviewSha256: digest(bytes), networkRequests: 0 })); return; }
  if (value('--approved-sha256') !== digest(bytes) || !args.includes('--evidence') || existsSync(value('--evidence'))) throw Error('Use the exact approved review hash and a new private evidence path.');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw Error('Configured Cloudflare credentials are required.');
  const api = async (path, body) => {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok || !result.success) throw Error('Cloudflare did not confirm this request. Do not reset or blindly retry.'); return result.result;
  };
  const result = await initializeProduction(api, plan);
  writeFileSync(value('--evidence'), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
