-- PRIVATE DEMO + STATION & EXERCISE EDITOR (database side).
--
-- Reuses the existing race engine: events already own a PRIVATE COPY of the 9 stations and 27 rules (race_create_event copies the templates), the config
-- guard already freezes them once the race has started, and every row change is already audited. This migration adds, around that:
--   * display fields per station (exercise name, instructions, equipment note) — judge / station-screen / admin read them via race_station_display()
--   * exercise TEMPLATES: the supported movement types with their scoring type and judge actions (unsupported ones are listed and refused)
--   * VERSIONED configuration snapshots per event (append-only); the version in force when the race starts is frozen
--   * RPCs: get / preview / update / reset / copy a station configuration — manager-only, reason mandatory, locked once the race starts, fully audited
--   * a private DEMO workflow: demo events (never publicly registrable), demo athletes, heats, check-in, "new run" (copies the configuration)
-- Nothing here changes the timing engine, the scoring tally, the ranking or the OCR workflow. The templates and the nine-station default are untouched.

alter table race_events add column if not exists is_demo boolean not null default false;

-- ---------------------------------------------------------------------------
-- station display fields (+ the defaults for the rulebook stations)
-- ---------------------------------------------------------------------------
alter table race_station_templates
  add column if not exists exercise_name text,
  add column if not exists instructions text,
  add column if not exists equipment_note text;

update race_station_templates t set exercise_name = v.ex, instructions = v.ins, equipment_note = v.eq
  from (values
    (1, 'Barbell squat / Masters wall squat hold', 'Men and Women: squat to chair depth and return to full extension — one rep each. Masters: hold the wall squat on the mark; at most 2 breaks, the 3rd exit ends the hold.', 'Barbell (Men 20 kg, Women 5 kg), chair-depth marker, wall mark'),
    (2, 'Push-up', 'Chest to the floor, full lockout. Knee push-ups count 3 reps = 1 score. The style is chosen before the station and locked when it starts.', 'None'),
    (3, 'Sled push', 'Push the sled 10 m and back. Only completed 10 m laps count.', 'Sled (Men 100 kg, Women 60 kg, Masters 80 kg), 10 m lane'),
    (4, 'Jab + cross', 'Both punches must touch the pad to count as one rep. Technique /10 is the first tie-break.', 'Punch bag or focus pad'),
    (5, 'Box jump', 'Both feet on top, return fully to the ground, then cross to the other side.', 'Box (Men 50 cm, Women/Masters 40 cm)'),
    (6, 'Dumbbell carry', 'Carry two dumbbells over 10 m laps. Breaks are unlimited. A thrown dumbbell cancels the last completed lap (F-4).', 'Dumbbells (Men 24 kg, Women 16 kg, Masters 20 kg)'),
    (7, 'Front kick', 'Alternate legs and touch the target. Technique /10 is the second tie-break. The barrier rule is not finalized.', 'Kick target / pad'),
    (8, 'Burpee + speed ball', 'One burpee (full floor touch), then two speed-ball touches, counts as one rep.', 'Speed ball at a fixed height'),
    (9, 'Rowing', 'Row for 3:00. The final distance is read from the photographed display and confirmed by the judge.', 'Rowing machine')
  ) v(n, ex, ins, eq)
 where t.number = v.n;

alter table race_stations
  add column if not exists exercise_name text check (exercise_name is null or length(trim(exercise_name)) between 1 and 80),
  add column if not exists instructions text check (instructions is null or length(instructions) <= 600),
  add column if not exists equipment_note text check (equipment_note is null or length(equipment_note) <= 200),
  add column if not exists template_code text;      -- null = the rulebook default configuration (per-category rules as seeded)

-- new stations (race_create_event copies number/code/name/flags) pick up the template's display defaults
create or replace function race_station_fill_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.race_station_templates;
begin
  select * into t from public.race_station_templates where code = NEW.code;
  if t.number is not null then
    NEW.exercise_name := coalesce(NEW.exercise_name, t.exercise_name);
    NEW.instructions := coalesce(NEW.instructions, t.instructions);
    NEW.equipment_note := coalesce(NEW.equipment_note, t.equipment_note);
  end if;
  return NEW;
end $$;
create trigger trg_race_stations_defaults before insert on race_stations for each row execute function race_station_fill_defaults();

-- ---------------------------------------------------------------------------
-- exercise templates
-- ---------------------------------------------------------------------------
create table race_exercise_templates (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  label text not null,
  description text not null,
  supported boolean not null,
  unsupported_reason text,
  scoring_type race_scoring_type,
  judge_actions text[] not null default '{}',
  has_technique boolean not null default false,
  requires_ocr boolean not null default false,
  allowed_stations int[],
  default_movement text,
  default_equipment jsonb not null default '{}'::jsonb check (jsonb_typeof(default_equipment) = 'object'),
  default_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(default_rule) = 'object'),
  sort_order int not null default 100,
  check (supported = (scoring_type is not null)),
  check (supported or unsupported_reason is not null)
);
alter table race_exercise_templates enable row level security;
revoke all on race_exercise_templates from public, anon, authenticated;

insert into race_exercise_templates (code, label, description, supported, unsupported_reason, scoring_type, judge_actions, has_technique, requires_ocr, allowed_stations, default_movement, default_equipment, default_rule, sort_order) values
  ('REPS', 'Counted repetitions', 'The judge taps +REP / NO REP; score = valid repetitions.', true, null, 'REPS', array['REP','NO_REP','VOID'], false, false, array[1,2,3,5,6,8], 'Repetitions', '{}', '{"valid_rep": "a complete, controlled repetition"}', 10),
  ('PUSHUP_STYLE', 'Push-up style repetitions (knee 3 : 1)', 'Repetitions with the push-up style chosen at registration: Knee counts 3 reps = 1 score (remainder ignored).', true, null, 'CONVERTED_REPS', array['REP','NO_REP','VOID'], false, false, array[1,2,3,5,6,8], 'Push-Up', '{}', '{"knee_ratio": 3, "count_partial_groups": false, "any_athlete_may_choose_knee": true, "style_locked_at_station_start": true}', 20),
  ('LAPS', 'Completed laps (10 m)', 'The judge taps +LAP for each completed 10 m lap; incomplete laps do not count.', true, null, 'LAPS', array['LAP','VOID'], false, false, array[1,2,3,5,6,8], 'Laps', '{"lap_m": 10}', '{"count_incomplete_lap": false}', 30),
  ('HOLD', 'Timed hold with a break limit', 'The judge starts / breaks / resumes the hold; score = accumulated valid hold time; the exit beyond the break limit ends the hold.', true, null, 'HOLD_MS', array['HOLD_START','HOLD_BREAK','HOLD_RESUME','VOID'], false, false, array[1,2,3,5,6,8], 'Hold', '{}', '{"max_breaks": 2}', 40),
  ('REPS_TECHNIQUE', 'Counted repetitions + technique score /10', 'Repetitions plus a technique score /10 used as a ranking tie-break (S04 first, S07 second).', true, null, 'REPS', array['REP','NO_REP','TECHNIQUE_SCORE','VOID'], true, false, array[4,7], 'Repetitions', '{}', '{"technique_max": 10}', 50),
  ('DISTANCE_OCR', 'Distance from the photographed display (OCR + judge confirmation)', 'Rowing: the distance comes from the display photo, read by OCR and confirmed by the judge; Master Control reviews late confirmations.', true, null, 'DISTANCE_M', array['PHOTO','CONFIRM','RETAKE'], false, true, array[9], 'Rowing', '{}', '{"evidence": "photo", "ocr_assist": true, "judge_confirmation_required": true, "retain_original_image": true}', 60),
  ('TIME_FOR_DISTANCE', 'Fastest time over a fixed distance', 'A timing-based score where LOWER is better.', false, 'Not implemented: the engine ranks higher-is-better scores only and has no stopwatch scoring.', null, '{}', false, false, null, null, '{}', '{}', 200),
  ('MAX_LOAD', 'Heaviest load lifted', 'A one-rep-max style score.', false, 'Not implemented: no load-entry scoring type exists.', null, '{}', false, false, null, null, '{}', '{}', 210),
  ('CUSTOM_TEXT', 'Free-form / unscored exercise', 'An exercise with no defined scoring.', false, 'Not supported: every station must produce a rank-able score.', null, '{}', false, false, null, null, '{}', '{}', 220);

-- ---------------------------------------------------------------------------
-- versioned configuration snapshots (append-only)
-- ---------------------------------------------------------------------------
create table race_station_config_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id),
  version int not null check (version >= 1),
  config jsonb not null check (jsonb_typeof(config) = 'array'),
  reason text,
  frozen boolean not null default false,          -- true = the configuration the race STARTED with
  created_by uuid references race_profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (event_id, version)
);
create unique index uq_race_config_one_frozen on race_station_config_versions (event_id) where frozen;
alter table race_station_config_versions enable row level security;
revoke all on race_station_config_versions from public, anon, authenticated;
select race_make_append_only('race_station_config_versions');

-- ---------------------------------------------------------------------------
-- internals
-- ---------------------------------------------------------------------------
create or replace function race_station_config_json(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'number', s.number, 'code', s.code, 'name', s.name, 'exercise_name', s.exercise_name, 'instructions', s.instructions,
    'equipment_note', s.equipment_note, 'template_code', s.template_code, 'has_technique', s.has_technique, 'requires_ocr', s.requires_ocr,
    'categories', (select jsonb_object_agg(c.code, jsonb_build_object('scoring_type', r.scoring_type, 'higher_is_better', r.higher_is_better,
                                                                         'movement', r.movement, 'equipment', r.equipment, 'rule', r.rule))
                     from public.race_station_rules r join public.race_categories c on c.id = r.category_id where r.station_id = s.id)
  ) order by s.number), '[]'::jsonb)
  from public.race_stations s where s.event_id = p_event_id
$$;
revoke execute on function race_station_config_json(uuid) from public, anon, authenticated;

create or replace function race_snapshot_station_config(p_event_id uuid, p_reason text, p_frozen boolean default false)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare cfg jsonb; last public.race_station_config_versions; v int;
begin
  perform pg_advisory_xact_lock(hashtextextended('race-config:' || p_event_id::text, 0));
  cfg := public.race_station_config_json(p_event_id);
  select * into last from public.race_station_config_versions where event_id = p_event_id order by version desc limit 1;
  if last.id is not null and not p_frozen and last.config = cfg then return last.version; end if;
  if p_frozen and exists (select 1 from public.race_station_config_versions where event_id = p_event_id and frozen) then
    return (select version from public.race_station_config_versions where event_id = p_event_id and frozen);
  end if;
  v := coalesce(last.version, 0) + 1;
  insert into public.race_station_config_versions (event_id, version, config, reason, frozen, created_by)
  values (p_event_id, v, cfg, left(coalesce(p_reason, ''), 300), p_frozen, auth.uid());
  return v;
end $$;
revoke execute on function race_snapshot_station_config(uuid, text, boolean) from public, anon, authenticated;

-- the configuration in force when the race starts is frozen as its own version
create or replace function race_freeze_station_config()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if NEW.status = 'LIVE' and OLD.status is distinct from 'LIVE' then
    perform public.race_snapshot_station_config(NEW.id, 'race started — configuration frozen', true);
  end if;
  return NEW;
end $$;
create trigger trg_race_events_freeze_config after update of status on race_events for each row execute function race_freeze_station_config();

create or replace function race_judge_buttons(p_scoring_type text, p_rule jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select case p_scoring_type
    when 'REPS' then array['REP', 'NO_REP', 'UNDO']
    when 'CONVERTED_REPS' then array['REP', 'NO_REP', 'UNDO']
    when 'LAPS' then case when p_rule ? 'penalty' then array['LAP', 'PENALTY', 'UNDO'] else array['LAP', 'UNDO'] end
    when 'HOLD_MS' then array['HOLD_START', 'HOLD_BREAK', 'HOLD_RESUME', 'UNDO']
    when 'DISTANCE_M' then array['PHOTO', 'CONFIRM', 'RETAKE']
    else array[]::text[] end
$$;

-- validates a patch and computes the resulting configuration WITHOUT writing anything (used by preview and by update)
create or replace function race_station_plan_patch(p_event_id uuid, p_station_number int, p_patch jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  st public.race_stations;
  k text; cat_code text; kk text; vv jsonb;
  errs text[] := '{}'; warns text[] := '{}'; confl text[] := '{}';
  v_name text; v_ex text; v_in text; v_eq text; v_tpl text; v_tech boolean; v_ocr boolean;
  t public.race_exercise_templates;
  r public.race_station_rules;
  cats jsonb := '{}'::jsonb; pc jsonb; v_scoring text; v_movement text; v_equip jsonb; v_rule jsonb; v_allowed text[];
  tpl_changed boolean := false; scoring_changed boolean := false; v_n int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'RACE_CONFIG_INVALID: the change must be a JSON object' using errcode = 'check_violation';
  end if;
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  if st.id is null then raise exception 'RACE_NOT_FOUND: no such station' using errcode = 'no_data_found'; end if;

  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('name', 'exercise_name', 'instructions', 'equipment_note', 'template_code', 'categories', 'enabled', 'number', 'confirm_scoring_change') then
      errs := errs || ('unknown field: ' || k);
    end if;
  end loop;

  v_name := st.name; v_ex := st.exercise_name; v_in := st.instructions; v_eq := st.equipment_note; v_tpl := st.template_code; v_tech := st.has_technique; v_ocr := st.requires_ocr;
  if p_patch ? 'name' then v_name := trim(coalesce(p_patch ->> 'name', ''));
    if length(v_name) not between 1 and 60 then errs := array_append(errs, 'station name must be 1–60 characters'::text); end if; end if;
  if p_patch ? 'exercise_name' then v_ex := trim(coalesce(p_patch ->> 'exercise_name', ''));
    if length(v_ex) not between 1 and 80 then errs := array_append(errs, 'exercise name must be 1–80 characters'::text); end if; end if;
  if p_patch ? 'instructions' then v_in := trim(coalesce(p_patch ->> 'instructions', ''));
    if length(v_in) > 600 then errs := array_append(errs, 'instructions must be at most 600 characters'::text); end if; end if;
  if p_patch ? 'equipment_note' then v_eq := trim(coalesce(p_patch ->> 'equipment_note', ''));
    if length(v_eq) > 200 then errs := array_append(errs, 'equipment note must be at most 200 characters'::text); end if; end if;

  if p_patch ? 'number' and (p_patch ->> 'number') is distinct from p_station_number::text then
    confl := array_append(confl, 'LOCKED RULE: the station number is the race route order (3:00 + 0:30 per station, S04/S07 technique tie-breaks, S09 rowing). It cannot be renumbered; rename the station or exercise instead.'::text);
  end if;
  if p_patch ? 'enabled' and (p_patch ->> 'enabled') is distinct from 'true' then
    confl := array_append(confl, 'LOCKED RULE: every athlete passes all nine stations (31 minutes). A station cannot be disabled; the engine would still run its 3:00 + 0:30 window.'::text);
  end if;

  if p_patch ? 'template_code' then
    if p_patch ->> 'template_code' is null then
      errs := array_append(errs, 'template_code cannot be null — use "Reset to rulebook default" instead'::text);
    elsif p_patch ->> 'template_code' is distinct from st.template_code then
      select * into t from public.race_exercise_templates where code = p_patch ->> 'template_code';
      if t.code is null then errs := errs || ('unknown exercise template: ' || (p_patch ->> 'template_code'));
      elsif not t.supported then confl := confl || ('UNSUPPORTED: "' || t.label || '" — ' || t.unsupported_reason);
      elsif t.allowed_stations is not null and not (p_station_number = any (t.allowed_stations)) then
        confl := confl || ('LOCKED RULE: "' || t.label || '" cannot be used at station ' || p_station_number || '. Stations 4 and 7 keep the technique-scored template (technique tie-breaks), station 9 keeps rowing evidence, and those templates belong only to those stations.');
      elsif p_station_number in (4, 7, 9) then
        confl := confl || ('LOCKED RULE: station ' || p_station_number || ' must keep its rulebook exercise type (technique tie-breaks are defined on S04/S07, rowing evidence on S09).');
      else
        tpl_changed := true; v_tpl := t.code; v_tech := t.has_technique; v_ocr := t.requires_ocr;
      end if;
    end if;
  end if;

  -- per-category rules
  if p_patch ? 'categories' and jsonb_typeof(p_patch -> 'categories') <> 'object' then errs := array_append(errs, 'categories must be an object'::text); end if;
  for cat_code in select c.code::text from public.race_categories c where c.event_id = p_event_id order by c.sort_order loop
    select ru.* into r from public.race_station_rules ru join public.race_categories ca on ca.id = ru.category_id
     where ru.station_id = st.id and ca.code::text = cat_code;
    v_scoring := r.scoring_type::text; v_movement := r.movement; v_equip := r.equipment; v_rule := r.rule;
    if tpl_changed then
      v_scoring := t.scoring_type::text; v_movement := t.default_movement; v_equip := t.default_equipment; v_rule := t.default_rule;
    end if;
    pc := case when jsonb_typeof(p_patch -> 'categories') = 'object' then p_patch -> 'categories' -> cat_code else null end;
    if pc is not null then
      if jsonb_typeof(pc) <> 'object' then errs := errs || (cat_code || ': must be an object');
      else
        for kk in select jsonb_object_keys(pc) loop
          if kk not in ('movement', 'equipment', 'rule') then errs := errs || (cat_code || ': unknown field ' || kk); end if;
        end loop;
        if pc ? 'movement' then
          v_movement := trim(coalesce(pc ->> 'movement', ''));
          if length(v_movement) not between 1 and 60 then errs := errs || (cat_code || ': movement must be 1–60 characters'); end if;
        end if;
        if pc ? 'equipment' then
          if jsonb_typeof(pc -> 'equipment') <> 'object' then errs := errs || (cat_code || ': equipment must be an object');
          else
            v_n := 0;
            for kk, vv in select key, value from jsonb_each(pc -> 'equipment') loop
              v_n := v_n + 1;
              if kk !~ '^[a-z][a-z0-9_]{0,29}$' then errs := errs || (cat_code || ': equipment key "' || kk || '" is not allowed');
              elsif jsonb_typeof(vv) not in ('number', 'string', 'boolean')
                    and not (jsonb_typeof(vv) = 'array' and not exists (select 1 from jsonb_array_elements(vv) e where jsonb_typeof(e) <> 'number')) then
                errs := errs || (cat_code || ': equipment "' || kk || '" must be a number, text, true/false or a list of numbers');
              elsif jsonb_typeof(vv) = 'string' and length(vv #>> '{}') > 80 then errs := errs || (cat_code || ': equipment "' || kk || '" is too long');
              end if;
            end loop;
            if v_n > 12 then errs := errs || (cat_code || ': at most 12 equipment values'); end if;
            v_equip := pc -> 'equipment';
          end if;
        end if;
        if pc ? 'rule' then
          if jsonb_typeof(pc -> 'rule') <> 'object' then errs := errs || (cat_code || ': rule must be an object');
          else
            v_allowed := case v_scoring when 'REPS' then array['valid_rep'] when 'CONVERTED_REPS' then array['knee_ratio'] when 'HOLD_MS' then array['max_breaks'] else array[]::text[] end;
            for kk, vv in select key, value from jsonb_each(pc -> 'rule') loop
              if not (kk = any (v_allowed)) then errs := errs || (cat_code || ': rule "' || kk || '" is not editable for ' || v_scoring);
              elsif kk = 'valid_rep' and (jsonb_typeof(vv) <> 'string' or length(vv #>> '{}') > 200) then errs := errs || (cat_code || ': valid_rep must be text of at most 200 characters');
              elsif kk = 'knee_ratio' and (jsonb_typeof(vv) <> 'number' or (vv #>> '{}') !~ '^[2-6]$') then errs := errs || (cat_code || ': knee_ratio must be a whole number 2–6');
              elsif kk = 'max_breaks' and (jsonb_typeof(vv) <> 'number' or (vv #>> '{}') !~ '^([0-9]|10)$') then errs := errs || (cat_code || ': max_breaks must be a whole number 0–10');
              else v_rule := v_rule || jsonb_build_object(kk, vv);
              end if;
            end loop;
          end if;
        end if;
      end if;
    end if;
    if (v_scoring, v_rule -> 'knee_ratio', v_rule -> 'max_breaks') is distinct from (r.scoring_type::text, r.rule -> 'knee_ratio', r.rule -> 'max_breaks') then
      scoring_changed := true;
    end if;
    cats := cats || jsonb_build_object(cat_code, jsonb_build_object('scoring_type', v_scoring, 'higher_is_better', r.higher_is_better, 'movement', v_movement, 'equipment', v_equip, 'rule', v_rule));
  end loop;
  if scoring_changed then warns := array_append(warns, 'This changes how scores are CALCULATED for this station (scoring type or a scoring parameter). Confirmation is required.'::text); end if;
  if tpl_changed then warns := array_append(warns, 'Changing the exercise type replaces the scoring configuration of all three categories with the template defaults.'::text); end if;

  return jsonb_build_object(
    'errors', to_jsonb(errs), 'conflicts', to_jsonb(confl), 'warnings', to_jsonb(warns),
    'template_changed', tpl_changed, 'scoring_changed', scoring_changed,
    'station', jsonb_build_object('number', st.number, 'name', v_name, 'exercise_name', v_ex, 'instructions', v_in, 'equipment_note', v_eq,
                                  'template_code', v_tpl, 'has_technique', v_tech, 'requires_ocr', v_ocr),
    'categories', cats);
end $$;
revoke execute on function race_station_plan_patch(uuid, int, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function race_get_station_config(p_event_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e public.race_events; v_mgr boolean; v_locked boolean; v_version int;
begin
  v_mgr := public.race_is_manager(p_event_id) is true;
  if not v_mgr and public.race_is_event_staff(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.race_events where id = p_event_id;
  if e.id is null then raise exception 'RACE_NOT_FOUND: event' using errcode = 'no_data_found'; end if;
  v_locked := public.race_event_started(p_event_id);
  if v_mgr and not v_locked then v_version := public.race_snapshot_station_config(p_event_id, 'baseline', false);
  else select max(version) into v_version from public.race_station_config_versions where event_id = p_event_id; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'status', e.status, 'is_demo', e.is_demo),
    'locked', v_locked,
    'lock_reason', case when v_locked then 'The race has started: the station configuration is frozen for this event.' end,
    'can_edit', v_mgr and not v_locked,
    'version', v_version,
    'frozen_version', (select version from public.race_station_config_versions where event_id = p_event_id and frozen),
    'stations', (select coalesce(jsonb_agg(el || jsonb_build_object(
        'template_options', (select coalesce(jsonb_agg(t.code order by t.sort_order), '[]'::jsonb) from public.race_exercise_templates t
                              where t.supported and (t.allowed_stations is null or (el ->> 'number')::int = any (t.allowed_stations))),
        'locked_rule', case (el ->> 'number')::int
          when 4 then 'Technique tie-break station (S04): keeps the technique-scored repetition type.'
          when 7 then 'Technique tie-break station (S07): keeps the technique-scored repetition type.'
          when 9 then 'Rowing evidence station (S09): keeps distance-from-photo scoring and the OCR review workflow.' end
      ) order by (el ->> 'number')::int), '[]'::jsonb) from jsonb_array_elements(public.race_station_config_json(p_event_id)) el),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'label', t.label, 'description', t.description, 'supported', t.supported,
        'unsupported_reason', t.unsupported_reason, 'scoring_type', t.scoring_type, 'judge_actions', t.judge_actions, 'has_technique', t.has_technique,
        'requires_ocr', t.requires_ocr, 'allowed_stations', t.allowed_stations) order by t.sort_order), '[]'::jsonb) from public.race_exercise_templates t),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('version', x.version, 'created_at', x.created_at, 'reason', x.reason, 'frozen', x.frozen,
        'created_by', (select coalesce(p.full_name, p.email) from public.race_profiles p where p.id = x.created_by)) order by x.version desc), '[]'::jsonb)
        from (select * from public.race_station_config_versions where event_id = p_event_id order by version desc limit 20) x));
end $$;

create or replace function race_preview_station_config(p_event_id uuid, p_station_number int, p_patch jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare plan jsonb; cat_code text; st jsonb;
begin
  if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  plan := public.race_station_plan_patch(p_event_id, p_station_number, p_patch);
  st := plan -> 'station';
  return plan || jsonb_build_object(
    'valid', jsonb_array_length(plan -> 'errors') = 0 and jsonb_array_length(plan -> 'conflicts') = 0,
    'preview', jsonb_build_object(
      'judge', jsonb_build_object(
        'header', 'Judge · Station ' || lpad(p_station_number::text, 2, '0') || ' · ' || (st ->> 'name'),
        'exercise_name', st ->> 'exercise_name', 'instructions', st ->> 'instructions', 'equipment_note', st ->> 'equipment_note',
        'has_technique', (st ->> 'has_technique')::boolean,
        'categories', (select jsonb_object_agg(key, jsonb_build_object('movement', value ->> 'movement', 'scoring_type', value ->> 'scoring_type',
                         'buttons', to_jsonb(public.race_judge_buttons(value ->> 'scoring_type', value -> 'rule')))) from jsonb_each(plan -> 'categories'))),
      'screen', jsonb_build_object('station_label', 'STATION ' || lpad(p_station_number::text, 2, '0'), 'station_name', st ->> 'name', 'exercise_name', st ->> 'exercise_name')));
end $$;

create or replace function race_update_station_config(p_event_id uuid, p_station_number int, p_patch jsonb, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare plan jsonb; st public.race_stations; before_cfg jsonb; after_cfg jsonb; v_version int; cat_code text; pcat jsonb; changes jsonb := '{}'::jsonb; b jsonb; a jsonb; k text;
begin
  if auth.uid() is null or public.race_is_manager(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the Event Manager can change the station configuration' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED: say what is changed and why' using errcode = 'check_violation';
  end if;
  if public.race_event_started(p_event_id) then
    raise exception 'RACE_CONFIG_LOCKED: the race has started — its station configuration is frozen' using errcode = 'check_violation';
  end if;
  plan := public.race_station_plan_patch(p_event_id, p_station_number, p_patch);
  if jsonb_array_length(plan -> 'conflicts') > 0 then
    raise exception 'RACE_RULE_CONFLICT: %', (select string_agg(x, ' | ') from jsonb_array_elements_text(plan -> 'conflicts') x) using errcode = 'check_violation';
  end if;
  if jsonb_array_length(plan -> 'errors') > 0 then
    raise exception 'RACE_CONFIG_INVALID: %', (select string_agg(x, ' | ') from jsonb_array_elements_text(plan -> 'errors') x) using errcode = 'check_violation';
  end if;
  if (plan ->> 'scoring_changed')::boolean and coalesce((p_patch ->> 'confirm_scoring_change')::boolean, false) is not true then
    raise exception 'RACE_CONFIRM_REQUIRED: this change alters how scores are calculated — confirm it explicitly (confirm_scoring_change)' using errcode = 'check_violation';
  end if;
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  perform public.race_snapshot_station_config(p_event_id, 'baseline', false);         -- the configuration as it was, before this change
  before_cfg := (select el from jsonb_array_elements(public.race_station_config_json(p_event_id)) el where (el ->> 'number')::int = p_station_number);

  update public.race_stations set
      name = plan #>> '{station,name}', exercise_name = plan #>> '{station,exercise_name}', instructions = nullif(plan #>> '{station,instructions}', ''),
      equipment_note = nullif(plan #>> '{station,equipment_note}', ''), template_code = plan #>> '{station,template_code}',
      has_technique = (plan #>> '{station,has_technique}')::boolean, requires_ocr = (plan #>> '{station,requires_ocr}')::boolean
   where id = st.id;
  for cat_code, pcat in select key, value from jsonb_each(plan -> 'categories') loop
    update public.race_station_rules ru set scoring_type = (pcat ->> 'scoring_type')::public.race_scoring_type, movement = pcat ->> 'movement',
           equipment = pcat -> 'equipment', rule = pcat -> 'rule'
     from public.race_categories ca where ca.id = ru.category_id and ru.station_id = st.id and ca.code::text = cat_code;
  end loop;

  after_cfg := (select el from jsonb_array_elements(public.race_station_config_json(p_event_id)) el where (el ->> 'number')::int = p_station_number);
  if before_cfg = after_cfg then
    raise exception 'RACE_NO_CHANGE: nothing was changed' using errcode = 'check_violation';
  end if;
  for k in select jsonb_object_keys(after_cfg) loop
    if after_cfg -> k is distinct from before_cfg -> k then changes := changes || jsonb_build_object(k, jsonb_build_object('from', before_cfg -> k, 'to', after_cfg -> k)); end if;
  end loop;
  v_version := public.race_snapshot_station_config(p_event_id, left(trim(p_reason), 300), false);
  perform public.race_audit('race.station_config.update', p_event_id, 'race_stations', st.id, before_cfg, after_cfg,
    jsonb_build_object('reason', trim(p_reason), 'station', p_station_number, 'changes', changes, 'version', v_version,
                       'template_changed', (plan ->> 'template_changed')::boolean, 'scoring_changed', (plan ->> 'scoring_changed')::boolean));
  return jsonb_build_object('version', v_version, 'station', after_cfg, 'changes', changes);
end $$;

create or replace function race_reset_station_config(p_event_id uuid, p_station_number int, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare st public.race_stations; tpl public.race_station_templates; before_cfg jsonb; after_cfg jsonb; v_version int;
begin
  if auth.uid() is null or public.race_is_manager(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the Event Manager can change the station configuration' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: say why' using errcode = 'check_violation'; end if;
  if public.race_event_started(p_event_id) then raise exception 'RACE_CONFIG_LOCKED: the race has started — its station configuration is frozen' using errcode = 'check_violation'; end if;
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  if st.id is null then raise exception 'RACE_NOT_FOUND: no such station' using errcode = 'no_data_found'; end if;
  select * into tpl from public.race_station_templates where number = p_station_number;
  perform public.race_snapshot_station_config(p_event_id, 'baseline', false);
  before_cfg := (select el from jsonb_array_elements(public.race_station_config_json(p_event_id)) el where (el ->> 'number')::int = p_station_number);
  update public.race_stations set name = tpl.name, exercise_name = tpl.exercise_name, instructions = tpl.instructions, equipment_note = tpl.equipment_note,
         template_code = null, has_technique = tpl.has_technique, requires_ocr = tpl.requires_ocr where id = st.id;
  update public.race_station_rules ru set scoring_type = rt.scoring_type, higher_is_better = rt.higher_is_better, movement = rt.movement, equipment = rt.equipment, rule = rt.rule
    from public.race_station_rule_templates rt, public.race_categories ca
   where ca.id = ru.category_id and ru.station_id = st.id and rt.station_number = p_station_number and rt.category_code = ca.code;
  after_cfg := (select el from jsonb_array_elements(public.race_station_config_json(p_event_id)) el where (el ->> 'number')::int = p_station_number);
  if before_cfg = after_cfg then raise exception 'RACE_NO_CHANGE: the station already matches the rulebook default' using errcode = 'check_violation'; end if;
  v_version := public.race_snapshot_station_config(p_event_id, left('reset to rulebook default: ' || trim(p_reason), 300), false);
  perform public.race_audit('race.station_config.reset', p_event_id, 'race_stations', st.id, before_cfg, after_cfg,
    jsonb_build_object('reason', trim(p_reason), 'station', p_station_number, 'version', v_version));
  return jsonb_build_object('version', v_version, 'station', after_cfg);
end $$;

create or replace function race_copy_station_config(p_from_event uuid, p_to_event uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version int; n int;
begin
  if auth.uid() is null or public.race_is_manager(p_to_event) is not true or public.race_is_manager(p_from_event) is not true then
    raise exception 'RACE_FORBIDDEN: you must manage both events' using errcode = 'insufficient_privilege';
  end if;
  if p_from_event = p_to_event then raise exception 'RACE_CONFIG_INVALID: choose two different events' using errcode = 'check_violation'; end if;
  if public.race_event_started(p_to_event) then raise exception 'RACE_CONFIG_LOCKED: the target race has started' using errcode = 'check_violation'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: say why' using errcode = 'check_violation'; end if;
  perform public.race_snapshot_station_config(p_to_event, 'baseline', false);
  update public.race_stations d set name = s.name, exercise_name = s.exercise_name, instructions = s.instructions, equipment_note = s.equipment_note,
         template_code = s.template_code, has_technique = s.has_technique, requires_ocr = s.requires_ocr
    from public.race_stations s where s.event_id = p_from_event and d.event_id = p_to_event and d.number = s.number;
  get diagnostics n = row_count;
  update public.race_station_rules dr set scoring_type = sr.scoring_type, higher_is_better = sr.higher_is_better, movement = sr.movement, equipment = sr.equipment, rule = sr.rule
    from public.race_station_rules sr, public.race_stations ss, public.race_stations ds, public.race_categories sc, public.race_categories dc
   where sr.event_id = p_from_event and ss.id = sr.station_id and sc.id = sr.category_id
     and dr.event_id = p_to_event and ds.id = dr.station_id and dc.id = dr.category_id
     and ds.number = ss.number and dc.code = sc.code;
  v_version := public.race_snapshot_station_config(p_to_event, left('copied from another event: ' || trim(p_reason), 300), false);
  perform public.race_audit('race.station_config.copy', p_to_event, 'race_events', p_to_event, null,
    jsonb_build_object('from_event', p_from_event, 'stations', n, 'version', v_version), jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('version', v_version, 'stations', n);
end $$;

-- what a judge / station screen / Master dashboard shows for a station — read by any staff member of the event
create or replace function race_station_display(p_event_id uuid, p_station_number int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st public.race_stations; v_cfg jsonb;
begin
  if public.race_is_event_staff(p_event_id) is not true and public.race_is_manager(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  if st.id is null then raise exception 'RACE_NOT_FOUND: no such station' using errcode = 'no_data_found'; end if;
  return jsonb_build_object(
    'number', st.number, 'name', st.name, 'exercise_name', coalesce(st.exercise_name, st.name), 'instructions', st.instructions,
    'equipment_note', st.equipment_note, 'template_code', st.template_code, 'has_technique', st.has_technique, 'requires_ocr', st.requires_ocr,
    'config_version', coalesce((select version from public.race_station_config_versions where event_id = p_event_id and frozen),
                               (select max(version) from public.race_station_config_versions where event_id = p_event_id)),
    'categories', (select jsonb_object_agg(c.code, jsonb_build_object('scoring_type', r.scoring_type, 'movement', r.movement, 'equipment', r.equipment, 'rule', r.rule,
                          'buttons', to_jsonb(public.race_judge_buttons(r.scoring_type::text, r.rule))))
                     from public.race_station_rules r join public.race_categories c on c.id = r.category_id where r.station_id = st.id));
end $$;

-- ===========================================================================
-- who am I / my events (drives the admin hub; every check is the real server-side role helper)
-- ===========================================================================
create or replace function race_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'is_super_admin', public.race_is_super_admin() is true,
    'can_create_events', public.race_can_create_events() is true,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'status', e.status, 'is_demo', e.is_demo,
                          'event_date', e.event_date, 'manager', public.race_is_manager(e.id) is true) order by e.created_at desc)
                          from public.race_events e where auth.uid() is not null and public.race_is_event_staff(e.id) is true), '[]'::jsonb));
$$;
revoke execute on function race_my_access() from public, anon;
grant execute on function race_my_access() to authenticated;

-- ===========================================================================
-- private demo workflow. Demo events are DRAFT until the athletes are set up; they have an unguessable slug, registration is never opened to the public.
-- ===========================================================================
create or replace function race_create_demo_event(p_name text, p_copy_from uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_slug text; v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null or public.race_can_create_events() is not true then
    raise exception 'RACE_FORBIDDEN: not allowed to create events' using errcode = 'insufficient_privilege';
  end if;
  if length(v_name) not between 2 and 80 then raise exception 'RACE_INVALID_NAME: give the demo event a name (2–80 characters)' using errcode = 'check_violation'; end if;
  if p_copy_from is not null and public.race_is_manager(p_copy_from) is not true then
    raise exception 'RACE_FORBIDDEN: you cannot copy that event''s configuration' using errcode = 'insufficient_privilege';
  end if;
  v_slug := 'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_id := public.race_create_event(v_slug, (current_date + 14), v_name, 'Africa/Cairo', null);
  update public.race_events set is_demo = true, registration_fee = 0 where id = v_id;
  perform public.race_audit('race.demo.create', v_id, 'race_events', v_id, null, jsonb_build_object('slug', v_slug, 'copied_from', p_copy_from));
  if p_copy_from is not null then
    perform public.race_copy_station_config(p_copy_from, v_id, 'new demo run — configuration copied from the previous run');
  else
    perform public.race_snapshot_station_config(v_id, 'initial rulebook defaults', false);
  end if;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- clearly labelled test athletes (DEMO …), spread over the three categories, in heats of p_heat_size; payment is skipped (demo events are free)
create or replace function race_demo_add_athletes(p_event_id uuid, p_count int, p_heat_size int default 3)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e public.race_events; i int; v_base int; cats text[] := array['MEN', 'WOMEN', 'MASTERS']; c text; g public.race_gender; reg uuid;
        v_heats int; h int; heat_ids uuid[] := '{}'; v_id uuid; n int := 0; v_idx int;
begin
  if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select * into e from public.race_events where id = p_event_id for update;
  if e.id is null or not e.is_demo then raise exception 'RACE_NOT_DEMO: demo athletes can only be added to a demo event' using errcode = 'check_violation'; end if;
  if e.status <> 'DRAFT' then raise exception 'RACE_DEMO_LOCKED: athletes can only be added while the demo event is a draft (use a new run)' using errcode = 'check_violation'; end if;
  if p_count is null or p_count not between 1 and 27 then raise exception 'RACE_CONFIG_INVALID: 1–27 demo athletes' using errcode = 'check_violation'; end if;
  if p_heat_size is null or p_heat_size not between 1 and 9 then raise exception 'RACE_CONFIG_INVALID: heat size 1–9' using errcode = 'check_violation'; end if;
  select count(*) into v_base from public.race_registrations where event_id = p_event_id;
  if v_base + p_count > 27 then raise exception 'RACE_CONFIG_INVALID: a demo event holds at most 27 athletes' using errcode = 'check_violation'; end if;

  for i in 1 .. p_count loop
    v_idx := v_base + i;
    c := cats[1 + ((v_idx - 1) % 3)];
    g := case c when 'MEN' then 'male' when 'MASTERS' then 'male' else 'female' end;
    select registration_id into reg from public.race_register_core(p_event_id, 'DEMO Athlete ' || lpad(v_idx::text, 2, '0'), '+2010000' || lpad(v_idx::text, 5, '0'), null, g,
        case c when 'MASTERS' then date '1975-06-15' else date '1998-06-15' end, c::public.race_category_code, null, true,
        jsonb_build_object('name', 'DEMO Contact', 'phone', '+20100009999'), array['DRAFT']::public.race_event_status[], false);
    n := n + 1;
  end loop;

  -- heats: (re)build the plan for ALL registrations, in race-number order
  select count(*) into v_base from public.race_registrations where event_id = p_event_id and status <> 'CANCELLED';
  v_heats := ceil(v_base::numeric / p_heat_size)::int;
  update public.race_registrations set heat_id = null where event_id = p_event_id;
  delete from public.race_heats where event_id = p_event_id;
  for h in 1 .. v_heats loop
    insert into public.race_heats (event_id, number) values (p_event_id, h) returning id into v_id;
    heat_ids := heat_ids || v_id;
  end loop;
  update public.race_events set heat_size = least(greatest(p_heat_size, 1), 9) where id = p_event_id;
  update public.race_registrations r set heat_id = heat_ids[1 + ((x.rn - 1) / p_heat_size)]
    from (select id, row_number() over (order by race_number) rn from public.race_registrations where event_id = p_event_id and status <> 'CANCELLED') x
   where r.id = x.id;
  perform public.race_audit('race.demo.athletes', p_event_id, 'race_events', p_event_id, null, jsonb_build_object('added', n, 'total', v_base, 'heats', v_heats, 'heat_size', p_heat_size));
  return jsonb_build_object('added', n, 'athletes', v_base, 'heats', v_heats);
end $$;

-- lock the heats (check-in opens). Registration is opened only inside this one transaction, so the public never sees it open.
create or replace function race_demo_lock_heats(p_event_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e public.race_events;
begin
  if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select * into e from public.race_events where id = p_event_id for update;
  if e.id is null or not e.is_demo then raise exception 'RACE_NOT_DEMO' using errcode = 'check_violation'; end if;
  if e.status <> 'DRAFT' then raise exception 'RACE_INVALID_TRANSITION: the demo heats are already locked or the run has started' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.race_registrations where event_id = p_event_id and heat_id is not null) then
    raise exception 'RACE_NO_HEATS: add demo athletes first' using errcode = 'check_violation';
  end if;
  update public.race_events set status = 'REGISTRATION_OPEN' where id = p_event_id;
  perform public.race_lock_heats(p_event_id);
  perform public.race_snapshot_station_config(p_event_id, 'heats locked', false);
  return jsonb_build_object('status', 'HEATS_LOCKED');
end $$;

create or replace function race_demo_checkin_all(p_event_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e public.race_events; r record; n int := 0;
begin
  if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select * into e from public.race_events where id = p_event_id;
  if e.id is null or not e.is_demo then raise exception 'RACE_NOT_DEMO' using errcode = 'check_violation'; end if;
  if e.status not in ('HEATS_LOCKED', 'LIVE') then raise exception 'RACE_CHECKIN_NOT_OPEN: lock the heats first' using errcode = 'check_violation'; end if;
  for r in select g.id from public.race_registrations g
            where g.event_id = p_event_id and g.status = 'CONFIRMED' and g.race_status = 'REGISTERED' and g.heat_id is not null order by g.race_number loop
    perform public.race_check_in(r.id);
    n := n + 1;
  end loop;
  return jsonb_build_object('checked_in', n);
end $$;

create or replace function race_demo_status(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.race_events;
begin
  if public.race_is_event_staff(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select * into e from public.race_events where id = p_event_id;
  if e.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  return jsonb_build_object('status', e.status, 'is_demo', e.is_demo, 'started', public.race_event_started(p_event_id),
    'athletes', (select count(*) from public.race_registrations where event_id = p_event_id and status <> 'CANCELLED'),
    'heats', (select count(*) from public.race_heats where event_id = p_event_id),
    'checked_in', (select count(*) from public.race_check_ins where event_id = p_event_id and voided_by_correction_id is null),
    'config_version', (select max(version) from public.race_station_config_versions where event_id = p_event_id),
    'config_frozen', exists (select 1 from public.race_station_config_versions where event_id = p_event_id and frozen));
end $$;

-- grants: signed-in only; each function re-checks the role itself
do $$
declare f text;
begin
  foreach f in array array[
    'race_get_station_config(uuid)', 'race_preview_station_config(uuid,int,jsonb)', 'race_update_station_config(uuid,int,jsonb,text)',
    'race_reset_station_config(uuid,int,text)', 'race_copy_station_config(uuid,uuid,text)', 'race_station_display(uuid,int)',
    'race_create_demo_event(text,uuid)', 'race_demo_add_athletes(uuid,int,int)', 'race_demo_lock_heats(uuid)',
    'race_demo_checkin_all(uuid)', 'race_demo_status(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
