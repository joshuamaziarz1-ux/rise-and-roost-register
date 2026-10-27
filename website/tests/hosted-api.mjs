// Synthetic workspaces only. Never reuse the owner's saved workspace or output access keys.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.RR_BETA_BASE_URL;
assert.equal(origin, 'https://rise-roost-beta.joshua-maziarz1.workers.dev', 'Hosted acceptance must target the isolated beta only.');
const timings = [];
async function http(path, options = {}) {
  const start = performance.now();
  const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(30000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  timings.push({ path: path.startsWith('/api/') ? '/api/' + path.split('/')[2].split('?')[0] : path, status: response.status, ms: Math.round(performance.now() - start), bytes: bytes.length });
  return { response, bytes, data: response.headers.get('Content-Type')?.includes('application/json') ? JSON.parse(new TextDecoder().decode(bytes)) : null };
}
let cookie = '';
async function call(path, body, status = 200, session = cookie, extra = {}) {
  const out = await http(path, body === undefined ? { headers: { Cookie: session } } : {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: session, ...extra }, body: JSON.stringify(body),
  });
  assert.equal(out.response.status, status, path + ': ' + (out.data?.error || 'unexpected HTTP response'));
  return out;
}
for (const path of ['/', '/studio', '/shop', '/about', '/visit', '/contact', '/cart', '/product/bread']) {
  const { response, bytes } = await http(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Strict-Transport-Security'), /max-age/);
  assert.match(new TextDecoder().decode(bytes), /Rise &amp; Roost|Rise & Roost/);
}
for (const path of ['/app.mjs', '/studio.mjs', '/style.css', '/assets/logo.webp'])
  assert.equal((await http(path)).response.status, 200, path);
const created = await call('/api/workspaces', {}, 201);
const s = created.data;
assert.match(s.accessKey, /^[a-f0-9]{48}$/);
const setCookie = created.response.headers.get('set-cookie');
assert.match(setCookie, /HttpOnly; SameSite=Strict/);
assert.match(setCookie, /Secure/);
cookie = setCookie.split(';')[0];
for (const path of ['/api/draft', '/api/publish', '/api/restore', '/api/preview', '/api/upload', '/api/order-status'])
  await call(path, {}, 401, '');
await call('/api/studio', undefined, 401, '');
await call('/api/login', { id: s.id, accessKey: 'incorrect' }, 401, '');
await call('/api/draft', {}, 403, cookie, { Origin: 'https://untrusted.invalid' });
await call('/api/not-a-route', undefined, 404);
await call('/api/upload', { mime: 'image/svg+xml', data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') }, 400);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const uploaded = (await call('/api/upload', { mime: 'image/png', data: png.toString('base64') }, 201)).data;
const image = await http(uploaded.src);
assert.equal(image.response.headers.get('Content-Type'), 'image/png');
assert.deepEqual(image.bytes, new Uint8Array(png));
const document = structuredClone(s.draft);
document.products[0].name = 'Hosted acceptance sample loaf';
document.products[0].description = 'Synthetic test data, never a real order.';
document.products[0].category = 'Bakery';
document.products[0].price = 1150;
document.products[0].stock = 1;
document.products[0].images[0].src = uploaded.src;
document.pickups[0].capacity = 1;
const saved = (await call('/api/draft', { revision: s.revision, document })).data;
const before = (await call('/api/site?workspace=' + s.id, undefined, 200, '')).data;
assert.notEqual(before.document.products[0].name, document.products[0].name);
const login = await call('/api/login', { id: s.id, accessKey: s.accessKey }, 200, '');
const secondCookie = login.response.headers.get('set-cookie').split(';')[0];
assert.deepEqual((await call('/api/studio', undefined, 200, secondCookie)).data.draft, saved.draft);
const preview = (await call('/api/preview', { revision: saved.revision })).data;
assert.equal((await call('/api' + preview.path, undefined, 200, '')).data.document.products[0].name, document.products[0].name);
const published = (await call('/api/publish', { revision: saved.revision })).data;
const publicSite = (await call('/api/site?workspace=' + s.id, undefined, 200, '')).data;
assert.deepEqual(publicSite.document, published.published);
assert.equal(publicSite.orders, undefined);
assert.equal(publicSite.accessKey, undefined);
assert.equal(publicSite.owner_hash, undefined);
await call('/api/draft', { revision: saved.revision, document }, 409);
const invalid = structuredClone(document);
invalid.pickups[0].date = '2026-02-30';
await call('/api/draft', { revision: published.revision, document: invalid }, 400);
assert.deepEqual((await call('/api/studio')).data.draft, published.draft);
const input = {
  workspaceId: s.id, revision: published.publishedRevision, requestId: crypto.randomUUID(),
  pickupId: document.pickups[0].id, total: 1150,
  lines: [{ productId: 'bread', variantId: 'classic', qty: 1, unitPrice: 1150 }],
};
await call('/api/orders', { ...input, total: 1 }, 409, '');
await call('/api/orders', { ...input, revision: -1 }, 409, '');
const requests = [input, { ...input, requestId: crypto.randomUUID() }];
const results = await Promise.all(requests.map((body) => http('/api/orders', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})));
assert.deepEqual(results.map((x) => x.response.status).sort(), [201, 409]);
const winner = results.findIndex((x) => x.response.status === 201);
const accepted = results[winner].data;
assert.equal(accepted.simulated, true);
assert.equal(accepted.paymentStatus, 'not_collected');
assert.equal((await call('/api/orders', requests[winner], 200, '')).data.id, accepted.id);
assert.equal((await call('/api/studio', undefined, 200, secondCookie)).data.orders.length, 1);
await call('/api/order-status', { id: accepted.id, status: 'paid' }, 400);
await call('/api/order-status', { id: accepted.id, status: 'canceled' });
await call('/api/order-status', { id: accepted.id, status: 'ready' }, 409);
await call('/api/logout', {});
await call('/api/studio', undefined, 401);
const report = { checkedAt: new Date().toISOString(), origin, passed: true, checks: ['HTTPS public and Studio routes', 'assets and security headers', 'secure cookies and owner-only writes', 'CSRF and anonymous rejection', 'raster upload and invalid image rejection', 'D1 cross-session persistence', 'draft and preview separation', 'publish without deployment', 'stale revision and invalid input rejection', 'authoritative prices', 'concurrent D1 reservation and idempotency', 'explicit unpaid simulation', 'fulfillment transitions and logout'], timings };
await mkdir('qa-results', { recursive: true });
await writeFile('qa-results/hosted-api.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, checks: report.checks, requests: timings.length, medianMs: timings.map((x) => x.ms).sort((a,b)=>a-b)[Math.floor(timings.length/2)] }, null, 2));
