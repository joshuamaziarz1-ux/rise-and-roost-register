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
 public.payment_methods,public.settings,public.pickup_appointments,
 public.admins,public.store_revision_public
from public,anon,authenticated;
-- Explicitly retain service-only access to all legacy privileged business RPCs.
-- Existing deployments may have older grants than the reconstructed fixture.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname=split_part('public.rr_sync','.',1) and p.proname like 'rr_%' and p.proname<>'rr_sync'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
