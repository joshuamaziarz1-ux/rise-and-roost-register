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
