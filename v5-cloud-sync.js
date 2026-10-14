/* Store records live in Supabase; browser storage holds only login/receipt state. */
(()=>{
  'use strict';
  const cfg=window.RR_CONFIG,model=window.RRModel,clone=model.clone;
  const admin=/\/admin(?:-v5|-cloud-beta)\.html$/i.test(location.pathname);
  const reads=new Set(['catalog','admin_load','member_account','member_lookup_phone','member_lookup','pickup_lookup']);
  let client,baseline,pending,saving=false,loading=false,ready=false,online=false,suppress=true,timer,retry=1000;
  let refreshPromise,lastCatalog,lastAdminData;
  let memberToken=sessionStorage.getItem('rr.memberToken')||'';
  function status(message){
    let el=document.getElementById('rrCloudStatus');
    if(!el){el=document.createElement('div');el.id='rrCloudStatus';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:6px;right:6px;max-width:calc(100vw - 12px);z-index:100001;background:#fff2d9;color:#51370e;border:1px solid #c89a55;border-radius:8px;padding:6px 9px;font:12px system-ui;pointer-events:none';document.body.append(el);}
    el.textContent=cfg.preview?'TEST DATA · '+message:message;
  }
  function lockAdmin(lock){const el=document.getElementById('adminScreen');if(el)el.inert=lock;}
  function connection(ok,message){online=ok;document.body.dataset.cloud=ok?'online':'offline';if(message)status(message);if(!admin&&typeof renderCart==='function'){renderCart();if(!ok)document.getElementById('payBtn').disabled=true;}}
  async function api(action,payload={},needsAuth=action.startsWith('admin_')){
    const headers={'apikey':cfg.key,'Content-Type':'application/json','x-rr-client':'rise-roost-register'};
    if(needsAuth){const {data:{session}}=await client.auth.getSession();if(!session)throw Object.assign(new Error('Administrator sign-in required'),{status:401});headers.Authorization='Bearer '+session.access_token;}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),cfg.timeoutMs);
    const body={...payload,action};let operationKey;
    if(!reads.has(action)&&!body.requestId){
      operationKey='rr.operation.'+action;
      let saved;try{saved=JSON.parse(sessionStorage.getItem(operationKey)||'null');}catch{}
      if(saved&&!model.same(saved.payload,payload))throw new Error('A previous operation still needs confirmation. Retry the previous operation first.');
      body.requestId=saved?.requestId||crypto.randomUUID();
      sessionStorage.setItem(operationKey,JSON.stringify({requestId:body.requestId,payload}));
    }
    if(memberToken&&!admin&&!('memberToken' in body))body.memberToken=memberToken;
    try{
      const send=()=>fetch(cfg.url+'/functions/v1/'+cfg.endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
      let res=await send();
      if(res.status===401&&needsAuth){const {data,error}=await client.auth.refreshSession();if(!error&&data.session){headers.Authorization='Bearer '+data.session.access_token;res=await send();}}
      let out;try{out=await res.json();}catch{throw new Error('Invalid cloud response');}
      if(!res.ok){if(operationKey&&res.status>=400&&res.status<500&&res.status!==401)sessionStorage.removeItem(operationKey);if(res.status===401&&needsAuth){ready=false;gate('Session expired. Sign in to resume.');}throw Object.assign(new Error(out.error||'Cloud request failed'),{status:res.status,conflict:out.conflict});}
      if(operationKey)sessionStorage.removeItem(operationKey);
      if(out.memberToken){
        memberToken=out.memberToken;sessionStorage.setItem('rr.memberToken',memberToken);
        try{const receipt=JSON.parse(sessionStorage.getItem('rr.pendingCheckout')||'null');const subject=token=>JSON.parse(atob(token.split('.')[0].replaceAll('-','+').replaceAll('_','/'))).sub;
          if(receipt?.memberToken&&subject(receipt.memberToken)===subject(memberToken)){receipt.memberToken=memberToken;sessionStorage.setItem('rr.pendingCheckout',JSON.stringify(receipt));setTimeout(()=>{document.getElementById('rrRecoverPurchase')?.remove();recoverPending();},0);}
        }catch{}
      }
      return out;
    }catch(e){if(!e.status||e.status>=500)connection(false,'Connection lost — operations need cloud confirmation.');throw e;}finally{clearTimeout(timeout);}
  }
  function forgetMember(){memberToken='';sessionStorage.removeItem('rr.memberToken');data.customers=[];data.sales=[];data.roostReturns=[];data.cartonReturns=[];}
  function applyMember(out){
    if(!out?.member)return;const existing=data.customers?.find(x=>x.id===out.member.id);
    if(existing)Object.assign(existing,out.member);else data.customers=[out.member];
    for(const name of ['sales','pickups','roostReturns','cartonReturns'])if(out[name])data[name]=out[name];
    document.dispatchEvent(new CustomEvent('rr:member-sync',{detail:out.member}));
  }
  function applyCatalog(cat){
    if(lastCatalog&&model.same(lastCatalog,cat))return;
    lastCatalog=clone(cat);
    data.brands=cat.brands||[];data.items=cat.items||[];data.pickups=[];
    data.cartonSettings=cat.cartonSettings||{cartonsPerFreeDozen:12,rewardItemId:''};
    data.settings={...(data.settings||{}),paymentQrs:cat.paymentQrs||{},roostCreditSettings:cat.roostCreditSettings||{}};
    data.roostReturnTypes=cat.roostCreditSettings?.returnTypes||[];
    if(!memberToken)forgetMember();suppress=true;renderAll();suppress=false;
    document.dispatchEvent(new CustomEvent('rr:sync',{detail:{revision:cat.revision}}));
  }
  function refresh(){if(refreshPromise)return refreshPromise;refreshPromise=refreshOnce().finally(()=>refreshPromise=null);return refreshPromise;}
  async function refreshOnce(){
    const editing=admin&&(typeof edit!=='undefined'&&edit || document.activeElement?.matches('input,textarea,select')&&document.activeElement.closest('#adminScreen'));
    if(loading||editing||(admin&&(saving||pending||!ready)))return;loading=true;
    try{if(admin)await loadAdmin();else{
      applyCatalog(await api('catalog'));
      if(memberToken&&sessionStorage.getItem('riseRoostActiveMemberV1'))try{applyMember(await api('member_account'));}catch(e){if(e.status===401||e.status===403){forgetMember();document.dispatchEvent(new Event('rr:member-expired'));}else throw e;}
    }connection(true,'Connected to shared store');}catch(e){status(e.message);}finally{loading=false;}
  }
  async function loadAdmin(){
    const out=await api('admin_load',{},true);
    if(!ready||!lastAdminData||!model.same(lastAdminData,out.data)){lastAdminData=clone(out.data);suppress=true;data=migrate(out.data);renderAll();baseline=clone(data);suppress=false;}
    ready=true;lockAdmin(false);document.getElementById('rrCloudGate')?.remove();document.getElementById('pinOverlay')?.classList.add('hidden');document.getElementById('adminScreen').classList.remove('hidden');
    document.getElementById('changePin')?.closest('.card')?.remove();
    if(!document.getElementById('rrCloudAdminCard')){const card=document.createElement('div');card.id='rrCloudAdminCard';card.className='card section';card.innerHTML='<h2>Shared Cloud Database</h2><p class="hint">Changes are saved to Supabase and shared across devices.</p><button class="btn" id="rrCloudSignOut">Sign Out</button><button class="btn" id="rrExportDraft">Export Unsaved Draft</button><button class="btn" id="rrExportPrevious">Export Previous Device Data</button>';document.getElementById('settingsTab').prepend(card);
      document.getElementById('rrCloudSignOut').onclick=async()=>{await client.auth.signOut();gate();};
      document.getElementById('rrExportDraft').onclick=()=>download(window.RRCloud.conflictedDraft||data,'rise-roost-unsaved-draft.json');
      document.getElementById('rrExportPrevious').onclick=()=>{let previous;try{previous=JSON.parse(localStorage.getItem('riseRoostRegisterDataV2')||localStorage.getItem('riseRoostRegisterDataV1')||'null');}catch{}if(!previous)return alert('No previous device records were found.');download({version:3,data:previous},'rise-roost-previous-device-backup.json');};
    }
    document.querySelectorAll('#settingsTab .danger-zone .hint').forEach(el=>el.textContent='Store records are saved in the shared Supabase database.');connection(true,'Connected to shared store');
  }
  function download(value,name){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  function gate(message=''){
    ready=false;lockAdmin(true);document.getElementById('pinOverlay')?.classList.add('hidden');
    let panel=document.getElementById('rrCloudGate');if(panel){document.getElementById('rrGateError').textContent=message;return;}
    panel=document.createElement('div');panel.id='rrCloudGate';panel.style.cssText='position:fixed;inset:0;z-index:100000;background:#f4efe5;display:grid;place-items:center;padding:20px';
    panel.innerHTML='<form class="modal" style="width:min(400px,100%);padding:26px;background:white"><h2>Rise & Roost Admin</h2><p class="hint">Sign in with your approved administrator account.</p><label>Email<input type="email" required autocomplete="username" class="wide"></label><label>Password<input type="password" required autocomplete="current-password" class="wide"></label><button class="btn primary wide" type="submit">Sign In</button><p id="rrGateError" role="alert"></p><a href="register-v5.html">Open Register</a></form>';
    document.body.append(panel);document.getElementById('rrGateError').textContent=message;
    panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=panel.querySelector('button');button.disabled=true;try{const fields=panel.querySelectorAll('input');const {error}=await client.auth.signInWithPassword({email:fields[0].value,password:fields[1].value});if(error)throw error;if(pending)await flush();else await loadAdmin();}catch(error){document.getElementById('rrGateError').textContent=error.message;}finally{button.disabled=false;}};
  }
  function persistCloud(){
    if(suppress||!admin||!ready||!baseline)return;
    if(!pending){const changes=model.changes(baseline,data);if(!changes.length)return;pending={requestId:crypto.randomUUID(),changes};}
    else if(!saving)pending.changes=model.changes(baseline,data);
    lockAdmin(true);status('Saving to shared store…');clearTimeout(timer);timer=setTimeout(flush,100);
  }
  async function flush(){
    if(saving||!pending)return;saving=true;
    try{await api('admin_patch',pending,true);pending=null;retry=1000;await loadAdmin();status('Saved to shared store');}
    catch(e){if(e.conflict||(e.status>=400&&e.status<500&&e.status!==401)){
      window.RRCloud.conflictedDraft=clone(data);pending=null;await loadAdmin();status('Edit was not saved: '+e.message);alert(e.message+' Your attempted edit is available with Export Unsaved Draft in Settings.');
    }else{status('Not confirmed — retrying the same change when connected.');clearTimeout(timer);timer=setTimeout(flush,retry);retry=Math.min(retry*2,30000);}}finally{saving=false;lockAdmin(!!pending);}
  }
  async function checkout(method,entryList,opts={}){
    if(!online)throw new Error('Reconnect before confirming payment.');
    let receipt;try{receipt=JSON.parse(sessionStorage.getItem('rr.pendingCheckout')||'null');}catch{}
    if(!receipt){receipt={requestId:crypto.randomUUID(),payment:method,expectedTotal:entryList.reduce((s,x)=>s+Number(x.item.price)*Number(x.qty),0),lines:entryList.map(x=>({itemId:x.item.id,qty:Number(x.qty)})),memberToken:memberToken||null,...opts};sessionStorage.setItem('rr.pendingCheckout',JSON.stringify(receipt));}
    status('Confirming purchase…');
    try{const out=await api('checkout',receipt);sessionStorage.removeItem('rr.pendingCheckout');if(out.catalog)applyCatalog(out.catalog);if(memberToken)try{applyMember(await api('member_account'));}catch{}status('Purchase saved to shared store');return out.result;}
    catch(e){if(e.status===409){sessionStorage.removeItem('rr.pendingCheckout');await refresh();}throw e;}
  }
  function recoverPending(){
    let receipt;try{receipt=JSON.parse(sessionStorage.getItem('rr.pendingCheckout')||'null');}catch{}if(!receipt)return;
    let panel=document.getElementById('rrRecoverPurchase');if(panel)return;
    panel=document.createElement('div');panel.id='rrRecoverPurchase';panel.className='overlay';panel.style.zIndex='100002';
    panel.innerHTML='<div class="modal"><h2>Confirm your previous purchase</h2><p>A purchase still needs cloud confirmation. Confirm it before starting another order. Do not pay again.</p><button class="btn primary wide" id="rrRecoverConfirm">Check / Confirm Previous Purchase</button><button class="btn wide hidden" id="rrRecoverSignIn">Sign In to Original Roost Account</button><button class="btn wide hidden" id="rrRecoverDismiss">Review Cart Again</button><p role="status" id="rrRecoverStatus"></p></div>';document.body.append(panel);
    document.getElementById('rrRecoverSignIn').onclick=()=>{panel.classList.add('hidden');window.RRRoost.logout(false);window.RRRoost.open();};
    document.getElementById('rrRecoverDismiss').onclick=()=>panel.remove();
    document.getElementById('rrRecoverConfirm').onclick=async()=>{const button=document.getElementById('rrRecoverConfirm');button.disabled=true;try{await refresh();await checkout(receipt.payment,[],receipt);cart={};renderAll();panel.remove();document.getElementById('payOverlay').classList.add('hidden');document.getElementById('thanks').classList.remove('hidden');}catch(e){document.getElementById('rrRecoverStatus').textContent=e.message;if(e.status===401)document.getElementById('rrRecoverSignIn').classList.remove('hidden');if(!sessionStorage.getItem('rr.pendingCheckout'))document.getElementById('rrRecoverDismiss').classList.remove('hidden');}finally{button.disabled=false;}};
  }
  persist=persistCloud;
  if(!admin)available=i=>Math.max(0,Number(i?.stock||0)); // Catalog stock already excludes all pickup reservations.
  window.RRCloud={api,checkout,recoverPending,refreshCatalog:refresh,refreshAdmin:loadAdmin,applyMember,forgetMember,get client(){return client;},get ready(){return ready&&online;},get pendingCheckout(){return !!sessionStorage.getItem('rr.pendingCheckout');},conflictedDraft:null};
  window.addEventListener('beforeunload',e=>{if(pending||sessionStorage.getItem('rr.pendingCheckout')){e.preventDefault();e.returnValue='An operation still needs cloud confirmation.';}});
  async function start(){
    if(!window.supabase){connection(false,'Cloud library unavailable. Reconnect to load the register.');return;}
    client=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});suppress=false;
    if(admin){gate();try{const {data:{session}}=await client.auth.getSession();if(session)await loadAdmin();}catch(e){gate(e.message);}}else{ready=true;await refresh();recoverPending();}
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{if(!admin)return;if(!session)gate();else if(!ready&&!pending)loadAdmin().catch(e=>gate(e.message));},0);});
    client.channel('rr-sync-'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:cfg.revisionSchema||'public',table:'store_revision_public',filter:'id=eq.1'},()=>refresh()).subscribe(s=>{if(s==='SUBSCRIBED')refresh();});
    setInterval(()=>{if(!document.hidden){if(pending)flush();else refresh();}},cfg.pollMs);
    window.addEventListener('online',()=>pending?flush():refresh());window.addEventListener('offline',()=>connection(false,'Offline — reconnect to confirm operations.'));
    window.addEventListener('focus',()=>pending?flush():refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden){client.auth.startAutoRefresh();if(pending)flush();else refresh();}});
    document.getElementById('adminBtn').onclick=()=>location.href='admin-v5.html';document.getElementById('exitAdmin').onclick=()=>location.href='register-v5.html';
    document.getElementById('findPickupBtn').onclick=findPickupCloud;document.getElementById('pickupCodeInput').onkeydown=e=>{if(e.key==='Enter')findPickupCloud();};
    if(admin){window.voidSale=async id=>{if(!confirm('Void this sale and return inventory and credits?'))return;try{await api('admin_void',{id});await loadAdmin();}catch(e){alert(e.message);}};
      window.adminCompletePickup=async id=>{const p=data.pickups.find(x=>x.id===id);if(!p||!confirm('Complete pickup '+p.code+'? Confirm payment was received.'))return;try{await api('pickup_complete',{code:p.code},true);await loadAdmin();}catch(e){alert(e.message);}};
      document.getElementById('importBackup').onclick=importMissing;
    }
  }
  async function importMissing(){const file=document.getElementById('importBackupFile').files[0];if(!file)return alert('Choose a backup first.');try{
    const parsed=JSON.parse(await file.text()),incoming=parsed.data||parsed,records=model.documents(incoming);
    if(!confirm('Import missing records from '+records.length+' backup entries? Existing IDs, balances, inventory and history will be preserved. Imported sales do not deduct stock again.'))return;
    lockAdmin(true);await api('admin_import',{records});await loadAdmin();status('Missing backup records imported. Existing records preserved.');
  }catch(e){alert('Import could not be prepared: '+e.message);}}
  async function findPickupCloud(){const code=document.getElementById('pickupCodeInput').value.trim();if(!code)return;const box=document.getElementById('pickupCustomerResult');try{
    const {pickup:p}=await api('pickup_lookup',{code});box.innerHTML='<div class="pickup-result"><h3>'+esc(p.customerName)+'</h3><p>'+p.items.map(i=>Number(i.qty)+' × '+esc(i.itemName)).join('<br>')+'</p><p>'+money(pickupTotal(p))+(p.paid?' · Paid':' · Place exact cash in the cash box')+'</p><button class="btn primary wide" id="rrCompletePickup">Complete Pickup</button></div>';
    const requestId=crypto.randomUUID();document.getElementById('rrCompletePickup').onclick=async()=>{if(!confirm('Confirm payment and complete this pickup?'))return;try{await api('pickup_complete',{code,requestId});box.textContent='Pickup complete. Thank you!';await refresh();}catch(e){alert(e.message);}};
  }catch(e){box.textContent=e.message;}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
