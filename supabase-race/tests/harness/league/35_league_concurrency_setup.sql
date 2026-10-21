-- Fixtures for the PARALLEL-SESSION checks in league.sh (real concurrent connections cannot be done from one SQL file).
reset role;
select race_test.make_user('cc_judge', '');
insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
  values ('concurrency-season', 'Concurrency', 'active', date '2026-11-02', date '2026-12-27', race_league_default_rules(), (select id from race_test.fx where key = 'super'));
select race_test.put('cc_season', (select id from race_league_seasons where public_slug = 'concurrency-season'));
insert into race_league_staff (season_id, profile_id, role) values (race_test.id('cc_season'), race_test.id('cc_judge'), 'JUDGE');
insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, max_attempts, counting, requires_verification, status) values
  (race_test.id('cc_season'), 1, 'Dup', 'REPS', 'reps', 'HIGHER_WINS', 2, 'BEST', false, 'open'),
  (race_test.id('cc_season'), 2, 'Limit', 'REPS', 'reps', 'HIGHER_WINS', 2, 'BEST', false, 'open'),
  (race_test.id('cc_season'), 3, 'Close', 'REPS', 'reps', 'HIGHER_WINS', 3, 'BEST', false, 'open');
select race_test.put('cc_c1', (select id from race_league_challenges where season_id = race_test.id('cc_season') and week_number = 1));
select race_test.put('cc_c2', (select id from race_league_challenges where season_id = race_test.id('cc_season') and week_number = 2));
select race_test.put('cc_c3', (select id from race_league_challenges where season_id = race_test.id('cc_season') and week_number = 3));
insert into race_league_participants (season_id, display_name, identity_key) select race_test.id('cc_season'), 'Runner ' || g, 'name:runner ' || g from generate_series(1, 6) g;
select race_test.put('cc_p1', (select id from race_league_participants where season_id = race_test.id('cc_season') and display_name = 'Runner 1'));
select race_test.put('cc_p2', (select id from race_league_participants where season_id = race_test.id('cc_season') and display_name = 'Runner 2'));
-- week 3 results for the parallel close: six approved attempts
insert into race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, reviewed_by, status, client_request_id)
  select race_test.id('cc_season'), race_test.id('cc_c3'), p.id, 10 + row_number() over (order by p.display_name), 'reps', 1, now(), race_test.id('cc_judge'), race_test.id('super'), 'approved', gen_random_uuid()
    from race_league_participants p where p.season_id = race_test.id('cc_season');
select race_test.ok(true, 'concurrency fixtures are ready');

-- role management under concurrency: a LIVE season with three administrators; two parallel removals must never leave fewer than two (see league.sh)
reset role;
select race_test.make_user('cc_adm1', ''); select race_test.make_user('cc_adm2', ''); select race_test.make_user('cc_adm3', '');
insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
  values ('concurrency-roles', 'Concurrency roles', 'active', date '2026-11-02', date '2026-12-27', race_league_default_rules(), (select id from race_test.fx where key = 'super'));
select race_test.put('cc_roles', (select id from race_league_seasons where public_slug = 'concurrency-roles'));
insert into race_league_staff (season_id, profile_id, role) select race_test.id('cc_roles'), race_test.id(k), 'LEAGUE_ADMIN' from (values ('cc_adm1'), ('cc_adm2'), ('cc_adm3')) v(k);
select race_test.ok(true, 'role concurrency fixtures are ready');
