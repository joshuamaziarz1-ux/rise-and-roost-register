import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createHandler} from '../supabase/functions/rise-roost-sync/handler.mjs';
const base={secret:'synthetic-test-secret',origins:['http://localhost:4173'],logger:{error:()=>{}},getUser:async t=>t==='valid'?'admin-id':null};
const req=(body,token,origin='http://localhost:4173')=>new Request('http://localhost:4173/api',{method:'POST',headers:{Origin:origin,...token?{Authorization:'Bearer '+token}:{}},body:JSON.stringify(body)});
test('Admin identity is validated server-side and user metadata never authorizes',async()=>{
 let called=0;const h=createHandler({...base,rpc:async()=>{called++;return {};}});
 assert.equal((await h(req({action:'admin_load'}))).status,401);assert.equal((await h(req({action:'admin_load'},'forged'))).status,401);assert.equal(called,0);
 assert.equal((await h(req({action:'admin_load'},'valid'))).status,200);assert.equal(called,1);
});
test('member IDs, forged capabilities, expired tokens and cross-member credit requests',async()=>{
 let time=0,called=0;const h=createHandler({...base,now:()=>time,rpc:async(action,payload,actor,member)=>{called++;if(action==='member_lookup_phone')return {member:{id:'member-one'}};if(action==='catalog')return {};if(action==='member_account')return {member:{id:member}};assert.equal(member,'member-one');assert(!('customerId' in payload));return {result:{},catalog:{}};}});
 const signed=await (await h(req({action:'member_lookup_phone',phone:'2025550100'}))).json();assert(signed.memberToken);
 assert.equal((await h(req({action:'member_account',memberToken:signed.memberToken}))).status,200);
 assert.equal((await h(req({action:'checkout',useCredits:true,customerId:'member-two',requestId:crypto.randomUUID(),memberToken:signed.memberToken}))).status,200);
 const before=called;assert.equal((await h(req({action:'member_account',memberToken:signed.memberToken+'x'}))).status,401);assert.equal(called,before);
 time=7201000;assert.equal((await h(req({action:'member_account',memberToken:signed.memberToken}))).status,401);
 assert.equal((await h(req({action:'checkout',requestId:crypto.randomUUID(),memberToken:signed.memberToken}))).status,401);
});
test('network errors, invalid payloads and CORS fail closed',async()=>{
 const h=createHandler({...base,rpc:async()=>{throw Error('network');}});
 assert.equal((await h(req({action:'catalog'}))).status,503);assert.equal((await h(req({action:'checkout'}))).status,400);assert.equal((await h(req({action:'catalog'},null,'http://evil.test'))).status,403);
});
