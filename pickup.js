let rrSalesArchive={year:'',month:'',day:''};
let rrInventoryArchive={year:'',month:'',day:''};
function pickupDraftAvailable(id){const i=item(id);const used=pickupDraft.filter(x=>x.itemId===id).reduce((s,x)=>s+x.qty,0);return Math.max(0,available(i)-used)}
function addPickupLine(){const id=$('pickupItemSelect').value,qty=Math.floor(Number($('pickupQty').value));const i=item(id);if(!i||!Number.isFinite(qty)||qty<1)return alert('Choose an item and quantity.');const existing=pickupDraft.find(x=>x.itemId===id),current=existing?existing.qty:0;if(current+qty>available(i))return alert(`Only ${available(i)} of ${i.name} are available after other pickup reservations.`);if(existing)existing.qty+=qty;else pickupDraft.push({itemId:id,qty});$('pickupQty').value='1';renderPickupDraft()}
function renderPickupDraft(){pickupDraft=pickupDraft.filter(x=>item(x.itemId)&&x.qty>0);$('pickupDraft').innerHTML=pickupDraft.length?pickupDraft.map(x=>{const i=item(x.itemId);return`<div class="draft-row"><div><strong>${esc(i.name)}</strong><div class="rsub">${esc(brand(i.brandId)?.name||'Unknown')} · ${money(i.price)} each</div></div><div><strong>× ${x.qty}</strong></div><button class="btn tiny danger" data-rdraft="${i.id}">Remove</button></div>`}).join(''):'<div class="empty" style="padding:16px">No items added to this pickup order yet.</div>';$('pickupDraft').querySelectorAll('[data-rdraft]').forEach(b=>b.onclick=()=>{pickupDraft=pickupDraft.filter(x=>x.itemId!==b.dataset.rdraft);renderPickupDraft()});$('pickupDraftTotal').textContent=money(pickupDraft.reduce((s,x)=>s+Number(item(x.itemId)?.price||0)*x.qty,0))}
function generateCode(){let code;do{code=Math.random().toString(36).slice(2,7).toUpperCase()}while(data.pickups.some(p=>p.code===code&&['ready','waiting'].includes(p.status)));return code}
function pickupScheduleDefaults(){return {enabled:true,pinLeadMinutes:60,slotMinutes:60,days:[{day:0,enabled:false,times:[]},{day:1,enabled:true,times:['10:00','12:00','14:00','16:00']},{day:2,enabled:true,times:['10:00','12:00','14:00','16:00']},{day:3,enabled:true,times:['10:00','12:00','14:00','16:00']},{day:4,enabled:true,times:['10:00','12:00','14:00','16:00']},{day:5,enabled:true,times:['10:00','12:00','14:00','16:00']},{day:6,enabled:false,times:[]}]}}
function ensurePickupSchedule(){data.settings=data.settings&&typeof data.settings==='object'?data.settings:{};const d=pickupScheduleDefaults();const s=data.settings.pickupSchedule&&typeof data.settings.pickupSchedule==='object'?data.settings.pickupSchedule:d;s.enabled=s.enabled!==false;s.pinLeadMinutes=Math.max(0,Number(s.pinLeadMinutes||60));s.slotMinutes=Math.max(15,Number(s.slotMinutes||60));s.days=Array.isArray(s.days)?s.days:d.days;for(let i=0;i<7;i++){let row=s.days.find(x=>Number(x.day)===i);if(!row){row={day:i,enabled:false,times:[]};s.days.push(row)}row.enabled=!!row.enabled;row.times=Array.isArray(row.times)?row.times.filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x))).sort():[]}data.settings.pickupSchedule=s;return s}
function pickupDateTimeLabel(value){if(!value)return 'No pickup time';const d=new Date(value);if(Number.isNaN(d.getTime()))return 'No pickup time';return d.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function pickupPinStatus(p){if(!p.scheduledAt)return {text:'No pickup time',cls:'off'};if(p.pinTextedAt)return {text:'PIN sent',cls:'on'};if(!p.doorPin)return {text:'PIN needed',cls:'low'};const lead=ensurePickupSchedule().pinLeadMinutes||60;const due=new Date(p.scheduledAt).getTime()-lead*60000;return Date.now()>=due?{text:'PIN text due',cls:'low'}:{text:'PIN scheduled',cls:''}}
function pickupAvailableSlots(daysAhead=45){
  const s=ensurePickupSchedule();if(!s.enabled)return[];
  const used=new Set((data.pickups||[]).filter(p=>['ready','waiting'].includes(p.status)&&p.scheduledAt).map(p=>new Date(p.scheduledAt).getTime()));
  const out=[],now=new Date();now.setSeconds(0,0);
  for(let add=0;add<=daysAhead;add++){
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+add);
    const rule=s.days.find(x=>Number(x.day)===d.getDay());if(!rule?.enabled)continue;
    for(const tm of rule.times){
      const [h,m]=tm.split(':').map(Number),dt=new Date(d);dt.setHours(h,m,0,0);
      if(dt.getTime()<=Date.now())continue;
      if(used.has(dt.getTime()))continue;
      out.push({value:dt.toISOString(),label:dt.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})});
    }
  }
  return out;
}
function renderPickupSlotSelect(){
  const sel=$('pickupSlot');if(!sel)return;const current=sel.value,slots=pickupAvailableSlots();
  sel.innerHTML=slots.length?'<option value="">Choose pickup day & time</option>'+slots.map(x=>`<option value="${x.value}">${esc(x.label)}</option>`).join(''):'<option value="">No pickup times available</option>';
  if(current&&slots.some(x=>x.value===current))sel.value=current;
}
function renderPickupScheduleSettings(){
  const wrap=$('pickupScheduleSettings');if(!wrap)return;const s=ensurePickupSchedule(),names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  wrap.innerHTML=`<div class="pickup-schedule-grid">${names.map((name,day)=>{const r=s.days.find(x=>Number(x.day)===day)||{enabled:false,times:[]};return`<div class="pickup-schedule-row"><label class="pickup-day-toggle"><input type="checkbox" data-pickup-day-enabled="${day}" ${r.enabled?'checked':''}><strong>${name}</strong></label><input data-pickup-day-times="${day}" value="${esc(r.times.join(', '))}" placeholder="10:00, 12:00, 14:00"></div>`}).join('')}</div><div class="form two" style="margin-top:12px"><div class="field"><label>Text PIN this many minutes before pickup</label><input id="pickupPinLead" type="number" min="0" step="5" value="${s.pinLeadMinutes}"></div><div class="field"><label>Pickup window length (minutes)</label><input id="pickupSlotMinutes" type="number" min="15" step="15" value="${s.slotMinutes}"></div></div><button class="btn primary" id="savePickupSchedule" style="margin-top:12px">Save Pickup Schedule</button>`;
  $('savePickupSchedule').onclick=()=>{const next=ensurePickupSchedule();for(let day=0;day<7;day++){const row=next.days.find(x=>Number(x.day)===day);row.enabled=!!wrap.querySelector('[data-pickup-day-enabled="'+day+'"]')?.checked;row.times=String(wrap.querySelector('[data-pickup-day-times="'+day+'"]')?.value||'').split(',').map(x=>x.trim()).filter(Boolean).filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)).sort()}next.pinLeadMinutes=Math.max(0,Number($('pickupPinLead').value||60));next.slotMinutes=Math.max(15,Number($('pickupSlotMinutes').value||60));data.settings.pickupSchedule=next;save();renderPickupSlotSelect();alert('Pickup schedule saved.')}
}
function createPickup(){const name=$('pickupName').value.trim(),phone=$('pickupPhone').value.trim(),slot=$('pickupSlot')?.value||'',doorPin=$('pickupDoorPin')?.value.trim()||'';if(!name)return alert('Enter the customer name.');if(String(phone).replace(/\D/g,'').length<7)return alert('Enter a valid phone number.');if(!slot)return alert('Choose a pickup day and time.');if(doorPin&&!/^\d{4,8}$/.test(doorPin))return alert('Door PIN should be 4 to 8 digits.');if(!pickupDraft.length)return alert('Add at least one item to the pickup order.');for(const x of pickupDraft){const i=item(x.itemId);if(x.qty>available(i))return alert(`${i.name} no longer has enough available inventory.`)}const p={id:uid('pickup'),code:generateCode(),customerName:name,phone,note:$('pickupNote').value.trim(),status:$('pickupStatus').value,paid:$('pickupPaid').value==='yes',created:new Date().toISOString(),completed:null,scheduledAt:slot,doorPin,pinTextedAt:null,items:pickupDraft.map(x=>{const i=item(x.itemId);return{itemId:i.id,itemName:i.name,brandId:i.brandId,brandName:brand(i.brandId)?.name||'Unknown',price:Number(i.price),qty:x.qty}})};data.pickups.unshift(p);pickupDraft=[];$('pickupName').value='';$('pickupPhone').value='';$('pickupNote').value='';if($('pickupDoorPin'))$('pickupDoorPin').value='';$('pickupStatus').value='waiting';$('pickupPaid').value='no';save();renderPickupSlotSelect();alert(`Pickup order created.\n\nCustomer: ${p.customerName}\nPickup: ${pickupDateTimeLabel(p.scheduledAt)}\nPickup code: ${p.code}`)}
function pickupTotal(p){return p.items.reduce((s,i)=>s+Number(i.price)*Number(i.qty),0)}
function renderPickups(){renderPickupScheduleSettings();renderPickupSlotSelect();const active=data.pickups.filter(p=>['ready','waiting'].includes(p.status)).sort((a,b)=>new Date(a.scheduledAt||a.created)-new Date(b.scheduledAt||b.created)),history=data.pickups.filter(p=>['picked','cancelled'].includes(p.status));$('activePickupList').innerHTML=active.length?active.map(p=>pickupAdminCard(p)).join(''):'<div class="empty">No active pickup orders.</div>';$('pickupHistory').innerHTML=history.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Pickup</th><th>Status</th><th>Total</th><th>Date</th></tr></thead><tbody>${history.slice(0,100).map(p=>`<tr><td><strong>${esc(p.customerName)}</strong></td><td>${esc(pickupDateTimeLabel(p.scheduledAt))}</td><td><span class="status ${p.status}">${p.status==='picked'?'Picked Up':'Cancelled'}</span></td><td class="money">${money(pickupTotal(p))}</td><td>${new Date(p.completed||p.created).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No pickup history yet.</div>';$('activePickupList').querySelectorAll('[data-pstatus]').forEach(b=>b.onclick=()=>setPickupStatus(b.dataset.pickup,b.dataset.pstatus));$('activePickupList').querySelectorAll('[data-pcancel]').forEach(b=>b.onclick=()=>cancelPickup(b.dataset.pcancel));$('activePickupList').querySelectorAll('[data-pcomplete]').forEach(b=>b.onclick=()=>adminCompletePickup(b.dataset.pcomplete));$('activePickupList').querySelectorAll('[data-pin-texted]').forEach(b=>b.onclick=()=>{const p=data.pickups.find(x=>x.id===b.dataset.pinTexted);if(!p)return;p.pinTextedAt=new Date().toISOString();save()});$('activePickupList').querySelectorAll('[data-set-pin]').forEach(b=>b.onclick=()=>setPickupDoorPin(b.dataset.setPin))}
function pickupAdminCard(p){const lines=p.items.map(i=>`${i.qty}× ${esc(i.itemName)}`).join(', '),pin=pickupPinStatus(p);return`<div class="row pickup-appt-row" data-pickup="${p.id}"><div><div class="rtitle">${esc(p.customerName)}</div><div class="rsub"><strong>${esc(pickupDateTimeLabel(p.scheduledAt))}</strong> · ${esc(p.phone||'No phone')}</div><div class="rsub">${lines}${p.note?` · Note: ${esc(p.note)}`:''}</div><div class="rsub">Pickup code: ${esc(p.code)} · Door PIN: <strong>${p.doorPin?esc(p.doorPin):'Not entered'}</strong></div></div><div><span class="status ${p.status}">${p.status==='ready'?'Ready':'Scheduled'}</span> <span class="badge ${p.paid?'on':'off'}">${p.paid?'Paid':'Not Paid'}</span><div style="margin-top:6px"><span class="badge ${pin.cls}">${esc(pin.text)}</span></div><div class="rsub">${money(pickupTotal(p))}</div></div><div class="row-actions"><button class="btn small ghost" data-set-pin="${p.id}">${p.doorPin?'Change PIN':'Set Door PIN'}</button>${p.status==='waiting'?`<button class="btn small" data-pstatus="ready" data-pickup="${p.id}">Mark Ready</button>`:`<button class="btn small ghost" data-pstatus="waiting" data-pickup="${p.id}">Back to Scheduled</button>`}${p.doorPin&&!p.pinTextedAt?`<button class="btn small" data-pin-texted="${p.id}">Mark PIN Texted</button>`:''}<button class="btn small primary" data-pcomplete="${p.id}">Complete Pickup</button><button class="btn small danger" data-pcancel="${p.id}">Cancel</button></div></div>`}
function setPickupDoorPin(id){const p=data.pickups.find(x=>x.id===id);if(!p)return;const value=prompt('Temporary door PIN (4–8 digits):',p.doorPin||'');if(value===null)return;const pin=value.trim();if(pin&&!/^\d{4,8}$/.test(pin))return alert('Door PIN should be 4 to 8 digits.');p.doorPin=pin;p.pinTextedAt=null;save()}
function setPickupStatus(id,status){const p=data.pickups.find(x=>x.id===id);if(!p)return;p.status=status;save()}
function cancelPickup(id){const p=data.pickups.find(x=>x.id===id);if(!p)return;if(confirm(`Cancel pickup order for ${p.customerName}?\n\nReserved inventory will become available again.`)){p.status='cancelled';p.completed=new Date().toISOString();save()}}
function completePickup(p,customerFlow=false){if(!p||!['ready','waiting'].includes(p.status))return;for(const line of p.items){const i=item(line.itemId);if(!i||Number(i.stock)<Number(line.qty))return alert(`${line.itemName} no longer has enough on-hand inventory. Adjust inventory before completing this pickup.`)}if(!p.paid&&!customerFlow&&!confirm(`${p.customerName} owes ${money(pickupTotal(p))}.\n\nConfirm exact cash has been placed in the cash box?`))return;for(const line of p.items){const i=item(line.itemId);i.stock=Math.max(0,Number(i.stock)-Number(line.qty));logStock(i,-Number(line.qty),`Pickup order ${p.code}`)}recordSale(p.items,{payment:p.paid?'prepaid':'cash',source:'pickup',pickupId:p.id});p.status='picked';p.completed=new Date().toISOString();persist();renderAll();if(customerFlow){$('pickupCustomerResult').innerHTML=`<div class="pickup-result" style="text-align:center"><h3>Thank you, ${esc(p.customerName)}!</h3><p>Your pickup is complete.</p></div>`}else alert('Pickup completed.')}
function adminCompletePickup(id){completePickup(data.pickups.find(x=>x.id===id),false)}
function findPickup(){const code=$('pickupCodeInput').value.trim().toUpperCase();if(!code)return alert('Enter your pickup code.');const p=data.pickups.find(x=>x.code.toUpperCase()===code&&x.status==='ready');if(!p){$('pickupCustomerResult').innerHTML='<div class="pickup-result"><strong>Pickup order not found.</strong><p class="hint">Check the code or ask Danielle for help.</p></div>';return}const lines=p.items.map(i=>`<div class="pickup-line"><span>${i.qty}× ${esc(i.itemName)}</span><strong>${money(Number(i.price)*Number(i.qty))}</strong></div>`).join('');$('pickupCustomerResult').innerHTML=`<div class="pickup-result"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><h3>${esc(p.customerName)}</h3><div class="hint">Pickup code ${esc(p.code)}</div></div><span class="status ready">Ready</span></div><div class="pickup-lines">${lines}</div><div class="total"><span>Total</span><span>${money(pickupTotal(p))}</span></div>${p.note?`<div class="notice">Pickup note: ${esc(p.note)}</div>`:''}${p.paid?'<div class="notice"><strong>PAID</strong> — Your order has already been paid for.</div>':`<div class="notice">Please place <strong>${money(pickupTotal(p))}</strong> in the cash box. <strong>No change is available.</strong></div>`}<button class="btn primary wide" id="completeCustomerPickup">${p.paid?'Complete Pickup':'I Paid — Complete Pickup'}</button></div>`;$('completeCustomerPickup').onclick=()=>{if(!p.paid&&!confirm(`Place exactly ${money(pickupTotal(p))} in the cash box, then press OK.`))return;completePickup(p,true)}}
function rrArchiveParts(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  const year=String(d.getFullYear());
  const month=year+'-'+String(d.getMonth()+1).padStart(2,'0');
  const day=month+'-'+String(d.getDate()).padStart(2,'0');
  return {d,year,month,day,monthName:d.toLocaleDateString([],{month:'long'}),dayName:d.toLocaleDateString([],{month:'short',day:'numeric'})};
}
function rrArchiveButtons(values,selected,attr,labelFn){
  return '<div class="rr-archive-buttons">'+values.map(v=>`<button class="rr-archive-btn ${selected===v?'active':''}" ${attr}="${v}">${esc(labelFn(v))}</button>`).join('')+'</div>';
}
function rrSalesInsights(){
  const sales=(data.sales||[]).filter(s=>!s.voided);
  const totalSales=sales.reduce((sum,s)=>sum+Number(s.total||0),0);
  const units=sales.reduce((sum,s)=>sum+(s.items||[]).reduce((x,i)=>x+Number(i.qty||0),0),0);
  const items={};
  const vendors={};
  sales.forEach(s=>(s.items||[]).forEach(i=>{
    const ik=i.itemId||i.itemName, vk=i.brandId||i.brandName||'Unknown';
    if(!items[ik])items[ik]={name:i.itemName||'Item',vendor:i.brandName||'Unknown',units:0,sales:0};
    items[ik].units+=Number(i.qty||0);items[ik].sales+=Number(i.price||0)*Number(i.qty||0);
    if(!vendors[vk])vendors[vk]={name:i.brandName||'Unknown',units:0,sales:0};
    vendors[vk].units+=Number(i.qty||0);vendors[vk].sales+=Number(i.price||0)*Number(i.qty||0);
  }));
  const topItems=Object.values(items).sort((a,b)=>b.units-a.units||b.sales-a.sales).slice(0,6);
  const topVendor=Object.values(vendors).sort((a,b)=>b.sales-a.sales)[0]||null;

  const months={};
  sales.forEach(s=>{
    const p=rrArchiveParts(s.date);if(!p)return;
    months[p.month]=(months[p.month]||0)+Number(s.total||0);
  });
  const monthRows=Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  const maxItem=Math.max(1,...topItems.map(x=>x.units));
  const maxMonth=Math.max(1,...monthRows.map(x=>x[1]));

  const suggestions=[];
  if(!sales.length){
    suggestions.push('Sales insights will build automatically as purchases are recorded.');
  }else{
    if(topItems[0])suggestions.push(`${topItems[0].name} is your current top seller at ${topItems[0].units} unit${topItems[0].units===1?'':'s'} sold.`);
    if(topVendor)suggestions.push(`${topVendor.name} currently leads vendor sales at ${money(topVendor.sales)}.`);
    const topItemObj=topItems[0]&&data.items.find(x=>x.name===topItems[0].name);
    if(topItemObj&&available(topItemObj)<=Number(topItemObj.lowStock||0))suggestions.push(`${topItemObj.name} is a top seller and is at or below its low-stock level — consider restocking it soon.`);
    if(sales.length<5)suggestions.push('There are still only a few completed sales, so trends will become more reliable as more purchases are recorded.');
  }

  let card=document.getElementById('rrSalesInsights');
  if(!card){
    card=document.createElement('div');card.id='rrSalesInsights';card.className='card section rr-sales-insights';
    const salesTab=document.getElementById('salesTab'),first=salesTab?.firstElementChild;
    if(salesTab)salesTab.insertBefore(card,first||null);
  }
  card.innerHTML=`<div class="section-head"><div><h2>Sales Insights</h2><div class="hint">Built from completed Rise & Roost sales.</div></div></div>
    <div class="rr-insight-stats">
      <div><span>Sales to Date</span><strong>${money(totalSales)}</strong></div>
      <div><span>Completed Sales</span><strong>${sales.length}</strong></div>
      <div><span>Units Sold</span><strong>${units}</strong></div>
      <div><span>Top Seller</span><strong>${topItems[0]?esc(topItems[0].name):'—'}</strong></div>
    </div>
    <div class="rr-insight-grid">
      <div class="rr-insight-panel"><h3>Best Sellers</h3>${topItems.length?topItems.map(x=>`<div class="rr-bar-row"><div class="rr-bar-label"><strong>${esc(x.name)}</strong><span>${x.units} sold · ${money(x.sales)}</span></div><div class="rr-bar-track"><span style="width:${Math.max(4,(x.units/maxItem)*100)}%"></span></div></div>`).join(''):'<div class="empty">No sales yet.</div>'}</div>
      <div class="rr-insight-panel"><h3>Sales by Month</h3>${monthRows.length?monthRows.map(([m,v])=>{const d=new Date(m+'-01T12:00:00');return`<div class="rr-bar-row"><div class="rr-bar-label"><strong>${d.toLocaleDateString([],{month:'short',year:'numeric'})}</strong><span>${money(v)}</span></div><div class="rr-bar-track"><span style="width:${Math.max(4,(v/maxMonth)*100)}%"></span></div></div>`}).join(''):'<div class="empty">No monthly trend yet.</div>'}</div>
    </div>
    <div class="rr-smart-summary"><h3>Rise & Roost Summary</h3><ul>${suggestions.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><div class="hint">Customer-feedback suggestions can be added once feedback is connected to the register.</div></div>`;
}
function renderSales(){
  const t={};data.sales.filter(s=>!s.voided).forEach(s=>s.items.forEach(i=>{const k=i.brandId||i.brandName;if(!t[k])t[k]={name:i.brandName,units:0,total:0};t[k].units+=Number(i.qty);t[k].total+=Number(i.price)*Number(i.qty)}));
  const rows=Object.values(t).sort((a,b)=>b.total-a.total);
  $('brandSales').innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Vendor / Brand</th><th>Units Sold</th><th>Gross Sales</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${r.units}</td><td class="money">${money(r.total)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No completed sales yet.</div>';
  rrSalesInsights();

  const all=[...(data.sales||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!all.length){$('salesHistory').innerHTML='<div class="empty">No completed sales yet.</div>';return}
  const parts=all.map(s=>({s,p:rrArchiveParts(s.date)})).filter(x=>x.p);
  const years=[...new Set(parts.map(x=>x.p.year))].sort((a,b)=>b.localeCompare(a));
  if(rrSalesArchive.year&&!years.includes(rrSalesArchive.year))rrSalesArchive={year:'',month:'',day:''};
  const months=rrSalesArchive.year?[...new Set(parts.filter(x=>x.p.year===rrSalesArchive.year).map(x=>x.p.month))].sort((a,b)=>b.localeCompare(a)):[];
  if(rrSalesArchive.month&&!months.includes(rrSalesArchive.month)){rrSalesArchive.month='';rrSalesArchive.day=''}
  const days=rrSalesArchive.month?[...new Set(parts.filter(x=>x.p.month===rrSalesArchive.month).map(x=>x.p.day))].sort((a,b)=>b.localeCompare(a)):[];
  if(rrSalesArchive.day&&!days.includes(rrSalesArchive.day))rrSalesArchive.day='';

  let html='<div class="rr-archive"><div class="rr-archive-level"><strong>Year</strong>'+rrArchiveButtons(years,rrSalesArchive.year,'data-sales-year',v=>v)+'</div>';
  if(rrSalesArchive.year)html+='<div class="rr-archive-level"><strong>Month</strong>'+rrArchiveButtons(months,rrSalesArchive.month,'data-sales-month',v=>new Date(v+'-01T12:00:00').toLocaleDateString([],{month:'long'}))+'</div>';
  if(rrSalesArchive.month)html+='<div class="rr-archive-level"><strong>Day</strong>'+rrArchiveButtons(days,rrSalesArchive.day,'data-sales-day',v=>new Date(v+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}))+'</div>';
  if(rrSalesArchive.day){
    const daySales=parts.filter(x=>x.p.day===rrSalesArchive.day).map(x=>x.s);
    html+=`<div class="table-wrap rr-archive-table"><table class="table"><thead><tr><th>Time</th><th>Items</th><th>Type</th><th>Total</th><th></th></tr></thead><tbody>${daySales.map(s=>{const d=new Date(s.date),lines=s.items.map(i=>`${i.qty}× ${esc(i.itemName)} <span class="muted">(${esc(i.brandName)})</span>`).join('<br>');return`<tr style="${s.voided?'opacity:.5':''}"><td>${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</td><td>${lines}${s.voided?'<br><strong>VOIDED</strong>':''}</td><td>${s.source==='pickup'?'Pickup':'Store'} · ${s.payment==='cash'?'Cash':s.payment==='roostcredit'?'Roost Credit':'Prepaid'}</td><td class="money">${money(s.total)}</td><td>${s.voided?'':`<button class="btn tiny danger" data-void="${s.id}">Void</button>`}</td></tr>`}).join('')}</tbody></table></div>`;
  }
  html+='</div>';
  $('salesHistory').innerHTML=html;
  $('salesHistory').querySelectorAll('[data-sales-year]').forEach(b=>b.onclick=()=>{const v=b.dataset.salesYear;if(rrSalesArchive.year===v)rrSalesArchive={year:'',month:'',day:''};else rrSalesArchive={year:v,month:'',day:''};renderSales()});
  $('salesHistory').querySelectorAll('[data-sales-month]').forEach(b=>b.onclick=()=>{const v=b.dataset.salesMonth;if(rrSalesArchive.month===v){rrSalesArchive.month='';rrSalesArchive.day=''}else{rrSalesArchive.month=v;rrSalesArchive.day=''}renderSales()});
  $('salesHistory').querySelectorAll('[data-sales-day]').forEach(b=>b.onclick=()=>{const v=b.dataset.salesDay;rrSalesArchive.day=rrSalesArchive.day===v?'':v;renderSales()});
  $('salesHistory').querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>voidSale(b.dataset.void));
}
function voidSale(id){const s=data.sales.find(x=>x.id===id);if(!s||s.voided)return;if(!confirm(`Void this ${money(s.total)} sale?\n\nInventory will be added back.`))return;s.items.forEach(line=>{const i=item(line.itemId);if(i){i.stock+=Number(line.qty);logStock(i,Number(line.qty),`Voided sale ${s.id.slice(-5)}`)}});s.voided=true;s.voidedAt=new Date().toISOString();if(s.pickupId){const p=data.pickups.find(x=>x.id===s.pickupId);if(p&&p.status==='picked'){p.status='ready';p.completed=null}}save()}
function renderInventoryHistory(){
  const all=[...(data.stockLog||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!all.length){$('inventoryHistory').innerHTML='<div class="empty">No inventory adjustments recorded yet.</div>';return}
  const parts=all.map(l=>({l,p:rrArchiveParts(l.date)})).filter(x=>x.p);
  const years=[...new Set(parts.map(x=>x.p.year))].sort((a,b)=>b.localeCompare(a));
  if(rrInventoryArchive.year&&!years.includes(rrInventoryArchive.year))rrInventoryArchive={year:'',month:'',day:''};
  const months=rrInventoryArchive.year?[...new Set(parts.filter(x=>x.p.year===rrInventoryArchive.year).map(x=>x.p.month))].sort((a,b)=>b.localeCompare(a)):[];
  if(rrInventoryArchive.month&&!months.includes(rrInventoryArchive.month)){rrInventoryArchive.month='';rrInventoryArchive.day=''}
  const days=rrInventoryArchive.month?[...new Set(parts.filter(x=>x.p.month===rrInventoryArchive.month).map(x=>x.p.day))].sort((a,b)=>b.localeCompare(a)):[];
  if(rrInventoryArchive.day&&!days.includes(rrInventoryArchive.day))rrInventoryArchive.day='';

  let html='<div class="rr-archive"><div class="rr-archive-level"><strong>Year</strong>'+rrArchiveButtons(years,rrInventoryArchive.year,'data-inv-year',v=>v)+'</div>';
  if(rrInventoryArchive.year)html+='<div class="rr-archive-level"><strong>Month</strong>'+rrArchiveButtons(months,rrInventoryArchive.month,'data-inv-month',v=>new Date(v+'-01T12:00:00').toLocaleDateString([],{month:'long'}))+'</div>';
  if(rrInventoryArchive.month)html+='<div class="rr-archive-level"><strong>Day</strong>'+rrArchiveButtons(days,rrInventoryArchive.day,'data-inv-day',v=>new Date(v+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}))+'</div>';
  if(rrInventoryArchive.day){
    const dayRows=parts.filter(x=>x.p.day===rrInventoryArchive.day).map(x=>x.l);
    html+=`<div class="table-wrap rr-archive-table"><table class="table"><thead><tr><th>Time</th><th>Item</th><th>Change</th><th>On Hand After</th><th>Reason</th></tr></thead><tbody>${dayRows.map(l=>{const d=new Date(l.date);return`<tr><td>${d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</td><td><strong>${esc(l.itemName)}</strong><br><span class="muted">${esc(l.brandName)}</span></td><td><strong>${Number(l.delta)>0?'+':''}${l.delta}</strong></td><td>${l.stockAfter}</td><td>${esc(l.reason)}</td></tr>`}).join('')}</tbody></table></div>`;
  }
  html+='</div>';
  $('inventoryHistory').innerHTML=html;
  $('inventoryHistory').querySelectorAll('[data-inv-year]').forEach(b=>b.onclick=()=>{const v=b.dataset.invYear;if(rrInventoryArchive.year===v)rrInventoryArchive={year:'',month:'',day:''};else rrInventoryArchive={year:v,month:'',day:''};renderInventoryHistory()});
  $('inventoryHistory').querySelectorAll('[data-inv-month]').forEach(b=>b.onclick=()=>{const v=b.dataset.invMonth;if(rrInventoryArchive.month===v){rrInventoryArchive.month='';rrInventoryArchive.day=''}else{rrInventoryArchive.month=v;rrInventoryArchive.day=''}renderInventoryHistory()});
  $('inventoryHistory').querySelectorAll('[data-inv-day]').forEach(b=>b.onclick=()=>{const v=b.dataset.invDay;rrInventoryArchive.day=rrInventoryArchive.day===v?'':v;renderInventoryHistory()});
}