import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { seed } from '../public/model.mjs';
import { PREVIEW_WORKSPACE } from '../server/preview-access.mjs';
import { accessAuthority } from './access-jwt-fixture.mjs';
export async function primaryFixture({ experience = false, management = false, access = false, port = 4182, hostname = '127.0.0.1' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rr-sync-'));
  const dbFile = join(directory, 'test.sqlite');
  const id = access ? PREVIEW_WORKSPACE : randomBytes(24).toString('hex');
  const key = randomBytes(24).toString('hex');
  const document = seed();
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const now = new Date().toISOString();
  sqlite.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').run(
    id, createHash('sha256').update(id + key).digest('hex'), JSON.stringify(document), JSON.stringify(document),
    JSON.stringify([{ id: randomBytes(24).toString('hex'), document, at: now, label: 'Farmhouse starter' }]), now,
  );
  sqlite.close();
  const authority = access ? await accessAuthority() : null;
  const child = spawn(process.execPath, ['server/local.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, RR_TEST_DB: dbFile, RR_PUBLIC_WORKSPACE_ID: id, RR_CUSTOMER_EXPERIENCE: String(experience), RR_REVIEW_BUILD: String(experience), RR_STUDIO_MANAGEMENT: String(management), RR_PREVIEW_ACCESS_TEST: String(access), ...(authority ? { RR_TEST_ACCESS_TEAM: authority.team, RR_TEST_ACCESS_AUD: authority.aud, RR_TEST_ACCESS_JWKS: JSON.stringify({ keys: [authority.jwk] }) } : {}), PORT: String(port) },
    stdio: 'ignore',
  });
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM'); await done;
    }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch('http://' + hostname + ':' + port + '/api/site', { headers: authority ? { 'Cf-Access-Jwt-Assertion': authority.token } : {} })).ok) return { id, key, authority, origin: 'http://' + hostname + ':' + port, close }; } catch {}
      if (child.exitCode !== null) throw new Error('Isolated publishing fixture exited before readiness.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Isolated publishing fixture did not become ready.');
  } catch (error) { await close(); throw error; }
}
