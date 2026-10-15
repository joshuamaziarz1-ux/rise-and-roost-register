// Opt-in integration test. This endpoint is permanently bound to rr_preview.
// It cannot call the production RPC or test against live store records.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
if(process.env.RR_PREVIEW_ONLY!=='1')throw Error('Set RR_PREVIEW_ONLY=1 to explicitly run isolated preview tests');
const url='https://vveahfizojxwfwnqiuyv.supabase.co',key='sb_publishable_pQxp1PqX51kmj5gVX1xgAg_eaAESAX0';
const endpoint=url+'/functions/v1/rise-roost-sync-preview';
const origin='https://rise-roost-sync-testing.mysticchub64.chatgpt.site';
async function api(action,payload={}){
 const res=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',apikey:key},body:JSON.stringify({action,...payload})});const out=await res.json();if(!res.ok)throw Error(res.status+': '+out.error);return out;
}
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let events=0;const channel=client.channel('isolated-integration-'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'rr_preview',table:'store_revision_public'},()=>events++);
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscribe timeout')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('Realtime subscription rejected'));}});});
try{
 const before=await api('catalog'),product=before.items.find(x=>x.id==='item-test');assert(product.stock>0);
 const request={requestId:crypto.randomUUID(),payment:'cash',expectedTotal:product.price,lines:[{itemId:product.id,qty:1}]};
 const first=await api('checkout',request),again=await api('checkout',request);assert.equal(first.result.saleId,again.result.saleId);assert.equal((await api('catalog')).items.find(x=>x.id===product.id).stock,product.stock-1);
 const lookup=await api('member_lookup_phone',{phone:'2025550100'});const returned=await api('roost_return',{requestId:crypto.randomUUID(),memberToken:lookup.memberToken,returns:[{typeId:'egg-carton',qty:1}]});assert.equal(returned.member.cartonCredits,lookup.member.cartonCredits+1);
 const unauthorized=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',apikey:key},body:'{"action":"admin_load"}'});assert.equal(unauthorized.status,401);
 const unauthMember=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',apikey:key},body:'{"action":"member_account"}'});assert.equal(unauthMember.status,401);
 const deadline=Date.now()+10000;while(events===0&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));assert(events>0,'Realtime changes did not arrive');
 console.log(JSON.stringify({livePreviewPassed:true,duplicateSalePrevented:true,memberCreditsSynchronized:true,unauthorizedRequestsBlocked:true,realtimeEvents:events}));
}finally{await client.removeChannel(channel);client.realtime.disconnect();await client.auth.dispose?.();}
