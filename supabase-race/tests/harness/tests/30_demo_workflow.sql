-- Private demo workflow: only authorized creators, demo flag, unguessable slug, labelled athletes, heats, lock, check-in, new run copies config.
reset role;
select race_test.login('plain_user');
select race_test.throws($$select race_create_demo_event('Nope')$$, 'RACE_FORBIDDEN', 'a user without event rights cannot create a demo');
select race_test.ok((race_my_access()->>'can_create_events')::boolean is not true, 'my_access reports no create right');
select race_test.anon();
select race_test.throws($$select race_create_demo_event('Nope')$$, 'permission denied', 'anon cannot create a demo');
select race_test.throws($$select race_my_access()$$, 'permission denied', 'anon cannot call my_access');

select race_test.login('super');
select race_test.ok((race_my_access()->>'is_super_admin')::boolean, 'super admin recognised');
select race_test.put('ev_d1', (race_create_demo_event('Demo One')->>'id')::uuid);
select race_test.ok((select is_demo and status = 'DRAFT' and slug like 'demo-%' and length(slug) = 17 from race_events where id = race_test.id('ev_d1')), 'demo event: flagged, draft, unguessable slug');
select race_test.ok(race_test.id('ev_d1') in (select (x->>'id')::uuid from jsonb_array_elements(race_my_access()->'events') x), 'creator sees the demo in the hub');
select race_test.login('bm_b');
select race_test.ok(race_test.id('ev_d1') not in (select (x->>'id')::uuid from jsonb_array_elements(race_my_access()->'events') x), 'other managers do not see it');
select race_test.throws($$select race_demo_add_athletes(race_test.id('ev_d1'), 3, 3)$$, 'RACE_FORBIDDEN', 'other managers cannot populate it');
select race_test.anon();
select race_test.ok(not exists (select 1 from race_events where id = race_test.id('ev_d1')), 'a draft demo is invisible to the public');

select race_test.login('super');
select race_test.throws($$select race_demo_add_athletes(race_test.id('event_a'), 3, 3)$$, 'RACE_NOT_DEMO', 'demo tools refuse a real event');
select race_test.throws($$select race_demo_add_athletes(race_test.id('ev_d1'), 0, 3)$$, 'RACE_CONFIG_INVALID', 'count validated');
select race_test.eq((race_demo_add_athletes(race_test.id('ev_d1'), 7, 3)->>'heats')::int, 3, '7 athletes in heats of 3 = 3 heats');
select race_test.ok((select count(*) = 7 and bool_and(a.full_name like 'DEMO %') from race_registrations r join race_athletes a on a.id = r.athlete_id where r.event_id = race_test.id('ev_d1')), 'athletes are clearly labelled DEMO');
select race_test.eq((select count(distinct c.code) from race_registrations r join race_categories c on c.id = r.category_id where r.event_id = race_test.id('ev_d1'))::int, 3, 'all three categories are present');
select race_test.ok((select count(*) from race_registrations where event_id = race_test.id('ev_d1') and heat_id is not null) = 7, 'every athlete has a heat');
select race_test.throws($$select race_demo_checkin_all(race_test.id('ev_d1'))$$, 'RACE_CHECKIN_NOT_OPEN', 'check-in needs locked heats');
select race_test.eq((race_demo_lock_heats(race_test.id('ev_d1'))->>'status'), 'HEATS_LOCKED', 'heats locked');
select race_test.throws($$select race_demo_add_athletes(race_test.id('ev_d1'), 1, 3)$$, 'RACE_DEMO_LOCKED', 'no athletes after the lock');
select race_test.eq((race_demo_checkin_all(race_test.id('ev_d1'))->>'checked_in')::int, 7, 'all demo athletes checked in');
select race_test.eq((race_demo_status(race_test.id('ev_d1'))->>'checked_in')::int, 7, 'status reports the check-ins');

-- new run: copies the (customised) configuration; the previous run is untouched
select race_test.login('super');
select race_update_station_config(race_test.id('ev_d1'), 5, '{"exercise_name":"Plyo box jump"}', 'custom');
select race_test.put('ev_d2', (race_create_demo_event('Demo Two', race_test.id('ev_d1'))->>'id')::uuid);
select race_test.eq((race_station_display(race_test.id('ev_d2'), 5)->>'exercise_name'), 'Plyo box jump', 'a new run copies the customised configuration');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_d2'))::int, 0, 'a new run starts with no athletes (previous run untouched)');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_d1'))::int, 7, 'the previous run keeps its athletes and history');
reset role;
select race_test.ok((select count(*) from race_audit_log where action like 'race.demo.%') >= 3, 'demo actions are audited');
select race_test.login('bm_b');
select race_test.throws($$select race_create_demo_event('Copy attempt', race_test.id('event_a'))$$, 'RACE_FORBIDDEN', 'cannot copy from an event you do not manage');
