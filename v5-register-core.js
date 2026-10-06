const V2='riseRoostRegisterDataV2',V1='riseRoostRegisterDataV1';
const $=id=>document.getElementById(id);
const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const money=n=>'$'+Number(n||0).toFixed(2);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function migrate(d){
  d=d&&typeof d==='object'?d:{};
  d.brands=Array.isArray(d.brands)?d.brands:[];
  d.items=Array.isArray(d.items)?d.items:[];
  d.sales=Array.isArray(d.sales)?d.sales:[];
  d.pickups=Array.isArray(d.pickups)?d.pickups:[];
  d.stockLog=Array.isArray(d.stockLog)?d.stockLog:[];
  d.customers=Array.isArray(d.customers)?d.customers:[];
  d.cartonReturns=Array.isArray(d.cartonReturns)?d.cartonReturns:[];
  d.roostReturns=Array.isArray(d.roostReturns)?d.roostReturns:[];
  d.comments=Array.isArray(d.comments)?d.comments:[];
  d.settings=d.settings&&typeof d.settings==='object'?d.settings:{};
  d.items.forEach(i=>{
    i.stock=Math.max(0,Number(i.stock||0));
    i.lowStock=Number.isFinite(Number(i.lowStock))?Math.max(0,Math.floor(Number(i.lowStock))):2;
    i.active=i.active!==false;
  });
  d.brands.forEach(b=>b.active=b.active!==false);
  return d;
}
function load(){
  try{const d=JSON.parse(localStorage.getItem(V2));if(d)return migrate(d)}catch(e){}
  try{
    const old=JSON.parse(localStorage.getItem(V1));
    if(old){const d=migrate(old);localStorage.setItem(V2,JSON.stringify(d));return d}
  }catch(e){}
  const d=migrate({brands:[{id:uid('brand'),name:'Rise & Roost',active:true}],items:[],sales:[],pickups:[],stockLog:[]});
  localStorage.setItem(V2,JSON.stringify(d));
  return d;
}

let data=load(),cart={};
function persist(){localStorage.setItem(V2,JSON.stringify(data))}
function save(){persist();renderAll()}
function brand(id){return data.brands.find(b=>b.id===id)}
function item(id){return data.items.find(i=>i.id===id)}
function activeReservations(){return 0}
function reserved(){return 0}
function available(i){return Math.max(0,Number(i.stock||0))}
function logStock(i,delta,reason){
  data.stockLog.unshift({
    id:uid('log'),date:new Date().toISOString(),itemId:i.id,itemName:i.name,
    brandId:i.brandId,brandName:brand(i.brandId)?.name||'Unknown',
    delta:Number(delta),stockAfter:Number(i.stock),reason:reason||'Adjustment'
  });
  if(data.stockLog.length>1000)data.stockLog.length=1000;
}
function entries(){
  return Object.entries(cart).map(([id,qty])=>({item:item(id),qty:Number(qty)})).filter(x=>x.item&&x.qty>0);
}
function total(){return entries().reduce((s,x)=>s+Number(x.item.price)*x.qty,0)}

function renderStore(){
  const visibleBrands=data.brands.filter(b=>b.active);
  let html='';
  visibleBrands.forEach(b=>{
    const items=data.items.filter(i=>i.brandId===b.id&&i.active);
    if(!items.length)return;
    html+=`<section class="vendor"><div class="vendor-head"><h3>${esc(b.name)}</h3><span>${items.length} item${items.length===1?'':'s'}</span></div><div class="grid">`;
    items.forEach(i=>{
      const av=available(i),low=av>0&&av<=i.lowStock;
      html+=`<button class="product ${av===0?'sold':''} ${low?'low':''}" data-buy="${i.id}" ${av===0?'disabled':''}><div class="pname">${esc(i.name)}</div><div class="pfoot"><div class="price">${money(i.price)}</div><div class="stock">${av===0?'SOLD OUT':`${av} available${low?' · LOW':''}`}</div></div></button>`;
    });
    html+='</div></section>';
  });
  const area=$('productArea');
  if(!area)return;
  area.innerHTML=html||'<div class="empty">No items are available right now.</div>';
  area.querySelectorAll('[data-buy]').forEach(btn=>btn.onclick=()=>addToCart(btn.dataset.buy));
}
function addToCart(id){
  const i=item(id),av=available(i);
  if(!i||av<=0)return;
  const current=Number(cart[id]||0);
  if(current>=av)return;
  cart[id]=current+1;
  renderCart();
}
function changeQty(id,d){
  const i=item(id);if(!i)return;
  const next=Number(cart[id]||0)+d;
  if(next<=0)delete cart[id];
  else if(next<=available(i))cart[id]=next;
  renderCart();
}
function renderCart(){
  const e=entries(),hint=$('cartHint'),list=$('cartList'),sum=$('cartTotal'),pay=$('payBtn'),clear=$('clearBtn');
  if(hint)hint.textContent=e.length?'Review your items before paying.':'Nothing added yet.';
  if(list){
    list.innerHTML=e.map(x=>`<div class="cart-row"><div><div class="cname">${esc(x.item.name)}</div><div class="cbrand">${esc(brand(x.item.brandId)?.name||'Unknown')}</div><button class="remove" data-remove="${x.item.id}">Remove</button></div><div><div class="cline">${money(Number(x.item.price)*x.qty)}</div><div class="qtys"><button class="qbtn" data-q="${x.item.id}" data-d="-1">−</button><span class="qnum">${x.qty}</span><button class="qbtn" data-q="${x.item.id}" data-d="1">+</button></div></div></div>`).join('');
    list.querySelectorAll('[data-q]').forEach(x=>x.onclick=()=>changeQty(x.dataset.q,Number(x.dataset.d)));
    list.querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{delete cart[x.dataset.remove];renderCart()});
  }
  if(sum)sum.textContent=money(total());
  if(pay)pay.disabled=!e.length;
  if(clear)clear.disabled=!e.length;
}
function checkout(){
  for(const x of entries())if(x.qty>available(x.item))return;
  if($('payTotal'))$('payTotal').textContent=money(total());
  $('payOverlay')?.classList.remove('hidden');
}
function recordSale(lines,opts={}){
  const sale={
    id:uid('sale'),date:new Date().toISOString(),
    total:lines.reduce((s,x)=>s+Number(x.price)*Number(x.qty),0),
    items:lines.map(x=>({...x})),payment:opts.payment||'cash',
    source:opts.source||'store',pickupId:opts.pickupId||null,voided:false
  };
  data.sales.unshift(sale);
  return sale;
}
function finish(){
  const e=entries();if(!e.length)return;
  for(const x of e)if(x.qty>available(x.item))return;
  const lines=e.map(x=>({itemId:x.item.id,itemName:x.item.name,brandId:x.item.brandId,brandName:brand(x.item.brandId)?.name||'Unknown',price:Number(x.item.price),qty:x.qty}));
  e.forEach(x=>{x.item.stock=Math.max(0,x.item.stock-x.qty);logStock(x.item,-x.qty,'Customer sale')});
  recordSale(lines,{payment:'cash',source:'store'});
  cart={};persist();
  $('payOverlay')?.classList.add('hidden');
  $('thanks')?.classList.remove('hidden');
  renderAll();
}
function renderAll(){renderStore();renderCart()}

window.addEventListener('storage',e=>{
  if(e.key===V2){
    data=load();
    renderAll();
    window.RRRoost?.renderShopBanner?.();
  }
});

document.addEventListener('DOMContentLoaded',()=>{
  $('payBtn') && ($('payBtn').onclick=checkout);
  $('backPay') && ($('backPay').onclick=()=>$('payOverlay')?.classList.add('hidden'));
  $('finishSale') && ($('finishSale').onclick=finish);
  $('doneThanks') && ($('doneThanks').onclick=()=>$('thanks')?.classList.add('hidden'));
  $('clearBtn') && ($('clearBtn').onclick=()=>{cart={};renderCart()});
  renderAll();
});