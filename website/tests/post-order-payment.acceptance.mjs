import test from 'node:test';
import assert from 'node:assert/strict';
import { postOrderFixture } from './post-order-fixture.mjs';
const destinations = { paypal: 'https://paypal.me/SyntheticFinalFlow', venmo: 'https://venmo.com/u/SyntheticFinalFlow', cashapp: 'https://cash.app/$SyntheticFinalFlow' };
for (const method of [...Object.keys(destinations), 'cash_pickup']) test('saved order, idempotent selection and manual confirmation: ' + method, async t => {
  const f = await postOrderFixture(); t.after(() => f.close());
  for (const [provider,url] of Object.entries(destinations)) assert.equal((await f.configure(provider,url)).status,200);
  f.env.REAL_CHECKOUT_ENABLED = 'true';
  const requestId = crypto.randomUUID();
  const made = await f.order({requestId, paymentMethod: 'untrusted-stale-selection'});
  assert.equal(made.status,201,JSON.stringify(made.data));
  const order = made.data; assert.equal(order.selectedPaymentMethod, undefined); assert.equal(order.paymentStatus,'not_collected');
  assert.equal((await f.order({requestId})).data.id,order.id);
  const raw = (await f.snapshot()).orders[0];
  assert.equal(raw.policyAcceptance.version,'2026-11-09');
  const a = await f.track(order,'/payment-method',{method}); assert.equal(a.status,200,JSON.stringify(a.data));
  const b = await f.track(order,'/payment-method',{method}); assert.equal(b.status,200); assert.equal(a.data.version,b.data.version);
  let snapshot = await f.snapshot(); assert.equal(snapshot.orders.length,1);
  assert.equal(snapshot.orders[0].audit.filter(x=>x.action.startsWith('Customer selected')).length,1);
  assert.equal(a.data.paymentStatus,method === 'cash_pickup' ? 'awaiting_cash' : 'not_collected');assert.equal(a.data.paidReceipt,undefined);
  assert.equal(snapshot.management.today.verifiedSales,0);
  assert.equal((await f.track(order,'/payment-method',{method:'invalid'})).status,400);
  assert.equal((await f.track(order,'/payment-method',{method}, {Authorization:'Bearer '+'0'.repeat(48)})).status,404);
  const confirmed = method === 'cash_pickup'
    ? await f.change('cash-received',{id:order.id,orderVersion:a.data.version,amount:order.total,confirmed:true})
    : await f.change('verify-payment',{id:order.id,orderVersion:a.data.version,method,independentlyVerified:true,evidence:''});
  assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
  const paid = await f.track(order);assert.equal(paid.data.paymentStatus,'verified');assert.ok(paid.data.paidReceipt);
  assert.equal((await f.track(order,'/payment-method',{method})).status,409);
  snapshot = await f.snapshot();assert.equal(snapshot.orders.length,1);assert.equal(snapshot.management.today.verifiedSales,order.total);
});
test('unselected orders remain valid without configured links; concurrent choices retain one order and paid guards', async t => {
  const f=await postOrderFixture();t.after(()=>f.close());f.env.REAL_CHECKOUT_ENABLED='true';
  const made=await f.order();assert.equal(made.status,201,JSON.stringify(made.data));
  assert.equal((await f.track(made.data)).data.selectedPaymentMethod,undefined);
  assert.equal((await f.track(made.data,'/payment-method',{method:'paypal'})).status,400);
  const results=await Promise.all([f.track(made.data,'/payment-method',{method:'cash_pickup'}),f.track(made.data,'/payment-method',{method:'cash_pickup'})]);
  assert.deepEqual(results.map(r=>r.status),[200,200]);
  assert.equal((await f.snapshot()).orders.length,1);
  assert.equal((await f.snapshot()).orders[0].audit.filter(x=>x.action.startsWith('Customer selected')).length,1);
});
test('live checkout activation guard remains enforced',async t=>{
 const f=await postOrderFixture();t.after(()=>f.close());assert.equal((await f.order()).status,409);assert.equal((await f.snapshot()).orders.length,0);
});
test('current policy and required contacts still gate creation; canceled and zero-total orders reject selection',async t=>{
 const f=await postOrderFixture();t.after(()=>f.close());f.env.REAL_CHECKOUT_ENABLED='true';
 for(const overrides of [{policyAccepted:false},{policyVersion:'old'},{customerDetails:{name:'Synthetic',email:'invalid',phone:'555-010-1234'}}]) assert.equal((await f.order(overrides)).status,400);
 assert.equal((await f.snapshot()).orders.length,0);
 const made=await f.order();assert.equal(made.status,201);
 const canceled=await f.track(made.data,'/cancel',{confirmCancellation:true,confirmUnpaid:true});assert.equal(canceled.status,200);
 assert.equal((await f.track(made.data,'/payment-method',{method:'cash_pickup'})).status,409);
 // Synthetic zero-due historical order: selection must be rejected regardless
 // of provider configuration. Monetary/credit construction is covered separately.
 const ledger=JSON.parse(f.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json);
 ledger.orders[0].total=0;ledger.orders[0].status='pending';ledger.orders[0].paymentStatus='not_required';
 f.sql.prepare('UPDATE workspaces SET ledger_json=?').run(JSON.stringify(ledger));
 assert.equal((await f.track(made.data,'/payment-method',{method:'cash_pickup'})).status,409);
});
