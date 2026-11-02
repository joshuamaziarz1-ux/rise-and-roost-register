import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomInt,createHash } from 'node:crypto';
import worker from '../server/worker.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { seed } from '../public/model.mjs';
import { PREVIEW_HOST,PREVIEW_DATABASE,PREVIEW_WORKSPACE } from '../server/preview-access.mjs';
import { pinToken,pinDigest } from '../server/studio-pin.mjs';
const origin='https://'+PREVIEW_HOST,DAY=86400000;
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of ['schema.sql','pin-schema.sql'])sql.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const now=Date.now(),doc=seed(now),legacyKey=pinToken(),ownerHash=createHash('sha256').update(PREVIEW_WORKSPACE+legacyKey).digest('hex');
 for(const id of [PREVIEW_WORKSPACE,'b'.repeat(48)])sql.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').run(id,ownerHash,JSON.stringify(doc),JSON.stringify(doc),'[]',new Date(now).toISOString());
 const setupToken=pinToken(),pin=String(randomInt(10000)).padStart(4,'0');sql.prepare("INSERT INTO studio_pin_settings(id,bootstrap_hash,bootstrap_expires) VALUES('main',?,?)").run(await pinDigest(setupToken),now+3600000);
 const env={DB:sqliteD1(sql),ASSETS:{fetch:async()=>new Response('existing customer assets')},PREVIEW_ACCESS_MODE:'pin',PREVIEW_DATABASE_ID:PREVIEW_DATABASE,PUBLIC_WORKSPACE_ID:PREVIEW_WORKSPACE,REVIEW_BUILD:'true',CUSTOMER_EXPERIENCE_ENABLED:'true',STUDIO_MANAGEMENT_ENABLED:'true',ORDER_EMAIL_ENABLED:'false',STUDIO_PIN_PEPPER:pinToken(),PREVIEW_ACCESS_UNTIL:new Date(now+30*DAY).toISOString()};
 async function call(path,body,options={}){
  const r=await worker.fetch(new Request((options.origin||origin)+path,{method:options.method||(body===undefined?'GET':'POST'),headers:{Origin:options.csrfOrigin||origin,'Content-Type':'application/json',...(options.cookie?{Cookie:options.cookie}:{}),...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(){}});
  return {status:r.status,headers:r.headers,data:r.headers.get('Content-Type')?.includes('application/json')?await r.json():await r.text()};
 }
 // The middleware accepts an injected clock in direct tests; Worker lifecycle
 // tests use real time. This never becomes a deployed debug environment flag.
 const {studioPinAccess}=await import('../server/studio-pin.mjs');
 async function auth(path,body,at,options={}){return studioPinAccess(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,at);}
 const setup=()=>call('/api/studio-pin/setup',{setupToken,pin,confirmPin:pin});
 return {sql,env,call,auth,setup,pin,setupToken,now,legacyKey,ownerHash};
}
const cookie=r=>r.headers.get('Set-Cookie').split(';')[0];
test('PIN mode exposes only enumerated customer APIs and the PIN screen metadata; every admin API denies anonymous and forged credentials',async()=>{
 const h=await fixture();
 for(const path of ['/api/studio','/api/manage/snapshot','/api/studio-comments','/api/preview/anything','/api/future-admin','/api/roost/admin'])assert.equal((await h.call(path)).status,401,path);
 for(const path of ['/api/workspaces','/api/login','/api/device-start','/api/publish','/api/upload','/api/manage/product','/api/order-payment'])assert.equal((await h.call(path,{}, {headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test','Cf-Access-Jwt-Assertion':'forged','X-RR-Workspace':PREVIEW_WORKSPACE,Cookie:'rr_studio='+pinToken()+'; __Host-rr_studio_pin='+pinToken()}})).status,401,path);
 assert.equal((await h.call('/')).status,200);assert.equal((await h.call('/api/site')).status,200);assert.equal((await h.call('/api/studio-info')).data.previewPinAccess,true);
 assert.equal((await h.call('/api/studio-pin/status')).data.configured,false);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM workspaces').get().n,2);
});
test('private setup is single-use, stores a peppered salted verifier and hashed server session, and preserves every workspace',async()=>{
 const h=await fixture(),before=h.sql.prepare('SELECT * FROM workspaces').all();
 assert.equal((await h.call('/api/studio-pin/setup',{setupToken:pinToken(),pin:h.pin,confirmPin:h.pin})).status,403);
 const r=await h.setup();assert.equal(r.status,200);assert.equal(r.data.unlocked,true);
 const row=h.sql.prepare("SELECT * FROM studio_pin_settings WHERE id='main'").get();assert.match(row.pin_hash,/^[a-f0-9]{64}$/);assert.match(row.salt,/^[a-f0-9]{64}$/);assert.notEqual(row.pin_hash,h.pin);assert.equal(row.bootstrap_hash,null);assert.equal(row.version,1);
 const c=r.headers.get('Set-Cookie');for(const value of ['__Host-rr_studio_pin=','HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(c.includes(value));
 const session=h.sql.prepare('SELECT * FROM studio_pin_sessions').get();assert.equal(session.hash,await pinDigest(cookie(r).split('=')[1]));assert.ok(session.expires<=h.now+30*DAY);assert.notEqual(session.hash,cookie(r).split('=')[1]);
 assert.equal((await h.setup()).status,403);assert.deepEqual(h.sql.prepare('SELECT * FROM workspaces').all(),before);
});
test('simultaneous setup requests consume the capability once and mint exactly one session',async()=>{
 const h=await fixture(),responses=await Promise.all([h.setup(),h.setup()]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(h.sql.prepare('SELECT count(*) n FROM studio_pin_sessions').get().n,1);
});
test('remembered sessions move between networks, expire server-side, and Lock Studio revokes only the current device',async()=>{
 const h=await fixture(),a=cookie(await h.setup()),b=cookie(await h.call('/api/studio-pin/unlock',{pin:h.pin}));assert.notEqual(a,b);
 assert.equal((await h.call('/api/studio',undefined,{cookie:a,headers:{'CF-Connecting-IP':'2001:db8::12'}})).status,200);
 assert.equal((await h.call('/api/studio-pin/lock',{}, {cookie:a,csrfOrigin:'https://outsider.example'})).status,403);
 assert.equal((await h.call('/api/studio-pin/lock',{}, {cookie:a})).status,200);assert.equal((await h.call('/api/studio',undefined,{cookie:a})).status,401);assert.equal((await h.call('/api/studio',undefined,{cookie:b})).status,200);
 h.sql.prepare('UPDATE studio_pin_sessions SET expires=?').run(h.now-1);assert.equal((await h.call('/api/manage/snapshot',undefined,{cookie:b})).status,401);
});
test('five concurrent incorrect guesses trigger a global lockout that rotating networks cannot bypass; correct PIN works after expiry',async()=>{
 const h=await fixture();await h.setup();const wrong=h.pin==='0000'?'0001':'0000';
 const results=await Promise.all(Array.from({length:12},(_,i)=>h.call('/api/studio-pin/unlock',{pin:wrong},{headers:{'CF-Connecting-IP':'203.0.113.'+i}})));
 assert.ok(results.every(r=>[401,429].includes(r.status)));const state=h.sql.prepare("SELECT * FROM studio_pin_settings WHERE id='main'").get();assert.equal(state.failures,5);assert.ok(state.locked_until>h.now);
 const blocked=await h.call('/api/studio-pin/unlock',{pin:h.pin},{headers:{'CF-Connecting-IP':'2001:db8::999'}});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('Retry-After'))>0);
 const recovered=await h.auth('/api/studio-pin/unlock',{pin:h.pin},state.locked_until+1);assert.equal(recovered.response.status,200);assert.equal(h.sql.prepare("SELECT failures FROM studio_pin_settings WHERE id='main'").get().failures,0);
});
test('repeated failures escalate through fifteen-minute, one-hour and twenty-four-hour temporary lockouts',async()=>{
 const h=await fixture();await h.setup();let at=h.now;const wrong=h.pin==='0000'?'0001':'0000';
 for(let i=1;i<=15;i++){
  await h.auth('/api/studio-pin/unlock',{pin:wrong},at,{headers:{'CF-Connecting-IP':'203.0.113.'+i}});
  const state=h.sql.prepare("SELECT failures,locked_until FROM studio_pin_settings WHERE id='main'").get();assert.equal(state.failures,i);
  if([5,10,15].includes(i))assert.equal(state.locked_until-at,i===5?900000:i===10?3600000:DAY);
  at=Math.max(at+1,state.locked_until+1);
 }
});
test('same-origin JSON, PIN length, request bounds, expired bootstrap and per-network throttles are enforced',async()=>{
 const h=await fixture();assert.equal((await h.call('/api/studio-pin/setup',{pin:h.pin,confirmPin:h.pin,setupToken:h.setupToken},{csrfOrigin:'https://outsider.example'})).status,403);
 assert.equal((await h.call('/api/studio-pin/unlock',{pin:'123456'})).status,400);assert.equal((await h.call('/api/studio-pin/unlock',{pin:'x'.repeat(2000)})).status,413);
 const expired=await h.auth('/api/studio-pin/setup',{pin:h.pin,confirmPin:h.pin,setupToken:h.setupToken},h.now+3600001);assert.equal(expired.response.status,403);
 for(let i=0;i<20;i++)await h.call('/api/studio-pin/unlock',{pin:'bad'},{headers:{'CF-Connecting-IP':'203.0.113.100'}});
 assert.equal((await h.call('/api/studio-pin/unlock',{pin:h.pin},{headers:{'CF-Connecting-IP':'203.0.113.100'}})).status,429);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM studio_pin_sessions').get().n,0);
});
test('operator-issued PIN rotation revokes all old sessions and keeps original owner hashes intact',async()=>{
 const h=await fixture(),old=cookie(await h.setup());const next=pinToken();h.sql.prepare("UPDATE studio_pin_settings SET bootstrap_hash=?,bootstrap_expires=? WHERE id='main'").run(await pinDigest(next),h.now+3600000);
 const newPin=h.pin==='9999'?'9998':'9999';const r=await h.call('/api/studio-pin/setup',{setupToken:next,pin:newPin,confirmPin:newPin});assert.equal(r.status,200);assert.equal((await h.call('/api/studio',undefined,{cookie:old})).status,401);assert.equal((await h.call('/api/studio',undefined,{cookie:cookie(r)})).status,200);
 assert.equal(h.sql.prepare('SELECT owner_hash FROM workspaces WHERE id=?').get(PREVIEW_WORKSPACE).owner_hash,h.ownerHash);assert.equal(h.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
test('two PIN devices share existing main orders and live publication; customer tracking is public only with its private bearer',async()=>{
 const h=await fixture(),a=cookie(await h.setup()),b=cookie(await h.call('/api/studio-pin/unlock',{pin:h.pin}));
 const snapshot=(await h.call('/api/manage/snapshot',undefined,{cookie:a})).data;
 const product={...snapshot.published.products[0],name:'Synthetic PIN loaf',price:1250,archived:false,soldOut:false};
 assert.equal((await h.call('/api/manage/product',{operationId:crypto.randomUUID(),revision:snapshot.revision,ledgerVersion:snapshot.ledgerVersion,product,available:8},{cookie:a})).status,200);
 const site=(await h.call('/api/site')).data;assert.equal(site.document.products[0].name,product.name);assert.equal(site.studioPath,'/studio');
 const made=await h.call('/api/orders',{workspaceId:PREVIEW_WORKSPACE,storefront:'main',revision:site.revision,requestId:crypto.randomUUID(),pickupId:site.document.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Synthetic PIN Guest'},lines:[{productId:product.id,variantId:product.variants[0].id,qty:1,unitPrice:1250}],total:1250});assert.equal(made.status,201);
 for(const c of [a,b]){const s=(await h.call('/api/manage/snapshot',undefined,{cookie:c})).data;assert.equal(s.orders[0].id,made.data.id);assert.equal(s.previewPinAccess,true);assert.equal(s.management.audit[0].actor.authentication,'preview_pin');}
 assert.equal((await h.call('/api/studio',undefined,{cookie:a,headers:{'X-RR-Workspace':'b'.repeat(48)}})).status,403);
 for(const path of ['/api/workspaces','/api/login','/api/device-start'])assert.equal((await h.call(path,{}, {cookie:a})).status,403);
 const tracking=new URL(made.data.trackingPath,origin),key=new URLSearchParams(tracking.hash.slice(1)).get('access'),api=tracking.pathname.replace('/orders/','/api/order-tracking/');
 assert.equal((await h.call(api)).status,401);assert.equal((await h.call(api,undefined,{headers:{Authorization:'Bearer '+key}})).status,200);
 assert.equal((await h.call(api+'/report',{}, {headers:{Authorization:'Bearer '+key}})).status,401);
 assert.equal((await h.call(api,undefined,{headers:{Authorization:'Bearer '+key}})).data.paymentStatus,'not_collected');
 assert.equal(h.sql.prepare('SELECT count(*) n FROM workspaces').get().n,2);
});
test('missing pepper, wrong host/database/workspace and D1 outages fail closed; disabling PIN restores unchanged original authentication',async()=>{
 for(const extra of [{STUDIO_PIN_PEPPER:''},{PREVIEW_DATABASE_ID:'wrong'},{PUBLIC_WORKSPACE_ID:'b'.repeat(48)},{REVIEW_BUILD:'false'},{ORDER_EMAIL_ENABLED:'true'},{PREVIEW_ACCESS_UNTIL:new Date(Date.now()-1).toISOString()}]){const h=await fixture();Object.assign(h.env,extra);assert.equal((await h.call('/api/studio')).status,503);}
 const h=await fixture();assert.equal((await h.call('/api/studio',undefined,{origin:'https://rise-roost-beta.joshua-maziarz1.workers.dev'})).status,503);
 const d=h.env.DB;h.env.DB={prepare(){throw Error('Synthetic D1 outage');}};assert.equal((await h.call('/api/manage/snapshot')).status,503);h.env.DB=d;
 h.env.PREVIEW_ACCESS_MODE='off';assert.equal((await h.call('/api/studio')).status,401);const login=await h.call('/api/login',{id:PREVIEW_WORKSPACE,accessKey:h.legacyKey});assert.equal(login.status,200);
 const old=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');h.env.PREVIEW_ACCESS_MODE='pin';assert.equal((await h.call('/api/studio',undefined,{cookie:old})).status,401);
});
