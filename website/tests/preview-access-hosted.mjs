// Denial-only checks. No tester tokens, sign-in, workspace creation or orders.
import assert from 'node:assert/strict';
const origin = 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev';
if (process.env.RR_ACCESS_PREVIEW_URL !== origin) throw new Error('Only the exact isolated experience preview is permitted.');
let count = 0;
async function denied(path, body) {
  const r = await fetch(origin+path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/json', 'Cf-Access-Authenticated-User-Email': 'forged@example.test', 'Cf-Access-Jwt-Assertion': 'not.a.valid-jwt' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok([302, 401, 403].includes(r.status), 'Unverified client reached '+path+' with HTTP '+r.status);
  if (r.status === 302) {
    const login = new URL(r.headers.get('Location'));
    assert.equal(login.protocol, 'https:'); assert.match(login.hostname, /^[a-z0-9-]+\.cloudflareaccess\.com$/);
    assert.ok(login.pathname.startsWith('/cdn-cgi/access/'));
  }
  count++;
}
for (const path of ['/', '/studio', '/shop', '/management.mjs', '/api/studio-info', '/api/studio', '/api/manage/snapshot']) await denied(path);
// These deliberately invalid payloads cannot create records even if a gate is
// misconfigured. Never POST /api/workspaces or /api/orders as an access probe.
for (const path of ['/api/manage/product', '/api/upload']) await denied(path, {});
console.log(JSON.stringify({ https: true, unverifiedAccessBlocked: true, blockedProbes: count, workspaceCreations: 0, businessWrites: 0 }));
