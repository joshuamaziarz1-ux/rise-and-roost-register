import { roostApi } from '../server/roost.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionFixture } from './production-fixture.mjs';

test('production explicitly allows password routes with CSRF/session guards and keeps Studio protected',async()=>{
 const h=await productionFixture();try{
 h.sql.exec(readFileSync(new URL('../migrations/0011-roost-password-login.sql',import.meta.url),'utf8'));
 Object.assign(h.env,{ROOST_PASSWORD_LOGIN_ENABLED:'true',ROOST_PASSWORD_PEPPER:'synthetic'.repeat(8)});
 const body={workspaceId:h.env.PUBLIC_WORKSPACE_ID,username:'production-neighbor',password:'a friendly garden phrase',name:'Neighbor'};
 assert.equal((await h.call('/api/roost/password/setup',body)).status,401);
 assert.equal((await h.call('/api/roost/password/register',body,{headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await h.call('/api/roost/password/register',body)).status,409);
 const seeded=await roostApi({request:new Request(h.env.WEBSITE_BASE_URL,{method:'POST'}),db:h.env.DB,now:Date.now(),input:body,path:'/api/roost/password/register',json:(d,s=200)=>Response.json(d,{status:s}),contactLoginEnv:{...h.env,DEPLOYMENT_ENVIRONMENT:'preview'}});
 const registered={status:seeded.status,headers:seeded.headers,data:await seeded.json()};assert.equal(registered.status,200);
 const cookie=registered.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const me=await h.call('/api/roost/me?workspace='+body.workspaceId,undefined,{headers:{Cookie:cookie}});assert.equal(me.data.passwordLoginEnabled,true);assert.equal(me.data.member.username,body.username);
 assert.equal((await h.call('/studio/api/manage/snapshot',undefined,{headers:{Cookie:cookie}})).status,401);
 assert.equal((await h.call('/api/roost/password/not-an-action',body)).status,404);
 assert.equal((await h.call('/api/roost/logout-all',{workspaceId:body.workspaceId},{headers:{Cookie:cookie}})).status,200);
 assert.equal((await h.call('/api/roost/me?workspace='+body.workspaceId,undefined,{headers:{Cookie:cookie}})).data.member,null);
 }finally{h.sql.close();}
});
