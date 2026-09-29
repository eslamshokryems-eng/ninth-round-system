-- 7. Heat-gap constraint tests (F-1: gap measured from the LAST athlete's START).
reset role;
select race_test.login('bm_a');

select race_test.throws($$update race_events set heat_gap_ms = 209999 where id = race_test.id('event_a')$$,
  'race_events_heat_gap_min', 'gap: heat gap shorter than one 3:30 interval is rejected');
select race_test.eq(race_test.affected($$update race_events set heat_gap_ms = 210000 where id = race_test.id('event_a')$$),
  1::bigint, 'gap: heat gap = 3:30 (minimum, keeps 0:30 changeover) is accepted');
select race_test.eq(race_test.affected($$update race_events set heat_gap_ms = 900000 where id = race_test.id('event_a')$$),
  1::bigint, 'gap: Event Manager can configure the gap per event (15:00)');
select race_test.eq(race_test.affected($$update race_events set heat_gap_ms = 600000 where id = race_test.id('event_a')$$),
  1::bigint, 'gap: back to default 10:00');
select race_test.ok((select count(*) = 3 from race_audit_log where action = 'race.events.update'
                       and target_id = race_test.id('event_a') and metadata -> 'changed_fields' ? 'heat_gap_ms'),
  'gap: every heat-gap change is audited (race.events.update)');

select race_test.eq(race_next_heat_anchor_ms(60000, 9, 210000, 600000), 2340000::bigint,
  'gap: full heat starting 0:01:00 → last start 0:29:00 → next heat 0:39:00');
select race_test.eq(race_next_heat_anchor_ms(60000, 9, 210000, 600000) - 600000 - 60000, 28 * 60000::bigint,
  'gap: last athlete of a full heat starts at heat start + 28:00');
select race_test.eq(race_next_heat_anchor_ms(0, 5, 210000, 600000), (4 * 210000 + 600000)::bigint,
  'gap: partial heat (5) → next heat = last start (+14:00) + 10:00');
select race_test.eq(race_next_heat_anchor_ms(0, 1, 210000, 600000), 600000::bigint,
  'gap: single-athlete heat → next heat 10:00 after its only start');
select race_test.throws($$select race_next_heat_anchor_ms(0, 9, 210000, 209999)$$, 'RACE_HEAT_GAP_TOO_SHORT',
  'gap: engine refuses a gap < interval');
select race_test.throws($$select * from race_plan_schedule(array[9, 9], p_gap_ms => 100000)$$, 'RACE_HEAT_GAP_TOO_SHORT',
  'gap: planner refuses a gap < interval');
select race_test.throws($$select race_next_heat_anchor_ms(0, 0, 210000, 600000)$$, 'at least one slot',
  'gap: a heat needs at least one slot');

-- Overflow capacity inside the gap (§2.6): (k+1)·I ≤ (N−1)·I + G.
select race_test.eq(race_overflow_capacity(210000, 600000), 1, 'gap: 10:00 gap fits exactly 1 late-athlete slot');
select race_test.eq(race_overflow_capacity(210000, 210000), 0, 'gap: minimum gap fits 0 overflow slots');
select race_test.eq(race_overflow_capacity(210000, 900000), 3, 'gap: 15:00 gap fits 3 overflow slots');
select race_test.ok((select
    -- overflow slot 9 (the 10th) finishes S01 3:30 before heat 2 arrives at S01 …
    (race_next_heat_anchor_ms(0, 9, 210000, 600000) - (9 * 210000 + 180000)) = 210000
    -- … a 2nd overflow slot would leave 0:00 changeover (forbidden: < 0:30).
    and (race_next_heat_anchor_ms(0, 9, 210000, 600000) - (10 * 210000 + 180000)) = 0),
  'gap: overflow slot keeps ≥ 0:30 changeover; a 2nd would collide (0:00)');

-- Heat-boundary changeover on every station = gap − work = 7:00.
select race_test.eq((select min(w2.work_start_ms - w1.work_end_ms)
                     from generate_series(1, 9) n,
                          race_station_window(28 * 60000, n) w1,               -- last athlete of heat 1 (anchor 0)
                          race_station_window(38 * 60000, n) w2),              -- first athlete of heat 2
                    420000::bigint, 'gap: changeover at a heat boundary = 7:00 on all 9 stations');

select race_test.eq((select heat_anchor_ms from race_plan_schedule(array[9, 9], p_gap_ms => 900000) where athlete_no = 10),
  (60000 + 28 * 60000 + 900000)::bigint, 'gap: custom 15:00 gap → heat 2 at 0:44:00');

-- Event schedule from live rosters (fixture: heat 1 = 9, heat 2 = 1).
select race_test.eq((select slot_start_ms from race_event_schedule(race_test.id('event_a')) where athlete_no = 10),
  2340000::bigint, 'gap: race_event_schedule() — heat 2 athlete starts 0:39:00');

-- Heat size and roster capacity.
select race_test.throws($$update race_events set heat_size = 10 where id = race_test.id('event_a')$$,
  'race_events_heat_size', 'heats: heat size above 9 rejected');
select race_test.throws($$update race_events set heat_size = 0 where id = race_test.id('event_a')$$,
  'race_events_heat_size', 'heats: heat size 0 rejected');
select race_test.throws($$update race_registrations set heat_id = race_test.id('heat1') where id = race_test.id('reg10')$$,
  'RACE_HEAT_FULL', 'heats: a 10th athlete cannot join a full 9-athlete heat');
reset role;
select race_test.throws($$update race_registrations set heat_id = race_test.id('heat1') where id = race_test.id('reg10')$$,
  'RACE_HEAT_FULL', 'heats: roster capacity also binds privileged writers (engine/RPC)');
select race_test.login('bm_a');
select race_test.eq(race_test.affected($$update race_events set heat_start_mode = 'MANUAL' where id = race_test.id('event_a')$$),
  1::bigint, 'heats: MANUAL next-heat start mode is configurable per event');
select race_test.eq(race_test.affected($$update race_events set heat_start_mode = 'AUTO' where id = race_test.id('event_a')$$),
  1::bigint, 'heats: back to AUTO');
reset role;
