import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { productionFixture, installProductionTestKeys } from './production-fixture.mjs';
import { TESTER_A, TESTER_B } from './access-jwt-fixture.mjs';

const originalFetch = globalThis.fetch;
before(installProductionTestKeys);
after(() => { globalThis.fetch = originalFetch; });
const accessSessionSeconds = 730 * 3600;

// Sign arbitrary claims to exercise verification rather than the fixture's
// convenience setters. Keys and identities exist only in this local process.
function signedClaims(h, changes = {}, omitted = []) {
  const now = Math.floor(h.now / 1000);
  const claims = { iss: h.auth.team, aud: h.auth.aud, email: TESTER_A, sub: 'synthetic-owner-a', type: 'app', iat: now - 1, nbf: now - 1, exp: now + 3600, ...changes };
  for (const name of omitted) delete claims[name];
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: h.auth.kid }).sign(h.auth.privateKey);
}

test('both owners can navigate Studio and read its APIs with the configured 730-hour Access session', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const now = Math.floor(h.now / 1000), expiresAt = now + accessSessionSeconds;
  const actors = [];
  for (const [email, subject, ownerName] of [[TESTER_A, 'synthetic-owner-a', 'Synthetic Danielle'], [TESTER_B, 'synthetic-owner-b', 'Synthetic Other Owner']]) {
    const token = await signedClaims(h, { email: email.toUpperCase(), sub: subject, iat: now, nbf: now, exp: expiresAt });
    for (const path of ['/studio', '/studio/products', '/studio/orders', '/studio/api/studio-info', '/studio/api/studio', '/studio/api/manage/snapshot']) {
      const r = await h.call(path, undefined, { token });
      assert.equal(r.status, 200, `${email}: ${path}`);
      assert.equal(r.headers.has('set-cookie'), false);
      if (path === '/studio/api/manage/snapshot') {
        actors.push(r.data.actor.id);
        assert.equal(r.data.owner, ownerName);
        assert.equal(r.data.productionOwnerAccess, true);
        assert.equal(r.data.sessionExpiresAt, new Date(expiresAt * 1000).toISOString());
        assert.equal(r.data.studioPath, '/studio');
      }
    }
  }
  assert.equal(new Set(actors).size, 2, 'Owners retain distinct audited identities.');
  assert.equal(h.sql.prepare('SELECT count(*) n FROM sessions').get().n, 0);
});

test('an Access session older than 24 hours stays valid until its signed expiration, then requires reauthentication', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const now = Math.floor(h.now / 1000), issuedAt = now - 48 * 3600, expiresAt = issuedAt + accessSessionSeconds;
  const token = await signedClaims(h, { iat: issuedAt, nbf: issuedAt, exp: expiresAt });
  for (const at of [h.now, expiresAt * 1000 - 1]) {
    assert.equal((await h.call('/studio', undefined, { token, at })).status, 200);
    assert.equal((await h.call('/studio/api/manage/snapshot', undefined, { token, at })).status, 200);
  }
  for (const at of [expiresAt * 1000, expiresAt * 1000 + 1000]) {
    for (const path of ['/studio', '/studio/api/studio', '/studio/api/manage/snapshot']) {
      const r = await h.call(path, undefined, { token, at });
      assert.equal(r.status, 403, path);
      assert.equal(r.data.productionOwnerAccessRequired, true);
      assert.equal(r.headers.get('Cache-Control'), 'no-store, private');
    }
  }
  const renewed = await signedClaims(h, { iat: expiresAt, nbf: expiresAt, exp: expiresAt + accessSessionSeconds });
  const resumed = await h.call('/studio/api/manage/snapshot', undefined, { token: renewed, at: expiresAt * 1000 + 1000 });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.sessionExpiresAt, new Date((expiresAt + accessSessionSeconds) * 1000).toISOString());
});

test('missing or substituted credentials cannot use Studio cookies or an email header to access owner data', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  h.env.DB = new Proxy({}, { get() { throw Error('Unauthorized traffic reached storage.'); } });
  for (const headers of [{}, { Cookie: 'CF_Authorization=not-an-assertion; rr_studio=' + 'a'.repeat(48), 'Cf-Access-Authenticated-User-Email': TESTER_A }, { Authorization: 'Bearer ' + h.ownerA }, { 'Cf-Access-Jwt-Assertion': 'x'.repeat(16385) }]) {
    for (const path of ['/studio', '/studio/api/studio', '/studio/api/manage/snapshot']) {
      const r = await h.call(path, undefined, { headers });
      assert.equal(r.status, 401, path);
      assert.equal(r.data.productionOwnerAccessRequired, true);
      assert.equal(r.headers.has('set-cookie'), false);
    }
  }
});

test('signature, algorithm, issuer and audience verification still reject forged credentials before storage access', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const otherKeys = await generateKeyPair('RS256');
  const now = Math.floor(h.now / 1000);
  const claims = { iss: h.auth.team, aud: h.auth.aud, email: TESTER_A, sub: 'synthetic-owner-a', type: 'app', iat: now, exp: now + 3600 };
  const unsigned = [Buffer.from(JSON.stringify({ alg: 'none', kid: h.auth.kid })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), ''].join('.');
  const symmetric = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', kid: h.auth.kid }).sign(new TextEncoder().encode('synthetic-untrusted-signing-key-only'));
  const tokens = [
    ['wrong signing key', await h.auth.mint({ key: otherKeys.privateKey, expiresAt: now + 3600 })],
    ['tampered signature', h.ownerA.slice(0, -10) + 'badpayload'],
    ['unsigned token', unsigned],
    ['symmetric algorithm substitution', symmetric],
    ['malformed token', 'not.a.valid.jwt'],
    ['wrong issuer', await signedClaims(h, { iss: 'https://untrusted.cloudflareaccess.com' })],
    ['wrong audience', await signedClaims(h, { aud: 'b'.repeat(64) })],
    ['missing issuer', await signedClaims(h, {}, ['iss'])],
    ['missing audience', await signedClaims(h, {}, ['aud'])],
    ['empty audiences', await signedClaims(h, { aud: [] })],
  ];
  h.env.DB = new Proxy({}, { get() { throw Error('Rejected token reached storage.'); } });
  for (const [label, token] of tokens) {
    const r = await h.call('/studio/api/manage/snapshot', undefined, { token });
    assert.equal(r.status, 403, label);
    assert.equal(r.data.productionOwnerAccessRequired, true, label);
  }
});

test('missing and malformed identity or time claims fail closed without reading business data', async t => {
  const h = await productionFixture(); t.after(() => h.sql.close());
  const now = Math.floor(h.now / 1000);
  const invalid = [
    ...['email', 'sub', 'type', 'iat', 'exp'].map(name => [`missing ${name}`, {}, [name]]),
    ...[null, '', 'outsider@example.test', 'owner-a@example.test.attacker.invalid', ['owner-a@example.test'], 1, ' owner-a@example.test', 'owner-a@example.test '].map(email => ['invalid email ' + JSON.stringify(email), { email }]),
    ...[null, '', 1, {}, [], 'a'.repeat(256)].map(sub => ['invalid subject ' + JSON.stringify(sub), { sub }]),
    ...[null, '', 'service', {}, ['app']].map(type => ['invalid type ' + JSON.stringify(type), { type }]),
    ['expired token', { exp: now - 1 }],
    ['future issued-at', { iat: now + 60 }],
    ['future not-before', { nbf: now + 60 }],
    ['lifetime exceeds the existing Access session ceiling', { iat: now, nbf: now, exp: now + accessSessionSeconds + 1 }],
    ['token age exceeds the existing Access session ceiling', { iat: now - accessSessionSeconds - 60, nbf: now - accessSessionSeconds - 60, exp: now + 3600 }],
    ['invalid time ordering', { iat: now + 2, exp: now + 1 }],
    ['equal issued-at and expiration', { iat: now + 1, exp: now + 1 }],
    ...[null, '123', now - 0.5, Number.MAX_SAFE_INTEGER + 1].map(iat => ['invalid issued-at ' + JSON.stringify(iat), { iat }]),
    ...[null, '123', now + 3600.5, Number.MAX_SAFE_INTEGER + 1].map(exp => ['invalid expiration ' + JSON.stringify(exp), { exp }]),
    ['invalid not-before', { nbf: '123' }],
  ];
  h.env.DB = new Proxy({}, { get() { throw Error('Invalid identity reached storage.'); } });
  for (const [label, changes, omitted] of invalid) {
    const r = await h.call('/studio/api/manage/snapshot', undefined, { token: await signedClaims(h, changes, omitted) });
    assert.equal(r.status, 403, label);
    assert.equal(r.data.productionOwnerAccessRequired, true, label);
  }
});
