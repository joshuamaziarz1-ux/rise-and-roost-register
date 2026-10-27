// Read-only hosted check: never signs in, publishes, or modifies the owner's site.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const origin = 'https://rise-roost-beta.joshua-maziarz1.workers.dev';
const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const id = /PUBLIC_WORKSPACE_ID\s*=\s*"([a-f0-9]{48})"/.exec(config)?.[1];
assert.ok(id, 'A specific existing workspace must be configured.');
const browser = await chromium.launch(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {});
try {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const site = await a.newPage();
  const demo = await b.newPage();
  await site.goto(origin + '/shop');
  await demo.goto(origin + '/demo/' + id + '/shop');
  await site.locator('.product-card').first().waitFor();
  await demo.locator('.product-card').first().waitFor();
  const products = (page) => page.locator('.product-card').allTextContents();
  const rootProducts = await products(site);
  const demoProducts = await products(demo);
  const root = await (await a.request.get(origin + '/api/site')).json();
  const published = await (await b.request.get(origin + '/api/site?workspace=' + id)).json();
  if (process.argv.includes('--reproduce')) {
    assert.notEqual(root.id, published.id);
    assert.notDeepEqual(rootProducts, demoProducts);
    console.log(JSON.stringify({ reproduced: true, independentBrowserSessions: 2, rootRevision: root.revision, savedSiteRevision: published.revision, cause: 'root selects starter instead of saved workspace' }));
  } else {
    assert.equal(root.id, id);
    assert.equal(root.revision, published.revision);
    assert.deepEqual(root.document, published.document);
    assert.deepEqual(rootProducts, demoProducts);
    await site.reload();
    await demo.reload();
    assert.deepEqual(await products(site), await products(demo));
    assert.equal((await a.request.get(origin + '/api/site')).headers()['cache-control'], 'no-store');
    console.log(JSON.stringify({ passed: true, independentBrowserSessions: 2, rootAndDemoMatch: true, publishedRevision: root.revision, rootCache: 'no-store', ownerDataModified: false }));
  }
  await a.close(); await b.close();
} finally { await browser.close(); }
