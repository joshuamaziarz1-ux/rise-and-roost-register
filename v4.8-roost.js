(()=>{
  const TEST=!!window.__RR_TEST_MODE;
  const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
  const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
  const SESSION_MS=2*60*1000;
  let sessionTimer=null;

  const customers=()=>Array.isArray(data?.customers)?data.customers:[];
  const currentMember=()=>customers().find(c=>c.id===sessionStorage.getItem(MEMBER_KEY))||null;
  const normName=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const phoneDigits=s=>{
    let d=String(s||'').replace(/\D/g,'');
    if(d.length===11&&d[0]==='1')d=d.slice(1);
    return d;
  };
  const validPhone=s=>phoneDigits(s).length===10;
  const formatPhone=s=>{
    const d=phoneDigits(s);
    return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:String(s||'');
  };
  const phoneOwner=(phone,excludeId='')=>{
    const d=phoneDigits(phone); if(!d)return null;
    return customers().find(c=>c.id!==excludeId&&phoneDigits(c.phone)===d)||null;
  };
  const memberSales=c=>(data.sales||[]).filter(s=>!s.voided&&(s.customerId===c.id||(s.customerType==='roost-member'&&normName(s.customerName)===normName(c.name))));
  const memberPickups=c=>(data.pickups||[]).filter(p=>p.customerId===c.id||phoneDigits(p.phone)===phoneDigits(c.phone)||normName(p.customerName)===normName(c.name));
  const legacyReturns=c=>(data.cartonReturns||[]).filter(r=>r.customerId===c.id||normName(r.customerName)===normName(c.name));
  const roostReturns=c=>(data.roostReturns||[]).filter(r=>r.customerId===c.id);
  const credits=c=>Math.max(0,Number(c.roostCredits??c.cartonCredits??0));

  function ensureData(){
    data.customers=Array.isArray(data.customers)?data.customers:[];
    data.roostReturns=Array.isArray(data.roostReturns)?data.roostReturns:[];
    data.roostReturnTypes=Array.isArray(data.roostReturnTypes)&&data.roostReturnTypes.length?data.roostReturnTypes:[
      {id:'egg-carton',name:'Egg Carton',credit:1,active:true},
      {id:'jar',name:'Jar',credit:1,active:true},
      {id:'bottle',name:'Bottle',credit:1,active:true}
    ];
    data.customers.forEach(c=>{
      c.phone=String(c.phone||'');
      const old=Math.max(0,Number(c.cartonCredits||0));
      if(!Number.isFinite(Number(c.roostCredits)))c.roostCredits=old;
      if(Number(c.roostCredits)<old)c.roostCredits=old;
      if(old<Number(c.roostCredits))c.cartonCredits=Number(c.roostCredits);
    });
    persist();
  }

  function ensureGuest(){
    if(!currentMember()&&sessionStorage.getItem(GUEST_KEY)!=='1')sessionStorage.setItem(GUEST_KEY,'1');
  }

  function styles(){
    if(document.getElementById('rrRoostV2Styles'))return;
    const s=document.createElement('style');s.id='rrRoostV2Styles';s.textContent=`
      #memberCheckin,#memberShopBanner{display:none!important}
      .rr-roost-overlay .modal{width:min(940px,calc(100% - 24px));max-width:940px;max-height:calc(100vh - 24px);overflow:auto;background:linear-gradient(180deg,#fffaf2 0%,#f8f1e6 100%);border:2px solid #c7a574;border-radius:24px;box-shadow:0 24px 70px rgba(45,34,23,.28);padding:0}
      .rr-roost-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;background:#f0e4d2;border-bottom:1px solid #d8c5a6}
      .rr-roost-brand{display:flex;align-items:center;gap:12px;min-width:0}
      .rr-roost-brand img{width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.12)}
      .rr-roost-brand-copy{min-width:0}.rr-roost-brand-copy h2{margin:0;font-size:1.55rem;color:#2f2b25}
      .rr-roost-brand-copy .rr-roost-brand-sub{font-size:.78rem;font-weight:900;letter-spacing:.08em;color:#8d633d;text-transform:uppercase;margin-bottom:2px}
      .rr-roost-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .rr-roost-about-btn{min-height:44px;border:1px solid #a87b4e;background:#fff7eb;color:#6d482b;border-radius:12px;padding:0 15px;font-weight:950;letter-spacing:.01em}
      .rr-roost-body{padding:24px 26px 22px}
      .rr-roost-auth{width:min(640px,100%);margin:0 auto;display:grid;gap:16px;background:#fff;border:1px solid #dfd2be;border-radius:20px;padding:22px;box-shadow:0 8px 24px rgba(77,54,32,.07)}
      .rr-roost-field{display:grid;gap:7px}.rr-roost-field label{font-weight:950;color:#322b24}
      .rr-roost-field input{width:100%;min-height:60px;border:2px solid #cdbda6;border-radius:14px;padding:0 15px;font-size:1.1rem;background:#fffdf9;transition:border-color .15s,box-shadow .15s}
      .rr-roost-field input:focus{outline:none;border-color:#58705a;box-shadow:0 0 0 3px rgba(88,112,90,.12)}
      .rr-roost-auth .btn{min-height:58px;font-weight:950}
      .rr-roost-auth .btn.primary{background:#4e654c}
      .rr-roost-divider{text-align:center;color:#786f64;font-weight:850;margin:2px 0;position:relative}
      .rr-roost-divider:before,.rr-roost-divider:after{content:'';display:inline-block;width:22%;height:1px;background:#d7cab8;vertical-align:middle;margin:0 10px}
      .rr-roost-about-overlay{z-index:10040;background:rgba(43,34,25,.48);backdrop-filter:blur(3px)}
      .rr-roost-about{width:min(560px,calc(100% - 28px))!important;max-width:560px!important;text-align:center;padding:28px 28px 24px!important;background:linear-gradient(180deg,#fffaf2,#f7efe2)!important;border:2px solid #b58b5b!important;border-radius:24px!important}
      .rr-roost-about img{width:86px;height:86px;border-radius:50%;object-fit:cover;margin:0 auto 12px;border:3px solid #fff;box-shadow:0 5px 16px rgba(0,0,0,.12)}
      .rr-roost-about h2{margin:0 0 10px;color:#3b2e23;font-size:1.65rem}
      .rr-roost-about p{margin:0 auto 12px;max-width:480px;line-height:1.5;color:#5f5347;font-size:1rem}
      .rr-roost-about-points{display:grid;gap:8px;text-align:left;margin:16px auto 18px;max-width:460px}
      .rr-roost-about-point{background:#fff;border:1px solid #ded0bc;border-radius:12px;padding:10px 12px;font-weight:800;color:#463c33}
      .rr-roost-about-close{min-height:52px;font-weight:950}
      .rr-shop-memberbar{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin:0 0 12px;background:#fff}
      .rr-shop-memberbar strong{font-size:1.12rem}.rr-shop-memberbar .btn{min-width:130px}
      .rr-shop-memberbar.rr-guest{background:#fbf7ef;border-color:#d8c7ad}
      .rr-shop-memberbar.rr-guest .rsub{max-width:620px}
      .rr-roost-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .rr-roost-section{border:1px solid var(--line);border-radius:16px;padding:16px;background:#fff}
      .rr-roost-section h3{margin:0 0 12px}.rr-roost-credit{font-size:2.8rem;font-weight:950;color:var(--rrgreen);line-height:1}
      .rr-profile-actions,.rr-roost-bottom-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      .rr-return-list{display:grid;gap:10px}.rr-return-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:13px;padding:12px}
      .rr-return-stepper{display:grid;grid-template-columns:48px 52px 48px;align-items:center;text-align:center}
      .rr-return-stepper button{height:48px;border:0;border-radius:11px;background:#efe8dc;font-size:1.5rem;font-weight:900}
      .rr-return-stepper strong{font-size:1.25rem}
      .rr-history{grid-column:1/-1}.rr-history-list{display:grid;gap:8px}
      .rr-history-row{display:grid;grid-template-columns:130px 1fr auto;gap:12px;align-items:start;padding:11px 0;border-bottom:1px solid var(--line)}
      .rr-history-row:last-child{border-bottom:0}.rr-history-date{color:var(--muted);font-size:.85rem}.rr-history-total{font-weight:950}
      .rr-pickup-row{border:1px solid var(--line);border-radius:13px;padding:12px;margin-top:8px}
      .rr-pickup-top{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .rr-session-note{font-size:.82rem;color:var(--muted);margin-top:10px}
      .rr-roost-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.rr-roost-tabs .btn{min-height:46px}
      .rr-roost-status{min-height:20px;font-weight:850;color:#8a322b}
      .rr-roost-notice-wrap{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(43,34,25,.38);backdrop-filter:blur(2px)}
      .rr-roost-notice-wrap.hidden{display:none!important}
      .rr-roost-notice{width:min(520px,calc(100% - 28px));background:#f7f1e6;border:2px solid #a87949;border-radius:22px;box-shadow:0 18px 50px rgba(44,33,22,.28);padding:24px 26px;text-align:center}
      .rr-roost-notice h3{margin:0 0 8px;font-size:1.5rem;color:#3e2e20}
      .rr-roost-notice p{margin:0;color:#5e5044;font-size:1.05rem;line-height:1.45}
      .rr-roost-notice.success{border-color:#5f7c61}
      .rr-roost-notice.success h3{color:#35563b}
      .rr-roost-notice.warn{border-color:#b18a52}
      .rr-roost-notice.warn h3{color:#765629}
      .rr-roost-notice-bar{height:4px;border-radius:999px;background:#d8c7ad;overflow:hidden;margin-top:18px}
      .rr-roost-notice-bar span{display:block;height:100%;width:100%;background:#5f7c61;transform-origin:left center;animation:rrNoticeDrain 3s linear forwards}
      .rr-roost-notice.warn .rr-roost-notice-bar span{background:#b18a52}
      @keyframes rrNoticeDrain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
      @media(max-width:720px){.rr-roost-grid{grid-template-columns:1fr}.rr-history{grid-column:auto}.rr-roost-auth-actions{grid-template-columns:1fr}.rr-shop-memberbar{align-items:flex-start;flex-direction:column}.rr-history-row{grid-template-columns:1fr}.rr-history-total{justify-self:start}.rr-roost-head{align-items:flex-start}.rr-roost-brand img{width:50px;height:50px}.rr-roost-head-actions{gap:6px}.rr-roost-about-btn{font-size:.82rem;padding:0 10px}.rr-roost-body{padding:18px}.rr-roost-auth{padding:18px}}
      @media(orientation:landscape) and (min-width:700px) and (max-width:1400px){.rr-roost-overlay .modal{max-height:calc(100vh - 16px)}.rr-roost-section{padding:14px}.rr-history-row{grid-template-columns:120px 1fr auto}}
    `;document.head.appendChild(s);
  }

  function setMember(c){
    sessionStorage.setItem(MEMBER_KEY,c.id);
    sessionStorage.removeItem(GUEST_KEY);
    resetTimer();
    renderShopBanner();
  }
  function logout(goHome=true){
    sessionStorage.removeItem(MEMBER_KEY);
    sessionStorage.setItem(GUEST_KEY,'1');
    if(sessionTimer){clearTimeout(sessionTimer);sessionTimer=null}
    renderShopBanner();
    closeRoost();
    if(goHome){
      cart={};
      try{renderCart()}catch(e){}
      document.getElementById('shopView')?.classList.add('hidden');
      document.getElementById('kioskHome')?.classList.remove('hidden');
    }
  }
  function resetTimer(){
    if(!currentMember())return;
    if(sessionTimer)clearTimeout(sessionTimer);
    sessionTimer=setTimeout(()=>logout(true),SESSION_MS);
  }

  function ensureOverlay(){
    if(document.getElementById('rrRoostV2Overlay'))return;
    const o=document.createElement('div');o.id='rrRoostV2Overlay';o.className='overlay hidden rr-roost-overlay';
    o.innerHTML=`<div class="modal"><div class="rr-roost-head"><div class="rr-roost-brand"><img src="assets/rise-roost-logo.webp?v=4.10.2" alt="Rise & Roost"><div class="rr-roost-brand-copy"><div class="rr-roost-brand-sub">Rise & Roost</div><h2 id="rrRoostTitle">The Roost</h2><div class="rsub" id="rrRoostSub"></div></div></div><div class="rr-roost-head-actions"><button class="rr-roost-about-btn" id="rrRoostAbout" type="button">WHAT IS THE ROOST?</button><button class="btn ghost" id="rrRoostClose">Close</button></div></div><div id="rrRoostBody" class="rr-roost-body"></div></div>`;
    document.body.appendChild(o);
    document.getElementById('rrRoostClose').onclick=closeRoost;
    document.getElementById('rrRoostAbout').onclick=openRoostAbout;
    o.addEventListener('click',e=>{if(e.target===o)closeRoost()});
  }
  function closeRoost(){document.getElementById('rrRoostV2Overlay')?.classList.add('hidden')}

  function ensureRoostAbout(){
    if(document.getElementById('rrRoostAboutOverlay'))return;
    const o=document.createElement('div');
    o.id='rrRoostAboutOverlay';
    o.className='overlay hidden rr-roost-about-overlay';
    o.innerHTML=`<div class="modal rr-roost-about">
      <img src="assets/rise-roost-logo.webp?v=4.10.2" alt="Rise & Roost">
      <h2>Welcome to The Roost</h2>
      <p>The Roost is our simple member program for Rise & Roost customers.</p>
      <div class="rr-roost-about-points">
        <div class="rr-roost-about-point">Keep up with special items, limited products, seasonal offerings, and sales.</div>
        <div class="rr-roost-about-point">Your purchases stay connected to your account.</div>
        <div class="rr-roost-about-point">Return reusable egg cartons, jars, and bottles to earn Roost Credits.</div>
        <div class="rr-roost-about-point">View your purchase history, returns, credits, and pickup orders anytime.</div>
      </div>
      <p>Joining only takes your name and phone number. No app, card, or password needed.</p>
      <button class="btn primary wide rr-roost-about-close" id="rrRoostAboutClose">GOT IT</button>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('rrRoostAboutClose').onclick=()=>o.classList.add('hidden');
    o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
  }
  function openRoostAbout(){
    ensureRoostAbout();
    document.getElementById('rrRoostAboutOverlay').classList.remove('hidden');
  }

  let noticeTimer=null;
  function showRoostNotice(title,message,tone='success'){
    let wrap=document.getElementById('rrRoostNoticeWrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='rrRoostNoticeWrap';
      wrap.className='rr-roost-notice-wrap hidden';
      wrap.innerHTML='<div class="rr-roost-notice"><h3 id="rrRoostNoticeTitle"></h3><p id="rrRoostNoticeMessage"></p><div class="rr-roost-notice-bar"><span></span></div></div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click',()=>{wrap.classList.add('hidden');if(noticeTimer)clearTimeout(noticeTimer)});
    }
    const card=wrap.querySelector('.rr-roost-notice');
    card.className='rr-roost-notice '+tone;
    document.getElementById('rrRoostNoticeTitle').textContent=title;
    document.getElementById('rrRoostNoticeMessage').textContent=message;
    const bar=wrap.querySelector('.rr-roost-notice-bar');
    bar.innerHTML='<span></span>';
    wrap.classList.remove('hidden');
    if(noticeTimer)clearTimeout(noticeTimer);
    noticeTimer=setTimeout(()=>wrap.classList.add('hidden'),3000);
  }

  function openRoost(){
    ensureData();ensureOverlay();
    const c=currentMember();
    if(c)renderPortal(c);else renderAuth();
    document.getElementById('rrRoostV2Overlay').classList.remove('hidden');
    resetTimer();
  }

  function renderAuth(){
    document.getElementById('rrRoostTitle').textContent='The Roost';
    document.getElementById('rrRoostSub').textContent='';
    const body=document.getElementById('rrRoostBody');
    body.innerHTML=`<div class="rr-roost-auth">
      <div class="rr-roost-field"><label>Phone Number</label><input id="rrPhoneSignIn" type="tel" inputmode="tel" autocomplete="tel" placeholder="(260) 555-1234"></div>
      <div id="rrPhoneStatus" class="rr-roost-status"></div>
      <button class="btn primary wide" id="rrPhoneGo">SIGN IN & SHOP</button>
      <div class="rr-roost-divider">Not a member yet?</div>
      <button class="btn wide" id="rrJoinRoost">JOIN THE ROOST</button>
    </div>`;
    const go=()=>signIn(document.getElementById('rrPhoneSignIn').value);
    document.getElementById('rrPhoneGo').onclick=go;
    document.getElementById('rrPhoneSignIn').onkeydown=e=>{if(e.key==='Enter')go()};
    document.getElementById('rrJoinRoost').onclick=renderSignup;
    setTimeout(()=>document.getElementById('rrPhoneSignIn')?.focus(),40);
  }

  async function signIn(phone){
    const status=document.getElementById('rrPhoneStatus');
    if(!validPhone(phone)){status.textContent='Enter a 10-digit phone number.';return}
    const btn=document.getElementById('rrPhoneGo');
    if(btn){btn.disabled=true;btn.textContent='SIGNING IN…'}
    status.textContent='';
    try{
      if(window.RRCloud&&typeof window.RRCloud.api==='function'){
        const out=await window.RRCloud.api('member_lookup_phone',{phone:phoneDigits(phone)});
        const m=out.member;
        data.customers=[m];
        persist();
        setMember(m);
        closeRoost();
        goShop();
        return;
      }
      const d=phoneDigits(phone);
      const matches=customers().filter(c=>phoneDigits(c.phone)===d);
      if(matches.length!==1){status.textContent=matches.length?'More than one account uses that number. Please ask Danielle for help.':'No Roost account was found with that number.';return}
      setMember(matches[0]);
      closeRoost();
      goShop();
    }catch(e){
      status.textContent=(e&&e.message)||'Could not sign in right now.';
    }finally{
      if(btn){btn.disabled=false;btn.textContent='SIGN IN & SHOP'}
    }
  }

  function openSignup(){
    ensureData();ensureOverlay();renderSignup();
    document.getElementById('rrRoostV2Overlay').classList.remove('hidden');
  }

  function renderSignup(){
    document.getElementById('rrRoostTitle').textContent='Join The Roost';
    document.getElementById('rrRoostSub').textContent='';
    const body=document.getElementById('rrRoostBody');
    body.innerHTML=`<div class="rr-roost-auth">
      <div class="rr-roost-field"><label>Name</label><input id="rrJoinName" autocomplete="name" placeholder="Your name"></div>
      <div class="rr-roost-field"><label>Phone Number</label><input id="rrJoinPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(260) 555-1234"></div>
      <div id="rrJoinStatus" class="rr-roost-status"></div>
      <button class="btn primary wide" id="rrJoinSubmit">CREATE ACCOUNT & SHOP</button>
      <button class="btn ghost wide" id="rrJoinBack">BACK TO SIGN IN</button>
    </div>`;
    document.getElementById('rrJoinBack').onclick=renderAuth;
    document.getElementById('rrJoinSubmit').onclick=signup;
    setTimeout(()=>document.getElementById('rrJoinName')?.focus(),40);
  }
  async function signup(){
    const name=document.getElementById('rrJoinName').value.trim();
    const phone=document.getElementById('rrJoinPhone').value;
    const status=document.getElementById('rrJoinStatus');
    const btn=document.getElementById('rrJoinSubmit');
    if(!name){status.textContent='Enter your name.';return}
    if(!validPhone(phone)){status.textContent='Enter a 10-digit phone number.';return}
    status.textContent='';
    if(btn){btn.disabled=true;btn.textContent='CREATING ACCOUNT…'}
    try{
      if(window.RRCloud&&typeof window.RRCloud.api==='function'){
        const out=await window.RRCloud.api('member_signup',{
          name,
          phone:phoneDigits(phone),
          email:'',
          pickupAlerts:false,
          storeUpdates:false
        });
        const m=out.member;
        data.customers=[m];
        persist();
        setMember(m);
        closeRoost();
        goShop();
        return;
      }
      const existing=phoneOwner(phone);
      if(existing){status.textContent='That phone number already has a Roost account. Go back and sign in.';return}
      const local={id:uid('customer'),name,phone:phoneDigits(phone),cartonCredits:0,roostCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      data.customers.push(local);persist();setMember(local);closeRoost();goShop();
    }catch(e){
      status.textContent=(e&&e.message)||'Could not create your Roost account right now.';
    }finally{
      if(btn){btn.disabled=false;btn.textContent='CREATE ACCOUNT & SHOP'}
    }
  }

  function goShop(){
    ensureGuest();
    const b=document.getElementById('goShop');
    if(b){b.click();setTimeout(renderShopBanner,30)}
    else{
      document.getElementById('kioskHome')?.classList.add('hidden');
      document.getElementById('shopView')?.classList.remove('hidden');
      renderShopBanner();
    }
  }

  function ensureShopBanner(){
    const view=document.getElementById('shopView');
    const productArea=document.getElementById('productArea');
    const shopCard=productArea?.closest('.shop')||view?.querySelector('.shop');
    if(!view||!shopCard)return;
    let b=document.getElementById('rrShopMemberBar');
    if(!b){
      b=document.createElement('div');
      b.id='rrShopMemberBar';
      b.className='rr-shop-memberbar hidden';
    }
    const shopHead=shopCard.querySelector('.rr48-shop-head');
    const target=shopHead||shopCard.firstElementChild;
    if(b.parentElement!==shopCard || b.nextElementSibling!==target){
      shopCard.insertBefore(b,target);
    }
  }
  function renderShopBanner(){
    ensureShopBanner();
    const b=document.getElementById('rrShopMemberBar');if(!b)return;
    const c=currentMember();
    b.classList.remove('hidden');
    b.style.display='flex';
    if(!c){
      b.classList.remove('hidden');
      b.classList.add('rr-guest');
      b.innerHTML=`<div><strong>Welcome, Guest</strong><div class="rsub">Join The Roost to save your purchases and earn return credits.</div></div><button class="btn" id="rrShopJoinBtn">JOIN THE ROOST</button>`;
      document.getElementById('rrShopJoinBtn').onclick=openSignup;
      return;
    }
    b.classList.remove('rr-guest');
    b.innerHTML=`<div><strong>Welcome, ${esc(c.name)}</strong></div><button class="btn primary" id="rrShopRoostBtn">MY ROOST</button>`;
    document.getElementById('rrShopRoostBtn').onclick=openRoost;
  }

  function renderPortal(c){
    document.getElementById('rrRoostTitle').textContent='My Roost';
    document.getElementById('rrRoostSub').textContent='';
    const body=document.getElementById('rrRoostBody');
    body.innerHTML=`<div class="rr-roost-grid">
      <section class="rr-roost-section">
        <h3>Account</h3>
        <div class="rr-roost-field"><label>Name</label><input id="rrProfileName" value="${esc(c.name)}"></div>
        <div class="rr-roost-field" style="margin-top:10px"><label>Phone Number</label><input id="rrProfilePhone" type="tel" inputmode="tel" value="${esc(formatPhone(c.phone))}"></div>
        <div id="rrProfileStatus" class="rr-roost-status"></div>
        <div class="rr-profile-actions"><button class="btn primary" id="rrSaveProfile">SAVE CHANGES</button></div>
      </section>
      <section class="rr-roost-section">
        <h3>Returns & Credits</h3>
        <div class="rsub">Available Roost Credits</div>
        <div class="rr-roost-credit" id="rrCreditCount">${credits(c)}</div>
        
        <div id="rrReturnList" class="rr-return-list" style="margin-top:12px"></div>
        <button class="btn primary wide" id="rrSubmitReturns" style="margin-top:12px">ADD RETURNS</button>
      </section>
      <section class="rr-roost-section">
        <h3>Pickup Orders</h3>
        <div id="rrPickupList"></div>
      </section>
      <section class="rr-roost-section">
        <h3>Session</h3>
        <p class="hint">Auto sign-out after 2 minutes of inactivity.</p>
        <button class="btn danger wide" id="rrLogout">LOG OUT</button>
      </section>
      <section class="rr-roost-section rr-history">
        <h3>Purchase & Return History</h3>
        <div id="rrHistoryList"></div>
      </section>
    </div>`;
    document.getElementById('rrSaveProfile').onclick=()=>saveProfile(c);
    document.getElementById('rrLogout').onclick=()=>logout(true);
    renderReturns(c);renderPickups(c);renderHistory(c);resetTimer();
  }

  function saveProfile(c){
    const name=document.getElementById('rrProfileName').value.trim();
    const phone=document.getElementById('rrProfilePhone').value;
    const status=document.getElementById('rrProfileStatus');
    if(!name){status.textContent='Name cannot be blank.';return}
    if(!validPhone(phone)){status.textContent='Enter a 10-digit phone number.';return}
    const owner=phoneOwner(phone,c.id);
    if(owner){status.textContent='That phone number is already used by another My Roost account.';return}
    const oldName=c.name;
    c.name=name;c.phone=phoneDigits(phone);c.updatedAt=new Date().toISOString();
    (data.pickups||[]).forEach(p=>{if(p.customerId===c.id||normName(p.customerName)===normName(oldName)){p.customerId=c.id;p.customerName=c.name;p.phone=c.phone}});
    persist();status.style.color='#35613a';status.textContent='Saved.';renderShopBanner();renderHistory(c);resetTimer();
  }

  const qtyState={};
  function renderReturns(c){
    const box=document.getElementById('rrReturnList');if(!box)return;
    data.roostReturnTypes.filter(x=>x.active!==false).forEach(t=>{if(!(t.id in qtyState))qtyState[t.id]=0});
    box.innerHTML=data.roostReturnTypes.filter(x=>x.active!==false).map(t=>`<div class="rr-return-row"><div><strong>${esc(t.name)}</strong><div class="rsub">${Number(t.credit||1)} credit${Number(t.credit||1)===1?'':'s'} each</div></div><div class="rr-return-stepper"><button type="button" data-ret-minus="${t.id}">−</button><strong id="rrRetQty_${t.id}">${qtyState[t.id]||0}</strong><button type="button" data-ret-plus="${t.id}">+</button></div></div>`).join('');
    box.querySelectorAll('[data-ret-minus]').forEach(b=>b.onclick=()=>changeReturnQty(b.dataset.retMinus,-1));
    box.querySelectorAll('[data-ret-plus]').forEach(b=>b.onclick=()=>changeReturnQty(b.dataset.retPlus,1));
    document.getElementById('rrSubmitReturns').onclick=()=>submitReturns(c);
  }
  function changeReturnQty(id,d){qtyState[id]=Math.max(0,Number(qtyState[id]||0)+d);const el=document.getElementById('rrRetQty_'+id);if(el)el.textContent=qtyState[id];resetTimer()}
  function submitReturns(c){
    const rows=data.roostReturnTypes.filter(t=>t.active!==false&&Number(qtyState[t.id]||0)>0);
    if(!rows.length){showRoostNotice('Nothing Selected','Choose at least one item you are returning.','warn');return}
    let totalCredits=0,totalQty=0;
    rows.forEach(t=>{
      const qty=Number(qtyState[t.id]||0),earned=qty*Number(t.credit||1);
      totalQty+=qty;totalCredits+=earned;
      data.roostReturns.unshift({id:uid('return'),date:new Date().toISOString(),customerId:c.id,customerName:c.name,typeId:t.id,typeName:t.name,qty,credits:earned});
      qtyState[t.id]=0;
    });
    c.roostCredits=credits(c)+totalCredits;
    c.cartonCredits=c.roostCredits;
    c.updatedAt=new Date().toISOString();
    if(data.roostReturns.length>2500)data.roostReturns.length=2500;
    persist();
    document.getElementById('rrCreditCount').textContent=c.roostCredits;
    renderReturns(c);renderHistory(c);
    showRoostNotice('Returns Added',`${totalQty} return${totalQty===1?'':'s'} added. You earned ${totalCredits} Roost Credit${totalCredits===1?'':'s'}.`,'success');
    resetTimer();
  }

  function renderPickups(c){
    const box=document.getElementById('rrPickupList');if(!box)return;
    const list=memberPickups(c).sort((a,b)=>new Date(b.created)-new Date(a.created));
    if(!list.length){box.innerHTML='<div class="empty">No pickup orders on this account.</div>';return}
    box.innerHTML=list.slice(0,8).map(p=>{
      const total=(p.items||[]).reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||0),0);
      const items=(p.items||[]).map(i=>`${i.qty}× ${esc(i.itemName)}`).join(', ');
      return `<div class="rr-pickup-row"><div class="rr-pickup-top"><strong>${p.status==='ready'?'Ready for Pickup':p.status==='waiting'?'Waiting':p.status==='picked'?'Picked Up':'Cancelled'}</strong><span class="badge ${p.status==='ready'?'on':''}">${esc(p.status)}</span></div><div class="rsub" style="margin-top:5px">${items}</div><div style="margin-top:7px"><strong>${money(total)}</strong>${p.paid?' · Paid':''}</div></div>`
    }).join('');
  }

  function renderHistory(c){
    const box=document.getElementById('rrHistoryList');if(!box)return;
    const events=[];
    memberSales(c).forEach(s=>events.push({date:s.date,type:'Purchase',text:(s.items||[]).map(i=>`${i.qty}× ${i.itemName}`).join(', '),total:money(s.total)}));
    legacyReturns(c).forEach(r=>events.push({date:r.date,type:'Return',text:`${Number(r.qty||0)} egg carton${Number(r.qty||0)===1?'':'s'} returned`,total:`+${Number(r.qty||0)} credit${Number(r.qty||0)===1?'':'s'}`}));
    roostReturns(c).forEach(r=>events.push({date:r.date,type:'Return',text:`${Number(r.qty||0)}× ${r.typeName}`,total:`+${Number(r.credits||0)} credit${Number(r.credits||0)===1?'':'s'}`}));
    events.sort((a,b)=>new Date(b.date)-new Date(a.date));
    box.innerHTML=events.length?'<div class="rr-history-list">'+events.slice(0,50).map(e=>{const d=new Date(e.date);return `<div class="rr-history-row"><div class="rr-history-date">${d.toLocaleDateString()}<br>${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div><div><strong>${esc(e.type)}</strong><div class="rsub">${esc(e.text)}</div></div><div class="rr-history-total">${esc(e.total)}</div></div>`}).join('')+'</div>':'<div class="empty">No purchases or returns yet.</div>';
  }

  function wireClearOrder(){
    const clear=document.getElementById('clearBtn');
    if(!clear)return false;
    clear.onclick=()=>{
      cart={};
      try{renderCart()}catch(e){}
      const keep=[...document.querySelectorAll('button,a')].find(el=>String(el.textContent||'').trim().toUpperCase().includes('KEEP SHOPPING'));
      if(keep){keep.click()}
      else{
        document.getElementById('shopView')?.classList.remove('hidden');
        document.querySelector('#shopView .shop')?.classList.remove('hidden');
        document.querySelector('#shopView .cart')?.classList.remove('rr48-cart-full');
      }
      renderShopBanner();
      resetTimer();
    };
    clear.dataset.rrDirectClear='1';
    return true;
  }

  function wireHome(){
    const home=document.getElementById('kioskHome');if(!home)return false;
    const buttons=[...home.querySelectorAll('button')];
    const roost=buttons.find(b=>b.textContent.trim().toUpperCase()==='THE ROOST');
    if(!roost)return false;
    roost.onclick=openRoost;
    roost.removeAttribute('data-roost-wired');
    return true;
  }

  function hookRecordSale(){
    if(typeof recordSale!=='function'||recordSale.__rrRoostMember)return;
    const base=recordSale;
    const wrapped=function(lines,opts={}){
      const sale=base(lines,opts);
      if(opts.source==='store'){
        const c=currentMember();
        if(c){
          sale.customerId=c.id;
          sale.customerName=c.name;
          sale.customerType='roost-member';
        }else{
          sale.customerType='guest';
        }
        persist();
      }
      return sale;
    };
    wrapped.__rrRoostMember=true;
    recordSale=wrapped;
  }

  function setup(){
    ensureData();styles();ensureGuest();ensureOverlay();hookRecordSale();
    document.getElementById('memberCheckin')?.remove();
    document.getElementById('memberShopBanner')?.remove();
    document.getElementById('cartonView')?.remove();
    wireHome();wireClearOrder();renderShopBanner();
    const shop=document.getElementById('goShop');
    if(shop&&!shop.dataset.rrGuestReady){
      shop.dataset.rrGuestReady='1';
      shop.addEventListener('pointerdown',ensureGuest,true);
      shop.addEventListener('touchstart',ensureGuest,true);
      shop.addEventListener('click',()=>setTimeout(renderShopBanner,20));
    }
    const done=document.getElementById('doneThanks');
    if(done&&!done.dataset.rrRoostDone){
      done.dataset.rrRoostDone='1';
      done.addEventListener('click',()=>setTimeout(()=>logout(true),0));
    }
    if(!document.documentElement.dataset.rrRoostActivity){
      document.documentElement.dataset.rrRoostActivity='1';
      ['pointerdown','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(currentMember())resetTimer()},{passive:true}));
    }
  }

  window.RRRoost={open:openRoost,openSignup,logout,renderShopBanner};
  window.addEventListener('load',()=>{let n=0;const t=setInterval(()=>{n++;setup();wireHome();wireClearOrder();if(n>=12)clearInterval(t)},200)});
  if(document.readyState==='complete')setup();
})();