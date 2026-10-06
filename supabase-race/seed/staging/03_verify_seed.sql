-- STAGING SEED 03 — verification (READ-ONLY): prints the report and FAILS if the event or the roster is not exactly as seeded.
-- Variables: actor_email, event_slug; env ROSTER_CSV.
\set ON_ERROR_STOP on
\set QUIET on
\set roster_data `cat "$ROSTER_CSV"`
begin;
create temp table seed_roster on commit drop as
select upper(trim(split_part(line, ',', 1))) as role, lower(trim(split_part(line, ',', 2))) as email, nullif(trim(split_part(line, ',', 3)), '')::int as station
  from regexp_split_to_table(:'roster_data', E'\r?\n') as t(line)
 where trim(line) <> '' and trim(line) not like '#%' and lower(trim(line)) not like 'role,%';
select set_config('seed.event_slug', :'event_slug', true), set_config('seed.actor_email', :'actor_email', true) as _cfg \gset
set transaction read only;   -- from here on nothing can be written (only the temp roster above exists)
do $$
declare ev public.race_events; n_roster int; n_active int; missing text; extra text; judges int;
begin
  select * into ev from public.race_events where slug = current_setting('seed.event_slug');
  if ev.id is null then raise exception 'VERIFY FAIL: event % does not exist', current_setting('seed.event_slug'); end if;
  if not (ev.work_ms = 180000 and ev.transition_ms = 30000 and ev.start_interval_ms = 210000 and ev.first_start_offset_ms = 60000 and ev.station_count = 9) then
    raise exception 'VERIFY FAIL: event timing is not the rulebook (3:00 / 0:30 / 3:30 / 60 s / 9 stations)'; end if;
  if (select count(*) from public.race_stations where event_id = ev.id) <> 9 or (select count(*) from public.race_categories where event_id = ev.id) <> 3
     or (select count(*) from public.race_station_rules where event_id = ev.id) <> 27 then raise exception 'VERIFY FAIL: stations / categories / rules are not 9 / 3 / 27'; end if;
  if ev.status not in ('REGISTRATION_OPEN', 'HEATS_LOCKED') then raise exception 'VERIFY FAIL: unexpected event status %', ev.status; end if;
  -- roster == active staff (the actor''s own Event Manager grant from race_create_event is expected and ignored)
  select count(*) into n_roster from (select distinct role, email, station from seed_roster) q;
  select string_agg(r.role || ' ' || r.email || coalesce(' S' || r.station, ''), '; ') into missing
    from (select distinct role, email, station from seed_roster) r
   where not exists (select 1 from public.race_staff s join public.race_profiles p on p.id = s.profile_id join public.race_stations st on st.event_id = s.event_id and st.id is not distinct from s.station_id
                      where s.event_id = ev.id and s.active and lower(p.email) = r.email and s.role::text = r.role and st.number is not distinct from r.station)
     and not exists (select 1 from public.race_staff s join public.race_profiles p on p.id = s.profile_id
                      where s.event_id = ev.id and s.active and lower(p.email) = r.email and s.role::text = r.role and s.station_id is null and r.station is null);
  if missing is not null then raise exception 'VERIFY FAIL: roster entries without an active grant: %', missing; end if;
  select string_agg(p.email || ' ' || s.role, '; ') into extra
    from public.race_staff s join public.race_profiles p on p.id = s.profile_id
   where s.event_id = ev.id and s.active and lower(p.email) <> lower(current_setting('seed.actor_email'))
     and not exists (select 1 from seed_roster r left join public.race_stations st on st.event_id = s.event_id and st.id = s.station_id
                      where r.email = lower(p.email) and r.role = s.role::text and r.station is not distinct from st.number);
  if extra is not null then raise exception 'VERIFY FAIL: active staff that are NOT in the roster: %', extra; end if;
  select count(distinct st.number) into judges from public.race_staff s join public.race_stations st on st.id = s.station_id where s.event_id = ev.id and s.active and s.role = 'JUDGE';
  raise notice 'VERIFY OK: event % (%), % roster entries all active, no extras, judges cover % of 9 stations%', ev.slug, ev.status, n_roster, judges,
    case when judges < 9 then ' — NOTE: not every station has a judge yet' else '' end;
  if exists (select 1 from public.race_profiles where is_super_admin and lower(email) <> lower(current_setting('seed.actor_email'))) then raise notice 'NOTE: another Super Admin exists besides the actor'; end if;
end $$;
select s.role, count(*) as people, string_agg(coalesce('S' || st.number, '-'), ',' order by st.number) as stations
  from public.race_staff s join public.race_events e on e.id = s.event_id left join public.race_stations st on st.id = s.station_id
 where e.slug = :'event_slug' and s.active group by s.role order by s.role;
rollback;
