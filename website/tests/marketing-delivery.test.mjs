import test from 'node:test';
import assert from 'node:assert/strict';
import { mockProvider } from './marketing-provider-fixture.mjs';
import { fixture } from './member-checkout-fixture.mjs';
import { marketingState, marketingSnapshot, marketingPublic } from '../server/marketing.mjs';
import { resendMarketing } from '../server/resend-marketing.mjs';
import { queueMarketing, drainMarketing, syncMarketing } from '../server/marketing-delivery.mjs';
const owner='owner@example.test', actor={role:'owner',email:owner};
const environment=()=>({RESEND_MARKETING_API_KEY:'synthetic-marketing',RESEND_API_KEY:'synthetic-transactional',DEPLOYMENT_ENVIRONMENT:'production',PRODUCTION_OWNERS:JSON.stringify([{email:owner,role:'owner'}]),MARKETING_PROVIDER_VERIFIED:'true',MARKETING_FREE_PLAN_CONFIRMED:'true',MARKETING_OWNER_TEST_ENABLED:'true'});
function local(now=Date.now()) {return {marketing:{contacts:[{id:'consent',email:owner,status:'confirmed',confirmedAt:new Date(now).toISOString(),consentAt:new Date(now).toISOString()}],campaigns:[{id:'campaign',status:'draft',template:'updates',subject:'Synthetic store update',message:'Fictional release test',photo:''}],address:'Synthetic test address only',history:[]}};}
const queue=(ledger,env,path,input={})=>queueMarketing({ledger,env,path:'/api/manage/marketing-'+path,input,actor,now:Date.now(),id:()=>crypto.randomUUID()});
test('provider rejects transactional endpoints, missing credentials, unknown usage and permission failures without exposing provider bodies',async()=>{
 assert.throws(()=>resendMarketing({}),/credential_missing/);
 const p=resendMarketing(environment(),async()=>Response.json({message:'private token'}, {status:403}),0);
 await assert.rejects(p.request('/emails','POST',{}),/unsupported/);
 await assert.rejects(p.verify(),e=>e.message==='provider_http_403');
 const unknown=resendMarketing(environment(),async()=>Response.json({contacts:{used:0,limit:null}}),0);
 await assert.rejects(unknown.capacity(),/capacity_unverified/);
 const paid=resendMarketing(environment(),async()=>Response.json({contacts:{used:0,limit:10000}}),0);
 await assert.rejects(paid.capacity(),/capacity_unverified/);
});
test('provider follows every page, preserves filters, and refuses incomplete lists or exhausted segment capacity',async()=>{
 const paths=[],p=resendMarketing(environment(),async url=>{paths.push(url);return Response.json(paths.length===1?{data:[{id:'a'}],has_more:true}:{data:[{id:'b'}],has_more:false})},0);
 assert.equal((await p.list('/broadcasts/id/recipients?type=delivered')).length,2);assert.match(paths[1],/type=delivered&limit=100&after=a/);
 const exhausted=resendMarketing(environment(),async()=>Response.json({contacts:{used:1000,limit:1000},segments:{used:3,limit:3}}),0);
 await assert.rejects(exhausted.capacity(1),/contact_capacity/);await assert.rejects(exhausted.capacity(0,true),/segment_capacity/);
});
test('independent campaign gates, accurate address, explicit opt-in and configured owner scope are enforced',()=>{
 const l=local(),env=environment();
 assert.throws(()=>queue(l,env,'review',{campaignId:'campaign',kind:'campaign'}),/not activated/);
 assert.throws(()=>queue(l,env,'review',{campaignId:'campaign',kind:'test',recipient:'outsider@example.test'}),/confirmed/);
 l.marketing.address='';assert.throws(()=>queue(l,env,'review',{campaignId:'campaign',kind:'test',recipient:owner}),/address/);
 l.marketing.address='Synthetic';delete l.marketing.contacts[0].consentAt;assert.throws(()=>queue(l,env,'review',{campaignId:'campaign',kind:'test',recipient:owner}),/confirmed/);
});
async function scenario(kind='test') {
 const h=await fixture(),env={...environment(),PUBLIC_WORKSPACE_ID:h.site.id},l=h.ledger();l.marketing=local(h.now).marketing;h.putLedger(l);const p=mockProvider();
 if(kind==='campaign')Object.assign(env,{MARKETING_CAMPAIGNS_ENABLED:'true',MARKETING_DELIVERY_VERIFIED:'true',MARKETING_DANIELLE_APPROVED:'true'});
 const commit=(action,input)=>{const l=h.ledger(),r=queue(l,env,action,input);h.putLedger(l);return r;};
 const run=()=>drainMarketing(h.db,env,Date.now(),p.fetcher,0);
 const job=()=>h.ledger().marketing.deliveries[0];
 commit('review',{campaignId:'campaign',kind,recipient:owner});await run();await run();
 return {h,env,p,commit,run,job};
}
test('owner review creates a single dedicated segment and draft Broadcast; final confirmation sends exactly once and retains real provider results',async()=>{
 const s=await scenario();try {
  assert.equal(s.job().status,'reviewed');assert.equal(s.p.sends,0);assert.equal(s.p.contacts.length,1);
  assert.match([...s.p.broadcasts.values()][0].html,/RESEND_UNSUBSCRIBE_URL/);
  assert.throws(()=>s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken}),/explicitly/);
  s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});await s.run();await s.run();
  assert.equal(s.p.sends,1);assert.equal(s.job().status,'accepted');
  assert.throws(()=>s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true}),/explicitly/);
  s.commit('results',{deliveryId:s.job().id});await s.run();assert.equal(s.job().status,'sent');assert.equal(s.job().providerResults.delivered.length,1);
  assert.equal(s.h.ledger().marketing.campaigns[0].status,'draft');
 }finally{s.h.sql.close()}
});
test('provider unsubscribe wins over local confirmation and is never reactivated',async()=>{
 const s=await scenario();try {
  s.p.contacts[0].unsubscribed=true;
  await syncMarketing(s.h.db,s.env,resendMarketing(s.env,s.p.fetcher,0),Date.now());
  assert.equal(s.h.ledger().marketing.contacts[0].status,'unsubscribed');
  assert.equal(s.p.calls.some(c=>c.method==='PATCH'&&c.body.unsubscribed===false),false);
  assert.throws(()=>s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true}),/subscriber changed/);
 }finally{s.h.sql.close()}
});
test('draft changes invalidate final confirmation; audience contamination blocks sending',async()=>{
 const s=await scenario();try {
  const l=s.h.ledger();l.marketing.campaigns[0].subject='Changed';s.h.putLedger(l);
  assert.throws(()=>s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true}),/draft or address changed/);
  l.marketing.campaigns[0].subject='Synthetic store update';s.h.putLedger(l);
  s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});s.p.setExtras();await s.run();
  assert.equal(s.p.sends,0);assert.equal(s.job().error,'provider_audience_mismatch');
 }finally{s.h.sql.close()}
});
test('uncertain sends are durable, never retried, and reconcile by existing Broadcast ID',async()=>{
 const s=await scenario();try {
  s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});s.p.setUnknown();await s.run();
  assert.equal(s.job().status,'unknown');assert.doesNotMatch(JSON.stringify(s.job()),/sensitive provider/);
  await s.run();assert.equal(s.p.sends,1);
  assert.throws(()=>s.commit('review',{campaignId:'campaign',kind:'test',recipient:owner}),/active delivery/);
  s.commit('results',{deliveryId:s.job().id});await s.run();assert.equal(s.job().status,'sent');assert.equal(s.p.sends,1);
 }finally{s.h.sql.close()}
});
test('local suppression is pushed to provider; ordinary customers never enter marketing from membership',async()=>{
 const s=await scenario();try {
  const l=s.h.ledger();l.marketing.contacts[0].status='unsubscribed';delete l.marketing.contacts[0].syncedAt;l.marketing.syncRequested=true;s.h.putLedger(l);
  await syncMarketing(s.h.db,s.env,resendMarketing(s.env,s.p.fetcher,0),Date.now());
  assert.equal(s.p.contacts[0].unsubscribed,true);assert.equal(s.p.contacts.length,1);
  assert.equal(marketingSnapshot(s.h.ledger(),{}).sendingEnabled,false);
 }finally{s.h.sql.close()}
});
test('owner authentication test permits only configured owners while public email login stays off',async()=>{
 const h=await fixture();try {
  h.config.contactLoginEnv={ROOST_PASSWORD_LOGIN_ENABLED:'true',ROOST_PASSWORD_PEPPER:'synthetic'.repeat(8),ROOST_AUTH_OWNER_TEST:'true',DEPLOYMENT_ENVIRONMENT:'production',PRODUCTION_OWNERS:JSON.stringify([{email:owner,role:'owner'}])};
  const messages=[];h.config.authSend=async(...args)=>{messages.push(args);return true};
  assert.equal((await h.me(h.guest)).data.emailLoginEnabled,false);
  assert.equal((await h.post(h.guest,'/api/roost/email/register',{name:'Synthetic',email:'outsider@example.test',password:'a fictional garden phrase'})).status,503);
  assert.equal(messages.length,0);
  assert.equal((await h.post(h.guest,'/api/roost/email/register',{name:'Synthetic',email:owner,password:'a fictional garden phrase'})).status,200);
  assert.equal(messages.length,1);
  assert.equal((await h.me(h.guest)).data.emailLoginEnabled,false);
 }finally{h.sql.close()}
});
test('confirmation failures are reported accurately, expired consent is visible, and owner signup does not open public signup',async()=>{
 const h=await fixture();try {
  const env={...environment(),RESEND_API_KEY:'synthetic-transactional',MARKETING_SIGNUP_OWNER_TEST:'true',MARKETING_CONFIRMATION_EMAIL_ENABLED:'true',ROOST_AUTH_FREE_PLAN_CONFIRMED:'true'};
  delete env.RESEND_MARKETING_API_KEY;
  const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
  const call=(email,consent)=>marketingPublic({db:h.db,env,path:'/api/marketing/signup',input:{email,consent},workspace:h.site.id,now:h.now,hash,token:()=>crypto.randomUUID().replaceAll('-','')+'a'.repeat(16),rateLimit:async()=>{},json:v=>v,fetcher:async()=>Response.json({message:'private provider error'},{status:403})});
  await assert.rejects(call('outsider@example.test',true),/not available/);await assert.rejects(call(owner,false),/choose/);
  await call(owner,true);const c=h.ledger().marketing.contacts[0];assert.equal(c.confirmationStatus,'failed');assert.equal(c.status,'pending');assert.equal(c.syncError,undefined);
  c.expires=1;const ledger=h.ledger();ledger.marketing.contacts[0]=c;
  assert.equal(marketingSnapshot(ledger,env).contacts[0].status,'expired');assert.doesNotMatch(JSON.stringify(ledger),/private provider error/);
 }finally{h.sql.close()}
});
test('Studio queues are authenticated, version-checked and idempotent without performing provider requests',async()=>{
 const {productionFixture,installProductionTestKeys}=await import('./production-fixture.mjs');
 const oldFetch=globalThis.fetch;installProductionTestKeys();const h=await productionFixture();
 try {
  const productionOwners=h.env.PRODUCTION_OWNERS;Object.assign(h.env,environment());h.env.PRODUCTION_OWNERS=productionOwners;
  const l=JSON.parse(h.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(h.env.PUBLIC_WORKSPACE_ID).ledger_json);l.marketing=local(h.now).marketing;l.marketing.contacts[0].email=JSON.parse(h.env.PRODUCTION_OWNERS)[0].email;
  h.sql.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').run(JSON.stringify(l),h.env.PUBLIC_WORKSPACE_ID);
  const body={operationId:crypto.randomUUID(),ledgerVersion:(await h.snapshot()).ledgerVersion,campaignId:'campaign',kind:'test',recipient:JSON.parse(h.env.PRODUCTION_OWNERS)[0].email};
  assert.equal((await h.call('/studio/api/manage/marketing-review',body)).status,401);
  const result=await h.call('/studio/api/manage/marketing-review',body,{token:h.ownerA});assert.equal(result.status,200,result.data.error);
  assert.equal((await h.call('/studio/api/manage/marketing-review',body,{token:h.ownerA})).status,200);
  assert.equal((await h.snapshot()).management.marketing.deliveries.length,1);
  assert.equal((await h.call('/studio/api/manage/marketing-review',{...body,operationId:crypto.randomUUID()},{token:h.ownerA})).status,409);
  assert.equal((await h.snapshot()).management.marketing.deliveries[0].status,'queued-review');
 }finally{h.sql.close();globalThis.fetch=oldFetch}
});
test('provider results can retry a failed read without changing delivery status or sending again',async()=>{
 const s=await scenario();try {
  s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});await s.run();
  s.commit('results',{deliveryId:s.job().id});
  await drainMarketing(s.h.db,s.env,Date.now(),async()=>Response.json({},{status:403}),0);
  assert.equal(s.job().status,'accepted');assert.equal(s.job().resultsError,'provider_http_403');
  s.commit('results',{deliveryId:s.job().id});await s.run();assert.equal(s.job().status,'sent');assert.equal(s.p.sends,1);
 }finally{s.h.sql.close()}
});
test('a Broadcast sent outside the application is reconciled without a second send',async()=>{
 const s=await scenario();try {
  s.commit('test',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});
  s.p.broadcasts.get(s.job().broadcastId).status='sent';await s.run();
  assert.equal(s.job().status,'sent');assert.equal(s.p.sends,0);assert.equal(s.job().error,'provider_broadcast_already_submitted');
 }finally{s.h.sql.close()}
});
test('contact synchronization and segment preparation checkpoint bounded batches before review, with no send',async()=>{
 const h=await fixture(),env={...environment(),PUBLIC_WORKSPACE_ID:h.site.id},p=mockProvider();
 try {
  const l=h.ledger();l.marketing=local(h.now).marketing;
  l.marketing.contacts=Array.from({length:7},(_,n)=>({...local(h.now).marketing.contacts[0],id:'c'+n,email:'consent'+n+'@example.test'}));h.putLedger(l);
  const provider=resendMarketing(env,p.fetcher,0);
  assert.equal(await syncMarketing(h.db,env,provider,Date.now()),false);assert.equal(p.contacts.length,2);
  assert.equal(await syncMarketing(h.db,env,provider,Date.now()),false);assert.equal(p.contacts.length,4);
  assert.equal(await syncMarketing(h.db,env,provider,Date.now()),false);assert.equal(p.contacts.length,6);
  assert.equal(await syncMarketing(h.db,env,provider,Date.now()),true);assert.equal(p.contacts.length,7);
  assert.equal(p.sends,0);assert.equal(h.ledger().marketing.syncRequested,false);
 }finally{h.sql.close()}
});

test('a fully approved synthetic campaign sends once, locks its draft and cannot be submitted again',async()=>{
 const s=await scenario('campaign');try {
  assert.equal(s.job().status,'reviewed');assert.equal(s.p.sends,0);
  delete s.env.MARKETING_DANIELLE_APPROVED;
  assert.throws(()=>s.commit('send',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true}),/not activated/);
  s.env.MARKETING_DANIELLE_APPROVED='true';s.commit('send',{deliveryId:s.job().id,reviewToken:s.job().reviewToken,confirmed:true});
  await s.run();await s.run();assert.equal(s.p.sends,1);assert.equal(s.h.ledger().marketing.campaigns[0].status,'submitted');
  assert.throws(()=>s.commit('review',{campaignId:'campaign',kind:'campaign'}),/saved campaign draft/);
 }finally{s.h.sql.close()}
});
