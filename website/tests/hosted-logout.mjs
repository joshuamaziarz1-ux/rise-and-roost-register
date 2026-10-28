// Targeted live check using a fresh synthetic workspace only; never main-site credentials.
import assert from 'node:assert/strict';
const origin = 'https://rise-roost-beta.joshua-maziarz1.workers.dev';
const response = await fetch(origin + '/api/workspaces', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(response.status, 201);
const { id } = await response.json();
const scoped = response.headers.getSetCookie().find(c => c.startsWith('rr_studio_' + id + '='));
assert.ok(scoped?.includes('HttpOnly; SameSite=Strict') && scoped.includes('Secure'));
const cookie = scoped.split(';')[0];
let r = await fetch(origin + '/api/studio', { headers: { Cookie: cookie } });
assert.equal(r.status,200); assert.equal((await r.json()).id,id);
r = await fetch(origin + '/api/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(r.status,200);
r = await fetch(origin + '/api/studio', { headers: { Cookie: cookie } });
assert.equal(r.status,401);
console.log(JSON.stringify({ passed: true, check: 'legacy scoped-only logout revokes the selected session', originalMainWorkspaceTouched: false }));
