-- "No duplicate performance events". The judge ledger is idempotent BY CONSTRUCTION: every action carries a client-generated
-- idempotency key (client_event_id, unique) and a per-device sequence number (unique per device), and the ledger is append-only.
-- (The judge RPC that writes it arrives with the judging phase; these are the guarantees it will stand on.)
reset role;
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          select event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms + 500, judge_profile_id, status
                            from race_performance_events where id = race_test.id('pe_s1')$$,
  'duplicate key|unique', 'ledger: replaying a judge action (same client_event_id) can never create a second row — a retry is harmless');
select race_test.eq((select count(*) from race_performance_events where id = race_test.id('pe_s1'))::int, 1, 'ledger: exactly one row for that action');
select race_test.throws($$update race_performance_events set type = 'NO_REP' where id = race_test.id('pe_s1')$$, 'RACE_APPEND_ONLY', 'ledger: a recorded action can never be edited');
select race_test.throws($$delete from race_performance_events where id = race_test.id('pe_s1')$$, 'RACE_APPEND_ONLY', 'ledger: … or deleted');
select race_test.ok((select count(*) = count(distinct client_event_id) from race_performance_events), 'ledger: every idempotency key is unique across the table');
