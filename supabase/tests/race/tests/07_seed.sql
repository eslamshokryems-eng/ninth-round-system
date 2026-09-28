-- 8. Seed-data validation — 9 stations × 3 categories, exactly per the rulebook.
reset role;

select race_test.eq((select count(*) from race_category_templates)::int, 3, 'seed: 3 categories');
select race_test.eq((select count(*) from race_station_templates)::int, 9, 'seed: 9 stations');
select race_test.eq((select count(*) from race_station_rule_templates)::int, 27, 'seed: 27 station × category rules');
select race_test.eq((select string_agg(code, ',' order by number) from race_station_templates),
  'SQUAT,PUSH_UP,SLED_PUSH,JAB_CROSS,BOX_JUMP,DB_CARRY,FRONT_KICK,BURPEE_SPEEDBALL,ROW', 'seed: station order 01–09');
select race_test.ok((select bool_and(higher_is_better) from race_station_rule_templates), 'seed: all 27 rules are higher-is-better');
select race_test.eq((select string_agg(code || ':' || default_pushup_style || ':' || coalesce(min_age::text, '-'), ',' order by sort_order)
                     from race_category_templates), 'MEN:STANDARD:-,WOMEN:KNEE:-,MASTERS:KNEE:40',
  'seed: push-up defaults Men=Standard, Women=Knee, Masters=Knee; Masters 40+');

-- Helper view for readable assertions.
create temp view r as
select station_number n, category_code::text c, scoring_type::text st, movement, equipment e, rule
from race_station_rule_templates;

select race_test.ok((select string_agg(c || '=' || coalesce(e ->> 'load_kg', e ->> 'load') || '/' || st, ',' order by c) from r where n = 1)
                    = 'MASTERS=bodyweight/HOLD_MS,MEN=20/REPS,WOMEN=5/REPS',
  'S01: Men 20 kg reps, Women 5 kg reps, Masters bodyweight wall-hold time');
select race_test.ok((select (rule ->> 'max_breaks')::int = 2 and (rule ->> 'third_exit_ends_hold')::boolean
                            and not (rule ->> 'disqualify_on_third_exit')::boolean from r where n = 1 and c = 'MASTERS'),
  'S01: Masters max 2 breaks, 3rd exit ends hold, no DQ');
select race_test.ok((select bool_and(rule -> 'max_breaks' = 'null'::jsonb) from r where n = 1 and c in ('MEN', 'WOMEN')),
  'S01: NO break limit for Men/Women barbell squat (D-10)');
select race_test.eq((select count(*) from r where rule ? 'max_breaks' and rule -> 'max_breaks' <> 'null'::jsonb)::int, 1,
  'S01: the 2-break limit exists in exactly one rule (Masters wall hold)');
select race_test.ok((select bool_and((rule ->> 'knee_ratio')::int = 3 and not (rule ->> 'count_partial_groups')::boolean
                                     and (rule ->> 'style_locked_at_station_start')::boolean and st = 'CONVERTED_REPS') from r where n = 2),
  'S02: knee = 3 reps : 1 score, only complete groups, style locked at station start');
select race_test.eq((select string_agg(c || '=' || (e ->> 'load_kg'), ',' order by c) from r where n = 3), 'MASTERS=80,MEN=100,WOMEN=60',
  'S03: sled 100 / 60 / 80 kg, 10 m laps');
select race_test.ok((select bool_and((e ->> 'lap_m')::int = 10 and not (rule ->> 'count_incomplete_lap')::boolean) from r where n = 3),
  'S03: incomplete lap does not count');
select race_test.ok((select bool_and((rule ->> 'technique_tiebreak_order')::int = 1 and (rule ->> 'both_punches_must_touch')::boolean) from r where n = 4)
                    and (select has_technique from race_station_templates where number = 4),
  'S04: both punches must touch; technique /10 is tie-break #1');
select race_test.eq((select string_agg(c || '=' || (e ->> 'box_height_cm'), ',' order by c) from r where n = 5), 'MASTERS=40,MEN=50,WOMEN=40',
  'S05: box 50 / 40 / 40 cm');
select race_test.eq((select string_agg(c || '=' || (e ->> 'dumbbells_kg'), ',' order by c) from r where n = 6),
  'MASTERS=[20, 20],MEN=[24, 24],WOMEN=[16, 16]', 'S06: dumbbells 2×24 / 2×16 / 2×20 kg');
select race_test.ok((select bool_and(rule ->> 'penalty' = 'CANCEL_LAST_COMPLETED_LAP' and rule ->> 'zero_lap_penalty' = 'NO_EFFECT'
                                     and (rule ->> 'min_official_laps')::int = 0 and rule ->> 'breaks' = 'unlimited') from r where n = 6),
  'S06: penalty cancels last completed lap; 0-lap penalty has no effect; never negative (F-4)');
select race_test.ok((select bool_and(rule -> 'barrier_rule_text' = 'null'::jsonb and not (rule ->> 'barrier_rule_final')::boolean
                                     and (rule ->> 'technique_tiebreak_order')::int = 2 and (rule ->> 'alternating_legs')::boolean) from r where n = 7)
                    and (select has_technique from race_station_templates where number = 7),
  'S07: barrier rule configurable & not finalized (no invented mechanics); technique /10 is tie-break #2');
select race_test.ok((select bool_and((rule ->> 'speedball_touches_per_cycle')::int = 2 and (rule ->> 'floor_touch_required')::boolean
                                     and not (rule ->> 'extra_jump_required')::boolean) from r where n = 8),
  'S08: 1 burpee + 2 speed-ball touches; no extra jump requirement');
select race_test.eq((select string_agg(c || '=' || (e ->> 'damper'), ',' order by c) from r where n = 9), 'MASTERS=4,MEN=5,WOMEN=4',
  'S09: damper 5 / 4 / 4');
select race_test.ok((select bool_and(st = 'DISTANCE_M' and (rule ->> 'retain_original_image')::boolean and (rule ->> 'judge_confirmation_required')::boolean) from r where n = 9)
                    and (select requires_ocr from race_station_templates where number = 9),
  'S09: metres from photo, judge-confirmed OCR, original image retained');
select race_test.eq((select count(*) from race_station_templates where has_technique)::int, 2, 'seed: technique score only at S04 and S07');

-- Instantiation into a real event is exact.
select race_test.eq((select count(*) from (
    select s.number, c.code, sr.scoring_type, sr.higher_is_better, sr.movement, sr.equipment, sr.rule
    from race_station_rules sr join race_stations s on s.id = sr.station_id join race_categories c on c.id = sr.category_id
    where sr.event_id = race_test.id('event_b')
    except
    select station_number, category_code, scoring_type, higher_is_better, movement, equipment, rule from race_station_rule_templates) d)::int,
  0, 'instantiate: race_create_event() copies all 27 rules exactly');
select race_test.ok((select count(*) = 3 from race_categories where event_id = race_test.id('event_b'))
                    and (select count(*) = 9 from race_stations where event_id = race_test.id('event_b')),
  'instantiate: event has 3 categories and 9 stations');

begin;
delete from race_station_rule_templates where station_number = 9 and category_code = 'MASTERS';
select race_test.login('super');
select race_test.throws($$select race_create_event(race_test.id('branch_a'), 'broken-seed', current_date)$$,
  'RACE_SEED_INCOMPLETE', 'instantiate: an incomplete rulebook refuses to create an event');
rollback;
reset role;

-- Templates are super-admin-only; event rules are tunable pre-start and versioned.
select race_test.login('bm_a');
select race_test.eq(race_test.affected($$update race_station_rule_templates set equipment = '{}' where station_number = 3$$), 0::bigint,
  'templates: event manager cannot alter the rulebook templates');
select race_test.eq(race_test.affected($$update race_station_rules set rule = rule || '{"barrier_rule_text": "Clear the 30 cm barrier with the kicking leg"}'
                                         where event_id = race_test.id('event_a')
                                           and station_id = (select id from race_stations where event_id = race_test.id('event_a') and number = 7)$$),
  3::bigint, 'rules: event manager sets the S07 barrier text for all 3 categories (pre-start)');
select race_test.ok((select bool_and(version = 2) from race_station_rules sr join race_stations s on s.id = sr.station_id
                     where sr.event_id = race_test.id('event_a') and s.number = 7)
                    and (select count(*) = 3 from admin_audit_log where action = 'race.station_rules.update'),
  'rules: each rule edit bumps version and is audited (configuration change)');
select race_test.login('super');
select race_test.eq(race_test.affected($$update race_station_rule_templates set rule = rule where station_number = 3$$), 3::bigint,
  'templates: super admin can maintain the rulebook');
reset role;
