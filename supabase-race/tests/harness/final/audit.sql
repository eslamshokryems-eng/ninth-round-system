-- FINAL END-TO-END VALIDATION — part 5: AUDIT. The whole event must be reconstructable from what the system kept, and nothing that was kept can be changed.
\set ON_ERROR_STOP on
\set QUIET on
reset role;

-- check-ins: the wrong one, its correction, the simultaneous storm and the late ones are all still there ------------------------------------------------
select race_final.chk('audit: every check-in is in the audit log, the wrong N005 check-in and its Master correction both remain',
  (select count(*) from race_audit_log where action in ('race.checkin', 'race.checkin.late') and metadata ->> 'event_id' = race_final.ev()::text) >= 46
  and (select count(*) from race_audit_log where action = 'race.checkin.correct' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_check_in_corrections where event_id = race_final.ev()) = 1,
  (select count(*)::text from race_audit_log where action in ('race.checkin', 'race.checkin.late') and metadata ->> 'event_id' = race_final.ev()::text));
select race_final.chk('audit: late check-ins are marked as late', (select count(*) from race_audit_log where action = 'race.checkin.late' and metadata ->> 'event_id' = race_final.ev()::text) >= 1);

-- the performance ledger: every action the judges sent is a row — accepted, pending, rejected, VOIDs, penalties — nothing was dropped or rewritten ----------
select race_final.chk('audit: the performance ledger holds EXACTLY every judge action that was sent (accepted, pending, rejected) — none lost',
  (select count(*) from race_performance_events where event_id = race_final.ev()) = (select count(*) from race_final.act_log where sys_event_id is not null)
  and (select count(*) from race_final.act_log where sys_event_id is null and sys_status <> 'ERROR') = 0,
  (select count(*)::text from race_performance_events where event_id = race_final.ev()) || ' vs ' || (select count(*)::text from race_final.act_log where sys_event_id is not null));
select race_final.chk('audit: VOID rows kept and point at the action they void (original stays)',
  (select count(*) from race_performance_events where event_id = race_final.ev() and type = 'VOID') >= 3
  and (select count(*) from race_performance_events v join race_performance_events o on o.id = v.voids_event_id where v.type = 'VOID') = (select count(*) from race_performance_events where type = 'VOID'));
select race_final.chk('audit: F-4 PENALTY rows are kept as rows (they cancel a lap in the score, they do not erase anything)', (select count(*) from race_performance_events where event_id = race_final.ev() and type = 'PENALTY') >= 1);
select race_final.chk('audit: rejected and pending actions kept with their reason / review',
  (select count(*) from race_performance_events where event_id = race_final.ev() and status = 'REJECTED' and rejection_code is not null) = (select count(*) from race_final.act_log where sys_status = 'REJECTED')
  and (select count(*) from race_performance_events where event_id = race_final.ev() and status = 'PENDING_MASTER_REVIEW') = (select count(*) from race_final.act_log where sys_status = 'PENDING_MASTER_REVIEW')
  and (select count(*) from race_action_reviews rv join race_performance_events e on e.id = rv.performance_event_id where e.event_id = race_final.ev()) = (select count(*) from race_final.act_log where sys_status = 'PENDING_MASTER_REVIEW'),
  (select count(*)::text from race_final.act_log where sys_status = 'PENDING_MASTER_REVIEW'));
select race_final.chk('audit: both Master review outcomes happened and are recorded (APPROVED and REJECTED)',
  (select count(distinct decision) from race_action_reviews rv join race_performance_events e on e.id = rv.performance_event_id where e.event_id = race_final.ev()) = 2);

-- OCR: capture → read → confirm / retake / Master review / manual correction ---------------------------------------------------------------------------
select race_final.chk('audit: every OCR capture, retake, Master review and manual correction that succeeded has its audit row',
  (select count(*) from race_audit_log where action = 'race.ocr.capture' and metadata ->> 'event_id' = race_final.ev()::text) = (select count(*) from race_final.ocr_log where step = 'capture' and sys_result like 'OK%')
  and (select count(*) from race_audit_log where action = 'race.ocr.retake' and metadata ->> 'event_id' = race_final.ev()::text) = (select count(*) from race_final.ocr_log where step = 'retake' and sys_result like 'OK%')
  and (select count(*) from race_audit_log where action = 'race.ocr.review' and metadata ->> 'event_id' = race_final.ev()::text) = (select count(*) from race_final.ocr_log where step = 'review' and sys_result like 'OK%')
  and (select count(*) from race_audit_log where action = 'race.ocr.manual_correction' and metadata ->> 'event_id' = race_final.ev()::text) = (select count(*) from race_final.rowing_corrections_log),
  (select string_agg(action || '=' || n, ', ') from (select action, count(*) n from race_audit_log where action like 'race.ocr.%' and metadata ->> 'event_id' = race_final.ev()::text group by 1 order by 1) q));
select race_final.chk('audit: OCR attempts, retakes and confirmations all kept (nothing overwritten): every attempt row is still there with its photo path',
  (select count(*) from race_ocr_records where event_id = race_final.ev()) >= (select count(*) from race_final.ocr_log where step in ('submit', 'capture') and sys_result like 'OK%') / 2
  and (select count(*) from race_ocr_records where event_id = race_final.ev() and retake_of is not null) >= 1
  and (select count(*) from race_ocr_records where event_id = race_final.ev() and length(trim(storage_path)) = 0) = 0);
select race_final.chk('audit: station-result corrections keep the old value, the new value, the reason and who did it',
  (select count(*) from race_result_corrections where event_id = race_final.ev() and length(trim(reason)) > 0 and new_value is not null and corrected_by is not null) = (select count(*) from race_result_corrections where event_id = race_final.ev())
  and (select count(*) from race_result_corrections where event_id = race_final.ev()) >= 2 + (select count(*) from race_final.rowing_corrections_log)
  and (select count(*) from race_result_corrections where event_id = race_final.ev() and old_value is not null) >= 2,
  (select count(*)::text from race_result_corrections where event_id = race_final.ev()));

-- the clock: pauses, resumes, skip, DNF, DNS ---------------------------------------------------------------------------------------------------------
select race_final.chk('audit: every pause has a matching resume (7 cycles) — and the audit log says so',
  (select count(*) from race_audit_log where action = 'race.event.pause' and metadata ->> 'event_id' = race_final.ev()::text) = 7
  and (select count(*) from race_audit_log where action = 'race.event.resume' and metadata ->> 'event_id' = race_final.ev()::text) = 7
  and (select count(*) from race_pauses where event_id = race_final.ev()) = 7,
  (select string_agg(action || '=' || n, ', ') from (select action, count(*) n from race_audit_log where action like 'race.event.%' and metadata ->> 'event_id' = race_final.ev()::text group by 1) q));
select race_final.chk('audit: the SKIP, the DNF and every DNS are in the audit log with who/why',
  (select count(*) from race_audit_log where action = 'race.athlete.skip' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_audit_log where action = 'race.athlete.dnf' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_registrations where event_id = race_final.ev() and race_status = 'MISSED_START')
      = (select count(*) from race_audit_log where action in ('race.registration.missed_start', 'race.athlete.skip') and metadata ->> 'event_id' = race_final.ev()::text)
  and (select count(*) from race_station_results r join race_registrations g on g.id = r.registration_id where r.event_id = race_final.ev() and g.race_status = 'MISSED_START' and r.status not in ('VOID_DNS', 'NOT_REACHED')) = 0
  and (select count(*) from race_station_results where event_id = race_final.ev() and status = 'NOT_REACHED') >= 1,
  (select count(*)::text from race_registrations where event_id = race_final.ev() and race_status = 'MISSED_START'));

-- the whole event is reconstructable ------------------------------------------------------------------------------------------------------------------
select race_final.chk('audit: the event timeline is complete and ordered — one START, one FINISH, exactly the heats that ran, results official',
  (select count(*) from race_audit_log where action = 'race.event.start' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_audit_log where action = 'race.heat.cancel' and metadata ->> 'event_id' = race_final.ev()::text) = 1
  and (select count(*) from race_audit_log where action = 'race.results.publish' and metadata ->> 'event_id' = race_final.ev()::text) >= 1
  and (select min(created_at) from race_audit_log where action = 'race.event.start' and metadata ->> 'event_id' = race_final.ev()::text) < (select min(created_at) from race_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_final.ev()::text));
select race_final.chk('audit: every locked score is REPRODUCIBLE — recomputing it from the ledger gives the stored number (no hand-typed score anywhere)',
  (select count(*) from race_station_results r join race_stations st on st.id = r.station_id
    where r.event_id = race_final.ev() and r.status = 'LOCKED' and st.number <> 9 and r.official_score is distinct from nullif(race_result_tally(r.id) ->> 'score', '')::numeric) = 0
  and (select count(*) from race_station_results r join race_stations st on st.id = r.station_id where r.event_id = race_final.ev() and r.status = 'LOCKED' and st.number <> 9) >= 250);

-- append-only: the history cannot be changed by anyone, not even the database owner's own application code paths -------------------------------------------
do $$
declare v_tbl text; v_stmt text; n int := 0;
begin
  for v_tbl, v_stmt in select * from (values
      ('race_performance_events', 'update race_performance_events set value = 99 where true'),
      ('race_performance_events', 'delete from race_performance_events where true'),
      ('race_audit_log', 'update race_audit_log set action = ''x'' where true'),
      ('race_audit_log', 'delete from race_audit_log where true'),
      ('race_ocr_records', 'delete from race_ocr_records where true'),
      ('race_result_corrections', 'update race_result_corrections set reason = ''x'' where true'),
      ('race_result_corrections', 'delete from race_result_corrections where true'),
      ('race_rankings', 'update race_rankings set total_points = 9 where true'),
      ('race_rankings', 'delete from race_rankings where true'),
      ('race_pauses', 'delete from race_pauses where true'),
      ('race_action_reviews', 'update race_action_reviews set decision = ''REJECTED'' where true'),
      ('race_action_reviews', 'delete from race_action_reviews where true')) v loop
    begin
      execute v_stmt;
      raise exception 'FINAL VALIDATION FAIL: % was changed by: %', v_tbl, v_stmt;
    exception when others then
      if sqlerrm like 'FINAL VALIDATION FAIL%' then raise; end if;
      n := n + 1;
    end;
  end loop;
  perform race_final.chk('audit: the ledgers are append-only — ' || n || ' UPDATE/DELETE attempts on the history were all refused', n = 12);
end $$;
reset role;
