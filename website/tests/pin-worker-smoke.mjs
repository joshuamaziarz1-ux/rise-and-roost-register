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
const mf=new Miniflare({modules:true,modulesRoot:dirname(bundle),rootPath:dirname(bundle),scriptPath:bundle,compatibilityDate:'2025-10-01',d1Databases:['DB'],serviceBindings:{ASSETS:()=>new Response('synthetic assets')},bindings:{PREVIEW_ACCESS_MODE:'pin',PREVIEW_DATABASE_ID:PREVIEW_DATABASE,PUBLIC_WORKSPACE_ID:PREVIEW_WORKSPACE,REVIEW_BUILD:'true',CUSTOMER_EXPERIENCE_ENABLED:'true',STUDIO_MANAGEMENT_ENABLED:'true',ORDER_EMAIL_ENABLED:'false',STUDIO_PIN_PEPPER:randomBytes(32).toString('hex'),PREVIEW_ACCESS_UNTIL:new Date(Date.now()+30*86400000).toISOString()}});
try{
 const db=await mf.getD1Database('DB');for(const file of ['schema.sql','pin-schema.sql']){const source=(await readFile(new URL('../'+file,import.meta.url),'utf8')).split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');for(const sql of source.split(';'))if(sql.trim())await db.prepare(sql).run();}
 const doc=JSON.stringify(seed());await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').bind(PREVIEW_WORKSPACE,'synthetic-old-hash',doc,doc,'[]',new Date().toISOString()).run();
 await db.prepare("INSERT INTO studio_pin_settings(id,bootstrap_hash,bootstrap_expires) VALUES('main',?,?)").bind(createHash('sha256').update(setupToken).digest('hex'),Date.now()+3600000).run();
 const call=(path,body,cookie)=>mf.dispatchFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await call('/api/manage/snapshot')).status,401);
 const setup=await call('/api/studio-pin/setup',{setupToken,pin,confirmPin:pin});assert.equal(setup.status,200,await setup.clone().text());const first=setup.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await call('/api/manage/snapshot',undefined,first)).status,200);assert.equal((await call('/api/studio-pin/setup',{setupToken,pin,confirmPin:pin})).status,403);
 const unlock=await call('/api/studio-pin/unlock',{pin});assert.equal(unlock.status,200);const second=unlock.headers.get('Set-Cookie').split(';')[0];assert.notEqual(first,second);
 assert.equal((await call('/api/studio-pin/lock',{},first)).status,200);assert.equal((await call('/api/studio',undefined,first)).status,401);assert.equal((await call('/api/studio',undefined,second)).status,200);
 assert.equal((await db.prepare('SELECT count(*) n FROM workspaces').first()).n,1);
 console.log(JSON.stringify({actualWorkerdD1:true,pbkdf2SetupAndUnlockPassed:true,oneTimeSetupPassed:true,rememberedServerSessionsPassed:true,lockAndAnonymousDenialPassed:true,hostedWrites:0}));
}finally{await mf.dispose();}
