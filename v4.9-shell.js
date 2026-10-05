(()=>{
  const TEST=!!window.__RR_TEST_MODE;
  const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
  const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
  let muting=false;

  function ensureShellStyles(){
    if(document.getElementById('rr49ShellStyles'))return;
    const s=document.createElement('style');
    s.id='rr49ShellStyles';
    s.textContent=`
      #shopView .shop > .hint,
      #rrShopMemberBar .rsub{
        font-size:.98rem;
        font-weight:600;
        line-height:1.35;
        color:#6b5847;
      }
      #rrShopMemberBar{
        margin:0 0 16px!important;
      }
    `;
    document.head.appendChild(s);
  }

  const member=()=>{
    const id=sessionStorage.getItem(MEMBER_KEY);
    return (Array.isArray(window.data?.customers)?window.data.customers:[]).find(c=>c.id===id)||null;
  };
  const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function removeLegacy(){
    ['memberGlobalSession','memberCheckin','memberShopBanner','roostHub','joinView','myRoostView','feedbackView'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.remove();
    });
    document.querySelectorAll('.store-tabs').forEach(el=>el.style.display='none');
  }

  function openNewSignup(){
    const homeRoost=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toUpperCase()==='MY ROOST');
    if(homeRoost){
      homeRoost.click();
      setTimeout(()=>{
        const sign=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toUpperCase()==='SIGN UP FOR MY ROOST');
        if(sign)sign.click();
      },30);
      return;
    }
    const join=document.getElementById('rrShopJoinBtn');
    if(join&&join!==document.activeElement)join.click();
  }

  function ensureBanner(){
    const view=document.getElementById('shopView');
    const shop=view?.querySelector('.shop');
    const product=document.getElementById('productArea');
    if(!view||!shop||!product)return;

    let bar=document.getElementById('rrShopMemberBar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='rrShopMemberBar';
    }
    bar.className='rr-shop-memberbar';
    bar.style.display='flex';

    const c=member();
    const state=c?'member:'+c.id:'guest';
    if(c){
      bar.classList.remove('rr-guest');
      if(bar.dataset.state!==state){
        bar.innerHTML='<div><strong>Welcome, '+htmlEscape(c.name)+'</strong><div class="rsub">Your purchases and returns will be saved to My Roost.</div></div><button class="btn primary" id="rrShopRoostBtn">MY ROOST</button>';
        bar.dataset.state=state;
      }
      bar.querySelector('#rrShopRoostBtn').onclick=()=>{
        const homeRoost=[...document.querySelectorAll('#kioskHome button')].find(b=>b.textContent.trim().toUpperCase()==='MY ROOST');
        if(homeRoost)homeRoost.click();
      };
    }else{
      sessionStorage.setItem(GUEST_KEY,'1');
      bar.classList.add('rr-guest');
      if(bar.dataset.state!==state){
        bar.innerHTML='<div><strong>Welcome, Guest</strong><div class="rsub">Join My Roost to save your purchases and earn return credits.</div></div><button class="btn" id="rrShopJoinBtn">JOIN MY ROOST</button>';
        bar.dataset.state=state;
      }
      bar.querySelector('#rrShopJoinBtn').onclick=openNewSignup;
    }

    if(bar.parentElement!==shop || shop.firstElementChild!==bar){
      shop.insertBefore(bar,shop.firstElementChild);
    }
  }

  function showNewHome(){
    removeLegacy();
    ['shopView','pickupView','cartonView'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('adminScreen')?.classList.add('hidden');
    document.getElementById('payOverlay')?.classList.add('hidden');
    document.getElementById('thanks')?.classList.add('hidden');
    document.getElementById('rrRoostV2Overlay')?.classList.add('hidden');
    const home=document.getElementById('kioskHome');
    if(home){
      home.classList.remove('hidden');
      window.scrollTo(0,0);
    }
  }

  function safeLogout(){
    sessionStorage.removeItem(MEMBER_KEY);
    sessionStorage.setItem(GUEST_KEY,'1');
    try{cart={};renderCart()}catch(e){}
    showNewHome();
  }

  function reinforce(){
    ensureShellStyles();
    removeLegacy();
    ensureBanner();
  }

  // Prevent any old sign-out code from redirecting to test.html.
  document.addEventListener('click',e=>{
    const logout=e.target.closest?.('#rrLogout,#globalMemberSignOut,#memberSignOut,[data-rr-logout]');
    if(logout){
      e.preventDefault();
      e.stopImmediatePropagation();
      safeLogout();
      return;
    }
    const shop=e.target.closest?.('#goShop');
    if(shop){
      sessionStorage.setItem(GUEST_KEY,'1');
      [0,40,150,400].forEach(ms=>setTimeout(ensureBanner,ms));
    }
  },true);

  // Keep the banner alive even when older render functions rebuild the shop card.
  const attachHooks=()=>{
    for(const name of ['renderStore','renderAll']){
      const fn=window[name];
      if(typeof fn==='function'&&!fn.__rr49shell){
        const wrapped=function(...args){
          const result=fn.apply(this,args);
          setTimeout(ensureBanner,0);
          return result;
        };
        wrapped.__rr49shell=true;
        window[name]=wrapped;
      }
    }
  };

  const observer=new MutationObserver(()=>{
    if(muting)return;
    muting=true;
    queueMicrotask(()=>{
      try{reinforce();attachHooks()}finally{muting=false}
    });
  });

  function start(){
    reinforce();
    attachHooks();
    observer.observe(document.body,{childList:true,subtree:true});
    [100,300,800,1600].forEach(ms=>setTimeout(reinforce,ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();