import { createServer as createSecureServer } from 'node:https';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { productionFixture, installProductionTestKeys } from './production-fixture.mjs';
import worker from '../server/worker.mjs';

export async function productionBrowserFixture({ customerEmail = false } = {}) {
  const originalFetch = globalThis.fetch;
  installProductionTestKeys();
  const h = await productionFixture(), root = resolve(new URL('../public/', import.meta.url).pathname);
  const emailMessages = [];
  if (customerEmail) {
    h.sql.exec(await readFile(new URL('../migrations/0003_customer_email_accounts.sql', import.meta.url), 'utf8'));
    Object.assign(h.env, { CUSTOMER_EMAIL_ENABLED: 'true', CUSTOMER_EMAIL_DOMAIN_VERIFIED: 'true', CUSTOMER_EMAIL_FROM: 'signin@example.test', RESEND_API_KEY: 'synthetic-only', CUSTOMER_EMAIL_CODE_SECRET: 'synthetic-only-code-secret-never-production' });
    const isolatedFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://api.resend.com/emails') {
        emailMessages.push(JSON.parse(init.body));
        return Response.json({ id: 'synthetic-' + emailMessages.length });
      }
      return isolatedFetch(url, init);
    };
  }
  const mime = { '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.html': 'text/html' };
  h.env.ASSETS.fetch = async request => {
    const path = decodeURIComponent(new URL(request.url).pathname), filename = resolve(root, '.' + path);
    if (!filename.startsWith(root + '/') && filename !== root) return new Response('Not found', { status: 404 });
    try { return new Response(await readFile(filename), { headers: { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' } }); }
    catch { return new Response(await readFile(resolve(root, 'index.html')), { headers: { 'Content-Type': 'text/html' } }); }
  };
  const handler = async (incoming, outgoing) => {
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
      const resultHeaders = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length) resultHeaders['set-cookie'] = response.headers.getSetCookie();
      outgoing.writeHead(response.status, resultHeaders); outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('Synthetic fixture failure'); }
  };
  let tlsDirectory;
  let server;
  if (customerEmail) {
    tlsDirectory = await mkdtemp(resolve(tmpdir(), 'rr-email-tls-'));
    const key = resolve(tlsDirectory, 'key.pem'), cert = resolve(tlsDirectory, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' });
    server = createSecureServer({ key: await readFile(key), cert: await readFile(cert) }, handler);
  } else server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = (customerEmail ? 'https://' : 'http://') + '127.0.0.1:' + server.address().port;
  return { ...h, origin, emailMessages, setOwnerToken(owner, token) {
    if (!['a', 'b'].includes(owner)) throw Error('Unknown synthetic owner.');
    h[owner === 'a' ? 'ownerA' : 'ownerB'] = token;
  }, close: async () => { try { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); h.sql.close(); } finally { globalThis.fetch = originalFetch; if (tlsDirectory) await rm(tlsDirectory, { recursive: true, force: true }); } } };
}
