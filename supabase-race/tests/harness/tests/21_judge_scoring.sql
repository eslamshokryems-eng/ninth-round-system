-- The real Judge RPC: race_record_action / race_review_action / race_station_view. Idempotency, exact windows (no grace), rejected-but-kept
-- actions, offline replay → Master review, VOID, derived scores (reps, converted reps, laps + penalty rule F-4, Masters hold with break limit),
-- permissions, audit. Time is driven with race_sim.travel_to; the engine and the RPC are the production ones.
reset role;
create function race_test.res(p_reg text, p_station int) returns uuid language sql stable as $$
  select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = race_test.rid(p_reg) and st.number = p_station
$$;
create function race_test.act(p_res uuid, p_type text, p_val numeric default null)
returns table (performance_event_id uuid, status race_action_status, rejection_code text, server_race_ms bigint, duplicate boolean, tally jsonb) language sql as $$
  select * from race_record_action(p_res, p_type::race_action_type, gen_random_uuid(), p_val)
$$;
grant execute on function race_test.act(uuid, text, numeric) to authenticated;
create function race_test.score(p_res uuid) returns numeric language sql stable as $$ select official_score from race_station_results where id = p_res $$;
create function race_test.nrows(p_res uuid) returns int language sql stable as $$ select count(*)::int from race_performance_events where station_result_id = p_res $$;

select race_test.mkevent('ev_j', 'judge-2026', 5);
insert into race_heats (event_id, number) values (race_test.id('ev_j'), 1);
do $$ declare i int; begin for i in 1..5 loop perform race_move_athlete_heat(race_test.rid('ev_j' || i), (select id from race_heats where event_id = race_test.id('ev_j'))); end loop; end $$;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_j'), race_test.id('master'), 'MASTER_CONTROL');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_j'), race_test.id(k), 'JUDGE', (select id from race_stations where event_id = race_test.id('ev_j') and number = n)
  from (values ('judge1', 1), ('judge4', 4)) v(k, n);
reset role;
update race_registrations set pushup_style = 'KNEE' where id = race_test.rid('ev_j1');
update race_registrations set category_id = (select id from race_categories where event_id = race_test.id('ev_j') and code = 'MASTERS') where id = race_test.rid('ev_j2');
select race_test.login('bm_a');
select race_lock_heats(race_test.id('ev_j'));
select race_test.login('rec');
do $$ declare i int; begin for i in 1..5 loop perform race_check_in(race_test.rid('ev_j' || i)); end loop; end $$;
select race_test.login('master');
select race_start_event(race_test.id('ev_j'));
reset role;
select race_sim.travel_to(race_test.id('ev_j'), 61000);
select race_advance_core(race_test.id('ev_j'));
select race_test.put('j_r1s1', race_test.res('ev_j1', 1));
select race_test.put('j_r1s2', race_test.res('ev_j1', 2));

-- Who may score ------------------------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'judge rpc: Reception cannot score');
select race_test.login('judge4');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'judge rpc: the judge of ANOTHER station cannot score this one');
select race_test.login('nobody');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'judge rpc: a stranger cannot');
select race_test.login('bm_b');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'judge rpc: another event''s manager cannot');
select race_test.anon();
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())$$, 'permission denied', 'judge rpc: anon has no EXECUTE');
select race_test.login('judge1');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', null)$$, 'RACE_CLIENT_EVENT_REQUIRED', 'judge rpc: an action without a client id is refused');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'OCR_CAPTURE', gen_random_uuid())$$, 'RACE_ACTION_NOT_SUPPORTED', 'judge rpc: OCR has its own flow');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), 0)$$, 'RACE_INVALID_VALUE', 'judge rpc: a zero/negative value is refused');
select race_test.throws($$select * from race_record_action(gen_random_uuid(), 'REP', gen_random_uuid())$$, 'RACE_NOT_FOUND', 'judge rpc: unknown result');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), null, 'OFFLINE_QUEUE')$$, 'RACE_OFFLINE_METADATA_REQUIRED', 'judge rpc: a replayed action must carry its device time and sequence');
reset role;

-- Not started yet: Station 02 of athlete 1 is SCHEDULED -----------------------------------------------------------------------------------
select race_test.login('master');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'NOT_STARTED' from race_record_action(race_test.id('j_r1s2'), 'REP', gen_random_uuid())),
  'window: before the station window opens the action is REJECTED (NOT_STARTED) — and kept');
select race_test.eq((select count(*) from race_performance_events where station_result_id = race_test.id('j_r1s2') and rejection_code = 'NOT_STARTED')::int, 1, 'window: the rejected action is in the ledger, never dropped');
select race_test.eq(race_test.score(race_test.id('j_r1s2')), 0::numeric, 'window: … and scores nothing');

-- Accepted actions, server time, derived score ------------------------------------------------------------------------------------------------
select race_test.login('judge1');
create temp table j_ids (n int, id uuid, ev uuid);
do $$ declare i int; c uuid; x record; begin
  for i in 1..5 loop
    c := gen_random_uuid();
    select * into x from race_record_action(race_test.id('j_r1s1'), 'REP', c);
    insert into j_ids values (i, c, x.performance_event_id);
  end loop;
end $$;
reset role;
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 5::numeric, 'score: 5 accepted REPs → derived score 5 (nobody types a score)');
select race_test.ok((select bool_and(status = 'ACCEPTED' and judge_profile_id = race_test.id('judge1') and server_race_ms between 61000 and 65000 and server_received_at is not null)
                     from race_performance_events where station_result_id = race_test.id('j_r1s1')), 'server time: every action carries the SERVER race time and the real judge');
select race_test.ok((select (derived ->> 'reps')::int = 5 and derived ->> 'scoring_type' = 'REPS' from race_station_results where id = race_test.id('j_r1s1')), 'score: the tally is stored as derived data on the result');

-- Idempotency ------------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge1');
select race_test.ok((select duplicate and performance_event_id = (select ev from j_ids where n = 3) and status = 'ACCEPTED'
                     from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 3))),
  'idempotent: replaying a recorded action returns the ORIGINAL row, duplicate = true');
select race_test.ok((select count(*) = 5 from (select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 1)) union all
                     select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 1)) union all
                     select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 2)) union all
                     select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 2)) union all
                     select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 3))) q where duplicate),
  'idempotent: five more replays, all answered as duplicates');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'NO_REP', (select id from j_ids where n = 1))$$, 'RACE_IDEMPOTENCY_CONFLICT', 'idempotent: the same id for a DIFFERENT action is refused');
select race_test.login('master');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', (select id from j_ids where n = 1))$$, 'RACE_IDEMPOTENCY_CONFLICT', 'idempotent: another user cannot replay a judge''s id');
reset role;
select race_test.eq(race_test.nrows(race_test.id('j_r1s1')), 5, 'idempotent: after 8 replays there are still exactly 5 rows — no duplicate performance event');
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 5::numeric, 'idempotent: … and the score did not move');
select race_test.ok((select count(*) = 5 and count(distinct client_event_id) = 5 from race_performance_events where station_result_id = race_test.id('j_r1s1')), 'idempotent: 5 rows, 5 distinct client ids');

-- NO_REP and VOID -------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge1');
select race_test.ok((select status = 'ACCEPTED' from race_test.act(race_test.id('j_r1s1'), 'NO_REP')), 'no-rep: recorded');
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 5::numeric, 'no-rep: does not add to the score');
select race_test.ok((select status = 'ACCEPTED' from race_record_action(race_test.id('j_r1s1'), 'VOID', gen_random_uuid(), null, 'ONLINE', null, null, null, null, (select ev from j_ids where n = 5))), 'void: the judge voids the last rep (a NEW row — nothing is edited)');
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 4::numeric, 'void: score 5 → 4');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'VOID', gen_random_uuid(), null, 'ONLINE', null, null, null, null, (select ev from j_ids where n = 5))$$, 'RACE_VOID_TARGET_INVALID', 'void: an action can be voided only once');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'VOID', gen_random_uuid(), null, 'ONLINE', null, null, null, null, gen_random_uuid())$$, 'RACE_VOID_TARGET_INVALID', 'void: the target must exist');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), null, 'ONLINE', null, null, null, null, (select ev from j_ids where n = 1))$$, 'RACE_VOID_TARGET_INVALID', 'void: only a VOID may name a target');
select race_test.throws($$update race_performance_events set type = 'NO_REP' where id = (select ev from j_ids where n = 1)$$, 'permission denied', 'ledger: a judge cannot edit an action');
reset role;

-- Station view -----------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge1');
select race_test.ok((select v -> 'current' ->> 'race_number' = 'N001' and v -> 'current' ->> 'state' = 'WORK' and v -> 'current' ->> 'movement' = 'Barbell Squat'
                            and (v -> 'current' ->> 'remaining_ms')::bigint between 170000 and 180000 and (v -> 'current' -> 'tally' ->> 'reps')::int = 4
                            and jsonb_typeof(v -> 'next') = 'null'
                     from (select race_station_view(race_test.id('ev_j'), 1) v) q), 'station view: the judge sees the current athlete, the movement, the time left, the live tally (nobody is bound yet, so no "next")');
select race_test.throws($$select race_station_view(race_test.id('ev_j'), 4)$$, 'RACE_FORBIDDEN', 'station view: a judge sees only their own station');
select race_test.login('rec');
select race_test.throws($$select race_station_view(race_test.id('ev_j'), 1)$$, 'RACE_FORBIDDEN', 'station view: Reception cannot');
select race_test.login('master');
select race_test.ok((select v -> 'current' ->> 'race_number' = 'N001' from (select race_station_view(race_test.id('ev_j'), 1) v) q), 'station view: Master Control can open any station');
reset role;

-- Exact window: no grace period ---------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_j'), 239900);
select race_test.login('judge1');
select race_test.ok((select status = 'ACCEPTED' from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())), 'window: at 3:59.9 (0.1 s before the end) a rep is ACCEPTED');
reset role;
select race_sim.travel_to(race_test.id('ev_j'), 240100);
select race_test.login('judge1');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'WINDOW_CLOSED' from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid())), 'window: at 4:00.1 the same action is REJECTED (WINDOW_CLOSED) — no grace period');
reset role;
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 5::numeric, 'window: the late rep did not score (4 + the one at 3:59.9)');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.action.rejected' and target_table = 'race_performance_events' and metadata ->> 'event_id' = race_test.id('ev_j')::text and after ->> 'code' = 'WINDOW_CLOSED'), 'audit: the rejected action is in the audit log with its reason');
select race_test.login('judge1');
select race_test.ok((select status = 'REJECTED' from race_record_action(race_test.id('j_r1s1'), 'HOLD_START', gen_random_uuid())), 'window: hold actions obey the same lock');
reset role;

-- Masters wall-squat hold: 2 breaks allowed, the 3rd exit ends the hold (D-10) ---------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_j'), 280000);
select race_advance_core(race_test.id('ev_j'));
select race_test.put('j_r2s1', race_test.res('ev_j2', 1));
select race_test.login('judge1');
select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_START');
reset role;
select race_sim.travel_to(race_test.id('ev_j'), 300000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_BREAK'); reset role;
select race_sim.travel_to(race_test.id('ev_j'), 310000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_RESUME'); reset role;
select race_sim.travel_to(race_test.id('ev_j'), 330000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_BREAK'); reset role;
select race_sim.travel_to(race_test.id('ev_j'), 340000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_RESUME'); reset role;
select race_sim.travel_to(race_test.id('ev_j'), 360000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_BREAK'); reset role;
select race_sim.travel_to(race_test.id('ev_j'), 370000);
select race_test.login('judge1'); select * from race_test.act(race_test.id('j_r2s1'), 'HOLD_RESUME'); reset role;
select race_test.ok(race_test.score(race_test.id('j_r2s1')) between 59900 and 61500, 'hold: 20 s + 20 s + 20 s of valid hold = 60,000 ms; the third exit ended the hold, the later "resume" changed nothing');

-- Derived scores per scoring type ---------------------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_j'), 380000);
select race_advance_core(race_test.id('ev_j'));
select race_test.login('master');
do $$ declare i int; begin for i in 1..7 loop perform * from race_test.act(race_test.res('ev_j1', 2), 'REP'); end loop; end $$;
reset role;
select race_test.eq(race_test.score(race_test.res('ev_j1', 2)), 2::numeric, 'converted reps: a KNEE athlete''s 7 push-ups count 3:1 with no partial group → 2');
select race_sim.travel_to(race_test.id('ev_j'), 500000);
select race_advance_core(race_test.id('ev_j'));
select race_test.login('master');
do $$ declare i int; begin for i in 1..3 loop perform * from race_test.act(race_test.res('ev_j1', 3), 'LAP'); end loop; end $$;
select * from race_test.act(race_test.res('ev_j1', 3), 'PENALTY');
reset role;
select race_test.eq(race_test.score(race_test.res('ev_j1', 3)), 2::numeric, 'laps: 3 laps, one penalty cancels the last completed lap → 2 (F-4)');
select race_test.login('master');
do $$ declare i int; begin for i in 1..3 loop perform * from race_test.act(race_test.res('ev_j1', 3), 'PENALTY'); end loop; end $$;
reset role;
select race_test.eq(race_test.score(race_test.res('ev_j1', 3)), 0::numeric, 'laps: further penalties cancel nothing once no lap is left — laps never go negative (F-4)');

-- Pause: the clock is frozen, so the window is too ------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_j'), 500000);
select race_advance_core(race_test.id('ev_j'));
select race_test.put('j_r3s1', race_test.res('ev_j3', 1));
select race_test.login('master'); select race_pause(race_test.id('ev_j'), 'test'); reset role;
select race_sim.age_pause(race_test.id('ev_j'), 900000);   -- a 15-minute pause
select race_test.login('judge1');
select race_test.ok((select status = 'ACCEPTED' and server_race_ms between 500000 and 503000 from race_record_action(race_test.id('j_r3s1'), 'REP', gen_random_uuid())), 'pause: 15 minutes of wall time later, a rep is accepted at the FROZEN race time');
reset role;
select race_test.login('master'); select race_resume(race_test.id('ev_j')); reset role;

-- Technique is accepted during the 0:30 scoring window; performance input is not --------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_j'), 700000);
select race_advance_core(race_test.id('ev_j'));
select race_test.put('j_r1s4', race_test.res('ev_j1', 4));
select race_test.login('judge1');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'NO_TECHNIQUE_AT_STATION' from race_record_action(race_test.id('j_r1s1'), 'TECHNIQUE_SCORE', gen_random_uuid(), 7)), 'technique: a station without technique refuses a technique score');
select race_test.login('judge4');
select race_test.throws($$select * from race_record_action(race_test.id('j_r1s4'), 'TECHNIQUE_SCORE', gen_random_uuid(), 11)$$, 'RACE_INVALID_VALUE', 'technique: 0–10 only');
select race_test.ok((select status = 'ACCEPTED' from race_record_action(race_test.id('j_r1s4'), 'REP', gen_random_uuid())), 'station 4: a rep in the work window is accepted');
reset role;
select race_sim.travel_to(race_test.id('ev_j'), 880000);
select race_advance_core(race_test.id('ev_j'));
select race_test.login('judge4');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'WINDOW_CLOSED' from race_record_action(race_test.id('j_r1s4'), 'REP', gen_random_uuid())), 'technique window: in the 0:30 after the work window a REP is closed …');
select race_test.ok((select status = 'ACCEPTED' from race_record_action(race_test.id('j_r1s4'), 'TECHNIQUE_SCORE', gen_random_uuid(), 8.5)), '… but the technique score is accepted');
reset role;
select race_test.eq((select technique_score from race_station_results where id = race_test.id('j_r1s4')), 8.5::numeric, 'technique: stored on the result');
select race_sim.travel_to(race_test.id('ev_j'), 901000);
select race_advance_core(race_test.id('ev_j'));
select race_test.login('judge4');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'WINDOW_CLOSED' from race_record_action(race_test.id('j_r1s4'), 'TECHNIQUE_SCORE', gen_random_uuid(), 9)), 'technique window: after the station locks nothing is accepted');
reset role;
select race_test.ok((select status = 'LOCKED' and locked_at is not null and official_score = 1 from race_station_results where id = race_test.id('j_r1s4')), 'lock: the result is LOCKED with its final derived score (1 rep)');

-- Offline replay: lost to the lock, but the device says it happened in the window → Master Control decides --------------------------------------------
select race_test.login('judge1');
create temp table j_off as
  select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), null, 'OFFLINE_QUEUE', clock_timestamp() - interval '10 minutes', 200000, 1);
select race_test.ok((select status = 'PENDING_MASTER_REVIEW' and rejection_code is null from j_off), 'offline: a replayed rep that happened inside the window (device says 3:20) but arrived after the lock → PENDING_MASTER_REVIEW');
select race_test.ok((select status = 'REJECTED' and rejection_code = 'WINDOW_CLOSED' from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), null, 'OFFLINE_QUEUE', clock_timestamp() - interval '9 minutes', 250000, 2)), 'offline: one the device itself timed AFTER the window is simply REJECTED');
reset role;
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 5::numeric, 'offline: a pending action does not change the score');
select race_test.eq((select (derived ->> 'pending_review')::int from race_station_results where id = race_test.id('j_r1s1')), 1, 'offline: it is counted as pending for Master Control');
select race_test.login('judge1');
select race_test.throws($$select race_review_action((select performance_event_id from j_off), 'APPROVED', 'ok')$$, 'RACE_FORBIDDEN', 'review: a judge cannot approve their own late action');
select race_test.login('rec');
select race_test.throws($$select race_review_action((select performance_event_id from j_off), 'APPROVED', 'ok')$$, 'RACE_FORBIDDEN', 'review: Reception cannot');
select race_test.login('master');
select race_test.throws($$select race_review_action((select performance_event_id from j_off), 'APPROVED', '  ')$$, 'RACE_REASON_REQUIRED', 'review: a reason is required');
select race_test.throws($$select race_review_action((select performance_event_id from j_off), 'MAYBE', 'x')$$, 'RACE_INVALID_VALUE', 'review: APPROVED or REJECTED only');
select race_test.ok((select (race_review_action((select performance_event_id from j_off), 'APPROVED', 'Judge''s tablet was offline; the rep was inside the window')) ->> 'score')::numeric = 6, 'review: Master approves → the score becomes 6');
select race_test.throws($$select race_review_action((select performance_event_id from j_off), 'REJECTED', 'changed my mind')$$, 'RACE_NOT_PENDING|RACE_ALREADY_REVIEWED', 'review: a decision is final — it cannot be flipped');
reset role;
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 6::numeric, 'review: the approved action counts');
select race_test.ok((select status = 'PENDING_MASTER_REVIEW' from race_performance_events where id = (select performance_event_id from j_off)), 'review: the ledger row itself is unchanged (append-only); the decision is a separate row');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.action.review' and metadata ->> 'reason' like 'Judge''s tablet%'), 'audit: the review is logged with its reason');
select race_test.login('judge1');
create temp table j_off2 as select * from race_record_action(race_test.id('j_r1s1'), 'REP', gen_random_uuid(), null, 'OFFLINE_QUEUE', clock_timestamp() - interval '8 minutes', 210000, 3);
-- (device_seq uniqueness needs a device row; covered by the table constraint)
reset role;
select race_test.login('master');
select race_review_action((select performance_event_id from j_off2), 'REJECTED', 'Not convincing');
reset role;
select race_test.eq(race_test.score(race_test.id('j_r1s1')), 6::numeric, 'review: a rejected pending action never scores');

-- Ledger integrity ---------------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select count(*) = count(distinct client_event_id) from race_performance_events where event_id = race_test.id('ev_j')), 'ledger: every idempotency key in the event is unique');
select race_test.ok((select count(*) filter (where status = 'REJECTED' and rejection_code is null) = 0 from race_performance_events where event_id = race_test.id('ev_j')), 'ledger: every rejected action carries its reason code');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_j'), race_now_ms(race_test.id('ev_j'))), 'invariants: timing invariants still hold after all of this');
