// Denial-only hosted verification. No login, workspace creation or business-data
// mutation is attempted; POST probes run only after the whole preview is blocked.
import assert from 'node:assert/strict';
const origin = 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev';
if (process.env.RR_NETWORK_PREVIEW_URL !== origin) throw new Error('Only the exact isolated experience preview is permitted.');
let count = 0;
async function denied(path, body) {
  const r = await fetch(origin+path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10', 'X-Forwarded-For': '203.0.113.10', 'X-RR-Preview-Access': 'true' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(r.status, 403, 'Unapproved network reached '+path); assert.match(r.headers.get('Cache-Control') || '', /no-store/);
  if (path.startsWith('/api/')) { const v = await r.json(); assert.match(v.error, /approved.*network|expired/i); }
  else assert.match(await r.text(), /Private Rise &amp; Roost preview/);
  count++;
}
for (const path of ['/', '/studio', '/shop', '/management.mjs', '/api/studio-info', '/api/studio', '/api/manage/snapshot']) await denied(path);
for (const path of ['/api/manage/product', '/api/upload', '/api/workspaces', '/api/login']) await denied(path, {});
console.log(JSON.stringify({ https: true, unapprovedNetworkBlocked: true, blockedProbes: count, workspaceCreations: 0, businessWrites: 0 }));
