(()=>{
const V4STYLE=`
.kiosk-home{width:min(900px,calc(100% - 24px));margin:24px auto 40px;text-align:center}.kiosk-home h1{font-size:clamp(2rem,6vw,3.5rem);margin:8px 0}.kiosk-home .lead{font-size:1.1rem;color:var(--muted);margin:0 0 22px}.kiosk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kiosk-choice{min-height:170px;border:1px solid var(--line);border-radius:22px;background:#fff;padding:22px 16px;box-shadow:var(--shadow);font-weight:950;font-size:1.35rem;color:var(--ink)}.kiosk-choice span{display:block;margin-top:8px;font-size:.9rem;font-weight:700;color:var(--muted)}.kiosk-choice:active{transform:scale(.985)}.back-home{margin:0 0 12px}.roost-hub{width:min(760px,calc(100% - 24px));margin:18px auto 40px}.roost-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.roost-action{min-height:150px;border:1px solid var(--line);border-radius:20px;background:#fff;padding:20px;font-weight:950;font-size:1.25rem}.roost-action span{display:block;font-size:.88rem;font-weight:700;color:var(--muted);margin-top:8px}.join-wrap{width:min(720px,calc(100% - 24px));margin:18px auto 40px}.join-form{display:grid;gap:12px;margin-top:16px}.join-form .field input{min-height:54px;font-size:1.05rem}.consent{display:flex;gap:10px;align-items:flex-start;padding:10px 0}.consent input{width:22px;height:22px;margin-top:1px}.welcome-roost{text-align:center;padding:10px}.welcome-roost h2{font-size:2rem;margin:4px 0 8px}.welcome-roost .credit-number{font-size:3.4rem;font-weight:950;margin:8px 0 0}.member-contact{font-size:.82rem;color:var(--muted);margin-top:4px;word-break:break-word}.store-tabs{display:none!important}
@media(max-width:700px){.kiosk-grid{grid-template-columns:1fr}.kiosk-choice{min-height:115px}.roost-actions{grid-template-columns:1fr}.roost-action{min-height:110px}}
`;
const style=document.createElement('style');style.textContent=V4STYLE;document.head.appendChild(style);

function ensureV4Customers(){
  data.customers=Array.isArray(data.customers)?data.customers:[];
  data.customers.forEach(c=>{
    c.phone=String(c.phone||'');
    c.email=String(c.email||'');
    c.pickupAlerts=!!c.pickupAlerts;
    c.storeUpdates=!!c.storeUpdates;
  });
}
ensureV4Customers();persist();

function addBackButton(view){
  if(!view||view.querySelector('.back-home'))return;
  const b=document.createElement('button');b.className='btn ghost back-home';b.textContent='← Home';b.onclick=showKioskHome;view.insertBefore(b,view.firstChild);
}
function hideCustomerViews(){
  ['shopView','pickupView','cartonView','roostHub','joinView','kioskHome'].forEach(id=>{const el=$(id);if(el)el.classList.add('hidden')});
}
function showKioskHome(){hideCustomerViews();$('kioskHome').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function showShopV4(){hideCustomerViews();$('shopView').classList.remove('hidden');renderStore();renderCart();window.scrollTo({top:0,behavior:'smooth'})}
function showPickupV4(){hideCustomerViews();$('pickupView').classList.remove('hidden');$('pickupCodeInput').value='';$('pickupCustomerResult').innerHTML='';window.scrollTo({top:0,behavior:'smooth'})}
function showRoostHub(){hideCustomerViews();$('roostHub').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function showCartonsV4(customerId=''){hideCustomerViews();$('cartonView').classList.remove('hidden');if(typeof renderAll==='function')renderAll();if(customerId&&$('cartonCustomerSelect')){$('cartonCustomerSelect').value=customerId;$('cartonCustomerSelect').dispatchEvent(new Event('change'))}window.scrollTo({top:0,behavior:'smooth'})}
function showJoin(){hideCustomerViews();$('joinView').classList.remove('hidden');['joinName','joinPhone','joinEmail'].forEach(id=>$(id).value='');$('joinPickupAlerts').checked=true;$('joinStoreUpdates').checked=false;$('joinResult').innerHTML='';window.scrollTo({top:0,behavior:'smooth'})}

function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)}
function phoneDigits(s){return String(s).replace(/\D/g,'')}
function joinRoost(){
  ensureV4Customers();
  const name=$('joinName').value.trim(),phone=$('joinPhone').value.trim(),email=$('joinEmail').value.trim().toLowerCase();
  if(!name)return alert('Please enter your name.');
  if(phoneDigits(phone).length<7)return alert('Please enter a valid phone number.');
  if(!validEmail(email))return alert('Please enter a valid email address.');
  const phoneKey=phoneDigits(phone);
  if(data.customers.some(c=>phoneDigits(c.phone)===phoneKey))return alert('That phone number is already connected to a Roost Club member.');
  if(data.customers.some(c=>String(c.email||'').toLowerCase()===email))return alert('That email is already connected to a Roost Club member.');
  const c={id:uid('customer'),name,phone,email,pickupAlerts:$('joinPickupAlerts').checked,storeUpdates:$('joinStoreUpdates').checked,cartonCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString()};
  data.customers.push(c);persist();renderAll();
  $('joinResult').innerHTML=`<div class="pickup-result welcome-roost"><h2>Welcome to the Roost, ${esc(c.name)}!</h2><div class="rsub">Your Carton Credits</div><div class="credit-number">0</div><p class="hint">Bring back clean, reusable dozen-egg cartons to earn credits toward a free dozen.</p><button class="btn primary wide" id="newMemberReturnCartons">Return Cartons Now</button><button class="btn ghost wide" id="newMemberHome">Done</button></div>`;
  document.querySelector('.join-form').classList.add('hidden');
  $('newMemberReturnCartons').onclick=()=>{document.querySelector('.join-form').classList.remove('hidden');showCartonsV4(c.id)};
  $('newMemberHome').onclick=()=>{document.querySelector('.join-form').classList.remove('hidden');showKioskHome()};
}

function postProcessAdminCustomers(){
  ensureV4Customers();
  const tab=$('customersTab');if(!tab)return;
  const h2s=[...tab.querySelectorAll('h2')];
  h2s.forEach(h=>{if(h.textContent==='Carton Club Settings')h.textContent='Roost Club Rewards';if(h.textContent==='Add Regular Customer')h.textContent='Add Roost Club Member';if(h.textContent==='Regular Customers')h.textContent='Roost Club Members'});
  const statLabel=$('cartonMembersAdmin')?.previousElementSibling;if(statLabel)statLabel.textContent='Roost Club Members';
  const form=$('cartonCustomerName')?.closest('.form');
  if(form&&!$('cartonCustomerEmail')){
    const field=document.createElement('div');field.className='field';field.innerHTML='<label>Email</label><input id="cartonCustomerEmail" type="email" placeholder="Email">';
    form.insertBefore(field,$('addCartonCustomer'));
    form.style.gridTemplateColumns='repeat(3,minmax(0,1fr)) auto';
  }
  const add=$('addCartonCustomer');if(add){add.textContent='Add Member';add.onclick=()=>{
    const name=$('cartonCustomerName').value.trim(),phone=$('cartonCustomerPhone').value.trim(),email=$('cartonCustomerEmail').value.trim().toLowerCase();
    if(!name)return alert('Enter the customer name.');if(phone&&phoneDigits(phone).length<7)return alert('Enter a valid phone number.');if(email&&!validEmail(email))return alert('Enter a valid email address.');
    if(data.customers.some(c=>c.name.toLowerCase()===name.toLowerCase()))return alert('That customer is already saved.');
    if(phone&&data.customers.some(c=>phoneDigits(c.phone)===phoneDigits(phone)))return alert('That phone number is already saved.');
    if(email&&data.customers.some(c=>String(c.email||'').toLowerCase()===email))return alert('That email is already saved.');
    data.customers.push({id:uid('customer'),name,phone,email,pickupAlerts:false,storeUpdates:false,cartonCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString()});
    $('cartonCustomerName').value='';$('cartonCustomerPhone').value='';$('cartonCustomerEmail').value='';save();
  }}
  tab.querySelectorAll('[data-carton-edit]').forEach(btn=>{const id=btn.dataset.cartonEdit;btn.onclick=()=>editMemberV4(id)});
  tab.querySelectorAll('[data-carton-edit]').forEach(btn=>{const row=btn.closest('.row'),c=data.customers.find(x=>x.id===btn.dataset.cartonEdit);if(!row||!c)return;const sub=row.querySelector('.rsub');if(sub)sub.innerHTML=`${esc(c.phone||'No phone')}<div class="member-contact">${esc(c.email||'No email')}</div>`});
}
function editMemberV4(id){
  const c=data.customers.find(x=>x.id===id);if(!c)return;
  const name=prompt('Member name:',c.name);if(name===null)return;const clean=name.trim();if(!clean)return alert('Name cannot be blank.');
  const phone=prompt('Phone:',c.phone||'');if(phone===null)return;if(phone&&phoneDigits(phone).length<7)return alert('Enter a valid phone number.');
  const email=prompt('Email:',c.email||'');if(email===null)return;const e=email.trim().toLowerCase();if(e&&!validEmail(e))return alert('Enter a valid email address.');
  if(data.customers.some(x=>x.id!==id&&x.name.toLowerCase()===clean.toLowerCase()))return alert('Another member already has that name.');
  if(phone&&data.customers.some(x=>x.id!==id&&phoneDigits(x.phone)===phoneDigits(phone)))return alert('That phone number belongs to another member.');
  if(e&&data.customers.some(x=>x.id!==id&&String(x.email||'').toLowerCase()===e))return alert('That email belongs to another member.');
  c.name=clean;c.phone=phone.trim();c.email=e;c.updatedAt=new Date().toISOString();save();
}

const home=document.createElement('main');home.id='kioskHome';home.className='kiosk-home';home.innerHTML=`<h1>Welcome to Rise & Roost</h1><p class="lead">What would you like to do?</p><div class="kiosk-grid"><button class="kiosk-choice" id="homeShop">Shop<span>Browse the store and check out</span></button><button class="kiosk-choice" id="homePickup">Pickup Order<span>Pick up an order Danielle prepared</span></button><button class="kiosk-choice" id="homeRoost">The Roost<span>Carton rewards and member signup</span></button></div>`;
document.querySelector('.store-tabs').insertAdjacentElement('afterend',home);

const roost=document.createElement('main');roost.id='roostHub';roost.className='roost-hub hidden';roost.innerHTML=`<button class="btn ghost back-home" id="roostHome">← Home</button><section class="card pickup-customer"><h2>The Roost</h2><p class="hint">Carton rewards for our regular customers.</p><div class="roost-actions"><button class="roost-action" id="roostReturn">Return Egg Cartons<span>Already a member? Add your carton credits.</span></button><button class="roost-action" id="roostJoin">Join the Roost<span>Sign up with your name, phone, and email.</span></button></div></section>`;
home.insertAdjacentElement('afterend',roost);

const join=document.createElement('main');join.id='joinView';join.className='join-wrap hidden';join.innerHTML=`<button class="btn ghost back-home" id="joinBack">← The Roost</button><section class="card pickup-customer"><h2>Join the Roost</h2><p class="hint">Sign up once and keep your carton credits for future visits.</p><div class="join-form"><div class="field"><label>Name</label><input id="joinName" autocomplete="name" placeholder="Your name"></div><div class="field"><label>Phone number</label><input id="joinPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Phone number"></div><div class="field"><label>Email</label><input id="joinEmail" type="email" inputmode="email" autocomplete="email" placeholder="Email address"></div><label class="consent"><input id="joinPickupAlerts" type="checkbox" checked><span><strong>Pickup alerts</strong><br><span class="hint">Use my contact information for pickup-order notifications.</span></span></label><label class="consent"><input id="joinStoreUpdates" type="checkbox"><span><strong>Store updates & specials</strong><br><span class="hint">I want occasional Rise & Roost updates.</span></span></label><button class="btn primary wide pay" id="joinSubmit">Join the Roost</button></div><div id="joinResult"></div></section>`;
roost.insertAdjacentElement('afterend',join);

addBackButton($('shopView'));addBackButton($('pickupView'));addBackButton($('cartonView'));
$('homeShop').onclick=showShopV4;$('homePickup').onclick=showPickupV4;$('homeRoost').onclick=showRoostHub;$('roostHome').onclick=showKioskHome;$('roostReturn').onclick=()=>showCartonsV4();$('roostJoin').onclick=showJoin;$('joinBack').onclick=showRoostHub;$('joinSubmit').onclick=joinRoost;

const oldRenderAllV4=renderAll;
renderAll=function(){ensureV4Customers();oldRenderAllV4();postProcessAdminCustomers()};

const oldShowTabV4=showTab;
showTab=function(name){oldShowTabV4(name);if(name==='customers')setTimeout(postProcessAdminCustomers,0)};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>showTab(t.dataset.tab));

// Change customer-facing wording while keeping the reward mechanics intact.
const cartonHeading=$('cartonView')?.querySelector('h2');if(cartonHeading)cartonHeading.textContent='Roost Carton Rewards';
const cartonHint=$('cartonView')?.querySelector('p.hint');if(cartonHint)cartonHint.textContent='Choose your name, enter the number of clean reusable cartons, and collect your credits.';

// v4 backup includes member contact/preferences because they are part of the saved data object.
$('exportBackup').onclick=()=>{const blob=new Blob([JSON.stringify({version:4,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rise-and-roost-v4-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};

renderAll();showKioskHome();
})();