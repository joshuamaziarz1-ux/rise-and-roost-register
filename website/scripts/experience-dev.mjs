// Separate, persistent local review data. Never opens .data/demo.sqlite or D1.
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { seed } from '../public/model.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.data/customer-experience');
await mkdir(directory, { recursive: true });
let state;
try { state = JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  state = { workspaceId: randomBytes(24).toString('hex'), ownerKey: randomBytes(24).toString('hex') };
  await writeFile(resolve(directory, 'state.json'), JSON.stringify(state), { mode: 0o600, flag: 'wx' });
}
const database = resolve(directory, 'review.sqlite'), sql = new DatabaseSync(database);
sql.exec(await readFile(resolve(root, 'schema.sql'), 'utf8'));
if (!sql.prepare('SELECT id FROM workspaces WHERE id=?').get(state.workspaceId)) {
  const doc = JSON.stringify(seed()), at = new Date().toISOString();
  sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').run(state.workspaceId, createHash('sha256').update(state.workspaceId+state.ownerKey).digest('hex'), doc, doc, JSON.stringify([{ id: randomBytes(24).toString('hex'), document: JSON.parse(doc), at, label: 'Customer experience review' }]), at);
}
sql.close();
const child = spawn(process.execPath, ['server/local.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, RR_TEST_DB: database, RR_PUBLIC_WORKSPACE_ID: state.workspaceId, RR_CUSTOMER_EXPERIENCE: 'true', RR_REVIEW_BUILD: 'true', PORT: process.env.PORT || '4186' } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
