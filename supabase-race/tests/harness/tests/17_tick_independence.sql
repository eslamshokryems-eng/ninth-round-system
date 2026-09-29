-- The authoritative race state does not depend on any browser, judge device or station screen ticking.
-- The 50-athlete scenario of 16_simulation.sql (dense: a tick every 5 s) is replayed here with NO ticks at all — Master Control,
-- every Judge and every Station Screen are "disconnected" for long stretches; the clock simply jumps from one operator action to
-- the next, and reconnecting devices only ask for the dashboard. The final state must be IDENTICAL, down to every slot, window,
-- lock time and status.
reset role;
select race_test.put('ev_s2', race_sim.scenario_50('simulation-blackout-2026', race_test.id('bm_a')));

-- BLACKOUT 1: nobody connected from race time 0:00 to 19:59. The first operator action is an emergency pause at 20:00.
select format('select race_sim.step_sparse(%L, %L, %s, %s)', race_test.id('ev_s2'), race_test.id('bm_a'), 1199000, 3600000) from generate_series(1, 60) \gexec
select race_test.ok(race_now_ms(race_test.id('ev_s2')) between 1199000 and 1200000 and (select coalesce(sum(ticks), 0) = 0 from race_sim.ticks where event_id = race_test.id('ev_s2')), 'blackout: 20 minutes of race time passed with no device connected at all — not one tick');
select race_test.ok((select count(*) = 0 from race_station_results where event_id = race_test.id('ev_s2')), 'blackout: nothing was materialised yet (no tick, no action) — the state exists only as arithmetic');

-- A device reconnects at 19:59.0 — just BEFORE the boundary where the first athlete leaves Station 06 (start 0:01:00 + 5×3:30 + 3:00 = 21:30 is later; 19:59 falls inside S06's work window for athlete 1)
select race_test.ok((select jsonb_array_length(race_sim.reconnect(race_test.id('ev_s2'), race_test.id('bm_a')) -> 'stations') = 9), 'reconnect: the dashboard answers with 9 stations');
select race_test.ok((select (s -> 'stations' -> 5 ->> 'state') = 'WORK' and (s -> 'stations' -> 5 -> 'athlete' ->> 'race_number') = 'N001'
                            and (s -> 'stations' -> 4 ->> 'state') = 'WORK' and (s -> 'stations' -> 4 -> 'athlete' ->> 'race_number') = 'N002'
                            and (s -> 'stations' -> 3 -> 'athlete' ->> 'race_number') = 'N003'
                     from (select race_sim.reconnect(race_test.id('ev_s2'), race_test.id('bm_a')) s) q),
  'reconnect: at 19:59 the screen correctly shows N001 on Station 06, N002 on Station 05, N003 on Station 04 — derived from START EVENT + planned slot times, with nobody having ticked');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_s2'), race_now_ms(race_test.id('ev_s2'))), 'reconnect: all timing invariants hold on the state that was just derived');

-- The rest of the event: only operator actions, and reconnections at awkward moments (0.5 s after a station boundary)
select format('select race_sim.step_sparse(%L, %L, %s, %s)', race_test.id('ev_s2'), race_test.id('bm_a'), 4020500, 777777) from generate_series(1, 60) \gexec
-- A device reconnects half a second after a station lock boundary and asks for the dashboard (which settles the race).
select race_test.ok(jsonb_typeof(race_sim.reconnect(race_test.id('ev_s2'), race_test.id('bm_a'))) = 'object', 'reconnect after a station boundary (0.5 s past a lock): the dashboard answers');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_s2'), race_now_ms(race_test.id('ev_s2'))), 'reconnect after a station boundary: every timing invariant holds on the settled state');
select format('select race_sim.step_sparse(%L, %L, %s, %s)', race_test.id('ev_s2'), race_test.id('bm_a'), 13000000, 1234567) from generate_series(1, 60) \gexec
-- Race time is now 3:36:40; the last device to touch the system was an operator action at 2:46:15. The first device to come back asks for the dashboard:
select race_test.ok(jsonb_typeof(race_sim.reconnect(race_test.id('ev_s2'), race_test.id('bm_a'))) = 'object', 'reconnect at the very end: the dashboard answers');
select race_test.ok((select status = 'FINISHED' from race_events where id = race_test.id('ev_s2')), 'the event is FINISHED — although no device ever ticked it, the first reconnecting device finds the correct, completed state');

-- THE proof: identical final state ---------------------------------------------------------------------------------------------------
select race_test.eq(race_sim.digest(race_test.id('ev_s2')), race_sim.digest(race_test.id('ev_s')),
  'IDENTICAL: the blackout run and the dense 5-second-tick run end in exactly the same state (athletes, slots, windows, lock times, statuses, heats, event)');
select race_test.ok((select array_agg(x order by x) from (select status::text || ':' || count(*) x from race_start_slots where event_id = race_test.id('ev_s2') group by status) q)
                    = (select array_agg(x order by x) from (select status::text || ':' || count(*) x from race_start_slots where event_id = race_test.id('ev_s') group by status) q), 'IDENTICAL: same slot outcomes (38 started / 1 skipped / 3 empty)');
select race_test.ok((select (after ->> 'status') = 'FINISHED' and (metadata ->> 'engine_race_ms')::bigint between 12120000 and 12130000 from race_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_test.id('ev_s2')::text),
  'IDENTICAL: official finish at 3:22:00 race time in the blackout run too');
-- Official time, not observation time: in the blackout run the engine "noticed" starts long after they happened — the record says when they officially happened.
select race_test.ok((select max((after ->> 'lag_ms')::bigint) > 100000 from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s2')::text)
                    and (select bool_and(sl.started_at = race_wall_at(sl.event_id, h.anchor_race_ms + sl.slot_index::bigint * 210000)) from race_start_slots sl join race_heats h on h.id = sl.heat_id where sl.event_id = race_test.id('ev_s2') and sl.status = 'STARTED'),
  'blackout: some starts were noticed minutes late (large lag_ms) yet every recorded start is its exact official instant');
select race_test.eq((select count(*) from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s2')::text)::int, 38, 'blackout: still exactly 38 athlete starts, each once');
select race_test.eq((select count(*) from race_audit_log where action = 'race.event.pause' and metadata ->> 'event_id' = race_test.id('ev_s2')::text)::int, 5, 'blackout: all five pause/resume cycles recorded');
select race_test.ok((select paused_total_ms between 495000 and 496500 from race_clock where event_id = race_test.id('ev_s2')), 'blackout: pause arithmetic identical (8:15 subtracted)');
