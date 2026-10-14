const READS = new Set(['catalog','admin_load','member_account','member_lookup_phone','member_lookup','pickup_lookup']);
const ACTIONS = new Set([...READS,'admin_patch','admin_import','admin_void','admin_reward','admin_return','checkout','member_signup','member_profile','roost_return','carton_return','reward_redeem','pickup_complete','comment_submit']);
const MEMBER_ACTIONS = new Set(['member_account','member_profile','roost_return','carton_return','reward_redeem']);
const encoder=new TextEncoder();
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function createHandler({rpc,getUser,secret,origins,now=()=>Date.now(),logger=console}) {
  const signingKey=crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  async function issueMember(id) {
    const body=encode(encoder.encode(JSON.stringify({sub:id,exp:Math.floor(now()/1000)+7200})));
    return body+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey,encoder.encode(body))));
  }
  async function verifyMember(token) {
    try {
      const [body,signature,extra]=String(token||'').split('.');
      if(extra||!body||!signature||!await crypto.subtle.verify('HMAC',await signingKey,decode(signature),encoder.encode(body))) return null;
      const payload=JSON.parse(new TextDecoder().decode(decode(body)));
      return payload.exp>Math.floor(now()/1000) && typeof payload.sub==='string' ? payload.sub : null;
    } catch {return null;}
  }
  return async function handle(req) {
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin && origins.includes(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-rr-client','Access-Control-Allow-Methods':'POST,OPTIONS'});
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin && !origins.includes(origin)) return json({error:'Origin not allowed'},403);
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if(req.method!=='POST') return json({error:'Method not allowed'},405);
    try {
      const raw=await req.text();
      if(raw.length>4_000_000) return json({error:'Request too large'},413);
      let body; try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
      const action=body?.action;
      if(!ACTIONS.has(action)) return json({error:'Unknown action'},400);
      let actor=null;
      if(action.startsWith('admin_')) {
        const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
        if(!bearer) return json({error:'Administrator sign-in required'},401);
        actor=await getUser(bearer);
        if(!actor) return json({error:'Administrator session expired'},401);
      }
      const member=await verifyMember(body.memberToken);
      if(MEMBER_ACTIONS.has(action) && !member) return json({error:'Member session expired. Sign in to The Roost again.'},401);
      if(action==='checkout' && (body.useCredits || body.customerId) && !member) return json({error:'Member sign-in required'},401);
      const payload={...body}; delete payload.action; delete payload.memberToken; delete payload.customerId;
      if(!READS.has(action) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId||'')) return json({error:'Valid request ID required'},400);
      const out=await rpc(action,payload,actor,member);
      if(['member_lookup_phone','member_lookup'].includes(action)) out.memberToken=await issueMember(out.member.id);
      if(action==='member_signup') {
        const id=out.result.id;
        Object.assign(out,await rpc('member_account',{},null,id));
        out.memberToken=await issueMember(id);
      }
      if(['member_profile','roost_return','carton_return','reward_redeem'].includes(action)) Object.assign(out,await rpc('member_account',{},null,member));
      if(['checkout','pickup_complete','reward_redeem'].includes(action)) out.catalog=await rpc('catalog',{},null,null);
      return json(out);
    } catch(error) {
      const message=String(error?.message||'');
      if(message.includes('UNAUTHORIZED:')) return json({error:'Access denied'},403);
      if(message.includes('DATA_CONFLICT:')) return json({error:'This record changed on another device. Review the latest data and repeat your edit.',conflict:true},409);
      if(error?.code==='42501') return json({error:'Access denied'},403);
      if(error?.code && !['ECONNREFUSED','08006','08001'].includes(error.code)) return json({error:message || 'The request could not be saved'},409);
      logger.error('Rise & Roost request failed',error?.code||'upstream');
      return json({error:'Cloud service unavailable. Your operation has not been confirmed. Retry with the same request.'},503);
    }
  };
}
