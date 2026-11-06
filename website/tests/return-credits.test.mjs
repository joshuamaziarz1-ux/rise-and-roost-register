import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { softwarePasskey } from './passkey-fixture.mjs';
import { POLICY_VERSION } from '../public/commerce.mjs';
import { dollarsToCents } from '../public/credit-money.mjs';
import { creditBalance } from '../server/return-credits.mjs';
const ok = r => assert.equal(r.status, 200, r.data.error);
async function fixture() {
 const now=Date.now(),origin='https://isolated.test',sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const db=sqliteD1(sql),config={customerExperienceEnabled:true,studioManagementEnabled:true,commerceEnabled:true},owner=new Map(),member=new Map(),other=new Map(),guest=new Map();
 async function call(client,path,body,options={}) {
  const response=await api(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...client].map(([k,v])=>k+'='+v).join('; '),...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),db,options.now??now,config);
  for(const c of response.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');if(c.includes('Max-Age=0'))client.delete(k);else client.set(k,v);}
  return {status:response.status,data:await response.json()};
 }
 const site=(await call(owner,'/api/workspaces',{})).data;config.publicWorkspaceId=site.id;
 const post=(client,path,data={},options)=>call(client,path,{workspaceId:site.id,...data},options);
 const me=(client=member,options)=>call(client,'/api/roost/me?workspace='+site.id,undefined,options);
 const snapshot=async()=>(await call(owner,'/api/manage/snapshot')).data;
 const change=async(action,data={},options)=>post(owner,'/api/manage/'+action,{operationId:crypto.randomUUID(),ledgerVersion:(await snapshot()).ledgerVersion,...data},options);
 async function register(client){const key=softwarePasskey(),options=(await post(client,'/api/roost/options',{kind:'register',profile:{name:'Synthetic Neighbor',preferredName:'Sam'}})).data.options;const r=await post(client,'/api/roost/verify',{response:key.register(options,origin)});ok(r);return r.data.member;}
 const customer=await register(member),stranger=await register(other);
 const ledger=()=>JSON.parse(sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(site.id).ledger_json);
 const putLedger=value=>sql.prepare('UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=?').run(JSON.stringify(value),site.id);
 const l=ledger(),url='https://paypal.me/SyntheticOnly';l.management={settings:{payments:{paypal:{enabled:true,businessConfirmed:true,url,tested:{url,at:new Date(now).toISOString(),actor:{id:'synthetic'}}}}},operations:[],audit:[],benefits:[]};putLedger(l);
 const enable=()=>change('credit-settings',{enabled:true,termsReviewed:true,confirmed:true});
 async function item(cents=200,name='Test bottle'){const r=await change('credit-item',{name,cents,status:'active',confirmed:true});ok(r);return r.data.management.returnCredits.items.find(i=>i.id===r.data.result.itemId);}
 const award=async(amount=1000)=>{const i=await item(amount);return change('credit-return',{memberId:customer.id,lines:[{id:i.id,version:i.version,qty:1}],confirmed:true});};
 async function order(overrides={},client=member){const current=(await call(guest,'/api/site')).data,p=current.document.products[0];return post(client,'/api/orders',{revision:current.revision,requestId:crypto.randomUUID(),pickupId:current.document.pickups[0].id,checkoutMode:client===guest?'guest':'member',customerDetails:{name:'Synthetic Neighbor'},policyAccepted:true,policyVersion:POLICY_VERSION,total:p.price,lines:[{productId:p.id,variantId:p.variants[0].id,qty:1,unitPrice:p.price}],...overrides});}
 const balance=()=>creditBalance(ledger(),customer.id);
 const cancel=o=>change('fulfillment',{id:o.id,orderVersion:ledger().orders.find(v=>v.id===o.id).version,status:'canceled',confirmCancellation:true,releaseInventory:true,reason:'Synthetic cancellation'});
 return {sql,db,now,origin,owner,member,other,guest,customer,stranger,site,call,post,me,change,snapshot,enable,item,award,order,ledger,putLedger,balance,cancel};
}
async function funded(){const h=await fixture();ok(await h.enable());ok(await h.award());return h;}
test('money parsing is exact; exponents, fractions, negatives, excess precision and oversized strings are rejected',()=>{
 for(const [s,n] of [['0',0],['0.29',29],['7.00',700],['1000.01',100001]])assert.equal(dollarsToCents(s),n);
 for(const s of ['-1','1e3','NaN','1.001','1,000','Infinity','1000000000',''])assert.throws(()=>dollarsToCents(s));
});
test('program starts paused with no default items; unresolved legacy money blocks activation without duplicate balance',async()=>{
 const h=await fixture(),s=await h.snapshot();assert.equal(s.management.returnCredits.enabled,false);assert.deepEqual(s.management.returnCredits.items,[]);assert.equal((await h.me()).data.credits.available,0);
 assert.equal((await h.change('credit-settings',{enabled:true,confirmed:true})).status,400);
 const l=h.ledger();l.management.benefits.push({kind:'credit',memberId:h.customer.id,amount:200});h.putLedger(l);assert.equal((await h.enable()).status,409);assert.equal(h.balance().available,0);
});
test('editing, disabling, retiring and reactivating items preserve historical return names and cent values',async()=>{
 const h=await fixture();ok(await h.enable());const i=await h.item(229);ok(await h.change('credit-return',{memberId:h.customer.id,lines:[{id:i.id,version:i.version,qty:3}],confirmed:true}));
 for(const status of ['inactive','retired','active']){const current=h.ledger().returnCredits.items[0];ok(await h.change('credit-item',{id:i.id,itemVersion:current.version,name:'Renamed jar',cents:499,status,confirmed:true}));const me=(await h.me()).data;assert.equal(me.credits.available,687);assert.equal(me.credits.items.length,status==='active'?1:0);assert.deepEqual(me.credits.transactions[0].lines,[{itemId:i.id,name:'Test bottle',cents:229,qty:3}]);}
 assert.ok((await h.snapshot()).management.audit.every(a=>a.actor.id&&a.at));
});
test('invalid values, missing confirmation and inactive or stale item returns cannot issue credit',async()=>{
 const h=await fixture();ok(await h.enable());for(const cents of [-1,1.1,100001,'200',null])assert.equal((await h.change('credit-item',{name:'x',cents,status:'active',confirmed:true})).status,400);
 assert.equal((await h.change('credit-item',{name:'x',cents:200,status:'active'})).status,400);const i=await h.item();ok(await h.change('credit-item',{...i,itemVersion:i.version,status:'inactive',confirmed:true}));assert.equal((await h.change('credit-return',{memberId:h.customer.id,lines:[{id:i.id,version:i.version,qty:1}],confirmed:true})).status,409);assert.equal(h.balance().available,0);
});
test('multiple-item returns ignore forged prices and repeated submissions award exactly once',async()=>{
 const h=await fixture();ok(await h.enable());const a=await h.item(200),b=await h.item(350,'Jar');const payload={operationId:crypto.randomUUID(),ledgerVersion:(await h.snapshot()).ledgerVersion,memberId:h.customer.id,lines:[{id:a.id,version:a.version,qty:2,cents:99999},{id:b.id,version:b.version,qty:3}],confirmed:true};ok(await h.post(h.owner,'/api/manage/credit-return',payload));ok(await h.post(h.owner,'/api/manage/credit-return',payload));assert.equal(h.balance().available,1450);assert.equal(h.ledger().returnCredits.transactions.length,1);assert.equal((await h.post(h.owner,'/api/manage/credit-return',{...payload,memberId:h.stranger.id})).status,409);
});
test('quantities, item versions, customer identity and duplicate lines are validated on the server',async()=>{
 const h=await fixture();ok(await h.enable());const i=await h.item(),send=(lines,memberId=h.customer.id)=>h.change('credit-return',{memberId,lines,confirmed:true});for(const qty of [-1,0,1.5,101,'2'])assert.equal((await send([{id:i.id,version:i.version,qty}])).status,400);assert.equal((await send([{id:i.id,version:99,qty:1}])).status,409);assert.equal((await send([{id:i.id,version:1,qty:1}],'unknown')).status,400);assert.equal((await send([{id:i.id,version:1,qty:1},{id:i.id,version:1,qty:1}])).status,400);assert.equal(h.balance().available,0);
});
test('partial credit reserves on order creation and finalizes only after independent remaining payment verification',async()=>{
 const h=await funded(),requestId=crypto.randomUUID(),o=await h.order({creditCents:700,requestId});assert.equal(o.status,201,o.data.error);assert.equal(o.data.subtotal,900);assert.equal(o.data.total,200);assert.equal(o.data.paymentStatus,'not_collected');assert.equal(o.data.returnCredit.status,'reserved');assert.deepEqual(h.balance(),{available:300,reserved:700});assert.equal((await h.order({creditCents:700,requestId})).status,200);assert.equal(h.ledger().returnCredits.transactions.length,2);
 const r=await h.change('verify-payment',{id:o.data.id,orderVersion:1,method:'paypal',independentlyVerified:true});ok(r);assert.deepEqual(h.balance(),{available:300,reserved:0});assert.equal(h.ledger().returnCredits.transactions.at(-1).kind,'used');assert.equal(r.data.orders[0].paidReceipt.total,200);
});
test('credit-only checkout needs no payment provider and does not claim an external payment arrived',async()=>{
 const h=await funded(),l=h.ledger();l.management.settings.payments={};h.putLedger(l);const o=await h.order({creditCents:900});assert.equal(o.status,201,o.data.error);assert.equal(o.data.total,0);assert.equal(o.data.paymentStatus,'not_required');assert.equal(o.data.returnCredit.status,'used');assert.equal(o.data.paymentVerifiedAt,undefined);assert.deepEqual(h.balance(),{available:100,reserved:0});assert.equal((await h.change('verify-payment',{id:o.data.id,orderVersion:1,independentlyVerified:true,method:'paypal'})).status,400);
});
test('insufficient balance, guest redemption, forged balances and invalid amounts do not reserve credit',async()=>{
 const h=await fixture();ok(await h.enable());ok(await h.award(500));for(const creditCents of [-1,1.2,'10',901,501])assert.ok((await h.order({creditCents,availableBalance:99999})).status>=400);assert.equal((await h.order({creditCents:100},h.guest)).status,401);assert.equal(h.ledger().orders.length,0);assert.deepEqual(h.balance(),{available:500,reserved:0});
});
test('concurrent checkout cannot spend the same balance twice',async()=>{
 const h=await funded(),r=await Promise.all([h.order({creditCents:700}),h.order({creditCents:700})]);assert.deepEqual(r.map(v=>v.status).sort(),[201,409]);assert.equal(h.ledger().orders.length,1);assert.deepEqual(h.balance(),{available:300,reserved:700});
});
test('concurrent duplicate checkout creates one order and one reservation',async()=>{
 const h=await funded(),requestId=crypto.randomUUID(),r=await Promise.all([h.order({creditCents:700,requestId}),h.order({creditCents:700,requestId})]);assert.deepEqual(r.map(v=>v.status).sort(),[200,201]);assert.equal(r[0].data.id,r[1].data.id);assert.equal(h.ledger().returnCredits.transactions.length,2);
});
test('failed validation or database commit leaves no order, inventory reservation or credit event',async()=>{
 const h=await funded(),before=h.ledger();for(const bad of [{pickupId:'missing'},{total:1},{policyAccepted:false},{lines:[{productId:'bread',variantId:'classic',qty:99,unitPrice:900}]}])assert.ok((await h.order({creditCents:500,...bad})).status>=400);h.sql.exec("CREATE TRIGGER synthetic_failure BEFORE UPDATE OF ledger_json ON workspaces BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END");assert.equal((await h.order({creditCents:500})).status,500);assert.deepEqual(h.ledger(),before);
});
test('cancellation restores reserved and used credit once; reopening checks the remaining balance',async()=>{
 const h=await funded(),o=(await h.order({creditCents:700})).data;ok(await h.cancel(o));ok(await h.cancel(o));assert.deepEqual(h.balance(),{available:1000,reserved:0});ok(await h.change('fulfillment',{id:o.id,orderVersion:h.ledger().orders[0].version,status:'pending',confirmCorrection:true,reason:'Reopen after review'}));ok(await h.change('verify-payment',{id:o.id,orderVersion:h.ledger().orders[0].version,method:'paypal',independentlyVerified:true}));ok(await h.cancel(o));assert.deepEqual(h.balance(),{available:1000,reserved:0});ok(await h.change('credit-adjust',{memberId:h.customer.id,delta:-900,reason:'Synthetic correction',confirmed:true}));assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:h.ledger().orders[0].version,status:'pending',confirmCorrection:true,reason:'Reopen after review'})).status,409);
});
test('referenced reversals require reasons, cannot be duplicated and cannot consume reserved credit',async()=>{
 const h=await funded(),earned=h.ledger().returnCredits.transactions[0],o=(await h.order({creditCents:700})).data,reverse=()=>h.change('credit-reverse',{memberId:h.customer.id,transactionId:earned.id,reason:'Return correction',confirmed:true});assert.equal((await reverse()).status,409);assert.equal((await h.change('credit-adjust',{memberId:h.customer.id,delta:-1,reason:'',confirmed:true})).status,400);ok(await h.cancel(o));ok(await reverse());assert.equal((await reverse()).status,409);assert.equal(h.balance().available,0);assert.equal(h.ledger().returnCredits.transactions.at(-1).reversalOf,earned.id);
});
test('concurrent balance corrections conflict safely and never overwrite the ledger',async()=>{
 const h=await funded(),version=(await h.snapshot()).ledgerVersion,payload=()=>({operationId:crypto.randomUUID(),ledgerVersion:version,memberId:h.customer.id,delta:-700,reason:'Synthetic concurrent correction',confirmed:true});const r=await Promise.all([h.post(h.owner,'/api/manage/credit-adjust',payload()),h.post(h.owner,'/api/manage/credit-adjust',payload())]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);assert.equal(h.balance().available,300);
});
test('expired reservations stay held pending owner review and cancel with a recorded reason',async()=>{
 const h=await funded(),o=(await h.order({creditCents:700})).data,p={id:o.id,orderVersion:1,reason:'Checked independent records; unpaid',confirmed:true};assert.equal((await h.change('credit-expire',p)).status,400);const later=Date.parse(o.pickupDeadline)+1000;h.sql.prepare('UPDATE sessions SET expires=?').run(later+86400000);assert.equal((await h.me(h.member,{now:later})).data.credits.reserved,700);ok(await h.change('credit-expire',p,{now:later}));assert.equal(h.ledger().orders[0].status,'canceled');assert.equal(h.ledger().orders[0].keepInventory,false);assert.deepEqual(h.balance(),{available:1000,reserved:0});
});
test('program pause prevents new awards and redemptions while preserving history and cancellation releases',async()=>{
 const h=await funded(),o=(await h.order({creditCents:700})).data;ok(await h.change('credit-settings',{enabled:false,confirmed:true}));assert.equal((await h.order({creditCents:100})).status,409);assert.equal((await h.award(200)).status,409);assert.equal((await h.me()).data.credits.items.length,0);ok(await h.cancel(o));assert.equal(h.balance().available,1000);
});
test('account isolation, owner authorization, idempotent checkout ownership and CSRF protect stored value',async()=>{
 const h=await funded();for(const c of [h.member,h.other,h.guest])assert.equal((await h.post(c,'/api/manage/credit-adjust',{operationId:crypto.randomUUID(),memberId:h.customer.id,delta:9999,confirmed:true,reason:'forged'})).status,401);assert.equal((await h.call(h.other,'/api/roost/me?workspace='+h.site.id+'&memberId='+h.customer.id)).data.credits.available,0);const requestId=crypto.randomUUID();assert.equal((await h.order({creditCents:100,requestId})).status,201);assert.equal((await h.order({requestId},h.other)).status,403);assert.equal((await h.post(h.member,'/api/roost/favorite',{productId:'bread',saved:true},{headers:{Origin:'https://evil.test'}})).status,403);
});
test('favorites persist per account; hidden favorites are removable and cannot bypass checkout',async()=>{
 const h=await fixture();ok(await h.post(h.member,'/api/roost/favorite',{productId:'bread',saved:true}));ok(await h.post(h.member,'/api/roost/favorite',{productId:'bread',saved:true}));assert.deepEqual((await h.me()).data.favorites,['bread']);assert.deepEqual((await h.me(h.other)).data.favorites,[]);const doc=JSON.parse(h.sql.prepare('SELECT published_json FROM workspaces').get().published_json);doc.products[0].active=false;h.sql.prepare('UPDATE workspaces SET published_json=?').run(JSON.stringify(doc));assert.ok((await h.order({lines:[{productId:'bread',variantId:'classic',qty:1,unitPrice:900}],total:900})).status>=400);ok(await h.post(h.member,'/api/roost/favorite',{productId:'bread',saved:false}));assert.deepEqual((await h.me()).data.favorites,[]);assert.equal((await h.post(h.guest,'/api/roost/favorite',{productId:'bread',saved:true})).status,401);
});
test('business export preserves the full monetary ledger',async()=>{
 const h=await funded(),r=await h.call(h.owner,'/api/manage/export');ok(r);assert.deepEqual(r.data.ledger.returnCredits,h.ledger().returnCredits);
});
test('pending credit cannot be archived by pickup resolution or released through disputed expiry review',async()=>{
 const h=await funded(),o=(await h.order({creditCents:700})).data;
 assert.equal((await h.change('resolve-pickup',{id:o.id,orderVersion:1,confirmed:true,resolution:'reviewed',reason:'Synthetic reviewed pickup'})).status,409);
 ok(await h.change('dispute',{id:o.id,orderVersion:1,confirmed:true,open:true,reason:'Synthetic payment review'}));
 const later=Date.parse(o.pickupDeadline)+1000;h.sql.prepare('UPDATE sessions SET expires=?').run(later+86400000);
 assert.equal((await h.change('credit-expire',{id:o.id,orderVersion:2,reason:'Checked records; unpaid',confirmed:true},{now:later})).status,400);assert.equal(h.balance().reserved,700);
});
test('refunded external payments cannot be reused when reopening a canceled credit-funded order',async()=>{
 const h=await funded(),o=(await h.order({creditCents:700})).data;
 ok(await h.change('verify-payment',{id:o.id,orderVersion:1,method:'paypal',independentlyVerified:true}));ok(await h.cancel(o));
 ok(await h.change('refund',{id:o.id,orderVersion:h.ledger().orders[0].version,amount:200,evidence:'Synthetic verified refund',reason:'Canceled test order refund',independentlyVerified:true}));
 assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:h.ledger().orders[0].version,status:'pending',confirmCorrection:true,reason:'Attempt reuse refunded payment'})).status,409);assert.deepEqual(h.balance(),{available:1000,reserved:0});
});
