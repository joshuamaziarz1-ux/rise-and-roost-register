(()=>{
  const MEMBER_KEY='riseRoostActiveMemberV1';
  let creditChoice=null;
  const labels={cash:'Cash',cashapp:'Cash App',paypal:'PayPal',applepay:'Apple Pay',googlepay:'Google Pay'};
  const moneyRR=n=>'$'+Number(n||0).toFixed(2);
  const escRR=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const defaultCfg=()=>({
    creditValue:0.50,
    allowFullPurchase:true,
    returnTypes:[
      {id:'egg-carton',name:'Egg Carton',credit:1,active:true},
      {id:'bottle-16',name:'16 oz Bottle',credit:2,active:true},
      {id:'bottle-32',name:'32 oz Bottle',credit:5,active:true}
    ]
  });
  function cfg(){
    const x=data?.settings?.roostCreditSettings;
    const d=defaultCfg();
    if(!x||typeof x!=='object')return d;
    return {
      creditValue:Math.max(.01,Number(x.creditValue||d.creditValue)),
      allowFullPurchase:x.allowFullPurchase!==false,
      returnTypes:Array.isArray(x.returnTypes)&&x.returnTypes.length?x.returnTypes:d.returnTypes
    };
  }
  function member(){
    const id=sessionStorage.getItem(MEMBER_KEY);
    return (data?.customers||[]).find(c=>c.id===id)||null;
  }
  function balance(c){return Math.max(0,Math.floor(Number(c?.roostCredits??c?.cartonCredits??0)))}
  function calcCredit(){
    const c=member(),gross=Number(typeof total==='function'?total():0),conf=cfg();
    const available=balance(c),value=conf.creditValue;
    let usable=Math.min(available,Math.floor((gross+0.000001)/value));
    if(!conf.allowFullPurchase && usable*value>=gross)usable=Math.max(0,usable-1);
    const discount=Math.min(gross,Math.round(usable*value*100)/100);
    return {member:c,gross,available,value,usable,discount,due:Math.max(0,Math.round((gross-discount)*100)/100),conf};
  }
  function qrFor(method){return data?.settings?.paymentQrs?.[method]||''}
  function addStyles(){
    if(document.getElementById('rrCreditProgramStyles'))return;
    const s=document.createElement('style');s.id='rrCreditProgramStyles';s.textContent=`
      .rr-credit-box{border:2px solid #6c7e5b;background:#f4f8f0;border-radius:18px;padding:16px;margin:14px 0;text-align:left}
      .rr-credit-box h3{margin:0 0 5px}.rr-credit-balance{font-size:1.6rem;font-weight:950;color:#36533a}
      .rr-credit-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      .rr-credit-choice{min-height:58px;border:2px solid #8da07d;border-radius:14px;background:white;font-weight:950;font-size:1rem}
      .rr-credit-choice.active{background:#526b50;color:#fff;border-color:#526b50}
      .rr-credit-summary{margin-top:10px;padding:11px;border-radius:12px;background:#fff;border:1px solid #d6dfce;line-height:1.5}
      .rr-credit-complete{min-height:68px;font-size:1.1rem}
      .rr-credit-admin-grid{display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:end}
      .rr-return-admin-list{display:grid;gap:10px;margin-top:14px}
      .rr-return-admin-row{display:grid;grid-template-columns:minmax(170px,1fr) 140px auto;gap:10px;align-items:end;border:1px solid var(--line);padding:12px;border-radius:14px;background:#fff}
      .rr-credit-save-status{margin-top:10px;font-weight:850}
      .rr-member-list-az{display:grid;gap:12px}
      .rr-member-letter-group{display:grid;grid-template-columns:42px 1fr;gap:10px;align-items:start}
      .rr-member-letter{font-size:1.2rem;font-weight:950;color:#6b563f;padding-top:10px;text-align:center}
      .rr-member-buttons{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
      .rr-member-name-btn{min-height:58px;border:1px solid var(--line);border-radius:13px;background:#fff;text-align:left;padding:10px 12px;font-weight:950;color:#2f2924}
      .rr-member-name-btn span{display:block;font-size:.8rem;font-weight:700;color:var(--muted);margin-top:3px}
      .rr-member-name-btn.active{background:#526b50;color:#fff;border-color:#526b50}
      .rr-member-name-btn.active span{color:#edf3e8}
      .rr-member-detail-card{border:1px solid var(--line);border-radius:16px;background:#fff;padding:16px}
      .rr-member-detail-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
      .rr-member-credit-big{font-size:2rem;font-weight:950;color:#355f3a;white-space:nowrap}
      .rr-member-credit-big span{font-size:1rem;color:var(--muted)}
      .rr-member-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
      .rr-member-stats>div{border:1px solid var(--line);border-radius:12px;padding:12px;background:#faf8f3}
      .rr-member-stats span{display:block;font-size:.8rem;color:var(--muted);font-weight:850}
      .rr-member-stats strong{display:block;font-size:1.35rem;margin-top:4px}
      .rr-member-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      .rr-credit-history-table{width:100%;border-collapse:collapse}.rr-credit-history-table th,.rr-credit-history-table td{padding:10px;border-bottom:1px solid var(--line);text-align:left}.rr-credit-history-table th{font-size:.82rem;color:var(--muted)}
      .rr-credit-plus{font-weight:950;color:#355f3a}.rr-credit-minus{font-weight:950;color:#8b3a34}
      @media(max-width:650px){.rr-credit-actions,.rr-credit-admin-grid,.rr-return-admin-row,.rr-member-stats{grid-template-columns:1fr}.rr-member-detail-top{flex-direction:column}.rr-member-letter-group{grid-template-columns:30px 1fr}.rr-member-buttons{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function paymentMethods(due){
    return `<div class="rr48-pay-methods">
      <button class="rr48-pay-method cash" data-rrpay="cash">CASH</button>
      <button class="rr48-pay-method cashapp" data-rrpay="cashapp">CASH APP</button>
      <button class="rr48-pay-method paypal" data-rrpay="paypal">PAYPAL</button>
      <button class="rr48-pay-method applepay" data-rrpay="applepay">APPLE PAY</button>
      <button class="rr48-pay-method googlepay" data-rrpay="googlepay">GOOGLE PAY</button>
    </div>`;
  }
  function creditBox(calc){
    if(!calc.member||calc.available<1)return '';
    const worth=calc.available*calc.value;
    if(calc.usable<1){
      return `<div class="rr-credit-box"><h3>Roost Credits</h3><div class="rr-credit-balance">${calc.available} credit${calc.available===1?'':'s'}</div><div class="rsub">Each credit is worth ${moneyRR(calc.value)}. Your credits are saved because this purchase is less than one credit.</div></div>`;
    }
    const summary=creditChoice===true
      ? `<div class="rr-credit-summary"><strong>${calc.usable} credit${calc.usable===1?'':'s'} will be used</strong><br>Roost Credit: −${moneyRR(calc.discount)}<br>Remaining to pay: <strong>${moneyRR(calc.due)}</strong><br>Credits left after purchase: ${calc.available-calc.usable}</div>`
      : creditChoice===false
      ? `<div class="rr-credit-summary"><strong>Your ${calc.available} credits will be saved.</strong><br>Amount to pay: <strong>${moneyRR(calc.gross)}</strong></div>`
      : `<div class="rr-credit-summary">Choose whether you want to use your Roost Credits on this purchase or save them for later.</div>`;
    return `<div class="rr-credit-box"><h3>Roost Credits</h3><div class="rr-credit-balance">${calc.available} credit${calc.available===1?'':'s'} available</div><div class="rsub">${moneyRR(calc.value)} per credit · worth up to ${moneyRR(worth)}</div><div class="rr-credit-actions"><button class="rr-credit-choice ${creditChoice===true?'active':''}" id="rrUseCredits">USE ROOST CREDITS</button><button class="rr-credit-choice ${creditChoice===false?'active':''}" id="rrSaveCredits">SAVE MY CREDITS</button></div>${summary}</div>`;
  }
  function payChooser(){
    creditChoice=null;
    renderChooser();
  }
  function renderChooser(){
    const o=document.getElementById('payOverlay');if(!o)return;
    const x=calcCredit();
    const needsChoice=!!x.member&&x.available>0&&x.usable>0&&creditChoice===null;
    const due=creditChoice===true?x.due:x.gross;
    const methods=needsChoice?'':(creditChoice===true&&x.due===0
      ? `<button class="btn primary wide rr-credit-complete" id="rrCreditOnlyComplete">USE ${x.usable} CREDIT${x.usable===1?'':'S'} & COMPLETE PURCHASE</button>`
      : paymentMethods(due));
    o.innerHTML=`<div class="modal rr48-payment-modal">
      <div class="rr48-pay-logo"><img src="assets/rise-roost-logo.webp?v=4.8.6" alt="Rise & Roost"></div>
      <div class="rr48-payment-question">CHECKOUT</div>
      <div class="big rr48-pay-total">${moneyRR(x.gross)}</div>
      ${creditBox(x)}
      ${methods}
      <button class="btn ghost wide rr48-pay-back" id="rrCreditBackCart">← BACK TO CART</button>
    </div>`;
    o.classList.remove('hidden');
    const use=document.getElementById('rrUseCredits');if(use)use.onclick=()=>{creditChoice=true;renderChooser()};
    const save=document.getElementById('rrSaveCredits');if(save)save.onclick=()=>{creditChoice=false;renderChooser()};
    document.querySelectorAll('[data-rrpay]').forEach(b=>b.onclick=()=>showMethod(b.dataset.rrpay));
    const full=document.getElementById('rrCreditOnlyComplete');if(full)full.onclick=()=>completePayment('cash');
    document.getElementById('rrCreditBackCart').onclick=()=>o.classList.add('hidden');
  }
  function showMethod(method){
    const o=document.getElementById('payOverlay');if(!o)return;
    const x=calcCredit(),use=creditChoice===true;
    const due=use?x.due:x.gross,qr=qrFor(method),brand=labels[method];
    const creditLine=use&&x.usable? `<div class="rr-credit-summary" style="margin:12px 0">Order ${moneyRR(x.gross)} · Roost Credit −${moneyRR(x.discount)} · <strong>Pay ${moneyRR(due)}</strong></div>`:'';
    if(method==='cash'){
      o.innerHTML=`<div class="modal rr48-payment-modal"><div class="rr48-pay-logo"><img src="assets/rise-roost-logo.webp?v=4.8.6" alt=""></div><div class="rr48-pay-kicker">PLEASE PUT</div><div class="big rr48-pay-total">${moneyRR(due)}</div>${creditLine}<div class="rr48-pay-box">IN THE CASH BOX</div><div class="rr48-pay-help">Exact cash only — no change is available.</div><div class="rr48-pay-actions"><button class="btn primary rr48-confirm-cash" id="rrCreditConfirmPay">✓ I PUT ${moneyRR(due)} IN THE CASH BOX</button><button class="btn ghost" id="rrCreditBackMethods">← CHANGE PAYMENT METHOD</button></div></div>`;
    }else{
      o.innerHTML=`<div class="modal rr48-payment-modal"><div class="rr48-pay-logo"><img src="assets/rise-roost-logo.webp?v=4.8.6" alt=""></div><div class="rr48-payment-question">PAY WITH ${brand.toUpperCase()}</div>${creditLine}<div class="rr48-send-total">Send exactly <strong>${moneyRR(due)}</strong></div><div class="rr48-digital-pay">${qr?`<img class="rr48-qr" src="${qr}" alt="${brand} QR code">`:`<div class="rr48-qr-missing">${brand} QR CODE<br>will appear here after it is added in Admin → Settings.</div>`}<div class="rr48-method-note">Scan the code, enter the amount shown above, and send the payment. Then confirm below.</div></div><div class="rr48-pay-actions" style="margin-top:14px"><button class="btn primary rr48-confirm-cash" id="rrCreditConfirmPay" ${qr?'':'disabled'}>✓ I SENT ${moneyRR(due)} WITH ${brand.toUpperCase()}</button><button class="btn ghost" id="rrCreditBackMethods">← CHANGE PAYMENT METHOD</button></div></div>`;
    }
    document.getElementById('rrCreditBackMethods').onclick=renderChooser;
    const b=document.getElementById('rrCreditConfirmPay');if(b)b.onclick=()=>completePayment(method);
  }
  async function completePayment(method){
    const e=entries();if(!e.length)return;
    for(const x of e)if(x.qty>available(x.item))return alert(x.item.name+' no longer has enough available inventory.');
    const b=document.getElementById('rrCreditConfirmPay')||document.getElementById('rrCreditOnlyComplete');
    if(b){b.disabled=true;b.textContent='SAVING PURCHASE…'}
    const c=member(),use=creditChoice===true&&!!c;
    try{
      let result;
      if(window.RRCloud&&typeof window.RRCloud.checkout==='function'){
        result=await window.RRCloud.checkout(method,e,{customerId:c?.id||null,useCredits:use});
      }else{
        throw new Error('Cloud checkout is required for Roost Credit purchases.');
      }
      if(c&&result&&result.creditsRemaining!==null&&result.creditsRemaining!==undefined){
        c.roostCredits=Number(result.creditsRemaining);
        c.cartonCredits=c.roostCredits;
        try{localStorage.setItem('riseRoostRegisterDataV2',JSON.stringify(data))}catch{}
      }
      cart={};
      document.getElementById('payOverlay')?.classList.add('hidden');
      const thanks=document.getElementById('thanks');if(thanks)thanks.classList.remove('hidden');
      renderAll();
      window.RRRoost?.renderShopBanner?.();
      const copy=document.querySelector('#thanks .rr48-thanks-copy');
      if(copy){
        const used=Number(result?.creditsUsed||0);
        copy.textContent=used?('Purchase complete. You used '+used+' Roost Credit'+(used===1?'':'s')+'.'):'Your '+(labels[method]||method)+' purchase is complete.';
      }
      let n=8;const cd=document.getElementById('rr48Countdown');if(cd)cd.textContent='Returning to the home screen in '+n+' seconds…';
      const timer=setInterval(()=>{n--;const el=document.getElementById('rr48Countdown');if(el)el.textContent='Returning to the home screen in '+n+' second'+(n===1?'':'s')+'…';if(n<=0){clearInterval(timer);document.getElementById('doneThanks')?.click()}},1000);
    }catch(err){
      alert((err&&err.message)||'The purchase could not be saved. Please ask Danielle for help before trying again.');
      if(b){b.disabled=false;b.textContent='TRY AGAIN'}
    }
  }

  function hideOldRewardUI(){
    const threshold=document.getElementById('cartonThreshold');
    const old=threshold?.closest('.card.section');if(old)old.style.display='none';
    const rewardHist=document.getElementById('cartonRewardHistory')?.closest('.card.section');if(rewardHist)rewardHist.style.display='none';
    const oldHist=document.getElementById('cartonHistory')?.closest('.card.section');if(oldHist)oldHist.style.display='none';
    const stats=document.querySelector('#customersTab .stats');if(stats)stats.style.display='none';
  }
  function adminCard(){
    const tab=document.getElementById('customersTab');if(!tab||document.getElementById('rrCreditAdmin'))return;
    hideOldRewardUI();
    const members=document.getElementById('cartonCustomerList')?.closest('.card.section');
    const card=document.createElement('div');card.id='rrCreditAdmin';card.className='card section';
    card.innerHTML=`<div class="section-head"><h2>Roost Credit Settings</h2><span class="badge">Admin only</span></div>
      <p class="hint">Credits are Rise & Roost reward units. No money is transferred when a credit is earned. Members can use or save their credits at checkout.</p>
      <div class="rr-credit-admin-grid">
        <div class="field"><label>Value of 1 Roost Credit</label><input id="rrAdminCreditValue" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
        <label style="display:flex;gap:10px;align-items:center;font-weight:900;padding-bottom:12px"><input id="rrAdminFullPurchase" type="checkbox" style="width:22px;height:22px"> Allow credits to cover the entire purchase</label>
      </div>
      <div class="section-head" style="margin-top:18px"><h3 style="margin:0">Return Types</h3><button class="btn small" id="rrAddReturnType" type="button">+ Add Return Type</button></div>
      <div id="rrReturnAdminList" class="rr-return-admin-list"></div>
      <button class="btn primary" id="rrSaveCreditSettings" style="margin-top:14px">Save Roost Credit Settings</button>
      <div id="rrCreditSaveStatus" class="rr-credit-save-status"></div>`;
    tab.insertBefore(card,members||tab.firstChild);
    document.getElementById('rrAddReturnType').onclick=()=>addReturnTypeRow();
    document.getElementById('rrSaveCreditSettings').onclick=saveAdminSettings;
    drawAdminSettings();
  }
  function drawAdminSettings(){
    const card=document.getElementById('rrCreditAdmin');if(!card)return;
    const x=cfg();
    document.getElementById('rrAdminCreditValue').value=Number(x.creditValue).toFixed(2);
    document.getElementById('rrAdminFullPurchase').checked=x.allowFullPurchase!==false;
    const list=document.getElementById('rrReturnAdminList');
    list.innerHTML='';
    x.returnTypes.forEach(t=>addReturnTypeRow(t));
  }
  function addReturnTypeRow(t={}){
    const list=document.getElementById('rrReturnAdminList');if(!list)return;
    const row=document.createElement('div');row.className='rr-return-admin-row';row.dataset.id=t.id||('type_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
    row.innerHTML=`<div class="field"><label>Return item</label><input class="rr-ret-name" value="${escRR(t.name||'')}" placeholder="Example: 16 oz Bottle"></div><div class="field"><label>Credits earned each</label><input class="rr-ret-credit" type="number" min="0" step="1" value="${Math.max(0,Math.floor(Number(t.credit??1)))}"></div><button class="btn small danger rr-ret-remove" type="button">Remove</button>`;
    row.querySelector('.rr-ret-remove').onclick=()=>row.remove();
    list.appendChild(row);
  }
  function ensureMemberBrowser(){
    const tab=document.getElementById('customersTab');if(!tab)return null;
    let card=document.getElementById('rrMemberBrowser');
    if(card)return card;

    const oldMembers=document.getElementById('cartonCustomerList')?.closest('.card.section');
    if(oldMembers)oldMembers.style.display='none';
    const addMember=document.getElementById('addCartonCustomer')?.closest('.card.section');
    if(addMember)tab.insertBefore(addMember,oldMembers||null);

    card=document.createElement('div');
    card.id='rrMemberBrowser';
    card.className='card section';
    card.innerHTML=`
      <div class="section-head"><h2>Roost Members</h2><span class="badge">A–Z</span></div>
      <div id="rrMemberListAZ" class="rr-member-list-az"></div>
      <div id="rrMemberDetail" style="margin-top:14px"></div>
    `;
    const creditCard=document.getElementById('rrCreditAdmin');
    if(creditCard?.nextSibling)tab.insertBefore(card,creditCard.nextSibling);
    else tab.appendChild(card);

    return card;
  }

  function memberEvents(customerId){
    const returns=(Array.isArray(data?.roostReturns)?data.roostReturns:[])
      .filter(r=>r.customerId===customerId)
      .map(r=>({
        date:r.date,
        detail:Number(r.qty||0)+' × '+(r.typeName||'Return'),
        amount:'+'+Number(r.credits||0)+' credits',
        kind:'plus'
      }));
    const uses=(Array.isArray(data?.roostCreditUses)?data.roostCreditUses:[])
      .filter(r=>r.customerId===customerId)
      .map(r=>({
        date:r.date,
        detail:'Used at checkout'+(r.discountAmount?(' · '+moneyRR(r.discountAmount)+' value'):''),
        amount:'−'+Number(r.creditsUsed||0)+' credits',
        kind:'minus'
      }));
    return [...returns,...uses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  }

  function drawMemberDetail(id){
    const box=document.getElementById('rrMemberDetail');if(!box)return;
    const customer=(data.customers||[]).find(c=>c.id===id);
    if(!customer){box.innerHTML='<div class="empty">Choose a member to view their account.</div>';return}

    const events=memberEvents(id);
    const earned=(data.roostReturns||[]).filter(r=>r.customerId===id).reduce((s,r)=>s+Number(r.credits||0),0);
    const used=(data.roostCreditUses||[]).filter(r=>r.customerId===id).reduce((s,r)=>s+Number(r.creditsUsed||0),0);

    box.innerHTML=`
      <div class="rr-member-detail-card">
        <div class="rr-member-detail-top">
          <div>
            <h3 style="margin:0 0 4px">${escRR(customer.name)}</h3>
            <div class="rsub">${escRR(customer.phone||'No phone saved')}</div>
          </div>
          <div class="rr-member-credit-big">${balance(customer)} <span>credits</span></div>
        </div>
        <div class="rr-member-stats">
          <div><span>Credits Earned</span><strong>${earned}</strong></div>
          <div><span>Credits Used</span><strong>${used}</strong></div>
          <div><span>Current Balance</span><strong>${balance(customer)}</strong></div>
        </div>
        <div class="rr-member-actions">
          <button class="btn" id="rrMemberAdjust">Adjust Credits</button>
          <button class="btn ghost" id="rrMemberEdit">Edit Member</button>
          <button class="btn danger" id="rrMemberDelete">Delete Member</button>
        </div>
        <div style="margin-top:18px">
          <h3 style="margin:0 0 10px">Member Activity</h3>
          ${events.length?`<div class="table-wrap"><table class="rr-credit-history-table"><thead><tr><th>Date</th><th>Activity</th><th>Credits</th></tr></thead><tbody>${events.map(e=>`<tr><td>${new Date(e.date).toLocaleString()}</td><td>${escRR(e.detail)}</td><td class="rr-credit-${e.kind}">${escRR(e.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No Roost Credit activity for this member yet.</div>'}
        </div>
      </div>
    `;

    document.getElementById('rrMemberAdjust').onclick=()=>document.querySelector('[data-carton-adjust="'+id+'"]')?.click();
    document.getElementById('rrMemberEdit').onclick=()=>document.querySelector('[data-carton-edit="'+id+'"]')?.click();
    document.getElementById('rrMemberDelete').onclick=()=>document.querySelector('[data-carton-delete="'+id+'"]')?.click();
  }

  function renderAdminCreditData(){
    hideOldRewardUI();
    adminCard();
    ensureMemberBrowser();

    const globalHistory=document.getElementById('rrCreditHistoryCard');
    if(globalHistory)globalHistory.remove();

    const list=document.getElementById('rrMemberListAZ');
    if(!list)return;
    const current=document.querySelector('.rr-member-name-btn.active')?.dataset.memberId||'';
    const members=[...(data.customers||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    if(!members.length){
      list.innerHTML='<div class="empty">No Roost members yet.</div>';
      drawMemberDetail('');
      return;
    }
    const groups={};
    members.forEach(m=>{
      const first=(String(m.name||'').trim().charAt(0)||'#').toUpperCase();
      const key=/[A-Z]/.test(first)?first:'#';
      (groups[key]||(groups[key]=[])).push(m);
    });
    const letters=Object.keys(groups).sort();
    list.innerHTML=letters.map(letter=>`
      <div class="rr-member-letter-group">
        <div class="rr-member-letter">${letter}</div>
        <div class="rr-member-buttons">
          ${groups[letter].map(m=>`<button class="rr-member-name-btn ${m.id===current?'active':''}" data-member-id="${escRR(m.id)}">${escRR(m.name)}<span>${escRR(m.phone||'')}</span></button>`).join('')}
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-member-id]').forEach(btn=>btn.onclick=()=>{
      const wasActive=btn.classList.contains('active');
      list.querySelectorAll('.rr-member-name-btn').forEach(x=>x.classList.remove('active'));
      if(wasActive){
        const box=document.getElementById('rrMemberDetail');
        if(box)box.innerHTML='';
        return;
      }
      btn.classList.add('active');
      drawMemberDetail(btn.dataset.memberId);
      document.getElementById('rrMemberDetail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    if(current&&members.some(m=>m.id===current))drawMemberDetail(current);
    else drawMemberDetail('');
  }

  async function saveAdminSettings(){
    const status=document.getElementById('rrCreditSaveStatus');
    const btn=document.getElementById('rrSaveCreditSettings');
    const value=Number(document.getElementById('rrAdminCreditValue').value);
    if(!Number.isFinite(value)||value<.01){status.textContent='Credit value must be at least $0.01.';return}
    const types=[...document.querySelectorAll('#rrReturnAdminList .rr-return-admin-row')].map(r=>({
      id:r.dataset.id,
      name:r.querySelector('.rr-ret-name').value.trim(),
      credit:Math.max(0,Math.floor(Number(r.querySelector('.rr-ret-credit').value||0))),
      active:true
    })).filter(t=>t.name);
    if(!types.length){status.textContent='Add at least one return type.';return}
    const settings={creditValue:Math.round(value*100)/100,allowFullPurchase:document.getElementById('rrAdminFullPurchase').checked,returnTypes:types};
    btn.disabled=true;status.textContent='Saving…';
    try{
      if(!window.RRCloud?.api)throw new Error('Cloud connection is not ready.');
      const out=await window.RRCloud.api('roost_credit_settings_save',{settings},true);
      data.settings=data.settings&&typeof data.settings==='object'?data.settings:{};
      data.settings.roostCreditSettings=out.settings||settings;
      data.roostReturnTypes=(out.settings||settings).returnTypes;
      status.textContent='Saved · Register will update automatically.';
      setTimeout(()=>{if(status.textContent.startsWith('Saved'))status.textContent=''},2500);
    }catch(e){status.textContent=(e&&e.message)||'Could not save credit settings.'}
    finally{btn.disabled=false}
  }

  function apply(){
    addStyles();
    const isAdmin=/admin-cloud-beta\.html$/i.test(location.pathname);
    if(isAdmin){
      if(typeof renderAll==='function'&&!renderAll.__rrCreditAdminWrapped){
        const baseRenderAll=renderAll;
        const wrapped=function(){baseRenderAll();setTimeout(renderAdminCreditData,0)};
        wrapped.__rrCreditAdminWrapped=true;
        renderAll=wrapped;
      }
      renderAdminCreditData();
      return;
    }
    window.checkout=payChooser;
    const b=document.getElementById('payBtn');if(b)b.onclick=payChooser;
  }
  window.addEventListener('load',()=>{let n=0;const t=setInterval(()=>{apply();if(++n>20)clearInterval(t)},400)});
  if(document.readyState==='complete')apply();
})();