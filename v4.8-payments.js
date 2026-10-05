(()=>{
  let selectedPayment=null;
  const labels={cash:'Cash',cashapp:'Cash App',paypal:'PayPal'};
  const ensureSettings=()=>{ data.settings=data.settings&&typeof data.settings==='object'?data.settings:{}; data.settings.paymentQrs=data.settings.paymentQrs&&typeof data.settings.paymentQrs==='object'?data.settings.paymentQrs:{}; return data.settings.paymentQrs; };
  const qrFor=m=>ensureSettings()[m]||'';
  const paymentTotal=(method)=>{
    const today=new Date().toDateString();
    return (data.sales||[]).filter(s=>!s.voided&&s.payment===method&&new Date(s.date).toDateString()===today).reduce((a,s)=>a+Number(s.total||0),0);
  };
  function styles(){
    if(document.getElementById('rr48PaymentStyles'))return;
    const s=document.createElement('style');s.id='rr48PaymentStyles';s.textContent=`
      .rr48-pay-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
      .rr48-pay-method{min-height:92px;border:2px solid #ded2bd;border-radius:18px;background:#fff;font-size:1.15rem;font-weight:950;color:#2a2926;padding:12px}
      .rr48-pay-method.cash{border-color:#56765b}.rr48-pay-method.cashapp{border-color:#37c86b}.rr48-pay-method.paypal{border-color:#2374bb}
      .rr48-pay-method span{display:block;font-size:1.75rem;margin-bottom:4px}
      .rr48-payment-modal{max-width:680px!important}.rr48-payment-question{font-size:1.35rem;font-weight:950;margin-top:8px}
      .rr48-digital-pay{display:grid;gap:12px;justify-items:center}.rr48-qr{width:min(310px,70vw);aspect-ratio:1/1;object-fit:contain;background:#fff;border:8px solid #fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.12)}
      .rr48-qr-missing{width:min(310px,70vw);aspect-ratio:1/1;border:3px dashed #b8aa92;border-radius:16px;display:grid;place-items:center;padding:24px;background:#faf7f0;color:#6b6256;font-weight:850}
      .rr48-send-total{font-size:1.2rem;font-weight:900}.rr48-send-total strong{font-size:2rem;color:#35543a}
      .rr48-pay-back{min-height:56px}.rr48-payment-admin{margin-top:16px}.rr48-payment-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rr48-qr-admin-preview{width:150px;height:150px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:12px;margin-top:8px}
      .rr48-method-note{color:var(--muted);font-size:.9rem;line-height:1.4}
      @media(max-width:620px){.rr48-pay-methods{grid-template-columns:1fr}.rr48-pay-method{min-height:76px}.rr48-payment-admin-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function payChooser(){
    selectedPayment=null;
    const o=document.getElementById('payOverlay'); if(!o)return;
    o.innerHTML=`<div class="modal rr48-payment-modal">
      <div class="rr48-pay-logo"><img src="assets/rise-roost-logo.jpg?v=4.8.4" alt="Rise & Roost"></div>
      <div class="rr48-payment-question">HOW WOULD YOU LIKE TO PAY?</div>
      <div class="big rr48-pay-total">${money(total())}</div>
      <div class="rr48-pay-methods">
        <button class="rr48-pay-method cash" data-method="cash"><span>💵</span>CASH</button>
        <button class="rr48-pay-method cashapp" data-method="cashapp"><span>▣</span>CASH APP</button>
        <button class="rr48-pay-method paypal" data-method="paypal"><span>Ⓟ</span>PAYPAL</button>
      </div>
      <button class="btn ghost wide rr48-pay-back" id="rr48BackCart">← BACK TO CART</button>
    </div>`;
    o.classList.remove('hidden');
    o.querySelectorAll('[data-method]').forEach(b=>b.onclick=()=>showMethod(b.dataset.method));
    document.getElementById('rr48BackCart').onclick=()=>o.classList.add('hidden');
  }
  function showMethod(method){
    selectedPayment=method;
    const o=document.getElementById('payOverlay'),amt=money(total()),qr=qrFor(method);
    if(method==='cash'){
      o.innerHTML=`<div class="modal rr48-payment-modal">
        <div class="rr48-pay-logo"><img src="assets/rise-roost-logo.jpg?v=4.8.4" alt=""></div>
        <div class="rr48-pay-kicker">PLEASE PUT</div><div class="big rr48-pay-total">${amt}</div>
        <div class="rr48-pay-box">IN THE CASH BOX</div>
        <div class="rr48-pay-help">Exact cash only — no change is available.</div>
        <div class="rr48-pay-actions"><button class="btn primary rr48-confirm-cash" id="rr48ConfirmPay">✓ I PUT ${amt} IN THE CASH BOX</button><button class="btn ghost" id="rr48BackMethods">← CHANGE PAYMENT METHOD</button></div>
      </div>`;
    } else {
      const brand=labels[method];
      o.innerHTML=`<div class="modal rr48-payment-modal">
        <div class="rr48-pay-logo"><img src="assets/rise-roost-logo.jpg?v=4.8.4" alt=""></div>
        <div class="rr48-payment-question">PAY WITH ${brand.toUpperCase()}</div>
        <div class="rr48-send-total">Send exactly <strong>${amt}</strong></div>
        <div class="rr48-digital-pay">
          ${qr?`<img class="rr48-qr" src="${qr}" alt="${brand} QR code">`:`<div class="rr48-qr-missing">${brand} QR CODE<br>will appear here after it is added in Admin → Settings.</div>`}
          <div class="rr48-method-note">Scan the code, enter the amount shown above, and send the payment. Then confirm below.</div>
        </div>
        <div class="rr48-pay-actions" style="margin-top:14px"><button class="btn primary rr48-confirm-cash" id="rr48ConfirmPay" ${qr?'':'disabled'}>✓ I SENT ${amt} WITH ${brand.toUpperCase()}</button><button class="btn ghost" id="rr48BackMethods">← CHANGE PAYMENT METHOD</button></div>
      </div>`;
    }
    document.getElementById('rr48BackMethods').onclick=payChooser;
    const c=document.getElementById('rr48ConfirmPay'); if(c)c.onclick=()=>completePayment(method);
  }
  function completePayment(method){
    const e=entries(); if(!e.length)return;
    for(const x of e)if(x.qty>available(x.item))return alert(`${x.item.name} no longer has enough available inventory.`);
    const lines=e.map(x=>({itemId:x.item.id,itemName:x.item.name,brandId:x.item.brandId,brandName:brand(x.item.brandId)?.name||'Unknown',price:Number(x.item.price),qty:x.qty}));
    e.forEach(x=>{x.item.stock=Math.max(0,x.item.stock-x.qty);logStock(x.item,-x.qty,`Customer sale - ${labels[method]||method}`)});
    recordSale(lines,{payment:method,source:'store'});
    cart={};persist();
    document.getElementById('payOverlay')?.classList.add('hidden');
    const thanks=document.getElementById('thanks'); if(thanks)thanks.classList.remove('hidden');
    renderAll();
    const copy=document.querySelector('#thanks .rr48-thanks-copy'); if(copy)copy.textContent=`Your ${labels[method]} purchase is complete.`;
    let n=8; const cd=document.getElementById('rr48Countdown'); if(cd)cd.textContent=`Returning to the home screen in ${n} seconds…`;
    const timer=setInterval(()=>{n--;const el=document.getElementById('rr48Countdown');if(el)el.textContent=`Returning to the home screen in ${n} second${n===1?'':'s'}…`;if(n<=0){clearInterval(timer);document.getElementById('doneThanks')?.click()}},1000);
  }
  async function qrData(file){
    if(!file)return '';
    const src=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
    const max=700,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);return cv.toDataURL('image/png');
  }
  function injectAdmin(){
    const tab=document.getElementById('settingsTab');if(!tab||document.getElementById('rr48PaymentAdmin'))return;
    ensureSettings();
    const card=document.createElement('div');card.id='rr48PaymentAdmin';card.className='card section rr48-payment-admin';
    card.innerHTML=`<div class="section-head"><h2>Cash App & PayPal QR Codes</h2></div>
      <p class="hint">Add Danielle’s official QR-code images here. Customers will see them after choosing Cash App or PayPal at checkout. These are included with the register data backup.</p>
      <div class="rr48-payment-admin-grid">
        <div class="field"><label>Cash App QR Code</label><input id="rr48CashAppQr" type="file" accept="image/*"><div id="rr48CashAppQrView"></div><button class="btn small ghost" id="rr48RemoveCashApp" type="button">Remove Cash App QR</button></div>
        <div class="field"><label>PayPal QR Code</label><input id="rr48PaypalQr" type="file" accept="image/*"><div id="rr48PaypalQrView"></div><button class="btn small ghost" id="rr48RemovePaypal" type="button">Remove PayPal QR</button></div>
      </div>`;
    const version=tab.querySelector('.danger-zone'); tab.insertBefore(card,version||null);
    const draw=()=>{const q=ensureSettings();document.getElementById('rr48CashAppQrView').innerHTML=q.cashapp?`<img class="rr48-qr-admin-preview" src="${q.cashapp}" alt="Cash App QR">`:'<p class="hint">Not added yet.</p>';document.getElementById('rr48PaypalQrView').innerHTML=q.paypal?`<img class="rr48-qr-admin-preview" src="${q.paypal}" alt="PayPal QR">`:'<p class="hint">Not added yet.</p>'};
    document.getElementById('rr48CashAppQr').onchange=async e=>{if(!e.target.files[0])return;ensureSettings().cashapp=await qrData(e.target.files[0]);persist();draw();e.target.value=''};
    document.getElementById('rr48PaypalQr').onchange=async e=>{if(!e.target.files[0])return;ensureSettings().paypal=await qrData(e.target.files[0]);persist();draw();e.target.value=''};
    document.getElementById('rr48RemoveCashApp').onclick=()=>{delete ensureSettings().cashapp;persist();draw()};
    document.getElementById('rr48RemovePaypal').onclick=()=>{delete ensureSettings().paypal;persist();draw()};
    draw();
  }
  function injectDashboard(){
    const stats=document.querySelector('#dashboardTab .stats');if(!stats)return;
    let a=document.getElementById('rr48CashAppToday');if(!a){a=document.createElement('div');a.className='card stat';a.innerHTML='<label>Cash App Today</label><strong id="rr48CashAppToday">$0.00</strong>';stats.appendChild(a)}
    let p=document.getElementById('rr48PaypalToday');if(!p){p=document.createElement('div');p.className='card stat';p.innerHTML='<label>PayPal Today</label><strong id="rr48PaypalToday">$0.00</strong>';stats.appendChild(p)}
    document.getElementById('rr48CashAppToday').textContent=money(paymentTotal('cashapp'));
    document.getElementById('rr48PaypalToday').textContent=money(paymentTotal('paypal'));
  }
  function apply(){
    styles();ensureSettings();injectAdmin();injectDashboard();
    window.checkout=payChooser;
    const b=document.getElementById('payBtn');if(b)b.onclick=payChooser;
    const old=window.renderDashboard;
    if(old&&!old.__rr48pay){const wrapped=function(){old();injectDashboard()};wrapped.__rr48pay=true;window.renderDashboard=wrapped}
  }
  window.addEventListener('load',()=>{let n=0;const t=setInterval(()=>{apply();if(++n>=8)clearInterval(t)},500)});
  if(document.readyState==='complete')apply();
})();