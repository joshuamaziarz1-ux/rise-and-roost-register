(()=>{
const TEST=!!window.__RR_TEST_MODE;
const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';

const css=document.createElement('style');
css.textContent=`
.member-global-session{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:8px;padding:7px 9px 7px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;white-space:nowrap}
.member-global-session .session-name{font-weight:850;font-size:.9rem}.member-global-session .btn{min-height:34px;padding:6px 10px}
@media(max-width:620px){.member-global-session{padding-left:9px;gap:5px}.member-global-session .session-name{max-width:105px;overflow:hidden;text-overflow:ellipsis}.member-global-session .btn{padding:6px 8px;font-size:.8rem}}
`;
document.head.appendChild(css);

function member(){
  const id=sessionStorage.getItem(MEMBER_KEY);
  return (Array.isArray(data.customers)?data.customers:[]).find(c=>c.id===id)||null;
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
  location.href=TEST?'test.html?v=4.6.2':'./?v=4.6.2';
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
function refresh(){
  const c=member(),box=ensureGlobal();if(!box)return;
  const homeSignOut=$('memberSignOut');if(homeSignOut)homeSignOut.textContent='Sign Out';
  if(!c||adminOpen()){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const wanted=`<span class="session-name">${esc(c.name)}</span><button class="btn small ghost" id="globalMemberSignOut">Sign Out</button>`;
  if(box.dataset.memberId!==c.id||!$('globalMemberSignOut')){box.innerHTML=wanted;box.dataset.memberId=c.id;$('globalMemberSignOut').onclick=signOut}
}

// Use event delegation so the Join button still works after the check-in box is redrawn.
document.addEventListener('click',e=>{
  const join=e.target.closest?.('#joinFromCheckin');
  if(!join)return;
  e.preventDefault();
  e.stopPropagation();
  openJoin();
},true);

if(!TEST){
  document.title='Rise & Roost Register v4.6.2';
  document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost Register v4.6.2');
  const adminSub=document.querySelector('#adminScreen .admin-top .sub');if(adminSub)adminSub.textContent='Rise & Roost Register v4.6.2';
  const versionStrong=document.querySelector('#settingsTab .danger-zone strong');if(versionStrong)versionStrong.textContent='Rise & Roost Register v4.6.2';
}
refresh();setInterval(refresh,300);
})();