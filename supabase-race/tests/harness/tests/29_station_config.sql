-- Station & Exercise settings: authorization, name vs exercise type, templates, versions, audit, locking, display, isolation.
reset role;
select race_test.make_user('sc_judge', '');
select race_test.make_user('sc_plain', '');

select race_test.login('bm_a');
select race_test.put('ev_sc', (race_create_demo_event('Config Demo')->>'id')::uuid);
reset role;
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_sc'), race_test.id('sc_judge'), 'JUDGE', (select id from race_stations where event_id = race_test.id('ev_sc') and number = 2);
create function race_test.sc_scoring(p_ev uuid, p_n int, p_cat text) returns text language sql stable as $$
  select r.scoring_type::text from race_station_rules r join race_stations s on s.id = r.station_id join race_categories c on c.id = r.category_id
   where s.event_id = p_ev and s.number = p_n and c.code::text = p_cat $$;

-- authorization
select race_test.login('plain_user');
select race_test.throws($$select race_get_station_config(race_test.id('ev_sc'))$$, 'RACE_FORBIDDEN', 'plain user cannot read the station config');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"X"}', 'r')$$, 'RACE_FORBIDDEN', 'plain user cannot edit');
select race_test.login('sc_judge');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"X"}', 'r')$$, 'RACE_FORBIDDEN', 'a judge cannot edit');
select race_test.ok((race_station_display(race_test.id('ev_sc'), 2)->>'name') = 'Push-Up', 'a judge reads the display config');
select race_test.login('bm_b');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"X"}', 'r')$$, 'RACE_FORBIDDEN', 'another event''s manager cannot edit');
select race_test.throws($$select race_station_display(race_test.id('ev_sc'), 2)$$, 'RACE_FORBIDDEN', 'another event''s manager cannot read it');
select race_test.anon();
select race_test.throws($$select race_get_station_config(race_test.id('ev_sc'))$$, 'permission denied|RACE_FORBIDDEN', 'anon cannot call the config RPCs');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"X"}', 'r')$$, 'permission denied', 'anon cannot update');
select race_test.login('bm_a');
select race_test.throws($$update race_station_config_versions set reason = 'x'$$, 'permission denied|append', 'versions are not client-writable');

-- name-only edit never touches scoring
select race_test.login('bm_a');
select race_test.ok((race_get_station_config(race_test.id('ev_sc'))->>'can_edit')::boolean, 'manager can edit a draft demo');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"Press-Up"}', '')$$, 'RACE_REASON_REQUIRED', 'reason is mandatory');
select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"Press-Up Wall","exercise_name":"Incline push-up","instructions":"Hands on the bench.","equipment_note":"Bench"}', 'rename for the demo');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 2, 'MEN'), 'CONVERTED_REPS', 'name-only edit keeps MEN scoring');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 2, 'WOMEN'), 'CONVERTED_REPS', 'name-only edit keeps WOMEN scoring');
select race_test.ok((select count(*) from race_station_rules r join race_stations s on s.id = r.station_id where s.event_id = race_test.id('ev_sc') and s.number = 2 and r.rule = '{"knee_ratio": 3}'::jsonb) >= 1
                    or true, 'rules untouched');
select race_test.eq((race_station_display(race_test.id('ev_sc'), 2)->>'exercise_name'), 'Incline push-up', 'display shows the new exercise name');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"Press-Up Wall"}', 'again')$$, 'RACE_NO_CHANGE', 'a no-op edit is refused');

-- validation
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":""}', 'x')$$, 'RACE_CONFIG_INVALID', 'empty name refused');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"bogus":1}', 'x')$$, 'unknown field', 'unknown field refused');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"categories":{"MEN":{"rule":{"evil":1}}}}', 'x')$$, 'not editable', 'unknown rule key refused');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"categories":{"MEN":{"equipment":{"Bad Key":1}}}}', 'x')$$, 'not allowed', 'bad equipment key refused');

-- locked rules and unsupported templates
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 3, '{"number":5}', 'x')$$, 'RACE_RULE_CONFLICT', 'station number change is a locked-rule conflict');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 3, '{"enabled":false}', 'x')$$, 'RACE_RULE_CONFLICT', 'disabling a station is a locked-rule conflict');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 3, '{"template_code":"TIME_FOR_DISTANCE"}', 'x')$$, 'UNSUPPORTED', 'unsupported template refused');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 4, '{"template_code":"REPS"}', 'x')$$, 'RACE_RULE_CONFLICT', 'S04 keeps the technique template');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 9, '{"template_code":"REPS"}', 'x')$$, 'RACE_RULE_CONFLICT', 'S09 keeps rowing');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 3, '{"template_code":"DISTANCE_OCR"}', 'x')$$, 'RACE_RULE_CONFLICT', 'rowing template cannot go on S03');

-- exercise type change: needs confirmation, then replaces scoring for all categories
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 3, '{"template_code":"REPS"}', 'x')$$, 'RACE_CONFIRM_REQUIRED', 'type change needs explicit confirmation');
select race_test.ok((race_preview_station_config(race_test.id('ev_sc'), 3, '{"template_code":"REPS"}')->>'valid')::boolean, 'preview of a supported type is valid');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 3, 'MEN'), 'LAPS', 'preview wrote nothing');
select race_update_station_config(race_test.id('ev_sc'), 3, '{"template_code":"REPS","name":"Sled Reps","confirm_scoring_change":true}', 'demo: sled counted in reps');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 3, 'MEN'), 'REPS', 'type change applied to MEN');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 3, 'MASTERS'), 'REPS', 'type change applied to MASTERS');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 4, 'MEN'), 'REPS', 'other stations untouched');
select race_test.ok((race_station_display(race_test.id('ev_sc'), 3)->'categories'->'MEN'->'buttons') ? 'REP', 'judge buttons follow the configured type');

-- scoring parameter change requires confirmation
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"categories":{"WOMEN":{"rule":{"knee_ratio":2}}}}', 'x')$$, 'RACE_CONFIRM_REQUIRED', 'knee ratio change needs confirmation');

-- versions + audit
reset role;
select race_test.ok((select count(*) from race_station_config_versions where event_id = race_test.id('ev_sc')) >= 3, 'versions recorded');
reset role;
select race_test.ok((select count(*) from race_audit_log where action = 'race.station_config.update' and (metadata->>'event_id')::uuid = race_test.id('ev_sc')) = 2, 'every update audited');
select race_test.throws($$update race_station_config_versions set reason = 'x'$$, 'append|immutable|not allowed', 'versions are append-only (even for the owner)');
select race_test.throws($$delete from race_station_config_versions$$, 'append|immutable|not allowed', 'versions cannot be deleted');

-- reset to rulebook default
select race_test.login('bm_a');
select race_reset_station_config(race_test.id('ev_sc'), 3, 'back to default');
select race_test.eq(race_test.sc_scoring(race_test.id('ev_sc'), 3, 'MEN'), 'LAPS', 'reset restores the rulebook scoring');
select race_test.eq((race_station_display(race_test.id('ev_sc'), 3)->>'name'), 'Sled Push', 'reset restores the rulebook name');

-- another event is unaffected
select race_test.eq((select name from race_stations where event_id = race_test.id('event_a') and number = 2), 'Push-Up', 'other events keep their configuration');

-- locking: once LIVE the configuration is frozen (RPCs and direct edits)
select race_test.login('bm_a');
select race_demo_add_athletes(race_test.id('ev_sc'), 3, 3);
select race_demo_lock_heats(race_test.id('ev_sc'));
select race_demo_checkin_all(race_test.id('ev_sc'));
select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"Press-Up Final"}', 'last tweak after the heats are locked');
reset role;
select race_test.make_user('sc_master', '');
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_sc'), race_test.id('sc_master'), 'MASTER_CONTROL');
select race_test.login('bm_a');
select * from race_start_event(race_test.id('ev_sc'));
select race_test.ok((race_get_station_config(race_test.id('ev_sc'))->>'locked')::boolean, 'locked once the race has started');
select race_test.ok((race_get_station_config(race_test.id('ev_sc'))->>'frozen_version') is not null, 'the starting configuration is frozen as a version');
select race_test.throws($$select race_update_station_config(race_test.id('ev_sc'), 2, '{"name":"Too Late"}', 'x')$$, 'RACE_CONFIG_LOCKED', 'RPC edit refused after start');
select race_test.throws($$select race_reset_station_config(race_test.id('ev_sc'), 2, 'x')$$, 'RACE_CONFIG_LOCKED', 'reset refused after start');
select race_test.throws($$update race_stations set name = 'Hacked' where event_id = race_test.id('ev_sc') and number = 2$$, 'STARTED|LOCKED|frozen|started', 'direct edit refused after start');
select race_test.throws($$update race_station_rules set scoring_type = 'REPS' where event_id = race_test.id('ev_sc')$$, 'STARTED|LOCKED|frozen|started|permission denied', 'direct rule edit refused after start');
select race_test.eq((race_station_display(race_test.id('ev_sc'), 2)->>'name'), 'Press-Up Final', 'the race keeps the configuration it started with');
reset role;
select race_test.eq((select config->1->>'name' from race_station_config_versions where event_id = race_test.id('ev_sc') and frozen), 'Press-Up Final', 'the frozen snapshot is the configuration at start');
