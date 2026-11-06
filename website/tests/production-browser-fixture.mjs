import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { productionFixture, installProductionTestKeys } from './production-fixture.mjs';
import worker from '../server/worker.mjs';

export async function productionBrowserFixture() {
  const originalFetch = globalThis.fetch;
  installProductionTestKeys();
  const h = await productionFixture(), root = resolve(new URL('../public/', import.meta.url).pathname);
  const mime = { '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.html': 'text/html' };
  h.env.ASSETS.fetch = async request => {
    const path = decodeURIComponent(new URL(request.url).pathname), filename = resolve(root, '.' + path);
    if (!filename.startsWith(root + '/') && filename !== root) return new Response('Not found', { status: 404 });
    try { return new Response(await readFile(filename), { headers: { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' } }); }
    catch { return new Response(await readFile(resolve(root, 'index.html')), { headers: { 'Content-Type': 'text/html' } }); }
  };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const body = []; for await (const chunk of incoming) body.push(chunk);
      const headers = new Headers(incoming.headers);
      // Synthetic signed identities only, injected by this loopback test server.
      headers.delete('Cf-Access-Jwt-Assertion');
      if (incoming.headers['x-synthetic-owner'] === 'a') headers.set('Cf-Access-Jwt-Assertion', h.ownerA);
      if (incoming.headers['x-synthetic-owner'] === 'b') headers.set('Cf-Access-Jwt-Assertion', h.ownerB);
      if (headers.get('Origin') === origin) headers.set('Origin', h.env.WEBSITE_BASE_URL);
      const request = new Request(h.env.WEBSITE_BASE_URL + incoming.url, { method: incoming.method, headers, ...(['GET','HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(body) }) });
      const response = await worker.fetch(request, h.env, {});
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('Synthetic fixture failure'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return { ...h, origin, setOwnerToken(owner, token) {
    if (!['a', 'b'].includes(owner)) throw Error('Unknown synthetic owner.');
    h[owner === 'a' ? 'ownerA' : 'ownerB'] = token;
  }, close: async () => { try { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); h.sql.close(); } finally { globalThis.fetch = originalFetch; } } };
}
