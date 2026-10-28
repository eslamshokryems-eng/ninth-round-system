-- Fixtures for the PARALLEL-SESSION checks of the station layouts in league.sh (real concurrent connections cannot be done from one SQL file).
reset role;
select race_test.make_user('sc_judge', '');
insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
  values ('concurrency-stations', 'Concurrency stations', 'active', date '2026-11-02', date '2026-12-27', race_league_default_rules(), (select id from race_test.fx where key = 'super'));
select race_test.put('sc_season', (select id from race_league_seasons where public_slug = 'concurrency-stations'));
insert into race_league_staff (season_id, profile_id, role) values (race_test.id('sc_season'), race_test.id('sc_judge'), 'JUDGE');
insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, max_attempts, counting, requires_verification, status) values
  (race_test.id('sc_season'), 1, 'Dup', 'REPS', 'reps', 'HIGHER_WINS', 2, 'BEST', false, 'open'),
  (race_test.id('sc_season'), 2, 'Limit', 'REPS', 'reps', 'HIGHER_WINS', 2, 'BEST', false, 'open'),
  (race_test.id('sc_season'), 3, 'Swap', 'REPS', 'reps', 'HIGHER_WINS', 2, 'BEST', false, 'open'),
  (race_test.id('sc_season'), 4, 'Late', 'REPS', 'reps', 'HIGHER_WINS', 3, 'BEST', false, 'open');
select race_test.put('sc_c' || w, (select id from race_league_challenges where season_id = race_test.id('sc_season') and week_number = w)) from generate_series(1, 4) w;
insert into race_league_participants (season_id, display_name, identity_key) select race_test.id('sc_season'), 'Racer ' || g, 'name:racer ' || g from generate_series(1, 6) g;
select race_test.put('sc_p1', (select id from race_league_participants where season_id = race_test.id('sc_season') and display_name = 'Racer 1'));
select race_test.put('sc_p2', (select id from race_league_participants where season_id = race_test.id('sc_season') and display_name = 'Racer 2'));
-- three REPS stations for weeks 1-3 (a layout in place before any attempt); week 4 gets none: the first layout will RACE concurrent attempts
select race_test.login('super');
select race_league_set_layout(race_test.id('sc_c' || w), '{"result_type":"REPS","stations":[{"name":"A","exercises":[{"name":"One"}]},{"name":"B","exercises":[{"name":"Two"}]},{"name":"C","exercises":[{"name":"Three"}]}]}', 'concurrency fixture') from generate_series(1, 3) w;
reset role;
select race_test.ok(true, 'station concurrency fixtures are ready');
