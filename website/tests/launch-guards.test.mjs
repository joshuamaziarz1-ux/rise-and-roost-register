import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';

test('public launch stays blocked before storage access while production owner authentication is unconfigured', async () => {
  let touches = 0;
  const DB = new Proxy({}, { get() { touches++; throw new Error('Production database must not be accessed.'); } });
  const env = { DB, ASSETS: { fetch() { touches++; throw new Error('Production assets must not be served.'); } }, STUDIO_MANAGEMENT_ENABLED: 'true', COMMERCE_UPDATE_ENABLED: 'true', REVIEW_BUILD: 'false' };
  for (const path of ['/', '/studio', '/api/manage/snapshot', '/api/orders', '/api/workspaces', '/studio/setup', '/demo/example']) {
    const response = await worker.fetch(new Request('https://rise-and-roost.com' + path), env, {});
    assert.equal(response.status, 503); assert.match(await response.text(), /individual owner accounts/);
  }
  assert.equal(touches, 0);
});
test('copying preview testing flags cannot enable the commerce update on a different database', async () => {
  const env = { STUDIO_MANAGEMENT_ENABLED: 'true', COMMERCE_UPDATE_ENABLED: 'true', REVIEW_BUILD: 'true', PREVIEW_DATABASE_ID: '7ab95a5a-6086-43cd-8247-fd481cf1ee91', DB: new Proxy({}, { get() { throw new Error('No database access allowed.'); } }) };
  const response = await worker.fetch(new Request('https://rise-and-roost.com/studio'), env, {});
  assert.equal(response.status, 503); assert.match(await response.text(), /Production launch is blocked/);
});
