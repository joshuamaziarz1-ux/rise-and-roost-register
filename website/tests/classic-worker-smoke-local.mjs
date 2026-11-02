// The existing legacy smoke script runs only against this temporary local D1.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const bundle = process.env.RR_CLASSIC_WORKER_BUNDLE;
if (!bundle) throw new Error('Provide a local classic Worker dry-run bundle.');
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, modulesRoot: dirname(bundle), rootPath: dirname(bundle), scriptPath: bundle, compatibilityDate: '2025-10-01', cf: false, d1Databases: ['DB'], serviceBindings: { ASSETS: () => new Response('isolated synthetic assets', { headers: { 'Content-Type': 'text/html' } }) } }));
const watchdog = setTimeout(() => { console.error('The isolated legacy runtime did not finish; no hosted target was used.'); process.exit(1); }, 35000);
try {
  const db = await mf.getD1Database('DB');
  const schema = (await readFile(new URL('../schema.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const statement of schema.split(';')) if (statement.trim()) await db.prepare(statement).run();
  const origin = (await mf.ready).origin;
  const result = await promisify(execFile)(process.execPath, [new URL('./worker-smoke.mjs', import.meta.url).pathname], { env: { ...process.env, RR_BETA_BASE_URL: origin }, timeout: 20000, killSignal: 'SIGKILL' });
  process.stdout.write(result.stdout);
} finally { await mf.dispose(); clearTimeout(watchdog); }
