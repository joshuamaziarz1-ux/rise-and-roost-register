// Explicitly opt-in acceptance for the NEW review Worker only. No account credentials.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { softwarePasskey } from './passkey-fixture.mjs';
const origin = process.env.RR_EXPERIENCE_PREVIEW_URL;
if (origin !== 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev') throw new Error('Set the exact isolated experience preview origin; the public beta is never a test target.');
let checks = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); checks++; };
const client = () => new Map();
async function call(cookies, path, body, extra = {}) {
  const r = await fetch(origin+path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...cookies].map(([k,v])=>k+'='+v).join('; '), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' });
  for(const c of r.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); if(c.includes('Max-Age=0'))cookies.delete(k);else cookies.set(k,v); }
  return { status: r.status, data: await r.json(), headers: r.headers };
}
for (const path of ['/', '/shop', '/cart', '/roost', '/comments', '/studio']) {
  const r = await fetch(origin+path); check(r.status===200, 'Preview page failed: '+path); check(r.headers.get('x-robots-tag')?.includes('noindex'), 'Review page must be noindex.');
}
for (const file of ['app.mjs','customer.mjs','customer.css','dom.mjs','studio.mjs','tracking.mjs','pickup-location.mjs']) {
  const r = await fetch(origin+'/'+file), body = await r.arrayBuffer();
  check(r.ok && createHash('sha256').update(Buffer.from(body)).digest('hex') === createHash('sha256').update(await readFile(new URL('../public/'+file,import.meta.url))).digest('hex'), 'Deployed source differs: '+file);
}
const owner = client(), guest = client(), member = client(), other = client();
const root = await call(guest,'/api/site');
check(root.data.customerExperienceEnabled===true, 'Experience must be enabled.');
check(root.data.id!=='be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae','Review must use a new workspace.');
const created = await call(owner,'/api/workspaces',{});
check(created.status===201, 'Synthetic workspace creation failed.');
const site = created.data, post = (c,path,data={})=>call(c,path,{ workspaceId:site.id,...data }), me=c=>call(c,'/api/roost/me?workspace='+site.id);
const key=softwarePasskey();
let options=(await post(member,'/api/roost/options',{kind:'register',profile:{name:'Synthetic Preview Neighbor',email:'qa@example.test',phone:'555-0101'}})).data.options;
const registered=await post(member,'/api/roost/verify',{response:key.register(options,origin)});
check(registered.status===200 && !!registered.data.recoveryKey,'Passkey enrollment failed.');
check(registered.headers.getSetCookie().some(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('Max-Age=2592000')),'Remembered session must be secure and persistent.');
check((await me(member)).data.member?.profile.name==='Synthetic Preview Neighbor','Saved member did not persist.');
check((await call(member,'/api/studio')).status===401,'Customer must never authenticate to Studio.');
check((await me(owner)).data.member===null,'Studio owner session must not become a customer session.');
const orderInput=()=>({storefront:'demo',revision:site.publishedRevision,requestId:crypto.randomUUID(),pickupId:site.published.pickups[0].id,lines:[{productId:'bread',variantId:'classic',qty:1,unitPrice:900}],total:900,customerDetails:{name:'Synthetic Preview Neighbor'}});
const guestOrder=await post(guest,'/api/orders',{...orderInput(),checkoutMode:'guest'});
check(guestOrder.status===201,'Guest checkout failed.');
check((await me(guest)).data.member===null,'Guest checkout must not create a membership.');
const memberOrder=await post(member,'/api/orders',{...orderInput(),checkoutMode:'member'});
check(memberOrder.status===201,'Member checkout failed.');
check((await me(member)).data.orders.length===1,'Member history must contain only the member order.');
check((await me(other)).data.member===null,'Anonymous session must not see member information.');
const link=new URL(guestOrder.data.trackingPath,origin), secret=new URLSearchParams(link.hash.slice(1)).get('access');
const tracking=link.pathname.replace('/orders/','/api/order-tracking/');
let status=await call(guest,tracking,undefined,{Authorization:'Bearer '+secret});
check(status.data.paymentStatus==='not_collected','New order must not claim payment.');
status=await call(guest,tracking+'/report',{}, {Authorization:'Bearer '+secret});
check(status.data.paymentStatus==='reported' && status.data.status==='pending' && !status.data.paidReceipt,'Payment reporting must not verify payment or start preparation.');
const submitted=await post(guest,'/api/comments',{name:'Synthetic Neighbor',body:'Synthetic acceptance comment; isolated demo only.',publicConsent:true});
check(submitted.status===201,'Comment submission failed.');
check((await call(guest,'/api/comments?workspace='+site.id)).data.comments.length===0,'Unreviewed comments must remain private.');
const comments=await call(owner,'/api/studio-comments',undefined,{'X-RR-Workspace':site.id});
const comment=comments.data.comments[0];
check((await post(member,'/api/studio-comments',{id:comment.id,version:comment.version,status:'approved'})).status===401,'Customer cannot moderate comments.');
check((await call(owner,'/api/studio-comments',{id:comment.id,version:comment.version,status:'approved'},{'X-RR-Workspace':site.id})).status===200,'Owner moderation failed.');
check((await call(guest,'/api/comments?workspace='+site.id)).data.comments.length===1,'Approved comment did not persist.');
await post(member,'/api/roost/logout');
check((await me(member)).data.member===null,'Sign-out must revoke access.');
options=(await post(member,'/api/roost/options',{kind:'login'})).data.options;
check((await post(member,'/api/roost/verify',{response:key.login(options,origin)})).status===200,'Signed passkey authentication failed.');
check((await me(member)).data.orders.length===1,'Order history was lost after a new sign-in.');
console.log(JSON.stringify({passed:checks,worker:'rise-roost-experience-preview',guestCheckout:'passed',memberCheckout:'passed',passkeys:'cryptographic software authenticator',studioIsolation:'passed',comments:'passed',publicBetaWrites:0,existingCustomerRecordsUsed:false}));
