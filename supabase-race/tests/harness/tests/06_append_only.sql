-- 5. Append-only protection tests. Run as the DB OWNER (superuser) and as
-- service_role — the most privileged writers there are. Triggers still refuse.
reset role;

-- Every append-only table holds rows first, so each refusal below is real
-- (an UPDATE/DELETE on an empty table would trivially "succeed").
insert into race_action_reviews (event_id, performance_event_id, decision, reason, reviewed_by)
values (race_test.id('event_a'), race_test.id('pe_s1'), 'APPROVED', 'Video confirms rep', race_test.id('master'));
insert into race_result_corrections (event_id, station_id, station_result_id, field, old_value, new_value, reason, corrected_by)
values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'official_score', '36', '37', 'Missed tap', race_test.id('master'));
insert into race_tie_draws (event_id, heat_id, tied_at, seed, participants)
values (race_test.id('event_a'), race_test.id('heat1'), now(), gen_random_bytes(16), array[race_test.id('reg1'), race_test.id('reg2')]);
insert into race_payment_events (payment_id, provider, event_type, payload)
select id, 'MANUAL', 'payment.confirmed', '{"by":"reception"}' from race_payments limit 1;
select race_test.ok((select bool_and(n > 0) from (
    select count(*) n from race_performance_events union all select count(*) from race_action_reviews
    union all select count(*) from race_result_corrections union all select count(*) from race_tie_draws
    union all select count(*) from race_check_ins union all select count(*) from race_rankings
    union all select count(*) from race_payment_events) c),
  'append-only: all 7 ledger tables hold rows before the attack');

do $$
declare
  t text;
  who text;
begin
  foreach who in array array['owner', 'service_role'] loop
    if who = 'service_role' then perform race_test.service(); else reset role; end if;
    foreach t in array array['race_performance_events', 'race_action_reviews', 'race_result_corrections',
                             'race_tie_draws', 'race_check_ins', 'race_rankings', 'race_payment_events'] loop
      perform race_test.throws(format('update %I set id = id', t), 'RACE_APPEND_ONLY', format('append-only [%s]: UPDATE %s refused', who, t));
      perform race_test.throws(format('delete from %I', t), 'RACE_APPEND_ONLY', format('append-only [%s]: DELETE %s refused', who, t));
      perform race_test.throws(format('truncate %I cascade', t), 'RACE_APPEND_ONLY', format('append-only [%s]: TRUNCATE %s refused', who, t));
    end loop;
  end loop;
  reset role;
end $$;
reset role;

-- Ledger content survives every attempt.
select race_test.eq((select count(*) from race_performance_events)::int, 2, 'append-only: both judge actions still present');

select race_test.throws($$update race_result_corrections set new_value = '99'$$, 'RACE_APPEND_ONLY', 'append-only: a correction can never be rewritten');
select race_test.throws($$delete from race_action_reviews$$, 'RACE_APPEND_ONLY', 'append-only: a review decision can never be removed');

-- Server timestamps are authoritative even for privileged inserts.
insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin,
                                     server_received_at, server_race_ms, judge_profile_id, status, device_recorded_at, device_seq)
values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'NO_REP', gen_random_uuid(), 'OFFLINE_QUEUE',
        '2000-01-01', 62000, race_test.id('judge1'), 'ACCEPTED', now(), 1);
select race_test.ok((select abs(extract(epoch from server_received_at - clock_timestamp())) < 60
                     from race_performance_events where type = 'NO_REP'),
  'server time: a supplied server_received_at (year 2000) is overwritten with clock_timestamp()');
select race_test.ok((select abs(extract(epoch from checked_in_at - clock_timestamp())) < 300 from race_check_ins limit 1),
  'server time: check-in timestamp is the server''s');

-- Idempotency / duplicate protection (D-8).
select race_test.throws(format($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                                  select event_id, station_id, station_result_id, 'REP', client_event_id, 'ONLINE', 1, judge_profile_id, 'ACCEPTED'
                                  from race_performance_events where id = %L$$, race_test.id('pe_s1')),
  'client_event_id', 'idempotency: the same client_event_id can never be recorded twice');
insert into race_devices (id, event_id, profile_id, kind, station_id, label)
values ('00000000-0000-0000-0000-00000000d001', race_test.id('event_a'), race_test.id('judge1'), 'JUDGE', race_test.id('s1'), 'Judge phone S01');
insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms,
                                     judge_profile_id, status, device_recorded_at, device_seq, device_id)
values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'OFFLINE_QUEUE', 63000,
        race_test.id('judge1'), 'ACCEPTED', now(), 1, '00000000-0000-0000-0000-00000000d001');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms,
                                                              judge_profile_id, status, device_recorded_at, device_seq, device_id)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'OFFLINE_QUEUE', 64000,
                                  race_test.id('judge1'), 'ACCEPTED', now(), 1, '00000000-0000-0000-0000-00000000d001')$$,
  'device_id_device_seq', 'idempotency: a device sequence number can never be replayed');

-- Ledger integrity rules.
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'VOID', gen_random_uuid(), 'ONLINE', 1, race_test.id('judge1'), 'ACCEPTED')$$,
  'check constraint', 'ledger: VOID must reference the action it voids');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status, voids_event_id)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 1, race_test.id('judge1'), 'ACCEPTED', race_test.id('pe_s1'))$$,
  'check constraint', 'ledger: only a VOID may reference another action');
insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status, voids_event_id)
values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'VOID', gen_random_uuid(), 'ONLINE', 65000, race_test.id('judge1'), 'ACCEPTED', race_test.id('pe_s1'));
select race_test.ok((select count(*) = 1 from race_performance_events where id = race_test.id('pe_s1')),
  'ledger: VOID is a new row — the voided original is kept intact (D-9)');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, value, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s4'), race_test.id('res_s4'), 'TECHNIQUE_SCORE', 10.5, gen_random_uuid(), 'ONLINE', 1, race_test.id('judge4'), 'ACCEPTED')$$,
  'check constraint', 'ledger: technique score must be 0–10');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 1, race_test.id('judge1'), 'REJECTED')$$,
  'check constraint', 'ledger: a REJECTED action must carry a rejection code');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'OFFLINE_QUEUE', 1, race_test.id('judge1'), 'PENDING_MASTER_REVIEW')$$,
  'check constraint', 'ledger: an offline action must carry device time + local sequence (D-8)');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s4'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 1, race_test.id('judge1'), 'ACCEPTED')$$,
  'foreign key', 'ledger: an action''s station must match its result''s station (composite FK)');

-- race_pauses: exactly one legal change — closing an open pause, once.
insert into race_pauses (event_id, paused_race_ms, paused_by, reason) values (race_test.id('event_a'), 1200000, race_test.id('master'), 'Medical');
select race_test.throws($$insert into race_pauses (event_id, paused_race_ms, paused_by) values (race_test.id('event_a'), 1, race_test.id('master'))$$,
  'uq_race_pauses_open', 'pauses: only one open pause per event');
select race_test.throws($$update race_pauses set reason = 'rewritten' where event_id = race_test.id('event_a')$$,
  'RACE_APPEND_ONLY', 'pauses: a pause''s reason/time can never be rewritten');
update race_pauses set resumed_by = race_test.id('master'), resumed_at = '2000-01-01' where event_id = race_test.id('event_a');
select race_test.ok((select resumed_at > paused_at and abs(extract(epoch from resumed_at - clock_timestamp())) < 60
                     from race_pauses where event_id = race_test.id('event_a')),
  'pauses: resume is recorded once, with server time (supplied time ignored)');
select race_test.throws($$update race_pauses set resumed_by = race_test.id('bm_a') where event_id = race_test.id('event_a')$$,
  'already closed', 'pauses: a closed pause can never be re-opened or edited');
select race_test.throws($$delete from race_pauses$$, 'RACE_NO_DELETE', 'pauses: never deleted');

-- OCR evidence: immutable image; CAPTURED → final exactly once.
insert into race_ocr_records (event_id, station_id, station_result_id, storage_path, proposed_distance_m, captured_by)
select race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'race-evidence/x/1.jpg', 812, race_test.id('judge1');
select race_test.throws($$update race_ocr_records set storage_path = 'race-evidence/x/2.jpg'$$, 'immutable', 'ocr: original image path can never change');
update race_ocr_records set status = 'CONFIRMED', confirmed_distance_m = 812, confirmed_by = race_test.id('judge1');
select race_test.ok((select confirmed_at is not null from race_ocr_records), 'ocr: confirmation stamped with server time');
select race_test.throws($$update race_ocr_records set confirmed_distance_m = 900$$, 'already CONFIRMED', 'ocr: a confirmed reading cannot be edited (correction workflow only)');
select race_test.throws($$delete from race_ocr_records$$, 'RACE_NO_DELETE', 'ocr: evidence never deleted');

-- State caches are never deleted.
select race_test.throws($$delete from race_start_slots$$, 'RACE_NO_DELETE', 'no-delete: start slots');
select race_test.throws($$delete from race_station_results$$, 'RACE_NO_DELETE', 'no-delete: station results');
select race_test.throws($$delete from race_registrations$$, 'RACE_NO_DELETE', 'no-delete: registrations (cancel instead)');
select race_test.throws($$delete from race_payments$$, 'RACE_NO_DELETE', 'no-delete: payments (refund/cancel instead)');
select race_test.throws($$delete from race_events where id = race_test.id('event_a')$$, 'RACE_NO_DELETE', 'no-delete: a published event can only be archived');

-- Existing audit log remains append-only for every API role.
select race_test.login('super');
select race_test.throws($$delete from race_audit_log where target_table like 'race\_%'$$, 'permission denied',
  'audit: even super admin cannot delete race audit entries through the API');
select race_test.throws($$update race_audit_log set action = 'x' where target_table like 'race\_%'$$, 'permission denied',
  'audit: even super admin cannot rewrite race audit entries through the API');
reset role;
-- ... and not even the database owner: a trigger refuses UPDATE, DELETE and TRUNCATE.
select race_test.throws($$update race_audit_log set action = 'x'$$, 'RACE_APPEND_ONLY', 'audit: the owner cannot rewrite the audit log either');
select race_test.throws($$delete from race_audit_log$$, 'RACE_APPEND_ONLY', 'audit: the owner cannot delete audit entries');
select race_test.throws($$truncate race_audit_log$$, 'RACE_APPEND_ONLY', 'audit: the owner cannot truncate the audit log');
