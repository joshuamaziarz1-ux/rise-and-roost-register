(()=>{
const normName=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const memberByName=name=>Array.isArray(data.customers)?data.customers.find(c=>normName(c.name)===normName(name)):null;
const memberById=id=>Array.isArray(data.customers)?data.customers.find(c=>c.id===id):null;

function saleCustomerInfo(s){
  if(s.customerType==='roost-member'||s.customerId){
    const c=memberById(s.customerId)||memberByName(s.customerName);
    return {type:'member',name:c?.name||s.customerName||'Roost Member'};
  }
  if(s.source==='carton-club'){
    const c=memberById(s.customerId)||memberByName(s.customerName);
    if(c)return {type:'member',name:c.name};
  }
  if(s.source==='pickup'){
    const p=(data.pickups||[]).find(x=>x.id===s.pickupId);
    const c=memberById(p?.customerId)||memberByName(p?.customerName||s.customerName);
    if(c)return {type:'member',name:c.name};
    return {type:'guest',name:p?.customerName||s.customerName||''};
  }
  return {type:'guest',name:s.customerName||''};
}

// Make future pickup and reward sales carry member/guest identity too.
const priorRecordSaleV44=recordSale;
recordSale=function(lines,opts={}){
  const sale=priorRecordSaleV44(lines,opts);
  if(opts.source==='pickup'){
    const p=(data.pickups||[]).find(x=>x.id===opts.pickupId);
    const c=memberById(p?.customerId)||memberByName(p?.customerName);
    if(c){sale.customerId=c.id;sale.customerName=c.name;sale.customerType='roost-member'}
    else{sale.customerName=p?.customerName||'';sale.customerType='guest'}
  }
  if(opts.source==='carton-club'){
    const r=(data.cartonRewards||[])[0],c=memberById(r?.customerId)||memberByName(r?.customerName);
    if(c){sale.customerId=c.id;sale.customerName=c.name;sale.customerType='roost-member'}
  }
  persist();
  return sale;
};

// Replace only the Sales History table. Vendor totals continue using the existing renderer.
const priorRenderSalesV44=renderSales;
renderSales=function(){
  priorRenderSalesV44();
  const box=$('salesHistory');if(!box)return;
  if(!data.sales.length){box.innerHTML='<div class="empty">No completed sales yet.</div>';return}
  box.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Type</th><th>Total</th><th></th></tr></thead><tbody>${data.sales.slice(0,150).map(s=>{
    const d=new Date(s.date),who=saleCustomerInfo(s),lines=s.items.map(i=>`${i.qty}× ${esc(i.itemName)} <span class="muted">(${esc(i.brandName)})</span>`).join('<br>');
    const customer=who.type==='member'?`<span class="badge on">MEMBER</span><br><strong>${esc(who.name)}</strong>`:`<span class="badge">GUEST</span>${who.name?`<br><span class="muted">${esc(who.name)}</span>`:''}`;
    const source=s.source==='pickup'?'Pickup':s.source==='carton-club'?'Reward':'Store',pay=s.payment==='cash'?'Cash':s.payment==='prepaid'?'Prepaid':s.payment==='reward'?'Free Reward':esc(s.payment||'');
    return `<tr style="${s.voided?'opacity:.5':''}"><td>${d.toLocaleDateString()}<br><span class="muted">${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span></td><td>${customer}</td><td>${lines}${s.voided?'<br><strong>VOIDED</strong>':''}</td><td>${source}${pay?` · ${pay}`:''}</td><td class="money">${money(s.total)}</td><td>${s.voided?'':`<button class="btn tiny danger" data-void="${s.id}">Void</button>`}</td></tr>`
  }).join('')}</tbody></table></div>`;
  box.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>voidSale(b.dataset.void));
};

function buildHistoryModal(){
  if($('memberHistoryOverlay'))return;
  const o=document.createElement('div');o.id='memberHistoryOverlay';o.className='overlay hidden';o.innerHTML=`<div class="modal member-history-modal"><div class="member-history-head"><div><h2 id="memberHistoryName">Member History</h2><div class="rsub" id="memberHistoryContact"></div></div><button class="btn ghost" id="closeMemberHistory">Close</button></div><div id="memberHistoryBody"></div></div>`;document.body.appendChild(o);
  $('closeMemberHistory').onclick=()=>o.classList.add('hidden');o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
}

function memberSales(c){return (data.sales||[]).filter(s=>!s.voided&&(s.customerId===c.id||(s.customerType==='roost-member'&&normName(s.customerName)===normName(c.name))))}
function memberReturns(c){return (data.cartonReturns||[]).filter(r=>r.customerId===c.id||normName(r.customerName)===normName(c.name))}
function memberRewards(c){return (data.cartonRewards||[]).filter(r=>r.customerId===c.id||normName(r.customerName)===normName(c.name))}
function memberPickups(c){return (data.pickups||[]).filter(p=>p.customerId===c.id||normName(p.customerName)===normName(c.name))}

function openMemberHistory(id){
  buildHistoryModal();const c=memberById(id);if(!c)return;
  const sales=memberSales(c),returns=memberReturns(c),rewards=memberRewards(c),pickups=memberPickups(c);
  const spent=sales.reduce((n,s)=>n+Number(s.total||0),0),units=sales.reduce((n,s)=>n+s.items.reduce((a,i)=>a+Number(i.qty||0),0),0);
  const events=[];
  sales.forEach(s=>events.push({date:s.date,type:'Purchase',html:`<strong>${money(s.total)}</strong> · ${s.items.map(i=>`${i.qty}× ${esc(i.itemName)}`).join(', ')}${s.source==='pickup'?' <span class="badge">Pickup</span>':s.source==='carton-club'?' <span class="badge on">Free Reward</span>':''}`}));
  returns.forEach(r=>events.push({date:r.date,type:'Cartons',html:`Returned <strong>${Number(r.qty||0)}</strong> carton${Number(r.qty||0)===1?'':'s'}`}));
  rewards.forEach(r=>events.push({date:r.date,type:'Reward',html:`Redeemed <strong>${esc(r.itemName||'free dozen')}</strong> · ${Number(r.creditsUsed||0)} credits used`}));
  pickups.forEach(p=>events.push({date:p.completed||p.created,type:'Pickup',html:`${p.status==='picked'?'Picked up':p.status==='cancelled'?'Cancelled':p.status==='ready'?'Ready':'Waiting'} · ${p.items.map(i=>`${i.qty}× ${esc(i.itemName)}`).join(', ')} · <strong>${money(pickupTotal(p))}</strong>`}));
  events.sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('memberHistoryName').textContent=c.name;$('memberHistoryContact').textContent=[c.phone,c.email].filter(Boolean).join(' · ')||'No contact information saved';
  $('memberHistoryBody').innerHTML=`<div class="member-history-stats"><div><span>Carton Credits</span><strong>${Number(c.cartonCredits||0)}</strong></div><div><span>Purchases</span><strong>${sales.length}</strong></div><div><span>Items Bought</span><strong>${units}</strong></div><div><span>Total Spent</span><strong>${money(spent)}</strong></div><div><span>Cartons Returned</span><strong>${returns.reduce((n,r)=>n+Number(r.qty||0),0)}</strong></div><div><span>Free Dozens</span><strong>${rewards.length}</strong></div></div><h3 class="history-title">History</h3>${events.length?`<div class="member-timeline">${events.map(e=>{const d=new Date(e.date);return `<div class="member-event"><div><span class="badge">${e.type}</span><div class="rsub">${d.toLocaleDateString()} · ${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div></div><div>${e.html}</div></div>`}).join('')}</div>`:'<div class="empty">No history for this member yet.</div>'}`;
  $('memberHistoryOverlay').classList.remove('hidden');
}

function enhanceMemberRows(){
  const list=$('cartonCustomerList');if(!list)return;
  list.querySelectorAll('[data-carton-edit]').forEach(editBtn=>{
    const id=editBtn.dataset.cartonEdit,actions=editBtn.closest('.row')?.querySelector('.row-actions');if(!actions||actions.querySelector(`[data-member-history="${id}"]`))return;
    const b=document.createElement('button');b.className='btn small primary';b.dataset.memberHistory=id;b.textContent='View History';b.onclick=()=>openMemberHistory(id);actions.insertBefore(b,actions.firstChild);
  });
}

const priorRenderAllV44=renderAll;
renderAll=function(){priorRenderAllV44();setTimeout(()=>{enhanceMemberRows();renderSales()},0)};
const priorShowTabV44=showTab;
showTab=function(name){priorShowTabV44(name);if(name==='customers')setTimeout(enhanceMemberRows,20);if(name==='sales')setTimeout(renderSales,0)};

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>showTab(t.dataset.tab));
const css=document.createElement('style');css.textContent=`.member-history-modal{width:min(900px,calc(100% - 24px));max-width:900px}.member-history-head{display:flex;justify-content:space-between;gap:14px;align-items:start}.member-history-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.member-history-stats>div{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff}.member-history-stats span{display:block;color:var(--muted);font-size:.82rem;font-weight:800}.member-history-stats strong{display:block;font-size:1.45rem;margin-top:4px}.history-title{margin:18px 0 8px}.member-event{display:grid;grid-template-columns:170px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}@media(max-width:700px){.member-history-stats{grid-template-columns:1fr 1fr}.member-event{grid-template-columns:1fr}.member-history-head{flex-direction:column}}`;document.head.appendChild(css);

// Make the active build obvious.
document.title='Rise & Roost Register v4.4';document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost Register v4.4');const adminSub=document.querySelector('#adminScreen .admin-top .sub');if(adminSub)adminSub.textContent='Rise & Roost Register v4.4';const versionStrong=document.querySelector('#settingsTab .danger-zone strong');if(versionStrong)versionStrong.textContent='Rise & Roost Register v4.4';
setTimeout(()=>{enhanceMemberRows();renderSales()},0);
})();
