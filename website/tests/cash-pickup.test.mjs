import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './member-checkout-fixture.mjs';
import { outstandingCash } from '../server/cash-pickup.mjs';
const ok = r => assert.equal(r.status, 200, r.data.error);
async function cashFixture() { const h = await fixture(); ok(await h.change('cash-settings', { enabled: true })); return h; }
const place = (h, extra = {}, client) => h.order({ paymentMethod: 'cash_pickup', ...extra }, client);
const receive = (h, o, extra = {}) => h.change('cash-received', { id:o.id, orderVersion:h.ledger().orders.find(v=>v.id===o.id).version, amount:o.total, confirmed:true, ...extra });
test('cash is OFF by default and private eligibility uses authenticated membership', async()=>{
 const h=await fixture();assert.equal((await h.me()).data.cashPickup.eligible,false);assert.equal((await place(h)).status,409);ok(await h.change('cash-settings',{enabled:true}));assert.equal((await h.me()).data.cashPickup.eligible,true);
 for(const overrides of [{},{checkoutMode:'member'},{customerDetails:{name:'Synthetic Neighbor'},memberId:h.customer.id}])assert.equal((await place(h,overrides,h.guest)).status,401);
 const o=await place(h);assert.equal(o.status,201,o.data.error);assert.equal(o.data.paymentStatus,'awaiting_cash');assert.equal(o.data.paymentVerifiedAt,undefined);assert.equal(h.ledger().orders[0].customer.memberId,h.customer.id);
});
test('restriction and restoration use member IDs; notes remain internal and other checkout stays available', async()=>{
 const h=await cashFixture();ok(await h.change('cash-privilege',{memberId:h.customer.id,allowed:false,reason:'Private synthetic note'}));assert.equal((await h.me()).data.cashPickup.eligible,false);assert.ok(!JSON.stringify((await h.me()).data).includes('Private synthetic note'));assert.equal((await place(h)).status,409);assert.equal((await h.order()).status,201);assert.equal((await place(h,{},h.other)).status,201);ok(await h.change('cash-privilege',{memberId:h.customer.id,allowed:true}));assert.equal((await place(h)).status,201);
});
test('one unresolved order is atomic across simultaneous requests; independent members and other methods work', async()=>{
 const h=await cashFixture(),rs=await Promise.all([place(h),place(h)]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.match(rs.find(r=>r.status===409).data.error,/already have an order awaiting cash payment/);assert.equal(h.ledger().orders.length,1);assert.equal((await h.order()).status,201);assert.equal((await place(h,{},h.other)).status,201);
});
test('simultaneous retries preserve a single order and do not disclose another member order',async()=>{
 const h=await cashFixture(),requestId=crypto.randomUUID(),rs=await Promise.all([place(h,{requestId}),place(h,{requestId})]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,201]);assert.equal(rs[0].data.id,rs[1].data.id);assert.equal((await place(h,{requestId},h.other)).status,403);
});
test('preparing, ready and overdue remain unpaid; cash receipt confirms amount and prevents duplicates',async()=>{
 const h=await cashFixture(),o=(await place(h)).data;
 for(const status of ['preparing','ready']){ok(await h.change('fulfillment',{id:o.id,orderVersion:h.ledger().orders[0].version,status}));assert.equal((await place(h)).status,409);assert.equal(h.ledger().orders[0].paymentStatus,'awaiting_cash');}
 assert.equal((await receive(h,o,{amount:o.total-1})).status,400);assert.equal((await receive(h,o,{confirmed:false})).status,400);assert.equal((await h.change('verify-payment',{id:o.id,orderVersion:h.ledger().orders[0].version,method:'paypal',independentlyVerified:true})).status,409);
 ok(await receive(h,o));assert.equal(h.ledger().orders[0].paidReceipt.total,o.total);assert.equal((await receive(h,o)).status,409);assert.equal((await place(h)).status,201);
});
test('cash settings disable only new orders and do not prevent receipt or preserve a stale eligibility grant',async()=>{
 const h=await cashFixture(),o=(await place(h)).data;ok(await h.change('cash-settings',{enabled:false}));assert.equal((await place(h,{},h.other)).status,409);ok(await receive(h,o));assert.equal((await h.order()).status,201);assert.equal((await place(h)).status,409);
});
test('mixed return credit reserves once, finalizes on cash receipt once; credit-only never creates cash debt',async()=>{
 const h=await cashFixture();ok(await h.enable());ok(await h.award(2000));const o=(await place(h,{creditCents:500})).data;assert.equal(o.subtotal,900);assert.equal(o.total,400);assert.deepEqual(h.balance(),{available:1500,reserved:500});ok(await receive(h,o));assert.deepEqual(h.balance(),{available:1500,reserved:0});const covered=(await place(h,{creditCents:900})).data;assert.equal(covered.total,0);assert.equal(covered.paymentStatus,'not_required');assert.equal(covered.selectedPaymentMethod,undefined);assert.equal(outstandingCash(covered),false);
});
test('cancellation restores credits once and reopening cannot bypass another cash order',async()=>{
 const h=await cashFixture();ok(await h.enable());ok(await h.award());const o=(await place(h,{creditCents:500})).data;ok(await h.cancel(o));assert.deepEqual(h.balance(),{available:1000,reserved:0});ok(await h.cancel(o));assert.equal((await place(h)).status,201);assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:h.ledger().orders.find(v=>v.id===o.id).version,status:'pending',confirmCorrection:true,reason:'Synthetic reopen review'})).status,409);
});
test('formal unpaid resolution honors deadline and communications, releases credit, preserves history and privileges',async()=>{
 const h=await cashFixture();ok(await h.enable());ok(await h.award());const o=(await place(h,{creditCents:500})).data,p={id:o.id,orderVersion:1,amount:o.total,confirmed:true,reason:'Owner reviewed missed pickup'};
 assert.equal((await h.change('cash-unpaid',p)).status,409);assert.equal((await h.change('resolve-pickup',{id:o.id,orderVersion:1,resolution:'reviewed',reason:'Synthetic review',confirmed:true})).status,409);
 const later=Date.parse(o.pickupDeadline)+1000;h.sql.prepare('UPDATE sessions SET expires=?').run(later+86400000);ok(await h.change('cash-unpaid',p,{now:later}));assert.deepEqual(h.balance(),{available:1000,reserved:0});assert.equal(h.ledger().orders[0].resolution.kind,'unpaid_not_picked_up');assert.equal(outstandingCash(h.ledger().orders[0]),false);assert.equal((await h.me()).data.cashPickup.allowed,true);assert.equal((await place(h)).status,201);
});
test('customer tracking cannot change cash method or record payment; administrator mutations require owner and CSRF',async()=>{
 const h=await cashFixture(),o=(await place(h)).data,u=new URL(o.trackingPath,h.origin),path=u.pathname.replace('/orders/','/api/order-tracking/'),headers={Authorization:'Bearer '+new URLSearchParams(u.hash.slice(1)).get('access')};
 assert.equal((await h.post(h.member,path+'/payment-method',{method:'paypal'},{headers})).status,409);
 for(const action of ['cash-settings','cash-privilege','cash-received','cash-unpaid']){assert.equal((await h.post(h.member,'/api/manage/'+action,{operationId:crypto.randomUUID(),id:o.id,enabled:true,allowed:true,memberId:h.customer.id,amount:o.total,confirmed:true})).status,401);assert.equal((await h.post(h.owner,'/api/manage/'+action,{operationId:crypto.randomUUID()},{headers:{Origin:'https://evil.test'}})).status,403);}
});
test('failed validation and failed writes leave order, cash eligibility and inventory unchanged',async()=>{
 const h=await cashFixture(),before=h.ledger();for(const bad of [{pickupId:'missing'},{total:1},{policyAccepted:false},{lines:[{productId:'bread',variantId:'classic',qty:99,unitPrice:900}]}])assert.ok((await place(h,bad)).status>=400);assert.deepEqual(h.ledger(),before);h.sql.exec("CREATE TRIGGER synthetic_failure BEFORE UPDATE OF ledger_json ON workspaces BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END");assert.equal((await place(h)).status,500);assert.deepEqual(h.ledger(),before);
});
test('owner cash receipt retries are idempotent and concurrent confirmations record one payment',async()=>{
 const h=await cashFixture(),o=(await place(h)).data,s=await h.snapshot(),body={operationId:crypto.randomUUID(),ledgerVersion:s.ledgerVersion,id:o.id,orderVersion:1,amount:o.total,confirmed:true};
 const rs=await Promise.all([h.post(h.owner,'/api/manage/cash-received',body),h.post(h.owner,'/api/manage/cash-received',body)]);assert.ok(rs.some(r=>r.status===200));ok(await h.post(h.owner,'/api/manage/cash-received',body));assert.equal(h.ledger().orders[0].verifications.length,1);
});
test('cash payment correction cannot introduce a second outstanding order; disabling after stale eligibility is enforced',async()=>{
 const h=await cashFixture(),o=(await place(h)).data;ok(await receive(h,o));const next=(await place(h)).data;const correct=()=>h.change('payment-correction',{id:o.id,orderVersion:h.ledger().orders.find(v=>v.id===o.id).version,reason:'Synthetic mistaken receipt',independentlyChecked:true});assert.equal((await correct()).status,409);ok(await h.cancel(next));ok(await correct());assert.equal((await place(h)).status,409);ok(await receive(h,o));ok(await h.change('cash-privilege',{memberId:h.customer.id,allowed:false}));assert.equal((await place(h)).status,409);
});
test('closing unpaid refuses unresolved communications or disputes and master updates reject stale versions',async()=>{
 const h=await cashFixture(),o=(await place(h)).data,l=h.ledger();l.orders[0].pickupDeadline=new Date(h.now-1000).toISOString();l.orders[0].contact={unresolved:true};h.putLedger(l);const close=()=>h.change('cash-unpaid',{id:o.id,orderVersion:1,amount:o.total,reason:'Synthetic missed pickup review',confirmed:true});assert.equal((await close()).status,409);const next=h.ledger();next.orders[0].contact.unresolved=false;next.orders[0].dispute={open:true};h.putLedger(next);assert.equal((await close()).status,409);assert.equal((await h.change('cash-settings',{enabled:false,ledgerVersion:0})).status,409);assert.equal((await h.change('cash-privilege',{memberId:'forged-member',allowed:false})).status,400);
});
