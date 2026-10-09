-- A private demo is NOT public: knowing the slug or the id grants nothing. Anonymous and unrelated signed-in users see nothing, at every status
-- (ev_d1 = HEATS_LOCKED with athletes, ev_sc = LIVE); its own staff and the Super Admin see everything; real (non-demo) events are unchanged.
reset role;
select race_test.make_user('dp_judge_other', '');
create function race_test.dp_slug(p_key text) returns text language sql stable as $$ select slug from race_events where id = race_test.id(p_key) $$;
create table race_test.t31 (k text primary key, v text);
grant all on race_test.t31 to anon, authenticated;
insert into race_test.t31 values ('d1', race_test.dp_slug('ev_d1')), ('sc', race_test.dp_slug('ev_sc'));
create function race_test.dp_s(p_k text) returns text language sql stable security definer as $$ select v from race_test.t31 where k = p_k $$;
grant execute on function race_test.dp_s(text) to anon, authenticated;
-- a staff member of a DIFFERENT event, to prove roles elsewhere grant nothing here
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('event_a'), race_test.id('dp_judge_other'), 'JUDGE', (select id from race_stations where event_id = race_test.id('event_a') and number = 1);

-- ---------- anonymous: denied everywhere ----------
select race_test.anon();
select race_test.eq(race_test.count($$select * from race_get_public_event(race_test.dp_s('d1'))$$)::int, 0, 'anon: the public event lookup by slug finds nothing (locked demo)');
select race_test.eq(race_test.count($$select * from race_get_public_event(race_test.dp_s('sc'))$$)::int, 0, 'anon: the public event lookup by slug finds nothing (live demo)');
select race_test.eq(race_test.count($$select 1 from race_events where is_demo$$)::int, 0, 'anon: race_events shows no demo row');
select race_test.eq(race_test.count($$select 1 from race_stations where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo stations');
select race_test.eq(race_test.count($$select 1 from race_station_rules where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo station rules');
select race_test.eq(race_test.count($$select 1 from race_categories where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo categories');
select race_test.eq(race_test.count($$select 1 from race_heats where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo heats');
select race_test.eq(race_test.count($$select 1 from race_clock where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo clock');
select race_test.eq(race_test.count($$select 1 from race_rankings where event_id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 0, 'anon: no demo rankings');
select race_test.throws($$select 1 from race_registrations where event_id = race_test.id('ev_d1')$$, 'permission denied', 'anon: registrations / athletes are not readable at all');
select race_test.throws($$select * from race_event_schedule(race_test.id('ev_d1'))$$, 'RACE_NOT_FOUND', 'anon: the demo schedule is refused');
select race_test.throws($$select * from race_server_time(race_test.id('ev_sc'))$$, 'RACE_NOT_FOUND', 'anon: the demo server clock is refused');
select race_test.ok(not (race_leaderboard(race_test.id('ev_sc'))->>'available')::boolean, 'anon: the demo leaderboard is unavailable even while LIVE');
select race_test.ok(race_now_ms(race_test.id('ev_sc')) is null, 'anon: race_now_ms of a demo is null');
select race_test.ok(race_event_accepts_judges(race_test.id('ev_d1')) is not true, 'anon: a demo does not "accept judges"');
select race_test.ok(race_results_public(race_test.id('ev_sc')) is not true, 'anon: demo results are never public');
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_d1'), 'Intruder One', '+201000000001', null, 'male', date '1999-01-01', 'MEN', null, true, '{"name":"x","phone":"+201000000002"}')$$,
  'RACE_REGISTRATION_CLOSED', 'anon: public registration into a demo is refused');
select race_test.throws($$select race_demo_status(race_test.id('ev_d1'))$$, 'permission denied', 'anon: demo status RPC is closed');
select race_test.throws($$select race_get_station_config(race_test.id('ev_d1'))$$, 'permission denied', 'anon: station config RPC is closed');
select race_test.throws($$select race_station_display(race_test.id('ev_sc'), 2)$$, 'permission denied', 'anon: station display RPC is closed');

-- ---------- signed-in but unauthorized: denied (also when the account may create events or has a role on ANOTHER event) ----------
select race_test.login('plain_user');
select race_test.eq(race_test.count($$select 1 from race_events where is_demo$$)::int, 0, 'plain user: no demo row');
select race_test.eq(race_test.count($$select * from race_get_public_event(race_test.dp_s('sc'))$$)::int, 0, 'plain user: lookup by slug finds nothing');
select race_test.throws($$select race_get_station_config(race_test.id('ev_sc'))$$, 'RACE_FORBIDDEN', 'plain user: station config refused');
select race_test.ok(not exists (select 1 from jsonb_array_elements(race_my_access()->'events') x where (x->>'is_demo')::boolean), 'plain user: the admin hub lists no demo');
select race_test.login('bm_b');              -- may create events, manages event_b only
select race_test.eq(race_test.count($$select 1 from race_events where is_demo$$)::int, 0, 'other event creator: no demo row (creating events grants no view of someone else''s demo)');
select race_test.eq(race_test.count($$select 1 from race_stations where event_id = race_test.id('ev_sc')$$)::int, 0, 'other event creator: no demo stations');
select race_test.eq(race_test.count($$select * from race_get_public_event(race_test.dp_s('d1'))$$)::int, 0, 'other event creator: lookup by slug finds nothing');
select race_test.ok(not (race_leaderboard(race_test.id('ev_sc'))->>'available')::boolean, 'other event creator: demo leaderboard unavailable');
select race_test.throws($$select race_demo_checkin_all(race_test.id('ev_d1'))$$, 'RACE_FORBIDDEN', 'other event creator: cannot drive the demo');
select race_test.login('dp_judge_other');    -- a judge, but of event_a
select race_test.eq(race_test.count($$select 1 from race_events where is_demo$$)::int, 0, 'judge of another event: no demo row');
select race_test.throws($$select race_station_display(race_test.id('ev_sc'), 2)$$, 'RACE_FORBIDDEN', 'judge of another event: station display refused');
select race_test.ok(race_now_ms(race_test.id('ev_sc')) is null, 'judge of another event: demo clock hidden');

-- ---------- authorized: works ----------
select race_test.login('bm_a');              -- creator = Event Manager of ev_sc (ev_d1 belongs to the Super Admin)
select race_test.eq(race_test.count($$select 1 from race_events where id = race_test.id('ev_sc')$$)::int, 1, 'manager: sees the demo they run');
select race_test.eq(race_test.count($$select 1 from race_events where id = race_test.id('ev_d1')$$)::int, 0, 'manager: does NOT see a demo created and run by someone else');
select race_test.eq(race_test.count($$select * from race_get_public_event(race_test.dp_s('sc'))$$)::int, 1, 'manager: lookup by slug works');
select race_test.eq(race_test.count($$select 1 from race_stations where event_id = race_test.id('ev_sc')$$)::int, 9, 'manager: sees the nine demo stations');
select race_test.ok((race_leaderboard(race_test.id('ev_sc'))->>'available')::boolean, 'manager: demo leaderboard available (LIVE)');
select race_test.ok((race_station_display(race_test.id('ev_sc'), 2)->>'name') is not null, 'manager: station display works');
select race_test.ok(race_now_ms(race_test.id('ev_sc')) is not null, 'manager: demo clock readable');
select race_test.login('sc_judge');          -- a staff member of ev_sc
select race_test.eq(race_test.count($$select 1 from race_stations where event_id = race_test.id('ev_sc')$$)::int, 9, 'demo staff (judge): sees the stations');
select race_test.ok((race_station_display(race_test.id('ev_sc'), 2)->>'name') is not null, 'demo staff (judge): station display works');
select race_test.login('super');
select race_test.eq(race_test.count($$select 1 from race_events where id in (race_test.id('ev_d1'), race_test.id('ev_sc'))$$)::int, 2, 'super admin: sees every demo');
select race_test.ok(exists (select 1 from jsonb_array_elements(race_my_access()->'events') x where (x->>'is_demo')::boolean), 'super admin: the hub lists demos');

-- ---------- real events are unchanged ----------
select race_test.anon();
select race_test.ok(race_test.count($$select * from race_get_public_event('the-ninth-cairo-2026')$$) = 1, 'anon: a real published event is still publicly readable by slug');
select race_test.ok(race_test.count($$select 1 from race_stations where event_id = race_test.id('event_a')$$) = 9, 'anon: a real published event keeps its public station list');
select race_test.ok(race_test.count($$select 1 from race_events where slug = 'the-ninth-alex-2026'$$) = 0, 'anon: a real DRAFT event is still hidden');
select race_test.login('bm_b');
select race_test.ok(race_test.count($$select 1 from race_events where id = race_test.id('event_a')$$) = 1, 'event creators still see other real events (unchanged)');
