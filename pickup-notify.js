(()=>{
const TEST=!!window.__RR_TEST_MODE;
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const digits=s=>String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');

const css=document.createElement('style');
css.textContent=`
.pickup-notify{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.pickup-notify-label{font-weight:900;margin-bottom:7px}.pickup-notify-actions{display:flex;gap:7px;flex-wrap:wrap}
.pickup-notify-contact{margin-top:6px;color:var(--muted);font-size:.84rem}
.notify-preview{white-space:pre-wrap;line-height:1.5;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff;margin:12px 0}
@media(max-width:700px){.pickup-notify-actions .btn{flex:1;min-width:90px}}
`;
document.head.appendChild(css);

function memberFor(p){
  const members=Array.isArray(data.customers)?data.customers:[];
  if(p.customerId){const c=members.find(x=>x.id===p.customerId);if(c)return c}
  return members.find(c=>norm(c.name)===norm(p.customerName))||null;
}
function contactFor(p){
  const c=memberFor(p);
  return {
    phone:String(p.phone||c?.phone||'').trim(),
    email:String(p.email||c?.email||'').trim(),
    member:c
  };
}
function itemList(p){
  return (p.items||[]).map(i=>`${Number(i.qty||0)} ${i.itemName}`).join(', ');
}
function messageFor(p){
  const first=String(p.customerName||'there').trim().split(/\s+/)[0]||'there';
  let msg=`Hi ${first}! Just a quick note to let you know your Rise & Roost order is ready for pickup. Your pickup code is ${p.code}. We have ${itemList(p)} ready for you.`;
  if(String(p.note||'').trim())msg+=` Pickup note: ${String(p.note).trim()}.`;
  msg+=' Thank you so much!';
  return msg;
}
function subjectFor(){return 'Your Rise & Roost order is ready'}
function openText(p){
  const {phone}=contactFor(p);const d=digits(phone);
  if(d.length<7)return alert('No phone number is saved for this pickup or Roost member.');
  const body=encodeURIComponent(messageFor(p));
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  location.href=isiOS?`sms:${d}&body=${body}`:`sms:${d}?body=${body}`;
}
function openEmail(p){
  const {email}=contactFor(p);
  if(!email||!email.includes('@'))return alert('No email address is saved for this pickup or Roost member.');
  location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subjectFor())}&body=${encodeURIComponent(messageFor(p))}`;
}
function bothModal(p){
  const {phone,email}=contactFor(p);
  let o=$('pickupNotifyOverlay');
  if(!o){
    o=document.createElement('div');o.id='pickupNotifyOverlay';o.className='overlay hidden';
    o.innerHTML=`<div class="modal"><h2>Notify Customer</h2><p class="hint">Open the pre-filled text and email, then send them from your device.</p><div id="pickupNotifyPreview" class="notify-preview"></div><div class="actions"><button class="btn ghost" id="pickupNotifyClose">Close</button><button class="btn" id="pickupNotifyText">Open Text</button><button class="btn primary" id="pickupNotifyEmail">Open Email</button></div></div>`;
    document.body.appendChild(o);$('pickupNotifyClose').onclick=()=>o.classList.add('hidden');o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden')});
  }
  $('pickupNotifyPreview').textContent=messageFor(p);
  $('pickupNotifyText').disabled=digits(phone).length<7;$('pickupNotifyEmail').disabled=!email||!email.includes('@');
  $('pickupNotifyText').onclick=()=>openText(p);$('pickupNotifyEmail').onclick=()=>openEmail(p);
  o.classList.remove('hidden');
}
function enhancePickups(){
  const list=$('activePickupList');if(!list)return;
  list.querySelectorAll('[data-pickup]').forEach(row=>{
    const id=row.dataset.pickup,p=(data.pickups||[]).find(x=>x.id===id);if(!p||row.querySelector('.pickup-notify'))return;
    const c=contactFor(p),box=document.createElement('div');box.className='pickup-notify';
    box.innerHTML=`<div class="pickup-notify-label">Notify Customer</div><div class="pickup-notify-actions"><button class="btn small" data-notify-text>Text</button><button class="btn small" data-notify-email>Email</button><button class="btn small primary" data-notify-both>Both</button></div><div class="pickup-notify-contact">${c.phone?`Phone: ${esc(c.phone)}`:'No phone saved'} · ${c.email?`Email: ${esc(c.email)}`:'No email saved'}</div>`;
    const actions=row.querySelector('.row-actions')||row.lastElementChild;actions?.appendChild(box);
    box.querySelector('[data-notify-text]').onclick=()=>openText(p);box.querySelector('[data-notify-email]').onclick=()=>openEmail(p);box.querySelector('[data-notify-both]').onclick=()=>bothModal(p);
  });
}
const oldRenderPickups=renderPickups;
renderPickups=function(){oldRenderPickups();setTimeout(enhancePickups,0)};
const oldRenderAll=renderAll;
renderAll=function(){oldRenderAll();setTimeout(enhancePickups,0)};
setTimeout(enhancePickups,0);

if(!TEST){
  document.title='Rise & Roost Register v4.7.1';
  document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost Register v4.7.1');
  const adminSub=document.querySelector('#adminScreen .admin-top .sub');if(adminSub)adminSub.textContent='Rise & Roost Register v4.7.1';
  const versionStrong=document.querySelector('#settingsTab .danger-zone strong');if(versionStrong)versionStrong.textContent='Rise & Roost Register v4.7.1';
}
})();