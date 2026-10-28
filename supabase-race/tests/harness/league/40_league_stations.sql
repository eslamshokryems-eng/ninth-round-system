-- THE NINTH League — STATION LAYOUTS (PROPOSED migration 20261101000002): authorization, validation, versions, judging, review, ties, corrections, void, immutability,
-- the commit-time rule, privacy, and independence from the race engine. Runs in the throw-away race_league_test database, after suites 32-39.
reset role;
select race_test.make_user('st_creator', 'C');      -- may create seasons: becomes LEAGUE_ADMIN of the one it creates
select race_test.make_user('st_admin_b', '');       -- the second, independent administrator every live season needs
select race_test.make_user('st_judge', '');
select race_test.make_user('st_judge2', '');
select race_test.make_user('st_rev', '');
select race_test.make_user('st_plain', '');         -- an account with no league role
select race_test.make_user('st_other', 'C');        -- administrator of a DIFFERENT season
select race_test.make_user('st_race', 'C');         -- creates a real race event (the independence fingerprint)

-- reads a value as the database owner
create function race_test.sv(variadic p numeric[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('position', i, 'value', v) order by i) from unnest(p) with ordinality t(v, i) $$;
grant execute on function race_test.sv(numeric[]) to public;
create table race_test.st_json (key text primary key, doc jsonb not null);
grant select on race_test.st_json to public;
create function race_test.st(p text) returns jsonb language sql stable as $$ select doc from race_test.st_json where key = p $$;
grant execute on function race_test.st(text) to public;
-- like race_test.throws, but the statement must be refused when the DEFERRED constraints are checked (what COMMIT does)
create function race_test.throws_at_commit(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    execute 'set constraints all immediate';
  exception when others then
    if p_expect is null or exists (select 1 from unnest(string_to_array(p_expect, '|')) x where sqlerrm ilike '%' || x || '%') then
      raise notice 'PASS  % [refused at commit: %]', p_label, left(sqlerrm, 80);
      return;
    end if;
    raise exception 'FAIL: % — expected error containing "%", got "%"', p_label, p_expect, sqlerrm;
  end;
  raise exception 'FAIL: % — expected the statement to be refused at commit, but it succeeded', p_label;
end $$;
grant execute on function race_test.throws_at_commit(text, text, text) to public;
-- a fingerprint of the race engine's tables (rows, not counts): it must not move when the League runs
create function race_test.race_fingerprint() returns text language plpgsql as $$
declare t text; v text; out text := '';
begin
  foreach t in array array['race_events', 'race_stations', 'race_heats', 'race_clock', 'race_start_slots', 'race_station_results'] loop
    execute format('select count(*) || '':'' || md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) from public.%I x', t) into v;
    out := out || t || '=' || v || ';';
  end loop;
  return out;
end $$;
create table race_test.st_fp (label text primary key, fp text not null);

insert into race_test.st_json values
 ('L1', $j${"result_type":"REPS","stations":[
   {"name":"Pull-ups","max_value":50,"exercises":[{"name":"Strict pull-up","standard":"chin over the bar","equipment":"bar","target":"max reps"}]},
   {"name":"Squats","exercises":[{"name":"Air squat","standard":"hip below knee"},{"name":"Jump squat"}]},
   {"name":"Dips","max_value":40,"exercises":[{"name":"Bench dip"}]}]}$j$),
 ('L1b', $j${"result_type":"REPS","stations":[
   {"name":"Pull-ups","max_value":50,"exercises":[{"name":"Strict pull-up","standard":"chin over the bar","equipment":"bar","target":"max reps"}]},
   {"name":"Squats","exercises":[{"name":"Goblet squat","equipment":"kettlebell"}]},
   {"name":"Dips","max_value":40,"exercises":[{"name":"Bench dip"}]}]}$j$),
 ('L2', $j${"result_type":"TIME","stations":[{"name":"Row","exercises":[{"name":"Row 500 m"}]},{"name":"Ski","max_value":600,"exercises":[{"name":"Ski 500 m"}]}]}$j$),
 ('L3', $j${"result_type":"COMPLETION","stations":[{"name":"S1","exercises":[{"name":"Wall ball"}]},{"name":"S2","exercises":[{"name":"Lunge"}]},{"name":"S3","exercises":[{"name":"Burpee"}]},{"name":"S4","exercises":[{"name":"Sled push"}]}]}$j$),
 ('L4', $j${"result_type":"DISTANCE","stations":[{"name":"Carry","exercises":[{"name":"Farmer carry"}]},{"name":"Run","exercises":[{"name":"Shuttle run"}]}]}$j$),
 ('L6', $j${"result_type":"REPS","stations":[{"name":"Rounds","exercises":[{"name":"Burpee"}]},{"name":"Finisher","exercises":[{"name":"Mountain climber"}]}]}$j$);

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- independence first: a real race event exists BEFORE the League scenario; its fingerprint is compared at the end
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_race');
select race_test.put('st_event', race_create_event('stations-race-fp', date '2026-12-21'));
reset role;
insert into race_test.st_fp values ('before', race_test.race_fingerprint());
select race_test.ok((select count(*) from race_stations where event_id = race_test.id('st_event')) >= 9 and exists (select 1 from race_clock where event_id = race_test.id('st_event')),
  'independence: a real race event exists first (nine race stations and a race clock) — the fingerprint of the race tables is taken');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- structure + lock-down of the new objects
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results'))::int, 4,
  'structure: the four station-layout tables exist');
select race_test.ok(not exists (select 1 from pg_class c where c.relname in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results') and not c.relrowsecurity),
  'lock-down: RLS is enabled on the four station tables');
select race_test.ok(not exists (select 1 from information_schema.table_privileges where table_schema = 'public' and table_name in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results') and grantee in ('anon', 'authenticated', 'PUBLIC')),
  'lock-down: no client role holds any privilege on a station table');
select race_test.ok(not exists (select 1 from pg_policies where tablename in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results')), 'lock-down: no RLS policy on a station table');
select race_test.eq((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt', 'race_league_correct_station_attempt', 'race_league_station_breakdown')
   and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))::int, 5, 'lock-down: exactly the five entry points are callable by signed-in users, and anon cannot call any');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('race_league_layout_metric_ok', 'race_league_validate_layout', 'race_league_station_total', 'race_league_attempt_stations', 'race_league_check_station_attempt', 'race_league_guard_layout_metric')
   and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), 'lock-down: the validators, the breakdown reader and both triggers are executable by no client role');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt', 'race_league_correct_station_attempt', 'race_league_station_breakdown', 'race_league_station_total', 'race_league_attempt_stations')
   and not p.prosecdef), 'lock-down: the entry points and readers are SECURITY DEFINER (search_path pinned: asserted for every league function by suite 32)');
-- independence: nothing here points at, or reads, a race-engine object
select race_test.ok(not exists (select 1 from pg_constraint k join pg_class src on src.oid = k.conrelid join pg_class dst on dst.oid = k.confrelid
   where k.contype = 'f' and src.relname in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results')
     and dst.relname !~ '^race_league_' and dst.relname <> 'race_profiles'), 'independence: the station tables reference only League tables and the shared staff directory (race_profiles) — no race-engine table');
select race_test.ok(not exists (select 1 from pg_proc p join pg_class c on c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
   where p.pronamespace = 'public'::regnamespace and p.proname in ('race_league_layout_metric_ok', 'race_league_validate_layout', 'race_league_station_total', 'race_league_attempt_stations', 'race_league_check_station_attempt',
     'race_league_guard_layout_metric', 'race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt', 'race_league_correct_station_attempt', 'race_league_station_breakdown')
     and c.relname ~ '^race_' and c.relname !~ '^race_league_' and c.relname not in ('race_profiles', 'race_audit_log') and p.prosrc ~ ('\m' || c.relname || '\M')),
  'independence: no station function mentions a race-engine table (race_stations, race_events, race_clock, race_station_results, race_start_slots, ...)');
select race_test.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results')
   and column_name in ('display_name', 'full_name', 'email', 'identity_key', 'external_ref', 'participant_id', 'public_id')), 'privacy: the station tables store no athlete (no name, e-mail, identity key or participant column)');
select race_test.ok((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'race_league_attempts' and t.tgname = 'trg_race_league_attempt_stations' and t.tgdeferrable and t.tginitdeferred) = 1,
  'rule: the station check on attempts is a DEFERRED constraint trigger (checked at commit)');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- fixtures: a season with two administrators, judges, a reviewer, challenges of every supported type
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_creator');
select race_test.put('st_ss', race_league_create_season('stations-season', 'Stations Season', date '2026-11-02', date '2026-12-27'));
select race_test.login('st_other');
select race_test.put('st_ss_other', race_league_create_season('stations-other', 'Other Season', date '2026-11-02', date '2026-12-27'));
reset role;
insert into race_league_staff (season_id, profile_id, role) values
  (race_test.id('st_ss'), race_test.id('st_judge'), 'JUDGE'), (race_test.id('st_ss'), race_test.id('st_judge2'), 'JUDGE'),
  (race_test.id('st_ss'), race_test.id('st_rev'), 'REVIEWER'), (race_test.id('st_ss'), race_test.id('st_admin_b'), 'LEAGUE_ADMIN');
select race_test.login('st_creator');
select race_test.put('st_w1', race_league_upsert_challenge(race_test.id('st_ss'), 1, '{"name":"Strength circuit","metric_kind":"REPS","unit":"reps","max_attempts":2,"counting":"BEST","requires_verification":true}'));
select race_test.put('st_w2', race_league_upsert_challenge(race_test.id('st_ss'), 2, '{"name":"Row and ski","metric_kind":"TIME","unit":"s","max_attempts":2,"requires_verification":false}'));
select race_test.put('st_w3', race_league_upsert_challenge(race_test.id('st_ss'), 3, '{"name":"Checklist","metric_kind":"NUMERIC","unit":"count","max_attempts":1,"requires_verification":false}'));
select race_test.put('st_w4', race_league_upsert_challenge(race_test.id('st_ss'), 4, '{"name":"Carry and run","metric_kind":"DISTANCE","unit":"m","max_attempts":2,"requires_verification":false}'));
select race_test.put('st_w5', race_league_upsert_challenge(race_test.id('st_ss'), 5, '{"name":"Plain single result","metric_kind":"REPS","unit":"reps","max_attempts":2,"requires_verification":false}'));
select race_test.put('st_w6', race_league_upsert_challenge(race_test.id('st_ss'), 6, '{"name":"Finisher week","metric_kind":"REPS","unit":"reps","max_attempts":2,"requires_verification":false}'));
select race_test.put('st_w7', race_league_upsert_challenge(race_test.id('st_ss'), 7, '{"name":"Heavy lift","metric_kind":"LOAD","unit":"kg","max_attempts":2,"requires_verification":false}'));

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- configuring a layout: who may, and every bad request
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'first')$$, 'permission denied', 'anon cannot configure a layout');
select race_test.throws($$select race_league_get_layout(race_test.id('st_w1'))$$, 'permission denied', 'anon cannot read a layout');
select race_test.login('st_plain');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'first')$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot configure a layout');
select race_test.throws($$select race_league_get_layout(race_test.id('st_w1'))$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot read a layout');
select race_test.login('st_judge');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'first')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot configure a layout');
select race_test.login('st_rev');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'first')$$, 'LEAGUE_FORBIDDEN', 'a reviewer cannot configure a layout');
select race_test.login('st_other');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'first')$$, 'LEAGUE_FORBIDDEN', 'the administrator of ANOTHER season cannot configure this season''s layout');
select race_test.throws($$select race_league_get_layout(race_test.id('st_w1'))$$, 'LEAGUE_FORBIDDEN', 'the administrator of another season cannot read this layout');
select race_test.throws($$select race_league_station_breakdown(race_test.id('st_w1'))$$, 'LEAGUE_FORBIDDEN', 'the administrator of another season cannot read this breakdown');

select race_test.login('st_creator');
select race_test.throws($$select race_league_set_layout('00000000-0000-0000-0000-000000000001', race_test.st('L1'), 'first')$$, 'LEAGUE_NOT_FOUND', 'an unknown challenge is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), '')$$, 'LEAGUE_REASON_REQUIRED', 'a layout needs a reason');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), '   ')$$, 'LEAGUE_REASON_REQUIRED', 'a blank reason is no reason');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w7'), '{"result_type":"LOAD","stations":[{"name":"Lift","exercises":[{"name":"Deadlift"}]}]}', 'heavy')$$, 'result type must be', 'LOAD is refused, not guessed');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"MIXED","stations":[{"name":"A","exercises":[{"name":"x"}]}]}', 'mixed')$$, 'result type must be', 'a mixed type is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L2'), 'wrong type')$$, 'does not match this challenge', 'a TIME layout on a REPS challenge is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w3'), race_test.st('L1'), 'wrong type')$$, 'does not match this challenge', 'a REPS layout on a checklist challenge is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[{"name":"A","exercises":[{"name":"x"}],"id":"00000000-0000-0000-0000-000000000001"}]}', 'mass assignment')$$, 'unknown field id', 'mass assignment of an id is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[],"challenge_id":"x"}', 'mass assignment')$$, 'unknown layout field', 'an unknown top-level key is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[]}', 'empty')$$, '1 to 20 stations', 'a layout needs at least one station');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), (select jsonb_build_object('result_type', 'REPS', 'stations', jsonb_agg(jsonb_build_object('name', 'S' || g, 'exercises', jsonb_build_array(jsonb_build_object('name', 'E')))))
   from generate_series(1, 21) g), 'too many')$$, '1 to 20 stations', 'twenty-one stations are refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[{"name":"A","exercises":[]}]}', 'no exercises')$$, '1 to 5 exercises', 'a station needs an exercise');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[{"name":"<script>alert(1)</script>","exercises":[{"name":"x"}]}]}', 'markup')$$, 'without < >', 'markup in a name is refused');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[{"name":"=HYPERLINK(1)","exercises":[{"name":"x"}]}]}', 'formula')$$, 'cannot start with', 'a name that starts like a spreadsheet formula is refused');
select race_test.eq(race_test.q('select count(*) from race_league_layouts where challenge_id = ''' || race_test.id('st_w1') || '''')::int, 0, 'nothing was stored by any refused request');

-- the metric cannot change under a layout (checked while the challenge can still be edited)
select race_test.put('st_lay_w3', (race_league_set_layout(race_test.id('st_w3'), race_test.st('L3'), 'checklist of four stations') ->> 'layoutId')::uuid);
select race_test.throws($$select race_league_upsert_challenge(race_test.id('st_ss'), 3, '{"metric_kind":"REPS","unit":"reps"}')$$, 'fixed once', 'a challenge''s metric and unit are fixed once it has a layout');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('st_ss'), 3, '{"unit":"points"}')$$, 'fixed once', '... its unit too');
select race_test.ok(race_league_upsert_challenge(race_test.id('st_ss'), 3, '{"name":"Checklist (renamed)"}') = race_test.id('st_w3'), 'but its name and description can still change');

-- version 1 of the main layout
select race_test.put('st_lay_w1_v1', (race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'week 1 circuit') ->> 'layoutId')::uuid);
select race_test.put('st_lay_w2', (race_league_set_layout(race_test.id('st_w2'), race_test.st('L2'), 'row and ski') ->> 'layoutId')::uuid);
select race_test.put('st_lay_w4', (race_league_set_layout(race_test.id('st_w4'), race_test.st('L4'), 'carry and run') ->> 'layoutId')::uuid);
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) ->> 'version', '1', 'version 1 is the first version');
select race_test.eq(jsonb_array_length(race_league_get_layout(race_test.id('st_w1')) -> 'stations'), 3, 'the layout has its three stations');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) #>> '{stations,0,exercises,0,standard}', 'chin over the bar', 'the movement standard is stored');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) #>> '{stations,1,exercises,1,name}', 'Jump squat', 'a station can hold several exercises, in order');
select race_test.eq((race_league_get_layout(race_test.id('st_w1')) #>> '{stations,0,maxValue}'), '50', 'the per-station cap is stored');
select race_test.ok((race_league_get_layout(race_test.id('st_w1')) #> '{stations,1,maxValue}') = 'null'::jsonb, 'a station without a cap has none');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'again')$$, 'already the current layout', 'submitting the same layout again is refused (no empty version)');
select race_test.ok(race_league_get_layout(race_test.id('st_w5')) is null, 'a challenge without a layout reads as null');
select race_test.login('st_judge');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) ->> 'version', '1', 'a judge can read the layout');
select race_test.login('st_rev');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) ->> 'version', '1', 'a reviewer can read the layout');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- opening the season and the challenges
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_creator');
select race_league_set_season_status(race_test.id('st_ss'), 'scheduled');
select race_league_set_challenge_status(race_test.id(k), 'published') from (values ('st_w1'), ('st_w2'), ('st_w3'), ('st_w4'), ('st_w5'), ('st_w6')) v(k);
select race_league_set_season_status(race_test.id('st_ss'), 'active');
select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_judge'), 1, race_test.sv(1, 1, 1), null, gen_random_uuid())$$, 'LEAGUE_CHALLENGE_NOT_OPEN|LEAGUE_NOT_FOUND', 'a station attempt on a challenge that is not open is refused (base rule)');
select race_test.login('st_creator');
select race_league_set_challenge_status(race_test.id(k), 'open') from (values ('st_w1'), ('st_w2'), ('st_w3'), ('st_w4'), ('st_w5'), ('st_w6')) v(k);
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_station_results')::int, 0, 'no station result exists before the first station attempt');

-- participants
select race_test.login('st_creator');
select race_league_add_participant(race_test.id('st_ss'), 'Sam A.', 'M-701', true);
select race_league_add_participant(race_test.id('st_ss'), 'Bo B.', 'M-702', true);
select race_league_add_participant(race_test.id('st_ss'), 'Cy C.', 'M-703', true);
select race_league_add_participant(race_test.id('st_ss'), 'Di D.', 'M-704', true);
select race_league_add_participant(race_test.id('st_ss'), 'Ed E.', 'M-705', true);
select race_league_add_participant(race_test.id('st_ss'), 'Inactive I.', 'M-706', true);
reset role;
select race_test.put('st_pA', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Sam A.'));
select race_test.put('st_pB', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Bo B.'));
select race_test.put('st_pC', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Cy C.'));
select race_test.put('st_pD', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Di D.'));
select race_test.put('st_pE', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Ed E.'));
select race_test.put('st_pI', (select id from race_league_participants where season_id = race_test.id('st_ss') and display_name = 'Inactive I.'));
select race_test.login('st_creator');
select race_league_set_participant(race_test.id('st_pI'), null, false, 'left the gym');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- judging: who may, validation, idempotency, the base rules still apply
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'permission denied', 'anon cannot record station results');
select race_test.login('st_plain');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'a plain account cannot record station results');
select race_test.login('st_rev');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'a reviewer cannot record station results');
select race_test.login('st_other');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'the administrator of another season cannot record station results here');

select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, null)$$, 'request id', 'a request id is mandatory');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w5'), race_test.id('st_pA'), 1, race_test.sv(10), null, gen_random_uuid())$$, 'no station layout', 'a challenge without a layout takes no station form');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12), null, gen_random_uuid())$$, 'exactly one result for each', 'a missing station result is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8, 4), null, gen_random_uuid())$$, 'exactly one result for each', 'an extra station result is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, '[{"position":1,"value":1},{"position":1,"value":2},{"position":3,"value":3}]', null, gen_random_uuid())$$, 'appears more than once', 'two results for one station are refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, '[{"position":1,"value":"10"},{"position":2,"value":1},{"position":3,"value":3}]', null, gen_random_uuid())$$, 'must be a number', 'a text value is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(-1, 2, 3), null, gen_random_uuid())$$, 'from 0 to 1000000', 'a negative value is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(51, 2, 3), null, gen_random_uuid())$$, 'station cap of 50', 'a value over the station cap is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 2.5, 3), null, gen_random_uuid())$$, 'whole number', 'fractional repetitions are refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, '[{"position":1,"value":1,"note":"x"},{"position":2,"value":2},{"position":3,"value":3}]', null, gen_random_uuid())$$, 'unknown field note', 'an extra key in a result is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), now() + interval '1 day', gen_random_uuid())$$, 'future', 'an attempt time in the future is refused (base rule)');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pI'), 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'LEAGUE_NOT_ELIGIBLE', 'an inactive participant is refused (base rule)');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), '00000000-0000-0000-0000-000000000001', 1, race_test.sv(10, 12, 8), null, gen_random_uuid())$$, 'LEAGUE_NOT_FOUND', 'an unknown participant is refused (base rule)');
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w1') || '''')::int, 0, 'no refused request left an attempt behind');
select race_test.eq(race_test.q('select count(*) from race_league_station_results')::int, 0, 'no refused request left a station row behind');

select race_test.login('st_judge');
select race_test.put('st_rqA1', gen_random_uuid());
select race_test.put('st_sA1', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, race_test.id('st_rqA1')) ->> 'id')::uuid);
reset role;
select race_test.eq(race_test.q('select value::text from race_league_attempts where id = ''' || race_test.id('st_sA1') || ''''), '30.000', 'the attempt value is the SUM of the station values (10 + 12 + 8)');
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_sA1') || ''''), 'pending', 'on a verified challenge a station attempt starts pending, like any attempt');
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_sA1') || '''')::int, 3, 'three station rows are stored');
select race_test.eq(race_test.q('select count(distinct layout_id) from race_league_station_results where attempt_id = ''' || race_test.id('st_sA1') || '''')::int, 1, 'all under ONE layout version');
select race_test.eq(race_test.q('select layout_id::text from race_league_station_results where attempt_id = ''' || race_test.id('st_sA1') || ''' limit 1'), race_test.id('st_lay_w1_v1')::text, 'the attempt is recorded under version 1');
select race_test.login('st_judge');
select race_test.ok((race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(10, 12, 8), null, race_test.id('st_rqA1')) ->> 'replay')::boolean, 'a retry of the same request is an idempotent replay');
select race_test.eq(race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 1, race_test.sv(99, 99, 99), null, race_test.id('st_rqA1')) ->> 'id', race_test.id('st_sA1')::text, 'a replay returns the ORIGINAL attempt even if the retry carries different values');
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w1') || ''' and participant_id = ''' || race_test.id('st_pA') || '''')::int, 1, 'a replay created no second attempt');
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_sA1') || '''')::int, 3, 'a replay created no second set of station rows');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- substitution: a new version with a mandatory reason; the old version and the old attempt keep their meaning
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_judge');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1b'), 'swap')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot substitute an exercise');
select race_test.login('st_creator');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1b'), '')$$, 'LEAGUE_REASON_REQUIRED', 'a substitution needs a reason');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), '{"result_type":"REPS","stations":[{"name":"Pull-ups","max_value":50,"exercises":[{"name":"Strict pull-up"}]}]}', 'fewer stations')$$, 'are fixed', 'after the first attempt the NUMBER of stations is fixed');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), replace(race_test.st('L1b')::text, '"max_value": 50', '"max_value": 60')::jsonb, 'bigger cap')$$, 'are fixed', 'after the first attempt a station cap is fixed');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), replace(race_test.st('L1b')::text, '"max_value": 40', '"max_value": null')::jsonb, 'remove cap')$$, 'are fixed', '... and a cap cannot be removed');
select race_test.put('st_lay_w1_v2', (race_league_set_layout(race_test.id('st_w1'), race_test.st('L1b'), 'no squat rack today: goblet squats instead') ->> 'layoutId')::uuid);
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) ->> 'version', '2', 'the substitution is version 2');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) #>> '{stations,1,exercises,0,name}', 'Goblet squat', 'version 2 has the replacement exercise');
select race_test.eq(race_league_get_layout(race_test.id('st_w1'), 1) #>> '{stations,1,exercises,0,name}', 'Air squat', 'version 1 is still readable and unchanged');
select race_test.eq(jsonb_array_length(race_league_get_layout(race_test.id('st_w1')) -> 'versions'), 2, 'the version history lists both versions');
select race_test.eq(race_league_get_layout(race_test.id('st_w1')) #>> '{versions,1,reason}', 'no squat rack today: goblet squats instead', 'the history carries the reason');
reset role;
select race_test.eq(race_test.q('select layout_id::text from race_league_station_results where attempt_id = ''' || race_test.id('st_sA1') || ''' limit 1'), race_test.id('st_lay_w1_v1')::text, 'the earlier attempt STAYS under version 1');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.layout.substitute' and metadata::text like '%Goblet squat%' and metadata::text like '%Air squat%' and metadata::text like '%no squat rack today%'),
  'audit: the substitution records which exercises were replaced by which, and why');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.layout.create' and metadata ->> 'season_id' = race_test.id('st_ss')::text), 'audit: the creation of a layout is recorded');

-- stale screen: a form built from version 1 is refused once version 2 exists
select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pB'), 1, race_test.sv(14, 14, 14), null, gen_random_uuid())$$, 'LEAGUE_LAYOUT_CHANGED', 'a form built from the old version is refused after a substitution');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pB'), 3, race_test.sv(14, 14, 14), null, gen_random_uuid())$$, 'LEAGUE_LAYOUT_CHANGED', 'a version from the future is refused too');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pB'), null, race_test.sv(14, 14, 14), null, gen_random_uuid())$$, 'LEAGUE_LAYOUT_CHANGED', 'a missing version is refused');
select race_test.put('st_sB', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pB'), 2, race_test.sv(14, 14, 14), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_sC', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pC'), 2, race_test.sv(20, 10, 12), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_sD', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pD'), 2, race_test.sv(4, 4, 4), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_sE', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pE'), 2, race_test.sv(8, 6, 6), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_sA2', (race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 2, race_test.sv(12, 12, 12), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pA'), 2, race_test.sv(1, 1, 1), null, gen_random_uuid())$$, 'LEAGUE_ATTEMPT_LIMIT', 'the base attempt limit still applies (two attempts per challenge)');
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w1') || '''')::int, 6, 'six attempts exist: the refused third one left nothing behind');
select race_test.eq(race_test.q('select count(*) from race_league_station_results r join race_league_attempts a on a.id = r.attempt_id where a.challenge_id = ''' || race_test.id('st_w1') || '''')::int, 18, '... and exactly 6 x 3 station rows');
select race_test.eq(race_test.q('select count(*) from race_league_attempts a where a.challenge_id = ''' || race_test.id('st_w1') || ''' and a.value <> (select sum(r.value) from race_league_station_results r where r.attempt_id = a.id)')::int, 0, 'invariant: every attempt value equals the sum of its station rows');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- the commit-time rule: the generic single-value paths fail CLOSED on a station challenge
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_judge');
select race_test.throws_at_commit($$select race_league_record_attempt(race_test.id('st_w1'), race_test.id('st_pB'), 30, null, gen_random_uuid())$$, 'one value per station', 'a plain single-value attempt on a station challenge is refused at commit');
select race_test.login('st_creator');
select race_test.throws_at_commit($$select race_league_correct_attempt(race_test.id('st_sD'), 99, 'typing a bare total')$$, 'one value per station', 'a single-number correction of a station attempt is refused at commit');
select race_test.login('st_judge');
select race_test.put('st_rqD', race_league_request_correction(race_test.id('st_sD'), 99, 'the judge thinks it is 99'));
select race_test.login('st_creator');
select race_test.throws_at_commit($$select race_league_decide_correction_request(race_test.id('st_rqD'), 'apply', 'applying a bare total')$$, 'one value per station', 'applying a judge''s bare-total request is refused at commit');
reset role;
select race_test.eq(race_test.q('select status from race_league_correction_requests where id = ''' || race_test.id('st_rqD') || ''''), 'pending', 'the refused application left the request pending (nothing half-done)');
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_sD') || ''''), 'pending', 'and the attempt untouched');
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w1') || '''')::int, 6, 'and no extra attempt exists');
select race_test.login('st_creator');
select race_league_decide_correction_request(race_test.id('st_rqD'), 'decline', 'the station sheet says 12');
reset role;
select race_test.eq(race_test.q('select status from race_league_correction_requests where id = ''' || race_test.id('st_rqD') || ''''), 'declined', 'declining a request is unaffected');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- review: the base workflow, unchanged
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_rev');
select race_league_review_attempt(race_test.id(k), 'approve') from (values ('st_sA1'), ('st_sA2'), ('st_sB'), ('st_sC'), ('st_sD'), ('st_sE')) v(k);
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w1') || ''' and status = ''approved''')::int, 6, 'a reviewer approves station attempts exactly as any attempt');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- closing awards points from the TOTALS; ties share; the ledger is the base one
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_creator');
select race_league_set_challenge_status(race_test.id('st_w1'), 'closed');
reset role;
select race_test.eq(race_test.lp('st_w1', 'st_pB'), '10000:1', 'week 1: Bo (42) shares rank 1 and the 100 points');
select race_test.eq(race_test.lp('st_w1', 'st_pC'), '10000:1', 'week 1: Cy (42) shares rank 1 — equal TOTALS tie, however the stations were distributed');
select race_test.eq(race_test.lp('st_w1', 'st_pA'), '8000:3', 'week 1: Sam (best attempt 36) is rank 3 — the next rank after the tie is skipped');
select race_test.eq(race_test.lp('st_w1', 'st_pE'), '7500:4', 'week 1: Ed (20) is rank 4');
select race_test.eq(race_test.lp('st_w1', 'st_pD'), '7000:5', 'week 1: Di (12) is rank 5');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('st_w1'))::int, 5, 'week 1: five ledger lines');
select race_test.login('st_creator');
select race_test.eq(race_league_recompute(race_test.id('st_w1')), 0, 'recomputing adds nothing (points are never awarded twice)');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w1'), race_test.st('L1'), 'after close')$$, 'closed challenge', 'a closed challenge can no longer change its layout');
select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w1'), race_test.id('st_pD'), 2, race_test.sv(30, 30, 30), null, gen_random_uuid())$$, 'LEAGUE_CHALLENGE_NOT_OPEN', 'no station attempts after the challenge closed');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- corrections: per station, through the ONE correction path
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_judge');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), 'recount')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot correct a result (they request it)');
select race_test.login('st_rev');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), 'recount')$$, 'LEAGUE_FORBIDDEN', 'a reviewer cannot correct a result');
select race_test.login('st_other');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), 'recount')$$, 'LEAGUE_FORBIDDEN', 'the administrator of another season cannot correct it');
select race_test.anon();
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), 'recount')$$, 'permission denied', 'anon cannot correct a result');
select race_test.login('st_creator');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), '')$$, 'LEAGUE_REASON_REQUIRED', 'a correction needs a reason');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14), 'recount')$$, 'exactly one result for each', 'a correction must carry every station');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(51, 14, 10), 'recount')$$, 'station cap of 50', 'a correction is validated against the layout (station cap)');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10.5), 'recount')$$, 'whole number', 'a correction is validated against the result type');
select race_test.throws($$select race_league_correct_station_attempt('00000000-0000-0000-0000-000000000001', race_test.sv(1, 1, 1), 'recount')$$, 'LEAGUE_NOT_FOUND', 'an unknown attempt is refused');
reset role;
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_sD') || ''''), 'approved', 'refused corrections changed nothing');
select race_test.login('st_creator');
select race_test.put('st_res_D', (race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(14, 14, 10), 'recount of the station sheet') ->> 'replacement')::uuid);
reset role;
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_sD') || ''''), 'void', 'the old attempt is voided');
select race_test.eq(race_test.q('select value::text from race_league_attempts where id = ''' || race_test.id('st_res_D') || ''''), '38.000', 'the replacement carries the corrected total (14 + 14 + 10)');
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_res_D') || ''''), 'approved', 'the replacement is approved (an administrator decided it)');
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_res_D') || '''')::int, 3, 'the replacement has its three station rows');
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_sD') || '''')::int, 3, 'the voided attempt KEEPS its station rows (history is never rewritten)');
select race_test.eq(race_test.q('select layout_id::text from race_league_station_results where attempt_id = ''' || race_test.id('st_res_D') || ''' limit 1'), race_test.id('st_lay_w1_v2')::text, 'the replacement stays under the version of the attempt it replaces');
select race_test.eq(race_test.lp('st_w1', 'st_pD'), '8000:3', 'week 1 after the correction: Di (38) moves to rank 3');
select race_test.eq(race_test.lp('st_w1', 'st_pA'), '7500:4', 'week 1 after the correction: Sam moves to rank 4');
select race_test.eq(race_test.lp('st_w1', 'st_pE'), '7000:5', 'week 1 after the correction: Ed moves to rank 5');
select race_test.eq(race_test.lp('st_w1', 'st_pB'), '10000:1', 'week 1 after the correction: the tie at the top is untouched');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('st_w1'))::int, 8, 'the ledger only APPENDED the three differences (5 + 3 lines); nothing was rewritten');
select race_test.ok(exists (select 1 from race_league_corrections where attempt_id = race_test.id('st_sD') and replacement_attempt_id = race_test.id('st_res_D') and previous_value = 12 and new_value = 38 and reason = 'recount of the station sheet'),
  'the permanent correction record keeps previous value, new value and reason');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.attempt.stations.correct' and metadata ->> 'season_id' = race_test.id('st_ss')::text and after::text like '%"total": 38%'), 'audit: the station correction is recorded');
-- a correction validates against the version the attempt was recorded under, and stays under it
select race_test.login('st_creator');
select race_test.put('st_res_A1', (race_league_correct_station_attempt(race_test.id('st_sA1'), race_test.sv(11, 12, 8), 'first attempt recount') ->> 'replacement')::uuid);
reset role;
select race_test.eq(race_test.q('select layout_id::text from race_league_station_results where attempt_id = ''' || race_test.id('st_res_A1') || ''' limit 1'), race_test.id('st_lay_w1_v1')::text, 'a correction of a version-1 attempt stays under version 1 (not moved to the current version)');
select race_test.login('st_creator');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(1, 1, 1), 'already void')$$, 'pending or approved', 'a voided attempt cannot be corrected again');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_sD'), race_test.sv(1, 1, 1), 'already void')$$, 'LEAGUE_INVALID', '... with the base error code');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- the other result types: TIME (lower wins), COMPLETION (checklist), DISTANCE; void stays allowed
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pA'), 1, race_test.sv(30.5, 601), null, gen_random_uuid())$$, 'station cap of 600', 'week 2: a ski time over the cap is refused');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pA'), 1, race_test.sv(30.5555, 40), null, gen_random_uuid())$$, 'three decimals', 'week 2: four decimals are refused');
select race_test.put('st_tA', (race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pA'), 1, race_test.sv(30.5, 40.25), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_tB', (race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pB'), 1, race_test.sv(28, 35), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.put('st_tC', (race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pC'), 1, race_test.sv(60, 61), null, gen_random_uuid()) ->> 'id')::uuid);
reset role;
select race_test.eq(race_test.q('select value::text from race_league_attempts where id = ''' || race_test.id('st_tA') || ''''), '70.750', 'week 2: times add up with their decimals (30.5 + 40.25)');
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_tA') || ''''), 'approved', 'week 2: a challenge without verification counts at once');
-- void is a plain base operation: it creates nothing that needs a breakdown
select race_test.login('st_creator');
select race_league_correct_attempt(race_test.id('st_tC'), null, 'wrong athlete on the sheet');
reset role;
select race_test.eq(race_test.q('select status from race_league_attempts where id = ''' || race_test.id('st_tC') || ''''), 'void', 'week 2: a station attempt can be voided');
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_tC') || '''')::int, 2, 'week 2: the voided attempt keeps its station rows');
select race_test.login('st_judge');
select race_test.put('st_tC2', (race_league_record_station_attempt(race_test.id('st_w2'), race_test.id('st_pC'), 1, race_test.sv(59, 60), null, gen_random_uuid()) ->> 'id')::uuid);
reset role;
select race_test.eq(race_test.q('select attempt_no::text from race_league_attempts where id = ''' || race_test.id('st_tC2') || ''''), '2', 'week 2: the next attempt continues the numbering after a void');
select race_test.login('st_creator');
select race_league_set_challenge_status(race_test.id('st_w2'), 'closed');
reset role;
select race_test.eq(race_test.lp('st_w2', 'st_pB'), '10000:1', 'week 2: the lowest total time wins (63 s)');
select race_test.eq(race_test.lp('st_w2', 'st_pA'), '9000:2', 'week 2: 70.75 s is second');
select race_test.eq(race_test.lp('st_w2', 'st_pC'), '8000:3', 'week 2: 119 s is third (the voided attempt does not count)');

select race_test.login('st_judge');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w3'), race_test.id('st_pA'), 1, race_test.sv(1, 2, 0, 1), null, gen_random_uuid())$$, 'completion is 0', 'week 3: a completion is 0 or 1');
select race_test.throws($$select race_league_record_station_attempt(race_test.id('st_w3'), race_test.id('st_pA'), 1, race_test.sv(1, 0.5, 0, 1), null, gen_random_uuid())$$, 'completion is 0', 'week 3: a half completion is refused');
select race_league_record_station_attempt(race_test.id('st_w3'), race_test.id('st_pA'), 1, race_test.sv(1, 1, 0, 1), null, gen_random_uuid());
select race_league_record_station_attempt(race_test.id('st_w3'), race_test.id('st_pB'), 1, race_test.sv(1, 1, 1, 1), null, gen_random_uuid());
select race_league_record_station_attempt(race_test.id('st_w3'), race_test.id('st_pC'), 1, race_test.sv(0, 0, 0, 0), null, gen_random_uuid());
select race_test.login('st_creator');
select race_league_set_challenge_status(race_test.id('st_w3'), 'closed');
reset role;
select race_test.eq(race_test.lp('st_w3', 'st_pB'), '10000:1', 'week 3: four stations done ranks first (the number of stations completed is the result)');
select race_test.eq(race_test.lp('st_w3', 'st_pA'), '9000:2', 'week 3: three done is second');
select race_test.eq(race_test.lp('st_w3', 'st_pC'), '8000:3', 'week 3: none done is an approved, valid result and still ranks third');

select race_test.login('st_judge');
select race_test.put('st_dA', (race_league_record_station_attempt(race_test.id('st_w4'), race_test.id('st_pA'), 1, race_test.sv(250.5, 100), null, gen_random_uuid()) ->> 'id')::uuid);
reset role;
select race_test.eq(race_test.q('select value::text || race_league_attempts.unit from race_league_attempts where id = ''' || race_test.id('st_dA') || ''''), '350.500m', 'week 4: distances add up in the challenge''s unit');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- a plain challenge, and a layout introduced late
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_judge');
select race_test.put('st_pl1', (race_league_record_attempt(race_test.id('st_w5'), race_test.id('st_pA'), 25, null, gen_random_uuid()) ->> 'id')::uuid);
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_station_results where attempt_id = ''' || race_test.id('st_pl1') || '''')::int, 0, 'a challenge without a layout behaves exactly as before: no station rows');
select race_test.login('st_creator');
select race_test.throws($$select race_league_set_layout(race_test.id('st_w5'), race_test.st('L1'), 'too late')$$, 'before the first attempt', 'a layout cannot be introduced after the first attempt');
select race_test.throws($$select race_league_correct_station_attempt(race_test.id('st_pl1'), race_test.sv(1, 2, 3), 'no breakdown')$$, 'no station breakdown', 'a station correction of an attempt without a breakdown is refused');
select race_test.ok((race_league_correct_attempt(race_test.id('st_pl1'), 26, 'recount') ->> 'ledgerLines') is not null, 'the ordinary correction of a plain attempt still works');
-- week 6: the layout goes in BEFORE the first attempt
select race_test.put('st_lay_w6', (race_league_set_layout(race_test.id('st_w6'), race_test.st('L6'), 'finisher week') ->> 'layoutId')::uuid);
select race_test.login('st_judge');
select race_test.put('st_f6', (race_league_record_station_attempt(race_test.id('st_w6'), race_test.id('st_pA'), 1, race_test.sv(20, 15), null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.throws_at_commit($$select race_league_record_attempt(race_test.id('st_w6'), race_test.id('st_pB'), 20, null, gen_random_uuid())$$, 'one value per station', 'week 6: a single-value attempt on the new station challenge is refused at commit');
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_attempts where challenge_id = ''' || race_test.id('st_w6') || '''')::int, 1, 'week 6: only the station attempt exists');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- the breakdown (staff only) and the audit trail
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('st_rev');
select race_test.eq(jsonb_array_length(race_league_station_breakdown(race_test.id('st_w1'))), 8, 'breakdown: a reviewer sees every attempt of the challenge, voided ones included (6 + 2 replacements)');
select race_test.eq((select x -> 'stations' -> 0 ->> 'name' from jsonb_array_elements(race_league_station_breakdown(race_test.id('st_w1'))) x where x ->> 'attemptId' = race_test.id('st_res_D')::text), 'Pull-ups', 'breakdown: station names are listed per attempt');
select race_test.eq((select x ->> 'layoutVersion' from jsonb_array_elements(race_league_station_breakdown(race_test.id('st_w1'))) x where x ->> 'attemptId' = race_test.id('st_sA1')::text), '1', 'breakdown: the version each attempt was recorded under');
select race_test.eq((select x ->> 'layoutVersion' from jsonb_array_elements(race_league_station_breakdown(race_test.id('st_w1'))) x where x ->> 'attemptId' = race_test.id('st_sB')::text), '2', 'breakdown: ... version 2 for the later ones');
select race_test.eq((select (x -> 'stations') from jsonb_array_elements(race_league_station_breakdown(race_test.id('st_w1'))) x where x ->> 'attemptId' = race_test.id('st_res_D')::text), (select jsonb_agg(jsonb_build_object('position', p, 'name', n, 'value', v) order by p) from (values (1, 'Pull-ups', 14), (2, 'Squats', 14), (3, 'Dips', 10)) t(p, n, v)),
  'breakdown: the corrected values per station');
select race_test.login('st_plain');
select race_test.throws($$select race_league_station_breakdown(race_test.id('st_w1'))$$, 'LEAGUE_FORBIDDEN', 'breakdown: a plain account cannot read it');
select race_test.anon();
select race_test.throws($$select race_league_station_breakdown(race_test.id('st_w1'))$$, 'permission denied', 'breakdown: anon cannot read it');
select race_test.login('st_creator');
select race_test.ok(exists (select 1 from jsonb_array_elements(race_league_audit(race_test.id('st_ss'), 500)) a where a ->> 'action' = 'league.attempt.stations'), 'audit: the administrator reads the station attempts in the season audit trail');
select race_test.ok(exists (select 1 from jsonb_array_elements(race_league_audit(race_test.id('st_ss'), 500)) a where a ->> 'action' = 'league.layout.substitute'), 'audit: ... and the substitution');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- immutability (even for the table owner), and a completed season is final
-- ---------------------------------------------------------------------------------------------------------------------------------------------
reset role;
select race_test.throws($$update race_league_layouts set reason = 'edited'$$, 'append|immutable|not allowed|permission', 'immutable: a layout version cannot be edited, even by the owner');
select race_test.throws($$delete from race_league_layouts$$, 'append|immutable|not allowed|permission|delete', 'immutable: a layout version cannot be deleted');
select race_test.throws($$truncate race_league_layouts cascade$$, 'append|immutable|not allowed|permission|truncate', 'immutable: nor truncated');
select race_test.throws($$update race_league_layout_stations set name = 'edited'$$, 'append|immutable|not allowed|permission', 'immutable: a station cannot be edited');
select race_test.throws($$delete from race_league_layout_exercises$$, 'append|immutable|not allowed|permission|delete', 'immutable: an exercise cannot be deleted');
select race_test.throws($$update race_league_layout_exercises set name = 'edited'$$, 'append|immutable|not allowed|permission', 'immutable: an exercise cannot be edited');
select race_test.throws($$update race_league_station_results set value = 999$$, 'append|immutable|not allowed|permission', 'immutable: a station result cannot be edited');
select race_test.throws($$delete from race_league_station_results$$, 'append|immutable|not allowed|permission|delete', 'immutable: a station result cannot be deleted');
select race_test.throws($$truncate race_league_station_results$$, 'append|immutable|not allowed|permission|truncate', 'immutable: nor truncated');
-- a result cannot point at a station of a different layout version
select race_test.throws($$insert into race_league_station_results (attempt_id, layout_id, layout_station_id, value)
   select race_test.id('st_sB'), race_test.id('st_lay_w1_v1'), s.id, 1 from race_league_layout_stations s where s.layout_id = race_test.id('st_lay_w2') limit 1$$, 'foreign key|violates', 'integrity: a station result cannot reference a station of another layout');
-- the database rule, directly: a hand-made attempt without a breakdown cannot be committed on a station challenge
select race_test.throws_at_commit($$insert into race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, status, client_request_id)
   values (race_test.id('st_ss'), race_test.id('st_w6'), race_test.id('st_pC'), 7, 'reps', 1, now(), race_test.id('st_judge'), 'approved', gen_random_uuid())$$, 'one value per station', 'rule: even the table owner cannot commit an attempt without its breakdown on a station challenge');
select race_test.throws_at_commit($$update race_league_attempts set value = value + 1 where id = (select id from race_league_attempts where challenge_id = race_test.id('st_w6') limit 1)$$, 'do not add up', 'rule: nor change a total so that it no longer equals its stations');
-- a completed season is final
insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
  values ('stations-done', 'Done', 'active', date '2026-11-02', date '2026-12-27', race_league_default_rules(), race_test.id('super'));
insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, status, closed_at)
  select id, 1, 'Done week', 'REPS', 'reps', 'HIGHER_WINS', 'closed', now() from race_league_seasons where public_slug = 'stations-done';
update race_league_seasons set status = 'completed', completed_at = now() where public_slug = 'stations-done';
select race_test.put('st_done_c', (select c.id from race_league_challenges c join race_league_seasons s on s.id = c.season_id where s.public_slug = 'stations-done'));
select race_test.login('super');
select race_test.throws($$select race_league_set_layout(race_test.id('st_done_c'), race_test.st('L1'), 'edit a finished season')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season cannot get or change a layout');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- privacy: public pages carry no exercise, station, standard or equipment data
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('super');
select race_league_set_public_gate('test-gate-secret-0123456789abcdef');
select race_test.login('st_creator');
select race_league_set_published(race_test.id('st_ss'), true, 'publish the stations season');
reset role;
select set_config('st.pub', (select public_id from race_league_participants where id = race_test.id('st_pA')), false);
select race_test.anon();
select set_config('request.headers', '{"x-league-gate":"test-gate-secret-0123456789abcdef"}', false);
select race_test.ok(race_league_public_season('stations-season') ->> 'available' = 'true', 'privacy: the public season page is available (published, gate open)');
select race_test.ok(race_league_public_season('stations-season')::text !~* '(exercise|pull-up|goblet|air squat|kettlebell|chin over|equipment|layout|maxvalue|bench dip)', 'privacy: the public season page carries no exercise, station, standard or equipment data');
select race_test.ok(race_league_public_challenge_results('stations-season', 1)::text !~* '(exercise|pull-up|goblet|air squat|kettlebell|chin over|equipment|layout|maxvalue|bench dip)', 'privacy: the public week-1 results carry none either');
select race_test.ok(race_league_public_challenge_results('stations-season', 1) ->> 'available' = 'true', 'privacy: ... and are available (the closed challenge)');
select race_test.ok(race_league_public_participant('stations-season', current_setting('st.pub'))::text !~* '(exercise|pull-up|goblet|air squat|kettlebell|chin over|equipment|layout|maxvalue|bench dip)', 'privacy: a public athlete page carries none either');
select set_config('request.headers', '', false);
select race_test.throws($$select * from race_league_layouts$$, 'permission denied', 'privacy: anon cannot read the layout table directly');
select race_test.throws($$select * from race_league_station_results$$, 'permission denied', 'privacy: anon cannot read the station results table directly');
select race_test.login('st_judge');
select race_test.throws($$select * from race_league_layout_exercises$$, 'permission denied', 'privacy: a signed-in judge cannot read the tables directly either');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- independence: after the whole League scenario the race engine is byte-for-byte what it was
-- ---------------------------------------------------------------------------------------------------------------------------------------------
reset role;
insert into race_test.st_fp values ('after', race_test.race_fingerprint());
select race_test.eq((select fp from race_test.st_fp where label = 'after'), (select fp from race_test.st_fp where label = 'before'),
  'independence: the race tables (events, stations, heats, clock, start slots, station results) hash identically before and after the League scenario');
select race_test.ok((select count(*) from race_stations where event_id = race_test.id('st_event')) >= 9 and exists (select 1 from race_clock where event_id = race_test.id('st_event')), 'independence: the race event still has its nine race stations and its clock');
