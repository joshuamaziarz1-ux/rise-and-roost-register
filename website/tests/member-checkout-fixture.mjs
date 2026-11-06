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
export async function fixture() {
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
 async function order(overrides={},client=member){const current=(await call(guest,'/api/site')).data,p=current.document.products[0];return post(client,'/api/orders',{revision:current.revision,requestId:crypto.randomUUID(),pickupId:current.document.pickups[0]?.id,checkoutMode:client===guest?'guest':'member',customerDetails:{name:'Synthetic Neighbor'},policyAccepted:true,policyVersion:POLICY_VERSION,total:p.price,lines:[{productId:p.id,variantId:p.variants[0].id,qty:1,unitPrice:p.price}],...overrides});}
 const balance=()=>creditBalance(ledger(),customer.id);
 const cancel=o=>change('fulfillment',{id:o.id,orderVersion:ledger().orders.find(v=>v.id===o.id).version,status:'canceled',confirmCancellation:true,releaseInventory:true,reason:'Synthetic cancellation'});
 return {sql,db,now,origin,owner,member,other,guest,customer,stranger,site,call,post,me,change,snapshot,enable,item,award,order,ledger,putLedger,balance,cancel};
}
