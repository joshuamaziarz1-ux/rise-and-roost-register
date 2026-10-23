/* Store records live in Supabase; browser storage holds only login/receipt state. */
(()=>{
  'use strict';
  const cfg=window.RR_CONFIG,model=window.RRModel,clone=model.clone;
  const embedded=!/\/(?:admin|register)(?:-v5|-cloud-beta)\.html$/i.test(location.pathname);
  let admin=!embedded&&/\/admin(?:-v5|-cloud-beta)\.html$/i.test(location.pathname);
  const reads=new Set(['catalog','admin_load','member_account','member_lookup_phone','member_lookup','pickup_lookup','pickup_slots']);
  let client,baseline,pending,saving=false,loading=false,ready=false,online=false,suppress=true,timer,retry=1000;
  let refreshPromise,lastCatalog,lastAdminData;
  let checkoutPromise,identityEpoch=0,authEpoch=0,baselineActor;
  let memberToken=sessionStorage.getItem('rr.memberToken')||'';
  const memberSubject=()=>{try{return JSON.parse(atob(memberToken.split('.')[0].replaceAll('-','+').replaceAll('_','/'))).sub;}catch{return null;}};
  function status(message){
    let el=document.getElementById('rrCloudBadge');
    if(!el){el=document.createElement('div');el.id='rrCloudBadge';el.setAttribute('role','status');el.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;padding:8px 12px;border-radius:999px;font:800 12px system-ui;background:#fff;border:1px solid #d8ccb7;box-shadow:0 3px 16px rgba(0,0,0,.12);pointer-events:none';document.body.append(el);}
    el.style.opacity='1';if(/^(Connected|Saved|Purchase saved)/.test(message))setTimeout(()=>{if(el.textContent===message)el.style.opacity='0';},1600);
    el.textContent=cfg.preview?'TEST DATA · '+message:message;
    if(admin)document.dispatchEvent(new CustomEvent('rr:admin-save-state',{detail:{message,pending:!!pending}}));
    const saved=document.getElementById('rrCloudSaveStatus');
    if(admin&&saved){if(pending)saved.textContent=message.startsWith('Not confirmed')?'Not saved — connection problem':'Saving…';else if(message.startsWith('Edit'))saved.textContent=message;else if(/^(Connected|Saved)/.test(message))saved.textContent='Saved';}
  }
  function lockAdmin(lock){const el=document.getElementById('adminScreen');if(el)el.inert=lock;}
  function connection(ok,message){online=ok;document.body.dataset.cloud=ok?'online':'offline';if(message)status(message);if(!admin&&typeof renderCart==='function'){renderCart();if(!ok)document.getElementById('payBtn').disabled=true;}}
  async function api(action,payload={},needsAuth=action.startsWith('admin_'),expectedActor=null){
    const signingIn=['member_lookup_phone','member_lookup','member_signup'].includes(action);
    if(signingIn)identityEpoch++;
    const memberEpoch=identityEpoch,memberScoped=!admin&&(signingIn||!!memberToken||!!payload.memberToken);
    const staleMember=()=>memberScoped&&memberEpoch!==identityEpoch;
    const changedSession=()=>Object.assign(new Error('The Roost session changed. Sign in again to continue.'),{stale:true});
    const headers={'apikey':cfg.key,'Content-Type':'application/json','x-rr-client':'rise-roost-register'};
    if(needsAuth){const {data:{session}}=await client.auth.getSession();if(!session)throw Object.assign(new Error('Administrator sign-in required'),{status:401});if(expectedActor&&session.user.id!==expectedActor){gate('Sign in to the original administrator account to recover its unconfirmed edit.');throw Object.assign(new Error('Administrator account changed'),{status:401});}headers.Authorization='Bearer '+session.access_token;}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),cfg.timeoutMs);
    const body={...payload,action};let operationKey;
    if(!reads.has(action)&&!body.requestId){
      operationKey='rr.operation.'+action;
      let saved;try{saved=JSON.parse(sessionStorage.getItem(operationKey)||'null');}catch{}
      const actor=!admin&&!signingIn?memberSubject():null;
      if(saved?.actor&&saved.actor!==actor)throw new Error('Sign in to the original Roost account to confirm its previous operation.');
      if(saved&&!model.same(saved.payload,payload))throw new Error('A previous operation still needs confirmation. Retry the previous operation first.');
      body.requestId=saved?.requestId||crypto.randomUUID();
      sessionStorage.setItem(operationKey,JSON.stringify({requestId:body.requestId,payload,...actor?{actor}:{}}));
    }
    if(memberToken&&!admin&&!('memberToken' in body))body.memberToken=memberToken;
    try{
      const send=()=>fetch(cfg.url+'/functions/v1/'+cfg.endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
      let res=await send();
      if(staleMember())throw changedSession();
      if(res.status===401&&needsAuth){const {data,error}=await client.auth.refreshSession();if(!error&&data.session){if(expectedActor&&data.session.user.id!==expectedActor){gate('Sign in to the original administrator account to recover its unconfirmed edit.');throw Object.assign(new Error('Administrator account changed'),{status:401});}headers.Authorization='Bearer '+data.session.access_token;res=await send();}}
      let out;try{out=await res.json();}catch{throw new Error('Invalid cloud response');}
      if(staleMember())throw changedSession();
      if(!res.ok){if(operationKey&&res.status>=400&&res.status<500&&res.status!==401)sessionStorage.removeItem(operationKey);if(res.status===401&&needsAuth){ready=false;gate('Session expired. Sign in to resume.');}throw Object.assign(new Error(out.error||'Cloud request failed'),{status:res.status,conflict:out.conflict});}
      if(!out||typeof out!=='object'||out.error||(!reads.has(action)&&!out.result))throw new Error('Cloud confirmation missing. Retry the same operation.');
      if(action==='checkout'&&(typeof out.result.saleId!=='string'||!out.result.saleId))throw new Error('Purchase receipt missing. Retry the same operation.');
      if(action==='pickup_schedule'&&out.result.scheduled!==true)throw new Error('Appointment confirmation missing. Retry the same request.');
      if(action==='pickup_slots'&&(!Array.isArray(out.slots)||out.slots.some(at=>typeof at!=='string'||!Number.isFinite(new Date(at).getTime()))))throw new Error('Invalid pickup times. Reconnect and reload times.');
      if(['admin_patch','admin_import'].includes(action)&&out.result.saved!==true)throw new Error('Save confirmation missing. Retry the same operation.');
      if(action==='admin_load'&&(!Array.isArray(out.data?.items)||!Array.isArray(out.data?.brands)))throw new Error('Invalid shared store response.');
      if(operationKey)sessionStorage.removeItem(operationKey);
      if(out.memberToken){
        memberToken=out.memberToken;sessionStorage.setItem('rr.memberToken',memberToken);
        try{const receipt=JSON.parse(sessionStorage.getItem('rr.pendingCheckout')||'null');const subject=token=>JSON.parse(atob(token.split('.')[0].replaceAll('-','+').replaceAll('_','/'))).sub;
          if(receipt?.memberToken&&subject(receipt.memberToken)===subject(memberToken)){receipt.memberToken=memberToken;sessionStorage.setItem('rr.pendingCheckout',JSON.stringify(receipt));setTimeout(()=>{document.getElementById('rrRecoverPurchase')?.remove();recoverPending();},0);}
        }catch{}
      }
      return out;
    }catch(e){if(!e.stale&&(!e.status||e.status>=500))connection(false,'Connection lost — operations need cloud confirmation.');throw e;}finally{clearTimeout(timeout);}
  }
  function clearMemberData(){data.customers=[];data.sales=[];data.pickups=[];data.roostReturns=[];data.cartonReturns=[];data.cartonRewards=[];data.roostCreditUses=[];}
  function forgetMember(){identityEpoch++;memberToken='';sessionStorage.removeItem('rr.memberToken');clearMemberData();}
  function applyMember(out){
    if(!out?.member)return;const existing=data.customers?.find(x=>x.id===out.member.id);
    if(existing)Object.assign(existing,out.member);data.customers=[existing||out.member];
    for(const name of ['sales','pickups','roostReturns','cartonReturns','cartonRewards','roostCreditUses'])data[name]=out[name]||[];
    document.dispatchEvent(new CustomEvent('rr:member-sync',{detail:out.member}));
  }
  function applyCatalog(cat){
    if(lastCatalog&&model.same(lastCatalog,cat))return;
    if(!Array.isArray(cat?.items)||!Array.isArray(cat?.brands))throw new Error('Invalid catalog response');
    window.RRData.saveCatalog(cat);lastCatalog=clone(cat);
    data.brands=cat.brands||[];data.items=cat.items||[];
    data.cartonSettings=cat.cartonSettings||{cartonsPerFreeDozen:12,rewardItemId:''};
    data.settings={...(data.settings||{}),paymentQrs:cat.paymentQrs||{},roostCreditSettings:cat.roostCreditSettings||{}};
    data.roostReturnTypes=cat.roostCreditSettings?.returnTypes||[];
    // A public refresh may complete while signup is awaiting its response.
    // Clear guest-only private state without invalidating that pending sign-in.
    if(!memberToken)clearMemberData();suppress=true;renderAll();suppress=false;
    document.dispatchEvent(new CustomEvent('rr:sync',{detail:{revision:cat.revision}}));
  }
  function refresh(){if(refreshPromise)return refreshPromise;refreshPromise=refreshOnce().finally(()=>refreshPromise=null);return refreshPromise;}
  async function refreshOnce(){
    const editing=admin&&(typeof edit!=='undefined'&&edit || document.activeElement?.matches('input,textarea,select')&&document.activeElement.closest('#adminScreen'));
    if(loading||editing||(admin&&(saving||pending||!ready)))return;loading=true;
    try{if(admin){if(await loadAdmin()===false)return;}else{
      applyCatalog(await api('catalog'));
      const epoch=identityEpoch;if(memberToken&&sessionStorage.getItem('riseRoostActiveMemberV1'))try{const out=await api('member_account');if(epoch===identityEpoch)applyMember(out);}catch(e){if(epoch!==identityEpoch||e.stale)return;if(e.status===401||e.status===403){forgetMember();document.dispatchEvent(new Event('rr:member-expired'));}else throw e;}
    }connection(true,'Connected to shared store');}catch(e){status(e.message);}finally{loading=false;}
  }
  async function loadAdmin(force=false){
    const epoch=authEpoch;
    const {data:{session:adminSession}}=await client.auth.getSession();
    const out=await api('admin_load',{},true);
    const {data:{session:currentSession}}=await client.auth.getSession();
    if(epoch!==authEpoch||!currentSession||currentSession.user.id!==adminSession?.user?.id)return false;
    baselineActor=adminSession.user.id;
    // A read started before a form opened must not replace its version baseline.
    if(!force&&ready&&(pending||saving||typeof edit!=='undefined'&&edit||document.activeElement?.matches('input,textarea,select')&&document.activeElement.closest('#adminScreen')))return;
    if(force||!ready||!lastAdminData||!model.same(lastAdminData,out.data)){lastAdminData=clone(out.data);suppress=true;data=migrate(out.data);renderAll();baseline=clone(data);suppress=false;}
    ready=true;
    const queued=window.RRData.getPendingAdmin();
    if(queued&&queued.actor!==baselineActor){gate('Sign in to the original administrator account to recover its unconfirmed edit.');return;}
    if(queued&&queued.actor===baselineActor&&!pending){pending=queued;status('Recovering unconfirmed Admin edit…');setTimeout(flush,0);}
    lockAdmin(!!pending);document.getElementById('rrCloudGate')?.remove();document.getElementById('pinOverlay')?.classList.add('hidden');document.getElementById('adminScreen').classList.remove('hidden');
    document.getElementById('changePin')?.closest('.card')?.style.setProperty('display','none');
    if(!document.getElementById('rrCloudAdminCard')){const card=document.createElement('div');card.id='rrCloudAdminCard';card.className='card section';card.innerHTML='<div class="section-head"><h2>Cloud Database</h2><span class="badge on">Connected</span></div><p class="hint">Signed in as <strong>'+esc(adminSession?.user?.email||'Admin')+'</strong>. Inventory, members, sales, pickups and settings are stored in Supabase and shared across devices.</p><button class="btn" id="rrCloudSignOut">Sign Out</button><div id="rrCloudSaveStatus" class="hint" style="margin-top:8px">Saved</div>';document.getElementById('settingsTab').prepend(card);
      document.getElementById('rrCloudSignOut').onclick=async()=>{if(pending)return alert('Wait for your pending edit to be confirmed before signing out.');await client.auth.signOut();window.RRData.clearPrivate();data=migrate({});baseline=null;gate();};
    }
    document.querySelectorAll('#settingsTab .danger-zone .hint').forEach(el=>el.textContent='Store records are saved in the shared Supabase database.');connection(true,'Connected to shared store');
  }
  function download(value,name){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  function gate(message=''){
    ready=false;lockAdmin(true);
    let o=document.getElementById('rrCloudGate');
    if(o){const msg=document.getElementById('rrCloudGateMsg');if(msg)msg.textContent=message;return o;}
    o=document.createElement('div');
    o.id='rrCloudGate';
    o.style.cssText='position:fixed;inset:0;z-index:20000;background:#f4efe5;display:grid;place-items:center;padding:20px';
    o.innerHTML='<div class="modal" style="max-width:520px;background:white;border-radius:22px;padding:26px;box-shadow:0 12px 45px rgba(0,0,0,.14)"><h2 style="margin-top:0">Rise & Roost Admin</h2><p class="hint">Sign in with your approved admin email. Supabase will send a secure sign-in link.</p><div class="field" style="margin-top:14px"><label>Email</label><input id="rrCloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><button class="btn primary wide" id="rrCloudSendLink" style="margin-top:14px">Send Sign-In Link</button><div id="rrCloudGateMsg" class="hint" style="margin-top:12px"></div><a href="register-cloud-beta.html" class="btn ghost wide" style="margin-top:12px;text-decoration:none;text-align:center">Back to Register</a></div>';
    document.body.appendChild(o);
    document.getElementById('rrCloudSendLink').onclick=async()=>{
      const email=document.getElementById('rrCloudEmail').value.trim();
      const msg=document.getElementById('rrCloudGateMsg');
      if(!email)return msg.textContent='Enter your email address.';
      const b=document.getElementById('rrCloudSendLink');b.disabled=true;b.textContent='Sending…';
      const redirect=location.origin+location.pathname;
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:false}});
      if(error){msg.textContent=error.message;b.disabled=false;b.textContent='Send Sign-In Link';return}
      msg.innerHTML='<strong>Check your email.</strong> Open the Rise & Roost sign-in link on this device.';
      b.textContent='Link Sent';
    };
    document.getElementById('rrCloudGateMsg').textContent=message;return o;
  }

  function persistCloud(){
    if(suppress||!admin||!ready||!baseline)return;
    if(!pending){const changes=model.changes(baseline,data);if(!changes.length)return;pending={requestId:crypto.randomUUID(),changes,actor:baselineActor};}
    else return;
    try{window.RRData.setPendingAdmin(pending);}catch(e){pending=null;data=clone(baseline);suppress=true;renderAll();suppress=false;status('Edit not saved: recovery storage unavailable.');alert(e.message);return;}
    lockAdmin(true);status('Saving to shared store…');clearTimeout(timer);timer=setTimeout(flush,100);
  }
  async function flush(){
    if(saving||!pending)return;saving=true;
    try{if(pending.actor!==baselineActor)throw new Error('Sign in to the original administrator account to recover this edit.');
    const {actor,...request}=pending;await api('admin_patch',request,true,actor);pending=null;window.RRData.clearPendingAdmin();retry=1000;await loadAdmin(true);status('Saved to shared store');}
    catch(e){if(e.conflict||(e.status>=400&&e.status<500&&e.status!==401)){
      window.RRCloud.conflictedDraft={...clone(data),unconfirmedChanges:clone(pending.changes),requestId:pending.requestId,actor:pending.actor};window.RRData.archiveDraft(window.RRCloud.conflictedDraft);pending=null;window.RRData.clearPendingAdmin();await loadAdmin(true);status('Edit was not saved: '+e.message);alert(e.message+' Your attempted edit is included with Export Backup in Settings.');
    }else{status('Not confirmed — retrying the same change when connected.');clearTimeout(timer);timer=setTimeout(flush,retry);retry=Math.min(retry*2,30000);}}finally{saving=false;lockAdmin(!!pending);}
  }
  function checkout(method,entryList,opts={}){if(checkoutPromise)return checkoutPromise;checkoutPromise=checkoutOnce(method,entryList,opts).finally(()=>checkoutPromise=null);return checkoutPromise;}
  async function checkoutOnce(method,entryList,opts={}){
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
    document.getElementById('rrRecoverSignIn').onclick=()=>{panel.classList.add('hidden');if(window.RRRoost){window.RRRoost.logout(false);window.RRRoost.open();}else{window.RRLegacy.clearIdentity();document.querySelector('#shopView .back-home')?.click();document.getElementById('memberNameInput')?.focus();}};
    document.getElementById('rrRecoverDismiss').onclick=()=>panel.remove();
    document.getElementById('rrRecoverConfirm').onclick=async()=>{const button=document.getElementById('rrRecoverConfirm');button.disabled=true;try{await refresh();await checkout(receipt.payment,[],receipt);cart={};renderAll();panel.remove();document.getElementById('payOverlay').classList.add('hidden');document.getElementById('thanks').classList.remove('hidden');}catch(e){document.getElementById('rrRecoverStatus').textContent=e.message;if(e.status===401)document.getElementById('rrRecoverSignIn').classList.remove('hidden');if(!sessionStorage.getItem('rr.pendingCheckout'))document.getElementById('rrRecoverDismiss').classList.remove('hidden');}finally{button.disabled=false;}};
  }
  persist=persistCloud;
  available=i=>Math.max(0,Number(i?.stock||0)-(admin?reserved(i?.id):0)); // Public catalog stock already excludes pickup reservations.
  window.RRCloud={api,checkout,recoverPending,refreshCatalog:refresh,refreshAdmin:()=>loadAdmin(true),applyMember,forgetMember,get isAdmin(){return admin;},get client(){return client;},get ready(){return ready&&online;},get pendingAdmin(){return !!pending;},get pendingCheckout(){return !!sessionStorage.getItem('rr.pendingCheckout');},conflictedDraft:null};
  window.addEventListener('beforeunload',e=>{if(pending||sessionStorage.getItem('rr.pendingCheckout')){e.preventDefault();e.returnValue='An operation still needs cloud confirmation.';}});
  async function start(){
    if(!window.supabase){connection(false,'Cloud library unavailable. Reconnect to load the register.');return;}
    client=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});suppress=false;
    if(admin){gate();try{const {data:{session}}=await client.auth.getSession();if(session)await loadAdmin();}catch(e){gate(e.message);}}else{ready=true;const cached=window.RRData.getCatalog();if(cached?.value){applyCatalog(cached.value);connection(false,'Showing cached items — reconnect before paying.');}await refresh();recoverPending();}
    client.auth.onAuthStateChange((event,session)=>{
      const changed=!!(session&&baselineActor&&session.user.id!==baselineActor);
      if(event==='SIGNED_OUT'||changed)authEpoch++;
      setTimeout(()=>{if(!admin)return;if(!session||changed){window.RRPhase1Admin?.clearPrivate();ready=false;data=migrate({});baseline=null;lastAdminData=null;suppress=true;renderAll();suppress=false;document.getElementById('rrCloudAdminCard')?.remove();gate();}if(session&&!ready)loadAdmin().then(()=>{if(pending)flush();}).catch(e=>gate(e.message));},0);
    });
    client.channel('rr-sync-'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:cfg.revisionSchema||'public',table:'store_revision_public',filter:'id=eq.1'},()=>refresh()).subscribe(s=>{if(s==='SUBSCRIBED')refresh();});
    setInterval(()=>{if(!document.hidden){if(pending)flush();else refresh();}},cfg.pollMs);
    window.addEventListener('online',()=>pending?flush():refresh());window.addEventListener('offline',()=>connection(false,'Offline — reconnect to confirm operations.'));
    window.addEventListener('focus',()=>pending?flush():refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden){client.auth.startAutoRefresh();if(pending)flush();else refresh();}});
    document.getElementById('adminBtn').onclick=async()=>{if(!embedded){location.href='admin-cloud-beta.html';return;}admin=true;gate();try{const {data:{session}}=await client.auth.getSession();if(session)await loadAdmin();}catch(e){gate(e.message);}};
    document.getElementById('exitAdmin').onclick=async()=>{if(!embedded){location.href='register-cloud-beta.html';return;}if(pending)return;admin=false;baseline=null;lastAdminData=null;lastCatalog=null;data=migrate({});document.getElementById('adminScreen').classList.add('hidden');ready=true;await refresh();window.RRLegacy?.refresh();};
    document.getElementById('findPickupBtn').onclick=findPickupCloud;document.getElementById('pickupCodeInput').onkeydown=e=>{if(e.key==='Enter')findPickupCloud();};
    window.voidSale=async id=>{if(!confirm('Void this sale and return inventory and credits?'))return;try{await api('admin_void',{id});await loadAdmin();}catch(e){alert(e.message);}};
      window.adminCompletePickup=async id=>{const p=data.pickups.find(x=>x.id===id);if(!p||!confirm('Complete pickup '+p.code+'? Confirm payment was received.'))return;try{await api('pickup_complete',{code:p.code},true);await loadAdmin();}catch(e){alert(e.message);}};
      document.getElementById('importBackup').onclick=importMissing;
      document.getElementById('exportBackup').onclick=()=>{let previousDeviceData=null;try{previousDeviceData=JSON.parse(localStorage.getItem('riseRoostRegisterDataV2')||localStorage.getItem('riseRoostRegisterDataV1')||'null');}catch{}download({version:3,exportedAt:new Date().toISOString(),data,unsavedDraft:window.RRCloud.conflictedDraft||window.RRData.getDraft(),previousDeviceData},'rise-and-roost-backup-'+new Date().toISOString().slice(0,10)+'.json');};
    if(embedded&&new URLSearchParams(location.search).get('admin')==='1')document.getElementById('adminBtn').click();
  }
  async function importMissing(){const file=document.getElementById('importBackupFile').files[0];if(!file)return alert('Choose a backup first.');try{
    const parsed=JSON.parse(await file.text()),incoming=parsed.data||parsed,records=model.documents(incoming);
    if(!confirm('Import missing records from '+records.length+' backup entries? Existing IDs, balances, inventory and history will be preserved. Imported sales do not deduct stock again.'))return;
    lockAdmin(true);await api('admin_import',{records});await loadAdmin();status('Missing backup records imported. Existing records preserved.');
  }catch(e){status('Import not confirmed — retry the same backup after reconnecting.');alert('Import not confirmed: '+e.message);}finally{lockAdmin(!!pending);}}
  async function findPickupCloud(){const code=document.getElementById('pickupCodeInput').value.trim();if(!code)return;const box=document.getElementById('pickupCustomerResult');try{
    const {pickup:p}=await api('pickup_lookup',{code});
    const lines=p.items.map(i=>`<div class="pickup-line"><span>${i.qty}× ${esc(i.itemName)}</span><strong>${money(Number(i.price)*Number(i.qty))}</strong></div>`).join('');
    box.innerHTML=`<div class="pickup-result"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><h3>${esc(p.customerName)}</h3><div class="hint">Pickup code ${esc(p.code)}</div></div><span class="status ready">Ready</span></div><div class="pickup-lines">${lines}</div><div class="total"><span>Total</span><span>${money(pickupTotal(p))}</span></div>${p.note?`<div class="notice">Pickup note: ${esc(p.note)}</div>`:''}${p.paid?'<div class="notice"><strong>PAID</strong> — Your order has already been paid for.</div>':`<div class="notice">Please place <strong>${money(pickupTotal(p))}</strong> in the cash box. <strong>No change is available.</strong></div>`}<button class="btn primary wide" id="completeCustomerPickup">${p.paid?'Complete Pickup':'I Paid — Complete Pickup'}</button></div>`;
    const requestId=crypto.randomUUID();document.getElementById('completeCustomerPickup').onclick=async()=>{if(!p.paid&&!confirm(`Place exactly ${money(pickupTotal(p))} in the cash box, then press OK.`))return;try{await api('pickup_complete',{code,requestId});box.innerHTML=`<div class="pickup-result" style="text-align:center"><h3>Thank you, ${esc(p.customerName)}!</h3><p>Your pickup is complete.</p></div>`;await refresh();}catch(e){alert(e.message);}};
  }catch(e){box.textContent=e.message;}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

(()=>{const label=()=>{const admin=/admin/.test(location.pathname),name='Rise & Roost '+(admin?'Admin':'Register')+' v5.2.0-rc.3';document.title=name;document.querySelectorAll('.version,.admin-top .sub,#settingsTab .danger-zone strong').forEach(el=>el.textContent=name);};window.addEventListener('load',()=>{label();setTimeout(label,4500);});})();
