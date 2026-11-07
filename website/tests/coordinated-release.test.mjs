import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './member-checkout-fixture.mjs';
import { requestPickup } from '../server/pickup-changes.mjs';
import { manageMarketing, marketingSnapshot, campaignPreview, marketingPublic } from '../server/marketing.mjs';
const payload=()=>({requestId:crypto.randomUUID(),date:'2027-05-05',time:'14:00',message:'Could I collect later?'});
const ok=r=>assert.equal(r.status,200,r.data.error);
test('guest pickup request, duplicate prevention, decline and tracking retain original schedule with email off',async()=>{
 const h=await fixture();h.config.contactLoginEnv={PICKUP_REQUESTS_ENABLED:'true'};
 try{
 const created=await h.order({},h.guest);assert.equal(created.status,201,created.data.error);const o=created.data, u=new URL(o.trackingPath,h.origin),path=u.pathname.replace('/orders/','/api/order-tracking/'),headers={Authorization:'Bearer '+new URLSearchParams(u.hash.slice(1)).get('access')},v=payload(),before=h.ledger().orders[0].pickup;
 const send=()=>h.call(h.guest,path+'/pickup-request',v,{headers});ok(await send());ok(await send());assert.equal(h.ledger().orders[0].messages.length,1);assert.deepEqual(h.ledger().orders[0].pickup,before);
 assert.equal((await h.call(h.guest,path+'/pickup-request',payload(),{headers})).status,409);
 assert.equal((await h.call(h.guest,path+'/pickup-request',v)).status,401);
 const order=h.ledger().orders[0];ok(await h.change('decline-pickup-request',{id:o.id,orderVersion:order.version,requestId:v.requestId,confirmed:true}));
 const track=await h.call(h.guest,path,undefined,{headers});ok(track);assert.equal(track.data.messages[0].pickupRequestStatus,'declined');assert.deepEqual(track.data.pickup,before);assert.equal(track.data.notifications.some(n=>n.acceptedAt),false);
 }finally{h.sql.close();}
});
test('member pickup request validates ownership; approval uses existing extension and one-business-day deadline',async()=>{
 const h=await fixture();h.config.contactLoginEnv={PICKUP_REQUESTS_ENABLED:'true'};
 try{const c=await h.order();assert.equal(c.status,201,c.data.error);const o=c.data,v=payload();assert.equal((await h.post(h.other,'/api/roost/pickup-request',{orderId:o.id,...v})).status,404);ok(await h.post(h.member,'/api/roost/pickup-request',{orderId:o.id,...v}));const order=h.ledger().orders[0];ok(await h.change('approve-extension',{id:o.id,orderVersion:order.version,date:v.date,time:v.time,requestId:v.requestId,confirmed:true}));const after=h.ledger().orders[0];assert.equal(after.pickup.date,v.date);assert.equal(after.messages[0].pickupRequestStatus,'approved');assert.ok(after.extensionHistory.length);assert.ok(after.pickupDeadline);h.config.contactLoginEnv.PICKUP_REQUESTS_ENABLED='false';assert.equal((await h.post(h.member,'/api/roost/pickup-request',{orderId:o.id,...payload()})).status,409);}finally{h.sql.close();}
});
test('pickup validation never mutates schedule for invalid dates, messages or resolved orders',()=>{
 for(const extra of [{date:'nonsense'},{time:'30:99'},{message:'x'.repeat(2001)}]){const o={status:'ready',pickup:{date:'2027-05-01'}};assert.throws(()=>requestPickup(o,{...payload(),...extra},Date.now(),{}));assert.equal(o.pickup.date,'2027-05-01');}
 assert.throws(()=>requestPickup({status:'picked-up'},payload(),Date.now(),{}));
});
test('marketing drafts escape content, restrict photography, redact tokens, suppress immediately and block all sends',()=>{
 const ledger={},published={products:[{images:[{src:'/assets/real.webp'}]}]},common={ledger,published,now:Date.now(),actor:{role:'owner'},id:()=>crypto.randomUUID()};
 const input={template:'products',subject:'Fresh bread',message:'<script>bad</script>',photo:'/assets/real.webp'};
 manageMarketing({...common,input,path:'/api/manage/marketing-draft'});assert.equal(ledger.marketing.campaigns.length,1);
 assert.throws(()=>manageMarketing({...common,input:{...input,photo:'https://stock.test/photo'},path:'/api/manage/marketing-draft'}));
 assert.match(campaignPreview(ledger.marketing.campaigns[0],'').html,/&lt;script&gt;/);
 ledger.marketing.contacts.push({id:'c',email:'test@example.test',status:'confirmed',tokenHash:'private',unsubscribeHash:'private'});
 assert.equal(marketingSnapshot(ledger,{}).contacts[0].tokenHash,undefined);
 manageMarketing({...common,input:{contactId:'c'},path:'/api/manage/marketing-suppress'});assert.equal(ledger.marketing.contacts[0].status,'unsubscribed');
 for(const path of ['/api/manage/marketing-send','/api/manage/marketing-test'])assert.throws(()=>manageMarketing({...common,input:{confirmed:true},path}),/not activated/);
});

test('marketing consent, double opt-in, deduplication, unsubscribe and suppression are enforced server-side',async()=>{
 const h=await fixture(),env={MARKETING_SIGNUP_ENABLED:'true',MARKETING_CONFIRMATION_EMAIL_ENABLED:'true',ROOST_AUTH_FREE_PLAN_CONFIRMED:'true',RESEND_API_KEY:'mock'},sent=[];
 const hash=async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');
 const call=(path,input)=>marketingPublic({db:h.db,env,input,path:'/api/marketing/'+path,workspace:h.site.id,now:h.now,hash,token:()=>crypto.randomUUID().replaceAll('-','')+'a'.repeat(16),rateLimit:async()=>{},json:x=>x,fetcher:async(url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({id:'mock'});}});
 try {
 await assert.rejects(call('signup',{email:'new@example.test',consent:false}),/choose/);
 await call('signup',{email:'new@example.test',consent:true});assert.equal(sent.length,1);
 assert.equal(h.ledger().marketing.contacts[0].status,'pending');
 await call('signup',{email:'NEW@example.test',consent:true});assert.equal(sent.length,1);assert.equal(h.ledger().marketing.contacts.length,1);
 const secret=sent[0].text.match(/#confirm=([a-f0-9]{48})/)[1];
 await call('confirm',{token:secret});assert.equal(h.ledger().marketing.contacts[0].status,'confirmed');
 await assert.rejects(call('confirm',{token:secret}),/already used/);
 env.MARKETING_SIGNUP_ENABLED='false';await call('unsubscribe',{token:h.ledger().marketing.contacts[0].id});assert.equal(h.ledger().marketing.contacts[0].status,'unsubscribed');
 env.MARKETING_SIGNUP_ENABLED='true';await call('signup',{email:'new@example.test',consent:true});assert.equal(sent.length,1);assert.equal(h.ledger().marketing.contacts[0].status,'unsubscribed');
 }finally{h.sql.close();}
});
test('marketing Studio authorization, draft CAS and duplicate operations preserve campaign history',async()=>{
 const h=await fixture();try{
 const body={operationId:crypto.randomUUID(),ledgerVersion:(await h.snapshot()).ledgerVersion,template:'updates',subject:'Store news',message:'See our website.',photo:''};
 assert.equal((await h.call(h.guest,'/api/manage/marketing-draft',body)).status,401);
 ok(await h.call(h.owner,'/api/manage/marketing-draft',body));ok(await h.call(h.owner,'/api/manage/marketing-draft',body));assert.equal(h.ledger().marketing.campaigns.length,1);
 const blocked=await h.change('marketing-send',{campaignId:h.ledger().marketing.campaigns[0].id,confirmed:true});assert.equal(blocked.status,409);assert.equal(h.ledger().marketing.campaigns[0].status,'draft');
 const spoof=await h.call(h.owner,'/api/manage/marketing-draft',{...body,operationId:crypto.randomUUID()},{headers:{Origin:'https://unrelated.test'}});assert.equal(spoof.status,403);
 }finally{h.sql.close();}
});
test('pickup requests reject wrong capabilities and cross-site writes and apply submission limits',async()=>{
 const h=await fixture();h.config.contactLoginEnv={PICKUP_REQUESTS_ENABLED:'true'};
 try{
 const created=await h.order({},h.guest);assert.equal(created.status,201);const u=new URL(created.data.trackingPath,h.origin),path=u.pathname.replace('/orders/','/api/order-tracking/')+'/pickup-request',headers={Authorization:'Bearer '+new URLSearchParams(u.hash.slice(1)).get('access')},v=payload();
 assert.equal((await h.call(h.guest,path,v,{headers:{...headers,Authorization:'Bearer '+'0'.repeat(48)}})).status,404);
 assert.equal((await h.call(h.guest,path,v,{headers:{...headers,Origin:'https://unrelated.test'}})).status,403);
 for(let i=0;i<6;i++)ok(await h.call(h.guest,path,v,{headers}));assert.equal((await h.call(h.guest,path,v,{headers})).status,429);assert.equal(h.ledger().orders[0].messages.length,1);
 }finally{h.sql.close();}
});
