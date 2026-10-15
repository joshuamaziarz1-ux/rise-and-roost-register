import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createHandler } from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY')!;
const service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=(Deno.env.get('RR_ALLOWED_ORIGINS')||'https://joshuamaziarz1-ux.github.io').split(',').map(x=>x.trim());
Deno.serve(createHandler({
  secret, origins,
  getUser:async (token:string)=>{const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id || null;},
  rpc:async (action:string,payload:unknown,actor:string|null,member:string|null)=>{
    const {data,error}=await service.rpc('rr_sync',{p_action:action,p_payload:payload,p_actor:actor,p_member_id:member});
    if(error) throw error; return data;
  }
}));
