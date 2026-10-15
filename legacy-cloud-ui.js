/* Connect the original GitHub Pages controls to the shared database without changing their layout. */
(()=>{
  if(!window.__RR_CLOUD_MODE||!window.RRLegacy)return;
  let purchase=[];
  async function checkIn(){
    const input=$('memberNameInput'),status=$('memberFindStatus'),value=input?.value.trim();
    if(!value){if(status)status.textContent='Enter your name or phone number.';return;}
    let payload,action;
    if(/\d/.test(value)){action='member_lookup_phone';payload={phone:value};}
    else{const last4=prompt('Enter the last 4 digits of your phone number to confirm your Roost membership.');if(last4===null)return;action='member_lookup';payload={name:value,last4:last4.trim()};}
    try{const out=await RRCloud.api(action,payload);RRCloud.applyMember(out);RRLegacy.setMember(out.member);renderAll();$('goShop').click();}
    catch(error){if($('memberFindStatus'))$('memberFindStatus').textContent=error.message;}
  }
  window.RRLegacyCloud={checkIn};
  const originalCheckout=checkout;
  checkout=function(){
    if(!RRCloud.ready)return alert('Reconnect before paying.');
    if(RRCloud.pendingCheckout)return RRCloud.recoverPending();
    purchase=entries().map(x=>({item:{...x.item},qty:x.qty}));
    originalCheckout();
  };
  $('payBtn').onclick=checkout;
  $('finishSale').onclick=async()=>{
    if(!purchase.length)return;
    const button=$('finishSale');button.disabled=true;
    try{await RRCloud.checkout('cash',purchase);cart={};$('payOverlay').classList.add('hidden');$('thanks').classList.remove('hidden');renderAll();}
    catch(error){alert(error.message);}finally{button.disabled=false;}
  };
  document.addEventListener('click',async event=>{
    if(!event.target.closest?.('#joinSubmit'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const name=$('joinName').value.trim(),phone=$('joinPhone').value.trim(),email=$('joinEmail').value.trim();
    if(!name||!/^\d{10}$/.test(phone.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,''))||!/^\S+@\S+\.\S+$/.test(email))return alert('Please enter your name, full phone number, and email.');
    const button=$('joinSubmit');button.disabled=true;
    try{
      const out=await RRCloud.api('member_signup',{name,phone,email,pickupAlerts:$('joinPickupAlerts').checked,storeUpdates:$('joinStoreUpdates').checked});
      RRCloud.applyMember(out);RRLegacy.setMember(out.member);renderAll();
      document.querySelector('.join-form').classList.add('hidden');
      $('joinResult').innerHTML=`<div class="pickup-result welcome-roost"><h2>Welcome to the Roost, ${esc(out.member.name)}!</h2><div class="rsub">Carton Credits</div><div class="credit-number">${out.member.cartonCredits}</div><p class="hint">Bring back clean, reusable dozen-egg cartons to earn credits toward a free dozen.</p><button class="btn primary wide" id="returnNow">Return Cartons Now</button><button class="btn ghost wide" id="signupDone">Done</button></div>`;
      $('returnNow').onclick=()=>{$('goCartons').click();$('cartonCustomerSelect').value=out.member.id;$('cartonCustomerSelect').dispatchEvent(new Event('change'));};
      $('signupDone').onclick=()=>{$('joinView').classList.add('hidden');$('kioskHome').classList.remove('hidden');};
    }catch(error){alert(error.message);}finally{button.disabled=false;}
  },true);
  // Expired member capabilities require another check-in; old device state cannot authorize a return.
  if(!sessionStorage.getItem('rr.memberToken'))RRLegacy.clearIdentity();
  document.addEventListener('rr:sync',()=>RRLegacy.refresh());
})();
