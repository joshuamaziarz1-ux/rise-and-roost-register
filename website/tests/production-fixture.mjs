// Local-only synthetic production fixture. Never imports remote credentials.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { accessAuthority, TESTER_A, TESTER_B } from './access-jwt-fixture.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed } from '../public/model.mjs';
import { POLICY_VERSION } from '../public/commerce.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
import worker from '../server/worker.mjs';

const authorities = new Map();
export function installProductionTestKeys() {
  globalThis.fetch = async url => {
    const keys = authorities.get(String(url));
    if (!keys) throw Error('Unexpected external request in an isolated production test.');
    return new Response(JSON.stringify({ keys }), { headers: { 'Content-Type': 'application/json' } });
  };
}
export async function productionFixture() {
  const auth = await accessAuthority(), now = Date.now();
  authorities.set(auth.team + '/cdn-cgi/access/certs', [auth.jwk]);
  const ownerA = await auth.mint({ expiresAt: Math.floor(now / 1000) + 3600 });
  const ownerB = await auth.mint({ email: TESTER_B, subject: 'synthetic-owner-b', expiresAt: Math.floor(now / 1000) + 3600 });
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../production-schema.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0003_customer_remembered_sessions.sql', import.meta.url), 'utf8'));
  const doc = seed(now + 7 * 86400000); doc.business.pickupAddress = { name: 'Rise & Roost', street: 'Synthetic pickup street', city: 'Synthetic Indiana location' };
  doc.products[0].inventoryMode = 'physical'; doc.products[0].stock = 2;
  sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,ledger_json,created_at) VALUES(?,?,?,?,?,?,?)').run(PRODUCTION_WORKSPACE_ID, 'disabled-legacy-owner-key', JSON.stringify(doc), JSON.stringify(doc), '[]', '{"orders":[],"management":{"settings":{"payments":{},"paymentsVersion":0},"audit":[],"operations":[],"benefits":[]}}', new Date(now).toISOString());
  sql.prepare("INSERT INTO deployment_identity VALUES('main','production',?,?)").run(PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID);
  const env = { DEPLOYMENT_ENVIRONMENT: 'production', PRODUCTION_RELEASE_APPROVED: 'true', REAL_CHECKOUT_ENABLED: 'false', REVIEW_BUILD: 'false',
    PRODUCTION_DATABASE_ID, PUBLIC_WORKSPACE_ID: PRODUCTION_WORKSPACE_ID, WEBSITE_BASE_URL: 'https://rise-and-roost.com', STUDIO_MANAGEMENT_ENABLED: 'true', COMMERCE_UPDATE_ENABLED: 'true', CUSTOMER_EXPERIENCE_ENABLED: 'true',
    PRODUCTION_ACCESS_TEAM_DOMAIN: auth.team, PRODUCTION_ACCESS_AUD: auth.aud, PRODUCTION_OWNERS: JSON.stringify([{ email: TESTER_A, name: 'Synthetic Danielle', role: 'owner' }, { email: TESTER_B, name: 'Synthetic Other Owner', role: 'owner' }]),
    DB: sqliteD1(sql), ASSETS: { fetch: () => new Response('Synthetic public assets', { headers: { 'Content-Type': 'text/html' } }) } };
  async function call(path, body, { token, headers = {}, at } = {}) {
    const request = new Request('https://rise-and-roost.com' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://rise-and-roost.com', ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = at ? await (await import('../server/production-runtime.mjs')).productionFetch(request, env, at) : await worker.fetch(request, env, {});
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }
  const snapshot = async (token = ownerA) => (await call('/studio/api/manage/snapshot', undefined, { token })).data;
  async function change(action, body = {}, token = ownerA) {
    const s = await snapshot(token);
    return call('/studio/api/manage/' + action, { operationId: crypto.randomUUID(), revision: s.revision, ledgerVersion: s.ledgerVersion, paymentsVersion: s.management.settings?.paymentsVersion || 0, ...body }, { token });
  }
  async function order(overrides = {}) {
    const site = (await call('/api/site')).data, p = site.document.products[0];
    return call('/api/orders', { workspaceId: PRODUCTION_WORKSPACE_ID, storefront: 'main', revision: site.revision, requestId: crypto.randomUUID(), pickupId: site.document.pickups[0].id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Customer', email: 'private-customer@example.test', phone: '555-0100' }, policyAccepted: true, policyVersion: POLICY_VERSION, total: p.price, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], ...overrides });
  }
  function track(order, suffix = '', body, headers = {}) {
    const url = new URL(order.trackingPath, env.WEBSITE_BASE_URL);
    return call(url.pathname.replace('/orders/', '/api/order-tracking/') + suffix, body, { headers: { Authorization: 'Bearer ' + new URLSearchParams(url.hash.slice(1)).get('access'), ...headers } });
  }
  async function configure(provider = 'paypal', url = 'https://www.paypal.com/ncp/payment/SYNTHETIC_ONLY') {
    let r = await change('payment-destination', { provider, url, enabled: true, businessConfirmed: true });
    if (r.status !== 200) throw Error(r.data.error);
    r = await change('payment-test-start', { provider }); if (r.status !== 200) throw Error(r.data.error);
    return change('payment-test-confirm', { provider, testId: r.data.result.testId, confirmed: true });
  }
  return { sql, env, auth, now, ownerA, ownerB, call, snapshot, change, order, track, configure };
}
