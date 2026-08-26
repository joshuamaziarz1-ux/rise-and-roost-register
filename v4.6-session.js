(()=>{
const TEST=!!window.__RR_TEST_MODE;
const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
const BUILD='4.6.3';

const css=document.createElement('style');
css.textContent=`
.member-global-session{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:8px;padding:7px 9px 7px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;white-space:nowrap}
.member-global-session .session-name{font-weight:850;font-size:.9rem}.member-global-session .btn{min-height:34px;padding:6px 10px}
@media(max-width:620px){.member-global-session{padding-left:9px;gap:5px}.member-global-session .session-name{max-width:105px;overflow:hidden;text-overflow:ellipsis}.member-global-session .btn{padding:6px 8px;font-size:.8rem}}
`;
document.head.appendChild(css);

const allMembers=()=>Array.isArray(data.customers)?data.customers:[];
const nameKey=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const phoneKey=s=>{let d=String(s||'').replace(/\D/g,'');if(d.length===11&&d.startsWith('1'))d=d.slice(1);return d};

function member(){
  const id=sessionStorage.getItem(MEMBER_KEY);
  return allMembers().find(c=>c.id===id)||null;
}
function adminOpen(){return !$('adminScreen')?.classList.contains('hidden')}
function ensureGlobal(){
  const top=document.querySelector('header.top');if(!top)return null;
  let box=$('memberGlobalSession');
  if(!box){
    box=document.createElement('div');box.id='memberGlobalSession';box.className='member-global-session hidden';
    const admin=$('adminBtn');if(admin)top.insertBefore(box,admin);else top.appendChild(box);
  }
  return box;
}
function signOut(){
  sessionStorage.removeItem(MEMBER_KEY);sessionStorage.removeItem(GUEST_KEY);
  try{cart={};renderCart()}catch(e){}
  document.getElementById('payOverlay')?.classList.add('hidden');
  document.getElementById('thanks')?.classList.add('hidden');
  location.href=TEST?`test.html?v=${BUILD}`:`./?v=${BUILD}`;
}
function openJoin(){
  ['kioskHome','shopView','pickupView','cartonView','roostHub','myRoostView','feedbackView'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  const j=document.getElementById('joinView');if(!j)return;
  j.classList.remove('hidden');
  j.querySelector('.join-form')?.classList.remove('hidden');
  ['joinName','joinPhone','joinEmail'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const p=document.getElementById('joinPickupAlerts');if(p)p.checked=true;
  const s=document.getElementById('joinStoreUpdates');if(s)s.checked=false;
  const r=document.getElementById('joinResult');if(r)r.innerHTML='';
  window.scrollTo(0,0);
}
function polishCheckin(){
  const input=$('memberNameInput');
  if(input){input.placeholder='Name or phone number';input.setAttribute('aria-label','Name or phone number');input.enterKeyHint='go'}
  const p=$('memberCheckinBody')?.querySelector(':scope > p');
  if(p)p.textContent='Enter your name or phone number before shopping.';
}
function setStatus(text){const status=$('memberFindStatus');if(status)status.textContent=text}
function findMember(raw){
  const value=String(raw||'').trim();
  if(!value)return {error:'Enter your name or phone number.'};
  const list=allMembers();
  const hasDigit=/\d/.test(value);
  if(hasDigit){
    const phone=phoneKey(value);
    if(phone.length<7)return {error:'Enter your full phone number.'};
    const matches=list.filter(c=>phoneKey(c.phone)===phone);
    if(matches.length===1)return {member:matches[0]};
    if(matches.length>1)return {error:'More than one member uses that phone number. Please ask for help.'};
    return {error:'Phone number not found. You can shop as a guest or join The Roost.'};
  }
  const q=nameKey(value);
  if(!q)return {error:'Enter your name or phone number.'};
  let matches=list.filter(c=>nameKey(c.name)===q);
  if(matches.length===1)return {member:matches[0]};
  const words=q.split(' ').filter(Boolean);
  if(!matches.length&&words.length){
    matches=list.filter(c=>{const saved=nameKey(c.name).split(' ').filter(Boolean);return words.every(w=>saved.includes(w))});
    if(matches.length===1)return {member:matches[0]};
  }
  if(!matches.length&&words.length>1){
    const first=words[0];
    const firstMatches=list.filter(c=>nameKey(c.name).split(' ')[0]===first);
    if(firstMatches.length===1)return {member:firstMatches[0]};
  }
  if(matches.length>1)return {error:'More than one member matches. Please enter your full name or phone number.'};
  return {error:'Name not found. Try your phone number, shop as a guest, or join The Roost.'};
}
function checkIn(){
  const input=$('memberNameInput');if(!input)return;
  const result=findMember(input.value);
  if(result.error){setStatus(result.error);input.focus();return}
  sessionStorage.setItem(MEMBER_KEY,result.member.id);
  sessionStorage.removeItem(GUEST_KEY);
  setStatus(`Welcome, ${result.member.name}!`);
  setTimeout(()=>document.getElementById('goShop')?.click(),20);
}
function refresh(){
  polishCheckin();
  const c=member(),box=ensureGlobal();if(!box)return;
  const homeSignOut=$('memberSignOut');if(homeSignOut)homeSignOut.textContent='Sign Out';
  if(!c||adminOpen()){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const wanted=`<span class="session-name">${esc(c.name)}</span><button class="btn small ghost" id="globalMemberSignOut">Sign Out</button>`;
  if(box.dataset.memberId!==c.id||!$('globalMemberSignOut')){box.innerHTML=wanted;box.dataset.memberId=c.id;$('globalMemberSignOut').onclick=signOut}
}

// Delegated handlers survive the check-in card being redrawn.
document.addEventListener('click',e=>{
  const join=e.target.closest?.('#joinFromCheckin');
  if(join){e.preventDefault();e.stopPropagation();openJoin();return}
  const find=e.target.closest?.('#memberFindBtn');
  if(find){e.preventDefault();e.stopImmediatePropagation();checkIn()}
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target?.id==='memberNameInput'){
    e.preventDefault();e.stopImmediatePropagation();checkIn();
  }
},true);

if(!TEST){
  document.title=`Rise & Roost Register v${BUILD}`;
  document.querySelectorAll('.version').forEach(x=>x.textContent=`Rise & Roost Register v${BUILD}`);
  const adminSub=document.querySelector('#adminScreen .admin-top .sub');if(adminSub)adminSub.textContent=`Rise & Roost Register v${BUILD}`;
  const versionStrong=document.querySelector('#settingsTab .danger-zone strong');if(versionStrong)versionStrong.textContent=`Rise & Roost Register v${BUILD}`;
}
refresh();setInterval(refresh,300);
})();