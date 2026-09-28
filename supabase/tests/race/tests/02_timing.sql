-- 6. Timing constraint tests (+ server-authoritative time).
reset role;

-- D-1: 3:00 / 0:30 / 3:30 are locked by constraints, even for the DB owner.
select race_test.throws($$update race_events set work_ms = 170000, start_interval_ms = 200000 where id = race_test.id('event_a')$$,
  'race_events_work_locked', 'timing: work period is locked at 3:00');
select race_test.throws($$update race_events set transition_ms = 45000, start_interval_ms = 225000 where id = race_test.id('event_a')$$,
  'race_events_work_locked', 'timing: transition is locked at 0:30');
select race_test.throws($$update race_events set start_interval_ms = 180000 where id = race_test.id('event_a')$$,
  'race_events_interval_is_work_plus_transition', 'timing: start interval must equal work + transition (3:30)');
select race_test.throws($$update race_events set station_count = 8 where id = race_test.id('event_a')$$,
  'race_events_nine_stations', 'timing: exactly 9 stations');
select race_test.throws($$update race_events set announce_lead_ms = 70000 where id = race_test.id('event_a')$$,
  'race_events_lead_order', 'timing: voice lead cannot exceed binding lead');
select race_test.throws($$update race_events set bind_lead_ms = 90000 where id = race_test.id('event_a')$$,
  'race_events_lead_order', 'timing: binding lead cannot exceed the 60 s pre-race countdown');
select race_test.throws($$update race_events set announce_lead_ms = 0 where id = race_test.id('event_a')$$,
  'race_events_lead_order', 'timing: voice lead must be positive');

-- F-7 defaults on a freshly created event.
select race_test.ok((select work_ms = 180000 and transition_ms = 30000 and start_interval_ms = 210000
                            and heat_gap_ms = 600000 and first_start_offset_ms = 60000 and bind_lead_ms = 60000
                            and announce_lead_ms = 10000 and checkin_deadline_before_heat_ms = 900000
                            and heat_size = 9 and heat_start_mode = 'AUTO'
                     from race_events where id = race_test.id('event_b')),
  'timing: new event defaults = 3:00 / 0:30 / 3:30 / gap 10:00 / countdown 60 s / bind 60 s / voice 10 s / check-in −15:00');

-- Station windows (§2.4) for one athlete starting at race 0:01:00.
select race_test.ok((select work_start_ms = 60000 and work_end_ms = 240000 and scoring_end_ms = 270000
                     from race_station_window(60000, 1)), 'timing: S01 = 0:01:00–0:04:00, transition to 0:04:30');
select race_test.ok((select work_start_ms = 60000 + 8 * 210000 and work_end_ms = 60000 + 31 * 60000
                     from race_station_window(60000, 9)), 'timing: S09 starts +28:00 and ends exactly +31:00');
select race_test.ok((select bool_and(w.work_end_ms - w.work_start_ms = 180000)
                     from generate_series(1, 9) n, race_station_window(0, n) w), 'timing: every station window is exactly 3:00');
select race_test.ok((select bool_and(nxt.work_start_ms - cur.work_end_ms = 30000)
                     from generate_series(1, 8) n, race_station_window(0, n) cur, race_station_window(0, n + 1) nxt),
  'timing: every transition is exactly 0:30 (8 transitions, none after S09)');
select race_test.throws($$select * from race_station_window(0, 10)$$, 'station must be 1..9', 'timing: station 10 rejected');

-- 50-athlete event: SQL engine == JS validator, to the millisecond, all 11 columns.
select race_test.eq((select count(*) from race_test.js_schedule)::int, 50, 'timing: JS twin schedule loaded (50 athletes)');
select race_test.eq((select count(*) from (
    select * from race_plan_schedule(array[9, 9, 9, 9, 9, 5])
    except select athlete_no, heat_number, slot_index, slot_start_ms, bind_at_ms, announce_at_ms, s09_start_ms,
                  finish_ms, heat_anchor_ms, heat_last_start_ms, next_heat_anchor_ms from race_test.js_schedule) d)::int,
  0, 'timing: SQL race_plan_schedule() matches docs/race/scripts/timing-validation.mjs row-for-row (50 × 11 values)');

select race_test.ok((select bool_and(finish_ms - slot_start_ms = 31 * 60000) from race_plan_schedule(array[9, 9, 9, 9, 9, 5])),
  'timing: all 50 athletes race exactly 31:00');
select race_test.eq((select max(finish_ms) from race_plan_schedule(array[9, 9, 9, 9, 9, 5])),
  (3 * 3600 + 56 * 60) * 1000::bigint, 'timing: full event finish = 3:56:00 race time');
select race_test.eq((select array_agg(distinct heat_anchor_ms order by heat_anchor_ms) from race_plan_schedule(array[9, 9, 9, 9, 9, 5])),
  array[60000, 2340000, 4620000, 6900000, 9180000, 11460000]::bigint[],
  'timing: heat starts 0:01:00, 0:39:00, 1:17:00, 1:55:00, 2:33:00, 3:11:00');
select race_test.ok((select bool_and(slot_start_ms - lag = 210000) from (
    select slot_start_ms, lag(slot_start_ms) over (partition by heat_number order by slot_index) lag
    from race_plan_schedule(array[9, 9, 9, 9, 9, 5])) s where lag is not null),
  'timing: consecutive starts inside a heat are exactly 3:30 apart');
select race_test.ok((select bool_and(announce_at_ms = slot_start_ms - 10000 and bind_at_ms = slot_start_ms - 60000 and bind_at_ms >= 0)
                     from race_plan_schedule(array[9, 9, 9, 9, 9, 5])),
  'timing: voice at −0:10, binding at −1:00, first binding exactly at START EVENT');

-- No two athletes ever share a station; minimum changeover ≥ 0:30 on all 9 stations.
select race_test.eq((select min(ws - prev_we) from (
    select w.work_start_ms ws, lag(w.work_end_ms) over (partition by n order by w.work_start_ms) prev_we
    from race_plan_schedule(array[9, 9, 9, 9, 9, 5]) p, generate_series(1, 9) n, race_station_window(p.slot_start_ms, n) w) x),
  30000::bigint, 'timing: 450 station windows, zero overlaps, minimum changeover exactly 0:30');
select race_test.eq((select max(c) from (
    select count(*) over (order by t range between current row and current row) c
    from (select p1.slot_start_ms t from race_plan_schedule(array[9, 9, 9, 9, 9, 5]) p1) ts
    join race_plan_schedule(array[9, 9, 9, 9, 9, 5]) p on p.slot_start_ms <= ts.t and ts.t < p.finish_ms) z)::int,
  9, 'timing: peak athletes on course = 9 (heats overlap on course, never on a station)');

-- Race clock (§2.2): pure function.
select race_test.eq(race_ms_from_clock('2026-11-20 09:00:00+02', null, 0, '2026-11-20 09:10:00+02'), 600000::bigint,
  'clock: 10:00 after START EVENT = 600000 ms');
select race_test.eq(race_ms_from_clock('2026-11-20 09:00:00+02', '2026-11-20 09:05:00+02', 0, '2026-11-20 09:10:00+02'), 300000::bigint,
  'clock: while paused the race clock is frozen at the pause instant');
select race_test.eq(race_ms_from_clock('2026-11-20 09:00:00+02', null, 120000, '2026-11-20 09:10:00+02'), 480000::bigint,
  'clock: completed pauses are subtracted (2:00 pause → 8:00 race time)');
select race_test.ok(race_ms_from_clock('2026-11-20 09:00:00+02', null, 0, '2026-11-20 08:59:00+02') is null
                    and race_ms_from_clock(null, null, 0, now()) is null, 'clock: no race time before START EVENT');

-- Live clock from the server (clock_timestamp()), never from a client.
update race_clock set started_at = clock_timestamp() - interval '5 seconds' where event_id = race_test.id('event_b');
select race_test.ok(race_now_ms(race_test.id('event_b')) between 5000 and 6000, 'clock: race_now_ms() reads the server clock (≈5 s after start)');
update race_clock set paused_at = clock_timestamp() - interval '2 seconds' where event_id = race_test.id('event_b');
do $$
declare a bigint; b bigint;
begin
  a := race_now_ms(race_test.id('event_b'));
  perform pg_sleep(0.3);
  b := race_now_ms(race_test.id('event_b'));
  perform race_test.eq(a, b, 'clock: paused race time does not advance (sampled 300 ms apart)');
end $$;

select race_test.login('bm_b');
select race_test.ok((select is_started and is_paused and race_ms between 2900 and 4000
                     from race_server_time(race_test.id('event_b'))), 'clock: race_server_time() for staff (started, paused, frozen)');

-- Config freezes once the clock has started — for the event manager too.
select race_test.throws($$update race_events set heat_gap_ms = 900000 where id = race_test.id('event_b')$$,
  'RACE_CONFIG_LOCKED', 'lock: heat gap cannot change after START EVENT');
select race_test.throws($$update race_station_rules set equipment = '{"load_kg": 25}'
                          where event_id = race_test.id('event_b') and scoring_type = 'REPS'$$,
  'RACE_CONFIG_LOCKED', 'lock: station rules cannot change after START EVENT');
select race_test.throws($$insert into race_heats (event_id, number) values (race_test.id('event_b'), 1)$$,
  'RACE_EVENT_STARTED', 'lock: heats cannot be created after START EVENT');
select race_test.eq(race_test.affected($$update race_events set venue = 'Hall B' where id = race_test.id('event_b')$$),
  1::bigint, 'lock: non-timing fields (venue) stay editable after start');

reset role;
update race_clock set started_at = null, paused_at = null where event_id = race_test.id('event_b');
