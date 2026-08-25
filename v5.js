(()=>{
const V5='5';
let currentAdmin=null,adminStage='choose',selectedAdmin='',pendingPin='';
const ADMIN_NAMES=['Danielle','Ivan'];
const ADMIN_KEY=name=>`riseRoostAdminPinHashV5:${String(name).toLowerCase()}`;
const methodLabel=m=>m==='both'?'Text + Email':m==='text'?'Text':m==='email'?'Email':'Not set';
const includesEmail=m=>m==='email'||m==='both';
const includesText=m=>m==='text'||m==='both';

function ensureV5(){
 data.customers=Array.isArray(data.customers)?data.customers:[];
 data.roostAlerts=Array.isArray(data.roostAlerts)?data.roostAlerts:[];
 data.notificationLog=Array.isArray(data.notificationLog)?data.notificationLog:[];
 data.adminAudit=Array.isArray(data.adminAudit)?data.adminAudit:[];
 data.notificationSettings=data.notificationSettings&&typeof data.notificationSettings==='object'?data.notificationSettings:{};
 data.notificationSettings.emailEndpoint=String(data.notificationSettings.emailEndpoint||'');
 data.notificationSettings.textEndpoint=String(data.notificationSettings.textEndpoint||'');
 data.customers.forEach(c=>{
   c.phone=String(c.phone||'');c.email=String(c.email||'');
   if(!['text','email','both'].includes(c.notifyMethod))c.notifyMethod=c.email?'email':c.phone?'text':'email';
   c.storeUpdates=!!c.storeUpdates;c.pickupAlerts=c.pickupAlerts!==false;
 });
}
ensureV5();persist();

function audit(action,details=''){
 ensureV5();
 data.adminAudit.unshift({id:uid('audit'),date:new Date().toISOString(),admin:currentAdmin||'System',action,details});
 if(data.adminAudit.length>500)data.adminAudit.length=500;
 persist();
}

async function hashPin(name,pin){
 const raw=`RiseAndRoost|${name}|${pin}`;
 if(window.crypto?.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
 return btoa(raw);
}

function buildAdminLogin(){
 if($('v5AdminLogin'))return;
 const el=document.createElement('div');el.id='v5AdminLogin';el.className='overlay hidden';el.innerHTML=`<div class="modal"><h2 id="v5AdminTitle">Admin Login</h2><p class="hint" id="v5AdminHelp">Who is signing in?</p><div id="v5AdminChoices" class="admin-choice-grid">${ADMIN_NAMES.map(n=>`<button class="btn admin-choice" data-admin-name="${n}">${n}</button>`).join('')}</div><div id="v5AdminPinArea" class="hidden"><div class="field" style="margin-top:16px"><label>PIN</label><input class="pin" id="v5AdminPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••"></div><button class="btn ghost wide" id="v5AdminBack">← Choose Admin</button></div><div class="actions"><button class="btn ghost" id="v5AdminCancel">Cancel</button><button class="btn primary hidden" id="v5AdminContinue">Continue</button></div></div>`;
 document.body.appendChild(el);
 el.querySelectorAll('[data-admin-name]').forEach(b=>b.onclick=()=>selectAdmin(b.dataset.adminName));
 $('v5AdminCancel').onclick=()=>el.classList.add('hidden');
 $('v5AdminBack').onclick=showAdminChoices;
 $('v5AdminContinue').onclick=submitAdminPin;
 $('v5AdminPin').onkeydown=e=>{if(e.key==='Enter')submitAdminPin()};
}
function showAdminChoices(){adminStage='choose';selectedAdmin='';pendingPin='';$('v5AdminTitle').textContent='Admin Login';$('v5AdminHelp').textContent='Who is signing in?';$('v5AdminChoices').classList.remove('hidden');$('v5AdminPinArea').classList.add('hidden');$('v5AdminContinue').classList.add('hidden');$('v5AdminPin').value=''}
function openAdminLogin(){buildAdminLogin();showAdminChoices();$('v5AdminLogin').classList.remove('hidden')}
function selectAdmin(name){selectedAdmin=name;const has=!!localStorage.getItem(ADMIN_KEY(name));adminStage=has?'login':'create1';$('v5AdminChoices').classList.add('hidden');$('v5AdminPinArea').classList.remove('hidden');$('v5AdminContinue').classList.remove('hidden');$('v5AdminTitle').textContent=has?`${name} Admin`:`Set Up ${name}`;$('v5AdminHelp').textContent=has?'Enter your PIN.':'Create your 4–6 digit admin PIN.';$('v5AdminPin').value='';setTimeout(()=>$('v5AdminPin').focus(),80)}
async function submitAdminPin(){const pin=$('v5AdminPin').value.trim();if(!/^\d{4,6}$/.test(pin))return alert('Use a 4–6 digit PIN.');if(adminStage==='login'){const h=await hashPin(selectedAdmin,pin);if(h!==localStorage.getItem(ADMIN_KEY(selectedAdmin)))return alert('Incorrect PIN.');return enterAdmin(selectedAdmin)}if(adminStage==='create1'){pendingPin=pin;adminStage='create2';$('v5AdminTitle').textContent=`Confirm ${selectedAdmin} PIN`;$('v5AdminHelp').textContent='Enter the same PIN again.';$('v5AdminPin').value='';return $('v5AdminPin').focus()}if(adminStage==='create2'){if(pin!==pendingPin){pendingPin='';adminStage='create1';$('v5AdminHelp').textContent='PINs did not match. Try again.';$('v5AdminPin').value='';return}localStorage.setItem(ADMIN_KEY(selectedAdmin),await hashPin(selectedAdmin,pin));audit('Admin PIN created',selectedAdmin);return enterAdmin(selectedAdmin)}}
function enterAdmin(name){currentAdmin=name;window.rrCurrentAdmin=name;$('v5AdminLogin').classList.add('hidden');$('adminScreen').classList.remove('hidden');updateAdminIdentity();renderAll();showTab('dashboard')}
function updateAdminIdentity(){const top=$('adminScreen')?.querySelector('.admin-top .sub');if(top)top.textContent=`${currentAdmin?`Signed in as ${currentAdmin} · `:''}Rise & Roost Register v5`}
function logoutAdmin(){currentAdmin=null;window.rrCurrentAdmin=null;$('adminScreen').classList.add('hidden')}
function changeCurrentPin(){if(!currentAdmin)return openAdminLogin();selectedAdmin=currentAdmin;pendingPin='';adminStage='create1';buildAdminLogin();$('v5AdminLogin').classList.remove('hidden');$('v5AdminChoices').classList.add('hidden');$('v5AdminPinArea').classList.remove('hidden');$('v5AdminContinue').classList.remove('hidden');$('v5AdminTitle').textContent=`Change ${currentAdmin}'s PIN`;$('v5AdminHelp').textContent='Enter a new 4–6 digit PIN.';$('v5AdminPin').value='';setTimeout(()=>$('v5AdminPin').focus(),80)}

function deliveryState(channel,alert){return alert.delivery?.[channel]||'not_requested'}
function deliveryBadge(channel,alert){const s=deliveryState(channel,alert);const txt={sent:'Sent',sending:'Sending',failed:'Failed',not_connected:'Not Connected',missing:'Missing Contact',not_requested:'Not Requested'}[s]||s;return `<span class="badge ${s==='sent'?'on':s==='failed'?'off':''}">${channel==='email'?'Email':'Text'}: ${txt}</span>`}
async function sendChannel(alert,c,channel){
 const endpoint=channel==='email'?data.notificationSettings.emailEndpoint:data.notificationSettings.textEndpoint;
 const address=channel==='email'?c.email:c.phone;
 if(!address){alert.delivery[channel]='missing';return}
 if(!endpoint){alert.delivery[channel]='not_connected';return}
 alert.delivery[channel]='sending';persist();renderAlerts();
 try{
   const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,to:address,name:c.name,subject:alert.subject,message:alert.message,alertId:alert.id,customerId:c.id})});
   if(!res.ok)throw new Error(`HTTP ${res.status}`);
   alert.delivery[channel]='sent';alert.delivery[`${channel}SentAt`]=new Date().toISOString();
   data.notificationLog.unshift({id:uid('notify'),date:new Date().toISOString(),alertId:alert.id,customerId:c.id,customerName:c.name,channel,to:address,status:'sent'});
 }catch(e){alert.delivery[channel]='failed';alert.delivery[`${channel}Error`]=String(e?.message||e);data.notificationLog.unshift({id:uid('notify'),date:new Date().toISOString(),alertId:alert.id,customerId:c.id,customerName:c.name,channel,to:address,status:'failed'});}
 persist();renderAlerts();
}
function dispatchAlert(alert,c){alert.delivery=alert.delivery||{};if(includesEmail(c.notifyMethod))sendChannel(alert,c,'email');else alert.delivery.email='not_requested';if(includesText(c.notifyMethod))sendChannel(alert,c,'text');else alert.delivery.text='not_requested';persist()}
function rewardMessage(c,units){const one=units===1;return `Hi ${c.name}! You just earned ${one?'a free dozen':`${units} free dozens`} of eggs at Rise & Roost. You now have ${c.cartonCredits} carton credits. Thanks for being part of The Roost!`}
function createRewardAlert(c,units){
 const alert={id:uid('alert'),date:new Date().toISOString(),type:'reward',customerId:c.id,customerName:c.name,title:units===1?'FREE DOZEN EARNED':`${units} FREE DOZENS EARNED`,subject:'You earned a free dozen at Rise & Roost!',message:rewardMessage(c,units),rewardUnits:units,rewardUnitsRemaining:units,credits:c.cartonCredits,notifyMethod:c.notifyMethod,seenAt:null,redeemedAt:null,delivery:{}};
 data.roostAlerts.unshift(alert);persist();dispatchAlert(alert,c);return alert;
}
function createMemberAlert(c){data.roostAlerts.unshift({id:uid('alert'),date:new Date().toISOString(),type:'member',customerId:c.id,customerName:c.name,title:'NEW ROOST MEMBER',message:`${c.name} joined The Roost.`,notifyMethod:c.notifyMethod,seenAt:null,delivery:{email:'not_requested',text:'not_requested'}});persist()}

function submitCartonsV5(){
 ensureV5();const c=data.customers.find(x=>x.id===$('cartonCustomerSelect').value),qty=Math.floor(Number($('cartonQty').value||0));
 if(!c)return alert('Choose your name first.');if(!Number.isFinite(qty)||qty<1)return alert('Enter how many reusable egg cartons you are returning.');
 if(!confirm(`Return ${qty} clean, reusable egg carton${qty===1?'':'s'} for ${c.name}?`))return;
 const need=Math.max(1,Math.floor(Number(data.cartonSettings?.cartonsPerFreeDozen||12))),before=Math.floor(Number(c.cartonCredits||0)),oldEarned=Math.floor(before/need);
 c.cartonCredits=before+qty;c.totalCartons=Math.max(0,Math.floor(Number(c.totalCartons||0)))+qty;c.updatedAt=new Date().toISOString();
 data.cartonReturns.unshift({id:uid('carton'),date:new Date().toISOString(),customerId:c.id,customerName:c.name,qty});if(data.cartonReturns.length>2000)data.cartonReturns.length=2000;
 const newlyEarned=Math.max(0,Math.floor(c.cartonCredits/need)-oldEarned);if(newlyEarned>0)createRewardAlert(c,newlyEarned);
 persist();renderAll();$('cartonCustomerSelect').value=c.id;$('cartonQty').value=1;$('cartonCustomerSelect').dispatchEvent(new Event('change'));
 const free=Math.floor(c.cartonCredits/need),notice=newlyEarned?`\n\nYOU EARNED ${newlyEarned===1?'A FREE DOZEN!':`${newlyEarned} FREE DOZENS!`}\nNotification: ${methodLabel(c.notifyMethod)}`:'';
 alert(`Thank you! ${qty} carton${qty===1?'':'s'} added.\n\n${c.name} now has ${c.cartonCredits} carton credits.${free?`\nFree dozen${free===1?'':'s'} available: ${free}`:''}${notice}`);
}

const oldLogStockV5=logStock;
logStock=function(i,delta,reason){oldLogStockV5(i,delta,reason);ensureV5();const entry=data.stockLog?.[0];if(entry)entry.adminName=currentAdmin||(/Customer sale|Carton Club/.test(reason||'')?'Customer':'System');if(currentAdmin)audit('Inventory adjusted',`${i.name}: ${Number(delta)>0?'+':''}${delta} · ${reason||'Adjustment'}`);if(/^Carton Club free dozen — /.test(reason||'')){const name=String(reason).replace(/^Carton Club free dozen — /,'');for(let n=data.roostAlerts.length-1;n>=0;n--){const a=data.roostAlerts[n];if(a.type==='reward'&&a.customerName===name&&Number(a.rewardUnitsRemaining||0)>0){a.rewardUnitsRemaining-=1;if(a.rewardUnitsRemaining<=0){a.rewardUnitsRemaining=0;a.redeemedAt=new Date().toISOString()}break}}persist();renderAlerts()}}

function hideCustomerViews(){['kioskHome','shopView','pickupView','cartonView','roostHub','joinView'].forEach(id=>$(id)?.classList.add('hidden'))}
function showJoinV5(){hideCustomerViews();$('joinView').classList.remove('hidden');const form=document.querySelector('.join-form');form.classList.remove('hidden');['joinName','joinPhone','joinEmail'].forEach(id=>{$(id).value=''});const email=$('notifyEmail');if(email)email.checked=true;if($('joinStoreUpdates'))$('joinStoreUpdates').checked=false;$('joinResult').innerHTML='';window.scrollTo(0,0)}
function rebuildJoinForm(){const form=document.querySelector('.join-form');if(!form)return;form.innerHTML=`<div class="field"><label>Name</label><input id="joinName" autocomplete="name" placeholder="Your name"></div><div class="field"><label>Phone number</label><input id="joinPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="Phone number"></div><div class="field"><label>Email</label><input id="joinEmail" type="email" autocomplete="email" inputmode="email" placeholder="Email address"></div><div><div class="notify-title">How would you like to be notified?</div><div class="notify-choice"><label><input type="radio" name="notifyMethod" id="notifyText" value="text"><span>Text</span></label><label><input type="radio" name="notifyMethod" id="notifyEmail" value="email" checked><span>Email</span></label><label><input type="radio" name="notifyMethod" id="notifyBoth" value="both"><span>Both</span></label></div><p class="hint">We'll use this for pickup and Roost reward notices.</p></div><label class="consent"><input id="joinStoreUpdates" type="checkbox"><span><strong>Store news & specials</strong><br><span class="hint">Optional Rise & Roost updates.</span></span></label><button class="btn primary wide pay" id="joinSubmit">Join the Roost</button>`;$('joinSubmit').onclick=signupV5;$('goJoin').onclick=showJoinV5}
function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)}
function phoneDigits(s){return String(s||'').replace(/\D/g,'')}
function signupV5(){
 ensureV5();const name=$('joinName').value.trim(),phone=$('joinPhone').value.trim(),email=$('joinEmail').value.trim().toLowerCase(),method=document.querySelector('input[name="notifyMethod"]:checked')?.value;
 if(!name)return alert('Please enter your name.');if(phoneDigits(phone).length<7)return alert('Please enter a valid phone number.');if(!validEmail(email))return alert('Please enter a valid email address.');if(!method)return alert('Choose Text, Email, or Both.');
 if(data.customers.some(c=>phoneDigits(c.phone)===phoneDigits(phone)))return alert('That phone number is already connected to a Roost Club member.');if(data.customers.some(c=>String(c.email||'').toLowerCase()===email))return alert('That email is already connected to a Roost Club member.');
 const c={id:uid('customer'),name,phone,email,notifyMethod:method,pickupAlerts:true,storeUpdates:$('joinStoreUpdates').checked,cartonCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString()};data.customers.push(c);createMemberAlert(c);persist();renderAll();document.querySelector('.join-form').classList.add('hidden');
 $('joinResult').innerHTML=`<div class="pickup-result welcome-roost"><h2>Welcome to the Roost, ${esc(c.name)}!</h2><div class="rsub">Carton Credits</div><div class="credit-number">0</div><div class="notice"><strong>Notifications: ${methodLabel(c.notifyMethod)}</strong><br>We'll let you know when you earn a free dozen.</div><button class="btn primary wide" id="v5ReturnNow">Return Cartons Now</button><button class="btn ghost wide" id="v5SignupDone">Done</button></div>`;
 $('v5ReturnNow').onclick=()=>{$('goCartons').click();setTimeout(()=>{$('cartonCustomerSelect').value=c.id;$('cartonCustomerSelect').dispatchEvent(new Event('change'))},20)};$('v5SignupDone').onclick=()=>$('roostBack').click();
}

function injectAlertsTab(){
 if($('alertsTab'))return;const tabs=document.querySelector('.tabs'),salesBtn=[...tabs.querySelectorAll('.tab')].find(b=>b.dataset.tab==='sales');const b=document.createElement('button');b.className='btn tab';b.dataset.tab='alerts';b.innerHTML='Roost Alerts <span id="roostAlertCount" class="alert-count">0</span>';tabs.insertBefore(b,salesBtn||null);b.onclick=()=>showTab('alerts');
 const d=document.createElement('div');d.id='alertsTab';d.className='hidden';d.innerHTML=`<div class="stats"><div class="card stat"><label>Unredeemed Rewards</label><strong id="alertRewardCount">0</strong></div><div class="card stat"><label>New Alerts</label><strong id="alertNewCount">0</strong></div><div class="card stat"><label>Email Delivery</label><strong id="alertEmailStatus" class="small-stat">Not Connected</strong></div><div class="card stat"><label>Text Delivery</label><strong id="alertTextStatus" class="small-stat">Not Connected</strong></div></div><div class="card section"><div class="section-head"><h2>Roost Alerts</h2></div><div id="roostAlertList"></div></div><div class="card section"><div class="section-head"><h2>Recent Admin Activity</h2></div><div id="adminAuditList"></div></div>`;document.querySelector('.admin-wrap').appendChild(d);
 const ds=$('dashboardTab')?.querySelector('.stats');if(ds&&!$('dashRoostAlerts')){const s=document.createElement('div');s.className='card stat';s.innerHTML='<label>Roost Alerts</label><strong id="dashRoostAlerts">0</strong>';ds.appendChild(s)}
}
function renderAlerts(){
 ensureV5();if(!$('alertsTab'))return;const rewards=data.roostAlerts.filter(a=>a.type==='reward'&&Number(a.rewardUnitsRemaining||0)>0),newAlerts=data.roostAlerts.filter(a=>!a.seenAt);$('roostAlertCount').textContent=newAlerts.length;$('alertRewardCount').textContent=rewards.reduce((s,a)=>s+Number(a.rewardUnitsRemaining||0),0);$('alertNewCount').textContent=newAlerts.length;$('dashRoostAlerts')&&($('dashRoostAlerts').textContent=newAlerts.length);$('alertEmailStatus').textContent=data.notificationSettings.emailEndpoint?'Connected':'Not Connected';$('alertTextStatus').textContent=data.notificationSettings.textEndpoint?'Connected':'Not Connected';
 const alerts=[...data.roostAlerts].slice(0,100);$('roostAlertList').innerHTML=alerts.length?alerts.map(a=>`<div class="alert-row ${!a.seenAt?'alert-new':''}"><div><div class="rtitle">${esc(a.title)} — ${esc(a.customerName)}</div><div class="rsub">${new Date(a.date).toLocaleString()} · ${methodLabel(a.notifyMethod)}</div>${a.type==='reward'?`<div class="rsub">${Number(a.rewardUnitsRemaining||0)>0?`${a.rewardUnitsRemaining} free dozen${a.rewardUnitsRemaining===1?'':'s'} not redeemed`:'Reward redeemed'}</div>`:''}</div><div class="alert-delivery">${deliveryBadge('email',a)} ${deliveryBadge('text',a)}</div><div class="row-actions">${!a.seenAt?`<button class="btn small" data-seen-alert="${a.id}">Mark Seen</button>`:''}${a.type==='reward'?`<button class="btn small ghost" data-retry-alert="${a.id}">Retry Notice</button>`:''}</div></div>`).join(''):'<div class="empty">No Roost alerts yet.</div>';
 $('roostAlertList').querySelectorAll('[data-seen-alert]').forEach(b=>b.onclick=()=>{const a=data.roostAlerts.find(x=>x.id===b.dataset.seenAlert);if(a){a.seenAt=new Date().toISOString();persist();renderAlerts()}});$('roostAlertList').querySelectorAll('[data-retry-alert]').forEach(b=>b.onclick=()=>{const a=data.roostAlerts.find(x=>x.id===b.dataset.retryAlert),c=data.customers.find(x=>x.id===a?.customerId);if(a&&c){a.delivery={};dispatchAlert(a,c);renderAlerts()}});
 const aa=data.adminAudit.slice(0,50);$('adminAuditList').innerHTML=aa.length?aa.map(x=>`<div class="row"><div><div class="rtitle">${esc(x.action)}</div><div class="rsub">${esc(x.admin)} · ${new Date(x.date).toLocaleString()}</div></div><div class="rsub">${esc(x.details||'')}</div><div></div></div>`).join(''):'<div class="empty">No admin activity yet.</div>';
}

const priorShowTabV5=showTab;
showTab=function(name){injectAlertsTab();if(name==='alerts'){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='alerts'));['dashboard','items','pickups','customers','sales','inventory','settings'].forEach(n=>$(n+'Tab')?.classList.add('hidden'));$('alertsTab').classList.remove('hidden');renderAlerts()}else{$('alertsTab')?.classList.add('hidden');priorShowTabV5(name);renderAlerts()}};

function notificationSettingsUI(){
 const st=$('settingsTab');if(!st||$('notificationSettingsCard'))return;const card=document.createElement('div');card.id='notificationSettingsCard';card.className='card section';card.innerHTML=`<div class="section-head"><div><h2>Member Notifications</h2><div class="hint">Reward alerts are created automatically. Email/text delivery activates when a notification connection is added.</div></div></div><div class="notify-status-grid"><div><strong>Email</strong><div id="settingsEmailState" class="rsub"></div></div><div><strong>Text</strong><div id="settingsTextState" class="rsub"></div></div></div><details class="connection-details"><summary>Notification connection setup</summary><div class="form two" style="margin-top:12px"><div class="field"><label>Email webhook URL</label><input id="emailEndpoint" type="url" placeholder="Leave blank until connected"></div><div class="field"><label>Text webhook URL</label><input id="textEndpoint" type="url" placeholder="Leave blank until connected"></div></div><button class="btn primary" id="saveNotificationEndpoints" style="margin-top:10px">Save Connections</button></details>`;st.insertBefore(card,st.firstChild);$('saveNotificationEndpoints').onclick=()=>{data.notificationSettings.emailEndpoint=$('emailEndpoint').value.trim();data.notificationSettings.textEndpoint=$('textEndpoint').value.trim();persist();audit('Notification connections updated');refreshNotificationSettings();renderAlerts()};refreshNotificationSettings()}
function refreshNotificationSettings(){if(!$('notificationSettingsCard'))return;$('emailEndpoint').value=data.notificationSettings.emailEndpoint;$('textEndpoint').value=data.notificationSettings.textEndpoint;$('settingsEmailState').textContent=data.notificationSettings.emailEndpoint?'Connected':'Not connected yet';$('settingsTextState').textContent=data.notificationSettings.textEndpoint?'Connected':'Not connected yet'}

function enhanceMembers(){
 ensureV5();const tab=$('customersTab');if(!tab)return;tab.querySelectorAll('[data-carton-adjust]').forEach(b=>b.onclick=()=>adjustCreditsV5(b.dataset.cartonAdjust));tab.querySelectorAll('[data-carton-edit]').forEach(b=>b.onclick=()=>editMemberV5(b.dataset.cartonEdit));tab.querySelectorAll('[data-carton-edit]').forEach(b=>{const c=data.customers.find(x=>x.id===b.dataset.cartonEdit),row=b.closest('.row'),sub=row?.querySelector('.rsub');if(c&&sub)sub.innerHTML=`${esc(c.phone||'No phone')}<div class="member-contact">${esc(c.email||'No email')}</div><div style="margin-top:4px"><span class="badge">Notify: ${methodLabel(c.notifyMethod)}</span></div>`});
 const form=$('cartonCustomerName')?.closest('.form');if(form&&!$('cartonCustomerNotify')){const f=document.createElement('div');f.className='field';f.innerHTML='<label>Notify by</label><select id="cartonCustomerNotify"><option value="email">Email</option><option value="text">Text</option><option value="both">Both</option></select>';form.insertBefore(f,$('addCartonCustomer'));form.style.gridTemplateColumns='repeat(4,minmax(0,1fr)) auto'}
 const add=$('addCartonCustomer');if(add)add.onclick=addMemberV5;
}
function addMemberV5(){const name=$('cartonCustomerName').value.trim(),phone=$('cartonCustomerPhone').value.trim(),email=$('cartonCustomerEmail')?.value.trim().toLowerCase()||'',notifyMethod=$('cartonCustomerNotify')?.value||'email';if(!name)return alert('Enter the customer name.');if(phone&&phoneDigits(phone).length<7)return alert('Enter a valid phone number.');if(email&&!validEmail(email))return alert('Enter a valid email address.');if(includesEmail(notifyMethod)&&!email)return alert('Email is required for that notification choice.');if(includesText(notifyMethod)&&!phone)return alert('Phone is required for that notification choice.');if(data.customers.some(c=>c.name.toLowerCase()===name.toLowerCase()))return alert('That member is already saved.');const c={id:uid('customer'),name,phone,email,notifyMethod,pickupAlerts:true,storeUpdates:false,cartonCredits:0,totalCartons:0,freeDozens:0,createdAt:new Date().toISOString()};data.customers.push(c);createMemberAlert(c);audit('Roost member added',name);$('cartonCustomerName').value='';$('cartonCustomerPhone').value='';if($('cartonCustomerEmail'))$('cartonCustomerEmail').value='';save()}
function adjustCreditsV5(id){const c=data.customers.find(x=>x.id===id);if(!c)return;const old=Number(c.cartonCredits||0),v=prompt(`Set ${c.name}'s carton credit balance:`,String(old));if(v===null)return;const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<0)return alert('Enter zero or a positive whole number.');c.cartonCredits=n;c.updatedAt=new Date().toISOString();audit('Carton credits adjusted',`${c.name}: ${old} → ${n}`);save()}
function editMemberV5(id){const c=data.customers.find(x=>x.id===id);if(!c)return;const name=prompt('Member name:',c.name);if(name===null||!name.trim())return;const phone=prompt('Phone:',c.phone||'');if(phone===null)return;if(phone&&phoneDigits(phone).length<7)return alert('Enter a valid phone number.');const email=prompt('Email:',c.email||'');if(email===null)return;const e=email.trim().toLowerCase();if(e&&!validEmail(e))return alert('Enter a valid email address.');const method=prompt('Notification method: text, email, or both',c.notifyMethod||'email');if(method===null)return;const m=method.trim().toLowerCase();if(!['text','email','both'].includes(m))return alert('Enter text, email, or both.');if(includesEmail(m)&&!e)return alert('Email is required for that notification choice.');if(includesText(m)&&!phone)return alert('Phone is required for that notification choice.');c.name=name.trim();c.phone=phone.trim();c.email=e;c.notifyMethod=m;c.updatedAt=new Date().toISOString();audit('Roost member updated',c.name);save()}

const oldRenderAllV5=renderAll;
renderAll=function(){ensureV5();oldRenderAllV5();injectAlertsTab();enhanceMembers();notificationSettingsUI();updateAdminIdentity();renderAlerts();refreshNotificationSettings()};

function patchSettings(){const cp=$('changePin');if(cp){cp.textContent='Change My Admin PIN';cp.onclick=changeCurrentPin}const sec=cp?.closest('.section');if(sec){const h=sec.querySelector('h2');if(h)h.textContent='Admin Access';const p=sec.querySelector('.hint');if(p)p.textContent='Danielle and Ivan each have a separate PIN. Changes are recorded under the signed-in admin.'}}

const css=document.createElement('style');css.textContent=`
.admin-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.admin-choice{min-height:86px;font-size:1.25rem}.notify-title{font-weight:900;margin-bottom:8px}.notify-choice{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.notify-choice input{position:absolute;opacity:0}.notify-choice span{display:block;text-align:center;padding:14px 8px;border:2px solid var(--line);border-radius:13px;background:#fff;font-weight:900}.notify-choice input:checked+span{border-color:var(--accent);background:#e4eadf;color:var(--accent2)}.alert-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-left:4px;border-radius:999px;background:#8a3d35;color:white;font-size:.72rem}.alert-row{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(190px,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-bottom:9px}.alert-new{border-left:5px solid var(--accent)}.alert-delivery{display:flex;gap:5px;flex-wrap:wrap}.small-stat{font-size:1.08rem!important;margin-top:8px!important}.notify-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.connection-details{margin-top:12px}.connection-details summary{cursor:pointer;font-weight:850}@media(max-width:700px){.admin-choice-grid,.notify-choice,.notify-status-grid{grid-template-columns:1fr}.alert-row{grid-template-columns:1fr}}
`;document.head.appendChild(css);

// Replace v4 signup controls and attach v5 behaviors.
rebuildJoinForm();buildAdminLogin();injectAlertsTab();notificationSettingsUI();patchSettings();enhanceMembers();
$('cartonSubmit').onclick=submitCartonsV5;
$('adminBtn').onclick=openAdminLogin;$('exitAdmin').onclick=logoutAdmin;

// Keep visible version information accurate even while preserving the stable v4 base files.
document.title='Rise & Roost Register v5';document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost Register v5');const ver=$('settingsTab')?.querySelector('.danger-zone strong');if(ver)ver.textContent='Rise & Roost Register v5';updateAdminIdentity();

// v5 backups include notification preferences, alerts, delivery logs, and admin audit data.
$('exportBackup').onclick=()=>{const blob=new Blob([JSON.stringify({version:5,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rise-and-roost-v5-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
renderAll();
})();