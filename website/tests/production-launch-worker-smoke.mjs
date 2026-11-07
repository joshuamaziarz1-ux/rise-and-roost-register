import { weekStart } from '../server/pickup-booking.mjs';
import { calendarPickups, addCalendarDays } from '../server/pickup-calendar.mjs';
// Real local workerd/D1, synthetic Access signing authority, no hosted requests.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { accessAuthority, TESTER_A } from './access-jwt-fixture.mjs';
import { seed } from '../public/model.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
import { softwarePasskey } from './passkey-fixture.mjs';
const passwordMode = process.env.RR_TEST_PASSWORD_LOGIN === 'true';
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
  bindings: { ...(passwordMode ? { ROOST_PASSWORD_LOGIN_ENABLED: 'true', ROOST_PASSWORD_PEPPER: 'synthetic'.repeat(8) } : {}), PICKUP_APPROVALS_REQUIRED: 'true', DEPLOYMENT_ENVIRONMENT: 'production', PRODUCTION_RELEASE_APPROVED: 'true', REAL_CHECKOUT_ENABLED: 'true', PRODUCTION_DATABASE_ID, PUBLIC_WORKSPACE_ID: PRODUCTION_WORKSPACE_ID,
    WEBSITE_BASE_URL: origin, REVIEW_BUILD: 'false', STUDIO_MANAGEMENT_ENABLED: 'true', COMMERCE_UPDATE_ENABLED: 'true', CUSTOMER_EXPERIENCE_ENABLED: 'true',
    PRODUCTION_ACCESS_TEAM_DOMAIN: authority.team, PRODUCTION_ACCESS_AUD: authority.aud, PRODUCTION_OWNERS: JSON.stringify([{ email: TESTER_A, name: 'Synthetic Owner', role: 'owner' }]) } }));
try {
  const db = await mf.getD1Database('DB');
  const schema = (await readFile(new URL('../production-schema.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const statement of schema.split(';')) if (statement.trim()) await db.prepare(statement).run();
  const migration = (await readFile(new URL('../migrations/0003_customer_remembered_sessions.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const statement of migration.split(';')) if (statement.trim()) await db.prepare(statement).run();
  if (passwordMode) {
    const passwordSchema = (await readFile(new URL('../migrations/0011-roost-password-login.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    for (const statement of passwordSchema.split(';')) if (statement.trim()) await db.prepare(statement).run();
  }
  const doc = seed(Date.now() + 7 * 86400000); doc.business.pickupAddress = { name: 'Synthetic farm', street: 'Synthetic street', city: 'Synthetic Indiana city' }; doc.products[0].stock = 1; doc.products[0].inventoryMode = 'physical';
  doc.pickups = []; doc.pickupSchedule = { start: '15:00', end: '18:00', capacity: 1 };
  const serialized = JSON.stringify(doc);
  await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').bind(PRODUCTION_WORKSPACE_ID, 'disabled-legacy-owner', serialized, serialized, '[]', new Date().toISOString()).run();
  const booking = { weeks: Object.fromEntries(calendarPickups(doc, Date.now()).map(p => [weekStart(p.date), {status:'approved', actor:{id:'synthetic-owner'}}])), dates:{}, closedDates:{} };
  await db.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').bind(JSON.stringify({orders:[],pickupBooking:booking}),PRODUCTION_WORKSPACE_ID).run();
  await db.prepare("INSERT INTO deployment_identity VALUES('main','production',?,?)").bind(PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID).run();
  const call = (path, body, owner = false, headers = {}) => mf.dispatchFetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(owner ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // Exercise the compiled passkey/session code in the real edge runtime, using
  // only this disposable local D1 and signing authenticator.
  const cookies = new Map(), key = softwarePasskey();
  const customer = async (action, body) => {
    const r = await call('/api/roost/' + action + (body === undefined ? '?workspace=' + PRODUCTION_WORKSPACE_ID : ''), body === undefined ? undefined : { workspaceId: PRODUCTION_WORKSPACE_ID, ...body }, false, { Cookie: [...cookies].map(([k,v]) => k+'='+v).join('; ') });
    for (const c of r.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); if (c.includes('Max-Age=0')) cookies.delete(k); else cookies.set(k,v); }
    assert.equal(r.status, 200, await r.clone().text()); return r.json();
  };
  let options = (await customer('options', { kind: 'register', profile: { name: 'Synthetic Edge Customer' } })).options;
  const joined = await customer('verify', { response: key.register(options, origin) });
  assert.ok(joined.recoveryKey); assert.equal((await customer('me')).member.id, joined.member.id);
  const copiedCookie = [...cookies].map(([k,v]) => k+'='+v).join('; ');
  assert.equal((await call('/studio/api/manage/snapshot', undefined, false, { Cookie: copiedCookie })).status, 401);
  await customer('logout', {});
  assert.equal((await customer('me')).member, null);
  assert.equal((await (await call('/api/roost/me?workspace='+PRODUCTION_WORKSPACE_ID, undefined, false, { Cookie: copiedCookie })).json()).member, null);
  options = (await customer('options', { kind: 'login' })).options;
  await customer('verify', { response: key.login(options, origin) });
  const recovered = await customer('recover', { recoveryKey: joined.recoveryKey });
  assert.equal(recovered.member.id, joined.member.id); assert.notEqual(recovered.recoveryKey, joined.recoveryKey);
  assert.equal((await db.prepare('SELECT count(*) n FROM roost_credentials').first()).n, 0);
  const replacement = softwarePasskey();
  options = (await customer('options', { kind: 'add' })).options;
  await customer('verify', { response: replacement.register(options, origin) });
  const devices = (await customer('me')).devices;
  await customer('revoke-device', { deviceId: devices.find(d => d.current).id });
  assert.equal((await customer('me')).member, null);
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
  const site = await (await call('/api/site')).json();
  assert.ok(site.document.pickups.length >= 24); assert.ok(site.document.pickups[0].id.startsWith('recurring-'));
  const p = doc.products[0], input = { workspaceId: PRODUCTION_WORKSPACE_ID, storefront: 'main', revision: 1, pickupId: site.document.pickups[0].id, checkoutMode: 'guest', customerDetails: { name: 'Synthetic Workerd Guest' }, policyAccepted: true, policyVersion: '2026-11-01', total: p.price, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }] };
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
  const pickup = s.management.pickups.find(p => p.id === order.pickup.id);
  s = await mutation('calendar-date', { pickup: { ...pickup, closed: true }, confirmExistingOrders: true });
  assert.deepEqual(s.orders[0].pickup, order.pickup);
  assert.equal(s.published.pickups.length, 1); assert.equal(s.published.pickups[0].closed, true);
  // Exercise monetary events through the compiled production routes and D1.
  options = (await customer('options', { kind: 'login' })).options;
  await customer('verify', { response: replacement.login(options, origin) });
  await customer('favorite', { productId: p.id, saved: true });
  assert.deepEqual((await customer('me')).favorites, [p.id]);
  await mutation('credit-settings', { enabled: true, termsReviewed: true, confirmed: true });
  const returnItem = await mutation('credit-item', { name: 'Synthetic approved bottle', cents: 1000, status: 'active', confirmed: true });
  const item = returnItem.management.returnCredits.items[0];
  await mutation('credit-return', { memberId: joined.member.id, lines: [{ id: item.id, version: item.version, qty: 1 }], confirmed: true });
  // Separate synthetic stock and pickup capacity for member checkout; existing
  // completed guest records above stay in this disposable database.
  const next = (await snapshot()).published; next.products[0].stock = 5; next.pickups = []; next.pickupSchedule.capacity = 10;
  await db.prepare('UPDATE workspaces SET published_json=?,draft_json=?,published_revision=published_revision+1,revision=revision+1 WHERE id=?').bind(JSON.stringify(next), JSON.stringify(next), PRODUCTION_WORKSPACE_ID).run();
  const memberSite = await (await call('/api/site')).json();
  const memberInput = { ...input, revision: memberSite.revision, pickupId: memberSite.document.pickups[0].id, checkoutMode: 'member', creditCents: 700, requestId: crypto.randomUUID() };
  const memberHeaders = { Cookie: [...cookies].map(([k,v]) => k+'='+v).join('; ') };
  const creditedResponse = await call('/api/orders', memberInput, false, memberHeaders); assert.equal(creditedResponse.status, 201, await creditedResponse.clone().text());
  const credited = await creditedResponse.json(); assert.equal(credited.total, 200); assert.equal(credited.returnCredit.status, 'reserved');
  assert.equal((await customer('me')).credits.available, 300); assert.equal((await customer('me')).credits.reserved, 700);
  const duplicate = await call('/api/orders', memberInput, false, memberHeaders); assert.equal((await duplicate.json()).id, credited.id);
  s = await mutation('verify-payment', { id: credited.id, orderVersion: 1, method: 'paypal', independentlyVerified: true });
  assert.equal((await customer('me')).credits.reserved, 0);
  s = await mutation('fulfillment', { id: credited.id, orderVersion: s.orders.find(o => o.id === credited.id).version, status: 'canceled', confirmCancellation: true, releaseInventory: true, reason: 'Synthetic credit cancellation' });
  assert.equal((await customer('me')).credits.available, 1000);
  const full = await call('/api/orders', { ...memberInput, requestId: crypto.randomUUID(), creditCents: 900 }, false, memberHeaders);
  assert.equal(full.status, 201, await full.clone().text()); const fullOrder = await full.json(); assert.equal(fullOrder.total, 0); assert.equal(fullOrder.returnCredit.status, 'used'); assert.equal(fullOrder.paymentStatus, 'not_required');
  assert.equal((await customer('me')).credits.available, 100);
  assert.equal((await call('/api/orders', { ...memberInput, requestId: crypto.randomUUID(), creditCents: 200 }, false, memberHeaders)).status, 409);
  assert.equal((await call('/studio/api/manage/credit-adjust', { memberId: joined.member.id, delta: 999999, operationId: crypto.randomUUID(), confirmed: true, reason: 'forged' }, false, memberHeaders)).status, 401);
  // Cash uses the same atomic workspace transaction in the actual production bundle.
  assert.equal((await customer('me')).cashPickup.eligible, false);
  await mutation('cash-settings', { enabled: true });
  const cashInput = { ...memberInput, paymentMethod: 'cash_pickup', creditCents: 50 };
  const cashGuest = await call('/api/orders', { ...cashInput, requestId: crypto.randomUUID(), checkoutMode: 'guest', creditCents: 0 });
  assert.equal(cashGuest.status, 401);
  const cashRace = await Promise.all([call('/api/orders', { ...cashInput, requestId: crypto.randomUUID() }, false, memberHeaders), call('/api/orders', { ...cashInput, requestId: crypto.randomUUID() }, false, memberHeaders)]);
  assert.deepEqual(cashRace.map(r => r.status).sort(), [201,409]);
  const cashOrder = await cashRace.find(r => r.status === 201).json();
  assert.equal(cashOrder.total,850); assert.equal(cashOrder.paymentStatus,'awaiting_cash');
  for (const status of ['preparing','ready']) { const so = (await snapshot()).orders.find(o => o.id === cashOrder.id); await mutation('fulfillment', { id: so.id, orderVersion: so.version, status }); }
  assert.equal((await customer('me')).cashPickup.outstanding,true);
  const so = (await snapshot()).orders.find(o => o.id === cashOrder.id);
  const cashReceipt = { id:so.id, orderVersion:so.version, amount:so.total, confirmed:true };
  assert.equal((await call('/studio/api/manage/cash-received', { ...cashReceipt, operationId:crypto.randomUUID() },false,memberHeaders)).status,401);
  await mutation('cash-received', cashReceipt);
  const paid = (await snapshot()).orders.find(o => o.id === so.id);
  assert.equal(paid.paymentStatus,'verified'); assert.equal(paid.verifications.length,1); assert.equal(paid.returnCredit.status,'used');
  assert.equal((await customer('me')).cashPickup.outstanding,false);
  assert.equal((await call('/studio/api/manage/cash-received', { ...cashReceipt, orderVersion:paid.version, operationId:crypto.randomUUID() },true)).status,409);
  await mutation('cash-privilege', { memberId:joined.member.id, allowed:false, reason:'Private edge test note' });
  assert.equal((await customer('me')).cashPickup.eligible,false);
  await mutation('cash-privilege', { memberId:joined.member.id, allowed:true });
  assert.equal((await customer('me')).cashPickup.eligible,true);
  await mutation('cash-settings', { enabled:false });
  assert.equal((await customer('me')).cashPickup.eligible,false);
  // New booking and rescheduling operations use the exact production executable.
  const originalDate=cashOrder.pickup.date;
  await mutation('pickup-week',{week:weekStart(originalDate),status:'closed',confirmExistingOrders:true});
  assert.equal((await call('/api/orders',{...memberInput,pickupId:cashOrder.pickupId,requestId:crypto.randomUUID()},false,memberHeaders)).status,409);
  const pr=await call('/studio/api/manage/pickup-preview?date='+originalDate,undefined,true);assert.equal(pr.status,200);const preview=await pr.json();assert.ok(preview.orders.some(o=>o.id===cashOrder.id));
  const pending=await mutation('pickup-change',{date:originalDate,orderIds:preview.orders.map(o=>o.id),mode:'pending',message:'Synthetic pending makeup notice.',reason:'unexpected',confirmed:true});
  const changed=pending.orders.find(o=>o.id===cashOrder.id);assert.equal(changed.pickupChange.replacement,null);assert.equal(changed.paymentStatus,'verified');assert.equal(changed.returnCredit.status,'used');assert.equal(changed.pickupDeadline,null);
  const event=pending.management.pickupChanges[0];
  await mutation('pickup-change-update',{eventId:event.id,eventVersion:1,mode:'makeup',replacementDate:addCalendarDays(originalDate,5),start:'14:00',end:'17:00',message:'Synthetic makeup appointment.',reason:'unexpected',confirmed:true});
  const response=await customer('pickup-response',{orderId:cashOrder.id,eventId:event.id,version:2,response:'confirmed'});assert.equal(response.pickupChange.acknowledgement.response,'confirmed');
  assert.equal((await customer('me')).orders.find(o=>o.id===cashOrder.id).pickupChange.acknowledgement.response,'confirmed');
  assert.equal((await call('/api/order-tracking/'+PRODUCTION_WORKSPACE_ID+'/'+cashOrder.id+'/pickup-response',{eventId:event.id,version:2,response:'alternate'})).status,401);
  const state=await snapshot();assert.equal(state.management.pickupChanges[0].revisions.length,2);assert.equal(state.orders.find(o=>o.id===cashOrder.id).pickupChangeHistory.length,1);
  const stored=await db.prepare('SELECT ledger_json FROM workspaces WHERE id=?').bind(PRODUCTION_WORKSPACE_ID).first(), withoutBooking=JSON.parse(stored.ledger_json);delete withoutBooking.pickupBooking;
  await db.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').bind(JSON.stringify(withoutBooking),PRODUCTION_WORKSPACE_ID).run();
  assert.equal((await call('/api/site')).status,503,'Production cannot silently fall back to legacy availability');
  await db.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').bind(stored.ledger_json,PRODUCTION_WORKSPACE_ID).run();
  if (passwordMode) {
    const before = await customer('me');
    await customer('password/setup', { username: 'existing-neighbor', password: 'a friendly garden phrase' });
    assert.equal((await customer('me')).member.id, before.member.id);
    assert.deepEqual((await customer('me')).orders, before.orders);
    await customer('logout', {});
    await customer('password/login', { username: 'existing-neighbor', password: 'a friendly garden phrase' });
    assert.equal((await customer('me')).member.id, before.member.id);
    await customer('logout', {});
    const created = await customer('password/register', { username: 'new-neighbor', password: 'a friendly garden phrase', name: 'New Neighbor' });
    const createdId = (await customer('me')).member.id;
    await customer('password/recover', { username: 'new-neighbor', password: 'another friendly garden phrase', recoveryKey: created.recoveryKey });
    assert.equal((await customer('me')).member.id, createdId);
  }
  console.log(JSON.stringify({ actualProductionWorkerdD1: true, pickupApprovalsReschedulingAcknowledgements: true, cashPickupAtomicMemberEligibilityReceiptAndCreditLifecycle: true, returnCreditsFavoritesReservationFinalizationCancellationAndZeroDue: true, customerPasskeysSessionsRecoveryAndRevocation: true, individualSignedOwnerIdentity: true, privateApiAuthorization: true, manualPaymentVerification: true, duplicateVerificationPrevented: true, atomicInventoryRace: true, trackingAndFulfillment: true, automaticCalendar: true, calendarExceptionPreservesOrder: true, remoteRequests: 0, remoteWrites: 0 }));
} finally { await mf.dispose(); }
