-- Existing pickup_appointments remain the only appointment store. Access-code
-- columns are never modified by scheduling; only schedule/status metadata changes.
create function private.rr_pickup_slots(p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb; zone text; duration integer; slots jsonb;
begin
 select value into cfg from public.settings where key='pickup_schedule';
 if cfg is null or coalesce((cfg->>'enabled')::boolean,false)=false then return '[]'; end if;
 zone:=coalesce(cfg->>'timeZone','America/New_York');
 if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Invalid pickup time zone'; end if;
 duration:=greatest(15,least(240,coalesce((cfg->>'slotMinutes')::integer,60)));
 select coalesce(jsonb_agg(at order by at),'[]') into slots from (
  select distinct (day+tm::time) at time zone zone as at,day+tm::time as local_at
  from (select (now() at time zone zone)::date+n as day from generate_series(0,45) n) dates
  cross join lateral jsonb_array_elements(coalesce(cfg->'days','[]')) rule
  cross join lateral jsonb_array_elements_text(coalesce(rule->'times','[]')) tm
  where coalesce((rule->>'enabled')::boolean,false) and (rule->>'day')::integer=extract(dow from day)::integer
   and tm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 ) candidates
 where at>now() and at at time zone zone=local_at and not exists(
  select 1 from public.pickup_appointments a join public.pickups p on p.id=a.pickup_id
  where p.id<>p_id and p.status in ('ready','waiting') and coalesce(a.rr_extra->>'appointmentStatus','approved')<>'declined'
   and a.scheduled_at<at+make_interval(mins=>duration) and a.scheduled_at+make_interval(mins=>duration)>at
 );
 return slots;
end $$;

create function private.rr_set_appointment(p_id text,p_at timestamptz,p_status text,p_note text,p_import boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare duration integer;
begin
 if p_status is null or p_status not in ('unscheduled','pending','approved','declined') then raise exception 'Invalid appointment status'; end if;
 if p_at is null and p_status in ('pending','approved') then raise exception 'Choose a pickup time'; end if;
 if p_at is not null and p_status='unscheduled' then raise exception 'Clear the time for an unscheduled appointment'; end if;
 if p_at is not null and not isfinite(p_at) then raise exception 'Invalid pickup time'; end if;
 if not p_import and p_at is not null and p_status in ('pending','approved') then
  if p_at<=now() then raise exception 'Choose a future pickup time'; end if;
  select greatest(15,least(240,coalesce((value->>'slotMinutes')::integer,60))) into duration from public.settings where key='pickup_schedule';
  duration:=coalesce(duration,60);
  if exists(select 1 from public.pickup_appointments a join public.pickups p on p.id=a.pickup_id
   where p.id<>p_id and p.status in ('ready','waiting') and coalesce(a.rr_extra->>'appointmentStatus','approved')<>'declined'
    and a.scheduled_at<p_at+make_interval(mins=>duration) and a.scheduled_at+make_interval(mins=>duration)>p_at)
  then raise exception 'DATA_CONFLICT: That pickup time is already reserved'; end if;
 end if;
 insert into public.pickup_appointments(pickup_id,scheduled_at,rr_extra)
 values(p_id,p_at,jsonb_build_object('appointmentStatus',p_status,'appointmentNote',left(coalesce(p_note,''),1000),'appointmentUpdatedAt',now()))
 on conflict(pickup_id) do update set scheduled_at=excluded.scheduled_at,
  rr_extra=public.pickup_appointments.rr_extra||excluded.rr_extra,updated_at=now();
end $$;

revoke all on function private.rr_pickup_slots(text),private.rr_set_appointment(text,timestamptz,text,text,boolean) from public,anon,authenticated;
