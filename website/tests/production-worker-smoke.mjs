// Production configuration is tested locally without touching its remote D1.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
const bundle = process.env.RR_PRODUCTION_WORKER_BUNDLE;
if (!bundle) throw Error('Provide a local production dry-run bundle.');
const config = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json;print(json.dumps(tomllib.load(open("wrangler.production.toml","rb"))))'], { encoding: 'utf8' }));
let assetsRead = false;
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, modulesRoot: dirname(bundle), rootPath: dirname(bundle), scriptPath: bundle, compatibilityDate: config.compatibility_date, cf: false, d1Databases: ['DB'], bindings: config.vars, serviceBindings: { ASSETS: () => { assetsRead = true; return new Response('must not be served'); } } }));
try {
  const db = await mf.getD1Database('DB');
  for (const path of ['/', '/studio', '/api/orders', '/api/workspaces', '/api/manage/snapshot']) {
    const response = await mf.dispatchFetch('https://rise-and-roost.com' + path);
    assert.equal(response.status, 503); assert.match(await response.text(), /individual owner accounts/);
  }
  assert.equal(assetsRead, false);
  assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*'").first()).n, 0);
  console.log(JSON.stringify({ productionProfileBlockedBeforeStorage: true, publicAssetAccess: false, remoteDatabaseWrites: 0, domainChanges: 0 }));
} finally { await mf.dispose(); }
