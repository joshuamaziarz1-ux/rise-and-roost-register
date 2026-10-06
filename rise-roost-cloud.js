(()=>{
  const PROJECT_URL='https://vveahfizojxwfwnqiuyv.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_pQxp1PqX51kmj5gVX1xgAg_eaAESAX0';
  const API_URL=PROJECT_URL+'/functions/v1/rise-roost-api';
  const isBeta=/cloud-beta/i.test(location.pathname);
  const ADMIN_PATH=isBeta?'admin-cloud-beta.html':'admin-v5.html';
  const REGISTER_PATH=isBeta?'register-cloud-beta.html':'register-v5.html';
  const isAdminPage=/\/admin(?:-v5|-cloud-beta)\.html$/i.test(location.pathname);
  const sbLib=window.supabase;

  let client=null;
  let adminRevision=0;
  let adminReady=false;
  let suppressSave=false;
  let saveTimer=null;
  let saving=false;
  let pendingSave=false;
  let publicCatalogRevision=0;
  let liveChannel=null;
  let liveTimer=null;
  let catalogRefreshing=false;
  let adminIgnoreRealtimeUntil=0;
  let basePersist=typeof persist==='function'?persist:null;

  const clone=v=>JSON.parse(JSON.stringify(v));
  const money2=n=>'$'+Number(n||0).toFixed(2);
  const safe=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function cloudBadge(text,state='ok'){
    let el=document.getElementById('rrCloudBadge');
    if(!el){
      el=document.createElement('div');
      el.id='rrCloudBadge';
      el.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;padding:8px 12px;border-radius:999px;font:800 12px system-ui;background:#fff;border:1px solid #d8ccb7;box-shadow:0 3px 16px rgba(0,0,0,.12)';
      document.body.appendChild(el);
    }
    el.textContent=text;
    el.style.opacity=state==='hidden'?'0':'1';
  }

  async function api(action,payload={},needsAuth=false){
    const headers={
      'Content-Type':'application/json',
      'apikey':PUBLISHABLE_KEY,
      'x-rr-client':'rise-roost-register'
    };
    if(needsAuth){
      const {data:{session}}=await client.auth.getSession();
      if(!session?.access_token)throw new Error('Admin sign-in required.');
      headers.Authorization='Bearer '+session.access_token;
    }
    const res=await fetch(API_URL,{
      method:'POST',
      headers,
      body:JSON.stringify({action,...payload})
    });
    let out={};
    try{out=await res.json()}catch{}
    if(!res.ok){
      const err=new Error(out.error||('Cloud request failed ('+res.status+')'));
      err.status=res.status;
      err.conflict=!!out.conflict;
      throw err;
    }
    return out;
  }

  function applyCatalog(cat){
    if(!cat)return;
    publicCatalogRevision=Number(cat.revision||0);
    data.brands=Array.isArray(cat.brands)?cat.brands:[];
    data.items=Array.isArray(cat.items)?cat.items:[];
    data.pickups=[];
    data.sales=[];
    data.stockLog=[];
    const activeMemberId=sessionStorage.getItem('riseRoostActiveMemberV1')||sessionStorage.getItem('riseRoostTESTActiveMemberV1')||'';
    data.customers=Array.isArray(data.customers)&&activeMemberId
      ? data.customers.filter(c=>c&&c.id===activeMemberId)
      : [];
    data.cartonReturns=[];
    data.cartonRewards=[];
    data.cartonSettings=cat.cartonSettings||{cartonsPerFreeDozen:12,rewardItemId:''};
    data.settings=data.settings&&typeof data.settings==='object'?data.settings:{};
    data.settings.paymentQrs=cat.paymentQrs||{};
    data.settings.roostCreditSettings=cat.roostCreditSettings||data.settings.roostCreditSettings||{
      creditValue:0.50,
      allowFullPurchase:true,
      returnTypes:[
        {id:'egg-carton',name:'Egg Carton',credit:1,active:true},
        {id:'bottle-16',name:'16 oz Bottle',credit:2,active:true},
        {id:'bottle-32',name:'32 oz Bottle',credit:5,active:true}
      ]
    };
    data.roostReturnTypes=Array.isArray(data.settings.roostCreditSettings.returnTypes)?data.settings.roostCreditSettings.returnTypes:[];
    if(basePersist)basePersist();
    if(typeof renderAll==='function')renderAll();
  }

  async function refreshCatalog(){
    if(catalogRefreshing)return null;
    catalogRefreshing=true;
    try{
      const cat=await api('catalog');
      applyCatalog(cat);
      cloudBadge('Live inventory connected');
      setTimeout(()=>cloudBadge('', 'hidden'),1600);
      return cat;
    }finally{
      catalogRefreshing=false;
    }
  }

  async function checkout(method,entryList,opts={}){
    const lines=(entryList||[]).map(x=>({itemId:x.item.id,qty:Number(x.qty)}));
    const expectedTotal=(entryList||[]).reduce((s,x)=>s+Number(x.item.price)*Number(x.qty),0);
    cloudBadge('Saving purchase…');
    const out=await api('checkout',{
      payment:method,
      expectedTotal,
      lines,
      customerId:opts.customerId||null,
      useCredits:!!opts.useCredits
    });
    applyCatalog(out.catalog);
    cloudBadge('Purchase saved');
    setTimeout(()=>cloudBadge('', 'hidden'),1800);
    return out.result;
  }

  function setupPublicPickup(){
    const btn=document.getElementById('findPickupBtn');
    const input=document.getElementById('pickupCodeInput');
    const result=document.getElementById('pickupCustomerResult');
    if(!btn||!input||!result)return;

    btn.onclick=async()=>{
      const code=input.value.trim().toUpperCase();
      if(!code)return alert('Enter your pickup code.');
      result.innerHTML='<div class="empty">Finding your pickup…</div>';
      try{
        const out=await api('pickup_lookup',{code});
        const p=out.pickup;
        const lines=(p.items||[]).map(i=>'<div class="pickup-line"><span>'+Number(i.qty)+'× '+safe(i.itemName)+'</span><strong>'+money2(Number(i.price)*Number(i.qty))+'</strong></div>').join('');
        const total=(p.items||[]).reduce((s,i)=>s+Number(i.price)*Number(i.qty),0);
        result.innerHTML='<div class="pickup-result"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><h3>'+safe(p.customerName)+'</h3><div class="hint">Pickup code '+safe(p.code)+'</div></div><span class="status ready">Ready</span></div><div class="pickup-lines">'+lines+'</div><div class="total"><span>Total</span><span>'+money2(total)+'</span></div>'+(p.note?'<div class="notice">Pickup note: '+safe(p.note)+'</div>':'')+(p.paid?'<div class="notice"><strong>PAID</strong> — Your order has already been paid for.</div>':'<div class="notice">Please place <strong>'+money2(total)+'</strong> in the cash box. <strong>No change is available.</strong></div>')+'<button class="btn primary wide" id="rrCloudCompletePickup">'+(p.paid?'Complete Pickup':'I Paid — Complete Pickup')+'</button></div>';
        document.getElementById('rrCloudCompletePickup').onclick=async()=>{
          if(!p.paid&&!confirm('Place exactly '+money2(total)+' in the cash box, then press OK.'))return;
          const b=document.getElementById('rrCloudCompletePickup');b.disabled=true;b.textContent='Completing…';
          try{
            const done=await api('pickup_complete',{code:p.code});
            applyCatalog(done.catalog);
            result.innerHTML='<div class="pickup-result" style="text-align:center"><h3>Thank you, '+safe(done.result.customerName)+'!</h3><p>Your pickup is complete.</p></div>';
          }catch(e){
            alert(e.message||'Pickup could not be completed.');
            b.disabled=false;b.textContent=p.paid?'Complete Pickup':'I Paid — Complete Pickup';
          }
        };
      }catch(e){
        result.innerHTML='<div class="pickup-result"><strong>Pickup order not found.</strong><p class="hint">Check the code or ask Danielle for help.</p></div>';
      }
    };
  }

  function setupPrivateCartonClub(){
    const view=document.getElementById('cartonView');
    if(!view)return;
    view.innerHTML='<section class="card pickup-customer"><h2>Carton Club</h2><p class="hint">Look up your Roost account privately. Other members are not displayed.</p><div class="form two" style="margin-top:16px"><div class="field"><label>Your name</label><input id="rrMemberName" autocomplete="name" placeholder="First and last name"></div><div class="field"><label>Last 4 digits of phone</label><input id="rrMemberLast4" inputmode="numeric" maxlength="4" placeholder="1234"><div class="hint">If no phone is saved on your account, leave this blank.</div></div></div><button class="btn primary wide" id="rrFindMember" style="margin-top:12px">Find My Account</button><div id="rrMemberResult" style="margin-top:14px"></div></section>';
    let current=null;

    const draw=member=>{
      current=member;
      const box=document.getElementById('rrMemberResult');
      if(!member){box.innerHTML='';return}
      const need=Math.max(1,Number(member.threshold||12));
      const credits=Number(member.cartonCredits||0);
      const eligible=Math.floor(credits/need);
      const remainder=credits%need;
      const next=remainder===0?need:need-remainder;
      const progress=credits>=need?(eligible+' free dozen'+(eligible===1?'':'s')+' available'):(next+' more carton'+(next===1?'':'s')+' until a free dozen');
      const reward=member.reward;
      box.innerHTML='<div class="pickup-result"><h3>'+safe(member.name)+'</h3><div class="split" style="margin-top:12px"><div class="callout"><div class="rsub">Carton Credits</div><div class="big" style="font-size:2.3rem;margin:4px 0">'+credits+'</div><strong>'+safe(progress)+'</strong></div><div class="callout"><div class="rsub">Lifetime Returned</div><div style="font-size:1.8rem;font-weight:950;margin-top:6px">'+Number(member.totalCartons||0)+'</div><div class="rsub">Free dozens redeemed: '+Number(member.freeDozens||0)+'</div></div></div><div class="field" style="margin-top:14px"><label>How many clean cartons are you returning?</label><div class="qtys"><button class="qbtn" id="rrCartonMinus">−</button><input id="rrCartonQty" type="number" inputmode="numeric" min="1" step="1" value="1" style="width:90px;min-height:44px;text-align:center;border:1px solid var(--line);border-radius:10px"><button class="qbtn" id="rrCartonPlus">+</button></div></div><button class="btn primary wide" id="rrReturnCartons" style="margin-top:10px">Return Egg Cartons</button>'+(credits>=need?'<button class="btn wide" id="rrRedeemReward" style="margin-top:10px" '+(!reward||Number(reward.available)<1?'disabled':'')+'>Redeem 1 Free Dozen</button><p class="hint">'+(!reward?'Danielle needs to select the free-dozen egg item in Admin.':Number(reward.available)<1?'The reward egg item is currently sold out.':'Reward: '+safe(reward.itemName)+' · uses '+need+' carton credits')+'</p>':'')+'</div>';

      const q=document.getElementById('rrCartonQty');
      document.getElementById('rrCartonMinus').onclick=()=>q.value=Math.max(1,Math.floor(Number(q.value||1))-1);
      document.getElementById('rrCartonPlus').onclick=()=>q.value=Math.max(1,Math.floor(Number(q.value||1))+1);
      document.getElementById('rrReturnCartons').onclick=async()=>{
        const qty=Math.floor(Number(q.value||0));
        if(!qty||qty<1)return alert('Enter how many cartons you are returning.');
        if(!confirm('Return '+qty+' clean reusable carton'+(qty===1?'':'s')+' for '+member.name+'?'))return;
        const b=document.getElementById('rrReturnCartons');b.disabled=true;b.textContent='Saving…';
        try{
          const out=await api('carton_return',{name:document.getElementById('rrMemberName').value,last4:document.getElementById('rrMemberLast4').value,qty});
          draw(out.member);
          alert('Thank you! '+qty+' carton'+(qty===1?'':'s')+' added.');
        }catch(e){alert(e.message||'Carton return could not be saved.');b.disabled=false;b.textContent='Return Egg Cartons'}
      };
      const redeem=document.getElementById('rrRedeemReward');
      if(redeem)redeem.onclick=async()=>{
        if(!confirm('Use '+need+' carton credits for 1 free dozen?'))return;
        redeem.disabled=true;redeem.textContent='Redeeming…';
        try{
          const out=await api('reward_redeem',{name:document.getElementById('rrMemberName').value,last4:document.getElementById('rrMemberLast4').value});
          applyCatalog(out.catalog);
          draw(out.member);
          alert('Free dozen redeemed!');
        }catch(e){alert(e.message||'Reward could not be redeemed.');redeem.disabled=false;redeem.textContent='Redeem 1 Free Dozen'}
      };
    };

    document.getElementById('rrFindMember').onclick=async()=>{
      const name=document.getElementById('rrMemberName').value.trim();
      const last4=document.getElementById('rrMemberLast4').value.trim();
      const box=document.getElementById('rrMemberResult');
      if(!name)return alert('Enter your name.');
      box.innerHTML='<div class="empty">Looking up your account…</div>';
      try{
        const out=await api('member_lookup',{name,last4});
        draw(out.member);
      }catch(e){
        current=null;
        box.innerHTML='<div class="pickup-result"><strong>Account not found.</strong><p class="hint">Check your name and last four phone digits, or ask Danielle for help.</p></div>';
      }
    };
  }

  function setupPublicSignup(){
    const btn=document.getElementById('joinSubmit');
    if(!btn)return;

    btn.onclick=async()=>{
      const name=document.getElementById('joinName')?.value.trim()||'';
      const phone=document.getElementById('joinPhone')?.value.trim()||'';
      const email=(document.getElementById('joinEmail')?.value.trim()||'').toLowerCase();
      const pickupAlerts=!!document.getElementById('joinPickupAlerts')?.checked;
      const storeUpdates=!!document.getElementById('joinStoreUpdates')?.checked;
      const digits=phone.replace(/\D/g,'');

      if(!name)return alert('Please enter your name.');
      if(digits.length<7)return alert('Please enter a valid phone number.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return alert('Please enter a valid email address.');

      btn.disabled=true;
      const oldText=btn.textContent;
      btn.textContent='Joining…';

      try{
        const out=await api('member_signup',{name,phone,email,pickupAlerts,storeUpdates});
        const member=out.member||{};
        const form=document.querySelector('.join-form');
        if(form)form.classList.add('hidden');
        const result=document.getElementById('joinResult');
        if(result){
          result.innerHTML='<div class="pickup-result welcome-roost"><h2>Welcome to the Roost, '+safe(member.name||name)+'!</h2><div class="rsub">Carton Credits</div><div class="credit-number">0</div><p class="hint">Your Roost account is saved. Bring back clean, reusable dozen-egg cartons to earn credits toward a free dozen.</p><button class="btn primary wide" id="rrReturnNow">Return Cartons Now</button><button class="btn ghost wide" id="rrSignupDone">Done</button></div>';
          document.getElementById('rrSignupDone').onclick=()=>typeof home==='function'?home():location.reload();
          document.getElementById('rrReturnNow').onclick=()=>{
            if(typeof cartons==='function')cartons();
            setTimeout(()=>{
              const n=document.getElementById('rrMemberName');
              const l=document.getElementById('rrMemberLast4');
              if(n)n.value=member.name||name;
              if(l)l.value=digits.slice(-4);
              document.getElementById('rrFindMember')?.click();
            },80);
          };
        }
        cloudBadge('Roost membership saved');
        setTimeout(()=>cloudBadge('', 'hidden'),1800);
      }catch(e){
        alert(e.message||'Your Roost membership could not be saved. Please ask Danielle for help.');
        btn.disabled=false;
        btn.textContent=oldText;
      }
    };
  }

  function setupLiveUpdates(){
    if(liveChannel||!client)return;

    const syncNow=()=>{
      if(isAdminPage){
        if(!adminReady||saving||pendingSave||Date.now()<adminIgnoreRealtimeUntil)return;
        clearTimeout(liveTimer);
        liveTimer=setTimeout(()=>{
          loadAdmin().then(()=>setSaveStatus('Saved · Live')).catch(console.error);
        },250);
      }else{
        refreshCatalog().catch(console.error);
      }
    };

    liveChannel=client
      .channel('rise-roost-live-'+(isAdminPage?'admin':'register'))
      .on('postgres_changes',
        {event:'UPDATE',schema:'public',table:'store_revision_public',filter:'id=eq.1'},
        payload=>{
          const rev=Number(payload?.new?.revision||0);
          if(isAdminPage){
            if(rev<=adminRevision)return;
            if(saving||pendingSave||Date.now()<adminIgnoreRealtimeUntil){
              clearTimeout(liveTimer);
              liveTimer=setTimeout(syncNow,1200);
              return;
            }
            syncNow();
          }else if(rev>publicCatalogRevision){
            syncNow();
          }
        }
      )
      .subscribe(status=>{
        if(status==='SUBSCRIBED'){
          cloudBadge('Live updates connected');
          setTimeout(()=>cloudBadge('', 'hidden'),1400);
        }
      });

    window.addEventListener('online',syncNow);
    window.addEventListener('focus',syncNow);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')syncNow();
    });
  }

  function setupPublic(){
    const adminBtn=document.getElementById('adminBtn');
    if(adminBtn)adminBtn.onclick=()=>location.href=ADMIN_PATH;
    const adminScreen=document.getElementById('adminScreen');
    if(adminScreen)adminScreen.classList.add('hidden');
    const pin=document.getElementById('pinOverlay');if(pin)pin.classList.add('hidden');

    setupPublicPickup();
    setupPrivateCartonClub();
    setupPublicSignup();
    setupLiveUpdates();

    refreshCatalog().catch(e=>{
      console.error(e);
      cloudBadge('Cloud unavailable — showing cached items');
      setTimeout(()=>cloudBadge('', 'hidden'),3500);
    });

    // Realtime handles normal updates. This is only a fallback in case a
    // tablet temporarily loses its realtime connection.
    setInterval(()=>{
      if(document.visibilityState==='visible')refreshCatalog().catch(()=>{});
    },30000);
  }

  function authOverlay(){
    let o=document.getElementById('rrCloudAuth');
    if(o)return o;
    o=document.createElement('div');
    o.id='rrCloudAuth';
    o.style.cssText='position:fixed;inset:0;z-index:20000;background:#f4efe5;display:grid;place-items:center;padding:20px';
    o.innerHTML='<div class="modal" style="max-width:520px;background:white;border-radius:22px;padding:26px;box-shadow:0 12px 45px rgba(0,0,0,.14)"><h2 style="margin-top:0">Rise & Roost Admin</h2><p class="hint">Sign in with your approved admin email. Supabase will send a secure sign-in link.</p><div class="field" style="margin-top:14px"><label>Email</label><input id="rrCloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><button class="btn primary wide" id="rrCloudSendLink" style="margin-top:14px">Send Sign-In Link</button><div id="rrCloudAuthMsg" class="hint" style="margin-top:12px"></div><a href="'+REGISTER_PATH+'" class="btn ghost wide" style="margin-top:12px;text-decoration:none;text-align:center">Back to Register</a></div>';
    document.body.appendChild(o);
    document.getElementById('rrCloudSendLink').onclick=async()=>{
      const email=document.getElementById('rrCloudEmail').value.trim();
      const msg=document.getElementById('rrCloudAuthMsg');
      if(!email)return msg.textContent='Enter your email address.';
      const b=document.getElementById('rrCloudSendLink');b.disabled=true;b.textContent='Sending…';
      const redirect=location.origin+location.pathname;
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
      if(error){msg.textContent=error.message;b.disabled=false;b.textContent='Send Sign-In Link';return}
      msg.innerHTML='<strong>Check your email.</strong> Open the Rise & Roost sign-in link on this device.';
      b.textContent='Link Sent';
    };
    return o;
  }

  function hasUsefulLocalData(d){
    return !!((d?.items?.length||0)||(d?.customers?.length||0)||(d?.sales?.length||0)||(d?.pickups?.length||0));
  }

  function remoteEmpty(d){
    return !((d?.items?.length||0)||(d?.customers?.length||0)||(d?.sales?.length||0)||(d?.pickups?.length||0));
  }

  function installAdminStatus(email){
    const pinBtn=document.getElementById('changePin');
    if(pinBtn?.closest('.card'))pinBtn.closest('.card').style.display='none';
    const settings=document.getElementById('settingsTab');
    if(settings&&!document.getElementById('rrCloudAdminCard')){
      const card=document.createElement('div');
      card.id='rrCloudAdminCard';
      card.className='card section';
      card.innerHTML='<div class="section-head"><h2>Cloud Database</h2><span class="badge on">Connected</span></div><p class="hint">Signed in as <strong>'+safe(email||'Admin')+'</strong>. Inventory, members, sales, pickups and settings are stored in Supabase and shared across devices.</p><button class="btn" id="rrCloudSignOut">Sign Out</button><div id="rrCloudSaveStatus" class="hint" style="margin-top:8px">Saved</div>';
      settings.insertBefore(card,settings.firstChild);
      document.getElementById('rrCloudSignOut').onclick=async()=>{await client.auth.signOut();location.reload()};
    }
  }

  function setSaveStatus(text){
    const e=document.getElementById('rrCloudSaveStatus');if(e)e.textContent=text;
  }

  async function loadAdmin(){
    const localBefore=clone(data);
    const out=await api('admin_load',{},true);
    adminRevision=Number(out.revision||0);

    if(remoteEmpty(out.data)&&hasUsefulLocalData(localBefore)){
      cloudBadge('Moving existing register data to the cloud…');
      const moved=await api('admin_save',{revision:adminRevision,data:localBefore},true);
      adminRevision=Number(moved.revision||adminRevision);
      const fresh=await api('admin_load',{},true);
      adminRevision=Number(fresh.revision||adminRevision);
      out.data=fresh.data;
      out.admin=fresh.admin;
    }

    suppressSave=true;
    data=migrate(out.data||{});
    data.customers=Array.isArray(out.data?.customers)?out.data.customers:[];
    data.cartonReturns=Array.isArray(out.data?.cartonReturns)?out.data.cartonReturns:[];
    data.cartonRewards=Array.isArray(out.data?.cartonRewards)?out.data.cartonRewards:[];
    data.cartonSettings=out.data?.cartonSettings||{cartonsPerFreeDozen:12,rewardItemId:''};
    data.settings=out.data?.settings||{paymentQrs:{}};
    if(basePersist)basePersist();
    if(typeof renderAll==='function')renderAll();
    suppressSave=false;

    adminReady=true;
    const pin=document.getElementById('pinOverlay');if(pin)pin.classList.add('hidden');
    document.getElementById('adminScreen')?.classList.remove('hidden');
    document.getElementById('rrCloudAuth')?.remove();
    installAdminStatus(out.admin?.email);

    if(basePersist){
      persist=function(){
        basePersist();
        if(adminReady&&!suppressSave)queueAdminSave();
      };
    }

    cloudBadge('Cloud database connected');
    setTimeout(()=>cloudBadge('', 'hidden'),2000);
  }

  function queueAdminSave(){
    pendingSave=true;
    setSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer=setTimeout(flushAdminSave,700);
  }

  async function flushAdminSave(){
    if(saving||!pendingSave)return;
    pendingSave=false;
    saving=true;
    const snapshot=clone(data);
    const revisionAtStart=adminRevision;
    try{
      adminIgnoreRealtimeUntil=Date.now()+2500;
      const out=await api('admin_save',{revision:revisionAtStart,data:snapshot},true);
      adminRevision=Number(out.revision||adminRevision);
      adminIgnoreRealtimeUntil=Date.now()+1200;
      setSaveStatus('Saved');
    }catch(e){
      if(e.conflict||e.status===409){
        setSaveStatus('Reloading latest store data…');
        alert('The store changed on another device while you were editing. I reloaded the newest data so a sale is not overwritten. Please repeat your last change.');
        await loadAdmin();
      }else{
        console.error(e);
        setSaveStatus('Not saved — connection problem');
        alert('Cloud save failed. Your change is still on this device, but it has not reached the shared database yet. Check the internet connection and try again.');
        pendingSave=true;
      }
    }finally{
      saving=false;
      if(pendingSave)setTimeout(flushAdminSave,900);
    }
  }

  async function setupAdmin(){
    const adminScreen=document.getElementById('adminScreen');
    if(adminScreen)adminScreen.classList.add('hidden');
    const exit=document.getElementById('exitAdmin');
    if(exit)exit.onclick=()=>location.href=REGISTER_PATH;
    const pin=document.getElementById('pinOverlay');if(pin)pin.classList.add('hidden');
    authOverlay();

    const {data:{session}}=await client.auth.getSession();
    if(session){
      try{await loadAdmin()}catch(e){
        console.error(e);
        if(e.status===401){
          await client.auth.signOut();
          const msg=document.getElementById('rrCloudAuthMsg');if(msg)msg.textContent='This email is not approved for Rise & Roost Admin.';
        }else{
          const msg=document.getElementById('rrCloudAuthMsg');if(msg)msg.textContent='Could not connect to the cloud database. '+(e.message||'');
        }
      }
    }

    setupLiveUpdates();

    client.auth.onAuthStateChange((_event,newSession)=>{
      if(newSession&&!adminReady)setTimeout(()=>loadAdmin().catch(console.error),50);
    });
  }

  async function start(){
    if(!sbLib||typeof sbLib.createClient!=='function'){
      console.error('Supabase library did not load.');
      cloudBadge('Cloud library unavailable');
      return;
    }
    client=sbLib.createClient(PROJECT_URL,PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });

    window.RRCloud={api,checkout,refreshCatalog,client,get revision(){return publicCatalogRevision}};

    if(isAdminPage)await setupAdmin();
    else setupPublic();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,80),{once:true});
  else setTimeout(start,80);
})();