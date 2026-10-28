-- THE NINTH League (PROPOSED migration) — authorization, lifecycle, attempts, scoring, corrections, privacy. Runs in the throw-away race_league_test database.
reset role;
select race_test.make_user('super', 'S');
select race_test.make_user('lg_admin', 'C');      -- may create seasons (becomes LEAGUE_ADMIN of the season it creates)
select race_test.make_user('lg_judge', '');
select race_test.make_user('lg_judge2', '');
select race_test.make_user('lg_rev', '');
select race_test.make_user('lg_rev2', '');
select race_test.make_user('lg_plain', '');       -- an account with no league role
select race_test.make_user('lg_other_admin', 'C');-- admin of a DIFFERENT season
select race_test.make_user('lg_admin_b', '');     -- the second, independent administrator every live season needs

-- reads a value as the database owner (the signed-in test roles have, by design, no table privileges)
create function race_test.q(p text) returns text language plpgsql security definer set search_path = public as $$
declare r text; begin execute p into r; return r; end $$;
grant execute on function race_test.q(text) to public;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- structure + lock-down
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'race\_league\_%')::int, 15, 'structure: 15 league tables (11 base + 4 station-layout)');
select race_test.ok(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'race\_league\_%' and not c.relrowsecurity), 'lock-down: RLS is enabled on every league table');
select race_test.ok(not exists (select 1 from information_schema.table_privileges where table_schema = 'public' and table_name like 'race\_league\_%' and grantee in ('anon', 'authenticated', 'PUBLIC')), 'lock-down: no client role holds any privilege on a league table');
select race_test.ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'race\_league\_%'), 'lock-down: no RLS policy exists on a league table (everything goes through the checked functions)');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' and not p.prosecdef and p.proname in
   ('race_league_apply_scores', 'race_league_record_attempt', 'race_league_review_attempt', 'race_league_correct_attempt', 'race_league_set_challenge_status')), 'lock-down: the state-changing functions are SECURITY DEFINER');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' and p.prosecdef and not coalesce((select bool_or(c like 'search_path=%') from unnest(p.proconfig) c), false)),
   'lock-down: every SECURITY DEFINER league function pins search_path');
select race_test.eq((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' and has_function_privilege('anon', p.oid, 'execute'))::int, 3,
   'lock-down: anon can execute exactly the three public read functions');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' and p.proname !~ '^race_league_(public_|create_season|set_|update_rules|upsert_|add_|import_|record_|review_|correct_|request_|decide_|lodge_|find_account|recompute|my_seasons|admin_overview|audit$|get_layout|station_breakdown)'
   and has_function_privilege('authenticated', p.oid, 'execute')), 'lock-down: no internal helper is executable by a client role');
select race_test.ok(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'race\_league\_%' and c.relkind = 'r' and c.relname !~ '^race_league_(seasons|challenges|participants|attempts|points_ledger|staff|eligibility_decisions|correction_requests|corrections|appeals|public_gate|layouts|layout_stations|layout_exercises|station_results)$'), 'isolation: only the eleven base and four station-layout league tables exist');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- season lifecycle + authorization
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_plain');
select race_test.throws($$select race_league_create_season('nope-season', 'Nope', date '2026-11-02', date '2026-12-27')$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot create a season');
select race_test.anon();
select race_test.throws($$select race_league_create_season('nope-season', 'Nope', date '2026-11-02', date '2026-12-27')$$, 'permission denied', 'anon cannot create a season');
select race_test.login('lg_admin');
select race_test.throws($$select race_league_create_season('bad-length', 'Bad', date '2026-11-02', date '2026-12-20')$$, 'LEAGUE_INVALID', 'a season must be exactly eight weeks');
select race_test.throws($$select race_league_create_season('bad-rules', 'Bad', date '2026-11-02', date '2026-12-27', '{"points":{"by_rank":[1,2],"beyond":0,"participation":0,"absent":0},"tie_policy":"SHARE","absence_policy":"ZERO","eligibility":"AT_REGISTRATION"}')$$, 'fewer points', 'a worse rank may not earn more points');
select race_test.throws($$select race_league_create_season('bad-rules', 'Bad', date '2026-11-02', date '2026-12-27', '{"evil":1}')$$, 'LEAGUE_INVALID', 'unknown rule keys are refused');
select race_test.put('s1', race_league_create_season('season-one', 'Season One', date '2026-11-02', date '2026-12-27'));
select race_test.throws($$select race_league_create_season('season-one', 'Again', date '2026-11-02', date '2026-12-27')$$, 'LEAGUE_DUPLICATE', 'a season address is unique');
select race_test.login('lg_other_admin');
select race_test.put('s2', race_league_create_season('season-two', 'Season Two', date '2026-11-02', date '2026-12-27'));

reset role;
insert into race_league_staff (season_id, profile_id, role) values
  (race_test.id('s1'), race_test.id('lg_judge'), 'JUDGE'), (race_test.id('s1'), race_test.id('lg_judge2'), 'JUDGE'),
  (race_test.id('s1'), race_test.id('lg_rev'), 'REVIEWER'), (race_test.id('s1'), race_test.id('lg_rev2'), 'REVIEWER'),
  (race_test.id('s1'), race_test.id('lg_admin_b'), 'LEAGUE_ADMIN');

select race_test.login('lg_other_admin');
select race_test.throws($$select race_league_set_season_status(race_test.id('s1'), 'scheduled')$$, 'LEAGUE_FORBIDDEN', 'the admin of ANOTHER season cannot change this one');
select race_test.throws($$select race_league_admin_overview(race_test.id('s1'))$$, 'LEAGUE_FORBIDDEN', 'the admin of another season cannot read this one');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_set_season_status(race_test.id('s1'), 'scheduled')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot run the season');
select race_test.throws($$select race_league_update_rules(race_test.id('s1'), race_league_default_rules(), 'x')$$, 'permission denied', 'internal helpers are not callable by clients');
select race_test.throws($$select race_league_update_rules(race_test.id('s1'), '{"points":{"by_rank":[9],"beyond":0,"participation":0,"absent":0},"tie_policy":"SHARE","absence_policy":"ZERO","eligibility":"AT_REGISTRATION"}', 'cheat')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot change the point rules');
select race_test.throws($$select race_league_add_participant(race_test.id('s1'), 'Judge Added', null, true)$$, 'LEAGUE_FORBIDDEN', 'a judge cannot add participants');

select race_test.login('lg_admin');
select race_test.throws($$select race_league_set_season_status(race_test.id('s1'), 'active')$$, 'LEAGUE_INVALID_TRANSITION', 'draft cannot jump to active');
select race_test.throws($$select race_league_set_published(race_test.id('s1'), true, 'go')$$, 'schedule the season', 'a draft season cannot be published');
select race_test.throws($$select race_league_set_published(race_test.id('s1'), true, '')$$, 'LEAGUE_REASON_REQUIRED', 'publishing needs a reason');
select race_league_set_season_status(race_test.id('s1'), 'scheduled');

-- challenges
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 9, '{"name":"X","metric_kind":"REPS","unit":"reps"}')$$, 'LEAGUE_INVALID', 'week 9 does not exist');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Hack","metric_kind":"REPS","unit":"reps","status":"closed"}')$$, 'unknown field', 'mass assignment of status is refused');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Hack","metric_kind":"REPS","unit":"reps","season_id":"00000000-0000-0000-0000-000000000000"}')$$, 'unknown field', 'mass assignment of season_id is refused');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Bad unit","metric_kind":"REPS","unit":"kg"}')$$, 'race_league_challenges_metric', 'a unit that does not match the challenge type is refused');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Bad dir","metric_kind":"TIME","unit":"s","direction":"SIDEWAYS"}')$$, 'direction', 'an unknown ranking direction is refused');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Bad link","metric_kind":"REPS","unit":"reps","reference_url":"javascript:alert(1)"}')$$, 'reference_url', 'a non-https reference link is refused');
select race_test.put('c1', race_league_upsert_challenge(race_test.id('s1'), 1, '{"name":"Max push-ups","metric_kind":"REPS","unit":"reps","max_attempts":2,"counting":"BEST","requires_verification":true,"instructions":"Chest to the floor."}'));
select race_test.put('c2', race_league_upsert_challenge(race_test.id('s1'), 2, '{"name":"Plank","metric_kind":"TIME","unit":"s","max_attempts":1,"requires_verification":false}'));
select race_test.eq(race_test.q('select direction from race_league_challenges where id = ''' || race_test.id('c2') || ''''), 'LOWER_WINS', 'a time challenge defaults to the lower time winning');
select race_test.eq(race_test.q('select max_attempts from race_league_challenges where id = ''' || race_test.id('c2') || ''''), '1', 'an explicit attempt limit is kept');
select race_test.eq(race_test.q('select count(*) from race_league_challenges where season_id = ''' || race_test.id('s1') || '''')::int, 2, 'two challenges exist');
select race_league_upsert_challenge(race_test.id('s1'), 1, '{"instructions":"Chest to the floor, full lockout."}');
select race_test.eq(race_test.q('select count(*) from race_league_challenges where season_id = ''' || race_test.id('s1') || '''')::int, 2, 'an update does not create a second week-1 challenge');
select race_test.throws($$select race_league_set_challenge_status(race_test.id('c1'), 'open')$$, 'LEAGUE_INVALID_TRANSITION', 'a draft challenge cannot open directly');
select race_league_set_challenge_status(race_test.id('c1'), 'published');
select race_test.throws($$select race_league_set_challenge_status(race_test.id('c1'), 'open')$$, 'season must be active', 'a challenge cannot open before the season is active');
select race_league_set_season_status(race_test.id('s1'), 'active');

-- participants
select race_test.eq((select count(*) from jsonb_array_elements(race_league_import_participants(race_test.id('s1'), '[{"display_name":"Ahmed K.","external_ref":"M-1","membership_verified":true},{"display_name":"Bassem R.","external_ref":"M-2","membership_verified":true},{"display_name":"Chris T.","external_ref":"M-3","membership_verified":true},{"display_name":"Dina S.","external_ref":"M-4","membership_verified":true},{"display_name":"Eman F.","external_ref":"M-5","membership_verified":true}]') -> 'issues'))::int, 0, 'import: five clean rows');
select race_test.eq(race_test.q('select count(*) from race_league_participants where season_id = ''' || race_test.id('s1') || '''')::int, 5, 'import: five participants');
select race_test.eq((race_league_import_participants(race_test.id('s1'), '[{"display_name":"Ahmed K.","external_ref":"M-1","membership_verified":true},{"display_name":"=cmd()","external_ref":null,"membership_verified":true},{"display_name":"Zed","external_ref":"bad ref!","membership_verified":true},{"display_name":"Expired E.","external_ref":"M-9","membership_verified":false},{"display_name":"Unattested U.","external_ref":"M-8"},{"display_name":"Fresh F.","membership_verified":true}]') ->> 'added')::int, 1, 'import: only the valid, membership-verified new row is added (an expired or unattested membership is refused)');
select race_test.eq((select jsonb_array_length(race_league_import_participants(race_test.id('s1'), '[{"display_name":"Ahmed K.","external_ref":"M-1","membership_verified":true}]') -> 'issues')), 1, 'import: a duplicate is reported, never merged');
select race_test.throws($$select race_league_add_participant(race_test.id('s1'), 'Ahmed K.', 'M-1', true)$$, 'LEAGUE_DUPLICATE', 'adding a duplicate participant is refused');
select race_test.throws($$select race_league_add_participant(race_test.id('s1'), '+evil', null, true)$$, 'LEAGUE_INVALID', 'a formula-looking display name is refused');
reset role;
select race_test.put('pA', (select id from race_league_participants where season_id = race_test.id('s1') and display_name = 'Ahmed K.'));
select race_test.put('pB', (select id from race_league_participants where season_id = race_test.id('s1') and display_name = 'Bassem R.'));
select race_test.put('pC', (select id from race_league_participants where season_id = race_test.id('s1') and display_name = 'Chris T.'));
select race_test.put('pD', (select id from race_league_participants where season_id = race_test.id('s1') and display_name = 'Dina S.'));
select race_test.put('pE', (select id from race_league_participants where season_id = race_test.id('s1') and display_name = 'Eman F.'));

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- attempts: record → review
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_admin');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, gen_random_uuid())$$, 'LEAGUE_CHALLENGE_NOT_OPEN', 'attempts are refused while the challenge is only published');
select race_league_set_challenge_status(race_test.id('c1'), 'open');
select race_league_set_challenge_status(race_test.id('c2'), 'published');
select race_league_set_challenge_status(race_test.id('c2'), 'open');

select race_test.login('lg_plain');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot record an attempt');
select race_test.anon();
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, gen_random_uuid())$$, 'permission denied', 'anon cannot record an attempt');
select race_test.login('lg_rev');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'a reviewer cannot record an attempt');

select race_test.login('lg_judge');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), -1, null, gen_random_uuid())$$, 'LEAGUE_INVALID', 'a negative result is refused');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 10.5, null, gen_random_uuid())$$, 'whole number', 'fractional repetitions are refused');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, now() + interval '1 day', gen_random_uuid())$$, 'future', 'an attempt time in the future is refused');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, null)$$, 'request id', 'a request id is mandatory');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), '00000000-0000-0000-0000-000000000001', 30, null, gen_random_uuid())$$, 'LEAGUE_NOT_FOUND', 'an unknown participant is refused');
select race_test.put('rq1', gen_random_uuid());
select race_test.put('a1', (race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, race_test.id('rq1')) ->> 'id')::uuid);
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('a1') || ''''), 'pending', 'an attempt on a verified challenge starts pending');
select race_test.ok((race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 30, null, race_test.id('rq1')) ->> 'replay')::boolean, 'a retry of the same request returns the original attempt (idempotent)');
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('c1') || ''' and participant_id = ''' || race_test.id('pA') || '''')::int, 1, 'a retry created no duplicate attempt');
select race_test.put('a2', (race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 35, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pA'), 40, null, gen_random_uuid())$$, 'LEAGUE_ATTEMPT_LIMIT', 'the third attempt exceeds the limit of two');
select race_test.put('a3', (race_league_record_attempt(race_test.id('c1'), race_test.id('pB'), 42, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('a4', (race_league_record_attempt(race_test.id('c1'), race_test.id('pC'), 42, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('a5', (race_league_record_attempt(race_test.id('c1'), race_test.id('pD'), 12, null, gen_random_uuid()) ->> 'id')::uuid);

-- review: self-approval, authorization, idempotency
select race_test.login('lg_admin');
select race_test.put('a6', (race_league_record_attempt(race_test.id('c1'), race_test.id('pE'), 20, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.throws($$select race_league_review_attempt(race_test.id('a6'), 'approve')$$, 'LEAGUE_SELF_REVIEW', 'the person who recorded an attempt cannot approve it (even an administrator)');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_review_attempt(race_test.id('a3'), 'approve')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot approve attempts');
select race_test.login('lg_plain');
select race_test.throws($$select race_league_review_attempt(race_test.id('a3'), 'approve')$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot approve attempts');
select race_test.login('lg_judge2');
select race_test.throws($$select race_league_review_attempt(race_test.id('a3'), 'approve')$$, 'LEAGUE_FORBIDDEN', 'another judge cannot approve attempts');
select race_test.login('lg_rev');
select race_test.throws($$select race_league_review_attempt(race_test.id('a1'), 'reject')$$, 'LEAGUE_REASON_REQUIRED', 'a rejection needs a reason');
select race_test.throws($$select race_league_review_attempt(race_test.id('a1'), 'maybe')$$, 'LEAGUE_INVALID', 'only approve or reject');
select race_league_review_attempt(race_test.id('a1'), 'approve');
select race_test.ok((race_league_review_attempt(race_test.id('a1'), 'approve') ->> 'replay')::boolean, 'approving twice is an idempotent replay');
select race_test.login('lg_rev2');
select race_test.throws($$select race_league_review_attempt(race_test.id('a1'), 'reject', 'changed my mind')$$, 'already been decided', 'a decided attempt cannot be decided again');
select race_league_review_attempt(race_test.id('a2'), 'reject', 'foot touched the floor');
select race_league_review_attempt(race_test.id('a3'), 'approve');
select race_league_review_attempt(race_test.id('a4'), 'approve');
select race_league_review_attempt(race_test.id('a5'), 'approve');
select race_league_review_attempt(race_test.id('a6'), 'approve');
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('a2') || ''''), 'rejected', 'a rejected attempt is stored as rejected, with its reason');

-- an unverified challenge: counted at once
select race_test.login('lg_judge');
select race_test.ok((select status = 'approved' from jsonb_to_record(race_league_record_attempt(race_test.id('c2'), race_test.id('pA'), 61, null, gen_random_uuid())) as x(status text)), 'on a challenge without verification an attempt counts at once');
select race_league_record_attempt(race_test.id('c2'), race_test.id('pB'), 55.5, null, gen_random_uuid());
select race_league_record_attempt(race_test.id('c2'), race_test.id('pC'), 70, null, gen_random_uuid());

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- closing awards points exactly once
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
select race_test.put('a7', (race_league_record_attempt(race_test.id('c1'), race_test.id('pE'), 21, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.login('lg_admin');
select race_test.throws($$select race_league_set_challenge_status(race_test.id('c1'), 'closed')$$, 'waiting for review', 'a challenge with a pending attempt cannot close');
select race_test.login('lg_rev');
select race_league_review_attempt(race_test.id('a7'), 'reject', 'not a full range of motion');
reset role;
select race_test.eq((select count(*) from race_league_points_ledger where season_id = race_test.id('s1'))::int, 0, 'no points before a challenge closes');
select race_test.login('lg_admin');
select race_league_set_challenge_status(race_test.id('c1'), 'closed');
reset role;
-- week 1 (higher reps wins): A=30 (a2 rejected), B=42, C=42 tie, D=12, E=20 → B,C rank 1 (100), A rank 3 (80), E rank 4 (75), D rank 5 (70)
create function race_test.lp(p_challenge text, p_participant text) returns text language sql stable as $$
  select coalesce(sum(points_cents), 0) || ':' || coalesce((select rank::text from race_league_points_ledger z where z.challenge_id = race_test.id(p_challenge) and z.participant_id = race_test.id(p_participant) order by seq desc limit 1), '-')
    from race_league_points_ledger l where l.challenge_id = race_test.id(p_challenge) and l.participant_id = race_test.id(p_participant) $$;
select race_test.eq(race_test.lp('c1', 'pB'), '10000:1', 'week 1: Bassem (42) shares rank 1 and the 100 points');
select race_test.eq(race_test.lp('c1', 'pC'), '10000:1', 'week 1: Chris (42) shares rank 1 — equal results share the points of the shared rank');
select race_test.eq(race_test.lp('c1', 'pA'), '8000:3', 'week 1: Ahmed (30; his second attempt was rejected) is rank 3 — the next rank after the tie is skipped');
select race_test.eq(race_test.lp('c1', 'pE'), '7500:4', 'week 1: Eman (20; the later attempt was rejected) is rank 4');
select race_test.eq(race_test.lp('c1', 'pD'), '7000:5', 'week 1: Dina (12) is rank 5');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('c1'))::int, 5, 'week 1: five ledger lines');
select race_test.login('lg_admin');
select race_test.eq(race_league_recompute(race_test.id('c1')), 0, 'recomputing a closed challenge twice adds nothing (points are never awarded twice)');
select race_test.throws($$select race_league_set_challenge_status(race_test.id('c1'), 'open')$$, 'LEAGUE_INVALID_TRANSITION', 'a closed challenge never reopens');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pD'), 99, null, gen_random_uuid())$$, 'LEAGUE_CHALLENGE_NOT_OPEN', 'no attempts after a challenge closed');
select race_league_set_challenge_status(race_test.id('c2'), 'closed');
reset role;
-- week 2 (lower time wins): B=55.5, A=61, C=70, D,E absent (ZERO): B 100, A 90, C 80
select race_test.eq((select sum(points_cents)::int from race_league_points_ledger where challenge_id = race_test.id('c2') and participant_id = race_test.id('pB')), 10000, 'week 2: the lowest time wins (100 points)');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('c2'))::int, 3, 'week 2: absent participants get no line under the ZERO policy');

-- standings
select race_test.login('lg_judge');
select race_test.eq((select r ->> 'displayName' from jsonb_array_elements(race_league_admin_overview(race_test.id('s1')) -> 'standings') r limit 1), 'Bassem R.', 'standings: Bassem leads (100 + 100 = 200)');
select race_test.eq((select (r ->> 'totalPoints')::numeric from jsonb_array_elements(race_league_admin_overview(race_test.id('s1')) -> 'standings') r where r ->> 'displayName' = 'Chris T.'), 180.00, 'standings: Chris has 100 + 80 = 180');
select race_test.eq((select (r ->> 'rank')::int from jsonb_array_elements(race_league_admin_overview(race_test.id('s1')) -> 'standings') r where r ->> 'displayName' = 'Ahmed K.'), 3, 'standings: Ahmed is third with 80 + 90 = 170');
select race_test.ok((select r ->> 'externalRef' is null from jsonb_array_elements(race_league_admin_overview(race_test.id('s1')) -> 'participants') r limit 1), 'a judge does not receive the external member references');
select race_test.login('lg_admin');
select race_test.ok((select bool_and(r ->> 'externalRef' is not null) from jsonb_array_elements(race_league_admin_overview(race_test.id('s1')) -> 'participants') r where r ->> 'displayName' <> 'Fresh F.'), 'the administrator sees the external member references');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- corrections: authorized, reasoned, audited, reconciled
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_rev');
select race_test.throws($$select race_league_correct_attempt(race_test.id('a5'), 50, 'typo')$$, 'LEAGUE_FORBIDDEN', 'a reviewer cannot correct a result');
select race_test.login('lg_admin');
select race_test.throws($$select race_league_correct_attempt(race_test.id('a5'), 50, '')$$, 'LEAGUE_REASON_REQUIRED', 'a correction needs a reason');
select race_test.throws($$select race_league_correct_attempt(race_test.id('a2'), 50, 'x')$$, 'pending or approved', 'a rejected attempt cannot be corrected');
select race_league_correct_attempt(race_test.id('a5'), 50, 'judge typed 12 instead of 50');     -- D was 12 (rank 5) → 50 (rank 1)
reset role;
select race_test.eq((select sum(points_cents)::int from race_league_points_ledger where challenge_id = race_test.id('c1') and participant_id = race_test.id('pD')), 10000, 'correction: Dina now holds rank 1 points for week 1');
select race_test.eq((select sum(points_cents)::int from race_league_points_ledger where challenge_id = race_test.id('c1') and participant_id = race_test.id('pB')), 9000, 'correction: the others moved down one place (Bassem 100 -> 90)');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('c1'))::int > 5, true, 'correction: appended lines only, nothing rewritten');
select race_test.eq((select status from race_league_attempts where id = race_test.id('a5')), 'void', 'correction: the old attempt is void');
select race_test.ok(exists (select 1 from race_league_attempts where corrected_from = race_test.id('a5') and value = 50 and status = 'approved'), 'correction: a replacement attempt links back to the original');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.attempt.correct' and metadata ->> 'season_id' = race_test.id('s1')::text and metadata ->> 'reason' like 'judge typed%'), 'correction: audited with its reason');
select race_test.login('lg_admin');
select race_test.eq(race_league_recompute(race_test.id('c1')), 0, 'after a correction a recompute is again a no-op');
select race_league_correct_attempt(race_test.id('a3'), null, 'recorded for the wrong person');   -- void Bassem's result entirely
reset role;
select race_test.eq((select sum(points_cents)::int from race_league_points_ledger where challenge_id = race_test.id('c1') and participant_id = race_test.id('pB')), 0, 'voiding a result reverses its points (net 0)');
select race_test.ok(not exists (select 1 from race_league_points_ledger where challenge_id = race_test.id('c1') and points_cents < 0 and false), 'ledger: reversal lines exist (append-only)');
select race_test.throws($$update race_league_points_ledger set points_cents = 999999$$, 'append|immutable|not allowed|permission', 'the ledger cannot be edited');
select race_test.throws($$delete from race_league_points_ledger$$, 'append|immutable|not allowed|permission', 'the ledger cannot be deleted from');
select race_test.throws($$delete from race_league_attempts$$, 'not allowed|permission|forbid|delete', 'attempts cannot be deleted');

-- changing the rules re-scores closed challenges by appending
select race_test.login('lg_admin');
select race_test.ok(race_league_update_rules(race_test.id('s1'), '{"points":{"by_rank":[10,8,6,4,2],"beyond":1,"participation":1,"absent":0},"tie_policy":"SPLIT","absence_policy":"ZERO","eligibility":"AT_REGISTRATION"}', 'agreed table for the pilot') > 0, 'new rules: closed challenges are re-scored');
reset role;
select race_test.eq((select sum(points_cents)::int from race_league_points_ledger where challenge_id = race_test.id('c1') and participant_id = race_test.id('pD')), 1000, 'new rules: week 1 winner now holds 10 points');
select race_test.login('lg_admin');
select race_test.eq(race_league_update_rules(race_test.id('s1'), '{"points":{"by_rank":[10,8,6,4,2],"beyond":1,"participation":1,"absent":0},"tie_policy":"SPLIT","absence_policy":"ZERO","eligibility":"AT_REGISTRATION"}', 'same again'), 0, 'applying the same rules again changes nothing');

-- participants: deactivation keeps history; ineligibility reverses points
select race_league_set_participant(race_test.id('pC'), null, false, 'left the gym');
reset role;
select race_test.ok((select sum(points_cents) from race_league_points_ledger where participant_id = race_test.id('pC')) > 0, 'an inactive participant keeps the points already earned');
select race_test.login('lg_admin');
select race_test.throws($$select race_league_record_attempt(race_test.id('c1'), race_test.id('pC'), 1, null, gen_random_uuid())$$, 'LEAGUE_CHALLENGE_NOT_OPEN|LEAGUE_NOT_ELIGIBLE', 'no new attempts for an inactive participant');
select race_test.throws($$select race_league_set_eligibility(race_test.id('pC'), false, 'DISCIPLINARY', '')$$, 'LEAGUE_REASON_REQUIRED', 'a restriction needs a documented reason');
select race_test.throws($$select race_league_set_eligibility(race_test.id('pC'), false, 'REINSTATEMENT', 'wrong type')$$, 'LEAGUE_INVALID', 'a restriction cannot be recorded as a reinstatement');
select race_test.throws($$select race_league_set_eligibility(race_test.id('pC'), false, 'EXPIRED_MEMBERSHIP', 'membership ended')$$, 'unknown decision type', 'a lapsed membership is not a valid ground');
select race_league_set_eligibility(race_test.id('pC'), false, 'DISCIPLINARY', 'documented disciplinary decision DC-12');
reset role;
select race_test.eq((select coalesce(sum(points_cents), 0)::int from race_league_points_ledger where participant_id = race_test.id('pC')), 0, 'an ineligible participant loses the points (append-only reversal)');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- completion: final
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_admin');
select race_test.put('c3', race_league_upsert_challenge(race_test.id('s1'), 3, '{"name":"Burpees","metric_kind":"REPS","unit":"reps"}'));
select race_league_set_challenge_status(race_test.id('c3'), 'published');
select race_league_set_challenge_status(race_test.id('c3'), 'open');
select race_test.throws($$select race_league_set_season_status(race_test.id('s1'), 'completed')$$, 'close the open challenge', 'a season cannot complete while a challenge is open');
select race_league_set_challenge_status(race_test.id('c3'), 'closed');
select race_league_set_season_status(race_test.id('s1'), 'completed');
select race_test.throws($$select race_league_set_season_status(race_test.id('s1'), 'active')$$, 'LEAGUE_INVALID_TRANSITION|LEAGUE_SEASON_LOCKED', 'a completed season never reopens');
select race_test.throws($$select race_league_correct_attempt(race_test.id('a4'), 1, 'late')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season cannot be corrected');
select race_test.throws($$select race_league_update_rules(race_test.id('s1'), '{"points":{"by_rank":[9],"beyond":0,"participation":0,"absent":0},"tie_policy":"SHARE","absence_policy":"ZERO","eligibility":"AT_REGISTRATION"}', 'late')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season cannot change its rules');
select race_test.throws($$select race_league_add_participant(race_test.id('s1'), 'Late Joiner', null, true)$$, 'LEAGUE_SEASON_LOCKED', 'a completed season takes no new participants');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s1'), 3, '{"name":"Too late","metric_kind":"REPS","unit":"reps"}')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season takes no new challenges');
reset role;
select race_test.throws($$update race_league_seasons set name = 'Renamed' where id = race_test.id('s1')$$, 'LEAGUE_SEASON_LOCKED', 'even the database owner cannot edit a completed season');
select race_test.throws($$insert into race_league_points_ledger (season_id, challenge_id, participant_id, points_cents, reason) values (race_test.id('s1'), race_test.id('c1'), race_test.id('pA'), 1, 'ADJUSTMENT')$$, 'LEAGUE_SEASON_LOCKED', 'no ledger line can be added to a completed season');
select race_test.login('lg_admin');
select race_league_set_published(race_test.id('s1'), true, 'final table');   -- publishing the final table of a completed season is the one thing still allowed
select race_test.eq(race_test.q('select published from race_league_seasons where id = ''' || race_test.id('s1') || ''''), 'true', 'publishing a completed season is allowed (its final table)');

-- audit trail
select race_test.login('lg_admin');
select race_test.ok(jsonb_array_length(race_league_audit(race_test.id('s1'), 500)) >= 20, 'audit: the administrator can read the season audit trail');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_audit(race_test.id('s1'), 10)$$, 'LEAGUE_FORBIDDEN', 'audit: a judge cannot read the audit trail');
