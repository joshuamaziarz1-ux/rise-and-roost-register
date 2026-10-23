(()=>{
const BUILD='5.2.0-rc.3';
const TEST=!!window.__RR_TEST_MODE;
const MEMBER_KEY=TEST?'riseRoostTESTActiveMemberV1':'riseRoostActiveMemberV1';
const GUEST_KEY=TEST?'riseRoostTESTGuestShoppingV1':'riseRoostGuestShoppingV1';
const LOGO='assets/rise-roost-logo.webp';
let activeCategory='all';
let thanksTimer=null;
const categoryLabel={all:'ALL',eggs:'EGGS',baked:'BAKED GOODS',other:'OTHER'};
const categoryIcon={eggs:'🥚',baked:'🍞',other:'🫙'};

function inferCategory(i){
  const n=String(i?.name||'').toLowerCase();
  if(/\begg|dozen/.test(n))return 'eggs';
  if(/sourdough|bread|roll|cookie|muffin|brownie|cake|pie|biscuit|bun|pastry/.test(n))return 'baked';
  return 'other';
}
function ensureItemExtras(){
  let changed=false;
  (data.items||[]).forEach(i=>{
    if(!['eggs','baked','other'].includes(i.category)){i.category=inferCategory(i);changed=true}
    if(typeof i.photo!=='string'){i.photo='';changed=true}
  });
  if(changed)persist();
}
function showView(id){
  ['kioskHome','shopView','pickupView','cartonView','roostHub','joinView','myRoostView','feedbackView'].forEach(x=>$(x)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  window.scrollTo(0,0);
}
function setVersion(){
  document.title=`Rise & Roost Register v${BUILD}`;
  document.querySelectorAll('.version').forEach(x=>x.textContent=`Rise & Roost Register v${BUILD}`);
  const adminSub=document.querySelector('#adminScreen .admin-top .sub');
  if(adminSub)adminSub.textContent=`Rise & Roost Register v${BUILD}`;
  const versionStrong=document.querySelector('#settingsTab .danger-zone strong');
  if(versionStrong)versionStrong.textContent=`Rise & Roost Register v${BUILD}`;
}
function polishTop(){
  const holder=document.querySelector('.top>div:first-child');
  if(!holder||holder.querySelector('.rr48-topbrand'))return;
  holder.innerHTML=`<div class="rr48-topbrand"><img src="${LOGO}" alt="Rise & Roost logo"><div><strong>Rise & Roost</strong><span>Self-Serve Farm Store</span></div></div>`;
}
function refreshMemberLink(){
  const b=$('rr48MemberLink');if(!b)return;
  const id=sessionStorage.getItem(MEMBER_KEY),c=(data.customers||[]).find(x=>x.id===id);
  b.textContent=c?`✓ ${c.name} checked in · Change`:'Roost member? Check in';
}
function rebuildHome(){
  const home=$('kioskHome');if(!home)return;
  const h=home.querySelector('h1');
  if(h&&!h.classList.contains('rr48-home-brand')){
    h.className='rr48-home-brand';
    h.innerHTML=`<img class="rr48-home-logo" src="${LOGO}" alt="Rise & Roost">`;
  }
  const grid=home.querySelector('.kiosk-grid');
  if(!grid||grid.classList.contains('rr48-main-actions')){refreshMemberLink();return}
  const legacy=document.createElement('div');legacy.className='rr48-legacy';
  ['goShop','goPickup','goRoost'].forEach(id=>{const el=$(id);if(el)legacy.appendChild(el)});
  home.appendChild(legacy);
  grid.className='kiosk-grid rr48-main-actions';
  grid.innerHTML=`
    <button class="rr48-main-btn shop" id="rr48StartShop"><span class="rr48-icon">🛒</span><span>START SHOPPING</span><span class="rr48-arrow">›</span></button>
    <button class="rr48-main-btn pickup" id="rr48Pickup"><span class="rr48-icon">📦</span><span>PICK UP AN ORDER</span><span class="rr48-arrow">›</span></button>
    <button class="rr48-main-btn cartons" id="rr48Cartons"><span class="rr48-icon">🥚</span><span>RETURN EGG CARTONS</span><span class="rr48-arrow">›</span></button>`;
  const note=document.createElement('div');note.className='rr48-cash-note';note.textContent='CASH ONLY • EXACT CHANGE PLEASE';grid.after(note);
  const links=document.createElement('div');links.className='rr48-home-links';
  links.innerHTML='<button class="rr48-text-link" id="rr48MemberLink">Roost member? Check in</button><button class="rr48-text-link" id="rr48RoostLink">My Roost / Rewards</button>';
  note.after(links);

  $('rr48StartShop').onclick=()=>{
    home.classList.remove('rr48-checkin-open');
    if(!sessionStorage.getItem(MEMBER_KEY))sessionStorage.setItem(GUEST_KEY,'1');
    const b=$('goShop');if(b)b.click();else showView('shopView');
    $('shopView')?.classList.remove('rr48-cart-open');renderStore();renderCart();window.scrollTo(0,0);
  };
  $('rr48Pickup').onclick=()=>{const b=$('goPickup');if(b)b.click();else showView('pickupView')};
  $('rr48Cartons').onclick=()=>{const b=$('goCartons');if(b)b.click();else showView('cartonView')};
  $('rr48RoostLink').onclick=()=>{const b=$('goMyRoost')||$('goRoost');if(b)b.click();else showView('roostHub')};
  $('rr48MemberLink').onclick=()=>{
    sessionStorage.removeItem(GUEST_KEY);
    home.classList.add('rr48-checkin-open');
    const card=$('memberCheckin');
    setTimeout(()=>{card?.scrollIntoView({behavior:'smooth',block:'center'});$('memberNameInput')?.focus()},20);
    if(card&&!$('rr48CheckinClose')){
      const c=document.createElement('button');c.id='rr48CheckinClose';c.className='btn ghost rr48-checkin-close';c.textContent='Close';
      c.onclick=()=>home.classList.remove('rr48-checkin-open');card.appendChild(c);
    }
  };
  refreshMemberLink();
}
function ensureShopChrome(){
  const shop=document.querySelector('#shopView .shop');if(!shop)return;
  if(!$('rr48ShopHead')){
    const head=document.createElement('div');head.id='rr48ShopHead';head.className='rr48-shop-head';
    head.innerHTML=`<div><div class="rr48-shop-title">Shop Our Products</div><div class="hint">Tap + to add an item.</div></div><img class="rr48-shop-logo" src="${LOGO}" alt="">`;
    shop.prepend(head);
  }
  if(!$('rr48Categories')){
    const cats=document.createElement('div');cats.id='rr48Categories';cats.className='rr48-categories';
    cats.innerHTML=Object.entries(categoryLabel).map(([k,v])=>`<button class="rr48-cat ${k==='all'?'active':''}" data-rr-cat="${k}">${v}</button>`).join('');
    $('productArea').before(cats);
    cats.querySelectorAll('[data-rr-cat]').forEach(b=>b.onclick=()=>{
      activeCategory=b.dataset.rrCat;
      cats.querySelectorAll('.rr48-cat').forEach(x=>x.classList.toggle('active',x===b));
      renderStore();
    });
  }
  if(!$('rr48CartBar')){
    const bar=document.createElement('button');bar.id='rr48CartBar';bar.className='rr48-cartbar';bar.disabled=true;bar.textContent='CART • 0 ITEMS • $0.00';
    bar.onclick=()=>{$('shopView').classList.add('rr48-cart-open');renderCart();window.scrollTo(0,0)};
    shop.appendChild(bar);
  }
  const cart=document.querySelector('#shopView .cart');
  if(cart&&!$('rr48CartTop')){
    const top=document.createElement('div');top.id='rr48CartTop';top.className='rr48-cart-top';top.innerHTML='<button class="btn ghost" id="rr48KeepShopping">← KEEP SHOPPING</button>';
    cart.prepend(top);$('rr48KeepShopping').onclick=()=>{$('shopView').classList.remove('rr48-cart-open');window.scrollTo(0,0)};
    cart.querySelector('h2').textContent='Your Cart';
  }
}
function photoMarkup(i){
  if(i.photo)return `<img src="${i.photo}" alt="${esc(i.name)}">`;
  return `<span class="rr48-photo-placeholder">${categoryIcon[i.category]||'🛍️'}</span>`;
}

const baseAddToCart=addToCart;
const baseChangeQty=changeQty;
addToCart=function(id){baseAddToCart(id);renderStore()};
changeQty=function(id,d){baseChangeQty(id,d);renderStore()};

renderStore=function(){
  ensureItemExtras();ensureShopChrome();
  const items=(data.items||[]).filter(i=>i.active&&brand(i.brandId)?.active&&(activeCategory==='all'||i.category===activeCategory));
  $('productArea').innerHTML=items.length?`<section class="vendor"><div class="grid">${items.map(i=>{
    const av=available(i),q=Number(cart[i.id]||0),sold=av===0;
    return `<div class="rr48-product ${sold?'sold':''}">
      <div class="rr48-photo">${photoMarkup(i)}</div>${sold?'<div class="rr48-soldout">SOLD OUT</div>':''}
      <div class="rr48-product-body"><div class="rr48-product-name">${esc(i.name)}</div><div class="rr48-product-brand">${esc(brand(i.brandId)?.name||'Rise & Roost')}</div><div class="rr48-product-price">${money(i.price)}</div><div class="rr48-stock">${sold?'Sold out':'Available'}</div>
      <div class="rr48-qtyline"><button class="rr48-qtybtn" data-rr-minus="${i.id}" ${q<=0?'disabled':''}>−</button><div class="rr48-qtyvalue">${q}</div><button class="rr48-qtybtn plus" data-rr-plus="${i.id}" ${sold||q>=av?'disabled':''}>+</button></div></div>
    </div>`}).join('')}</div></section>`:'<div class="empty">No items are available in this category right now.</div>';
  $('productArea').querySelectorAll('[data-rr-plus]').forEach(b=>b.onclick=()=>addToCart(b.dataset.rrPlus));
  $('productArea').querySelectorAll('[data-rr-minus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.rrMinus,-1));
  updateCartBar();
};

renderCart=function(){
  ensureShopChrome();
  const e=entries(),units=e.reduce((n,x)=>n+x.qty,0),sum=total();
  $('cartHint').textContent=e.length?'Check your quantities, then check out.':'Your cart is empty.';
  $('cartList').innerHTML=e.length?e.map(x=>`<div class="cart-row"><div class="rr48-cart-thumb">${photoMarkup(x.item)}</div><div><div class="cname">${esc(x.item.name)}</div><div class="cbrand">${money(x.item.price)} each</div><button class="remove" data-remove="${x.item.id}">REMOVE</button></div><div><div class="cline">${money(Number(x.item.price)*x.qty)}</div><div class="qtys"><button class="qbtn" data-q="${x.item.id}" data-d="-1">−</button><span class="qnum">${x.qty}</span><button class="qbtn" data-q="${x.item.id}" data-d="1">+</button></div></div></div>`).join(''):'<div class="empty">Tap KEEP SHOPPING and add a product.</div>';
  $('cartList').querySelectorAll('[data-q]').forEach(x=>x.onclick=()=>changeQty(x.dataset.q,Number(x.dataset.d)));
  $('cartList').querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{delete cart[x.dataset.remove];renderCart();renderStore()});
  $('cartTotal').textContent=money(sum);$('payBtn').disabled=!e.length||(window.__RR_CLOUD_MODE&&!window.RRCloud?.ready);$('clearBtn').disabled=!e.length;
  $('payBtn').textContent=e.length?`CHECK OUT — ${money(sum)}`:'CHECK OUT';$('clearBtn').textContent='CLEAR ORDER';
  updateCartBar();
};
function updateCartBar(){
  const b=$('rr48CartBar');if(!b)return;const e=entries(),units=e.reduce((n,x)=>n+x.qty,0);
  b.disabled=!units;b.textContent=`🛒 CART • ${units} ITEM${units===1?'':'S'} • ${money(total())}`;
}

function polishCheckout(){
  const o=$('payOverlay');
  if(o&&!o.dataset.rr48){
    o.dataset.rr48='1';
    o.innerHTML=`<div class="modal"><div class="rr48-pay-logo"><img src="${LOGO}" alt=""></div><div class="rr48-pay-kicker">PLEASE PUT</div><div class="big rr48-pay-total" id="payTotal">$0.00</div><div class="rr48-pay-box">IN THE CASH BOX</div><div class="rr48-pay-help">Exact cash only — no change is available.</div><div class="rr48-pay-actions"><button class="btn primary rr48-confirm-cash" id="finishSale">I PUT THE MONEY IN THE BOX</button><button class="btn ghost" id="backPay">← BACK TO CART</button></div></div>`;
  }
  const t=$('thanks');
  if(t&&!t.dataset.rr48){
    t.dataset.rr48='1';
    t.innerHTML=`<div class="modal"><img class="rr48-thanks-logo" src="${LOGO}" alt=""><h2 class="rr48-thanks-title">THANK YOU!</h2><p class="rr48-thanks-copy">Your purchase is complete.</p><p>We appreciate your support. Come back soon!</p><button class="btn primary wide" id="doneThanks">DONE</button><div class="rr48-countdown" id="rr48Countdown"></div></div>`;
  }
}
checkout=function(){
  for(const x of entries())if(x.qty>available(x.item))return alert(`${x.item.name} no longer has enough available inventory. Please adjust the order.`);
  polishCheckout();const amt=money(total());$('payTotal').textContent=amt;$('finishSale').textContent=`✓ I PUT ${amt} IN THE BOX`;$('payOverlay').classList.remove('hidden');
};
const baseFinish=finish;
finish=function(){baseFinish();if(!$('thanks')?.classList.contains('hidden'))startThanksCountdown()};
function clearCustomerSession(){
  sessionStorage.removeItem('riseRoostActiveMemberV1');sessionStorage.removeItem('riseRoostGuestShoppingV1');
  sessionStorage.removeItem('riseRoostTESTActiveMemberV1');sessionStorage.removeItem('riseRoostTESTGuestShoppingV1');
}
function goHomeAfterSale(){
  if(thanksTimer){clearInterval(thanksTimer);thanksTimer=null}
  $('thanks')?.classList.add('hidden');$('payOverlay')?.classList.add('hidden');$('shopView')?.classList.remove('rr48-cart-open');clearCustomerSession();refreshMemberLink();
  showView('kioskHome');$('kioskHome')?.classList.remove('rr48-checkin-open');
}
function startThanksCountdown(){
  if(thanksTimer)clearInterval(thanksTimer);let n=8;
  const draw=()=>{if($('rr48Countdown'))$('rr48Countdown').textContent=`Returning to the home screen in ${n} second${n===1?'':'s'}…`};draw();
  thanksTimer=setInterval(()=>{n--;if(n<=0){clearInterval(thanksTimer);thanksTimer=null;goHomeAfterSale()}else draw()},1000);
}
function wireCheckout(){
  polishCheckout();$('payBtn').onclick=checkout;$('backPay').onclick=()=>$('payOverlay').classList.add('hidden');$('finishSale').onclick=finish;$('doneThanks').onclick=goHomeAfterSale;
  $('clearBtn').onclick=()=>{if(confirm('Clear this order?')){cart={};renderCart();renderStore()}};
}

function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    if(!file)return resolve('');
    const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read photo'));
    reader.onload=()=>{
      const img=new Image();img.onerror=()=>reject(new Error('Could not open photo'));
      img.onload=()=>{
        const max=700,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
        const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',.72));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function categoryOptions(selected='other'){
  return `<option value="eggs" ${selected==='eggs'?'selected':''}>Eggs</option><option value="baked" ${selected==='baked'?'selected':''}>Baked Goods</option><option value="other" ${selected==='other'?'selected':''}>Other</option>`;
}
function injectAdminPhotoFields(){
  const form=$('itemName')?.closest('.form');if(!form)return;
  if(!$('itemCategory')){
    const f=document.createElement('div');f.className='field';f.innerHTML=`<label>Category</label><select id="itemCategory">${categoryOptions('other')}</select>`;form.insertBefore(f,$('addItem'));
  }
  if(!$('itemPhoto')){
    const f=document.createElement('div');f.className='field rr48-admin-photo-field';f.innerHTML='<label>Product photo</label><input id="itemPhoto" type="file" accept="image/*"><div class="hint">Take or choose a real product photo. It is resized automatically and included in backups.</div><img id="itemPhotoPreview" class="rr48-photo-preview hidden" alt="">';form.insertBefore(f,$('addItem'));
    $('itemPhoto').onchange=()=>{const file=$('itemPhoto').files[0],p=$('itemPhotoPreview');if(!file){p.classList.add('hidden');return}p.src=URL.createObjectURL(file);p.classList.remove('hidden')};
  }
  $('addItem').onclick=addItem48;
}
async function addItem48(){
  const brandId=$('itemBrand').value,name=$('itemName').value.trim(),price=Number($('itemPrice').value),stock=Math.floor(Number($('itemStock').value||0)),low=Math.floor(Number($('itemLow').value||0)),category=$('itemCategory')?.value||'other';
  if(!brandId)return alert('Add a vendor first.');if(!name)return alert('Enter an item name.');if(!Number.isFinite(price)||price<0)return alert('Enter a valid price.');if(!Number.isFinite(stock)||stock<0)return alert('Enter a valid inventory amount.');if(!Number.isFinite(low)||low<0)return alert('Enter a valid low-stock amount.');
  let photo='';try{photo=await compressPhoto($('itemPhoto')?.files?.[0])}catch(e){return alert('That product photo could not be saved. Try another picture.')}
  const i={id:uid('item'),brandId,name,price,stock,lowStock:low,active:true,category,photo};data.items.push(i);if(stock)logStock(i,stock,'Starting inventory');
  $('itemName').value='';$('itemPrice').value='';$('itemStock').value='';if($('itemPhoto'))$('itemPhoto').value='';$('itemPhotoPreview')?.classList.add('hidden');save();
}
editItem=function(id){
  const i=item(id);if(!i)return;edit={type:'item',id};$('editTitle').textContent='Edit Item';
  $('editBody').innerHTML=`<div class="form two" style="margin-top:15px"><div class="field"><label>Vendor / Brand</label><select id="editItemBrand">${data.brands.map(b=>`<option value="${b.id}" ${b.id===i.brandId?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Item name</label><input id="editItemName" value="${esc(i.name)}"></div><div class="field"><label>Price</label><input id="editItemPrice" type="number" min="0" step="0.01" value="${Number(i.price).toFixed(2)}"></div><div class="field"><label>Category</label><select id="editItemCategory">${categoryOptions(i.category||inferCategory(i))}</select></div><div class="field"><label>Exact inventory quantity</label><input id="editItemStock" type="number" min="${reserved(i.id)}" step="1" value="${i.stock}"></div><div class="field"><label>Low-stock warning at</label><input id="editItemLow" type="number" min="0" step="1" value="${i.lowStock}"></div><div class="field rr48-admin-photo-field"><label>Replace product photo</label><input id="editItemPhoto" type="file" accept="image/*">${i.photo?`<img class="rr48-photo-preview" src="${i.photo}" alt="${esc(i.name)}"><label class="check"><input id="removeItemPhoto" type="checkbox"> Remove current photo</label>`:'<div class="hint">No product photo yet.</div>'}</div></div><p class="hint">${reserved(i.id)} currently reserved for pickup orders.</p>`;
  $('editOverlay').classList.remove('hidden');$('editSave').onclick=saveEdit;
};
saveEdit=async function(){
  if(!edit)return;
  if(edit.type==='brand'){
    const b=brand(edit.id),name=$('editBrandName').value.trim();if(!name)return alert('Enter a vendor name.');b.name=name;
  }else{
    const i=item(edit.id),name=$('editItemName').value.trim(),price=Number($('editItemPrice').value),stock=Math.floor(Number($('editItemStock').value)),low=Math.floor(Number($('editItemLow').value||0)),oldStock=i.stock;
    if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<reserved(i.id)||!Number.isFinite(low)||low<0)return alert('Check the item name, price, inventory, and low-stock amount.');
    i.brandId=$('editItemBrand').value;i.name=name;i.price=price;i.stock=stock;i.lowStock=low;i.category=$('editItemCategory')?.value||inferCategory(i);
    if($('removeItemPhoto')?.checked)i.photo='';
    const file=$('editItemPhoto')?.files?.[0];if(file){try{i.photo=await compressPhoto(file)}catch(e){return alert('That product photo could not be saved. Try another picture.')}}
    if(stock!==oldStock)logStock(i,stock-oldStock,'Exact quantity adjustment');
  }
  $('editOverlay').classList.add('hidden');edit=null;save();
};
function enhanceAdminRows(){
  $('itemList')?.querySelectorAll('[data-ei]').forEach(btn=>{
    const i=item(btn.dataset.ei),row=btn.closest('.row'),cell=row?.children?.[0];
    if(i?.photo&&cell&&!cell.querySelector('.rr48-admin-thumb')){const im=document.createElement('img');im.className='rr48-admin-thumb';im.src=i.photo;im.alt='';cell.prepend(im)}
  });
}
const baseRenderAdmin=renderAdmin;
renderAdmin=function(){baseRenderAdmin();injectAdminPhotoFields();enhanceAdminRows()};
const baseRenderAll=renderAll;
renderAll=function(){ensureItemExtras();baseRenderAll();setTimeout(()=>{rebuildHome();ensureShopChrome();injectAdminPhotoFields();enhanceAdminRows();refreshMemberLink();setVersion()},0)};

function init(){
  ensureItemExtras();polishTop();rebuildHome();ensureShopChrome();polishCheckout();wireCheckout();injectAdminPhotoFields();setVersion();renderStore();renderCart();enhanceAdminRows();refreshMemberLink();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
