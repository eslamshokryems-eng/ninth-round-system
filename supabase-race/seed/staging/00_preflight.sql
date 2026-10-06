-- STAGING SEED 00 — preflight (READ-ONLY). Fails (with the reason) before anything is changed.
-- Variables: actor_email, event_slug, target_env ('staging'), env ROSTER_CSV (path of the private roster file).
\set ON_ERROR_STOP on
\set QUIET on
\if :{?target_env} \else \echo 'FAIL: pass -v target_env=staging'  \quit \endif
\set roster_data `cat "$ROSTER_CSV"`

begin;
create temp table seed_roster on commit drop as
select upper(trim(split_part(line, ',', 1))) as role, lower(trim(split_part(line, ',', 2))) as email, nullif(trim(split_part(line, ',', 3)), '')::int as station, n
  from regexp_split_to_table(:'roster_data', E'\r?\n') with ordinality as t(line, n)
 where trim(line) <> '' and trim(line) not like '#%' and lower(trim(line)) not like 'role,%';

select set_config('seed.target_env', :'target_env', true), set_config('seed.event_slug', :'event_slug', true), set_config('seed.actor_email', :'actor_email', true) as _cfg \gset
set transaction read only;   -- from here on nothing can be written (only the temp roster above exists)
do $$
declare r record; v_actor public.race_profiles; n int;
begin
  if current_setting('seed.target_env') <> 'staging' then raise exception 'PREFLIGHT FAIL: these scripts are for the staging project only (target_env=%)', current_setting('seed.target_env'); end if;
  if current_setting('seed.event_slug') !~ '-(staging|dryrun)$' then raise exception 'PREFLIGHT FAIL: the event slug must end in -staging or -dryrun (got %)', current_setting('seed.event_slug'); end if;
  select * into v_actor from public.race_profiles where lower(email) = lower(current_setting('seed.actor_email'));
  if v_actor.id is null then raise exception 'PREFLIGHT FAIL: no race_profiles row for the actor % — create the Auth user first', current_setting('seed.actor_email'); end if;
  if not (v_actor.is_super_admin and v_actor.is_active) then raise exception 'PREFLIGHT FAIL: % is not an active Super Admin (run bootstrap/promote_super_admin.sql first)', current_setting('seed.actor_email'); end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'race_registration_attempts') then
    raise exception 'PREFLIGHT FAIL: migrations are not fully applied (race_registration_attempts missing)'; end if;
  select count(*) into n from seed_roster;
  if n = 0 then raise exception 'PREFLIGHT FAIL: the roster is empty or unreadable (ROSTER_CSV)'; end if;
  for r in select * from seed_roster loop
    if r.role not in ('EVENT_MANAGER', 'MASTER_CONTROL', 'RECEPTION', 'JUDGE', 'STATION_SCREEN') then raise exception 'PREFLIGHT FAIL: roster line %: unknown role %', r.n, r.role; end if;
    if r.email is null or r.email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then raise exception 'PREFLIGHT FAIL: roster line %: invalid email', r.n; end if;
    if (r.role in ('JUDGE', 'STATION_SCREEN')) <> (r.station is not null) then raise exception 'PREFLIGHT FAIL: roster line %: % needs a station, others must have none', r.n, r.role; end if;
    if r.station is not null and r.station not between 1 and 9 then raise exception 'PREFLIGHT FAIL: roster line %: station must be 1-9', r.n; end if;
    if not exists (select 1 from public.race_profiles p where lower(p.email) = r.email) then
      raise exception 'PREFLIGHT FAIL: roster line %: % has no Auth user / race_profiles row yet', r.n, r.email; end if;
  end loop;
  if exists (select 1 from seed_roster group by role, email, station having count(*) > 1) then raise exception 'PREFLIGHT FAIL: duplicate roster lines'; end if;
  if exists (select 1 from seed_roster where role in ('JUDGE', 'STATION_SCREEN') group by role, station having count(*) > 1) then
    raise notice 'NOTE: more than one person on the same station/role (allowed; e.g. a substitute judge)'; end if;
  raise notice 'PREFLIGHT OK: actor %, % roster lines, event slug % (%)', current_setting('seed.actor_email'), n, current_setting('seed.event_slug'),
    case when exists (select 1 from public.race_events where slug = current_setting('seed.event_slug')) then 'exists — 01 will leave it as is' else 'will be created' end;
end $$;
rollback;
