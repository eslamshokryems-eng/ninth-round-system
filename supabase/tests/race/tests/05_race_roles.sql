-- 4. Race-role permission tests (§17 matrix).
reset role;

-- Creating events (existing permission catalog + branch membership) -----------
select race_test.login('bm_a');
select race_test.throws($$select race_create_event(race_test.id('branch_b'), 'wrong-branch', current_date)$$,
  'RACE_FORBIDDEN', 'create: branch manager cannot create an event for another branch');
select race_test.login('gym_reception');
select race_test.throws($$select race_create_event(race_test.id('branch_a'), 'reception-try', current_date)$$,
  'RACE_FORBIDDEN', 'create: gym reception cannot create events (no race.events.create)');
select race_test.login('super');
select race_test.ok(race_create_event(race_test.id('branch_b'), 'super-event', current_date) is not null,
  'create: super admin can create an event in any branch');
select race_test.ok(exists (select 1 from race_staff s join race_events e on e.id = s.event_id
                            where e.slug = 'the-ninth-cairo-2026' and s.profile_id = race_test.id('bm_a') and s.role = 'EVENT_MANAGER'),
  'create: the creator becomes the event''s EVENT_MANAGER');

-- Staff assignment + escalation guard ---------------------------------------------
select race_test.login('bm_a');
select race_test.throws($$insert into race_staff (event_id, profile_id, role) values (race_test.id('event_a'), race_test.id('em2'), 'EVENT_MANAGER')$$,
  'only a super admin', 'escalation: an event manager cannot create another EVENT_MANAGER');
select race_test.throws($$insert into race_staff (event_id, profile_id, role) values (race_test.id('event_a'), race_test.id('nobody'), 'JUDGE')$$,
  'check constraint', 'staff: a JUDGE must be bound to a station');
select race_test.throws($$insert into race_staff (event_id, profile_id, role, station_id) values (race_test.id('event_a'), race_test.id('nobody'), 'RECEPTION', race_test.id('s1'))$$,
  'check constraint', 'staff: RECEPTION cannot be bound to a station');
select race_test.ok((select assigned_by = race_test.id('bm_a') from race_staff where profile_id = race_test.id('judge1')),
  'staff: assigned_by is server-stamped with the real caller');
select race_test.login('super');
insert into race_staff (event_id, profile_id, role) values (race_test.id('event_a'), race_test.id('em2'), 'EVENT_MANAGER');
select race_test.ok(true, 'escalation: super admin can assign EVENT_MANAGER');
select race_test.login('bm_a');
select race_test.throws($$update race_staff set active = false where profile_id = race_test.id('em2')$$,
  'only a super admin', 'escalation: an event manager cannot demote another EVENT_MANAGER');
select race_test.ok((select count(*) from admin_audit_log where action = 'race.staff.insert'
                     and metadata ->> 'event_id' = race_test.id('event_a')::text) >= 6,
  'audit: every race-role grant is audited (race.staff.insert)');

-- Reception ----------------------------------------------------------------------
select race_test.login('rec');
select race_test.ok(race_test.count($$select 1 from race_registrations$$) = 10
                    and race_test.count($$select 1 from race_athletes$$) = 10
                    and race_test.count($$select 1 from race_check_ins$$) = 1
                    and race_test.count($$select 1 from race_payments$$) = 1,
  'reception: searches athletes/registrations, sees check-ins and payments');
select race_test.eq(race_test.count($$select 1 from race_station_results$$), 0::bigint, 'reception: cannot see station results');
select race_test.eq(race_test.affected($$update race_registrations set heat_id = race_test.id('heat2') where id = race_test.id('reg2')$$), 0::bigint,
  'reception: cannot move athletes between heats / choose order');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_CLOSED')$$, 'RACE_FORBIDDEN',
  'reception: cannot change event status');

-- Judge (station 1) ----------------------------------------------------------------
select race_test.login('judge1');
select race_test.ok(race_test.count($$select 1 from race_station_results$$) = 1
                    and (select station_id from race_station_results) = race_test.id('s1'),
  'judge: sees only assigned station''s result (S01)');
select race_test.ok(race_test.count($$select 1 from race_performance_events$$) = 1
                    and (select station_id from race_performance_events) = race_test.id('s1'),
  'judge: sees only assigned station''s actions — not S04''s');
select race_test.eq(race_test.count($$select 1 from race_athletes$$), 0::bigint, 'judge: no athlete PII (phone etc.)');
select race_test.eq(race_test.count($$select 1 from race_registrations$$), 10::bigint, 'judge: sees race numbers (athlete codes)');
select race_test.eq(race_test.count($$select 1 from race_payments$$), 0::bigint, 'judge: no payments');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 1, auth.uid(), 'ACCEPTED')$$,
  'permission denied', 'judge: cannot write the ledger directly (RPC in Phase 7 only)');
select race_test.throws($$update race_clock set paused_at = now()$$, 'permission denied', 'judge: no race-clock control');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_CLOSED')$$, 'RACE_FORBIDDEN',
  'judge: no event control');
select race_test.login('judge4');
select race_test.ok(race_test.count($$select 1 from race_station_results$$) = 1
                    and (select station_id from race_station_results) = race_test.id('s4'),
  'judge: S04 judge sees only S04');

-- Station screen -------------------------------------------------------------------
select race_test.login('screen1');
select race_test.ok(race_test.count($$select 1 from race_station_results$$) = 1
                    and race_test.count($$select 1 from race_performance_events$$) = 0
                    and race_test.count($$select 1 from race_athletes$$) = 0,
  'screen: own station result only; no judge ledger, no PII');
select race_test.eq(race_test.affected($$update race_events set venue = 'x'$$), 0::bigint, 'screen: display-only (no writes)');

-- Master control ---------------------------------------------------------------------
select race_test.login('master');
select race_test.ok(race_test.count($$select 1 from race_station_results$$) = 2
                    and race_test.count($$select 1 from race_performance_events$$) = 2
                    and race_test.count($$select 1 from race_staff$$) >= 6,
  'master: monitors all stations, all actions and judge roster');
select race_test.eq(race_test.affected($$update race_events set heat_gap_ms = 700000 where id = race_test.id('event_a')$$), 0::bigint,
  'master: cannot change event configuration');
select race_test.throws($$insert into race_staff (event_id, profile_id, role) values (race_test.id('event_a'), race_test.id('nobody'), 'RECEPTION')$$,
  'row-level security', 'master: cannot assign staff');

-- Event manager: status transitions + heat lock -------------------------------------
select race_test.login('bm_a');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'LIVE')$$, 'RACE_STATUS_RESERVED',
  'status: LIVE is reserved for the race engine');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'DRAFT')$$, 'RACE_INVALID_TRANSITION',
  'status: cannot return a published event to DRAFT');
select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_CLOSED');
select race_test.ok((select status = 'REGISTRATION_CLOSED' from race_events where id = race_test.id('event_a'))
                    and exists (select 1 from admin_audit_log where action = 'race.event.status'),
  'status: REGISTRATION_OPEN → CLOSED via RPC, audited');

select race_test.eq(race_test.affected($$update race_registrations set heat_id = race_test.id('heat2') where id = race_test.id('reg2')$$), 1::bigint,
  'heats: before lock the manager can move an athlete');
select race_move_athlete_heat(race_test.id('reg2'), race_test.id('heat1'));
select race_lock_heats(race_test.id('event_a'));
select race_test.ok((select status = 'HEATS_LOCKED' and heats_locked_at is not null and heats_locked_by = race_test.id('bm_a')
                     from race_events where id = race_test.id('event_a'))
                    and not exists (select 1 from race_heats where event_id = race_test.id('event_a') and status <> 'LOCKED')
                    and exists (select 1 from admin_audit_log where action = 'race.heats.lock'),
  'heats: race_lock_heats() locks event + heats, server-stamped, audited');
select race_test.throws($$update race_registrations set heat_id = race_test.id('heat2') where id = race_test.id('reg2')$$,
  'RACE_HEATS_LOCKED', 'heats: after lock a direct move is refused, even for the manager');
select race_test.throws($$insert into race_heats (event_id, number) values (race_test.id('event_a'), 3)$$,
  'RACE_HEATS_LOCKED', 'heats: after lock no heats can be added directly');
select race_test.throws($$select race_move_athlete_heat(race_test.id('reg2'), race_test.id('heat2'))$$,
  'RACE_REASON_REQUIRED', 'heats: an authorized post-lock change requires a reason');
select race_move_athlete_heat(race_test.id('reg2'), race_test.id('heat2'), 'Athlete injury swap approved by head judge');
select race_test.ok(exists (select 1 from admin_audit_log where action = 'race.heat.change_after_lock'
                            and target_id = race_test.id('reg2') and metadata ->> 'reason' like 'Athlete injury%'
                            and ("before" ->> 'heat')::int = 1 and ("after" ->> 'heat')::int = 2),
  'heats: post-lock change applied and audited with old heat, new heat, reason');
select race_test.login('master');
select race_test.throws($$select race_move_athlete_heat(race_test.id('reg2'), race_test.id('heat1'), 'x')$$,
  'RACE_FORBIDDEN', 'heats: master control cannot move athletes between heats');

-- Push-up style locks at Station 02 start -----------------------------------------
reset role;
update race_registrations set pushup_style_locked_at = now() where id = race_test.id('reg1');
select race_test.login('bm_a');
select race_test.throws($$update race_registrations set pushup_style = 'KNEE' where id = race_test.id('reg1')$$,
  'RACE_PUSHUP_STYLE_LOCKED', 'rules: push-up style cannot change after it is locked');

-- Judge application review is server-stamped ----------------------------------------
select race_test.eq(race_test.affected($$update race_judge_applications set status = 'APPROVED' where full_name = 'Volunteer Judge'$$), 1::bigint,
  'judges: event manager approves an application');
select race_test.ok((select reviewed_by = race_test.id('bm_a') and reviewed_at is not null from race_judge_applications where full_name = 'Volunteer Judge')
                    and exists (select 1 from admin_audit_log where action = 'race.judge_applications.update'),
  'judges: reviewer + time stamped by the server, audited');
reset role;
