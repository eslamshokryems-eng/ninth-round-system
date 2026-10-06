-- STAGING SEED 02 — the staff roster. Idempotent: inserts a grant only if that exact (event, person, role, station) is not already active; re-activates inactive ones; never deletes.
-- Runs as the Super Admin through real RLS, so the existing audit trigger records every grant. Variables: actor_email, event_slug, target_env; env ROSTER_CSV.
\set ON_ERROR_STOP on
\set QUIET on
\set roster_data `cat "$ROSTER_CSV"`
begin;
select set_config('request.jwt.claim.sub', (select id::text from race_profiles where lower(email) = lower(:'actor_email') and is_super_admin and is_active), true) as sub \gset
\if :{?sub} \else \echo 'FAIL: the actor is not an active Super Admin' \quit \endif
create temp table seed_roster on commit drop as
select upper(trim(split_part(line, ',', 1))) as role, lower(trim(split_part(line, ',', 2))) as email, nullif(trim(split_part(line, ',', 3)), '')::int as station
  from regexp_split_to_table(:'roster_data', E'\r?\n') as t(line)
 where trim(line) <> '' and trim(line) not like '#%' and lower(trim(line)) not like 'role,%';
grant select on seed_roster to authenticated;
select set_config('seed.target_env', :'target_env', true), set_config('seed.event_slug', :'event_slug', true) as _cfg \gset
do $$ begin
  if current_setting('seed.target_env') <> 'staging' or current_setting('seed.event_slug') !~ '-(staging|dryrun)$' then raise exception 'SEED FAIL: staging only, slug must end in -staging or -dryrun'; end if;
  if not exists (select 1 from public.race_events where slug = current_setting('seed.event_slug')) then raise exception 'SEED FAIL: run 01_event.sql first'; end if;
end $$;

set local role authenticated;
do $$
declare ev uuid; r record; v_profile uuid; v_station uuid; v_ins int := 0; v_react int := 0; v_have int := 0; k int;
begin
  select id into ev from public.race_events where slug = current_setting('seed.event_slug');
  for r in select * from seed_roster order by role, email, station loop
    select id into v_profile from public.race_profiles where lower(email) = r.email;
    if v_profile is null then raise exception 'SEED FAIL: % has no race_profiles row', r.email; end if;
    v_station := case when r.station is null then null else (select id from public.race_stations where event_id = ev and number = r.station) end;
    if exists (select 1 from public.race_staff s where s.event_id = ev and s.profile_id = v_profile and s.role = r.role::public.race_role and s.station_id is not distinct from v_station and s.active) then
      v_have := v_have + 1;
    elsif exists (select 1 from public.race_staff s where s.event_id = ev and s.profile_id = v_profile and s.role = r.role::public.race_role and s.station_id is not distinct from v_station) then
      update public.race_staff set active = true
       where event_id = ev and profile_id = v_profile and role = r.role::public.race_role and station_id is not distinct from v_station;
      v_react := v_react + 1;
    else
      insert into public.race_staff (event_id, profile_id, role, station_id) values (ev, v_profile, r.role::public.race_role, v_station);
      v_ins := v_ins + 1;
    end if;
  end loop;
  raise notice 'staff for %: % granted, % re-activated, % already in place', current_setting('seed.event_slug'), v_ins, v_react, v_have;
end $$;
reset role;
commit;
