-- Shared fixtures. Real API paths are used wherever Phase 3 provides one
-- (event creation, status, heats, staff assignment go through the same
-- RPC/RLS path a client would). Rows whose writers arrive in later phases
-- (registrations, slots, results, ledger) are inserted as the DB owner.
\set QUIET on
reset role;

with x as (insert into branches (name) values ('Race Branch A') returning id)
insert into race_test.fx (key, id) select 'branch_a', id from x;
with x as (insert into branches (name) values ('Race Branch B') returning id)
insert into race_test.fx (key, id) select 'branch_b', id from x;
insert into race_test.fx values ('super', 'aea7db27-3aaa-4701-aed2-f1b49127bdda');

select race_test.make_user('bm_a',          'branch_manager', race_test.id('branch_a'));
select race_test.make_user('bm_b',          'branch_manager', race_test.id('branch_b'));
select race_test.make_user('gym_reception', 'reception',      race_test.id('branch_a'));
select race_test.make_user('rec',           'reception',      race_test.id('branch_a'));
select race_test.make_user('judge1',        'member',         null);
select race_test.make_user('judge4',        'member',         null);
select race_test.make_user('master',        'coach',          race_test.id('branch_a'));
select race_test.make_user('screen1',       'member',         null);
select race_test.make_user('em2',           'member',         null);
select race_test.make_user('athlete_user',  'member',         null);
select race_test.make_user('nobody',        'member',         null);

-- Events via the real RPC (creator becomes EVENT_MANAGER).
select race_test.login('bm_a');
select race_test.put('event_a', race_create_event(race_test.id('branch_a'), 'the-ninth-cairo-2026', date '2026-11-20',
                                                  'THE NINTH', 'Africa/Cairo', timestamptz '2026-11-20 07:00:00+00'));
select race_set_event_status(race_test.id('event_a'), 'REGISTRATION_OPEN');
insert into race_heats (event_id, number) values (race_test.id('event_a'), 1), (race_test.id('event_a'), 2);

-- Race staff assigned by the event manager through RLS.
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('event_a'), race_test.id(k), r::race_role,
       (select id from race_stations where event_id = race_test.id('event_a') and number = s)
from (values ('rec', 'RECEPTION', null::int), ('judge1', 'JUDGE', 1), ('judge4', 'JUDGE', 4),
             ('master', 'MASTER_CONTROL', null), ('screen1', 'STATION_SCREEN', 1)) v(k, r, s);

select race_test.login('bm_b');
select race_test.put('event_b', race_create_event(race_test.id('branch_b'), 'the-ninth-alex-2026', date '2026-12-05'));

reset role;
select race_test.put('heat1', (select id from race_heats where event_id = race_test.id('event_a') and number = 1));
select race_test.put('heat2', (select id from race_heats where event_id = race_test.id('event_a') and number = 2));
select race_test.put('s1', (select id from race_stations where event_id = race_test.id('event_a') and number = 1));
select race_test.put('s4', (select id from race_stations where event_id = race_test.id('event_a') and number = 4));
select race_test.put('men', (select id from race_categories where event_id = race_test.id('event_a') and code = 'MEN'));

-- 10 athletes: N001–N009 in heat 1, N010 in heat 2. N001 is linked to athlete_user.
insert into race_athletes (id, profile_id, full_name, phone, gender)
select gen_random_uuid(), case when i = 1 then race_test.id('athlete_user') end, 'Athlete ' || i, '0100000' || lpad(i::text, 4, '0'), 'male'
from generate_series(1, 10) i;
insert into race_registrations (event_id, athlete_id, category_id, heat_id, race_number, status, pushup_style)
select race_test.id('event_a'), a.id, race_test.id('men'),
       case when a.full_name = 'Athlete 10' then race_test.id('heat2') else race_test.id('heat1') end,
       'N' || lpad(substr(a.full_name, 9), 3, '0'), 'CONFIRMED', 'STANDARD'
from race_athletes a where a.full_name like 'Athlete %';
select race_test.put('reg1', (select id from race_registrations where race_number = 'N001'));
select race_test.put('reg2', (select id from race_registrations where race_number = 'N002'));
select race_test.put('reg10', (select id from race_registrations where race_number = 'N010'));

insert into race_payments (event_id, registration_id, amount, status, method, paid_at, recorded_by)
values (race_test.id('event_a'), race_test.id('reg1'), 1500, 'PAID', 'CASH', now(), race_test.id('rec'));
insert into race_check_ins (event_id, registration_id, heat_id, checked_in_by, kind)
values (race_test.id('event_a'), race_test.id('reg1'), race_test.id('heat1'), race_test.id('rec'), 'ON_TIME');

-- A bound slot + S01 and S04 results for N001, one judge action each.
insert into race_start_slots (event_id, heat_id, slot_index, registration_id, status, bound_at)
values (race_test.id('event_a'), race_test.id('heat1'), 0, race_test.id('reg1'), 'BOUND', now());
select race_test.put('slot1', (select id from race_start_slots where registration_id = race_test.id('reg1')));
insert into race_station_results (event_id, registration_id, station_id, slot_id, window_start_race_ms, window_end_race_ms)
select race_test.id('event_a'), race_test.id('reg1'), race_test.id(s), race_test.id('slot1'), w.work_start_ms, w.work_end_ms
from (values ('s1', 1), ('s4', 4)) v(s, n), race_station_window(60000, v.n) w;
select race_test.put('res_s1', (select id from race_station_results where station_id = race_test.id('s1')));
select race_test.put('res_s4', (select id from race_station_results where station_id = race_test.id('s4')));
insert into race_performance_events (event_id, station_id, station_result_id, type, client_event_id, origin,
                                     server_race_ms, judge_profile_id, status)
values (race_test.id('event_a'), race_test.id('s1'), race_test.id('res_s1'), 'REP', gen_random_uuid(), 'ONLINE', 61000, race_test.id('judge1'), 'ACCEPTED'),
       (race_test.id('event_a'), race_test.id('s4'), race_test.id('res_s4'), 'REP', gen_random_uuid(), 'ONLINE', 691000, race_test.id('judge4'), 'ACCEPTED');
select race_test.put('pe_s1', (select id from race_performance_events where station_id = race_test.id('s1')));

insert into race_rankings (event_id, category_id, registration_id, version, station_placements, total_points, overall_rank, is_official)
values (race_test.id('event_a'), race_test.id('men'), race_test.id('reg1'), 1, '{"1":1}', 9, 1, false),
       (race_test.id('event_a'), race_test.id('men'), race_test.id('reg1'), 2, '{"1":1}', 9, 1, true);

select race_test.ok(true, 'fixtures: 2 branches, 12 users, 2 events via race_create_event, 2 heats, 5 race staff, 10 registrations');
