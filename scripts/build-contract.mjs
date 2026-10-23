import fs from 'node:fs';
// Generate the repetitive mapping layer; the transaction logic is reviewed SQL.
const specs={
 brands:['brands',{id:'id',name:'name',active:'active',createdAt:'created_at',updatedAt:'updated_at'}],
 items:['items',{id:'id',brandId:'brand_id',name:'name',price:'price',stock:'stock',lowStock:'low_stock',active:'active',createdAt:'created_at',updatedAt:'updated_at'}],
 customers:['customers',{id:'id',name:'name',phone:'phone',email:'email',cartonCredits:'carton_credits',totalCartons:'total_cartons',freeDozens:'free_dozens',pickupAlerts:'pickup_alerts',storeUpdates:'store_updates',createdAt:'created_at',updatedAt:'updated_at'}],
 pickups:['pickups',{id:'id',code:'code',customerName:'customer_name',phone:'phone',note:'note',status:'status',paid:'paid',created:'created_at',completed:'completed_at',updatedAt:'updated_at'}],
 sales:['sales',{id:'id',date:'sold_at',total:'total',payment:'payment',source:'source',pickupId:'pickup_id',voided:'voided',voidedAt:'voided_at'}],
 stockLog:['stock_log',{id:'id',date:'created_at',itemId:'item_id',itemName:'item_name',brandName:'brand_name',delta:'delta',stockAfter:'stock_after',reason:'reason'}],
 cartonReturns:['carton_returns',{id:'id',date:'created_at',customerId:'customer_id',customerName:'customer_name',qty:'qty'}],
 cartonRewards:['carton_rewards',{id:'id',date:'created_at',customerId:'customer_id',customerName:'customer_name',itemId:'item_id',itemName:'item_name',creditsUsed:'credits_used'}],
 roostReturns:['roost_returns',{id:'id',date:'created_at',customerId:'customer_id',customerName:'customer_name',typeId:'type_id',typeName:'type_name',qty:'qty',credits:'credits_earned'}],
 roostCreditUses:['roost_credit_uses',{id:'id',date:'created_at',customerId:'customer_id',customerName:'customer_name',saleId:'sale_id',creditsUsed:'credits_used',creditValue:'credit_value',discountAmount:'discount_amount'}],
 comments:['customer_comments',{id:'id',date:'created_at',name:'customer_name',text:'comment_text'}]
};
const quote=s=>"'"+s.replaceAll("'","''")+"'";
let sql=`-- Additive migration for the EXISTING RiseAndRoost schema. No store records are seeded, truncated or replaced.
create schema if not exists private;
create table private.rr_requests (
 request_id uuid primary key, scope text not null, action text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table private.rr_requests enable row level security;
create table private.rr_documents (
 collection text not null, id text not null, value jsonb not null, rr_version bigint not null default 0,
 primary key (collection,id)
);
alter table private.rr_documents enable row level security;
revoke all on private.rr_requests, private.rr_documents from public,anon,authenticated;
create function private.rr_version() returns trigger language plpgsql set search_path='' as $$
begin new.rr_version=old.rr_version+1; return new; end $$;
create function private.rr_lock() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(7142026,1); return null; end $$;
create function private.rr_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('rise_roost.suppress_revision',true)='on' then return null; end if;
 if tg_table_name='settings' and coalesce(to_jsonb(new)->>'key',to_jsonb(old)->>'key')='data_revision' then return null; end if;
 perform private.bump_data_revision(); return null;
end $$;
`;
const tables=[...new Set(Object.values(specs).map(x=>x[0])), 'settings','payment_methods','sale_items','pickup_items','pickup_appointments'];
for (const table of tables) {
 sql+=`alter table public.${table} add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.${table} for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.${table} for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.${table} for each ${table==='settings'?'row':'statement'} execute function private.rr_changed();
`;
}
sql+=`create trigger rr_version before update on private.rr_documents for each row execute function private.rr_version();
create trigger rr_changed after insert or update or delete on private.rr_documents for each statement execute function private.rr_changed();
create function private.rr_spec(p_collection text) returns jsonb language sql immutable set search_path='' as $$
select case p_collection\n`;
for (const [collection,[table,map]] of Object.entries(specs)) sql+=`when ${quote(collection)} then ${quote(JSON.stringify({table,map}))}::jsonb\n`;
sql+=`else null end $$;
create function private.rr_document(p_collection text, p_row jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=coalesce(p_row->'rr_extra','{}'); k text; v text; children jsonb;
begin
 for k,v in select * from jsonb_each_text(private.rr_spec(p_collection)->'map') loop
  result:=result||jsonb_build_object(k,p_row->v);
 end loop;
 if p_collection='customers' then result:=result||jsonb_build_object('roostCredits',p_row->'carton_credits'); end if;
 if p_collection in ('sales','pickups') then
  if p_collection='sales' then
   select jsonb_agg(jsonb_build_object('itemId',item_id,'itemName',item_name,'brandId',brand_id,'brandName',brand_name,'price',price,'qty',qty) order by id) into children from public.sale_items where sale_id=p_row->>'id';
  else
   select jsonb_agg(jsonb_build_object('itemId',item_id,'itemName',item_name,'brandId',brand_id,'brandName',brand_name,'price',price,'qty',qty) order by id) into children from public.pickup_items where pickup_id=p_row->>'id';
  end if;
  result:=result||jsonb_build_object('items',coalesce(children,'[]'));
 end if;
 if p_collection='pickups' then
  select rr_extra||jsonb_build_object('scheduledAt',scheduled_at,'doorPin',door_pin,'pinTextedAt',pin_texted_at,'accessExtendedUntil',access_extended_until,'_appointmentVersion',rr_version) into children from public.pickup_appointments where pickup_id=p_row->>'id';
  result:=result||coalesce(children,'{}');
 end if;
 return result||jsonb_build_object('_version',p_row->'rr_version');
end $$;
create function private.rr_state() returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object(
 'revision',coalesce((select revision from public.store_revision_public where id=1),0),
 'data',jsonb_build_object(\n`;
for(const [collection,[table]] of Object.entries(specs)) sql+=`${quote(collection)},coalesce((select jsonb_agg(private.rr_document(${quote(collection)},to_jsonb(r)) order by ${['sales','stockLog','cartonReturns','cartonRewards','roostReturns','roostCreditUses','comments'].includes(collection)?'r.created_at desc,':''}r.id) from public.${table} r),'[]'),\n`;
sql+=`'settings',coalesce((select jsonb_object_agg(case key when 'roost_credit_settings' then 'roostCreditSettings' when 'pickup_schedule' then 'pickupSchedule' else key end,value) from public.settings where key not in ('data_revision','carton_settings','notificationSettings','roostReturnTypes')),'{}')||jsonb_build_object('paymentQrs',coalesce((select jsonb_object_agg(method,qr_data) from public.payment_methods where active and qr_data is not null),'{}')),
'cartonSettings',coalesce((select value from public.settings where key='carton_settings'),'{"cartonsPerFreeDozen":12,"rewardItemId":""}'),
'notificationSettings',coalesce((select value from public.settings where key='notificationSettings'),'{}'),
'roostReturnTypes',coalesce((select value->'returnTypes' from public.settings where key='roost_credit_settings'),'[]'),
'roostAlerts',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='roostAlerts'),'[]'),
'notificationLog',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='notificationLog'),'[]'),
'adminAudit',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='adminAudit'),'[]')
)) $$;
`;
sql+=fs.readFileSync('supabase/checkout.sql','utf8');
sql+=fs.readFileSync('supabase/appointments.sql','utf8');
sql+=fs.readFileSync('supabase/contract.sql','utf8');
sql+=fs.readFileSync('supabase/legacy-guard.sql','utf8');
sql+=`\nrevoke all on function public.rr_sync(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.rr_sync(text,jsonb,uuid,text) to service_role;
grant usage on schema private to service_role;
revoke all on function private.rr_sync(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function private.rr_sync(text,jsonb,uuid,text) to service_role;
-- Helpers cannot be invoked directly by an untrusted browser.
revoke all on function private.rr_patch(jsonb,boolean),private.rr_state(),private.rr_document(text,jsonb),private.rr_spec(text),private.rr_lock(),private.rr_version(),private.rr_changed() from public,anon,authenticated;
`;
const path=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_shared_database_sync.sql'));
fs.writeFileSync('supabase/migrations/'+path,sql);
