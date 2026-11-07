import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionFixture } from './production-fixture.mjs';
const phrase='a friendly garden phrase', email='owner@example.test';
test('production wrapper permits exact email auth routes while CSRF, launch lock, and Studio protections remain enforced',async()=>{
 const h=await productionFixture();const realFetch=globalThis.fetch;const messages=[];
 try {
  for(const name of ['0011-roost-password-login.sql','0012-roost-email-login.sql'])h.sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  Object.assign(h.env,{ROOST_EMAIL_LOGIN_ENABLED:'true',ROOST_PASSWORD_LOGIN_ENABLED:'true',ROOST_PASSWORD_PEPPER:'synthetic'.repeat(8),RESEND_API_KEY:'mock',ROOST_AUTH_FREE_PLAN_CONFIRMED:'true',ROOST_AUTH_EMAIL_ENABLED:'true',ROOST_AUTH_DELIVERY_VERIFIED:'true',ORDER_EMAIL_ENABLED:'false'});
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.resend.com/emails');messages.push(JSON.parse(options.body));return Response.json({id:'synthetic'});};
  const workspaceId=h.env.PUBLIC_WORKSPACE_ID;let cookie='';
  const post=async(action,data={},headers={})=>{const r=await h.call('/api/roost/email/'+action,{workspaceId,...data},{headers:{Cookie:cookie,...headers}});for(const c of r.headers.getSetCookie())cookie=c.split(';')[0];return r;};
  assert.equal((await post('register',{name:'Neighbor',email,password:phrase},{Origin:'https://evil.test'})).status,403);
  const registered=await post('register',{name:'Neighbor',email,password:phrase});assert.equal(registered.status,200,JSON.stringify(registered.data));
  const token=messages.at(-1).text.match(/#auth=verify\.([a-f0-9]{48})/)[1];assert.equal((await post('verify',{token})).status,200);
  assert.equal((await post('login',{email,password:phrase})).status,200);
  assert.equal((await h.call('/api/roost/me?workspace='+workspaceId,undefined,{headers:{Cookie:cookie}})).data.member.verifiedEmail,email);
  assert.equal((await h.call('/studio/api/manage/snapshot',undefined,{headers:{Cookie:cookie}})).status,401);
  assert.equal((await h.call('/api/manage/snapshot',undefined,{headers:{Cookie:cookie}})).status,404);
  assert.equal((await post('forgot',{email})).status,200);const reset=messages.at(-1).text.match(/#auth=reset\.([a-f0-9]{48})/)[1];
  assert.equal((await post('reset',{token:reset,password:'a different friendly garden phrase',confirmPassword:'a different friendly garden phrase'})).status,200);
  assert.equal((await h.call('/api/roost/me?workspace='+workspaceId,undefined,{headers:{Cookie:cookie}})).data.member,null);
  assert.equal((await post('not-an-action',{email})).status,404);
  assert.equal((await h.call('/api/roost/email/login')).status,404);
  assert.equal(h.env.REAL_CHECKOUT_ENABLED,'false');assert.equal(h.env.ORDER_EMAIL_ENABLED,'false');
 }finally{globalThis.fetch=realFetch;h.sql.close();}
});
test('production email routes fail closed when not activated',async()=>{
 const h=await productionFixture();try{for(const action of ['register','login','resend','forgot','link','verify','reset','recover'])assert.equal((await h.call('/api/roost/email/'+action,{workspaceId:h.env.PUBLIC_WORKSPACE_ID})).status,503);}finally{h.sql.close();}
});
