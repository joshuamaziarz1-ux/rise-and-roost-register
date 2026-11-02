// Operator-only additive synthetic fixture. No requests to the blocked preview host.
// Execute only with --isolated-preview; writes exactly one new random workspace,
// never updates an existing workspace or creates an owner session in hosted D1.
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
import { POLICY_VERSION } from '../public/commerce.mjs';
if(process.argv[2] !== '--isolated-preview' || !process.env.RR_FIXTURE_RESULT) throw Error('Use explicit isolated-preview scope and a private result path.');
const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
const db=sqliteD1(sql),origin='https://rise-roost-experience-preview.joshua-maziarz1.workers.dev';
const config={customerExperienceEnabled:true,studioManagementEnabled:true,commerceEnabled:true,reviewBuild:true};
const call=(path,body)=>api(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),db,Date.now(),config);
const made=await call('/api/workspaces',{});if(made.status!==201)throw Error('Local fixture generation failed.');const site=await made.json();config.publicWorkspaceId=site.id;
const doc=site.published;doc.products[0].name='Fictional test loaf — do not fulfill';doc.products[0].price=0;
sql.prepare('UPDATE workspaces SET published_json=?,draft_json=? WHERE id=?').run(JSON.stringify(doc),JSON.stringify(doc),site.id);
const p=doc.products[0];
const ordered=await call('/api/orders',{workspaceId:site.id,storefront:'main',revision:site.publishedRevision,requestId:crypto.randomUUID(),pickupId:doc.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Fictional Preview Test — Do Not Fulfill'},policyAccepted:true,policyVersion:POLICY_VERSION,lines:[{productId:p.id,variantId:p.variants[0].id,qty:1,unitPrice:p.price}],total:p.price});
if(ordered.status!==201)throw Error('Local fixture checkout failed.');const order=await ordered.json();
const row=sql.prepare('SELECT * FROM workspaces WHERE id=?').get(site.id);
const remote=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/21352b95-d7f6-406f-8527-4b8dbcebf1bf/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql:'INSERT INTO workspaces('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')',params:Object.values(row)})});
const result=await remote.json();if(!remote.ok||!result.success||result.result[0].meta.changes!==1)throw Error('The isolated fixture insert was not confirmed.');
await writeFile(process.env.RR_FIXTURE_RESULT,JSON.stringify({workspaceId:site.id,orderNumber:order.orderNumber,trackingUrl:origin+order.trackingPath,createdAt:new Date().toISOString()}),{mode:0o600});
console.log(JSON.stringify({syntheticWorkspacesInserted:1,syntheticOrders:1,existingWorkspacesUpdated:0,hostedOwnerSessionsCreated:0,publicTrackingTested:false}));
