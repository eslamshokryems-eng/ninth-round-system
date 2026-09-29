-- Phase 6: START EVENT, authoritative clock, automatic starts, station windows, pause/resume, SKIP, DNF,
-- MANUAL heats, event finish. Time is driven with race_sim.travel_to (the engine itself is untouched).
reset role;
create function race_test.adv(p uuid) returns jsonb language sql as $$ select race_advance_core(p) $$;
create function race_test.paused_sum(p uuid) returns bigint language sql as $$
  select coalesce(sum(round(extract(epoch from (resumed_at - paused_at)) * 1000)), 0)::bigint from race_pauses where event_id = p and resumed_at is not null
$$;

-- Event E: one heat, 4 athletes (slots start 0:01:00, 0:04:30, 0:08:00, 0:11:30) ---------------------------------------------
select race_test.mkevent('ev_e', 'engine-2026', 4);
insert into race_heats (event_id, number) values (race_test.id('ev_e'), 1);
select race_test.put('e_h1', (select id from race_heats where event_id = race_test.id('ev_e')));
do $$ declare i int; begin for i in 1..4 loop perform race_move_athlete_heat(race_test.rid('ev_e' || i), race_test.id('e_h1')); end loop; end $$;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_e'), race_test.id('master'), 'MASTER_CONTROL');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_e'), race_test.id('judge1'), 'JUDGE', id from race_stations where event_id = race_test.id('ev_e') and number = 1;

-- START EVENT: refused until heats are locked, and to everyone but Master Control / Event Manager ------------------------------------
select race_test.login('master');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_HEATS_NOT_LOCKED', 'start: refused until the heats are locked');
select race_test.login('bm_a');
select race_lock_heats(race_test.id('ev_e'));
select race_test.login('rec');
do $$ declare i int; begin for i in 1..4 loop perform race_check_in(race_test.rid('ev_e' || i)); end loop; end $$;
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'start: reception cannot start the event');
select race_test.login('judge1');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'start: a judge cannot start the event');
select race_test.login('nobody');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'start: a stranger cannot');
select race_test.login('bm_b');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'start: another event''s manager cannot');
select race_test.anon();
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'permission denied', 'start: anon has no EXECUTE');
reset role;
select race_test.eq((select count(*) from race_clock where event_id = race_test.id('ev_e') and started_at is not null)::int, 0, 'start: none of the refused attempts started the clock');

-- Empty event cannot start; pause/advance before start are refused / no-ops -------------------------------------------------------------
select race_test.mkevent('ev_u', 'engine-unstarted-2026', 0);
insert into race_heats (event_id, number) values (race_test.id('ev_u'), 1);
select race_lock_heats(race_test.id('ev_u'));
select race_test.throws($$select * from race_start_event(race_test.id('ev_u'))$$, 'RACE_NO_ATHLETES', 'start: an event with no athletes cannot start');
select race_test.throws($$select * from race_pause(race_test.id('ev_u'))$$, 'RACE_NOT_STARTED', 'pause: cannot pause a race that has not started');
select race_test.throws($$select * from race_resume(race_test.id('ev_u'))$$, 'RACE_NOT_PAUSED', 'resume: nothing to resume');
reset role;
select race_test.ok((race_test.adv(race_test.id('ev_u')) ->> 'advanced')::boolean is false, 'advance: a race that has not started does nothing');

-- START EVENT ---------------------------------------------------------------------------------------------------------------------
select race_test.login('master');
select race_test.ok((select first_start_ms = 60000 and heats_anchored = 1 and abs(extract(epoch from started_at - clock_timestamp())) < 60
                     from race_start_event(race_test.id('ev_e'))), 'start: Master starts the event — first athlete 60 s later (pre-race countdown), server-stamped');
reset role;
select race_test.ok((select status = 'LIVE' from race_events where id = race_test.id('ev_e'))
                    and (select started_by = race_test.id('master') and version = 1 from race_clock where event_id = race_test.id('ev_e')),
  'start: event is LIVE; the clock records who started it');
select race_test.ok((select array_agg(anchor_race_ms) = array[60000]::bigint[] and array_agg(planned_slot_count) = array[4]::smallint[] from race_heats where event_id = race_test.id('ev_e'))
                    and (select count(*) = 4 from race_start_slots where event_id = race_test.id('ev_e')), 'start: the schedule is frozen (anchor 0:01:00, 4 slots)');
select race_test.login('master');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_ALREADY_STARTED', 'start: START EVENT works only ONCE');
select race_test.login('bm_a');
select race_test.throws($$update race_events set heat_gap_ms = 900000 where id = race_test.id('ev_e')$$, 'RACE_CONFIG_LOCKED', 'start: timing configuration is frozen from now on');
select race_test.login('master');
select race_test.ok((select (s -> 'clock' ->> 'started')::boolean and (s -> 'clock' ->> 'pre_race')::boolean and not (s -> 'clock' ->> 'paused')::boolean
                            and (s -> 'clock' ->> 'race_ms')::bigint between 0 and 5000
                            and (s -> 'next_athlete' ->> 'starts_in_ms')::bigint between 55000 and 60000
                            and (s -> 'next_athlete' ->> 'announce_in_ms')::bigint = (s -> 'next_athlete' ->> 'starts_in_ms')::bigint - 10000
                     from (select race_control_state(race_test.id('ev_e')) s) q),
  'countdown: PRE-RACE, ~0:59 to the first athlete, voice announcement 10 s before the start');
select race_test.ok((select s -> 'next_athlete' ->> 'race_number' = 'N001' from (select race_control_state(race_test.id('ev_e')) s) q), 'countdown: next athlete is the first to check in (N001)');
select race_test.login('rec');
select race_test.throws($$select race_control_state(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'control state: reception cannot open the Master dashboard data');
reset role;

-- Automatic starts and the exact station windows --------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_e'), 59000);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'athletes_started')::int, 0, 'auto start: at 0:59 nobody has started');
select race_sim.travel_to(race_test.id('ev_e'), 61000);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'athletes_started')::int, 1, 'auto start: at 1:01 the first athlete starts — nobody pressed anything');
select race_test.ok((select race_status = 'STARTED' from race_registrations where id = race_test.rid('ev_e1'))
                    and (select status = 'STARTED' and started_at is not null from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 0),
  'auto start: athlete is STARTED and the slot records the server time it was started');
select race_test.ok((select array_agg(st.number || ':' || sr.window_start_race_ms || '-' || sr.window_end_race_ms order by st.number)
                          = array['1:60000-240000', '2:270000-450000', '3:480000-660000', '4:690000-870000', '5:900000-1080000',
                                  '6:1110000-1290000', '7:1320000-1500000', '8:1530000-1710000', '9:1740000-1920000']
                     from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e1')),
  'windows: all 9 stations — 3:00 work each, 0:30 between, S09 ends at exactly 31:00 after the start (0:01:00 + 31:00 = 0:32:00)');
select race_test.ok((select array_agg(sr.status::text order by st.number) = array['ACTIVE', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED']
                     from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e1')),
  'windows: Station 01 is WORK the moment the athlete starts; the rest wait');
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'athletes_started')::int, 0, 'idempotent: a second tick starts nobody again');
select race_test.eq((select count(*) from admin_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_e')::text)::int, 1, 'audit: the athlete start is logged exactly once');
select race_test.ok((select ("after" ->> 'planned_start_ms')::bigint = 60000 and ("after" ->> 'lag_ms')::bigint between 0 and 1500
                     from admin_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_e')::text),
  'audit: records the planned start and how late the engine noticed (never affects the official time)');

-- The 3:00 lock has NO grace; 0:30 later the station hands over ------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_e'), 239900);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'performance_locked')::int, 0, 'lock: at 3:59.9 (0.1 s before the end of the 3:00 window) input is still open');
select race_sim.travel_to(race_test.id('ev_e'), 240100);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'performance_locked')::int, 1, 'lock: at 4:00.1 performance input is LOCKED — no grace period');
select race_test.eq((select status::text from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e1') and st.number = 1), 'SCORING',
  'lock: Station 01 is SCORING (only technique/OCR input remains for the 0:30 transition)');
select race_sim.travel_to(race_test.id('ev_e'), 269900);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'stations_locked')::int, 0, 'lock: still SCORING 0.1 s before the transition ends');
select race_sim.travel_to(race_test.id('ev_e'), 270100);
select race_test.ok((race_test.adv(race_test.id('ev_e')) ->> 'stations_locked')::int = 1, 'lock: Station 01 is LOCKED when the 0:30 transition ends');
select race_test.ok((select locked_at is not null from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e1') and st.number = 1),
  'lock: locked_at is the server time it happened');
select race_test.ok((select status = 'STARTED' from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 1)
                    and (select status = 'ACTIVE' from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e2') and st.number = 1)
                    and (select status = 'ACTIVE' from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid('ev_e1') and st.number = 2),
  'handover: the same instant Station 01 locks, athlete 2 starts there and athlete 1 moves to Station 02');
select race_test.eq((select b.window_start_race_ms - a.window_end_race_ms from race_station_results a join race_stations sa on sa.id = a.station_id and sa.number = 1
                       join race_station_results b on b.station_id = a.station_id and b.registration_id = race_test.rid('ev_e2') where a.registration_id = race_test.rid('ev_e1')),
                    30000::bigint, 'handover: exactly 0:30 between the two athletes at Station 01');
select race_test.ok((select pushup_style_locked_at is not null from race_registrations where id = race_test.rid('ev_e1'))
                    and (select pushup_style_locked_at is null from race_registrations where id = race_test.rid('ev_e2')),
  'push-up style: locked when the athlete''s Station 02 starts — athlete 1 locked, athlete 2 not yet');
select race_sim.travel_to(race_test.id('ev_e'), 271000);
select race_test.ok((select race_test.adv(race_test.id('ev_e')) is not null), 'tick');
select race_test.login('master');
select race_test.ok((select s -> 'stations' -> 0 ->> 'state' = 'WORK' and s -> 'stations' -> 0 -> 'athlete' ->> 'race_number' = 'N002'
                            and (s -> 'stations' -> 0 ->> 'remaining_ms')::bigint between 178000 and 180000
                            and s -> 'stations' -> 1 ->> 'state' = 'WORK' and s -> 'stations' -> 1 -> 'athlete' ->> 'race_number' = 'N001'
                            and s -> 'stations' -> 2 ->> 'state' = 'IDLE'
                            and jsonb_array_length(s -> 'skippable') = 1 and s -> 'skippable' -> 0 ->> 'race_number' = 'N002' and s -> 'skippable' -> 0 ->> 'status' = 'STARTED'
                     from (select race_control_state(race_test.id('ev_e')) s) q),
  'dashboard: at 4:31 Station 01 = N002 (WORK, ~2:59 left), Station 02 = N001 (WORK), Station 03 idle; only N002 is still skippable (N001 is past its Station 01 window)');
reset role;

-- Judges and screens may tick the engine; strangers may not ----------------------------------------------------------------------------
select race_test.login('judge1');
select race_test.ok((race_advance(race_test.id('ev_e')) ->> 'advanced')::boolean, 'advance: a judge''s device can tick the engine');
select race_test.login('nobody');
select race_test.throws($$select race_advance(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'advance: a stranger cannot');
select race_test.anon();
select race_test.throws($$select race_advance(race_test.id('ev_e'))$$, 'permission denied', 'advance: anon has no EXECUTE');
reset role;
select race_test.ok(not exists (select 1 from unnest(array['race_advance_core(uuid)', 'race_advance_all()']) f cross join unnest(array['anon', 'authenticated']) r
                                where has_function_privilege(r, f, 'EXECUTE')), 'advance: the internal engine entry points are not API surface');

-- PAUSE / RESUME ----------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_e'), 300000);
select race_test.login('rec');
select race_test.throws($$select * from race_pause(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'pause: reception cannot');
select race_test.login('judge1');
select race_test.throws($$select * from race_pause(race_test.id('ev_e'))$$, 'RACE_FORBIDDEN', 'pause: a judge cannot');
select race_test.login('master');
select race_test.ok((select paused_race_ms between 300000 and 300100 from race_pause(race_test.id('ev_e'), 'medical')), 'pause: EMERGENCY PAUSE at 5:00 freezes race time');
select race_test.throws($$select * from race_pause(race_test.id('ev_e'))$$, 'RACE_ALREADY_PAUSED', 'pause: cannot pause twice');
reset role;
do $$ declare a bigint; b bigint; begin
  a := race_now_ms(race_test.id('ev_e')); perform pg_sleep(0.35); b := race_now_ms(race_test.id('ev_e'));
  perform race_test.eq(a, b, 'pause: race time does not advance while paused (sampled 350 ms apart)');
end $$;
select race_test.ok((race_test.adv(race_test.id('ev_e')) ->> 'paused')::boolean and (race_test.adv(race_test.id('ev_e')) ->> 'athletes_started')::int = 0, 'pause: the engine does nothing new while paused');
select race_test.login('master');
select race_test.ok((select (s -> 'clock' ->> 'paused')::boolean and (s -> 'clock' ->> 'race_ms')::bigint between 300000 and 300100 from (select race_control_state(race_test.id('ev_e')) s) q),
  'pause: the dashboard reports PAUSED at the frozen race time');
reset role;
select race_sim.age_pause(race_test.id('ev_e'), 120000);   -- the pause lasts 2:00 of wall time
select race_test.login('master');
select race_test.ok((select paused_ms between 120000 and 123000 and race_ms between 300000 and 303000 from race_resume(race_test.id('ev_e'))),
  'resume: after a 2:00 pause race time continues from 5:00 — the 2:00 is not counted');
select race_test.throws($$select * from race_resume(race_test.id('ev_e'))$$, 'RACE_NOT_PAUSED', 'resume: cannot resume twice');
reset role;
select race_test.ok((select paused_by = race_test.id('master') and resumed_by = race_test.id('master') and reason = 'medical'
                            and paused_at = date_trunc('milliseconds', paused_at) and resumed_at = date_trunc('milliseconds', resumed_at)
                     from race_pauses where event_id = race_test.id('ev_e')), 'pause: who, why, and both instants are whole milliseconds');
select race_test.eq((select paused_total_ms from race_clock where event_id = race_test.id('ev_e')), race_test.paused_sum(race_test.id('ev_e')), 'pause: paused_total_ms is exactly the sum of the pauses');
select race_test.eq(race_ms_from_clock(c.started_at, null, c.paused_total_ms, p.resumed_at), p.paused_race_ms, 'pause: race time right after resume EQUALS race time at the pause — to the millisecond')
  from race_clock c, race_pauses p where c.event_id = race_test.id('ev_e') and p.event_id = c.event_id;
select race_test.eq((select version from race_clock where event_id = race_test.id('ev_e')), 3::bigint, 'pause: the clock version bumped on start, pause and resume (clients re-sync on it)');

-- 25 rapid pause/resume cycles: no drift, ever ---------------------------------------------------------------------------------------
do $$
declare
  i int; c public.race_clock; pr public.race_pauses; last_ms bigint := 0; cur bigint; drift int := 0;
begin
  perform set_config('request.jwt.claim.sub', race_test.id('master')::text, true);
  for i in 1..25 loop
    perform race_pause(race_test.id('ev_e'), 'cycle ' || i);
    perform pg_sleep(random() * 0.012);
    perform race_resume(race_test.id('ev_e'));
    select * into c from race_clock where event_id = race_test.id('ev_e');
    select * into pr from race_pauses where event_id = race_test.id('ev_e') order by paused_at desc limit 1;
    if race_ms_from_clock(c.started_at, null, c.paused_total_ms, pr.resumed_at) is distinct from pr.paused_race_ms then drift := drift + 1; end if;
    cur := race_now_ms(race_test.id('ev_e'));
    if cur < last_ms then drift := drift + 1000; end if;
    last_ms := cur;
  end loop;
  perform race_test.eq(drift, 0, 'pause: 25 rapid pause/resume cycles — zero drift, race time never went backwards');
end $$;
select race_test.eq((select paused_total_ms from race_clock where event_id = race_test.id('ev_e')), race_test.paused_sum(race_test.id('ev_e')), 'pause: after 26 pauses paused_total_ms is still exactly their sum');
select race_test.eq((select count(*) from race_pauses where event_id = race_test.id('ev_e') and resumed_at is null)::int, 0, 'pause: no pause left open');
select race_test.ok((select count(*) = 26 from admin_audit_log where action = 'race.event.pause' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) = 26 from admin_audit_log where action = 'race.event.resume' and metadata ->> 'event_id' = race_test.id('ev_e')::text),
  'audit: every pause and every resume is logged');

-- SKIP ATHLETE -------------------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_e'), 470000);
select race_test.adv(race_test.id('ev_e'));
select race_test.ok((select status = 'BOUND' from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 2), 'skip setup: at 7:50 slot 3 (start 8:00) is bound to athlete 3');
select race_test.put('e_slot2', (select id from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 2));
select race_test.put('e_slot3', (select id from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 3));
select race_test.login('rec');
select race_test.throws($$select * from race_skip_athlete(race_test.id('e_slot2'), 'not ready')$$, 'RACE_FORBIDDEN', 'skip: reception cannot');
select race_test.login('master');
select race_test.throws($$select * from race_skip_athlete(race_test.id('e_slot2'), '  ')$$, 'RACE_REASON_REQUIRED', 'skip: a reason is required');
select race_test.throws($$select * from race_skip_athlete(race_test.id('e_slot3'), 'x')$$, 'RACE_SLOT_NOT_ASSIGNED', 'skip: a slot with nobody in it cannot be skipped');
select race_test.ok((select heat_number = 1 and slot_index = 2 and race_number is not null from race_skip_athlete(race_test.id('e_slot2'), 'Athlete not at the start line')),
  'skip: Master skips athlete 3 — the slot stays EMPTY');
select race_test.throws($$select * from race_skip_athlete(race_test.id('e_slot2'), 'again')$$, 'RACE_SLOT_NOT_ASSIGNED', 'skip: cannot skip a slot twice');
reset role;
select race_test.ok((select status = 'SKIPPED' and skipped_by = race_test.id('master') and skip_reason = 'Athlete not at the start line' and skipped_at is not null
                     from race_start_slots where id = race_test.id('e_slot2'))
                    and (select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_e3')),
  'skip: slot SKIPPED with who/why/when; the athlete is MISSED_START');
select race_test.ok((select array_agg(slot_index::int order by slot_index) = array[0, 1, 2, 3] and array_agg(status::text order by slot_index) = array['STARTED', 'STARTED', 'SKIPPED', 'OPEN']
                     from race_start_slots where heat_id = race_test.id('e_h1')), 'skip: nobody was moved forward — the skipped slot is not reused, later slots keep their index');
select race_sim.travel_to(race_test.id('ev_e'), 490000);
select race_test.adv(race_test.id('ev_e'));
select race_test.eq((select count(*) from race_station_results where registration_id = race_test.rid('ev_e3'))::int, 0, 'skip: the skipped athlete never gets station results — the global clock just kept running');
select race_sim.travel_to(race_test.id('ev_e'), 691000);
select race_test.adv(race_test.id('ev_e'));
select race_test.ok((select b.window_start_race_ms = 690000 and b.window_end_race_ms = 870000
                     from race_station_results b join race_stations st on st.id = b.station_id and st.number = 1 where b.registration_id = race_test.rid('ev_e4')),
  'skip: athlete 4 started at EXACTLY their planned time (0:11:30) — the skip changed nobody''s start time');
select race_test.login('master');
select race_test.throws($$select * from race_skip_athlete((select id from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 1), 'late')$$, 'RACE_SKIP_WINDOW_CLOSED',
  'skip: too late — athlete 2 is past their Station 01 window');
select race_test.put('e_slot3b', (select id from race_start_slots where heat_id = race_test.id('e_h1') and slot_index = 3));
select race_test.ok((select slot_index = 3 from race_skip_athlete(race_test.id('e_slot3b'), 'Injured at the start line')), 'skip: an athlete who already started can still be skipped inside their Station 01 window');
reset role;
select race_test.ok((select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_e4'))
                    and (select count(*) = 9 and bool_and(status = 'VOID_DNS') from race_station_results where registration_id = race_test.rid('ev_e4')),
  'skip: a started-then-skipped athlete keeps their rows but every station result is VOID_DNS (history kept, not ranked)');
select race_test.ok((select count(*) = 2 from admin_audit_log where action = 'race.athlete.skip' and metadata ->> 'event_id' = race_test.id('ev_e')::text and metadata ->> 'reason' is not null),
  'audit: every skip is logged with its reason');

-- DNF -----------------------------------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select race_mark_dnf(race_test.rid('ev_e2'), 'left')$$, 'RACE_FORBIDDEN', 'dnf: reception cannot');
select race_test.login('master');
select race_test.throws($$select race_mark_dnf(race_test.rid('ev_e2'), '')$$, 'RACE_REASON_REQUIRED', 'dnf: a reason is required');
select race_test.throws($$select race_mark_dnf(race_test.rid('ev_e3'), 'x')$$, 'RACE_NOT_RACING', 'dnf: only an athlete who is racing');
select race_mark_dnf(race_test.rid('ev_e2'), 'Athlete withdrew mid-race');
reset role;
select race_test.ok((select race_status = 'DNF' from race_registrations where id = race_test.rid('ev_e2'))
                    and (select count(*) filter (where status = 'VOID_DNS') = 6 and count(*) filter (where status <> 'VOID_DNS') = 3 from race_station_results where registration_id = race_test.rid('ev_e2')),
  'dnf: athlete 2 is DNF; the 6 stations not yet reached are voided, the 3 they reached keep their results');
select race_test.ok(exists (select 1 from admin_audit_log where action = 'race.athlete.dnf' and metadata ->> 'reason' = 'Athlete withdrew mid-race'), 'audit: DNF logged');

-- Finish: athlete 1 completes Station 09 at 0:32:00; the heat and the event finish with them ----------------------------------------------------
select race_sim.travel_to(race_test.id('ev_e'), 1919900);
select race_test.eq((race_test.adv(race_test.id('ev_e')) ->> 'athletes_finished')::int, 0, 'finish: at 31:59.9 athlete 1 is still on Station 09');
select race_sim.travel_to(race_test.id('ev_e'), 1920100);
select race_test.ok((race_test.adv(race_test.id('ev_e')) ->> 'athletes_finished')::int = 1, 'finish: at 32:00.1 (start 1:00 + 31:00) athlete 1 FINISHES');
select race_test.ok((select race_status = 'FINISHED' from race_registrations where id = race_test.rid('ev_e1'))
                    and (select race_status = 'DNF' from race_registrations where id = race_test.rid('ev_e2')), 'finish: FINISHED and DNF are distinct outcomes');
select race_test.ok((select status = 'LIVE' from race_events where id = race_test.id('ev_e')), 'finish: the event is NOT finished while the last 0:30 scoring window is still open');
select race_sim.travel_to(race_test.id('ev_e'), 1951000);
select race_test.ok((race_test.adv(race_test.id('ev_e')) ->> 'event_finished')::boolean or (select status = 'FINISHED' from race_events where id = race_test.id('ev_e')),
  'finish: once every station is locked and nobody is left, the event FINISHES');
select race_test.ok((select status = 'FINISHED' from race_events where id = race_test.id('ev_e'))
                    and (select finished_at is not null from race_clock where event_id = race_test.id('ev_e'))
                    and (select status = 'FINISHED' from race_heats where id = race_test.id('e_h1')), 'finish: event, clock and heat are all FINISHED');
select race_test.ok((select bool_and(status in ('LOCKED', 'VOID_DNS')) from race_station_results where event_id = race_test.id('ev_e')), 'finish: every station result is LOCKED (or void) — nothing is left open');
select race_test.login('master');
select race_test.throws($$select * from race_pause(race_test.id('ev_e'))$$, 'RACE_EVENT_FINISHED', 'finish: a finished race cannot be paused');
select race_test.throws($$select * from race_start_event(race_test.id('ev_e'))$$, 'RACE_ALREADY_STARTED', 'finish: and cannot be started again');
reset role;
select race_test.ok((race_test.adv(race_test.id('ev_e')) ->> 'advanced')::boolean is false, 'finish: the engine is inert after the finish');
select race_test.ok((select count(*) >= 1 from admin_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.heat.finish' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.athlete.finish' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.station.lock' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.station.performance_locked' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.station.start' and metadata ->> 'event_id' = race_test.id('ev_e')::text)
                    and (select count(*) >= 1 from admin_audit_log where action = 'race.event.start' and metadata ->> 'event_id' = race_test.id('ev_e')::text),
  'audit: the race can be reconstructed — start, stations, locks, finishes and event finish are all logged');

-- MANUAL heats: START NEXT HEAT ---------------------------------------------------------------------------------------------------------
select race_test.mkevent('ev_mh', 'engine-manual-2026', 5);
insert into race_heats (event_id, number) select race_test.id('ev_mh'), n from generate_series(1, 3) n;
do $$ declare i int; h int[] := array[1, 1, 2, 2, 3]; begin
  for i in 1..5 loop perform race_move_athlete_heat(race_test.rid('ev_mh' || i), (select id from race_heats where event_id = race_test.id('ev_mh') and number = h[i])); end loop;
end $$;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_mh'), race_test.id('master'), 'MASTER_CONTROL');
select race_lock_heats(race_test.id('ev_mh'));
select race_test.login('rec');
do $$ declare i int; begin for i in 1..5 loop perform race_check_in(race_test.rid('ev_mh' || i)); end loop; end $$;
reset role;
update race_heats set start_mode = 'MANUAL' where event_id = race_test.id('ev_mh') and number in (2, 3);
select race_test.login('master');
select race_test.ok((select heats_anchored = 1 from race_start_event(race_test.id('ev_mh'))), 'manual: START EVENT anchors only heat 1 — heats 2 and 3 wait for an explicit start');
select race_test.ok((select array_agg(h ->> 'status' order by (h ->> 'number')::int) = array['LOCKED', 'AWAITING_START', 'AWAITING_START']
                     from (select jsonb_array_elements(race_control_state(race_test.id('ev_mh')) -> 'heats') h) q), 'manual: dashboard shows heats 2 and 3 AWAITING START');
select race_test.login('rec');
select race_test.throws($$select * from race_start_next_heat(race_test.id('ev_mh'), 2)$$, 'RACE_FORBIDDEN', 'manual: reception cannot start a heat');
select race_test.login('master');
select race_test.throws($$select * from race_start_next_heat(race_test.id('ev_mh'), 3)$$, 'RACE_PREVIOUS_HEAT_NOT_STARTED', 'manual: heats must be started in order');
select race_test.throws($$select * from race_start_next_heat(race_test.id('ev_mh'), 1)$$, 'RACE_HEAT_ALREADY_STARTED', 'manual: heat 1 is already running');
reset role;
select race_sim.travel_to(race_test.id('ev_mh'), 600000);
select race_test.login('master');
select race_test.ok((select anchor_race_ms between 660000 and 662000 from race_start_next_heat(race_test.id('ev_mh'), 2)),
  'manual: START NEXT HEAT at 10:00 anchors heat 2 at now + 60 s (≥ one interval after heat 1''s last slot at 8:00)');
reset role;
select race_test.ok((select status = 'LOCKED' from race_heats where event_id = race_test.id('ev_mh') and number = 2)
                    and (select count(*) = 4 from race_start_slots where event_id = race_test.id('ev_mh')), 'manual: heat 2 leaves AWAITING_START and gets its slots');
select race_test.login('master');
select race_test.ok((select anchor_race_ms >= (select anchor_race_ms from race_heats where event_id = race_test.id('ev_mh') and number = 2) + 2 * 210000
                     from race_start_next_heat(race_test.id('ev_mh'), 3)), 'manual: heat 3 can start no earlier than one interval after heat 2''s last slot');
select race_test.throws($$select * from race_start_next_heat(race_test.id('ev_mh'), 3)$$, 'RACE_HEAT_ALREADY_STARTED', 'manual: a heat starts once');
select race_test.ok((select jsonb_array_length(race_control_state(race_test.id('ev_mh')) -> 'heats') = 3), 'manual: dashboard lists all 3 heats');
reset role;
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_mh'), race_now_ms(race_test.id('ev_mh'))), 'manual: timing invariants hold across the manually started heats');
select race_test.ok(exists (select 1 from admin_audit_log where action = 'race.heat.start_next' and metadata ->> 'event_id' = race_test.id('ev_mh')::text), 'audit: START NEXT HEAT is logged');
