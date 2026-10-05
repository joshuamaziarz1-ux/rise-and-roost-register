(()=>{
  const TEST=!!window.__RR_TEST_MODE;
  const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
  const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
  const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const customers=()=>Array.isArray(data?.customers)?data.customers:[];
  const currentMember=()=>customers().find(c=>c.id===sessionStorage.getItem(MEMBER_KEY))||null;
  const findAction=(needle,root=document)=>[...root.querySelectorAll('button,a')].find(el=>norm(el.textContent).includes(norm(needle)));

  function ensureStyles(){
    if(document.getElementById('rr48HomeCleanStyles'))return;
    const s=document.createElement('style');s.id='rr48HomeCleanStyles';s.textContent=`
      .rr49-home-actions{display:grid;gap:14px;margin-top:10px}
      .rr49-primary{width:min(720px,100%);margin:0 auto}
      .rr49-primary .rr48-main-btn{width:100%;min-height:126px;font-size:clamp(1.55rem,3.2vw,2rem)}
      .rr49-secondary{width:min(720px,100%);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .rr49-secondary-btn{min-height:88px;border:0;border-radius:20px;padding:16px 20px;display:grid;grid-template-columns:48px 1fr 24px;align-items:center;text-align:left;color:#fff;font-weight:950;font-size:clamp(1.05rem,2.1vw,1.35rem);box-shadow:var(--shadow)}
      .rr49-secondary-btn .rr49-icon{font-size:1.85rem;text-align:center}.rr49-secondary-btn .rr49-arrow{text-align:right;font-size:1.7rem}
      .rr49-roost{background:linear-gradient(135deg,#9b5d31,var(--rrbrown))}
      .rr49-comment{background:linear-gradient(135deg,#b58b55,#9b7446)}
      .rr49-hidden{display:none!important}
      .rr49-modal{width:min(720px,calc(100% - 24px));max-width:720px}
      .rr49-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}
      .rr49-modal h2{margin:0}.rr49-roost-signin{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:16px}
      .rr49-roost-signin input,.rr49-comment-form input,.rr49-comment-form textarea{width:100%;border:1px solid var(--line);border-radius:13px;padding:12px 14px;font-size:1rem;background:#fff}
      .rr49-roost-signin input{min-height:56px}.rr49-comment-form{display:grid;gap:12px}.rr49-comment-form textarea{min-height:150px;resize:vertical}
      .rr49-roost-card{border:1px solid var(--line);border-radius:18px;background:#fff;padding:16px;margin:12px 0}
      .rr49-credit{font-size:2.35rem;font-weight:950;color:var(--rrgreen)}
      .rr49-roost-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
      .rr49-roost-actions .btn{min-height:72px;font-size:1.05rem;font-weight:900}
      .rr49-comment-list{display:grid;gap:10px}.rr49-comment-row{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff}
      .rr49-comment-row p{margin:6px 0 0;white-space:pre-wrap}.rr49-comment-meta{font-size:.8rem;color:var(--muted)}
      @media(max-width:650px){.rr49-secondary,.rr49-roost-actions,.rr49-roost-signin{grid-template-columns:1fr}}
      @media(orientation:landscape) and (min-width:700px) and (max-width:1400px){
        .kiosk-home{width:min(980px,calc(100% - 36px))}
        .rr49-primary{width:min(820px,100%)}.rr49-secondary{width:min(820px,100%)}
        .rr49-primary .rr48-main-btn{min-height:120px}
        .rr49-secondary-btn{min-height:82px}
      }
    `;document.head.appendChild(s);
  }

  function cleanHome(){
    const home=document.getElementById('kioskHome'),main=home?.querySelector('.rr48-main-actions');
    if(!home||!main||home.dataset.rr49Clean==='1')return false;
    const start=findAction('start shopping',main);
    if(!start)return false;
    const pickup=findAction('pick up',main);
    const cartons=findAction('return egg',main);
    const cash=home.querySelector('.rr48-cash-note');
    const links=home.querySelector('.rr48-home-links');
    if(cash)cash.classList.add('rr49-hidden');
    if(links)links.classList.add('rr49-hidden');

    const stash=document.createElement('div');stash.id='rr49LegacyActions';stash.className='rr49-hidden';
    if(pickup)stash.appendChild(pickup);
    if(cartons)stash.appendChild(cartons);
    home.appendChild(stash);

    main.innerHTML='';
    main.className='rr49-home-actions';

    const primary=document.createElement('div');primary.className='rr49-primary';primary.appendChild(start);
    const secondary=document.createElement('div');secondary.className='rr49-secondary';

    const roost=document.createElement('button');roost.type='button';roost.className='rr49-secondary-btn rr49-roost';
    roost.innerHTML='<span class="rr49-icon">🐓</span><span>MY ROOST</span><span class="rr49-arrow">›</span>';roost.onclick=openRoost;
    const comment=document.createElement('button');comment.type='button';comment.className='rr49-secondary-btn rr49-comment';
    comment.innerHTML='<span class="rr49-icon">✎</span><span>ADD COMMENT</span><span class="rr49-arrow">›</span>';comment.onclick=openComment;
    secondary.append(roost,comment);main.append(primary,secondary);
    home.dataset.rr49Clean='1';
    return true;
  }

  function ensureRoostOverlay(){
    if(document.getElementById('rr49RoostOverlay'))return;
    const o=document.createElement('div');o.id='rr49RoostOverlay';o.className='overlay hidden';
    o.innerHTML='<div class="modal rr49-modal"><div class="rr49-modal-head"><div><h2>My Roost</h2><div class="rsub">Returns, credits and pickup orders</div></div><button class="btn ghost" id="rr49CloseRoost">Close</button></div><div id="rr49RoostBody"></div></div>';
    document.body.appendChild(o);document.getElementById('rr49CloseRoost').onclick=()=>o.classList.add('hidden');
    o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
  }
  function openRoost(){ensureRoostOverlay();renderRoost();document.getElementById('rr49RoostOverlay').classList.remove('hidden')}
  function renderRoost(){
    const body=document.getElementById('rr49RoostBody');if(!body)return;
    const c=currentMember();
    if(!c){
      body.innerHTML=`<p>Sign in to your Roost account.</p><div class="rr49-roost-signin"><div><input id="rr49MemberName" list="rr49MemberNames" autocomplete="off" placeholder="Type your name"><datalist id="rr49MemberNames">${customers().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist><div id="rr49MemberStatus" class="member-checkin-status"></div></div><button class="btn primary" id="rr49MemberGo">SIGN IN</button></div>`;
      const go=()=>{const input=document.getElementById('rr49MemberName'),status=document.getElementById('rr49MemberStatus'),q=norm(input.value);if(!q){status.textContent='Type your name first.';return}let m=customers().filter(x=>norm(x.name)===q);if(!m.length)m=customers().filter(x=>norm(x.name).includes(q));if(m.length!==1){status.textContent=m.length?'Please type your full name.':'Name not found. Ask Danielle to add you to My Roost.';return}sessionStorage.setItem(MEMBER_KEY,m[0].id);sessionStorage.removeItem(GUEST_KEY);renderRoost()};
      document.getElementById('rr49MemberGo').onclick=go;document.getElementById('rr49MemberName').onkeydown=e=>{if(e.key==='Enter')go()};return;
    }
    const ready=(data.pickups||[]).filter(p=>p.status==='ready'&&(p.customerId===c.id||norm(p.customerName)===norm(c.name)));
    body.innerHTML=`<div class="rr49-roost-card"><div class="rsub">Welcome back</div><h2 style="margin:3px 0 12px">${esc(c.name)}</h2><div class="rsub">Current return credits</div><div class="rr49-credit">${Number(c.cartonCredits||0)}</div><div class="rsub">${ready.length} pickup order${ready.length===1?'':'s'} ready</div></div><div class="rr49-roost-actions"><button class="btn primary" id="rr49Returns">RETURNS & CREDITS</button><button class="btn" id="rr49Pickup">PICK UP AN ORDER</button></div><button class="btn ghost wide" id="rr49SignOut" style="margin-top:12px">Sign Out</button>`;
    document.getElementById('rr49Returns').onclick=()=>openLegacy('return egg');
    document.getElementById('rr49Pickup').onclick=()=>openPickup(c,ready);
    document.getElementById('rr49SignOut').onclick=()=>{sessionStorage.removeItem(MEMBER_KEY);sessionStorage.removeItem(GUEST_KEY);renderRoost()};
  }
  function openLegacy(label){
    const btn=findAction(label,document.getElementById('rr49LegacyActions'));
    document.getElementById('rr49RoostOverlay')?.classList.add('hidden');
    if(btn){btn.click();return}
    if(label.includes('return')&&typeof showStoreTab==='function')showStoreTab('cartons');
  }
  function openPickup(c,ready){
    document.getElementById('rr49RoostOverlay')?.classList.add('hidden');
    const btn=findAction('pick up',document.getElementById('rr49LegacyActions'));
    if(btn)btn.click();else if(typeof showStoreTab==='function')showStoreTab('pickup');
    setTimeout(()=>{
      const input=document.getElementById('pickupCodeInput');
      if(ready.length===1&&input){input.value=ready[0].code;if(typeof findPickup==='function')findPickup()}
    },80);
  }

  function ensureCommentOverlay(){
    if(document.getElementById('rr49CommentOverlay'))return;
    const o=document.createElement('div');o.id='rr49CommentOverlay';o.className='overlay hidden';
    o.innerHTML=`<div class="modal rr49-modal"><div class="rr49-modal-head"><div><h2>Leave Us a Comment</h2><div class="rsub">We'd love to hear from you.</div></div><button class="btn ghost" id="rr49CloseComment">Close</button></div><div class="rr49-comment-form"><input id="rr49CommentName" placeholder="Your name (optional)"><textarea id="rr49CommentText" placeholder="Type your comment here..."></textarea><button class="btn primary wide" id="rr49SubmitComment">SUBMIT COMMENT</button></div></div>`;
    document.body.appendChild(o);document.getElementById('rr49CloseComment').onclick=()=>o.classList.add('hidden');o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
    document.getElementById('rr49SubmitComment').onclick=submitComment;
  }
  function openComment(){ensureCommentOverlay();const c=currentMember();document.getElementById('rr49CommentName').value=c?.name||'';document.getElementById('rr49CommentText').value='';document.getElementById('rr49CommentOverlay').classList.remove('hidden');setTimeout(()=>document.getElementById('rr49CommentText').focus(),30)}
  function submitComment(){
    const text=document.getElementById('rr49CommentText').value.trim(),name=document.getElementById('rr49CommentName').value.trim();
    if(!text)return alert('Type a comment first.');
    data.comments=Array.isArray(data.comments)?data.comments:[];
    data.comments.unshift({id:(typeof uid==='function'?uid('comment'):'comment_'+Date.now()),date:new Date().toISOString(),name,text});
    if(data.comments.length>500)data.comments.length=500;
    persist();document.getElementById('rr49CommentOverlay').classList.add('hidden');alert('Thank you! Your comment has been saved.');renderCommentAdmin();
  }

  function renderCommentAdmin(){
    const tab=document.getElementById('dashboardTab');if(!tab)return;
    let card=document.getElementById('rr49CommentsAdmin');
    if(!card){card=document.createElement('div');card.id='rr49CommentsAdmin';card.className='card section';card.innerHTML='<div class="section-head"><h2>Customer Comments</h2></div><div id="rr49CommentList"></div>';tab.appendChild(card)}
    const list=document.getElementById('rr49CommentList'),arr=Array.isArray(data.comments)?data.comments:[];
    list.innerHTML=arr.length?'<div class="rr49-comment-list">'+arr.slice(0,50).map(x=>`<div class="rr49-comment-row"><strong>${esc(x.name||'Anonymous')}</strong><div class="rr49-comment-meta">${new Date(x.date).toLocaleString()}</div><p>${esc(x.text)}</p></div>`).join('')+'</div>':'<div class="empty">No customer comments yet.</div>';
  }

  function apply(){
    ensureStyles();cleanHome();renderCommentAdmin();
    const prior=window.renderDashboard;
    if(typeof prior==='function'&&!prior.__rr49){const wrapped=function(){prior();renderCommentAdmin()};wrapped.__rr49=true;window.renderDashboard=wrapped}
  }
  window.addEventListener('load',()=>{let n=0;const t=setInterval(()=>{apply();if(document.getElementById('kioskHome')?.dataset.rr49Clean==='1'||++n>20)clearInterval(t)},150)});
  if(document.readyState==='complete')apply();
})();