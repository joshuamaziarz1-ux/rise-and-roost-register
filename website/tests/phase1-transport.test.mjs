import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { security } from '../server/worker.mjs';

// Only the deployment selector may be read: transport/disclosure handling must
// precede launch configuration, authentication, assets and every database call.
function isolatedEnvironment(environment) {
  return new Proxy({}, {
    get(_target, key) {
      if (key === 'DEPLOYMENT_ENVIRONMENT') return environment;
      throw Error('Early transport handling reached configuration or storage: ' + String(key));
    },
  });
}

test('Phase 1 redirects production HTTP before authentication or storage and preserves the full URL', async () => {
  const env = isolatedEnvironment('production');
  const paths = ['/', '/api/site', '/studio', '/studio/api/manage/snapshot', '/missing-path', '/.well-known/security.txt', '/shop/item%2Fencoded?a=1&a=2&encoded=%2F%26&space=a+b'];
  for (const hostname of ['rise-and-roost.com', 'www.rise-and-roost.com']) {
    for (const path of paths) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const request = new Request('http://' + hostname + path, { method, ...(method === 'POST' ? { body: 'synthetic-only' } : {}) });
        const r = await worker.fetch(request, env, {});
        assert.equal(r.status, 308, `${method}: ${request.url}`);
        assert.equal(r.headers.get('Location'), 'https://' + hostname + path);
        assert.equal(await r.text(), '');
        assert.equal(r.headers.has('set-cookie'), false);
      }
    }
  }
});

test('Phase 1 keeps security.txt an uncached plain-text 404 for GET and HEAD before assets or storage', async () => {
  for (const environment of ['production', undefined]) {
    for (const hostname of ['rise-and-roost.com', 'www.rise-and-roost.com']) {
      for (const method of ['GET', 'HEAD']) {
        const r = await worker.fetch(new Request('https://' + hostname + '/.well-known/security.txt?check=phase2', { method }), isolatedEnvironment(environment), {});
        assert.equal(r.status, 404);
        assert.equal(r.headers.get('Content-Type'), 'text/plain; charset=utf-8');
        assert.equal(r.headers.get('Cache-Control'), 'no-store');
        assert.equal(r.headers.has('Location'), false);
        assert.equal(r.headers.has('set-cookie'), false);
        for (const [name, value] of Object.entries(security)) assert.equal(r.headers.get(name), value);
        assert.equal(await r.text(), method === 'HEAD' ? '' : 'Security contact file is not configured.\n');
      }
    }
  }
});
