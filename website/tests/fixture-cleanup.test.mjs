import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionBrowserFixture } from './production-browser-fixture.mjs';
import { primaryFixture } from './primary-fixture.mjs';

test('production browser fixture restores fetch before the next local fixture starts', async () => {
  const original = globalThis.fetch;
  const production = await productionBrowserFixture();
  await production.close();
  assert.equal(globalThis.fetch, original);
  const next = await primaryFixture({ experience: true, management: true, port: 4312 });
  try { assert.equal((await fetch(next.origin + '/api/site')).status, 200); }
  finally { await next.close(); }
});
