/* Shared catalog sync. Public register reads; authenticated admins write. */
(()=>{
'use strict';
const url='https://vveahfizojxwfwnqiuyv.supabase.co',key='sb_publishable_pQxp1PqX51kmj5gVX1xgAg_eaAESAX0';
const admin=location.pathname.includes('admin-v5');
const authKey='rr_cloud_admin_session';
let token=null,baseline=null,busy=false,ready=false;
const copy=x=>JSON.parse(JSON.stringify(x));
const headers=(bearer=key)=>({'apikey':key,'Authorization':'Bearer '+bearer,'Content-Type':'application/json'});
const request=async(path,options={})=>{const res=await fetch(url+path,{...options,headers:{...headers(token||key),...(options.headers||{})},cache:'no-store'});if(!res.ok)throw Error((await res.text()).slice(0,350));return res.status===204?null:res.json()};
const convert=(bs,is)=>({brands:bs.map(b=>({id:b.id,name:b.name,active:b.active})),items:is.map(i=>({id:i.id,brandId:i.brand_id,name:i.name,price:Number(i.price),stock:i.stock,lowStock:i.low_stock,active:i.active}))});
async function readCatalog(){const [bs,is]=await Promise.all([request('/rest/v1/brands?select=id,name,active&order=name'),request('/rest/v1/items?select=id,brand_id,name,price,stock,low_stock,active&order=name')]);return convert(bs,is)}
function apply(c){if(typeof data==='undefined')return;data.brands=c.brands;data.items=c.items;if(typeof persist==='function')persist();if(typeof renderStore==='function')renderStore();if(typeof renderCart==='function')renderCart();if(admin&&typeof renderAdmin==='function')renderAdmin()}
const warn=(msg)=>{let el=document.getElementById('rrCloudStatus');if(!el){el=document.createElement('div');el.id='rrCloudStatus';el.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;z-index:99999;background:#fff2d9;color:#51370e;border:1px solid #c89a55;border-radius:8px;padding:9px;font:14px sans-serif';document.body.append(el)}el.textContent=msg};
async function refresh(){if(busy)return;try{const c=await readCatalog();if(!ready||JSON.stringify(c)!==JSON.stringify(baseline)){baseline=copy(c);apply(c)}ready=true;document.getElementById('rrCloudStatus')?.remove()}catch(e){warn('Cloud connection unavailable. Store information may be out of date. '+e.message)}}
async function login(email,password){const res=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:headers(),body:JSON.stringify({email,password})});const body=await res.json();if(!res.ok)throw Error(body.error_description||body.msg||body.error||'Sign-in failed');token=body.access_token;sessionStorage.setItem(authKey,JSON.stringify(body));const rows=await request('/rest/v1/admins?select=user_id&user_id=eq.'+encodeURIComponent(body.user.id));if(!rows.length){token=null;sessionStorage.removeItem(authKey);throw Error('This account is not authorized as a store administrator.')}return body}
function gate(){const panel=document.createElement('div');panel.id='rrCloudGate';panel.style.cssText='position:fixed;inset:0;z-index:100000;background:#f4efe5;display:flex;align-items:center;justify-content:center;padding:20px;font:16px sans-serif';panel.innerHTML='<form style="background:white;border-radius:16px;padding:26px;max-width:400px;width:100%;box-shadow:0 8px 40px #0002"><h2>Rise & Roost Cloud Admin</h2><p>Sign in with your authorized Supabase Admin email and password to sync changes across every Register.</p><label>Email<input type="email" required autocomplete="username" style="display:block;width:100%;box-sizing:border-box;margin:8px 0 16px;padding:12px"></label><label>Password<input type="password" required autocomplete="current-password" style="display:block;width:100%;box-sizing:border-box;margin:8px 0 16px;padding:12px"></label><button type="submit" style="padding:12px 20px;background:#465b37;color:white;border:0;border-radius:8px">Sign in</button><p id="rrGateError" role="alert"></p></form>';document.body.append(panel);panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const fields=panel.querySelectorAll('input');try{await login(fields[0].value,fields[1].value);await refresh();panel.remove()}catch(err){panel.querySelector('#rrGateError').textContent=err.message}}}
async function sync(){if(!admin||!token||busy||!baseline)return;busy=true;try{
const old=baseline,cur={brands:copy(data.brands),items:copy(data.items)};
const changed=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
for(const b of cur.brands){const prev=old.brands.find(x=>x.id===b.id);if(!prev||changed(prev,b))await request('/rest/v1/brands?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:b.id,name:b.name,active:b.active})})}
for(const i of cur.items){const prev=old.items.find(x=>x.id===i.id);if(!prev||changed(prev,i))await request('/rest/v1/items?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:i.id,brand_id:i.brandId,name:i.name,price:i.price,stock:i.stock,low_stock:i.lowStock,active:i.active})})}
for(const i of old.items.filter(x=>!cur.items.some(y=>y.id===x.id)))await request('/rest/v1/items?id=eq.'+encodeURIComponent(i.id),{method:'DELETE'});
for(const b of old.brands.filter(x=>!cur.brands.some(y=>y.id===x.id)))await request('/rest/v1/brands?id=eq.'+encodeURIComponent(b.id),{method:'DELETE'});
baseline=copy(cur);document.getElementById('rrCloudStatus')?.remove();
}catch(e){warn('Changes NOT saved to cloud: '+e.message);alert('Cloud save failed. Your change may not appear on other devices. '+e.message)}finally{busy=false;await refresh()}}
if(admin){const existing=JSON.parse(sessionStorage.getItem(authKey)||'null');if(existing?.access_token)token=existing.access_token;
const original=save;save=function(){original();void sync()};
const originalPersist=persist;persist=function(){originalPersist();if(ready&&token)void sync()};
document.addEventListener('DOMContentLoaded',async()=>{if(token){try{const s=JSON.parse(sessionStorage.getItem(authKey));const rows=await request('/rest/v1/admins?select=user_id&user_id=eq.'+encodeURIComponent(s.user.id));if(!rows.length)throw Error('Unauthorized');await refresh();return}catch(e){token=null;sessionStorage.removeItem(authKey)}}gate()});
}else document.addEventListener('DOMContentLoaded',refresh);
setInterval(()=>{if(!admin||token)void refresh()},4000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!admin||token))void refresh()});
window.addEventListener('focus',()=>{if(!admin||token)void refresh()});
})();