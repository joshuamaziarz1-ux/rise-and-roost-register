// Real local workerd/D1, synthetic Access signing authority, no hosted requests.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { accessAuthority, TESTER_A } from './access-jwt-fixture.mjs';
import { seed } from '../public/model.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
const bundle = process.env.RR_PRODUCTION_WORKER_BUNDLE;
if (!bundle) throw Error('Provide the local production dry-run bundle.');
const authority = await accessAuthority(), origin = 'https://rise-and-roost.com';
const issuedAt = Math.floor(Date.now() / 1000);
const token = await authority.mint({ issuedAt, notBefore: issuedAt, expiresAt: issuedAt + 730 * 3600 });
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, modulesRoot: dirname(bundle), rootPath: dirname(bundle), scriptPath: bundle, compatibilityDate: '2025-10-01', cf: false, d1Databases: ['DB'],
  serviceBindings: { ASSETS: () => new Response('Synthetic production assets') },
  outboundService: request => {
    assert.equal(request.url, authority.team + '/cdn-cgi/access/certs');
    return new Response(JSON.stringify({ keys: [authority.jwk] }), { headers: { 'Content-Type': 'application/json' } });
  },
  bindings: { DEPLOYMENT_ENVIRONMENT: 'production', PRODUCTION_RELEASE_APPROVED: 'true', REAL_CHECKOUT_ENABLED: 'true', PRODUCTION_DATABASE_ID, PUBLIC_WORKSPACE_ID: PRODUCTION_WORKSPACE_ID,
    WEBSITE_BASE_URL: origin, REVIEW_BUILD: 'false', STUDIO_MANAGEMENT_ENABLED: 'true', COMMERCE_UPDATE_ENABLED: 'true', CUSTOMER_EXPERIENCE_ENABLED: 'true',
    PRODUCTION_ACCESS_TEAM_DOMAIN: authority.team, PRODUCTION_ACCESS_AUD: authority.aud, PRODUCTION_OWNERS: JSON.stringify([{ email: TESTER_A, name: 'Synthetic Owner', role: 'owner' }]) } }));
try {
  const db = await mf.getD1Database('DB');
  const schema = (await readFile(new URL('../production-schema.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const statement of schema.split(';')) if (statement.trim()) await db.prepare(statement).run();
  const doc = seed(Date.now() + 7 * 86400000); doc.business.pickupAddress = { name: 'Synthetic farm', street: 'Synthetic street', city: 'Synthetic Indiana city' }; doc.products[0].stock = 1; doc.products[0].inventoryMode = 'physical';
  const serialized = JSON.stringify(doc);
  await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').bind(PRODUCTION_WORKSPACE_ID, 'disabled-legacy-owner', serialized, serialized, '[]', new Date().toISOString()).run();
  await db.prepare("INSERT INTO deployment_identity VALUES('main','production',?,?)").bind(PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID).run();
  const call = (path, body, owner = false, headers = {}) => mf.dispatchFetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(owner ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await call('/studio/api/manage/snapshot')).status, 401);
  assert.equal((await call('/api/manage/snapshot', undefined, true)).status, 404);
  const snapshot = async () => { const r = await call('/studio/api/manage/snapshot', undefined, true); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const mutation = async (action, body) => {
    const s = await snapshot();
    const r = await call('/studio/api/manage/' + action, { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, paymentsVersion: s.management.settings?.paymentsVersion || 0, ...body }, true);
    assert.equal(r.status, 200, await r.clone().text()); return r.json();
  };
  await mutation('payment-destination', { provider: 'paypal', url: 'https://paypal.me/SyntheticWorkerdBusiness', enabled: true, businessConfirmed: true });
  const test = await mutation('payment-test-start', { provider: 'paypal' });
  await mutation('payment-test-confirm', { provider: 'paypal', testId: test.result.testId, confirmed: true });
  const p = doc.products[0], input = { workspaceId: PRODUCTION_WORKSPACE_ID, storefront: 'main', revision: 1, pickupId: doc.pickups[0].id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Workerd Guest' }, policyAccepted: true, policyVersion: '2026-11-01', total: p.price, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }] };
  const responses = await Promise.all([call('/api/orders', { ...input, requestId: crypto.randomUUID() }), call('/api/orders', { ...input, requestId: crypto.randomUUID() })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const order = await responses.find(r => r.status === 201).json(); assert.equal(order.simulated, false);
  const trackedPath = '/api/order-tracking/' + PRODUCTION_WORKSPACE_ID + '/' + order.id, bearer = { Authorization: 'Bearer ' + order.trackingPath.split('=')[1] };
  assert.equal((await call(trackedPath)).status, 401);
  assert.equal((await snapshot()).management.today.verifiedSales, 0);
  let s = await mutation('verify-payment', { id: order.id, orderVersion: order.version, method: 'paypal', independentlyVerified: true, evidence: '' });
  assert.equal(s.management.today.verifiedSales, order.total); assert.equal(s.orders[0].paidReceipt.beta, false);
  s = await mutation('verify-payment', { id: order.id, orderVersion: s.orders[0].version, method: 'paypal', independentlyVerified: true });
  assert.equal(s.orders[0].verifications.length, 1);
  for (const status of ['preparing', 'ready']) s = await mutation('fulfillment', { id: order.id, orderVersion: s.orders[0].version, status });
  const tracked = await (await call(trackedPath, undefined, false, bearer)).json(); assert.equal(tracked.status, 'ready'); assert.equal(tracked.paymentStatus, 'verified');
  console.log(JSON.stringify({ actualProductionWorkerdD1: true, individualSignedOwnerIdentity: true, privateApiAuthorization: true, manualPaymentVerification: true, duplicateVerificationPrevented: true, atomicInventoryRace: true, trackingAndFulfillment: true, remoteRequests: 0, remoteWrites: 0 }));
} finally { await mf.dispose(); }
