-- FINAL VALIDATION: the role matrix on a LIVE race. Reception, Judge, Master Control, Event Manager, Super Admin, Station Screen — what each may do and,
-- as important, what each may NOT do, evaluated by calling the real RPCs / touching the real tables as that user while the race is running.
reset role;
select race_test.make_user('rm_judge2', '');
create function race_test.rm_ev() returns uuid language sql stable as $$ select race_test.id('ev_rm') $$;
create function race_test.rm_res(p_i int, p_station int) returns uuid language sql stable security definer as $$
  select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where st.event_id = race_test.rm_ev() and st.number = p_station and sr.registration_id = race_test.rid('ev_rm' || p_i) $$;
create function race_test.rm_slot(p_i int) returns uuid language sql stable security definer as $$
  select s.id from race_start_slots s where s.event_id = race_test.rm_ev() and s.slot_index = p_i - 1 $$;
create function race_test.rm_pend() returns uuid language sql stable security definer as $$ select id from race_performance_events where client_event_id = 'aaaaaaaa-0000-4000-8000-00000000f001' $$;
-- run one statement as one user: it must fail with p_expect / it must succeed
create function race_test.deny(p_user text, p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  perform race_test.login(p_user);
  perform race_test.throws(p_sql, p_expect, p_label);
  perform set_config('role', 'postgres', false);
end $$;
-- direct DML must either be refused or touch ZERO rows (row-level security filters it silently)
create function race_test.deny_dml(p_user text, p_sql text, p_label text) returns void language plpgsql as $$
declare n bigint;
begin
  perform race_test.login(p_user);
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    perform set_config('role', 'postgres', false);
    raise notice 'PASS  % [refused: %]', p_label, left(sqlerrm, 60);
    return;
  end;
  perform set_config('role', 'postgres', false);
  if n <> 0 then raise exception 'FAIL: % — % rows were changed', p_label, n; end if;
  raise notice 'PASS  % [0 rows touched]', p_label;
end $$;
create function race_test.allow(p_user text, p_sql text, p_label text) returns void language plpgsql as $$
begin
  perform race_test.login(p_user);
  begin
    execute p_sql;
  exception when others then
    perform set_config('role', 'postgres', false);
    raise exception 'FAIL: % — should be allowed, got "%"', p_label, sqlerrm;
  end;
  perform set_config('role', 'postgres', false);
  raise notice 'PASS  % [allowed]', p_label;
end $$;

-- a live race with five athletes; N005 has not arrived yet ------------------------------------------------------------------------------------------
select race_test.mkevent('ev_rm', 'rolematrix-2026', 5);
insert into race_heats (event_id, number) values (race_test.id('ev_rm'), 1);
do $$ declare i int; begin
  for i in 1..5 loop perform race_move_athlete_heat(race_test.rid('ev_rm' || i), (select id from race_heats where event_id = race_test.id('ev_rm'))); end loop;
end $$;
reset role;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_rm'), race_test.id('master'), 'MASTER_CONTROL');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_rm'), race_test.id(k), r::race_role, (select id from race_stations where event_id = race_test.id('ev_rm') and number = n)
  from (values ('judge1', 'JUDGE', 1), ('rm_judge2', 'JUDGE', 2), ('screen1', 'STATION_SCREEN', 1)) v(k, r, n);
select race_test.login('bm_a'); select race_lock_heats(race_test.id('ev_rm'));
select race_test.login('rec'); select race_check_in(race_test.rid('ev_rm' || i)) from generate_series(1, 4) i;
reset role;
select race_test.login('master'); select race_start_event(race_test.id('ev_rm')); reset role;
select race_sim.travel_to(race_test.id('ev_rm'), 70000);     -- athlete 1 is at Station 01, 10 s into the work window

-- RECEPTION: front desk only ------------------------------------------------------------------------------------------------------------------------
select race_test.allow('rec', $$select * from race_check_in(race_test.rid('ev_rm5'))$$, 'Reception: can check an athlete in (late arrival)');
select race_test.deny('rec', $$select * from race_skip_athlete(race_test.rm_slot(4), 'x')$$, 'RACE_FORBIDDEN', 'Reception: cannot SKIP an athlete');
select race_test.deny('rec', $$select race_move_athlete_heat(race_test.rid('ev_rm3'), (select id from race_heats where event_id = race_test.rm_ev()), 'x')$$, 'RACE_FORBIDDEN|locked', 'Reception: cannot change the start order / heat');
select race_test.deny('rec', $$select * from race_record_action(race_test.rm_res(1, 1), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'Reception: cannot score');
select race_test.deny('rec', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 99, 'desk typo')$$, 'RACE_FORBIDDEN', 'Reception: cannot edit a result');
select race_test.deny('rec', $$select * from race_pause(race_test.rm_ev(), 'x')$$, 'RACE_FORBIDDEN', 'Reception: cannot pause the race');
select race_test.deny('rec', $$select race_publish_results(race_test.rm_ev())$$, 'RACE_FORBIDDEN', 'Reception: cannot publish results');
select race_test.deny('rec', $$select race_compute_rankings(race_test.rm_ev())$$, 'RACE_FORBIDDEN', 'Reception: cannot compute rankings');
select race_test.deny('rec', $$update race_station_results set official_score = 99$$, 'permission denied', 'Reception: no direct write on results');

-- JUDGE (Station 01): own station only ---------------------------------------------------------------------------------------------------------------
select race_test.allow('judge1', $$select * from race_record_action(race_test.rm_res(1, 1), 'REP', gen_random_uuid())$$, 'Judge: can score the athlete at HIS station');
select race_test.deny('judge1', $$select * from race_record_action(race_test.rm_res(1, 2), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'Judge: cannot score at ANOTHER station');
select race_test.deny('judge1', $$select * from race_pause(race_test.rm_ev(), 'x')$$, 'RACE_FORBIDDEN', 'Judge: cannot pause (cannot control the clock)');
select race_test.deny('judge1', $$select * from race_resume(race_test.rm_ev())$$, 'RACE_FORBIDDEN', 'Judge: cannot resume');
select race_test.deny('judge1', $$select * from race_skip_athlete(race_test.rm_slot(4), 'x')$$, 'RACE_FORBIDDEN', 'Judge: cannot skip');
select race_test.deny('judge1', $$select race_mark_dnf(race_test.rid('ev_rm2'), 'x')$$, 'RACE_FORBIDDEN', 'Judge: cannot mark DNF');
select race_test.deny('judge1', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 99, 'my own result')$$, 'RACE_FORBIDDEN', 'Judge: cannot edit an official result');
select race_test.deny('judge1', $$select race_correct_rowing_result(race_test.rm_res(1, 9), 999, 'photo')$$, 'RACE_FORBIDDEN', 'Judge: cannot change an OCR distance directly');
select race_test.deny('judge1', $$select race_publish_results(race_test.rm_ev())$$, 'RACE_FORBIDDEN', 'Judge: cannot publish');
select race_test.deny('judge1', $$select * from race_check_in(race_test.rid('ev_rm5'))$$, 'RACE_FORBIDDEN', 'Judge: cannot check an athlete in');
select race_test.deny('judge1', $$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
   select event_id, station_id, id, 'REP', gen_random_uuid(), 'ONLINE', 0, judge_profile_id, 'ACCEPTED' from race_station_results limit 1$$, 'permission denied|row-level', 'Judge: no direct write to the ledger — only the RPC');
select race_test.deny('judge1', $$update race_station_results set official_score = 99$$, 'permission denied', 'Judge: no direct write on results');

-- STATION SCREEN: a display, nothing else ------------------------------------------------------------------------------------------------------------
select race_test.allow('screen1', $$select race_station_screen(race_test.rm_ev(), 1)$$, 'Station Screen: can read its own screen');
select race_test.deny('screen1', $$select * from race_record_action(race_test.rm_res(1, 1), 'REP', gen_random_uuid())$$, 'RACE_FORBIDDEN', 'Station Screen: cannot score');
select race_test.deny('screen1', $$select race_ocr_capture(race_test.rm_res(1, 9), gen_random_uuid(), 'x/y.jpg', 'image/jpeg', 100, repeat('a', 64), 'ONLINE')$$, 'RACE_FORBIDDEN|RACE_', 'Station Screen: cannot capture evidence');
select race_test.deny('screen1', $$select * from race_pause(race_test.rm_ev(), 'x')$$, 'RACE_FORBIDDEN', 'Station Screen: cannot control the race');
select race_test.deny('screen1', $$select * from race_skip_athlete(race_test.rm_slot(4), 'x')$$, 'RACE_FORBIDDEN', 'Station Screen: cannot skip');
select race_test.deny('screen1', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 99, 'x')$$, 'RACE_FORBIDDEN', 'Station Screen: cannot edit results');
select race_test.deny('screen1', $$update race_station_results set official_score = 99$$, 'permission denied', 'Station Screen: no direct write');

-- MASTER CONTROL: runs the race; does not manage the event or hold Super Admin power -----------------------------------------------------------------
select race_test.allow('master', $$select * from race_pause(race_test.rm_ev(), 'matrix: master pause')$$, 'Master Control: can pause');
select race_test.allow('master', $$select * from race_resume(race_test.rm_ev())$$, 'Master Control: can resume');
select race_test.deny('master', $$select race_set_account_flags(race_test.id('plain_user'), true, true)$$, 'RACE_FORBIDDEN|permission denied', 'Master Control: cannot grant Super Admin / event creation');
select race_test.deny('master', $$select race_publish_results(race_test.rm_ev())$$, 'RACE_FORBIDDEN', 'Master Control: cannot publish official results (Event Manager / Super Admin only)');
select race_test.deny('master', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 99, 'matrix')$$, 'RACE_FORBIDDEN|RACE_', 'Master Control: cannot rewrite a result that is not locked yet / not its role');
select race_test.deny('master', $$select race_refund_payment((select id from race_payments limit 1), 'x')$$, 'RACE_FORBIDDEN', 'Master Control: cannot refund a payment');
select race_test.deny('master', $$select race_create_event('master-made', date '2027-01-01', 'X', 'Africa/Cairo', timestamptz '2027-01-01 07:00:00+00')$$, 'RACE_FORBIDDEN|permission|not allowed', 'Master Control: cannot create an event');
select race_test.deny_dml('master', $$update race_events set name = 'hijack'$$, 'Master Control: no direct write on the event');

-- EVENT MANAGER: manages the event, but every override needs a reason and leaves an audit row ---------------------------------------------------------
select race_test.deny('bm_a', $$select * from race_skip_athlete(race_test.rm_slot(4), '')$$, 'RACE_REASON|reason|RACE_', 'Event Manager: cannot SKIP without a reason');
select race_test.deny('bm_a', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 99, '')$$, 'RACE_REASON|reason|RACE_', 'Event Manager: cannot correct a result without a reason (no bypass of the audit trail)');
select race_test.deny('bm_a', $$select race_set_account_flags(race_test.id('plain_user'), true, true)$$, 'RACE_FORBIDDEN|permission denied', 'Event Manager: cannot make anyone Super Admin');
select race_test.deny('bm_a', $$update race_audit_log set action = 'x'$$, 'permission denied|append-only|immutable|RACE_', 'Event Manager: cannot edit the audit log');
select race_test.deny('bm_a', $$delete from race_performance_events$$, 'permission denied|append-only|immutable|RACE_', 'Event Manager: cannot delete ledger rows');
select race_test.allow('bm_a', $$select * from race_pause(race_test.rm_ev(), 'matrix: manager pause')$$, 'Event Manager: can pause');
select race_test.allow('bm_a', $$select * from race_resume(race_test.rm_ev())$$, 'Event Manager: can resume');

-- the athlete 1 / Station 01 window is over, its result is LOCKED: now the Event Manager's correction works — with a reason — and is audited ---------------
select race_sim.travel_to(race_test.id('ev_rm'), 60000 + 210000 + 5000);
-- an offline replay that lost to the lock is PENDING_MASTER_REVIEW: only Master Control decides it — not the judge who sent it, not Reception, not a Screen
select race_test.allow('judge1', $$select * from race_record_action(race_test.rm_res(1, 1), 'REP', 'aaaaaaaa-0000-4000-8000-00000000f001', null, 'OFFLINE_QUEUE', clock_timestamp(), 100000, 9001, null)$$, 'Judge: a late offline replay is accepted into the ledger (as PENDING_MASTER_REVIEW)');
select race_test.ok((select status = 'PENDING_MASTER_REVIEW' from race_performance_events where client_event_id = 'aaaaaaaa-0000-4000-8000-00000000f001'), 'Judge: … and it does NOT change the locked score by itself');
select race_test.deny('judge1', $$select race_review_action(race_test.rm_pend(), 'APPROVED', 'my own replay')$$, 'RACE_FORBIDDEN', 'Judge: cannot approve his own offline action');
select race_test.deny('rec', $$select race_review_action(race_test.rm_pend(), 'APPROVED', 'x')$$, 'RACE_FORBIDDEN', 'Reception: cannot approve an offline action');
select race_test.deny('screen1', $$select race_review_action(race_test.rm_pend(), 'APPROVED', 'x')$$, 'RACE_FORBIDDEN', 'Station Screen: cannot approve an offline action');
select race_test.deny('master', $$select race_review_action(race_test.rm_pend(), 'APPROVED', '')$$, 'RACE_REASON|reason', 'Master Control: cannot decide without a reason');
select race_test.allow('master', $$select race_review_action(race_test.rm_pend(), 'REJECTED', 'matrix: not credible')$$, 'Master Control: can decide it (with a reason)');
select race_test.allow('bm_a', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 7, 'matrix: judge miscount found on video')$$, 'Event Manager: can correct a LOCKED result with a reason');
select race_test.ok((select count(*) = 1 from race_audit_log where action = 'race.result.correct' and metadata ->> 'event_id' = race_test.rm_ev()::text), 'Event Manager: the correction wrote its audit row');
select race_test.ok((select official_score = 7 and status = 'CORRECTED' from race_station_results where id = race_test.rm_res(1, 1)), 'Event Manager: the result is CORRECTED, the original ledger stays');
select race_test.ok((select count(*) = 1 from race_performance_events where station_result_id = race_test.rm_res(1, 1) and type = 'REP' and status = 'ACCEPTED'), 'Event Manager: the judge''s original REP row is still there');

-- SUPER ADMIN: everything, still audited ---------------------------------------------------------------------------------------------------------------
select race_test.allow('super', $$select * from race_pause(race_test.rm_ev(), 'matrix: super pause')$$, 'Super Admin: can pause');
select race_test.allow('super', $$select * from race_resume(race_test.rm_ev())$$, 'Super Admin: can resume');
select race_test.allow('super', $$select race_set_account_flags(race_test.id('plain_user'), null, true)$$, 'Super Admin: can grant event creation');
select race_test.allow('super', $$select race_set_account_flags(race_test.id('plain_user'), null, false)$$, 'Super Admin: … and take it back');
select race_test.ok((select count(*) >= 2 from race_audit_log where action = 'race.account.flags'), 'Super Admin: account-flag changes are audited');
select race_test.deny('super', $$update race_audit_log set action = 'x'$$, 'permission denied|append-only|immutable|RACE_', 'Super Admin: not even Super Admin can edit the audit log');

-- ANONYMOUS and a stranger -------------------------------------------------------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select * from race_pause(race_test.rm_ev(), 'x')$$, 'permission denied|RACE_FORBIDDEN', 'anonymous: cannot control the race');
select race_test.throws($$select * from race_record_action(race_test.rm_res(1, 1), 'REP', gen_random_uuid())$$, 'permission denied|RACE_FORBIDDEN', 'anonymous: cannot score');
select race_test.throws($$select * from race_performance_events$$, 'permission denied', 'anonymous: cannot read the ledger');
reset role;
select race_test.deny('plain_user', $$select * from race_pause(race_test.rm_ev(), 'x')$$, 'RACE_FORBIDDEN', 'a signed-in stranger: cannot control the race');
select race_test.deny('athlete_user', $$select race_correct_station_result(race_test.rm_res(1, 1), 'official_score', 1, 'my score')$$, 'RACE_FORBIDDEN', 'an athlete''s account: cannot edit results');
reset role;
