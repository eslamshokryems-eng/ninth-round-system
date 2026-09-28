-- 3. RLS / security tests.
reset role;

-- Anonymous (public internet) -------------------------------------------------
select race_test.anon();
select race_test.eq(race_test.count($$select 1 from race_events$$), 1::bigint,
  'anon: sees the published event only (DRAFT event hidden)');
select race_test.eq(race_test.count($$select 1 from race_station_rules$$), 27::bigint,
  'anon: sees the published event''s 27 station rules (weights/heights are public)');
select race_test.throws($$select * from race_athletes$$, 'permission denied', 'anon: athlete PII not readable');
select race_test.throws($$select * from race_registrations$$, 'permission denied', 'anon: registrations not readable');
select race_test.throws($$select * from race_payments$$, 'permission denied', 'anon: payments not readable');
select race_test.throws($$select * from race_station_results$$, 'permission denied', 'anon: live station results not readable');
select race_test.throws($$insert into race_events (branch_id, slug, event_date) values (race_test.id('branch_a'), 'x', now()::date)$$,
  'permission denied', 'anon: cannot create events');
select race_test.throws($$insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin, server_race_ms, judge_profile_id, status)
                          values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 1, race_test.id('judge1'), 'ACCEPTED')$$,
  'permission denied', 'anon: cannot write judge actions');
select race_test.throws($$select race_create_event(race_test.id('branch_a'), 'hack', current_date)$$,
  'RACE_FORBIDDEN', 'anon: cannot create an event through the RPC');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_CLOSED')$$,
  'RACE_FORBIDDEN', 'anon: cannot change event status (NULL-safe guard)');
select race_test.throws($$select race_lock_heats(race_test.id('event_a'))$$, 'RACE_FORBIDDEN', 'anon: cannot lock heats');
select race_test.throws($$select race_move_athlete_heat(race_test.id('reg2'), race_test.id('heat2'), 'x')$$, 'RACE_FORBIDDEN',
  'anon: cannot move athletes');
select race_test.ok((select is_started = false from race_server_time(race_test.id('event_a'))),
  'anon: public clock-sync endpoint works for a published event');
select race_test.throws($$select * from race_server_time(race_test.id('event_b'))$$, 'RACE_NOT_FOUND',
  'anon: clock of a DRAFT event is not exposed');
select race_test.eq(race_test.affected($$insert into race_judge_applications (event_id, full_name, phone, preferred_stations)
                                         values (race_test.id('event_a'), 'Volunteer Judge', '01011112222', '{4,7}')$$),
  1::bigint, 'anon: can submit a judge application to an open event');
select race_test.throws($$insert into race_judge_applications (event_id, full_name, phone) values (race_test.id('event_b'), 'X', '1')$$,
  'row-level security', 'anon: cannot apply to a DRAFT event');
select race_test.throws($$insert into race_judge_applications (event_id, full_name, phone, status) values (race_test.id('event_a'), 'X', '1', 'APPROVED')$$,
  'permission denied', 'anon: cannot self-approve a judge application');
select race_test.throws($$select * from race_judge_applications$$, 'permission denied', 'anon: cannot read judge applications');
select race_test.eq(race_test.count($$select 1 from race_rankings$$), 0::bigint,
  'anon: no rankings visible before results are official');
reset role;
update race_events set status = 'RESULTS_OFFICIAL' where id = race_test.id('event_a');
select race_test.anon();
select race_test.eq(race_test.count($$select 1 from race_rankings$$), 1::bigint,
  'anon: after RESULTS_OFFICIAL only the official snapshot is public (draft snapshot hidden)');
reset role;
update race_events set status = 'REGISTRATION_OPEN' where id = race_test.id('event_a');

-- Signed-in account with no race role -------------------------------------------
select race_test.login('nobody');
select race_test.ok(race_test.count($$select 1 from race_athletes$$) = 0
                    and race_test.count($$select 1 from race_registrations$$) = 0
                    and race_test.count($$select 1 from race_station_results$$) = 0
                    and race_test.count($$select 1 from race_performance_events$$) = 0
                    and race_test.count($$select 1 from race_staff$$) = 0
                    and race_test.count($$select 1 from race_check_ins$$) = 0,
  'no-role account: sees zero athletes, registrations, results, actions, staff, check-ins');
select race_test.eq(race_test.affected($$update race_events set venue = 'pwned' where id = race_test.id('event_a')$$), 0::bigint,
  'no-role account: event update silently filtered by RLS (0 rows)');
select race_test.throws($$insert into race_staff (event_id, profile_id, role) values (race_test.id('event_a'), auth.uid(), 'MASTER_CONTROL')$$,
  'row-level security', 'no-role account: cannot grant itself a race role');
select race_test.eq(race_test.count($$select 1 from admin_audit_log$$), 0::bigint,
  'no-role account: audit log unreadable');

-- Athlete (self-service) ---------------------------------------------------------
select race_test.login('athlete_user');
select race_test.ok(race_test.count($$select 1 from race_registrations$$) = 1
                    and (select race_number from race_registrations) = 'N001'
                    and race_test.count($$select 1 from race_athletes$$) = 1
                    and race_test.count($$select 1 from race_payments$$) = 1
                    and race_test.count($$select 1 from race_station_results$$) = 2,
  'athlete: sees only own registration, profile, payment and own station results');
select race_test.eq(race_test.affected($$update race_registrations set pushup_style = 'KNEE'$$), 0::bigint,
  'athlete: cannot edit own registration directly');

-- Event manager: column-level limits --------------------------------------------
select race_test.login('bm_a');
select race_test.throws($$update race_events set status = 'LIVE' where id = race_test.id('event_a')$$,
  'permission denied', 'manager: cannot set event status directly (engine/RPC only)');
select race_test.throws($$update race_registrations set race_status = 'FINISHED' where id = race_test.id('reg1')$$,
  'permission denied', 'manager: cannot set an athlete race status directly');
select race_test.throws($$insert into race_registrations (event_id, athlete_id, category_id, race_number, pushup_style)
                          select race_test.id('event_a'), athlete_id, category_id, 'N999', 'STANDARD' from race_registrations limit 1$$,
  'permission denied', 'manager: registrations are created via RPC only (Phase 4)');
select race_test.throws($$update race_station_results set official_score = 999 where id = race_test.id('res_s1')$$,
  'permission denied', 'manager: cannot edit a result directly (correction workflow only)');
select race_test.throws($$update race_clock set started_at = now() where event_id = race_test.id('event_a')$$,
  'permission denied', 'manager: cannot touch the race clock directly');
select race_test.throws($$insert into admin_audit_log (action, target_table) values ('fake', 'race_events')$$,
  'row-level security', 'manager: cannot write to the audit log (existing append-only policy)');
select race_test.eq(race_test.affected($$update admin_audit_log set action = 'x'$$), 0::bigint,
  'manager: cannot alter audit history (0 rows)');
select race_test.ok(race_test.count($$select 1 from admin_audit_log$$) > 0
                    and not exists (select 1 from admin_audit_log where target_table not like 'race\_%')
                    and not exists (select 1 from admin_audit_log where metadata ->> 'event_id' = race_test.id('event_b')::text),
  'manager: reads own event''s race audit trail only (no gym entries, no other event)');

-- Cross-event isolation ----------------------------------------------------------
select race_test.eq(race_test.affected($$update race_events set venue = 'x' where id = race_test.id('event_b')$$), 0::bigint,
  'isolation: manager of event A cannot edit event B');
select race_test.throws($$insert into race_staff (event_id, profile_id, role) values (race_test.id('event_b'), race_test.id('nobody'), 'RECEPTION')$$,
  'row-level security', 'isolation: manager of event A cannot staff event B');
select race_test.throws($$insert into race_staff (event_id, profile_id, role, station_id)
                          values (race_test.id('event_a'), race_test.id('nobody'), 'JUDGE',
                                  (select id from race_stations where event_id = race_test.id('event_b') and number = 1))$$,
  'foreign key', 'isolation: a judge cannot be bound to another event''s station (composite FK)');
reset role;
with a as (insert into race_athletes (full_name, phone) values ('FK Test', '0') returning id)
select race_test.put('fk_athlete', id) from a;
select race_test.throws($$insert into race_registrations (event_id, athlete_id, category_id, race_number, pushup_style)
                          select race_test.id('event_a'), race_test.id('fk_athlete'),
                                 (select id from race_categories where event_id = race_test.id('event_b') and code = 'MEN'), 'N998', 'STANDARD'$$,
  'foreign key', 'isolation: a registration cannot use another event''s category (composite FK)');

-- Deactivated staff lose race access immediately (existing is_active switch) ----
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from race_station_results$$), 1::bigint, 'deactivation: active judge sees own station');
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = false where id = race_test.id('judge1');
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from race_station_results$$), 0::bigint,
  'deactivation: deactivated judge sees nothing, despite an active race_staff row');
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = false where id = race_test.id('bm_a');
select race_test.login('bm_a');
select race_test.throws($$select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_CLOSED')$$, 'RACE_FORBIDDEN',
  'deactivation: deactivated event manager cannot change status (NULL-safe guard)');
select race_test.throws($$select race_create_event(race_test.id('branch_a'), 'deactivated-try', current_date)$$, 'RACE_FORBIDDEN',
  'deactivation: deactivated branch manager cannot create events');
select race_test.eq(race_test.affected($$update race_events set venue = 'x' where id = race_test.id('event_a')$$), 0::bigint,
  'deactivation: deactivated event manager cannot edit config');
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = true where id = race_test.id('bm_a');
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = true where id = race_test.id('judge1');
select set_config('request.jwt.claim.sub', '', false);
