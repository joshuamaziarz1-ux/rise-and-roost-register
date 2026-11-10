import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { seed } from '../public/model.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
const bundle=process.env.RR_CANDIDATE_MODULE;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,modulesRoot:dirname(bundle),rootPath:dirname(bundle),scriptPath:bundle,compatibilityDate:'2025-10-01',cf:false,d1Databases:['DB'],
 serviceBindings:{ASSETS:()=>new Response('Synthetic assets')},outboundService:()=>{throw Error('External request forbidden');},bindings:{REVIEW_BUILD:'false',STUDIO_MANAGEMENT_ENABLED:'true',COMMERCE_UPDATE_ENABLED:'true',CUSTOMER_EXPERIENCE_ENABLED:'true',DEPLOYMENT_ENVIRONMENT:'production',PRODUCTION_RELEASE_APPROVED:'true',REAL_CHECKOUT_ENABLED:'true',PRODUCTION_DATABASE_ID,PUBLIC_WORKSPACE_ID:PRODUCTION_WORKSPACE_ID,WEBSITE_BASE_URL:'https://rise-and-roost.com',PRODUCTION_ACCESS_TEAM_DOMAIN:'https://synthetic.cloudflareaccess.com',PRODUCTION_ACCESS_AUD:'a'.repeat(64),PRODUCTION_OWNERS:JSON.stringify([{email:'synthetic@example.test',name:'Synthetic owner',role:'owner'}])}}));
try{
 const db=await mf.getD1Database('DB');const schema=await readFile(process.env.RR_SYNTHETIC_SCHEMA,'utf8');
 for(const sql of schema.split(';'))if(sql.trim() && !sql.includes('CREATE TABLE _cf_KV'))await db.prepare(sql).run();
 const doc=seed(Date.now()+7*86400000);doc.business.pickupAddress={name:'Synthetic farm',street:'Synthetic street',city:'Synthetic city'};doc.products[0].stock=10;
 const payments=Object.fromEntries(Object.entries({paypal:'https://paypal.me/SyntheticFinalFlow',venmo:'https://venmo.com/u/SyntheticFinalFlow',cashapp:'https://cash.app/$SyntheticFinalFlow'}).map(([k,url])=>[k,{url,enabled:true,businessConfirmed:true,tested:{url,at:new Date().toISOString(),actor:{name:'Synthetic owner'}}}]));
 // Reuse the production browser fixture's real management setup to obtain the
 // exact validated synthetic payment-settings structure; no remote data.
 const {postOrderFixture}=await import('./post-order-fixture.mjs');const f=await postOrderFixture();for(const [k,v]of Object.entries(payments))await f.configure(k,v.url);const ledger=JSON.parse(f.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json);await f.close();
 await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,ledger_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(PRODUCTION_WORKSPACE_ID,'disabled-legacy-owner',JSON.stringify(doc),JSON.stringify(doc),'[]',JSON.stringify(ledger),new Date().toISOString()).run();
 await db.prepare("INSERT INTO deployment_identity VALUES('main','production',?,?)").bind(PRODUCTION_DATABASE_ID,PRODUCTION_WORKSPACE_ID).run();
 const call=async(path,body,headers={})=>{const r=await mf.dispatchFetch('https://rise-and-roost.com'+path,{method:body?'POST':'GET',headers:{Origin:'https://rise-and-roost.com','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
 const response=await call('/api/site');assert.equal(response.status,200,JSON.stringify(response));const site=response.data,p=site.document.products[0];
 for(const method of ['paypal','venmo','cashapp','cash_pickup']){
  const input={workspaceId:PRODUCTION_WORKSPACE_ID,storefront:'main',revision:site.revision,requestId:crypto.randomUUID(),pickupId:site.document.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Synthetic edge guest',email:'synthetic@example.test',phone:'555-010-1234'},policyAccepted:true,policyVersion:'2026-11-09',total:p.price,lines:[{productId:p.id,variantId:p.variants[0].id,qty:1,unitPrice:p.price}]};
  const made=await call('/api/orders',input);assert.equal(made.status,201,JSON.stringify(made));assert.equal(made.data.selectedPaymentMethod,undefined);
  assert.equal((await call('/api/orders',input)).data.id,made.data.id);
  const u=new URL(made.data.trackingPath,'https://rise-and-roost.com'),path=u.pathname.replace('/orders/','/api/order-tracking/'),headers={Authorization:'Bearer '+u.hash.split('=')[1]};
  const a=await call(path+'/payment-method',{method},headers),b=await call(path+'/payment-method',{method},headers);assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.data.version,b.data.version);assert.equal(a.data.selectedPaymentMethod,method);assert.equal(a.data.paymentVerifiedAt,undefined);
 }
 console.log('Real workerd/D1: all four methods, durable order creation, duplicate submission and idempotent choice saves passed.');
}finally{await mf.dispose();}
