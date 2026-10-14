do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$; create schema auth; create schema private; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.customers(id text default (gen_random_uuid())::text not null,name text not null,phone text,carton_credits int4 default 0 not null,total_cartons int4 default 0 not null,free_dozens int4 default 0 not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null,email text,pickup_alerts bool default false not null,store_updates bool default false not null);
create table public.store_revision_public(id int4 not null,revision int8 default 0 not null,updated_at timestamptz default now() not null);
create table public.pickup_appointments(pickup_id text not null,scheduled_at timestamptz,door_pin text,pin_texted_at timestamptz,created_at timestamptz default now() not null,updated_at timestamptz default now() not null,access_extended_until timestamptz);
create table public.roost_returns(id text default ('return_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) not null,customer_id text,customer_name text not null,type_id text not null,type_name text not null,qty int4 not null,credits_earned int4 not null,created_at timestamptz default now() not null);
create table public.roost_credit_uses(id text default ('credit_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) not null,customer_id text,customer_name text not null,sale_id text,credits_used int4 not null,credit_value numeric not null,discount_amount numeric not null,created_at timestamptz default now() not null);
create table public.sale_items(id text default (gen_random_uuid())::text not null,sale_id text not null,item_id text,item_name text not null,brand_id text,brand_name text,price numeric default 0 not null,qty int4 not null);
create table public.carton_rewards(id text default (gen_random_uuid())::text not null,customer_id text,customer_name text not null,item_id text,item_name text not null,credits_used int4 not null,created_at timestamptz default now() not null);
create table public.pickup_items(id text default (gen_random_uuid())::text not null,pickup_id text not null,item_id text,item_name text not null,brand_id text,brand_name text,price numeric default 0 not null,qty int4 not null);
create table public.customer_comments(id text default ('comment_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) not null,customer_name text,comment_text text not null,created_at timestamptz default now() not null);
create table public.carton_returns(id text default (gen_random_uuid())::text not null,customer_id text,customer_name text not null,qty int4 not null,created_at timestamptz default now() not null);
create table public.stock_log(id text default (gen_random_uuid())::text not null,item_id text,item_name text not null,brand_name text,delta int4 not null,stock_after int4 not null,reason text,created_at timestamptz default now() not null);
create table public.sales(id text default (gen_random_uuid())::text not null,sold_at timestamptz default now() not null,total numeric default 0 not null,payment text default 'cash'::text not null,source text default 'store'::text not null,pickup_id text,voided bool default false not null,voided_at timestamptz,created_at timestamptz default now() not null);
create table public.admins(user_id uuid not null,display_name text,created_at timestamptz default now() not null);
create table public.payment_methods(method text not null,display_name text not null,qr_data text,active bool default true not null,updated_at timestamptz default now() not null);
create table public.settings(key text not null,value jsonb default '{}'::jsonb not null,updated_at timestamptz default now() not null);
create table public.pickups(id text default (gen_random_uuid())::text not null,code text not null,customer_name text not null,phone text,note text,status text default 'ready'::text not null,paid bool default false not null,created_at timestamptz default now() not null,completed_at timestamptz,updated_at timestamptz default now() not null);
create table public.items(id text default (gen_random_uuid())::text not null,brand_id text,name text not null,price numeric default 0 not null,stock int4 default 0 not null,low_stock int4 default 2 not null,active bool default true not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.brands(id text default (gen_random_uuid())::text not null,name text not null,active bool default true not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
alter table customers add primary key (id); alter table customers enable row level security;
alter table store_revision_public add primary key (id); alter table store_revision_public enable row level security;
alter table pickup_appointments add primary key (pickup_id); alter table pickup_appointments enable row level security;
alter table roost_returns add primary key (id); alter table roost_returns enable row level security;
alter table roost_credit_uses add primary key (id); alter table roost_credit_uses enable row level security;
alter table sale_items add primary key (id); alter table sale_items enable row level security;
alter table carton_rewards add primary key (id); alter table carton_rewards enable row level security;
alter table pickup_items add primary key (id); alter table pickup_items enable row level security;
alter table customer_comments add primary key (id); alter table customer_comments enable row level security;
alter table carton_returns add primary key (id); alter table carton_returns enable row level security;
alter table stock_log add primary key (id); alter table stock_log enable row level security;
alter table sales add primary key (id); alter table sales enable row level security;
alter table admins add primary key (user_id); alter table admins enable row level security;
alter table payment_methods add primary key (method); alter table payment_methods enable row level security;
alter table settings add primary key (key); alter table settings enable row level security;
alter table pickups add primary key (id); alter table pickups enable row level security;
alter table items add primary key (id); alter table items enable row level security;
alter table brands add primary key (id); alter table brands enable row level security;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION private.bump_data_revision()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new bigint;
begin
  insert into public.settings (key, value)
  values ('data_revision', jsonb_build_object('value', 1))
  on conflict (key) do update
    set value = jsonb_build_object(
      'value',
      coalesce((public.settings.value->>'value')::bigint, 0) + 1
    ),
    updated_at = now()
  returning coalesce((value->>'value')::bigint, 0) into v_new;

  insert into public.store_revision_public (id, revision, updated_at)
  values (1, v_new, now())
  on conflict (id) do update
    set revision = excluded.revision,
        updated_at = excluded.updated_at;

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.bump_data_revision_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('rise_roost.suppress_revision', true) = 'on' then
    return null;
  end if;

  perform private.bump_data_revision();
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_return_cartons(p_customer_id text, p_name text, p_phone_last4 text, p_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer record;
  v_digits text;
  v_credits integer;
  v_total integer;
  v_revision bigint;
begin
  if p_qty is null or p_qty < 1 or p_qty > 50 then
    raise exception 'Invalid carton quantity';
  end if;

  select *
    into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found or lower(trim(v_customer.name)) <> lower(trim(p_name)) then
    raise exception 'Customer verification failed';
  end if;

  v_digits := regexp_replace(coalesce(v_customer.phone,''), '[^0-9]', '', 'g');

  if length(v_digits) >= 4 and right(v_digits,4) <> regexp_replace(coalesce(p_phone_last4,''), '[^0-9]', '', 'g') then
    raise exception 'Customer verification failed';
  end if;

  update public.customers
  set carton_credits = carton_credits + p_qty,
      total_cartons = total_cartons + p_qty
  where id = p_customer_id
  returning carton_credits, total_cartons
  into v_credits, v_total;

  insert into public.carton_returns
    (customer_id, customer_name, qty, created_at)
  values
    (p_customer_id, v_customer.name, p_qty, now());

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'customerId', p_customer_id,
    'name', v_customer.name,
    'cartonCredits', v_credits,
    'totalCartons', v_total,
    'revision', v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_complete_pickup(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pickup record;
  rec record;
  v_item record;
  v_total numeric(10,2) := 0;
  v_sale_id text := 'sale_' || replace(gen_random_uuid()::text, '-', '');
  v_stock_after integer;
  v_payment text;
  v_revision bigint;
begin
  select *
    into v_pickup
  from public.pickups
  where upper(code) = upper(trim(p_code))
    and status = 'ready'
  for update;

  if not found then
    raise exception 'Pickup order not found or not ready';
  end if;

  for rec in
    select * from public.pickup_items where pickup_id = v_pickup.id order by id
  loop
    select i.id, i.name, i.brand_id, i.price, i.stock,
           coalesce(b.name, 'Unknown') as brand_name
      into v_item
    from public.items i
    left join public.brands b on b.id = i.brand_id
    where i.id = rec.item_id
    for update of i;

    if not found or v_item.stock < rec.qty then
      raise exception 'Not enough inventory for %', rec.item_name;
    end if;

    v_total := v_total + (rec.price * rec.qty);
  end loop;

  v_payment := case when v_pickup.paid then 'prepaid' else 'cash' end;

  insert into public.sales
    (id, sold_at, total, payment, source, pickup_id, voided)
  values
    (v_sale_id, now(), round(v_total,2), v_payment, 'pickup', v_pickup.id, false);

  for rec in
    select * from public.pickup_items where pickup_id = v_pickup.id order by id
  loop
    update public.items
    set stock = stock - rec.qty
    where id = rec.item_id
    returning stock into v_stock_after;

    insert into public.sale_items
      (sale_id, item_id, item_name, brand_id, brand_name, price, qty)
    values
      (v_sale_id, rec.item_id, rec.item_name, rec.brand_id, rec.brand_name, rec.price, rec.qty);

    insert into public.stock_log
      (item_id, item_name, brand_name, delta, stock_after, reason)
    values
      (rec.item_id, rec.item_name, rec.brand_name, -rec.qty, v_stock_after,
       'Pickup order ' || v_pickup.code);
  end loop;

  update public.pickups
  set status = 'picked', completed_at = now()
  where id = v_pickup.id;

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'pickupId', v_pickup.id,
    'customerName', v_pickup.customer_name,
    'total', round(v_total,2),
    'paid', v_pickup.paid,
    'saleId', v_sale_id,
    'revision', v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_redeem_carton_reward(p_customer_id text, p_name text, p_phone_last4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer record;
  v_digits text;
  v_settings jsonb;
  v_threshold integer;
  v_reward_item_id text;
  v_item record;
  v_reserved integer;
  v_stock_after integer;
  v_credits integer;
  v_free integer;
  v_sale_id text := 'sale_' || replace(gen_random_uuid()::text, '-', '');
  v_revision bigint;
begin
  select *
    into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found or lower(trim(v_customer.name)) <> lower(trim(p_name)) then
    raise exception 'Customer verification failed';
  end if;

  v_digits := regexp_replace(coalesce(v_customer.phone,''), '[^0-9]', '', 'g');
  if length(v_digits) >= 4 and right(v_digits,4) <> regexp_replace(coalesce(p_phone_last4,''), '[^0-9]', '', 'g') then
    raise exception 'Customer verification failed';
  end if;

  select value into v_settings
  from public.settings
  where key = 'carton_settings';

  v_threshold := greatest(1, coalesce((v_settings->>'cartonsPerFreeDozen')::integer, 12));
  v_reward_item_id := nullif(v_settings->>'rewardItemId', '');

  if v_reward_item_id is null then
    raise exception 'Reward item is not configured';
  end if;

  if v_customer.carton_credits < v_threshold then
    raise exception 'Not enough carton credits';
  end if;

  select i.id, i.name, i.brand_id, i.price, i.stock,
         coalesce(b.name, 'Unknown') as brand_name
    into v_item
  from public.items i
  left join public.brands b on b.id = i.brand_id
  where i.id = v_reward_item_id
    and i.active = true
  for update of i;

  if not found then
    raise exception 'Reward item is not available';
  end if;

  select coalesce(sum(pi.qty), 0)::integer
    into v_reserved
  from public.pickup_items pi
  join public.pickups p on p.id = pi.pickup_id
  where pi.item_id = v_reward_item_id
    and p.status in ('ready','waiting');

  if (v_item.stock - v_reserved) < 1 then
    raise exception 'Reward item is sold out';
  end if;

  update public.customers
  set carton_credits = carton_credits - v_threshold,
      free_dozens = free_dozens + 1
  where id = p_customer_id
  returning carton_credits, free_dozens into v_credits, v_free;

  update public.items
  set stock = stock - 1
  where id = v_reward_item_id
  returning stock into v_stock_after;

  insert into public.carton_rewards
    (customer_id, customer_name, item_id, item_name, credits_used, created_at)
  values
    (p_customer_id, v_customer.name, v_item.id, v_item.name, v_threshold, now());

  insert into public.sales
    (id, sold_at, total, payment, source, voided)
  values
    (v_sale_id, now(), 0, 'reward', 'carton-club', false);

  insert into public.sale_items
    (sale_id, item_id, item_name, brand_id, brand_name, price, qty)
  values
    (v_sale_id, v_item.id, v_item.name, v_item.brand_id, v_item.brand_name, 0, 1);

  insert into public.stock_log
    (item_id, item_name, brand_name, delta, stock_after, reason)
  values
    (v_item.id, v_item.name, v_item.brand_name, -1, v_stock_after,
     'Carton Club free dozen - ' || v_customer.name);

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'customerId', p_customer_id,
    'name', v_customer.name,
    'cartonCredits', v_credits,
    'freeDozens', v_free,
    'rewardItemId', v_item.id,
    'rewardItemName', v_item.name,
    'creditsUsed', v_threshold,
    'revision', v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_join_roost(p_name text, p_phone text, p_email text, p_pickup_alerts boolean, p_store_updates boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id text := 'customer_' || replace(gen_random_uuid()::text, '-', '');
  v_name text := btrim(coalesce(p_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_phone_digits text;
  v_existing record;
  v_revision bigint;
begin
  if length(v_name) < 2 then
    raise exception 'Please enter your name.';
  end if;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if length(v_phone_digits) = 11 and left(v_phone_digits,1) = '1' then
    v_phone_digits := substr(v_phone_digits,2);
  end if;
  if length(v_phone_digits) <> 10 then
    raise exception 'Please enter a valid 10-digit phone number.';
  end if;

  if v_email <> '' and (
    position('@' in v_email) < 2
    or position('.' in split_part(v_email,'@',2)) < 2
  ) then
    raise exception 'Please enter a valid email address.';
  end if;

  select id, name
    into v_existing
  from public.customers
  where regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = v_phone_digits
     or (v_email <> '' and lower(coalesce(email,'')) = v_email)
  limit 1;

  if found then
    raise exception 'That phone number or email is already connected to a Roost member.';
  end if;

  insert into public.customers
    (id, name, phone, email, pickup_alerts, store_updates,
     carton_credits, total_cartons, free_dozens, created_at, updated_at)
  values
    (v_id, v_name, v_phone_digits, nullif(v_email,''),
     coalesce(p_pickup_alerts,false), coalesce(p_store_updates,false),
     0,0,0,now(),now());

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'phone', v_phone_digits,
    'email', nullif(v_email,''),
    'pickupAlerts', coalesce(p_pickup_alerts,false),
    'storeUpdates', coalesce(p_store_updates,false),
    'cartonCredits', 0,
    'roostCredits', 0,
    'totalCartons', 0,
    'freeDozens', 0,
    'revision', v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_roost_return(p_customer_id text, p_phone text, p_type_id text, p_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer record;
  v_settings jsonb;
  v_type jsonb;
  v_credit_each integer;
  v_earned integer;
  v_new_balance integer;
  v_digits text;
  v_supplied text;
  v_revision bigint;
begin
  if p_qty is null or p_qty < 1 or p_qty > 50 then
    raise exception 'Invalid return quantity';
  end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id
  for update;
  if not found then raise exception 'Roost member not found'; end if;

  v_digits := regexp_replace(coalesce(v_customer.phone,''), '[^0-9]', '', 'g');
  if length(v_digits)=11 and left(v_digits,1)='1' then v_digits:=right(v_digits,10); end if;
  v_supplied := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_supplied)=11 and left(v_supplied,1)='1' then v_supplied:=right(v_supplied,10); end if;
  if length(v_digits) <> 10 or v_digits <> v_supplied then
    raise exception 'Member verification failed';
  end if;

  select value into v_settings from public.settings where key='roost_credit_settings';
  v_settings := coalesce(v_settings,'{}'::jsonb);

  select elem into v_type
  from jsonb_array_elements(coalesce(v_settings->'returnTypes','[]'::jsonb)) elem
  where elem->>'id'=p_type_id and coalesce((elem->>'active')::boolean,true)=true
  limit 1;
  if v_type is null then raise exception 'That return type is not available'; end if;

  v_credit_each := greatest(0,coalesce((v_type->>'credit')::integer,0));
  v_earned := p_qty * v_credit_each;

  update public.customers
  set carton_credits = carton_credits + v_earned,
      total_cartons = total_cartons + case when p_type_id='egg-carton' then p_qty else 0 end,
      updated_at = now()
  where id=p_customer_id
  returning carton_credits into v_new_balance;

  insert into public.roost_returns(customer_id,customer_name,type_id,type_name,qty,credits_earned)
  values(p_customer_id,v_customer.name,p_type_id,coalesce(v_type->>'name','Return'),p_qty,v_earned);

  v_revision := private.bump_data_revision();

  return jsonb_build_object(
    'customerId',p_customer_id,
    'name',v_customer.name,
    'roostCredits',v_new_balance,
    'cartonCredits',v_new_balance,
    'creditsEarned',v_earned,
    'revision',v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rr_store_checkout_with_credit(p_payment text, p_expected_total numeric, p_lines jsonb, p_customer_id text DEFAULT NULL::text, p_use_credits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec record;
  v_item record;
  v_customer record;
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
    group by elem->>'itemId'
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
    group by elem->>'itemId'
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
$function$;
create policy "public read store revision" on store_revision_public for SELECT to anon,authenticated using (true);
create policy "admins manage customers" on customers for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage sale items" on sale_items for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage carton rewards" on carton_rewards for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage pickup items" on pickup_items for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage carton returns" on carton_returns for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage stock log" on stock_log for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage sales" on sales for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins view admins" on admins for SELECT to authenticated using (private.is_admin());
create policy "admins manage payment methods" on payment_methods for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public read payment methods" on payment_methods for SELECT to anon using ((active = true));
create policy "admins manage settings" on settings for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage pickups" on pickups for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage items" on items for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public read active items" on items for SELECT to anon using ((active = true));
create policy "admins manage brands" on brands for ALL to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public read active brands" on brands for SELECT to anon using ((active = true));
grant usage on schema public,private,auth to anon,authenticated,service_role; grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; revoke all on all functions in schema public from public,anon,authenticated; grant execute on all functions in schema public to service_role;
