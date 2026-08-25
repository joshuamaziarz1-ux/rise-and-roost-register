(()=>{
function ensureCartonData(){
  data.customers=Array.isArray(data.customers)?data.customers:[];
  data.cartonReturns=Array.isArray(data.cartonReturns)?data.cartonReturns:[];
  data.cartonRewards=Array.isArray(data.cartonRewards)?data.cartonRewards:[];
  data.cartonSettings=data.cartonSettings&&typeof data.cartonSettings==='object'?data.cartonSettings:{};
  const n=Math.floor(Number(data.cartonSettings.cartonsPerFreeDozen||12));
  data.cartonSettings.cartonsPerFreeDozen=Number.isFinite(n)&&n>0?n:12;
  data.cartonSettings.rewardItemId=data.cartonSettings.rewardItemId||'';
  data.customers.forEach(c=>{
    c.cartonCredits=Math.max(0,Math.floor(Number(c.cartonCredits||0)));
    c.totalCartons=Math.max(0,Math.floor(Number(c.totalCartons||0)));
    c.freeDozens=Math.max(0,Math.floor(Number(c.freeDozens||0)));
  });
}
ensureCartonData();persist();

const customer=id=>data.customers.find(c=>c.id===id);
const threshold=()=>Math.max(1,Math.floor(Number(data.cartonSettings.cartonsPerFreeDozen||12)));
const rewardItem=()=>item(data.cartonSettings.rewardItemId);
const todayString=()=>new Date().toDateString();
const cartonsToday=()=>data.cartonReturns.filter(r=>new Date(r.date).toDateString()===todayString()).reduce((s,r)=>s+Number(r.qty||0),0);
const cartonsTotal=()=>data.cartonReturns.reduce((s,r)=>s+Number(r.qty||0),0);
const rewardsTotal=()=>data.cartonRewards.length;

function customerOptions(selected=''){
  return [...data.customers].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
}
function renderCartonStore(){
  const sel=$('cartonCustomerSelect');if(!sel)return;
  const current=sel.value;
  sel.innerHTML=data.customers.length?`<option value="">Choose your name</option>${customerOptions(current)}`:'<option value="">No regular customers saved yet</option>';
  if(current&&customer(current))sel.value=current;
  renderCartonCustomerInfo();
}
function renderCartonCustomerInfo(){
  const box=$('cartonCustomerInfo');if(!box)return;
  const c=customer($('cartonCustomerSelect')?.value);
  if(!c){box.innerHTML=data.customers.length?'<div class="empty">Choose your name to see your carton credits.</div>':'<div class="empty">Danielle can add regular customers from Admin → Carton Club.</div>';return}
  const need=threshold(),eligible=Math.floor(c.cartonCredits/need),ri=rewardItem(),av=ri?available(ri):0,rem=c.cartonCredits%need;
  const next=rem===0?need:need-rem;
  const progress=c.cartonCredits>=need?`${eligible} free dozen${eligible===1?'':'s'} available`:`${next} more carton${next===1?'':'s'} until a free dozen`;
  box.innerHTML=`<div class="pickup-result"><h3>${esc(c.name)}</h3><div class="split" style="margin-top:12px"><div class="callout"><div class="rsub">Carton Credits</div><div class="big" style="font-size:2.3rem;margin:4px 0">${c.cartonCredits}</div><strong>${esc(progress)}</strong></div><div class="callout"><div class="rsub">Lifetime Returned</div><div style="font-size:1.8rem;font-weight:950;margin-top:6px">${c.totalCartons}</div><div class="rsub">Free dozens redeemed: ${c.freeDozens}</div></div></div>${c.cartonCredits>=need?`<button class="btn primary wide" id="redeemCartonReward" ${!ri||av<1?'disabled':''}>Redeem 1 Free Dozen</button>${!ri?'<p class="hint">The egg reward item has not been selected in Admin yet.</p>':av<1?'<p class="hint">The reward egg item is currently sold out.</p>':`<p class="hint">Reward: ${esc(ri.name)} · uses ${need} carton credits</p>`}`:''}</div>`;
  $('redeemCartonReward')?.addEventListener('click',()=>redeemReward(c.id));
}
function changeCartonQty(d){const q=$('cartonQty');if(!q)return;q.value=Math.max(1,Math.floor(Number(q.value||1))+d)}
function submitCartons(){
  const c=customer($('cartonCustomerSelect').value),qty=Math.floor(Number($('cartonQty').value||0));
  if(!c)return alert('Choose your name first.');
  if(!Number.isFinite(qty)||qty<1)return alert('Enter how many reusable egg cartons you are returning.');
  if(!confirm(`Return ${qty} clean, reusable egg carton${qty===1?'':'s'} for ${c.name}?`))return;
  c.cartonCredits+=qty;c.totalCartons+=qty;c.updatedAt=new Date().toISOString();
  data.cartonReturns.unshift({id:uid('carton'),date:new Date().toISOString(),customerId:c.id,customerName:c.name,qty});
  if(data.cartonReturns.length>2000)data.cartonReturns.length=2000;
  persist();renderAll();$('cartonCustomerSelect').value=c.id;$('cartonQty').value=1;renderCartonCustomerInfo();
  const free=Math.floor(c.cartonCredits/threshold());
  alert(`Thank you! ${qty} carton${qty===1?'':'s'} added.\n\n${c.name} now has ${c.cartonCredits} carton credits.${free?`\nFree dozen available: ${free}`:''}`);
}
function redeemReward(customerId){
  const c=customer(customerId),need=threshold(),ri=rewardItem();
  if(!c||c.cartonCredits<need)return alert('There are not enough carton credits yet.');
  if(!ri)return alert('Danielle needs to select which egg item is used for the free-dozen reward in Admin.');
  if(available(ri)<1)return alert(`${ri.name} is currently sold out.`);
  if(!confirm(`Use ${need} carton credits for 1 free dozen of ${ri.name}?`))return;
  c.cartonCredits-=need;c.freeDozens+=1;c.updatedAt=new Date().toISOString();
  ri.stock=Math.max(0,Number(ri.stock)-1);logStock(ri,-1,`Carton Club free dozen — ${c.name}`);
  data.cartonRewards.unshift({id:uid('reward'),date:new Date().toISOString(),customerId:c.id,customerName:c.name,itemId:ri.id,itemName:ri.name,creditsUsed:need});
  recordSale([{itemId:ri.id,itemName:ri.name,brandId:ri.brandId,brandName:brand(ri.brandId)?.name||'Unknown',price:0,qty:1}],{payment:'reward',source:'carton-club'});
  persist();renderAll();$('cartonCustomerSelect').value=c.id;renderCartonCustomerInfo();
  alert(`Free dozen redeemed for ${c.name}. ${c.cartonCredits} carton credits remain.`);
}

function renderCartonAdmin(){
  if(!$('customersTab'))return;
  $('cartonTodayAdmin').textContent=cartonsToday();$('cartonTotalAdmin').textContent=cartonsTotal();$('cartonRewardsAdmin').textContent=rewardsTotal();$('cartonMembersAdmin').textContent=data.customers.length;
  const rewardSel=$('cartonRewardItem');
  if(rewardSel){
    const current=data.cartonSettings.rewardItemId;
    rewardSel.innerHTML=`<option value="">Select egg product</option>${data.items.map(i=>`<option value="${i.id}" ${i.id===current?'selected':''}>${esc(brand(i.brandId)?.name||'Unknown')} — ${esc(i.name)}</option>`).join('')}`;
    $('cartonThreshold').value=threshold();
  }
  $('cartonCustomerList').innerHTML=data.customers.length?[...data.customers].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<div class="row"><div><div class="rtitle">${esc(c.name)}</div><div class="rsub">${esc(c.phone||'No phone saved')}</div></div><div><strong>${c.cartonCredits} credits</strong><div class="rsub">${c.totalCartons} returned · ${c.freeDozens} free dozen${c.freeDozens===1?'':'s'}</div></div><div class="row-actions"><button class="btn small" data-carton-adjust="${c.id}">Adjust Credits</button><button class="btn small ghost" data-carton-edit="${c.id}">Edit</button><button class="btn small danger" data-carton-delete="${c.id}">Delete</button></div></div>`).join(''):'<div class="empty">No regular customers yet.</div>';
  $('cartonCustomerList').querySelectorAll('[data-carton-adjust]').forEach(b=>b.onclick=()=>adjustCustomerCredits(b.dataset.cartonAdjust));
  $('cartonCustomerList').querySelectorAll('[data-carton-edit]').forEach(b=>b.onclick=()=>editCustomer(b.dataset.cartonEdit));
  $('cartonCustomerList').querySelectorAll('[data-carton-delete]').forEach(b=>b.onclick=()=>deleteCustomer(b.dataset.cartonDelete));
  const history=[...data.cartonReturns].slice(0,100);
  $('cartonHistory').innerHTML=history.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th>Cartons</th></tr></thead><tbody>${history.map(r=>`<tr><td>${new Date(r.date).toLocaleString()}</td><td>${esc(r.customerName)}</td><td><strong>+${r.qty}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No carton returns recorded yet.</div>';
  const rewards=[...data.cartonRewards].slice(0,100);
  $('cartonRewardHistory').innerHTML=rewards.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th>Reward</th><th>Credits Used</th></tr></thead><tbody>${rewards.map(r=>`<tr><td>${new Date(r.date).toLocaleString()}</td><td>${esc(r.customerName)}</td><td>${esc(r.itemName)}</td><td>${r.creditsUsed}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No free dozens redeemed yet.</div>';
}
function addCustomer(){
  const name=$('cartonCustomerName').value.trim(),phone=$('cartonCustomerPhone').value.trim();
  if(!name)return alert('Enter the customer name.');
  if(data.customers.some(c=>c.name.toLowerCase()===name.toLowerCase()))return alert('That customer is already saved.');
  data.customers.push({id:uid('customer'),name,phone,cartonCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString()});
  $('cartonCustomerName').value='';$('cartonCustomerPhone').value='';save();
}
function adjustCustomerCredits(id){
  const c=customer(id);if(!c)return;const v=prompt(`Set ${c.name}'s carton credit balance:`,String(c.cartonCredits));if(v===null)return;const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<0)return alert('Enter zero or a positive whole number.');c.cartonCredits=n;c.updatedAt=new Date().toISOString();save();
}
function editCustomer(id){
  const c=customer(id);if(!c)return;const name=prompt('Customer name:',c.name);if(name===null)return;const clean=name.trim();if(!clean)return alert('Customer name cannot be blank.');if(data.customers.some(x=>x.id!==id&&x.name.toLowerCase()===clean.toLowerCase()))return alert('Another customer already has that name.');const phone=prompt('Phone (optional):',c.phone||'');if(phone===null)return;c.name=clean;c.phone=phone.trim();c.updatedAt=new Date().toISOString();save();
}
function deleteCustomer(id){
  const c=customer(id);if(!c)return;if(!confirm(`Delete ${c.name} from the regular customer list?\n\nCarton return and reward history will stay saved.`))return;data.customers=data.customers.filter(x=>x.id!==id);save();
}
function saveCartonSettings(){
  const n=Math.floor(Number($('cartonThreshold').value)),rewardId=$('cartonRewardItem').value;
  if(!Number.isFinite(n)||n<1)return alert('Cartons per free dozen must be at least 1.');
  data.cartonSettings.cartonsPerFreeDozen=n;data.cartonSettings.rewardItemId=rewardId;persist();renderAll();alert('Carton Club settings saved.');
}

const oldShowStoreTab=showStoreTab;
showStoreTab=function(name){
  if(name==='cartons'){
    document.querySelectorAll('.store-tab').forEach(t=>t.classList.toggle('active',t.dataset.storetab==='cartons'));
    $('shopView').classList.add('hidden');$('pickupView').classList.add('hidden');$('cartonView').classList.remove('hidden');renderCartonStore();
  }else{$('cartonView').classList.add('hidden');oldShowStoreTab(name)}
};
const oldShowTab=showTab;
showTab=function(name){
  if(name==='customers'){
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='customers'));
    ['dashboard','items','pickups','sales','inventory','settings'].forEach(n=>$(n+'Tab').classList.add('hidden'));
    $('customersTab').classList.remove('hidden');renderCartonAdmin();
  }else{$('customersTab').classList.add('hidden');oldShowTab(name)}
};
const oldRenderAll=renderAll;
renderAll=function(){ensureCartonData();oldRenderAll();renderCartonStore();renderCartonAdmin()};

$('cartonMinus').onclick=()=>changeCartonQty(-1);$('cartonPlus').onclick=()=>changeCartonQty(1);$('cartonSubmit').onclick=submitCartons;$('cartonCustomerSelect').onchange=renderCartonCustomerInfo;
$('addCartonCustomer').onclick=addCustomer;$('saveCartonSettings').onclick=saveCartonSettings;
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>showTab(t.dataset.tab));document.querySelectorAll('.store-tab').forEach(t=>t.onclick=()=>showStoreTab(t.dataset.storetab));

$('exportBackup').onclick=()=>{const blob=new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rise-and-roost-v3-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
renderAll();
})();
