// Actual local workerd/D1 runtime; no hosted data, PIN or credentials.
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomBytes,randomInt,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {seed} from '../public/model.mjs';
import {PREVIEW_HOST,PREVIEW_DATABASE,PREVIEW_WORKSPACE} from '../server/preview-access.mjs';
const bundle=process.env.RR_PIN_WORKER_BUNDLE;
if(!bundle)throw Error('Provide a local Wrangler dry-run bundle.');
const origin='https://'+PREVIEW_HOST,setupToken=randomBytes(32).toString('hex'),pin=String(randomInt(10000)).padStart(4,'0');
const mf=new Miniflare({modules:true,modulesRoot:dirname(bundle),rootPath:dirname(bundle),scriptPath:bundle,compatibilityDate:'2025-10-01',d1Databases:['DB'],serviceBindings:{ASSETS:()=>new Response('synthetic assets')},bindings:{COMMERCE_UPDATE_ENABLED:'true',WEBSITE_BASE_URL:origin,PREVIEW_ACCESS_MODE:'pin',PREVIEW_DATABASE_ID:PREVIEW_DATABASE,PUBLIC_WORKSPACE_ID:PREVIEW_WORKSPACE,REVIEW_BUILD:'true',CUSTOMER_EXPERIENCE_ENABLED:'true',STUDIO_MANAGEMENT_ENABLED:'true',ORDER_EMAIL_ENABLED:'false',STUDIO_PIN_PEPPER:randomBytes(32).toString('hex'),PREVIEW_ACCESS_UNTIL:new Date(Date.now()+30*86400000).toISOString()}});
try{
 const db=await mf.getD1Database('DB');for(const file of ['schema.sql','pin-schema.sql']){const source=(await readFile(new URL('../'+file,import.meta.url),'utf8')).split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');for(const sql of source.split(';'))if(sql.trim())await db.prepare(sql).run();}
 const doc=JSON.stringify(seed());await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').bind(PREVIEW_WORKSPACE,'synthetic-old-hash',doc,doc,'[]',new Date().toISOString()).run();
 await db.prepare("INSERT INTO studio_pin_settings(id,bootstrap_hash,bootstrap_expires) VALUES('main',?,?)").bind(createHash('sha256').update(setupToken).digest('hex'),Date.now()+3600000).run();
 const call=(path,body,cookie,headers={})=>mf.dispatchFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await call('/api/manage/snapshot')).status,401);
 const setup=await call('/api/studio-pin/setup',{setupToken,pin,confirmPin:pin});assert.equal(setup.status,200,await setup.clone().text());const first=setup.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await call('/api/manage/snapshot',undefined,first)).status,200);assert.equal((await call('/api/studio-pin/setup',{setupToken,pin,confirmPin:pin})).status,403);
 const unlock=await call('/api/studio-pin/unlock',{pin});assert.equal(unlock.status,200);const second=unlock.headers.get('Set-Cookie').split(';')[0];assert.notEqual(first,second);
 assert.equal((await call('/api/studio-pin/lock',{},first)).status,200);assert.equal((await call('/api/studio',undefined,first)).status,401);assert.equal((await call('/api/studio',undefined,second)).status,200);
 const settings=async()=> (await (await call('/api/manage/snapshot',undefined,second)).json()).management.settings;
 const mutation=async(action,fields)=>{const s=await settings();const r=await call('/api/manage/'+action,{operationId:crypto.randomUUID(),paymentsVersion:s.paymentsVersion||0,...fields},second);assert.equal(r.status,200,await r.clone().text());return r.json();};
 await mutation('payment-destination',{provider:'paypal',url:'https://www.paypal.com/ncp/payment/FICTIONAL_PREVIEW',enabled:true,businessConfirmed:true});
 assert.equal((await (await call('/api/site')).json()).paymentReadiness.ready,false);
 const testing=await mutation('payment-test-start',{provider:'paypal'});
 await mutation('payment-test-confirm',{provider:'paypal',testId:testing.result.testId,confirmed:true});
 const site=await (await call('/api/site')).json(),product=site.document.products[0];assert.equal(site.paymentReadiness.ready,true);assert.equal(Object.keys(site.paymentDestinations).join(','),'paypal');
 const ordered=await call('/api/orders',{workspaceId:PREVIEW_WORKSPACE,storefront:'main',revision:site.revision,requestId:crypto.randomUUID(),pickupId:site.document.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Fictional Workerd Customer'},policyAccepted:true,policyVersion:'2026-11-01',lines:[{productId:product.id,variantId:product.variants[0].id,qty:1,unitPrice:product.price}],total:product.price});
 assert.equal(ordered.status,201,await ordered.clone().text());const order=await ordered.json(),track='/api/order-tracking/'+PREVIEW_WORKSPACE+'/'+order.id,bearer={Authorization:'Bearer '+order.trackingPath.split('=')[1]};
 assert.equal((await call(track)).status,401);
 const message=await call(track+'/message',{requestId:crypto.randomUUID(),body:'Fictional missed pickup request; please review.',topic:'pickup'},undefined,bearer);assert.equal(message.status,200,await message.clone().text());const acceptedMessage=await message.json();assert.equal(acceptedMessage.attention.customerContacted,true);assert.ok(acceptedMessage.messageConfirmation?.messageId);assert.ok(acceptedMessage.messageConfirmation?.requestId);
 let snapshot=await (await call('/api/manage/snapshot',undefined,second)).json();
 const verified=await call('/api/manage/verify-payment',{operationId:crypto.randomUUID(),id:order.id,orderVersion:snapshot.orders[0].version,method:'cashapp',evidence:'',independentlyVerified:true},second);assert.equal(verified.status,200,await verified.clone().text());snapshot=await verified.json();assert.equal(snapshot.management.today.verifiedSales,order.total);
 for(const status of ['preparing','ready']){const changed=await call('/api/manage/fulfillment',{operationId:crypto.randomUUID(),id:order.id,orderVersion:snapshot.orders[0].version,status},second);assert.equal(changed.status,200,await changed.clone().text());snapshot=await changed.json();}
 const date=new Date(Date.now()+9*86400000).toISOString().slice(0,10);
 const extension=await call('/api/manage/approve-extension',{operationId:crypto.randomUUID(),id:order.id,orderVersion:snapshot.orders[0].version,date,time:'16:00',confirmed:true},second);assert.equal(extension.status,200,await extension.clone().text());
 const tracked=await (await call(track,undefined,undefined,bearer)).json();assert.equal(tracked.status,'ready');assert.equal(tracked.paymentStatus,'verified');assert.equal(tracked.attention.extensionApproved,true);assert.equal(tracked.pickup.date,date);assert.equal(tracked.extension.actor,undefined);
 assert.equal((await db.prepare('SELECT count(*) n FROM workspaces').first()).n,1);
 console.log(JSON.stringify({actualWorkerdD1:true,pbkdf2SetupAndUnlockPassed:true,oneTimeSetupPassed:true,rememberedServerSessionsPassed:true,lockAndAnonymousDenialPassed:true,paymentSettingsSavedAndTestedInD1:true,commerceCheckoutMessagesVerificationFulfillmentAndExtensionsPassed:true,hostedWrites:0}));
}finally{await mf.dispose();}
