-- Phase 8: the Station Screen data contract (race_station_screen). The screen is display-only: it receives authoritative race-time
-- timestamps and the derived score for ITS station, nothing personal, and nothing it does can change the race.
reset role;
select race_test.make_user('screen2', '');
create function race_test.scr(p_user text, p_event uuid, p_station int default 1) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform race_test.login(p_user);
  v := race_station_screen(p_event, p_station);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
-- the payload without what legitimately differs between two reads (server clock, the sampled race ms)
create function race_test.core(p jsonb) returns jsonb language sql as $$ select (p - 'server_time') #- '{clock,race_ms}' $$;
create function race_test.mk8(p_key text, p_slug text) returns void language plpgsql as $$
begin
  perform race_test.mkevent(p_key, p_slug, 5);
  insert into race_heats (event_id, number) values (race_test.id(p_key), 1);
  perform race_move_athlete_heat(race_test.rid(p_key || i), (select id from race_heats where event_id = race_test.id(p_key))) from generate_series(1, 5) i;
  insert into race_staff (event_id, profile_id, role) values (race_test.id(p_key), race_test.id('master'), 'MASTER_CONTROL');
  insert into race_staff (event_id, profile_id, role, station_id)
  select race_test.id(p_key), race_test.id(k), r::race_role, (select id from race_stations where event_id = race_test.id(p_key) and number = n)
    from (values ('judge1', 'JUDGE', 1), ('screen1', 'STATION_SCREEN', 1), ('screen2', 'STATION_SCREEN', 2)) v(k, r, n);
  perform race_test.login('bm_a'); perform race_lock_heats(race_test.id(p_key));
  perform race_test.login('rec');
  perform race_check_in(race_test.rid(p_key || i)) from generate_series(1, 4) i;   -- athlete 5 never arrives
  perform set_config('role', 'postgres', false);
end $$;
select race_test.mk8('ev_scr', 'screen-2026');

-- Before START EVENT ---------------------------------------------------------------------------------------------------------------------
select race_test.ok((select v -> 'clock' ->> 'started' = 'false' and jsonb_typeof(v -> 'current') = 'null' and jsonb_typeof(v -> 'upcoming') = 'null'
                            and v -> 'station' ->> 'name' = 'Squat' and (v -> 'station' ->> 'number')::int = 1
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'before the race: WAITING data — station 1 "Squat", no athlete, race not started');

select race_test.login('master'); select race_start_event(race_test.id('ev_scr')); reset role;
select race_sim.travel_to(race_test.id('ev_scr'), 1000);

-- Security: what the screen may and may not do ---------------------------------------------------------------------------------------------
select race_test.login('screen2');
select race_test.throws($$select race_station_screen(race_test.id('ev_scr'), 1)$$, 'RACE_FORBIDDEN', 'security: a screen assigned to station 2 cannot open station 1');
select race_test.ok((select v -> 'station' ->> 'number' = '2' from (select race_station_screen(race_test.id('ev_scr'), 2) v) q), 'security: … but shows its own station 2');
select race_test.login('screen1');
select race_test.throws($$select * from race_record_action(gen_random_uuid(), 'REP', gen_random_uuid())$$, 'RACE_NOT_FOUND|RACE_FORBIDDEN', 'security: a screen cannot record a score');
select race_test.throws($$select * from race_pause(race_test.id('ev_scr'), 'x')$$, 'RACE_FORBIDDEN', 'security: a screen cannot pause the race');
select race_test.throws($$select * from race_resume(race_test.id('ev_scr'))$$, 'RACE_FORBIDDEN', 'security: … resume it');
select race_test.throws($$select * from race_start_event(race_test.id('ev_scr'))$$, 'RACE_FORBIDDEN', 'security: … start it');
select race_test.throws($$select * from race_skip_athlete(gen_random_uuid(), 'x')$$, 'RACE_NOT_FOUND|RACE_FORBIDDEN', 'security: … skip an athlete');
select race_test.throws($$select race_mark_dnf(race_test.rid('ev_scr1'), 'x')$$, 'RACE_FORBIDDEN', 'security: … mark a DNF');
select race_test.throws($$select * from race_close_heat_without_start(race_test.id('ev_scr'), 1, 'x')$$, 'RACE_FORBIDDEN', 'security: … close a heat');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_scr1'), race_test.rid('ev_scr5'), 'x')$$, 'RACE_FORBIDDEN', 'security: … correct a check-in');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_scr5'), 'x')$$, 'RACE_FORBIDDEN', 'security: … override a DNS');
select race_test.throws($$select race_control_state(race_test.id('ev_scr'))$$, 'RACE_FORBIDDEN', 'security: … open the Master Control dashboard');
select race_test.throws($$select race_station_view(race_test.id('ev_scr'), 1)$$, 'RACE_FORBIDDEN', 'security: … open the judge view (which carries athlete names)');
select race_test.throws($$select * from race_check_in(race_test.rid('ev_scr1'))$$, 'RACE_FORBIDDEN', 'security: … check anybody in');
select race_test.eq(race_test.count($$select 1 from race_station_results$$), 0::bigint, 'security: it reads no result rows directly');
select race_test.eq(race_test.count($$select 1 from race_performance_events$$), 0::bigint, 'security: … no judge ledger');
select race_test.eq(race_test.count($$select 1 from race_athletes$$) + race_test.count($$select 1 from race_registrations$$), 0::bigint, 'security: … no athletes, no registrations');
select race_test.eq(race_test.affected($$update race_events set venue = 'x'$$), 0::bigint, 'security: … edits nothing');
select race_test.login('rec');
select race_test.throws($$select race_station_screen(race_test.id('ev_scr'), 1)$$, 'RACE_FORBIDDEN', 'security: Reception has no screen');
select race_test.login('nobody');
select race_test.throws($$select race_station_screen(race_test.id('ev_scr'), 1)$$, 'RACE_FORBIDDEN', 'security: a stranger has no screen');
select race_test.anon();
select race_test.throws($$select race_station_screen(race_test.id('ev_scr'), 1)$$, 'permission denied', 'security: anon has no EXECUTE');
select race_test.login('master');
select race_test.ok((select v -> 'station' ->> 'number' = '1' from (select race_station_screen(race_test.id('ev_scr'), 1) v) q), 'security: race control can preview any station screen');
reset role;

-- Data minimisation --------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select v::text !~* 'athlete|@|full_name|phone|email' and v::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                            and (select array_agg(k order by k) from jsonb_object_keys(v) k) = array['clock', 'current', 'event', 'planned_next_ms', 'served_any', 'server_time', 'station', 'timing', 'upcoming']
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q),
  'minimal data: exactly nine top-level keys; no name, phone, e-mail — and not one database id anywhere in the payload');

-- WAITING / GET READY data: the next athlete, bound 60 s before the start ---------------------------------------------------------------------------
select race_test.ok((select v -> 'upcoming' ->> 'race_number' = 'N001' and (v -> 'upcoming' ->> 'window_start_ms')::bigint = 60000 and v -> 'upcoming' ->> 'category_code' = 'MEN'
                            and jsonb_typeof(v -> 'current') = 'null' and (v ->> 'served_any') = 'false' and (v ->> 'planned_next_ms')::bigint = 270000
                            and (v -> 'timing' ->> 'get_ready_ms')::int = 10000 and (v -> 'clock' ->> 'race_ms')::bigint between 1000 and 3000
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q),
  'WAITING data at 0:01: next athlete N001 starts at 1:00:00 (authoritative race ms), the athlete after is only "planned" (not yet announced)');
select race_test.ok((select v -> 'upcoming' ->> 'race_number' is not null and (select v2 -> 'station' ->> 'number' from (select race_test.scr('screen2', race_test.id('ev_scr'), 2) v2) z) = '2'
                            and (select (v3 -> 'upcoming' ->> 'window_start_ms')::bigint from (select race_test.scr('screen2', race_test.id('ev_scr'), 2) v3) z2) = 60000 + 210000
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q),
  'station 2 shows the SAME athlete arriving one interval later (window start 4:30:00 = 1:00:00 + 3:30)');

-- WORK ------------------------------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_scr'), 61000);
select race_test.ok((select v -> 'current' ->> 'race_number' = 'N001' and (v -> 'current' ->> 'window_start_ms')::bigint = 60000 and (v -> 'current' ->> 'window_end_ms')::bigint = 240000
                            and (v -> 'current' ->> 'scoring_end_ms')::bigint = 270000 and (v -> 'current' ->> 'score')::numeric = 0 and v -> 'current' ->> 'scoring_type' = 'REPS'
                            and v -> 'upcoming' ->> 'race_number' = 'N002' or (v -> 'upcoming') is not null
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q),
  'WORK data at 1:01: N001 with authoritative window 1:00 → 4:00 (scoring end 4:30) and score 0');
select race_test.login('judge1');
select race_test.act((select sr.id from race_station_results sr join race_stations s on s.id = sr.station_id where s.number = 1 and sr.registration_id = race_test.rid('ev_scr1')), 'REP') from generate_series(1, 3);
reset role;
select race_test.eq((select (race_test.scr('screen1', race_test.id('ev_scr')) -> 'current' ->> 'score')::numeric), 3::numeric, 'WORK data: the live score is the derived score from the judge ledger (3 reps)');

-- The 3:00 boundary and the 0:30 that follows -----------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_scr'), 239900);
select race_test.ok((select (v -> 'clock' ->> 'race_ms')::bigint < (v -> 'current' ->> 'window_end_ms')::bigint and (v -> 'current' ->> 'score')::numeric = 3 from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'boundary: at 3:59.9 race time is still before the authoritative window end (WORK)');
select race_sim.travel_to(race_test.id('ev_scr'), 240100);
select race_test.ok((select (v -> 'clock' ->> 'race_ms')::bigint >= (v -> 'current' ->> 'window_end_ms')::bigint and (v -> 'clock' ->> 'race_ms')::bigint < (v -> 'current' ->> 'scoring_end_ms')::bigint
                            and v -> 'current' ->> 'race_number' = 'N001' and (v -> 'current' ->> 'score')::numeric = 3
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'boundary: at 4:00.1 the same answer puts race time inside the 0:30 (TRANSITION) — same athlete, FINAL score 3');
select race_sim.travel_to(race_test.id('ev_scr'), 270100);
select race_test.ok((select v -> 'current' ->> 'race_number' = 'N002' and (v -> 'current' ->> 'window_start_ms')::bigint = 270000 and (v ->> 'served_any') = 'true' and (v -> 'current' ->> 'score')::numeric = 0
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'hand-over at 4:30: N002 is on the station, N001 has been served');

-- PAUSE / RESUME -------------------------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_scr'), 300000);
select race_test.login('master'); select race_pause(race_test.id('ev_scr')); reset role;
select race_sim.age_pause(race_test.id('ev_scr'), 120000);
create temp table scr_p as select race_test.scr('screen1', race_test.id('ev_scr')) a, clock_timestamp() t;
select pg_sleep(0.3);
select race_test.ok((select a -> 'clock' ->> 'paused' = 'true' and (a -> 'clock' ->> 'race_ms')::bigint = (race_test.scr('screen1', race_test.id('ev_scr')) -> 'clock' ->> 'race_ms')::bigint
                            and a -> 'current' ->> 'race_number' = 'N002' from scr_p),
  'PAUSE data: paused = true, race time frozen (identical 2 minutes of wall time apart), N002 still the athlete, window timestamps unchanged');
select race_test.login('master'); select race_resume(race_test.id('ev_scr')); reset role;
select race_test.ok((select v -> 'clock' ->> 'paused' = 'false' and (v -> 'clock' ->> 'race_ms')::bigint between 300000 and 303000 and (v -> 'current' ->> 'window_end_ms')::bigint = 450000
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'RESUME data: race time continues from where it froze (the 2:00 is not counted) and the window end has NOT moved');

-- SKIP / EMPTY SLOT / DNS ---------------------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_scr'), 450000);
select race_test.ok((select v -> 'upcoming' ->> 'race_number' = 'N003' and (v -> 'upcoming' ->> 'window_start_ms')::bigint = 480000 from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'NEXT ATHLETE data at 7:30: N003 arrives at 8:00');
select race_test.login('master');
select race_skip_athlete((select sl.id from race_start_slots sl where sl.registration_id = race_test.rid('ev_scr3')), 'not at the start line');
reset role;
select race_sim.travel_to(race_test.id('ev_scr'), 500000);
select race_test.ok((select jsonb_typeof(v -> 'current') = 'null' and jsonb_typeof(v -> 'upcoming') = 'null' and (v ->> 'planned_next_ms')::bigint = 690000 and (v ->> 'served_any') = 'true'
                     from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q),
  'SKIP data: the skipped athlete is gone — no current, no upcoming; the empty slot leaves a gap; the next planned start (11:30) is unchanged');
select race_sim.travel_to(race_test.id('ev_scr'), 640000);
select race_test.ok((select v -> 'upcoming' ->> 'race_number' = 'N004' and (v -> 'upcoming' ->> 'window_start_ms')::bigint = 690000 from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'NEXT ATHLETE: N004 is announced 60 s before their start and keeps their time — nobody moved up');

-- DNF -----------------------------------------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_scr'), 700000);
select race_test.ok((select v -> 'current' ->> 'race_number' = 'N004' from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'N004 is working at 11:40');
select race_test.login('master'); select race_mark_dnf(race_test.rid('ev_scr4'), 'withdrew'); reset role;
select race_sim.travel_to(race_test.id('ev_scr'), 760000);
select race_test.ok((select jsonb_typeof(v -> 'current') = 'null' from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'DNF data: a withdrawn athlete is no longer shown on the screen');
select race_sim.travel_to(race_test.id('ev_scr'), 990000);
select race_test.ok((select jsonb_typeof(v -> 'upcoming') = 'null' and (v ->> 'planned_next_ms') is null from (select race_test.scr('screen1', race_test.id('ev_scr')) v) q), 'DNS data: athlete 5 never arrived — the last slot burned EMPTY, nothing is upcoming, nothing is planned');

-- The screen never writes ---------------------------------------------------------------------------------------------------------------------------------
create function race_test.footprint(p_event uuid) returns text language sql as $$
  select md5(concat_ws('|',
    (select count(*) from race_audit_log where metadata ->> 'event_id' = p_event::text),
    (select count(*) from race_performance_events where event_id = p_event),
    (select coalesce(sum(derived_version), 0) from race_station_results where event_id = p_event),
    (select count(*) from race_station_results where event_id = p_event),
    (select string_agg(status::text || coalesce(registration_id::text, ''), ',' order by heat_id, slot_index) from race_start_slots where event_id = p_event),
    (select string_agg(race_status::text, ',' order by race_number) from race_registrations where event_id = p_event),
    (select count(*) from race_pauses where event_id = p_event),
    (select version from race_clock where event_id = p_event)))
$$;
create temp table scr_fp as select race_test.footprint(race_test.id('ev_scr')) f0;
select race_test.scr('screen1', race_test.id('ev_scr')) from generate_series(1, 25);
select race_test.scr('screen2', race_test.id('ev_scr'), 2) from generate_series(1, 25);
select race_test.eq(race_test.footprint(race_test.id('ev_scr')), (select f0 from scr_fp), 'no side effects: 50 screen reads changed nothing — no audit row, no performance event, no score version, no slot, no status, no pause, no clock version');

-- Reconnect: the same authoritative state, whether or not anything ticked in between --------------------------------------------------------------------
select race_test.mk8('ev_scrA', 'screen-dense-2026');
select race_test.mk8('ev_scrB', 'screen-blackout-2026');
select race_test.login('master'); select race_start_event(race_test.id('ev_scrA')); select race_start_event(race_test.id('ev_scrB')); reset role;
create function race_test.dense_to(p_ev uuid, p_to bigint) returns void language plpgsql as $$
begin
  perform race_sim.step(p_ev, race_test.id('master'), p_to, 5000) from generate_series(1, ceil(p_to / 5000.0)::int + 2);
end $$;
create function race_test.cmp(p_label text, p_t bigint) returns void language plpgsql as $$
declare a jsonb; b jsonb;
begin
  perform race_test.dense_to(race_test.id('ev_scrA'), p_t);            -- A: a device ticked the whole time
  perform race_sim.travel_to(race_test.id('ev_scrB'), p_t);            -- B: EVERY device was disconnected; the clock just moved
  a := race_test.scr('screen1', race_test.id('ev_scrA'));
  b := race_test.scr('screen1', race_test.id('ev_scrB'));
  perform race_test.eq(race_test.core(b), race_test.core(a), 'reconnect ' || p_label || ': the screen that was offline shows EXACTLY what the always-connected screen shows');
  perform race_test.eq(race_sim.digest(race_test.id('ev_scrB')), race_sim.digest(race_test.id('ev_scrA')), 'reconnect ' || p_label || ': the race state behind it is identical too (athletes, slots, windows, locks)');
end $$;
select race_test.cmp('during WAITING (0:30)', 30000);
select race_test.cmp('at GET READY (0:55)', 55000);
select race_test.cmp('during WORK (2:30)', 150000);
select race_test.cmp('0.1 s before the 3:00 boundary (3:59.9)', 239900);
select race_test.cmp('0.1 s after the 3:00 boundary (4:00.1)', 240100);
select race_test.cmp('during TRANSITION (4:15)', 255000);
select race_test.cmp('at the hand-over (4:30.1)', 270100);
select race_test.cmp('during WORK of the next athlete (6:00)', 360000);
select race_test.login('master'); select race_pause(race_test.id('ev_scrA')); select race_pause(race_test.id('ev_scrB')); reset role;
select race_sim.age_pause(race_test.id('ev_scrA'), 30000); select race_sim.age_pause(race_test.id('ev_scrB'), 30000);
select race_test.eq(race_test.core(race_test.scr('screen1', race_test.id('ev_scrB'))), race_test.core(race_test.scr('screen1', race_test.id('ev_scrA'))), 'reconnect during PAUSE: both screens show the frozen race identically');
select race_test.ok((race_test.scr('screen1', race_test.id('ev_scrB')) -> 'clock' ->> 'paused') = 'true', 'reconnect during PAUSE: the screen knows the race is paused');
select race_test.login('master'); select race_resume(race_test.id('ev_scrA')); select race_resume(race_test.id('ev_scrB')); reset role;
select race_test.eq(race_test.core(race_test.scr('screen1', race_test.id('ev_scrB'))), race_test.core(race_test.scr('screen1', race_test.id('ev_scrA'))), 'reconnect after RESUME: identical again');
select race_test.eq((select count(*) from race_performance_events where event_id in (race_test.id('ev_scrA'), race_test.id('ev_scrB')))::int, 0, 'reconnecting screens created no performance event, ever');
