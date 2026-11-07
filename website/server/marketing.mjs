import { reserveEmailBudget } from './notifications.mjs';
import { emailAddress, SENDER } from './email-policy.mjs';
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const marketingTemplates={products:'New Products',preorders:'Preorders Now Open',seasonal:'Seasonal Favorites',updates:'Store Updates'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function marketingState(ledger) { return ledger.marketing ||= {contacts:[],campaigns:[],address:'',history:[]}; }
export function marketingSnapshot(ledger,env) {
 const m=marketingState(ledger); return {...m,campaigns:m.campaigns.map(c=>({...c,preview:campaignPreview(c,m.address)})),contacts:m.contacts.map(({tokenHash,unsubscribeHash,...c})=>c),sendingEnabled:false,signupEnabled:env.MARKETING_SIGNUP_ENABLED==='true',providerVerified:env.MARKETING_PROVIDER_VERIFIED==='true',templates:marketingTemplates};
}
export function campaignPreview(c,address,unsubscribe='https://rise-and-roost.com/subscribe#unsubscribe=PREVIEW') {
 const origin='https://rise-and-roost.com';
 return {from:SENDER,subject:c.subject,text:[c.subject,c.message,origin,'Rise & Roost',address || 'Mailing address required before sending','Unsubscribe: '+unsubscribe].join('\n\n'),html:`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#faf6ed;color:#293d2c;font:17px/1.6 Arial,sans-serif"><main style="max-width:580px;margin:auto;padding:32px 20px"><img src="${origin}/assets/logo.webp" alt="Rise &amp; Roost" width="140"><h1 style="font-family:Georgia,serif">${esc(c.subject)}</h1>${c.photo?`<img src="${origin}${esc(c.photo)}" alt="${esc(c.photoAlt)}" style="width:100%;height:auto">`:''}<p style="white-space:pre-line">${esc(c.message)}</p><p><a href="${origin}" style="color:#355844">Visit Rise &amp; Roost</a></p><hr><p style="font-size:13px">Rise &amp; Roost<br>${esc(address || 'Mailing address required before sending')}</p><a href="${esc(unsubscribe)}">Unsubscribe</a></main></body></html>`};
}
export function manageMarketing({ledger,input,path,published,now,actor,id}) {
 const m=marketingState(ledger),at=new Date(now).toISOString();
 if(path==='/api/manage/marketing-settings') {
  if(typeof input.address!=='string'||input.address.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.address)) bad('Enter the accurate physical mailing address.');
  m.address=input.address.trim(); return {description:'Marketing mailing address saved',result:{}};
 }
 if(path==='/api/manage/marketing-draft') {
  if(!Object.hasOwn(marketingTemplates,input.template)||typeof input.subject!=='string'||!input.subject.trim()||input.subject.length>150||/[\r\n]/.test(input.subject)||typeof input.message!=='string'||!input.message.trim()||input.message.length>12000) bad('Choose a template, subject and message.');
  const photos=(published.products || []).filter(p=>!p.placeholder).flatMap(p=>(p.images||[]).map(v=>v.src).filter(v=>/^\/(?:assets\/[^?#]+\.(?:webp|jpe?g|png)|api\/assets\/[a-f0-9]{48})$/i.test(v)));
  if(input.photo && !photos.includes(input.photo)) bad('Select an existing product photograph.');
  let c=input.campaignId?m.campaigns.find(c=>c.id===input.campaignId):null;
  if(input.campaignId&&!c) bad('Campaign not found.',404);
  if(c&&c.status!=='draft') bad('This campaign is locked.',409);
  if(!c) {if(m.campaigns.length>=100)bad('Campaign storage is full. Export history before continuing.',409);c={id:id(),status:'draft',createdAt:at};m.campaigns.unshift(c);}
  Object.assign(c,{template:input.template,subject:input.subject.trim(),message:input.message.trim(),photo:input.photo || '',photoAlt:photos.includes(input.photo)?'Rise & Roost baked goods':'',updatedAt:at});
  return {description:'Marketing campaign draft saved',result:{campaignId:c.id}};
 }
 if(path==='/api/manage/marketing-suppress') {
  const c=m.contacts.find(c=>c.id===input.contactId);if(!c)bad('Subscriber not found.',404);
  c.status='unsubscribed';c.unsubscribedAt=at;delete c.tokenHash;
  return {description:'Subscriber suppressed immediately',result:{contactId:c.id}};
 }
 // Delivery is deliberately blocked until the supported Resend Marketing adapter
 // has been validated with appropriately scoped credentials. A transactional key
 // must never be used to fan out promotional email.
 if(['/api/manage/marketing-send','/api/manage/marketing-test'].includes(path)) bad('Marketing delivery is not activated. Save and preview your draft; the operator must validate the Resend Marketing connection before owner tests or sends.',409);
 bad('Marketing action not found.',404);
}
export async function marketingPublic({db,env,input,path,workspace,now,hash,token,rateLimit,json,fetcher=fetch}) {
 if(path.endsWith('/signup') && env.MARKETING_SIGNUP_ENABLED!=='true') bad('Email signup is not available yet. Please check back soon.',409);
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(path.endsWith('/signup')&&(!emailAddress(email)||input.consent!==true||input.website))bad('Enter your email and choose to receive bakery updates.');
 await rateLimit('marketing',12);
 const secret=token(),secretHash=await hash(secret),proof=await hash(typeof input.token==='string'?input.token:'');
 if(!path.endsWith('/signup') && !/^[a-f0-9]{48}$/.test(input.token || ''))bad('Use the complete private email link.');
 for(let attempt=0;attempt<4;attempt++){
  const row=await db.prepare('SELECT ledger_json,ledger_version FROM workspaces WHERE id=?').bind(workspace).first();if(!row)bad('Website unavailable.',503);
  const ledger=JSON.parse(row.ledger_json),m=marketingState(ledger),at=new Date(now).toISOString();
  if(path.endsWith('/signup')) {
   if(env.MARKETING_CONFIRMATION_EMAIL_ENABLED!=='true'||env.ROOST_AUTH_FREE_PLAN_CONFIRMED!=='true'||!env.RESEND_API_KEY) bad('Email signup is awaiting secure confirmation delivery. Please check back soon.',409);
   const existing=m.contacts.find(c=>c.email===email);
   if(existing?.status==='confirmed' || existing?.status==='unsubscribed' || existing?.requestedAt && now-Date.parse(existing.requestedAt)<3600000) return json({message:'If eligible, a confirmation email will arrive shortly.'});
   if(!existing && m.contacts.length>=1000)bad('Email signup is temporarily full.',409);
   const c=existing || {id:token(),email,status:'pending'};
   Object.assign(c,{tokenHash:secretHash,unsubscribeHash:await hash(c.id),expires:now+86400000,consentAt:at,source:'Fresh from the Roost website form',consentText:'I agree to receive bakery updates from Rise & Roost.',requestedAt:at});
   if(!existing)m.contacts.push(c);
  } else if(path.endsWith('/confirm')) {
   const c=m.contacts.find(c=>c.tokenHash===proof&&c.status==='pending'&&c.expires>now);if(!c)bad('This confirmation link has expired or was already used.',409);
   c.status='confirmed';c.confirmedAt=at;delete c.tokenHash;
  } else if(path.endsWith('/unsubscribe')) {
   const c=m.contacts.find(c=>c.unsubscribeHash===proof);if(!c)bad('This unsubscribe link is invalid.',404);
   c.status='unsubscribed';c.unsubscribedAt=at;delete c.tokenHash;
  } else bad('Action not found.',404);
  const saved=await db.prepare('UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?').bind(JSON.stringify(ledger),workspace,row.ledger_version).run();
  if(saved.meta.changes===1) {
   if(path.endsWith('/signup')) {
    // Separate confirmation cap preserves most transactional capacity for accounts.
    const key='marketing-confirmation:'+workspace+':'+new Date(now).toISOString().slice(0,10);
    await db.prepare('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,now+172800000).run();
    const cap=await db.prepare('SELECT count FROM limits WHERE key=?').bind(key).first();
    if(cap.count<=10 && await reserveEmailBudget(db,workspace,now)) {
     const url='https://rise-and-roost.com/subscribe#confirm='+secret;
     try { await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'marketing-opt-in-'+secretHash},body:JSON.stringify({from:SENDER,to:[email],subject:'Confirm your Rise & Roost subscription',text:'Confirm that you asked for bakery updates: '+url+'\nThis link expires in 24 hours. If you did not request this, ignore it.',html:`<html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#faf6ed;color:#293d2c;font:17px/1.6 Georgia,serif"><main style="max-width:560px;margin:auto;padding:28px"><img src="https://rise-and-roost.com/assets/logo.webp" width="140" alt="Rise &amp; Roost"><h1>Confirm your subscription</h1><p>You asked to receive bakery updates from Rise &amp; Roost.</p><p><a href="${url}">Confirm My Subscription</a></p><p>This link expires in 24 hours. If you did not request this, ignore this email.</p></main></body></html>`})}); } catch { /* Neutral response; never assert inbox delivery. */ }
    }
    return json({message:'If eligible, a confirmation email will arrive shortly.'});
   }
   return json({message:path.endsWith('/unsubscribe')?'You have been unsubscribed.':'Your subscription is confirmed.'});
  }
 }
 bad('Another update arrived. Retry your request.',409);
}
