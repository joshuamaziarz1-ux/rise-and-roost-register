(()=>{
  const TEST=!!window.__RR_TEST_MODE;
  const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
  const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const customers=()=>Array.isArray(window.data?.customers)?window.data.customers:[];
  const currentMember=()=>customers().find(c=>c.id===sessionStorage.getItem(MEMBER_KEY))||null;
  const findAction=(needle,root=document)=>[...root.querySelectorAll('button,a')].find(el=>norm(el.textContent).includes(norm(needle)));

  function styles(){
    if(document.getElementById('rr410HomeStyles'))return;
    const s=document.createElement('style');
    s.id='rr410HomeStyles';
    s.textContent=`
      .rr410-home-actions{display:grid;gap:14px;margin-top:10px}
      .rr410-primary{width:min(720px,100%);margin:0 auto}
      .rr410-primary .rr48-main-btn{width:100%;min-height:126px;font-size:clamp(1.55rem,3.2vw,2rem);display:flex;align-items:center;justify-content:center;text-align:center;padding:18px 24px}
      .rr410-primary .rr48-main-btn .rr48-icon,.rr410-primary .rr48-main-btn .rr48-arrow{display:none!important}
      .rr410-secondary{width:min(720px,100%);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .rr410-secondary-btn{min-height:88px;border:0;border-radius:20px;padding:16px 20px;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-weight:950;font-size:clamp(1.05rem,2.1vw,1.35rem);box-shadow:var(--shadow)}
      .rr410-roost{background:linear-gradient(135deg,#9b5d31,var(--rrbrown))}
      .rr410-comment{background:linear-gradient(135deg,#b58b55,#9b7446)}
      .rr410-hidden{display:none!important}
      .rr410-modal{width:min(720px,calc(100% - 24px));max-width:720px}
      .rr410-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}
      .rr410-modal h2{margin:0}
      .rr410-comment-form{display:grid;gap:12px}
      .rr410-comment-form input,.rr410-comment-form textarea{width:100%;border:1px solid var(--line);border-radius:13px;padding:12px 14px;font-size:1rem;background:#fff}
      .rr410-comment-form textarea{min-height:150px;resize:vertical}
      .rr410-comment-list{display:grid;gap:10px}
      .rr410-comment-row{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff}
      .rr410-comment-row p{margin:6px 0 0;white-space:pre-wrap}
      .rr410-comment-meta{font-size:.8rem;color:var(--muted)}
      .rr410-toast-wrap{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(43,34,25,.34)}
      .rr410-toast-wrap.hidden{display:none!important}
      .rr410-toast{width:min(480px,calc(100% - 28px));background:#f7f1e6;border:2px solid #5f7c61;border-radius:22px;box-shadow:0 18px 50px rgba(44,33,22,.28);padding:24px 26px;text-align:center}
      .rr410-toast h3{margin:0 0 8px;color:#35563b;font-size:1.45rem}.rr410-toast p{margin:0;color:#5e5044}
      @media(max-width:650px){.rr410-secondary{grid-template-columns:1fr}}
      @media(orientation:landscape) and (min-width:700px) and (max-width:1400px){
        .kiosk-home{width:min(980px,calc(100% - 36px))}
        .rr410-primary,.rr410-secondary{width:min(820px,100%)}
        .rr410-primary .rr48-main-btn{min-height:120px}
        .rr410-secondary-btn{min-height:82px}
      }
    `;
    document.head.appendChild(s);
  }

  function cleanHome(){
    const home=document.getElementById('kioskHome');
    const main=home?.querySelector('.rr48-main-actions,.rr410-home-actions');
    if(!home||!main)return false;

    if(main.classList.contains('rr410-home-actions')){
      const roost=[...main.querySelectorAll('button')].find(b=>b.textContent.trim().toUpperCase()==='THE ROOST');
      const comment=[...main.querySelectorAll('button')].find(b=>b.textContent.trim().toUpperCase()==='ADD COMMENT');
      if(roost)roost.onclick=()=>window.RRRoost?.open();
      if(comment)comment.onclick=openComment;
      return true;
    }

    const start=findAction('start shopping',main);
    if(!start)return false;
    start.innerHTML='<span>START SHOPPING</span>';

    home.querySelector('.rr48-cash-note')?.classList.add('rr410-hidden');
    home.querySelector('.rr48-home-links')?.classList.add('rr410-hidden');

    main.innerHTML='';
    main.className='rr410-home-actions';

    const primary=document.createElement('div');
    primary.className='rr410-primary';
    primary.appendChild(start);

    const secondary=document.createElement('div');
    secondary.className='rr410-secondary';

    const roost=document.createElement('button');
    roost.type='button';
    roost.className='rr410-secondary-btn rr410-roost';
    roost.textContent='THE ROOST';
    roost.onclick=()=>window.RRRoost?.open();

    const comment=document.createElement('button');
    comment.type='button';
    comment.className='rr410-secondary-btn rr410-comment';
    comment.textContent='ADD COMMENT';
    comment.onclick=openComment;

    secondary.append(roost,comment);
    main.append(primary,secondary);
    home.dataset.rr410Clean='1';
    return true;
  }

  function ensureCommentOverlay(){
    if(document.getElementById('rr410CommentOverlay'))return;
    const o=document.createElement('div');
    o.id='rr410CommentOverlay';
    o.className='overlay hidden';
    o.innerHTML=`<div class="modal rr410-modal">
      <div class="rr410-modal-head"><div><h2>Leave Us a Comment</h2></div><button class="btn ghost" id="rr410CloseComment">Close</button></div>
      <div class="rr410-comment-form"><input id="rr410CommentName" placeholder="Your name (optional)"><textarea id="rr410CommentText" placeholder="Type your comment here..."></textarea><button class="btn primary wide" id="rr410SubmitComment">SUBMIT COMMENT</button></div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('rr410CloseComment').onclick=()=>o.classList.add('hidden');
    document.getElementById('rr410SubmitComment').onclick=submitComment;
    o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
  }

  function openComment(){
    ensureCommentOverlay();
    const c=currentMember();
    document.getElementById('rr410CommentName').value=c?.name||'';
    document.getElementById('rr410CommentText').value='';
    document.getElementById('rr410CommentOverlay').classList.remove('hidden');
    setTimeout(()=>document.getElementById('rr410CommentText')?.focus(),30);
  }

  function toast(title,message){
    let w=document.getElementById('rr410Toast');
    if(!w){
      w=document.createElement('div');w.id='rr410Toast';w.className='rr410-toast-wrap hidden';
      w.innerHTML='<div class="rr410-toast"><h3></h3><p></p></div>';
      document.body.appendChild(w);
    }
    w.querySelector('h3').textContent=title;
    w.querySelector('p').textContent=message;
    w.classList.remove('hidden');
    setTimeout(()=>w.classList.add('hidden'),2600);
  }

  async function submitComment(){
    const text=document.getElementById('rr410CommentText').value.trim();
    const name=document.getElementById('rr410CommentName').value.trim();
    if(!text){toast('Add a Comment','Type your comment first.');return}
    const btn=document.getElementById('rr410SubmitComment');
    if(btn){btn.disabled=true;btn.textContent='SAVING…'}
    try{
      let saved={id:typeof uid==='function'?uid('comment'):'comment_'+Date.now(),date:new Date().toISOString(),name,text};
      if(/cloud-beta/i.test(location.pathname)){
        if(!window.RRCloud?.api)throw new Error('The shared store database is still connecting. Please try again.');
        const out=await window.RRCloud.api('comment_submit',{name,text});
        saved=out.comment||saved;
      }
      data.comments=Array.isArray(data.comments)?data.comments:[];
      data.comments.unshift(saved);
      if(data.comments.length>500)data.comments.length=500;
      persist();
      document.getElementById('rr410CommentOverlay').classList.add('hidden');
      renderCommentAdmin();
      toast('Thank You','Your comment has been saved.');
    }catch(e){
      toast('Could Not Save',(e&&e.message)||'Please try again.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='SUBMIT COMMENT'}
    }
  }

  function renderCommentAdmin(){
    const tab=document.getElementById('commentsTab')||document.getElementById('dashboardTab');if(!tab)return;
    let card=document.getElementById('rr410CommentsAdmin');
    let list=document.getElementById('rr410CommentList');
    if(!list){
      if(!card){
        card=document.createElement('div');card.id='rr410CommentsAdmin';card.className='card section';
        card.innerHTML='<div class="section-head"><h2>Customer Comments</h2></div><div id="rr410CommentList"></div>';
        tab.appendChild(card);
      }
      list=document.getElementById('rr410CommentList');
    }
    const arr=Array.isArray(data.comments)?data.comments:[];
    list.innerHTML=arr.length?'<div class="rr410-comment-list">'+arr.slice(0,50).map(x=>`<div class="rr410-comment-row"><strong>${esc(x.name||'Anonymous')}</strong><div class="rr410-comment-meta">${new Date(x.date).toLocaleString()}</div><p>${esc(x.text)}</p></div>`).join('')+'</div>':'<div class="empty">No customer comments yet.</div>';
  }

  function removeFillerCopy(){
    const phrases=new Set([
      'what would you like to do?',
      'what would you like to do',
      'choose what you would like to do',
      'please choose an option'
    ]);
    document.querySelectorAll('#kioskHome p,#kioskHome .hint,#kioskHome .rsub,#kioskHome div').forEach(el=>{
      if(el.children.length)return;
      const t=norm(el.textContent);
      if(phrases.has(t))el.remove();
    });
  }

  function apply(){
    styles();cleanHome();removeFillerCopy();ensureCommentOverlay();renderCommentAdmin();
    const prior=window.renderDashboard;
    if(typeof prior==='function'&&!prior.__rr410Comments){
      const wrapped=function(){prior();renderCommentAdmin()};
      wrapped.__rr410Comments=true;
      window.renderDashboard=wrapped;
    }
  }

  window.addEventListener('load',()=>{
    let n=0;
    const t=setInterval(()=>{
      n++;apply();
      if(cleanHome()||n>=20)clearInterval(t);
    },150);
  });
  if(document.readyState==='complete')apply();
})();