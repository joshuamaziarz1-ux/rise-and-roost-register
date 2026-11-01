import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { POLICY_VERSION, POLICY, requestedPickupLabel, pickupDeadline, paymentDestination, orderAttention } from '../public/commerce.mjs';
import { pickupLabel } from '../public/model.mjs';
import { reportRange } from '../server/management.mjs';

async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const db = sqliteD1(sql), now = Date.parse('2026-11-01T17:00:00Z');
  const config = { commerceEnabled:true, studioManagementEnabled:true, customerExperienceEnabled:true, reviewBuild:true };
  let cookie='';
  async function call(path, body, { guest=false, at=now, headers={} }={}) {
    const response = await api(new Request('https://preview.test'+path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin:'https://preview.test', 'Content-Type':'application/json', Cookie:guest?'':cookie,...headers }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) }),db,at,config);
    if (!guest && response.headers.has('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    return { status:response.status, data:await response.json() };
  }
  const site=(await call('/api/workspaces',{})).data;config.publicWorkspaceId=site.id;
  const snapshot=async()=> (await call('/api/manage/snapshot')).data;
  async function change(action, body={}, options) { const s=await snapshot();return call('/api/manage/'+action,{ operationId:crypto.randomUUID(), revision:s.revision, ledgerVersion:s.ledgerVersion,...body },options); }
  async function order(overrides={}) {
    const s=await snapshot(),p=s.published.products[0];
    return call('/api/orders',{ workspaceId:site.id,storefront:'main',revision:s.publishedRevision,requestId:crypto.randomUUID(),pickupId:s.published.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Fictional Preview Customer'},policyAccepted:true,policyVersion:POLICY_VERSION,total:p.price,lines:[{productId:p.id,variantId:p.variants[0].id,qty:1,unitPrice:p.price}],...overrides },{guest:true});
  }
  function track(o, action='', body, options={}) {
    const u=new URL(o.trackingPath,'https://preview.test');return call(u.pathname.replace('/orders/','/api/order-tracking/')+action,body,{guest:true,...options,headers:{Authorization:'Bearer '+u.hash.split('=')[1],...options.headers}});
  }
  return {sql,now,config,call,site,snapshot,change,order,track};
}
const payments = { paypal:{url:'https://www.paypal.com/ncp/payment/FICTIONAL_PREVIEW',businessConfirmed:true},venmo:{url:'https://venmo.com/u/FictionalPreviewBusiness',businessConfirmed:true},cashapp:{url:'https://cash.app/$FictionalPreviewBusiness',businessConfirmed:true} };

test('policy acknowledgement is mandatory, versioned and server timed; retries never reserve twice',async()=>{
  const h=await fixture(); assert.equal(POLICY[2],'Orders not picked up within the allowed time, without prior communication or approved arrangements, will be forfeited without a refund.');
  for (const overrides of [{policyAccepted:false},{policyVersion:'old'}]) assert.equal((await h.order(overrides)).status,400);
  const requestId=crypto.randomUUID(),a=await h.order({requestId}),b=await h.order({requestId});
  assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(a.data.id,b.data.id);
  assert.deepEqual(a.data.policyAcceptance,{version:POLICY_VERSION,at:new Date(h.now).toISOString(),calendar:{days:[0,1,2,3,4,5,6],closures:[]}});
  assert.ok(a.data.pickupDeadline); assert.equal((await h.snapshot()).orders.length,1);
});
test('business deadlines respect any weekdays, multiple closures and Indiana DST rather than 24 hours',()=>{
  assert.equal(requestedPickupLabel({requestedDate:'2026-11-09'}), 'Monday, November 9, 2026 · time not specified');
  assert.match(requestedPickupLabel({requestedDate:'2026-11-09',requestedTime:'17:00'}), /at 5:00 PM$/);
  assert.equal(pickupLabel({date:'2026-11-09',start:'17:00',end:'17:00'}), 'Monday, November 9 · 5:00 PM');
  const pickup={date:'2026-10-30',start:'15:00',end:'18:00'};
  assert.equal(pickupDeadline(pickup,{days:[0,2,5],closures:['2026-11-01','2026-11-03']}),'2026-11-06T23:00:00.000Z');
  assert.equal(pickupDeadline({date:'2026-10-31',end:'18:00'},{days:[0,6],closures:[]}),'2026-11-01T23:00:00.000Z');
  assert.throws(()=>pickupDeadline(pickup,{days:[],closures:[]}));
});
test('payment destinations reject redirects, credentials, queries and unconfirmed commercial use',async()=>{
  const h=await fixture();
  for (const [provider,p] of Object.entries(payments)) assert.equal(paymentDestination(provider,p.url),p.url);
  for (const url of ['https://evil.test/$x','https://cash.app.evil.test/$x','https://cash.app/$x?amount=1','https://user@cash.app/$x','javascript:alert(1)']) assert.throws(()=>paymentDestination('cashapp',url));
  assert.equal((await h.change('settings',{calendar:{days:[1,3,6],closures:[]},payments:{paypal:{...payments.paypal,businessConfirmed:false}}})).status,400);
  assert.equal((await h.change('settings',{calendar:{days:[1,3,6],closures:[]},payments})).status,200);
  const o=(await h.order()).data;
  assert.equal(Object.keys(o.paymentDestinations).length,3);
  for (const method of Object.keys(payments)) {
    const result=await h.track(o,'/payment-method',{method});assert.equal(result.status,200);assert.equal(result.data.selectedPaymentMethod,method);assert.equal(result.data.paymentStatus,'not_collected');assert.equal(result.data.paidReceipt,undefined);
  }
  assert.equal((await h.track(o,'/report',{})).status,410);
  assert.equal((await h.snapshot()).management.today.verifiedSales,0);
});
test('manual verification needs owner confirmation, optional reference and exactly one receipt under simultaneous requests',async()=>{
  const h=await fixture(),o=(await h.order()).data;
  const payload={id:o.id,orderVersion:o.version,method:'venmo',evidence:'',independentlyVerified:true};
  assert.equal((await h.change('verify-payment',{...payload,independentlyVerified:false})).status,400);
  assert.equal((await h.change('verify-payment',payload,{guest:true})).status,401);
  const results=await Promise.all([h.change('verify-payment',payload),h.change('verify-payment',payload)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const s=await h.snapshot(); assert.equal(s.orders[0].verifications.length,1);assert.equal(s.management.today.verifiedSales,o.total);assert.equal(s.management.today.salesByPaymentMethod[0].method,'venmo');
  assert.ok(s.orders[0].verifications[0].actor.id);assert.ok((await h.track(o)).data.paymentVerifiedAt);assert.equal((await h.track(o)).data.verification,undefined);
  const verify=s.orders[0]; assert.equal((await h.change('verify-payment',{...payload,orderVersion:verify.version})).status,200);assert.equal((await h.snapshot()).management.today.verifiedSales,o.total);
});
test('messages are private, idempotent, spam limited and raise one attention item without changing pickup',async()=>{
  const h=await fixture(),o=(await h.order()).data,payload={requestId:crypto.randomUUID(),body:'I am delayed and need more time.',requestedDate:'2026-11-09',requestedTime:'17:00'};
  assert.equal((await h.track(o,'/message',payload,{headers:{Authorization:'Bearer '+'a'.repeat(48)}})).status,404);
  assert.equal((await h.track(o,'/message',{...payload,website:'spam.test'})).status,400);
  assert.equal((await h.track(o,'/message',payload,{headers:{Origin:'https://evil.test'}})).status,403);
  const results=await Promise.all([h.track(o,'/message',payload),h.track(o,'/message',payload)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  let s=await h.snapshot();assert.equal(s.orders[0].messages.length,1);assert.equal(s.management.attention.contacted,1);assert.equal(s.management.attention.extensions,1);assert.deepEqual(s.orders[0].pickup,o.pickup);assert.equal(s.orders[0].pickupDeadline,o.pickupDeadline);
  assert.equal((await h.track(o,'/message',{...payload,body:'A different message.'})).status,409);
  assert.equal((await h.track(o,'/message',{...payload,requestId:crypto.randomUUID(),body:'A second message.'})).status,200);
  s=await h.snapshot();assert.equal(s.management.attention.contacted,1);assert.equal(s.orders[0].contact.alertedAt,new Date(h.now).toISOString());
  assert.equal((await h.change('reply',{id:o.id,orderVersion:s.orders[0].version,body:'Thank you; I will review your pickup request.'})).status,200);
  const tracked=(await h.track(o)).data;assert.equal(tracked.messages.at(-1).sender,'owner');assert.equal(tracked.attention.customerContacted,true);assert.equal(JSON.stringify(tracked.messages).includes('workspace-session'),false);
  for(let i=0;i<28;i++) await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'Fictional bounded message '+i});
  assert.equal((await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'Beyond the hourly limit.'})).status,429);
});
test('only the owner approves extensions; original schedule, request and deadline history survive',async()=>{
  const h=await fixture(),o=(await h.order()).data;
  await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'Could I collect later?',requestedDate:'2026-11-09'});
  let s=await h.snapshot();const payload={id:o.id,orderVersion:s.orders[0].version,date:'2026-11-09',time:'17:00',confirmed:true};
  assert.equal((await h.change('approve-extension',payload,{guest:true})).status,401);
  assert.equal((await h.change('approve-extension',{...payload,confirmed:false})).status,400);
  assert.equal((await h.change('approve-extension',payload)).status,200);
  let tracked=(await h.track(o)).data;assert.equal(tracked.pickup.date,'2026-11-09');assert.deepEqual(tracked.originalPickup,o.pickup);assert.equal(tracked.attention.customerContacted,false);assert.equal(tracked.attention.extensionApproved,true);assert.equal(tracked.extension.actor,undefined);assert.ok(tracked.pickupDeadline);
  // A new contact reopens review instead of showing contradictory approved/pending flags.
  await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'Another delay, please review.'});tracked=(await h.track(o)).data;
  assert.equal(tracked.attention.customerContacted,true);assert.equal(tracked.attention.extensionApproved,false);assert.equal(tracked.pickup.date,'2026-11-09');
});
test('overdue contact and disputes block forfeiture; no automatic status, refund or inventory changes',async()=>{
  const h=await fixture(),o=(await h.order()).data,late=Date.parse(o.pickupDeadline)+60000;
  h.sql.prepare('UPDATE sessions SET expires=?').run(late+3600000);
  const first=(await h.track(o,'',undefined,{at:late})).data;assert.equal(first.attention.overdue,true);assert.equal(first.status,'pending');assert.equal(first.resolution,undefined);
  assert.equal((await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'I missed pickup and need help.'},{at:late})).status,200);
  let s=await h.snapshot(),payload={id:o.id,orderVersion:s.orders[0].version,reason:'Owner reviewed fictional missed pickup',confirmed:true,resolution:'forfeited'};
  assert.equal((await h.change('resolve-pickup',payload,{at:late})).status,409);
  assert.equal((await h.track(o,'',undefined,{at:late})).data.attention.overdue,false);
  assert.equal((await h.change('resolve-contact',{id:o.id,orderVersion:s.orders[0].version,reason:'Owner discussed arrangement with customer',confirmed:true},{at:late})).status,200);
  s=await h.snapshot();assert.equal((await h.change('resolve-pickup',{...payload,orderVersion:s.orders[0].version},{at:late})).status,200);
  const resolved=(await h.track(o,'',undefined,{at:late})).data;assert.equal(resolved.resolution.kind,'forfeited');assert.equal(resolved.paymentStatus,'not_collected');assert.equal(resolved.status,'pending');assert.equal(resolved.refunds,undefined);
});
test('normal fulfillment is sequential, forward only, duplicate safe, with no collected transition',async()=>{
  const h=await fixture(),o=(await h.order()).data;
  assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:1,status:'ready'})).status,400);
  assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:1,status:'preparing'})).status,200);
  let s=await h.snapshot();assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:s.orders[0].version,status:'ready'})).status,200);
  s=await h.snapshot();for(const status of ['preparing','picked-up']) assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:s.orders[0].version,status})).status,400);
  assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:s.orders[0].version,status:'preparing',confirmCorrection:true,reason:'Owner corrected an accidental ready tap'})).status,200);
  assert.equal((await h.track(o)).data.paymentStatus,'not_collected');
});
test('historical collected orders remain intact and yesterday is business local',()=>{
  const historical={status:'picked-up',pickedUpAt:'2026-10-01T17:00:00Z'};assert.equal(orderAttention(historical).history,true);assert.ok(historical.pickedUpAt);
  const range=reportRange('yesterday',Date.parse('2026-11-01T15:00:00Z'));assert.equal(range.start,'2026-10-31');assert.equal(range.end,'2026-10-31');
});
test('multiple pickup windows share daily production and optional combined order limits atomically',async()=>{
  const h=await fixture();let s=await h.snapshot(),p={...s.published.products[0],inventoryMode:'production',capacity:1,stock:0,archived:false,soldOut:false};
  assert.equal((await h.change('product',{product:p})).status,200);
  s=await h.snapshot();const first=s.published.pickups[0],second={...first,id:'same-day-later',start:'19:00',end:'20:00'};
  assert.equal((await h.change('calendar',{pickups:[first,second],paused:false})).status,200);
  const placed=await Promise.all([h.order({pickupId:first.id}),h.order({pickupId:second.id})]);assert.deepEqual(placed.map(r=>r.status).sort(),[201,409]);
  const available=(await h.call('/api/site',undefined,{guest:true})).data.document;
  for(const pickup of available.pickups)assert.equal(pickup.productionRemaining[p.id],0);
  s=await h.snapshot();p={...s.published.products[0],capacity:10};assert.equal((await h.change('product',{product:p})).status,200);
  assert.equal((await h.change('calendar',{pickups:[{...first,dailyCapacity:1},second],paused:false,confirmExistingOrders:true})).status,200);
  assert.equal((await h.order({pickupId:second.id})).status,409);
});
test('full business backup restores conversations, approvals and payment audit while rotating private tracking access',async()=>{
  const h=await fixture(),o=(await h.order()).data;
  await h.track(o,'/message',{requestId:crypto.randomUUID(),body:'Please discuss a new pickup.',requestedDate:'2026-11-12'});
  let s=await h.snapshot();assert.equal((await h.change('approve-extension',{id:o.id,orderVersion:s.orders[0].version,date:'2026-11-12',time:'16:00',confirmed:true})).status,200);
  s=await h.snapshot();assert.equal((await h.change('verify-payment',{id:o.id,orderVersion:s.orders[0].version,method:'paypal',evidence:'Fictional backup receipt',independentlyVerified:true})).status,200);
  const backup=(await h.call('/api/manage/export')).data,original=(await h.snapshot()).orders[0];
  const target=(await h.call('/api/workspaces',{})).data;
  const restored=await h.call('/api/manage/import',{operationId:crypto.randomUUID(),backup,confirmPrivateCopy:true,revision:target.revision,ledgerVersion:1});
  assert.equal(restored.status,200,restored.data.error);const saved=restored.data.orders[0];
  for(const field of ['messages','extensionHistory','originalPickup','policyAcceptance','pickupDeadline','verifications','paidReceipt'])assert.deepEqual(saved[field],original[field]);
  assert.notEqual(saved.trackingPath,original.trackingPath);assert.equal(saved.notifications.length,0);assert.equal(restored.data.id,target.id);assert.equal(restored.data.management.today.verifiedSales,o.total);
  assert.equal((await h.track(o)).status,200); // Source order and its original private link are intact.
});
test('dispute records prevent pickup resolution and remain independently auditable',async()=>{
  const h=await fixture(),o=(await h.order()).data,late=Date.parse(o.pickupDeadline)+60000;h.sql.prepare('UPDATE sessions SET expires=?').run(late+3600000);
  let s=await h.snapshot();assert.equal((await h.change('dispute',{id:o.id,orderVersion:s.orders[0].version,open:true,confirmed:true,reason:'Fictional customer payment dispute'})).status,200);
  s=await h.snapshot();assert.equal(s.management.attention.other,1);assert.equal((await h.change('resolve-pickup',{id:o.id,orderVersion:s.orders[0].version,resolution:'forfeited',confirmed:true,reason:'Fictional owner review'},{at:late})).status,409);
  assert.equal((await h.change('dispute',{id:o.id,orderVersion:s.orders[0].version,open:false,confirmed:true,reason:'Fictional dispute resolved with provider'})).status,200);
  s=await h.snapshot();assert.equal(s.management.attention.other,0);assert.equal(s.orders[0].paymentStatus,'not_collected');assert.equal(s.orders[0].audit.filter(e=>e.action.includes('dispute')).length,2);
});
test('preview commerce refuses a production or mismatched database configuration before any storage access',async()=>{
  const {default:worker}=await import('../server/worker.mjs');
  for(const env of [{STUDIO_MANAGEMENT_ENABLED:'true',REVIEW_BUILD:'false'},{COMMERCE_UPDATE_ENABLED:'true',REVIEW_BUILD:'true',PREVIEW_DATABASE_ID:'production-db'}]){
    const response=await worker.fetch(new Request('https://rise-and-roost.com/studio'),env,{});assert.equal(response.status,503);
  }
});
test('historical collected records cannot be rewritten through status corrections',async()=>{
  const h=await fixture(),o=(await h.order()).data,row=h.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(h.site.id),ledger=JSON.parse(row.ledger_json);
  ledger.orders[0].status='picked-up';ledger.orders[0].pickedUpAt='2026-10-31T16:00:00Z';h.sql.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').run(JSON.stringify(ledger),h.site.id);
  const before=structuredClone(ledger.orders[0]);
  assert.equal((await h.change('fulfillment',{id:o.id,orderVersion:1,status:'ready',confirmCorrection:true,reason:'Fictional historical correction attempt'})).status,409);
  const after=JSON.parse(h.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(h.site.id).ledger_json).orders[0];assert.deepEqual(after,before);
});
test('pickup-help requests need no alternative date and keep the confirmed schedule until owner approval',async()=>{
  const h=await fixture(),o=(await h.order()).data,request={requestId:crypto.randomUUID(),topic:'pickup',body:'I am running late and need more time.'};
  assert.equal((await h.track(o,'/message',{...request,topic:'automatic-approval'})).status,400);
  const sent=await h.track(o,'/message',request);assert.equal(sent.status,200);assert.equal(sent.data.messages[0].topic,'pickup');
  assert.deepEqual(sent.data.messageConfirmation,{requestId:request.requestId,messageId:sent.data.messages[0].id});
  assert.equal((await h.track(o)).data.messageConfirmation,undefined);
  assert.deepEqual((await h.track(o,'/message',request)).data.messageConfirmation,sent.data.messageConfirmation);
  assert.equal(sent.data.attention.customerContacted,true);assert.equal(sent.data.attention.extensionRequested,true);assert.equal(sent.data.attention.extensionApproved,false);
  assert.deepEqual(sent.data.pickup,o.pickup);assert.equal(sent.data.pickupDeadline,o.pickupDeadline);
  let s=await h.snapshot();assert.equal(s.management.attention.extensions,1);assert.equal(s.orders[0].messages.length,1);
  assert.equal((await h.track(o,'/message',request)).status,200);
  assert.equal((await h.track(o,'/message',{...request,topic:'order'})).status,409);
  s=await h.snapshot();assert.equal(s.orders[0].messages.length,1);assert.equal(s.management.attention.contacted,1);
});
test('order questions stay distinct from pickup requests and do not resurrect a resolved extension request',async()=>{
  const h=await fixture(),o=(await h.order()).data;
  const send=(topic,body)=>h.track(o,'/message',{requestId:crypto.randomUUID(),topic,body});
  assert.equal((await send('order','Can I ask about the ingredients?')).status,200);
  let s=await h.snapshot();assert.equal(s.management.attention.contacted,1);assert.equal(s.management.attention.extensions,0);
  assert.equal((await send('pickup','I need extra pickup time.')).status,200);
  assert.equal((await send('order','And a question about ingredients.')).status,200);
  s=await h.snapshot();assert.equal(s.management.attention.extensions,1);
  assert.equal((await h.change('resolve-contact',{id:o.id,orderVersion:s.orders[0].version,confirmed:true,reason:'Owner reviewed the pickup question without changing the confirmed schedule'})).status,200);
  assert.equal((await send('order','One final ingredient question.')).status,200);
  s=await h.snapshot();assert.equal(s.management.attention.contacted,1);assert.equal(s.management.attention.extensions,0);assert.deepEqual(s.orders[0].pickup,o.pickup);assert.equal(s.orders[0].pickupDeadline,o.pickupDeadline);
});
