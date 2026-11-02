import { PREVIEW_HOST, PREVIEW_DATABASE, PREVIEW_WORKSPACE, previewOwnerGrant } from './preview-access.mjs';
const encode = new TextEncoder(), COOKIE = '__Host-rr_studio_pin', DAY = 86400000;
export const PIN_ITERATIONS = 100000;
export const pinToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2,'0')).join('');
export const pinDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value)))].map(v => v.toString(16).padStart(2,'0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g), v => parseInt(v,16));
const hex = value => [...new Uint8Array(value)].map(v => v.toString(16).padStart(2,'0')).join('');
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encode.encode(value)));
}
export async function pinHash(pin, salt, pepper) {
  const material = await crypto.subtle.importKey('raw', encode.encode(await hmac(pepper,'studio-pin:'+pin)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:bytes(salt), iterations:PIN_ITERATIONS }, material,256));
}
function equal(a,b) { if (typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false; let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
const json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store, private','CDN-Cache-Control':'no-store',...headers}});
const denied = (error='Enter your owner PIN to open Website Studio.',status=401,headers={}) => {
  if(status===429&&headers['Retry-After']){const minutes=Math.max(1,Math.ceil(Number(headers['Retry-After'])/60));error=`Studio is temporarily locked. Try again in ${minutes} ${minutes===1?'minute':'minutes'}.`;}
  return json({error,previewAccessRequired:true,previewPinRequired:true},status,headers);
};
const cookie = (value,seconds) => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
const publicApi = (path,method) => method==='GET' && (path==='/api/site'||/^\/api\/assets\/[a-f0-9]{48}$/.test(path)||path==='/api/comments'||path==='/api/roost/me'||/^\/api\/order-tracking\/[a-f0-9]{48}\/[a-f0-9]{48}$/.test(path)) || method==='POST' && (['/api/orders','/api/comments','/api/roost/profile','/api/roost/logout','/api/roost/options','/api/roost/verify','/api/roost/recover','/api/roost/claim-order'].includes(path)||/^\/api\/order-tracking\/[a-f0-9]{48}\/[a-f0-9]{48}\/(?:message|payment-method)$/.test(path));
export async function studioPinAccess(request,env,now=Date.now()) {
  if(env.PREVIEW_ACCESS_MODE!=='pin')return {active:false};
  const result={active:true},url=new URL(request.url),path=url.pathname;
  const unavailable=()=>({...result,response:denied('Studio access is temporarily unavailable. Your website data is unchanged.',503)});
  const until=Date.parse(env.PREVIEW_ACCESS_UNTIL||'');
  if(url.protocol!=='https:'||url.hostname!==PREVIEW_HOST||url.port||env.PREVIEW_DATABASE_ID!==PREVIEW_DATABASE||env.PUBLIC_WORKSPACE_ID!==PREVIEW_WORKSPACE||env.REVIEW_BUILD!=='true'||env.STUDIO_MANAGEMENT_ENABLED!=='true'||env.CUSTOMER_EXPERIENCE_ENABLED!=='true'||env.ORDER_EMAIL_ENABLED!=='false'||!Number.isFinite(until)||until>now+31*DAY||until<=now||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(env.PREVIEW_ACCESS_UNTIL||'')||!/^[a-f0-9]{64}$/.test(env.STUDIO_PIN_PEPPER||'')) return unavailable();
  if(path==='/api/studio-info'&&request.method==='GET')return {...result,response:json({previewPinAccess:true,studioManagementEnabled:true,mainStudioPath:'/studio'})};
  // Only enumerated customer routes are public. Every other API fails closed.
  if(!path.startsWith('/api/'))return result;
  if(publicApi(path,request.method))return result;
  try {
    const db=env.DB,first=(sql,...args)=>db.prepare(sql).bind(...args).first(),run=(sql,...args)=>db.prepare(sql).bind(...args).run();
    const settings=await first("SELECT * FROM studio_pin_settings WHERE id='main'");
    if(!settings)return unavailable();
    const raw=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    const sessionHash=/^[a-f0-9]{64}$/.test(raw||'')?await pinDigest(raw):'';
    const session=sessionHash&&await first('SELECT hash,version,expires FROM studio_pin_sessions WHERE hash=? AND version=? AND expires>?',sessionHash,settings.version,now);
    let grant;
    if(session&&settings.pin_hash)grant=previewOwnerGrant({id:'preview-device:'+sessionHash.slice(0,16),name:'Owner · testing PIN',authentication:'preview_pin'},Math.min(session.expires,until));
    if(path==='/api/studio-pin/status'&&request.method==='GET')return {...result,response:json({configured:!!settings.pin_hash,authenticated:!!grant,sessionDays:30})};
    const pinEndpoint=['/api/studio-pin/unlock','/api/studio-pin/setup','/api/studio-pin/lock'].includes(path);
    if(pinEndpoint){
      if(request.method!=='POST')return {...result,response:denied('Use the Studio form.',405,{Allow:'POST'})};
      if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return {...result,response:denied('Reopen Studio before trying again.',403)};
      if(Number(request.headers.get('Content-Length')||0)>1024)return {...result,response:denied('Use the Studio form.',413)};
      const text=await request.text();if(text.length>1024)return {...result,response:denied('Use the Studio form.',413)};
      let input;try{input=JSON.parse(text);}catch{return {...result,response:denied('Use the Studio form.',400)};}
      if(!input||typeof input!=='object'||Array.isArray(input))return {...result,response:denied('Use the Studio form.',400)};
      if(path.endsWith('/lock')){
        if(!grant)return {...result,response:denied()};
        await run('DELETE FROM studio_pin_sessions WHERE hash=?',sessionHash);
        return {...result,response:json({locked:true},200,{'Set-Cookie':cookie('',0)})};
      }
      // HMAC buckets do not store IP addresses. No address is ever allowlisted.
      const network=await hmac(env.STUDIO_PIN_PEPPER,'limit:'+path+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
      const limited=await run('INSERT INTO studio_pin_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END WHERE expires<=? OR count<20',network,now+900000,now,now,now+900000,now);
      if(limited.meta.changes!==1){const limit=await first('SELECT expires FROM studio_pin_limits WHERE key=?',network);return {...result,response:denied('Too many attempts. Please try again later.',429,{'Retry-After':String(Math.max(1,Math.ceil((limit.expires-now)/1000)))})};}
      if(typeof input.pin!=='string'||!/^\d{4}$/.test(input.pin))return {...result,response:denied('Enter a 4-digit PIN.',400)};
      const token=pinToken(),tokenHash=await pinDigest(token),expires=Math.min(now+30*DAY,until);
      if(path.endsWith('/setup')){
        if(input.pin!==input.confirmPin)return {...result,response:denied('The PINs must match.',400)};
        const setupHash=typeof input.setupToken==='string'&&/^[a-f0-9]{64}$/.test(input.setupToken)?await pinDigest(input.setupToken):'';
        if(!settings.bootstrap_hash||!equal(setupHash,settings.bootstrap_hash)||settings.bootstrap_expires<=now)return {...result,response:denied('This private setup link is invalid, expired, or already used.',403)};
        const salt=pinToken(),hash=await pinHash(input.pin,salt,env.STUDIO_PIN_PEPPER),claim=pinToken();
        const changes=await db.batch([
          db.prepare("UPDATE studio_pin_settings SET pin_hash=?,salt=?,version=version+1,failures=0,locked_until=0,bootstrap_hash=NULL,bootstrap_expires=NULL,setup_claim=? WHERE id='main' AND version=? AND bootstrap_hash=? AND bootstrap_expires>?").bind(hash,salt,claim,settings.version,setupHash,now),
          db.prepare("DELETE FROM studio_pin_sessions WHERE version<>(SELECT version FROM studio_pin_settings WHERE id='main')").bind(),
          db.prepare("INSERT INTO studio_pin_sessions(hash,version,expires,created_at) SELECT ?,version,?,? FROM studio_pin_settings WHERE id='main' AND setup_claim=?").bind(tokenHash,expires,now,claim),
        ]);
        if(changes[0].meta.changes!==1||changes[2].meta.changes!==1)return {...result,response:denied('This setup link has already been used. Open Studio with your PIN.',409)};
      }else{
        if(!settings.pin_hash)return {...result,response:denied('The testing PIN needs its private one-time setup first.',503)};
        // Reserve every guess atomically BEFORE expensive verification. Parallel
        // guesses and rotating networks cannot bypass the global lockout.
        const reserved=await run("UPDATE studio_pin_settings SET failures=failures+1,locked_until=CASE WHEN failures+1>=15 THEN ? WHEN failures+1>=10 THEN ? WHEN failures+1>=5 THEN ? ELSE 0 END WHERE id='main' AND version=? AND locked_until<=?",now+DAY,now+3600000,now+900000,settings.version,now);
        if(reserved.meta.changes!==1){const state=await first("SELECT locked_until FROM studio_pin_settings WHERE id='main'");return {...result,response:denied('Studio is temporarily locked after unsuccessful attempts. Please try again later.',429,{'Retry-After':String(Math.max(1,Math.ceil((state.locked_until-now)/1000)))})};}
        if(!equal(await pinHash(input.pin,settings.salt,env.STUDIO_PIN_PEPPER),settings.pin_hash)){
          const state=await first("SELECT locked_until FROM studio_pin_settings WHERE id='main'");const retry=Math.max(1,Math.ceil((state.locked_until-now)/1000));
          return {...result,response:denied(state.locked_until>now?'Studio is temporarily locked after unsuccessful attempts. Please try again later.':'That PIN did not match. Please try again.',state.locked_until>now?429:401,state.locked_until>now?{'Retry-After':String(retry)}:{})};
        }
        const changes=await db.batch([
          db.prepare("UPDATE studio_pin_settings SET failures=0,locked_until=0 WHERE id='main' AND version=? AND pin_hash=?").bind(settings.version,settings.pin_hash),
          db.prepare("INSERT INTO studio_pin_sessions(hash,version,expires,created_at) SELECT ?,version,?,? FROM studio_pin_settings WHERE id='main' AND version=? AND pin_hash=?").bind(tokenHash,expires,now,settings.version,settings.pin_hash),
        ]);
        if(changes[1].meta.changes!==1)return {...result,response:denied('The testing PIN changed. Try the current PIN.',409)};
      }
      return {...result,response:json({unlocked:true},200,{'Set-Cookie':cookie(token,Math.max(1,Math.floor((expires-now)/1000)))})};
    }
    if(!grant)return {...result,response:denied()};
    return {...result,grant};
  }catch{return unavailable();}
}
