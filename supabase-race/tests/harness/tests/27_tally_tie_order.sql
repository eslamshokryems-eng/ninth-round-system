-- Regression for a bug found by the final end-to-end simulation: two actions with the SAME race millisecond (a device flushing its offline queue) must be
-- tallied in the order the server RECEIVED them — not in the order of their random row ids.
reset role;
create function race_test.tie_case(p_first_id uuid, p_second_id uuid) returns numeric language plpgsql as $$
declare r record; t0 timestamptz := clock_timestamp();
begin
  select sr.id rid, sr.event_id, sr.station_id into r from race_station_results sr where sr.id = race_test.rm_res(2, 4);
  alter table race_performance_events disable trigger user;
  delete from race_performance_events where station_result_id = r.rid;
  insert into race_performance_events (id, event_id, station_id, station_result_id, type, value, client_event_id, origin, server_received_at, server_race_ms, judge_profile_id, status)
  values (p_first_id,  r.event_id, r.station_id, r.rid, 'TECHNIQUE_SCORE', 5, gen_random_uuid(), 'ONLINE', t0,                          1000, race_test.id('judge1'), 'ACCEPTED'),
         (p_second_id, r.event_id, r.station_id, r.rid, 'TECHNIQUE_SCORE', 9, gen_random_uuid(), 'ONLINE', t0 + interval '1 millisecond', 1000, race_test.id('judge1'), 'ACCEPTED');
  alter table race_performance_events enable trigger user;
  return (race_result_tally(r.rid) ->> 'technique')::numeric;
end $$;
-- the later-received action (9) wins whichever way the random ids happen to sort
select race_test.eq(race_test.tie_case('00000000-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000002'), 9::numeric, 'tally tie-order: later-received action wins when its id sorts AFTER');
select race_test.eq(race_test.tie_case('ffffffff-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'), 9::numeric, 'tally tie-order: later-received action wins when its id sorts BEFORE (was the bug)');
select race_test.ok((select bool_and(race_test.tie_case(gen_random_uuid(), gen_random_uuid()) = 9) from generate_series(1, 40)), 'tally tie-order: 40 random id pairs — always the order the server received them');
alter table race_performance_events disable trigger user;
delete from race_performance_events where station_result_id = race_test.rm_res(2, 4);
alter table race_performance_events enable trigger user;
select race_recompute_result(race_test.rm_res(2, 4));
reset role;
