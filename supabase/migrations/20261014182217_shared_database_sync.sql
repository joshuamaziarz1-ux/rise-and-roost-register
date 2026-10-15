-- Additive migration for the EXISTING RiseAndRoost schema. No store records are seeded, truncated or replaced.
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
alter table public.brands add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.brands for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.brands for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.brands for each statement execute function private.rr_changed();
alter table public.items add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.items for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.items for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.items for each statement execute function private.rr_changed();
alter table public.customers add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.customers for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.customers for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.customers for each statement execute function private.rr_changed();
alter table public.pickups add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.pickups for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.pickups for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.pickups for each statement execute function private.rr_changed();
alter table public.sales add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.sales for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.sales for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.sales for each statement execute function private.rr_changed();
alter table public.stock_log add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.stock_log for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.stock_log for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.stock_log for each statement execute function private.rr_changed();
alter table public.carton_returns add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.carton_returns for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.carton_returns for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.carton_returns for each statement execute function private.rr_changed();
alter table public.carton_rewards add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.carton_rewards for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.carton_rewards for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.carton_rewards for each statement execute function private.rr_changed();
alter table public.roost_returns add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.roost_returns for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.roost_returns for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.roost_returns for each statement execute function private.rr_changed();
alter table public.roost_credit_uses add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.roost_credit_uses for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.roost_credit_uses for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.roost_credit_uses for each statement execute function private.rr_changed();
alter table public.customer_comments add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.customer_comments for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.customer_comments for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.customer_comments for each statement execute function private.rr_changed();
alter table public.settings add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.settings for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.settings for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.settings for each row execute function private.rr_changed();
alter table public.payment_methods add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.payment_methods for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.payment_methods for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.payment_methods for each statement execute function private.rr_changed();
alter table public.sale_items add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.sale_items for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.sale_items for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.sale_items for each statement execute function private.rr_changed();
alter table public.pickup_items add column rr_extra jsonb not null default '{}'::jsonb, add column rr_version bigint not null default 0;
create trigger rr_version before update on public.pickup_items for each row execute function private.rr_version();
create trigger rr_lock before insert or update or delete on public.pickup_items for each statement execute function private.rr_lock();
create trigger rr_changed after insert or update or delete on public.pickup_items for each statement execute function private.rr_changed();
create trigger rr_version before update on private.rr_documents for each row execute function private.rr_version();
create trigger rr_changed after insert or update or delete on private.rr_documents for each statement execute function private.rr_changed();
create function private.rr_spec(p_collection text) returns jsonb language sql immutable set search_path='' as $$
select case p_collection
when 'brands' then '{"table":"brands","map":{"id":"id","name":"name","active":"active","createdAt":"created_at","updatedAt":"updated_at"}}'::jsonb
when 'items' then '{"table":"items","map":{"id":"id","brandId":"brand_id","name":"name","price":"price","stock":"stock","lowStock":"low_stock","active":"active","createdAt":"created_at","updatedAt":"updated_at"}}'::jsonb
when 'customers' then '{"table":"customers","map":{"id":"id","name":"name","phone":"phone","email":"email","cartonCredits":"carton_credits","totalCartons":"total_cartons","freeDozens":"free_dozens","pickupAlerts":"pickup_alerts","storeUpdates":"store_updates","createdAt":"created_at","updatedAt":"updated_at"}}'::jsonb
when 'pickups' then '{"table":"pickups","map":{"id":"id","code":"code","customerName":"customer_name","phone":"phone","note":"note","status":"status","paid":"paid","created":"created_at","completed":"completed_at","updatedAt":"updated_at"}}'::jsonb
when 'sales' then '{"table":"sales","map":{"id":"id","date":"sold_at","total":"total","payment":"payment","source":"source","pickupId":"pickup_id","voided":"voided","voidedAt":"voided_at"}}'::jsonb
when 'stockLog' then '{"table":"stock_log","map":{"id":"id","date":"created_at","itemId":"item_id","itemName":"item_name","brandName":"brand_name","delta":"delta","stockAfter":"stock_after","reason":"reason"}}'::jsonb
when 'cartonReturns' then '{"table":"carton_returns","map":{"id":"id","date":"created_at","customerId":"customer_id","customerName":"customer_name","qty":"qty"}}'::jsonb
when 'cartonRewards' then '{"table":"carton_rewards","map":{"id":"id","date":"created_at","customerId":"customer_id","customerName":"customer_name","itemId":"item_id","itemName":"item_name","creditsUsed":"credits_used"}}'::jsonb
when 'roostReturns' then '{"table":"roost_returns","map":{"id":"id","date":"created_at","customerId":"customer_id","customerName":"customer_name","typeId":"type_id","typeName":"type_name","qty":"qty","credits":"credits_earned"}}'::jsonb
when 'roostCreditUses' then '{"table":"roost_credit_uses","map":{"id":"id","date":"created_at","customerId":"customer_id","customerName":"customer_name","saleId":"sale_id","creditsUsed":"credits_used","creditValue":"credit_value","discountAmount":"discount_amount"}}'::jsonb
when 'comments' then '{"table":"customer_comments","map":{"id":"id","date":"created_at","name":"customer_name","text":"comment_text"}}'::jsonb
else null end $$;
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
 return result||jsonb_build_object('_version',p_row->'rr_version');
end $$;
create function private.rr_state() returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object(
 'revision',coalesce((select revision from public.store_revision_public where id=1),0),
 'data',jsonb_build_object(
'brands',coalesce((select jsonb_agg(private.rr_document('brands',to_jsonb(r)) order by r.id) from public.brands r),'[]'),
'items',coalesce((select jsonb_agg(private.rr_document('items',to_jsonb(r)) order by r.id) from public.items r),'[]'),
'customers',coalesce((select jsonb_agg(private.rr_document('customers',to_jsonb(r)) order by r.id) from public.customers r),'[]'),
'pickups',coalesce((select jsonb_agg(private.rr_document('pickups',to_jsonb(r)) order by r.id) from public.pickups r),'[]'),
'sales',coalesce((select jsonb_agg(private.rr_document('sales',to_jsonb(r)) order by r.created_at desc,r.id) from public.sales r),'[]'),
'stockLog',coalesce((select jsonb_agg(private.rr_document('stockLog',to_jsonb(r)) order by r.created_at desc,r.id) from public.stock_log r),'[]'),
'cartonReturns',coalesce((select jsonb_agg(private.rr_document('cartonReturns',to_jsonb(r)) order by r.created_at desc,r.id) from public.carton_returns r),'[]'),
'cartonRewards',coalesce((select jsonb_agg(private.rr_document('cartonRewards',to_jsonb(r)) order by r.created_at desc,r.id) from public.carton_rewards r),'[]'),
'roostReturns',coalesce((select jsonb_agg(private.rr_document('roostReturns',to_jsonb(r)) order by r.created_at desc,r.id) from public.roost_returns r),'[]'),
'roostCreditUses',coalesce((select jsonb_agg(private.rr_document('roostCreditUses',to_jsonb(r)) order by r.created_at desc,r.id) from public.roost_credit_uses r),'[]'),
'comments',coalesce((select jsonb_agg(private.rr_document('comments',to_jsonb(r)) order by r.created_at desc,r.id) from public.customer_comments r),'[]'),
'settings',coalesce((select jsonb_object_agg(case key when 'roost_credit_settings' then 'roostCreditSettings' when 'pickup_schedule' then 'pickupSchedule' else key end,value) from public.settings where key not in ('data_revision','carton_settings','notificationSettings','roostReturnTypes')),'{}')||jsonb_build_object('paymentQrs',coalesce((select jsonb_object_agg(method,qr_data) from public.payment_methods where active and qr_data is not null),'{}')),
'cartonSettings',coalesce((select value from public.settings where key='carton_settings'),'{"cartonsPerFreeDozen":12,"rewardItemId":""}'),
'notificationSettings',coalesce((select value from public.settings where key='notificationSettings'),'{}'),
'roostReturnTypes',coalesce((select value->'returnTypes' from public.settings where key='roost_credit_settings'),'[]'),
'roostAlerts',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='roostAlerts'),'[]'),
'notificationLog',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='notificationLog'),'[]'),
'adminAudit',coalesce((select jsonb_agg(value||jsonb_build_object('_version',rr_version)) from private.rr_documents where collection='adminAudit'),'[]')
)) $$;
-- Corrected copy of the existing checkout: typed optional member row and deterministic item lock order.
CREATE OR REPLACE FUNCTION private.rr_checkout(p_payment text, p_expected_total numeric, p_lines jsonb, p_customer_id text DEFAULT NULL::text, p_use_credits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec record;
  v_item record;
  v_customer public.customers%rowtype;
  v_reserved integer;
  v_gross numeric(10,2) := 0;
  v_credit_value numeric(10,2) := 0.50;
  v_allow_full boolean := true;
  v_available_credits integer := 0;
  v_credits_needed integer := 0;
  v_credits_used integer := 0;
  v_discount numeric(10,2) := 0;
  v_due numeric(10,2) := 0;
  v_sale_id text := 'sale_' || replace(gen_random_uuid()::text, '-', '');
  v_stock_after integer;
  v_revision bigint;
  v_settings jsonb;
  v_payment text;
begin
  if p_payment not in ('cash','cashapp','paypal','applepay','googlepay') then
    raise exception 'Invalid payment method';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 50 then
    raise exception 'Invalid checkout lines';
  end if;

  for rec in
    select elem->>'itemId' as item_id, sum((elem->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_lines) elem
    group by elem->>'itemId' order by elem->>'itemId'
  loop
    if rec.item_id is null or rec.qty is null or rec.qty < 1 then raise exception 'Invalid item quantity'; end if;
    select i.id,i.name,i.brand_id,i.price,i.stock,coalesce(b.name,'Unknown') brand_name
      into v_item
    from public.items i
    left join public.brands b on b.id=i.brand_id
    where i.id=rec.item_id and i.active=true and coalesce(b.active,true)=true
    for update of i;
    if not found then raise exception 'Item is no longer available'; end if;

    select coalesce(sum(pi.qty),0)::integer into v_reserved
    from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id
    where pi.item_id=rec.item_id and p.status in ('ready','waiting');

    if (v_item.stock-v_reserved)<rec.qty then raise exception 'Not enough inventory for %',v_item.name; end if;
    v_gross := v_gross + (v_item.price*rec.qty);
  end loop;

  v_gross := round(v_gross,2);
  if round(coalesce(p_expected_total,-1),2) <> v_gross then
    raise exception 'The order total changed. Please review the cart again.';
  end if;

  select value into v_settings from public.settings where key='roost_credit_settings';
  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_credit_value := greatest(0.01,coalesce((v_settings->>'creditValue')::numeric,0.50));
  v_allow_full := coalesce((v_settings->>'allowFullPurchase')::boolean,true);

  if p_use_credits and p_customer_id is not null then
    select * into v_customer from public.customers where id=p_customer_id for update;
    if found then
      v_available_credits := greatest(0,coalesce(v_customer.carton_credits,0));
      v_credits_needed := floor(v_gross / v_credit_value);
      if not v_allow_full and (v_credits_needed * v_credit_value) >= v_gross then
        v_credits_needed := greatest(0,v_credits_needed-1);
      end if;
      v_credits_used := least(v_available_credits,v_credits_needed);
      v_discount := round(v_credits_used*v_credit_value,2);
      update public.customers
      set carton_credits=carton_credits-v_credits_used,updated_at=now()
      where id=p_customer_id;
    end if;
  end if;

  v_due := greatest(0,round(v_gross-v_discount,2));
  v_payment := case when v_due=0 then 'roostcredit' else p_payment end;

  insert into public.sales(id,sold_at,total,payment,source,voided)
  values(v_sale_id,now(),v_due,v_payment,'store',false);

  for rec in
    select elem->>'itemId' as item_id, sum((elem->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_lines) elem
    group by elem->>'itemId' order by elem->>'itemId'
  loop
    select i.id,i.name,i.brand_id,i.price,coalesce(b.name,'Unknown') brand_name
      into v_item
    from public.items i left join public.brands b on b.id=i.brand_id
    where i.id=rec.item_id;

    update public.items set stock=stock-rec.qty where id=rec.item_id returning stock into v_stock_after;

    insert into public.sale_items(sale_id,item_id,item_name,brand_id,brand_name,price,qty)
    values(v_sale_id,v_item.id,v_item.name,v_item.brand_id,v_item.brand_name,v_item.price,rec.qty);

    insert into public.stock_log(item_id,item_name,brand_name,delta,stock_after,reason)
    values(v_item.id,v_item.name,v_item.brand_name,-rec.qty,v_stock_after,'Customer sale - '||v_payment);
  end loop;

  if v_credits_used>0 then
    insert into public.roost_credit_uses(customer_id,customer_name,sale_id,credits_used,credit_value,discount_amount)
    values(v_customer.id,v_customer.name,v_sale_id,v_credits_used,v_credit_value,v_discount);
  end if;

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'saleId',v_sale_id,
    'grossTotal',v_gross,
    'total',v_due,
    'payment',v_payment,
    'creditsUsed',v_credits_used,
    'creditValue',v_credit_value,
    'creditDiscount',v_discount,
    'creditsRemaining',case when v_customer.id is null then null else greatest(0,v_available_credits-v_credits_used) end,
    'revision',v_revision
  );
end;
$function$
;
revoke all on function private.rr_checkout(text,numeric,jsonb,text,boolean) from public,anon,authenticated;
-- Only the authenticated Edge Function service role can call this contract.
-- Row versions guard every admin mutation. The global transaction lock orders
-- checkout, returns, reservations and admin writes consistently for this store.
create function private.rr_patch(p_change jsonb,p_import boolean default false) returns void
language plpgsql security definer set search_path='' as $$
<<rr_patch>>
declare
 c text:=p_change->>'collection'; id text:=p_change->>'id';
 before_doc jsonb:=nullif(p_change->'before','null'); after_doc jsonb:=nullif(p_change->'after','null');
 spec jsonb:=private.rr_spec(c); tbl text; current_doc jsonb; row_data jsonb:='{}';
 k text; v text; cols text; vals text; sets text; child jsonb; setting_key text;
begin
 if id is null or length(id)>200 or c is null then raise exception 'Invalid change'; end if;
 if after_doc is not null and after_doc->>'id' is distinct from id then raise exception 'Record identity cannot change'; end if;
 if c in ('settings','payments') then
  if c='payments' then
   if id not in ('cash','cashapp','paypal','applepay','googlepay') then raise exception 'Invalid payment method'; end if;
   select jsonb_build_object('id',method,'qr',qr_data) into current_doc from public.payment_methods where method=id and active and qr_data is not null for update;
   if p_import and current_doc is not null then return; end if;
   if current_doc is distinct from before_doc then raise exception 'DATA_CONFLICT: payment changed'; end if;
   insert into public.payment_methods(method,display_name,qr_data,active) values(id,id,after_doc->>'qr',true)
   on conflict(method) do update set qr_data=excluded.qr_data;
  else
   setting_key:=case id when 'cartonSettings' then 'carton_settings' when 'roostCreditSettings' then 'roost_credit_settings' when 'pickupSchedule' then 'pickup_schedule' else id end;
   if setting_key='data_revision' or length(setting_key)>100 then raise exception 'Unsupported setting'; end if;
   select jsonb_build_object('id',id,'value',value) into current_doc from public.settings where key=setting_key for update;
   if setting_key='roostReturnTypes' then select jsonb_build_object('id',id,'value',value->'returnTypes') into current_doc from public.settings where key='roost_credit_settings' for update; end if;
   if p_import and current_doc is not null then return; end if;
   if current_doc is null and before_doc->'value' in ('{}'::jsonb,'[]'::jsonb) then current_doc:=before_doc; end if;
   if current_doc is distinct from before_doc then raise exception 'DATA_CONFLICT: setting changed'; end if;
   if after_doc is null then raise exception 'Settings cannot be deleted'; end if;
   if setting_key='roost_credit_settings' and (coalesce((after_doc->'value'->>'creditValue')::numeric,0)<=0 or jsonb_typeof(after_doc->'value'->'returnTypes')<>'array') then raise exception 'Invalid credit settings'; end if;
   if setting_key='roostReturnTypes' then
    -- Return types are the same shared setting used by checkout and returns.
    update public.settings set value=jsonb_set(value,'{returnTypes}',after_doc->'value') where key='roost_credit_settings';
   else
    insert into public.settings(key,value) values(setting_key,after_doc->'value') on conflict(key) do update set value=excluded.value;
   end if;
  end if;
  return;
 end if;
 if spec is null then
  if c not in ('roostAlerts','notificationLog','adminAudit') then raise exception 'Unsupported collection'; end if;
  select value||jsonb_build_object('_version',rr_version) into current_doc from private.rr_documents where collection=c and rr_documents.id=rr_patch.id for update;
  if p_import and current_doc is not null then return; end if;
  if current_doc is not null and (before_doc is null or (current_doc->>'_version')::bigint is distinct from (before_doc->>'_version')::bigint) then raise exception 'DATA_CONFLICT: record changed'; end if;
  if current_doc is null and before_doc is not null then raise exception 'DATA_CONFLICT: record removed'; end if;
  if after_doc is null then return; end if; -- History trimming in old UI never deletes cloud history.
  insert into private.rr_documents(collection,id,value) values(c,id,after_doc-'_version') on conflict on constraint rr_documents_pkey do update set value=excluded.value;
  return;
 end if;
 tbl:=spec->>'table';
 execute format('select private.rr_document($1,to_jsonb(r)) from public.%I r where id=$2 for update',tbl) into current_doc using c,id;
 if p_import and current_doc is not null then return; end if;
 if current_doc is not null and (before_doc is null or (current_doc->>'_version')::bigint is distinct from (before_doc->>'_version')::bigint) then raise exception 'DATA_CONFLICT: % changed',c; end if;
 if current_doc is null and before_doc is not null then raise exception 'DATA_CONFLICT: % removed',c; end if;
 if after_doc is null then
  if c not in ('brands','items','customers','comments') then return; end if;
  if c='items' and exists(select 1 from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=rr_patch.id and p.status in ('ready','waiting')) then raise exception 'Item is reserved'; end if;
  execute format('delete from public.%I where id=$1',tbl) using id;
  return;
 end if;
 if c='sales' and not p_import then raise exception 'Sales are immutable; use checkout or void'; end if;
 if c='pickups' and after_doc->>'status'='picked' and not p_import then raise exception 'Use pickup completion'; end if;
 if c='items' and (after_doc->>'stock')::integer < coalesce((select sum(pi.qty) from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=rr_patch.id and p.status in ('ready','waiting')),0) then raise exception 'Inventory is reserved for pickup'; end if;
 for k,v in select * from jsonb_each_text(spec->'map') loop
  if after_doc ? k then row_data:=row_data||jsonb_build_object(v,after_doc->k); end if;
 end loop;
 row_data:=row_data||jsonb_build_object('rr_extra',after_doc - array(select jsonb_object_keys(spec->'map')) - array['_version','items','roostCredits']);
 select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',tbl,key),','),string_agg(format('%I=excluded.%I',key,key),',') into cols,vals,sets from jsonb_object_keys(row_data) key;
 execute format('insert into public.%I(%s) select %s on conflict(id) do update set %s',tbl,cols,vals,sets) using row_data;
 if c='sales' and p_import then
  for child in select * from jsonb_array_elements(coalesce(after_doc->'items','[]')) loop
   insert into public.sale_items(sale_id,item_id,item_name,brand_id,brand_name,price,qty) values(rr_patch.id,(select i.id from public.items i where i.id=child->>'itemId'),child->>'itemName',child->>'brandId',child->>'brandName',(child->>'price')::numeric,(child->>'qty')::integer);
  end loop;
 end if;
 if c='pickups' then
  if jsonb_typeof(after_doc->'items')<>'array' or jsonb_array_length(after_doc->'items')=0 then raise exception 'Pickup needs items'; end if;
  -- Targeted line replacement in the same transaction. Other orders are untouched.
  delete from public.pickup_items where pickup_id=rr_patch.id;
  for child in select * from jsonb_array_elements(after_doc->'items') loop
   if (child->>'qty')::numeric<>trunc((child->>'qty')::numeric) or (child->>'qty')::integer<1 then raise exception 'Invalid quantity'; end if;
   insert into public.pickup_items(pickup_id,item_id,item_name,brand_id,brand_name,price,qty)
   select rr_patch.id,i.id,i.name,i.brand_id,b.name,i.price,(child->>'qty')::integer from public.items i left join public.brands b on b.id=i.brand_id where i.id=child->>'itemId';
   if not found then raise exception 'Item missing'; end if;
  end loop;
  if exists(select 1 from public.items i where i.stock < (select coalesce(sum(pi.qty),0) from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=i.id and p.status in ('ready','waiting'))) then raise exception 'Insufficient inventory for pickup reservation'; end if;
 end if;
end $$;

create function private.rr_sync(p_action text,p_payload jsonb,p_actor uuid,p_member_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
<<rr_sync>>
declare
 state jsonb; d jsonb; result jsonb; change jsonb; row_doc jsonb; m public.customers; s public.sales;
 request_id uuid; scope text; saved private.rr_requests; line jsonb; n integer; cfg jsonb; row_type jsonb;
 member_phone text; q record; gross numeric:=0; discount numeric:=0; qty integer; reward_id text; reward_sale_id text; product public.items;
begin
 perform pg_advisory_xact_lock(7142026,1);
 if p_action like 'admin_%' and (p_actor is null or not exists(select 1 from public.admins where user_id=p_actor)) then raise exception 'UNAUTHORIZED: Admin required'; end if;
 if p_action in ('admin_reward','admin_return') then p_member_id:=p_payload->>'id'; end if;
 if p_member_id is not null then
  select * into m from public.customers where id=p_member_id for update;
  if not found then raise exception 'UNAUTHORIZED: Member no longer exists'; end if;
 end if;
 if p_action in ('catalog','admin_load','member_account','member_lookup_phone','member_lookup','pickup_lookup') then
  state:=private.rr_state(); d:=state->'data';
  if p_action='admin_load' then return state; end if;
  if p_action='catalog' then
   return jsonb_build_object('revision',state->'revision','brands',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'brands') x where (x->>'active')::boolean),'[]'),
    'items',coalesce((select jsonb_agg(x||jsonb_build_object('stock',greatest(0,(x->>'stock')::integer-coalesce((select sum(pi.qty) from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=x->>'id' and p.status in ('ready','waiting')),0)))) from jsonb_array_elements(d->'items') x where (x->>'active')::boolean and exists(select 1 from public.brands b where b.id=x->>'brandId' and b.active)),'[]'),
    'paymentQrs',d->'settings'->'paymentQrs','cartonSettings',d->'cartonSettings','roostCreditSettings',d->'settings'->'roostCreditSettings');
  end if;
  if p_action='pickup_lookup' then
   select x into row_doc from jsonb_array_elements(d->'pickups') x where upper(x->>'code')=upper(p_payload->>'code') and x->>'status'='ready';
   if row_doc is null then raise exception 'Pickup not found'; end if;
   return jsonb_build_object('pickup',row_doc - array['phone','doorPin','pinTextedAt','accessExtendedUntil']);
  end if;
  if p_action in ('member_lookup_phone','member_lookup') then
   if p_action='member_lookup_phone' then
    member_phone:=regexp_replace(coalesce(p_payload->>'phone',''),'[^0-9]','','g');
    if length(member_phone)=11 and left(member_phone,1)='1' then member_phone:=substr(member_phone,2); end if;
    if length(member_phone)<>10 then raise exception 'Enter a 10-digit phone number'; end if;
    select count(*) into n from public.customers where right(regexp_replace(phone,'[^0-9]','','g'),10)=member_phone;
    if n<>1 then raise exception 'Member not found or phone is duplicated; ask an administrator'; end if;
    select * into m from public.customers where right(regexp_replace(phone,'[^0-9]','','g'),10)=member_phone;
   else
    select count(*) into n from public.customers where lower(trim(name))=lower(trim(p_payload->>'name')) and length(regexp_replace(phone,'[^0-9]','','g'))>=4 and right(regexp_replace(phone,'[^0-9]','','g'),4)=p_payload->>'last4';
    if n<>1 then raise exception 'Member verification failed'; end if;
    select * into m from public.customers where lower(trim(name))=lower(trim(p_payload->>'name')) and right(regexp_replace(phone,'[^0-9]','','g'),4)=p_payload->>'last4';
   end if;
  elsif p_member_id is null then raise exception 'UNAUTHORIZED: Member required'; end if;
  row_doc:=private.rr_document('customers',to_jsonb(m));
  cfg:=d->'cartonSettings';
  row_doc:=row_doc||jsonb_build_object('threshold',coalesce(cfg->'cartonsPerFreeDozen','12'), 'reward',(select jsonb_build_object('itemId',i.id,'itemName',i.name,'available',greatest(0,i.stock-coalesce((select sum(pi.qty) from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=i.id and p.status in ('ready','waiting')),0))) from public.items i where i.id=cfg->>'rewardItemId' and i.active));
  return jsonb_build_object('member',row_doc,'revision',state->'revision','sales',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'sales') x where x->>'customerId'=m.id),'[]'),'roostReturns',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'roostReturns') x where x->>'customerId'=m.id),'[]'),'cartonReturns',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'cartonReturns') x where x->>'customerId'=m.id),'[]'),'cartonRewards',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'cartonRewards') x where x->>'customerId'=m.id),'[]'),'pickups',coalesce((select jsonb_agg(x-array['doorPin','pinTextedAt','accessExtendedUntil']) from jsonb_array_elements(d->'pickups') x where x->>'customerId'=m.id),'[]'));
 end if;
 request_id:=(p_payload->>'requestId')::uuid;
 if request_id is null then raise exception 'Request ID required'; end if;
 scope:=coalesce(p_actor::text,p_member_id,'guest');
 select * into saved from private.rr_requests where rr_requests.request_id=rr_sync.request_id;
 if found then
  if saved.scope<>scope or saved.action<>p_action or saved.payload<>p_payload then raise exception 'Request ID already used for a different operation'; end if;
  return saved.result;
 end if;
 perform set_config('rise_roost.suppress_revision','on',true);
 if p_action='admin_patch' then
  if jsonb_typeof(p_payload->'changes')<>'array' or jsonb_array_length(p_payload->'changes')>500 then raise exception 'Invalid changes'; end if;
  for change in select * from jsonb_array_elements(p_payload->'changes') loop perform private.rr_patch(change,false); end loop;
  result:=jsonb_build_object('saved',true);
 elsif p_action='admin_import' then
  if jsonb_typeof(p_payload->'records')<>'array' or jsonb_array_length(p_payload->'records')>10000 then raise exception 'Invalid backup records'; end if;
  for change in select * from jsonb_array_elements(p_payload->'records') loop
   perform private.rr_patch(jsonb_build_object('collection',change->'collection','id',change->'id','before',null,'after',change->'value'),true);
  end loop;
  result:=jsonb_build_object('saved',true);
 elsif p_action='checkout' then
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 50 then raise exception 'Invalid checkout lines'; end if;
  for line in select * from jsonb_array_elements(p_payload->'lines') loop
   if coalesce((line->>'qty')::numeric,0) not between 1 and 1000 or (line->>'qty')::numeric<>trunc((line->>'qty')::numeric) then raise exception 'Invalid quantity'; end if;
  end loop;
  if coalesce((p_payload->>'useCredits')::boolean,false) and m.id is null then raise exception 'UNAUTHORIZED: Member required for credits'; end if;
  result:=private.rr_checkout(p_payload->>'payment',(p_payload->>'expectedTotal')::numeric,p_payload->'lines',m.id,coalesce((p_payload->>'useCredits')::boolean,false));
  if p_payload ? 'expectedDue' and round((p_payload->>'expectedDue')::numeric,2) is distinct from (result->>'total')::numeric then raise exception 'Credit balance or price changed. Review payment again.'; end if;
  if m.id is not null then update public.sales set rr_extra=rr_extra||jsonb_build_object('customerId',m.id,'customerName',m.name,'customerType','roost-member') where id=result->>'saleId'; end if;
 elsif p_action='member_signup' then
  result:=public.rr_join_roost(p_payload->>'name',p_payload->>'phone',coalesce(p_payload->>'email',''),coalesce((p_payload->>'pickupAlerts')::boolean,false),coalesce((p_payload->>'storeUpdates')::boolean,false));
 elsif p_action='member_profile' then
  if m.id is null then raise exception 'UNAUTHORIZED: Member required'; end if;
  if m.rr_version is distinct from (p_payload->>'version')::bigint then raise exception 'DATA_CONFLICT: Member changed'; end if;
  member_phone:=right(regexp_replace(p_payload->>'phone','[^0-9]','','g'),10);
  if length(trim(p_payload->>'name'))<1 or length(member_phone)<>10 then raise exception 'Invalid name or phone'; end if;
  if exists(select 1 from public.customers where id<>m.id and right(regexp_replace(phone,'[^0-9]','','g'),10)=member_phone) then raise exception 'Phone already used'; end if;
  update public.customers set name=trim(p_payload->>'name'),phone=member_phone where id=m.id returning * into m;
  result:=jsonb_build_object('member',private.rr_document('customers',to_jsonb(m)));
 elsif p_action in ('roost_return','carton_return','reward_redeem','admin_reward','admin_return') then
  if m.id is null then raise exception 'UNAUTHORIZED: Member required'; end if;
  if p_action in ('reward_redeem','admin_reward') then
   select value into cfg from public.settings where key='carton_settings';
   qty:=greatest(1,coalesce((cfg->>'cartonsPerFreeDozen')::integer,12));
   if m.carton_credits<qty then raise exception 'Not enough carton credits'; end if;
   select i.* into product from public.items i join public.brands b on b.id=i.brand_id where i.id=cfg->>'rewardItemId' and i.active and b.active for update of i;
   if not found then raise exception 'Reward item is unavailable'; end if;
   if product.stock-coalesce((select sum(pi.qty) from public.pickup_items pi join public.pickups p on p.id=pi.pickup_id where pi.item_id=product.id and p.status in ('ready','waiting')),0)<1 then raise exception 'Reward item is sold out'; end if;
   update public.customers set carton_credits=carton_credits-qty,free_dozens=free_dozens+1 where id=m.id;
   update public.items set stock=stock-1 where id=product.id returning * into product;
   insert into public.carton_rewards(customer_id,customer_name,item_id,item_name,credits_used) values(m.id,m.name,product.id,product.name,qty) returning id into reward_id;
   insert into public.sales(total,payment,source,rr_extra) values(0,'reward','carton-club',jsonb_build_object('customerId',m.id,'customerName',m.name,'customerType','roost-member','rewardCreditsUsed',qty,'rewardId',reward_id)) returning id into reward_sale_id;
   insert into public.sale_items(sale_id,item_id,item_name,brand_id,brand_name,price,qty) select rr_sync.reward_sale_id,product.id,product.name,product.brand_id,b.name,0,1 from public.brands b where b.id=product.brand_id;
   insert into public.stock_log(item_id,item_name,delta,stock_after,reason) values(product.id,product.name,-1,product.stock,'Free dozen reward');
   result:=jsonb_build_object('saleId',reward_sale_id,'creditsUsed',qty);
  elsif p_action in ('carton_return','admin_return') then
   result:=public.rr_return_cartons(m.id,m.name,right(regexp_replace(m.phone,'[^0-9]','','g'),4),(p_payload->>'qty')::integer);
  else
   if jsonb_typeof(p_payload->'returns')<>'array' or jsonb_array_length(p_payload->'returns') not between 1 and 30 then raise exception 'Invalid returns'; end if;
   for line in select * from jsonb_array_elements(p_payload->'returns') loop
    if (line->>'qty')::numeric<>trunc((line->>'qty')::numeric) or (line->>'qty')::integer not between 1 and 1000 then raise exception 'Invalid return quantity'; end if;
    result:=public.rr_roost_return(m.id,m.phone,line->>'typeId',(line->>'qty')::integer);
   end loop;
  end if;
 elsif p_action='pickup_complete' then
  result:=public.rr_complete_pickup(p_payload->>'code');
 elsif p_action='admin_void' then
  select * into s from public.sales where id=p_payload->>'id' for update;
  if not found then raise exception 'Sale not found'; end if;
  if not s.voided then
   for q in select * from public.sale_items where sale_id=s.id order by item_id loop
    update public.items set stock=stock+q.qty where id=q.item_id;
    insert into public.stock_log(item_id,item_name,brand_name,delta,stock_after,reason) select id,name,q.brand_name,q.qty,stock,'Voided sale '||s.id from public.items where id=q.item_id;
   end loop;
   for q in select * from public.roost_credit_uses where sale_id=s.id loop update public.customers set carton_credits=carton_credits+q.credits_used where id=q.customer_id; end loop;
   if coalesce((s.rr_extra->>'rewardCreditsUsed')::integer,0)>0 then
    update public.customers set carton_credits=carton_credits+(s.rr_extra->>'rewardCreditsUsed')::integer,free_dozens=greatest(0,free_dozens-1) where id=s.rr_extra->>'customerId';
    update public.carton_rewards set rr_extra=rr_extra||'{"voided":true}'::jsonb where id=s.rr_extra->>'rewardId';
   end if;
   update public.sales set voided=true,voided_at=now() where id=s.id;
   if s.pickup_id is not null then update public.pickups set status='ready',completed_at=null where id=s.pickup_id; end if;
  end if;
  result:=jsonb_build_object('voided',true);
 elsif p_action='comment_submit' then
  insert into public.customer_comments(customer_name,comment_text,rr_extra) values(left(p_payload->>'name',120),left(p_payload->>'text',2000),jsonb_build_object('type',case when p_payload->>'type' in ('comment','product-request','suggestion','other') then p_payload->>'type' else 'comment' end,'status','new')) returning to_jsonb(customer_comments.*) into result;
 else raise exception 'Unknown action'; end if;
 result:=jsonb_build_object('result',result,'revision',private.bump_data_revision());
 insert into private.rr_requests(request_id,scope,action,payload,result) values(request_id,scope,p_action,p_payload,result);
 return result;
end $$;

-- Public wrapper is deliberately SECURITY INVOKER. All access is service-only,
-- with the admin allowlist checked again inside the private implementation.
create function public.rr_sync(p_action text,p_payload jsonb,p_actor uuid default null,p_member_id text default null) returns jsonb
language sql security invoker set search_path='' as $$
select private.rr_sync(p_action,p_payload,p_actor,p_member_id) $$;
-- Cached Admin pages must never replace the shared database after cutover.
create or replace function public.rr_admin_replace_state(p_expected_revision bigint,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'Legacy whole-store saves are disabled. Reload the updated Admin application.'; end $$;
revoke all on function public.rr_admin_replace_state(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.rr_admin_replace_state(bigint,jsonb) to service_role;
-- All browser writes use authenticated, version-checked Edge operations.
-- Direct table writes cannot bypass checkout/credit or conflict protections.
revoke insert,update,delete,truncate,references,trigger on
 public.brands,public.items,public.customers,public.pickups,public.pickup_items,
 public.sales,public.sale_items,public.stock_log,public.carton_returns,public.carton_rewards,
 public.roost_returns,public.roost_credit_uses,public.customer_comments,
 public.payment_methods,public.settings,public.pickup_appointments
from public,anon,authenticated;

revoke all on function public.rr_sync(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.rr_sync(text,jsonb,uuid,text) to service_role;
grant usage on schema private to service_role;
revoke all on function private.rr_sync(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function private.rr_sync(text,jsonb,uuid,text) to service_role;
-- Helpers cannot be invoked directly by an untrusted browser.
revoke all on function private.rr_patch(jsonb,boolean),private.rr_state(),private.rr_document(text,jsonb),private.rr_spec(text),private.rr_lock(),private.rr_version(),private.rr_changed() from public,anon,authenticated;
