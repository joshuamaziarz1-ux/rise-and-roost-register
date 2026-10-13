/* Rise & Roost: refresh catalog when another window changes the saved store data.
   This is a same-browser fallback, NOT cross-device cloud synchronization. */
(()=>{
  const KEY='riseRoostRegisterDataV2';
  let last=localStorage.getItem(KEY);
  function refresh(){
    const next=localStorage.getItem(KEY);
    if(!next||next===last)return;
    let incoming;
    try{incoming=JSON.parse(next)}catch(_){return}
    if(!incoming||!Array.isArray(incoming.items)||!Array.isArray(incoming.brands))return;
    last=next;
    if(typeof data==='undefined'||typeof migrate!=='function')return;
    // Preserve the in-progress cart and local UI state; update only the
    // catalog/stock fields. Never overwrite sales or member records here.
    const normalized=migrate(incoming);
    data.items=normalized.items;
    data.brands=normalized.brands;
    data.pickups=normalized.pickups;
    if(typeof renderStore==='function')renderStore();
    if(typeof renderCart==='function')renderCart();
  }
  window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  setInterval(refresh,3000);
})();
