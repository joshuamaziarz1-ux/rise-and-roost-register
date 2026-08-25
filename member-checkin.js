(()=>{
const TEST=!!window.__RR_TEST_MODE;
const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1',GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
function customers(){return Array.isArray(data.customers)?data.customers:[]}
function currentMember(){const id=sessionStorage.getItem(MEMBER_KEY);const c=customers().find(x=>x.id===id);if(id&&!c)sessionStorage.removeItem(MEMBER_KEY);return c||null}
function isGuest(){return sessionStorage.getItem(GUEST_KEY)==='1'}
function clearIdentity(){sessionStorage.removeItem(MEMBER_KEY);sessionStorage.removeItem(GUEST_KEY);renderCheckin();renderShopIdentity()}
function setMember(c){sessionStorage.setItem(MEMBER_KEY,c.id);sessionStorage.removeItem(GUEST_KEY);renderCheckin();renderShopIdentity()}
function setGuest(){sessionStorage.removeItem(MEMBER_KEY);sessionStorage.setItem(GUEST_KEY,'1');renderCheckin();renderShopIdentity()}

const style=document.createElement('style');style.textContent=`
.member-checkin{max-width:650px;margin:16px auto 24px;padding:18px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow);text-align:left}.member-checkin h2{margin:0 0 4px;font-size:1.25rem}.member-checkin p{margin:0 0 12px;color:var(--muted)}.member-checkin-row{display:grid;grid-template-columns:1fr auto;gap:8px}.member-checkin-row input{min-height:54px;border:1px solid var(--line);border-radius:12px;padding:0 14px;font-size:1.05rem}.member-checkin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.member-checkin-status{margin-top:9px;font-weight:800}.checked-in-box{display:flex;justify-content:space-between;gap:12px;align-items:center}.checked-in-name{font-size:1.2rem;font-weight:950}.member-shop-banner{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;font-weight:850}.member-shop-banner strong{font-size:1.05rem}@media(max-width:700px){.member-checkin-row{grid-template-columns:1fr}.checked-in-box,.member-shop-banner{align-items:flex-start;flex-direction:column}}
`;document.head.appendChild(style);

const home=document.getElementById('kioskHome');
if(!home)return;
const lead=home.querySelector('.lead');if(lead)lead.remove();
const card=document.createElement('section');card.id='memberCheckin';card.className='member-checkin';
card.innerHTML=`<div id="memberCheckinBody"></div>`;
home.querySelector('h1').after(card);

function renderCheckin(){
 const body=document.getElementById('memberCheckinBody');if(!body)return;
 const c=currentMember();
 if(c){body.innerHTML=`<div class="checked-in-box"><div><div class="checked-in-name">Hi, ${esc(c.name)}!</div><div class="rsub">You're checked in to shop · ${Number(c.cartonCredits||0)} carton credit${Number(c.cartonCredits||0)===1?'':'s'}</div></div><div class="member-checkin-actions"><button class="btn primary" id="memberContinue">Continue Shopping</button><button class="btn ghost" id="memberSignOut">Not ${esc(c.name)}?</button></div></div>`;document.getElementById('memberContinue').onclick=()=>document.getElementById('goShop')?.click();document.getElementById('memberSignOut').onclick=clearIdentity;return}
 if(isGuest()){body.innerHTML=`<div class="checked-in-box"><div><div class="checked-in-name">Shopping as Guest</div><div class="rsub">No Roost member is checked in.</div></div><div class="member-checkin-actions"><button class="btn primary" id="guestContinue">Continue Shopping</button><button class="btn ghost" id="guestMember">Roost Member Check In</button></div></div>`;document.getElementById('guestContinue').onclick=()=>document.getElementById('goShop')?.click();document.getElementById('guestMember').onclick=clearIdentity;return}
 body.innerHTML=`<h2>Are you a Roost member?</h2><p>Enter your name before shopping.</p><div class="member-checkin-row"><div><input id="memberNameInput" list="roostMemberNames" autocomplete="off" placeholder="Type your name"><datalist id="roostMemberNames">${[...customers()].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist></div><button class="btn primary" id="memberFindBtn">Check In & Shop</button></div><div id="memberFindStatus" class="member-checkin-status"></div><div class="member-checkin-actions"><button class="btn ghost" id="shopGuestBtn">Shop as Guest</button><button class="btn ghost" id="joinFromCheckin">Not a member? Join the Roost</button></div>`;
 const input=document.getElementById('memberNameInput'),find=document.getElementById('memberFindBtn'),status=document.getElementById('memberFindStatus');
 function findMember(){const q=norm(input.value);if(!q){status.textContent='Type your name first.';input.focus();return}let matches=customers().filter(c=>norm(c.name)===q);if(!matches.length)matches=customers().filter(c=>norm(c.name).includes(q));if(matches.length===1){setMember(matches[0]);setTimeout(()=>document.getElementById('goShop')?.click(),30);return}if(matches.length>1){status.textContent='More than one member matches. Please type your full name.';return}status.textContent='Name not found. You can shop as a guest or join The Roost.'}
 find.onclick=findMember;input.onkeydown=e=>{if(e.key==='Enter')findMember()};document.getElementById('shopGuestBtn').onclick=()=>{setGuest();setTimeout(()=>document.getElementById('goShop')?.click(),30)};document.getElementById('joinFromCheckin').onclick=()=>document.getElementById('goJoin')?.click();
}

function ensureShopBanner(){const view=document.getElementById('shopView');if(!view||document.getElementById('memberShopBanner'))return;const b=document.createElement('div');b.id='memberShopBanner';b.className='member-shop-banner hidden';const back=view.querySelector('.back-home');if(back)back.after(b);else view.prepend(b)}
function renderShopIdentity(){ensureShopBanner();const b=document.getElementById('memberShopBanner');if(!b)return;const c=currentMember();if(!c&&!isGuest()){b.classList.add('hidden');return}b.classList.remove('hidden');if(c)b.innerHTML=`<div><strong>Shopping as ${esc(c.name)}</strong><div class="rsub">Roost member · ${Number(c.cartonCredits||0)} carton credit${Number(c.cartonCredits||0)===1?'':'s'}</div></div><button class="btn small ghost" id="switchShopper">Switch Customer</button>`;else b.innerHTML=`<div><strong>Shopping as Guest</strong><div class="rsub">This purchase will not be attached to a Roost member.</div></div><button class="btn small ghost" id="switchShopper">Member Check In</button>`;document.getElementById('switchShopper').onclick=()=>{clearIdentity();document.querySelector('#shopView .back-home')?.click()}}

const shopBtn=document.getElementById('goShop');
shopBtn?.addEventListener('click',e=>{if(!currentMember()&&!isGuest()){e.preventDefault();e.stopImmediatePropagation();renderCheckin();document.getElementById('memberFindStatus').textContent='Check in above or choose Shop as Guest.';document.getElementById('memberNameInput')?.focus();document.getElementById('memberCheckin')?.scrollIntoView({behavior:'smooth',block:'center'})}},true);
shopBtn?.addEventListener('click',()=>setTimeout(renderShopIdentity,0));

document.getElementById('goCartons')?.addEventListener('click',()=>{const c=currentMember();if(c)setTimeout(()=>{const s=document.getElementById('cartonCustomerSelect');if(s){s.value=c.id;s.dispatchEvent(new Event('change'))}},30)});

const baseRecordSale=recordSale;
recordSale=function(lines,opts={}){const sale=baseRecordSale(lines,opts);if(opts.source==='store'){const c=currentMember();if(c){sale.customerId=c.id;sale.customerName=c.name;sale.customerType='roost-member'}else if(isGuest())sale.customerType='guest';persist()}return sale};

const done=document.getElementById('doneThanks');if(done)done.onclick=()=>{document.getElementById('thanks')?.classList.add('hidden');clearIdentity();document.querySelector('#shopView .back-home')?.click()};

// Keep the new build obvious on the kiosk and in Admin.
document.title=TEST?'Rise & Roost TEST LAB':'Rise & Roost Register v4.3';if(!TEST){document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost Register v4.3');const adminSub=document.querySelector('#adminScreen .admin-top .sub');if(adminSub)adminSub.textContent='Rise & Roost Register v4.3';const versionStrong=document.querySelector('#settingsTab .danger-zone strong');if(versionStrong)versionStrong.textContent='Rise & Roost Register v4.3'}
renderCheckin();renderShopIdentity();
})();