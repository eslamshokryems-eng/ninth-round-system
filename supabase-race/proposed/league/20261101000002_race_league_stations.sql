-- PROPOSED — NOT APPLIED. THE NINTH League — station layouts (a weekly challenge's own stations and exercises). ADDITIVE: apply only AFTER 20261101000001_race_league.sql.
--
-- Lives in supabase-race/proposed/league/, NOT in supabase/migrations/, on purpose: `supabase db push` and staging_setup.sh only ever see supabase/migrations/.
-- It is exercised ONLY against a throw-away local database by tests/harness (suites 40-42). Its rollback is 20261101000002_race_league_stations.rollback.sql.
--
-- What it adds: a League challenge may have its OWN workout layout — an ordered list of 1-20 League stations, each with 1-5 exercises (movement standard, equipment, target) and ONE typed result
-- (REPS / TIME / DISTANCE / COMPLETION). A judge records one value per station; the database validates each value, SUMS them, and records the total as the attempt's value through the EXISTING
-- race_league_record_attempt, so idempotency, eligibility, attempt limits, review, corrections, points, ties and standings are the base League's, unchanged.
--
-- Independence: every object is race_league_*; no foreign key, function or view touches race_stations, race_events, race_clock, race_station_results, race_start_slots or any race timing/scoring
-- object. The four new tables reference only League tables and race_profiles (the shared staff directory). They store no athlete (no name, e-mail, identity key or participant column).
-- Versioning: a layout is an immutable VERSION (append-only). Changing an exercise creates version n+1 with a mandatory reason. The structure (number of stations, result type, per-station cap)
-- is frozen after the first attempt; only exercise content may be substituted. A challenge's metric and unit are fixed once it has a layout.
-- Consistency is a DATABASE rule, not a habit: a deferred constraint trigger requires every non-void attempt of a challenge that has a layout to carry exactly one value per station of one
-- version of ITS layout, summing to the attempt value. The generic single-value record / correct / apply-request paths therefore fail closed on a station challenge (void stays allowed).

-- ---------------------------------------------------------------------------
-- tables (RLS on, no client privilege: every access goes through the functions below)
-- ---------------------------------------------------------------------------
create table race_league_layouts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references race_league_seasons (id),
  challenge_id uuid not null references race_league_challenges (id),
  version int not null check (version >= 1),
  result_type text not null check (result_type in ('REPS', 'TIME', 'DISTANCE', 'COMPLETION')),
  station_count smallint not null check (station_count between 1 and 20),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),   -- the validated, normalized layout exactly as accepted (the relational rows below are derived from it)
  reason text not null check (length(trim(reason)) between 1 and 300),
  created_by uuid not null references race_profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (challenge_id, version)
);
create index idx_race_league_layouts_challenge on race_league_layouts (challenge_id, version);

create table race_league_layout_stations (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references race_league_layouts (id),
  pos smallint not null check (pos between 1 and 20),
  name text not null check (length(name) between 1 and 60),
  max_value numeric(14, 3) check (max_value is null or (max_value > 0 and max_value <= 1000000)),   -- per-station cap; null = none
  unique (layout_id, pos),
  unique (id, layout_id)
);

create table race_league_layout_exercises (
  id uuid primary key default gen_random_uuid(),
  layout_station_id uuid not null references race_league_layout_stations (id),
  pos smallint not null check (pos between 1 and 5),
  name text not null check (length(name) between 1 and 80),
  standard text not null default '' check (length(standard) <= 500),
  equipment text not null default '' check (length(equipment) <= 120),
  target text not null default '' check (length(target) <= 120),
  unique (layout_station_id, pos)
);

-- one row per station of a recorded attempt, under the layout VERSION the attempt was recorded with
create table race_league_station_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references race_league_attempts (id),
  layout_id uuid not null references race_league_layouts (id),
  layout_station_id uuid not null,
  value numeric(14, 3) not null check (value >= 0 and value <= 1000000),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, layout_station_id),
  foreign key (layout_station_id, layout_id) references race_league_layout_stations (id, layout_id)   -- a result can only point at a station of its own layout version
);
create index idx_race_league_station_results_attempt on race_league_station_results (attempt_id);

alter table race_league_layouts enable row level security;
alter table race_league_layout_stations enable row level security;
alter table race_league_layout_exercises enable row level security;
alter table race_league_station_results enable row level security;
revoke all on race_league_layouts, race_league_layout_stations, race_league_layout_exercises, race_league_station_results from public, anon, authenticated;

-- immutable: update / delete / truncate are refused for everyone, the table owner included
select race_make_append_only('race_league_layouts');
select race_make_append_only('race_league_layout_stations');
select race_make_append_only('race_league_layout_exercises');
select race_make_append_only('race_league_station_results');
-- a completed season is final: no layout version can be added under it
create trigger trg_race_league_layouts_final before insert on race_league_layouts for each row execute function race_league_guard_completed();

-- ---------------------------------------------------------------------------
-- pure rules (the TypeScript twin is packages/league/domain/layout.ts; both are pinned to the shared cases in layout-cases.json)
-- ---------------------------------------------------------------------------
-- which challenge metric a layout's result type can feed (a COMPLETION layout ranks the NUMBER of stations done: NUMERIC / count)
create or replace function race_league_layout_metric_ok(p_type text, p_kind text, p_unit text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case p_type
    when 'REPS' then p_kind = 'REPS' and p_unit = 'reps'
    when 'TIME' then p_kind = 'TIME' and p_unit in ('s', 'ms')
    when 'DISTANCE' then p_kind = 'DISTANCE' and p_unit in ('m', 'km')
    when 'COMPLETION' then p_kind = 'NUMERIC' and p_unit = 'count'
    else false end, false);
$$;

-- Validate a proposed layout against the challenge's metric and return it NORMALIZED (positions assigned, text trimmed and single-spaced, absent text = ''). Unknown keys are refused (no mass assignment).
-- LOAD and mixed result types are refused, not guessed. The order of the checks and every message are mirrored exactly by layout.ts.
create or replace function race_league_validate_layout(p jsonb, p_kind text, p_unit text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_type text; k text; st jsonb; ex jsonb; i int; j int; f int; v_stations jsonb := '[]'::jsonb; v_exs jsonb; v_name text; v_sname text; v_txt text; v_cap numeric; v_obj jsonb; v_bad boolean;
  v_fields text[] := array['standard', 'equipment', 'target']; v_lim int[] := array[500, 120, 120];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'LEAGUE_INVALID: the layout must be an object' using errcode = 'check_violation'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('result_type', 'stations') then raise exception 'LEAGUE_INVALID: unknown layout field %', k using errcode = 'check_violation'; end if;
  end loop;
  if jsonb_typeof(p -> 'result_type') is distinct from 'string' or (p ->> 'result_type') not in ('REPS', 'TIME', 'DISTANCE', 'COMPLETION') then
    raise exception 'LEAGUE_INVALID: the result type must be REPS, TIME, DISTANCE or COMPLETION' using errcode = 'check_violation';
  end if;
  v_type := p ->> 'result_type';
  if not public.race_league_layout_metric_ok(v_type, p_kind, p_unit) then
    raise exception 'LEAGUE_INVALID: a % layout does not match this challenge (% in %)', v_type, p_kind, p_unit using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p -> 'stations') is distinct from 'array' or jsonb_array_length(p -> 'stations') not between 1 and 20 then
    raise exception 'LEAGUE_INVALID: a layout needs 1 to 20 stations' using errcode = 'check_violation';
  end if;
  i := 0;
  for st in select value from jsonb_array_elements(p -> 'stations') loop
    i := i + 1;
    if jsonb_typeof(st) <> 'object' then raise exception 'LEAGUE_INVALID: station % must be an object', i using errcode = 'check_violation'; end if;
    for k in select jsonb_object_keys(st) loop
      if k not in ('name', 'max_value', 'exercises') then raise exception 'LEAGUE_INVALID: unknown field % in station %', k, i using errcode = 'check_violation'; end if;
    end loop;
    v_name := case when jsonb_typeof(st -> 'name') = 'string' then trim(regexp_replace(st ->> 'name', '[ \t\n\v\f\r]+', ' ', 'g')) end;
    if v_name is null or length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]]' or v_name ~ '[<>]' or v_name ~ '^[=+@-]' then
      raise exception 'LEAGUE_INVALID: station %: the name must be 1 to 60 characters, without < > or control characters, and cannot start with = + - @', i using errcode = 'check_violation';
    end if;
    v_sname := v_name;
    v_cap := null;
    if st ? 'max_value' and jsonb_typeof(st -> 'max_value') <> 'null' then
      if jsonb_typeof(st -> 'max_value') <> 'number' then
        raise exception 'LEAGUE_INVALID: station %: the cap must be a number above 0 and up to 1000000, with at most three decimals', i using errcode = 'check_violation';
      end if;
      if v_type = 'COMPLETION' then raise exception 'LEAGUE_INVALID: station %: a completion station has no cap', i using errcode = 'check_violation'; end if;
      v_cap := (st ->> 'max_value')::numeric;
      if v_cap <= 0 or v_cap > 1000000 or v_cap <> round(v_cap, 3) then
        raise exception 'LEAGUE_INVALID: station %: the cap must be a number above 0 and up to 1000000, with at most three decimals', i using errcode = 'check_violation';
      end if;
      if v_type = 'REPS' and v_cap <> trunc(v_cap) then raise exception 'LEAGUE_INVALID: station %: a repetition cap must be a whole number', i using errcode = 'check_violation'; end if;
    end if;
    if jsonb_typeof(st -> 'exercises') is distinct from 'array' or jsonb_array_length(st -> 'exercises') not between 1 and 5 then
      raise exception 'LEAGUE_INVALID: station % needs 1 to 5 exercises', i using errcode = 'check_violation';
    end if;
    v_exs := '[]'::jsonb;
    j := 0;
    for ex in select value from jsonb_array_elements(st -> 'exercises') loop
      j := j + 1;
      if jsonb_typeof(ex) <> 'object' then raise exception 'LEAGUE_INVALID: exercise % of station % must be an object', j, i using errcode = 'check_violation'; end if;
      for k in select jsonb_object_keys(ex) loop
        if k not in ('name', 'standard', 'equipment', 'target') then raise exception 'LEAGUE_INVALID: unknown field % in exercise % of station %', k, j, i using errcode = 'check_violation'; end if;
      end loop;
      v_name := case when jsonb_typeof(ex -> 'name') = 'string' then trim(regexp_replace(ex ->> 'name', '[ \t\n\v\f\r]+', ' ', 'g')) end;
      if v_name is null or length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]' or v_name ~ '[<>]' or v_name ~ '^[=+@-]' then
        raise exception 'LEAGUE_INVALID: exercise % of station %: the name must be 1 to 80 characters, without < > or control characters, and cannot start with = + - @', j, i using errcode = 'check_violation';
      end if;
      v_obj := jsonb_build_object('position', j, 'name', v_name);
      for f in 1 .. 3 loop
        k := v_fields[f];
        v_bad := false;
        v_txt := '';
        if ex ? k and jsonb_typeof(ex -> k) <> 'null' then
          if jsonb_typeof(ex -> k) <> 'string' then v_bad := true; else v_txt := trim(regexp_replace(ex ->> k, '[ \t\n\v\f\r]+', ' ', 'g')); end if;
        end if;
        if v_bad or length(v_txt) > v_lim[f] or v_txt ~ '[[:cntrl:]]' or v_txt ~ '[<>]' then
          raise exception 'LEAGUE_INVALID: exercise % of station %: the % may be up to % characters, without < > or control characters', j, i, k, v_lim[f] using errcode = 'check_violation';
        end if;
        v_obj := v_obj || jsonb_build_object(k, v_txt);
      end loop;
      v_exs := v_exs || jsonb_build_array(v_obj);
    end loop;
    v_stations := v_stations || jsonb_build_array(jsonb_build_object('position', i, 'name', v_sname, 'max_value', v_cap, 'exercises', v_exs));
  end loop;
  return jsonb_build_object('result_type', v_type, 'stations', v_stations);
end $$;

-- Validate one recorded value per station against a stored layout version and return their SUM. Messages and check order are mirrored by layout.ts (stationTotal).
create or replace function race_league_station_total(p_layout uuid, p_values jsonb)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare
  lay public.race_league_layouts; el jsonb; k text; n int; v_pos numeric; v numeric; v_cap numeric; v_total numeric := 0; v_seen int[] := '{}';
begin
  select * into lay from public.race_league_layouts where id = p_layout;
  if lay.id is null then raise exception 'LEAGUE_NOT_FOUND: layout' using errcode = 'no_data_found'; end if;
  n := lay.station_count;
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) <> n then
    raise exception 'LEAGUE_INVALID: this layout has % stations; send exactly one result for each', n using errcode = 'check_violation';
  end if;
  for el in select value from jsonb_array_elements(p_values) loop
    if jsonb_typeof(el) <> 'object' then raise exception 'LEAGUE_INVALID: each station result must be an object with a position and a value' using errcode = 'check_violation'; end if;
    for k in select jsonb_object_keys(el) loop
      if k not in ('position', 'value') then raise exception 'LEAGUE_INVALID: unknown field % in a station result', k using errcode = 'check_violation'; end if;
    end loop;
    if jsonb_typeof(el -> 'position') is distinct from 'number' then raise exception 'LEAGUE_INVALID: each station result needs a position from 1 to %', n using errcode = 'check_violation'; end if;
    v_pos := (el ->> 'position')::numeric;
    if v_pos <> trunc(v_pos) or v_pos < 1 or v_pos > n then raise exception 'LEAGUE_INVALID: each station result needs a position from 1 to %', n using errcode = 'check_violation'; end if;
    if v_pos::int = any (v_seen) then raise exception 'LEAGUE_INVALID: station % appears more than once', v_pos::int using errcode = 'check_violation'; end if;
    v_seen := v_seen || v_pos::int;
    if jsonb_typeof(el -> 'value') is distinct from 'number' then raise exception 'LEAGUE_INVALID: station %: the result must be a number', v_pos::int using errcode = 'check_violation'; end if;
    v := (el ->> 'value')::numeric;
    if v < 0 or v > 1000000 then raise exception 'LEAGUE_INVALID: station %: the result must be from 0 to 1000000', v_pos::int using errcode = 'check_violation'; end if;
    if v <> round(v, 3) then raise exception 'LEAGUE_INVALID: station %: a result can have at most three decimals', v_pos::int using errcode = 'check_violation'; end if;
    if lay.result_type = 'REPS' and v <> trunc(v) then raise exception 'LEAGUE_INVALID: station %: repetitions must be a whole number', v_pos::int using errcode = 'check_violation'; end if;
    if lay.result_type = 'COMPLETION' and v not in (0, 1) then raise exception 'LEAGUE_INVALID: station %: a completion is 0 (not done) or 1 (done)', v_pos::int using errcode = 'check_violation'; end if;
    select s.max_value into v_cap from public.race_league_layout_stations s where s.layout_id = lay.id and s.pos = v_pos::int;
    if v_cap is not null and v > v_cap then
      raise exception 'LEAGUE_INVALID: station %: the result cannot exceed the station cap of %', v_pos::int, trim_scale(v_cap)::text using errcode = 'check_violation';
    end if;
    v_total := v_total + v;
  end loop;
  if v_total > 1000000 then raise exception 'LEAGUE_INVALID: the total cannot exceed 1000000' using errcode = 'check_violation'; end if;
  return v_total;
end $$;

-- the per-station results of one attempt as [{position, name, value}], in station order (internal; used by the breakdown)
create or replace function race_league_attempt_stations(p_attempt uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('position', s.pos, 'name', s.name, 'value', trim_scale(r.value)) order by s.pos), '[]'::jsonb)
    from public.race_league_station_results r join public.race_league_layout_stations s on s.id = r.layout_station_id
   where r.attempt_id = p_attempt;
$$;

-- ---------------------------------------------------------------------------
-- consistency as a database rule (checked at COMMIT, so a function may insert the attempt first and its station rows after)
-- ---------------------------------------------------------------------------
create or replace function race_league_check_station_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_rows int; v_layouts int; v_layout uuid; v_sum numeric; v_expected int;
begin
  if NEW.status = 'void' then return null; end if;   -- removing a result creates nothing that needs a breakdown
  if not exists (select 1 from public.race_league_layouts where challenge_id = NEW.challenge_id) then return null; end if;
  select count(*), count(distinct r.layout_id), (array_agg(r.layout_id))[1], coalesce(sum(r.value), 0) into v_rows, v_layouts, v_layout, v_sum
    from public.race_league_station_results r where r.attempt_id = NEW.id;
  if v_rows = 0 then
    raise exception 'LEAGUE_INVALID: this challenge has a station layout, so a result needs one value per station; use the station form' using errcode = 'check_violation';
  end if;
  select l.station_count into v_expected from public.race_league_layouts l where l.id = v_layout and l.challenge_id = NEW.challenge_id;
  if v_layouts <> 1 or v_expected is null or v_rows <> v_expected then
    raise exception 'LEAGUE_INVALID: the station results do not match one version of this challenge''s layout' using errcode = 'check_violation';
  end if;
  if v_sum <> NEW.value then
    raise exception 'LEAGUE_INVALID: the station results (total %) do not add up to the attempt value (%)', trim_scale(v_sum)::text, trim_scale(NEW.value)::text using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger trg_race_league_attempt_stations after insert or update on race_league_attempts deferrable initially deferred
  for each row execute function race_league_check_station_attempt();

-- a challenge's metric and unit cannot change once it has a layout (the layout's result type was validated against them)
create or replace function race_league_guard_layout_metric()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (NEW.metric_kind, NEW.unit) is distinct from (OLD.metric_kind, OLD.unit) and exists (select 1 from public.race_league_layouts where challenge_id = OLD.id) then
    raise exception 'LEAGUE_INVALID: the metric and unit are fixed once a challenge has a station layout' using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
create trigger trg_race_league_challenges_layout_metric before update on race_league_challenges for each row execute function race_league_guard_layout_metric();

-- ---------------------------------------------------------------------------
-- entry points
-- ---------------------------------------------------------------------------
-- Administrator: introduce a challenge's layout (version 1, before the first attempt) or substitute exercises (version n+1). A reason is mandatory and audited with what was replaced.
create or replace function race_league_set_layout(p_challenge uuid, p_layout jsonb, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  ch public.race_league_challenges; se public.race_league_seasons; cur public.race_league_layouts; v_reason text; v_norm jsonb; v_ver int; v_id uuid; v_sid uuid; st jsonb; ex jsonb; v_changed jsonb;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(ch.season_id);
  v_reason := public.race_league_reason(p_reason);
  select * into se from public.race_league_seasons where id = ch.season_id;
  if se.status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  if ch.status = 'closed' then raise exception 'LEAGUE_INVALID: a closed challenge can no longer change its layout' using errcode = 'check_violation'; end if;
  v_norm := public.race_league_validate_layout(p_layout, ch.metric_kind, ch.unit);
  perform pg_advisory_xact_lock(hashtextextended('race-league-layout:' || p_challenge::text, 0));   -- versions of one challenge are assigned one at a time
  select * into cur from public.race_league_layouts where challenge_id = p_challenge order by version desc limit 1;
  if cur.id is null then
    -- the FIRST layout must not race a concurrent attempt: block new attempts until this transaction ends, then look again
    lock table public.race_league_attempts in share mode;
    if exists (select 1 from public.race_league_attempts where challenge_id = p_challenge) then
      raise exception 'LEAGUE_INVALID: a layout can only be introduced before the first attempt' using errcode = 'check_violation';
    end if;
  else
    if v_norm = cur.spec then raise exception 'LEAGUE_INVALID: this is already the current layout' using errcode = 'check_violation'; end if;
    if exists (select 1 from public.race_league_attempts where challenge_id = p_challenge) and (
         v_norm ->> 'result_type' <> cur.spec ->> 'result_type'
         or jsonb_array_length(v_norm -> 'stations') <> jsonb_array_length(cur.spec -> 'stations')
         or (select jsonb_agg(s -> 'max_value' order by (s ->> 'position')::int) from jsonb_array_elements(v_norm -> 'stations') s)
            is distinct from (select jsonb_agg(s -> 'max_value' order by (s ->> 'position')::int) from jsonb_array_elements(cur.spec -> 'stations') s)) then
      raise exception 'LEAGUE_INVALID: after the first attempt the number of stations, the result type and the station caps are fixed; only the exercises can be substituted' using errcode = 'check_violation';
    end if;
  end if;
  v_ver := coalesce(cur.version, 0) + 1;
  insert into public.race_league_layouts (season_id, challenge_id, version, result_type, station_count, spec, reason, created_by)
  values (ch.season_id, ch.id, v_ver, v_norm ->> 'result_type', jsonb_array_length(v_norm -> 'stations'), v_norm, v_reason, auth.uid()) returning id into v_id;
  for st in select value from jsonb_array_elements(v_norm -> 'stations') loop
    insert into public.race_league_layout_stations (layout_id, pos, name, max_value)
    values (v_id, (st ->> 'position')::int, st ->> 'name', (st ->> 'max_value')::numeric) returning id into v_sid;
    for ex in select value from jsonb_array_elements(st -> 'exercises') loop
      insert into public.race_league_layout_exercises (layout_station_id, pos, name, standard, equipment, target)
      values (v_sid, (ex ->> 'position')::int, ex ->> 'name', ex ->> 'standard', ex ->> 'equipment', ex ->> 'target');
    end loop;
  end loop;
  if cur.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('station', n.pos, 'from', o.names, 'to', n.names) order by n.pos), '[]'::jsonb) into v_changed
      from (select (s ->> 'position')::int as pos, (select jsonb_agg(e ->> 'name' order by (e ->> 'position')::int) from jsonb_array_elements(s -> 'exercises') e) as names
              from jsonb_array_elements(v_norm -> 'stations') s) n
      left join (select (s ->> 'position')::int as pos, (select jsonb_agg(e ->> 'name' order by (e ->> 'position')::int) from jsonb_array_elements(s -> 'exercises') e) as names
                   from jsonb_array_elements(cur.spec -> 'stations') s) o on o.pos = n.pos
     where o.names is distinct from n.names;
  end if;
  perform public.race_league_audit_log(case when cur.id is null then 'league.layout.create' else 'league.layout.substitute' end, ch.season_id, 'race_league_layouts', v_id,
    case when cur.id is null then null else jsonb_build_object('version', cur.version) end,
    jsonb_build_object('version', v_ver, 'result_type', v_norm ->> 'result_type', 'stations', jsonb_array_length(v_norm -> 'stations')),
    jsonb_build_object('reason', v_reason, 'challenge_id', ch.id, 'replaced_exercises', coalesce(v_changed, '[]'::jsonb)));
  return jsonb_build_object('layoutId', v_id, 'version', v_ver);
end $$;

-- Staff (administrator / judge / reviewer): the latest layout of a challenge, or a given version, with the list of versions. null = the challenge has no layout.
create or replace function race_league_get_layout(p_challenge uuid, p_version int default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ch public.race_league_challenges; lay public.race_league_layouts;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  if auth.uid() is null or public.race_league_has_role(ch.season_id, array['LEAGUE_ADMIN', 'JUDGE', 'REVIEWER']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: league staff only' using errcode = 'insufficient_privilege';
  end if;
  select * into lay from public.race_league_layouts where challenge_id = p_challenge and (p_version is null or version = p_version) order by version desc limit 1;
  if lay.id is null then return null; end if;
  return jsonb_build_object('id', lay.id, 'challengeId', lay.challenge_id, 'version', lay.version, 'resultType', lay.result_type, 'reason', lay.reason, 'createdAt', lay.created_at,
    'stations', (select coalesce(jsonb_agg(jsonb_build_object('position', s.pos, 'name', s.name, 'maxValue', trim_scale(s.max_value),
                   'exercises', (select coalesce(jsonb_agg(jsonb_build_object('position', e.pos, 'name', e.name, 'standard', e.standard, 'equipment', e.equipment, 'target', e.target) order by e.pos), '[]'::jsonb)
                                   from public.race_league_layout_exercises e where e.layout_station_id = s.id)) order by s.pos), '[]'::jsonb)
                   from public.race_league_layout_stations s where s.layout_id = lay.id),
    'versions', (select jsonb_agg(jsonb_build_object('version', v.version, 'createdAt', v.created_at, 'reason', v.reason) order by v.version) from public.race_league_layouts v where v.challenge_id = p_challenge));
end $$;

-- Judge / administrator: record ONE attempt as one value per station. The total goes through the existing race_league_record_attempt (idempotent by request id, eligibility, limits, pending review);
-- the per-station rows are stored under the layout version the form was built from. A form built from an older version is refused, so a substitution is never silently mixed in.
create or replace function race_league_record_station_attempt(p_challenge uuid, p_participant uuid, p_layout_version int, p_values jsonb, p_attempted_at timestamptz, p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare ch public.race_league_challenges; lay public.race_league_layouts; ex public.race_league_attempts; v_total numeric; v_res jsonb; v_att uuid;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  if auth.uid() is null or public.race_league_has_role(ch.season_id, array['LEAGUE_ADMIN', 'JUDGE']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: only a league judge or administrator can record an attempt' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then raise exception 'LEAGUE_INVALID: every attempt needs its own request id' using errcode = 'check_violation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('race-league-attempt:' || p_challenge::text || ':' || p_participant::text, 0));   -- the same lock the base function takes
  select * into ex from public.race_league_attempts where challenge_id = p_challenge and participant_id = p_participant and client_request_id = p_client_request_id;
  if ex.id is not null then
    return public.race_league_attempt_json(ex) || jsonb_build_object('replay', true, 'layoutVersion', (select l.version from public.race_league_station_results r join public.race_league_layouts l on l.id = r.layout_id where r.attempt_id = ex.id limit 1));
  end if;
  select * into lay from public.race_league_layouts where challenge_id = p_challenge order by version desc limit 1;
  if lay.id is null then raise exception 'LEAGUE_INVALID: this challenge has no station layout; record a single result instead' using errcode = 'check_violation'; end if;
  if p_layout_version is distinct from lay.version then
    raise exception 'LEAGUE_LAYOUT_CHANGED: the exercises were changed (now version %); reload the form and record again', lay.version using errcode = 'check_violation';
  end if;
  v_total := public.race_league_station_total(lay.id, p_values);
  v_res := public.race_league_record_attempt(p_challenge, p_participant, v_total, p_attempted_at, p_client_request_id);
  v_att := (v_res ->> 'id')::uuid;
  insert into public.race_league_station_results (attempt_id, layout_id, layout_station_id, value)
  select v_att, lay.id, s.id, (e.value ->> 'value')::numeric
    from jsonb_array_elements(p_values) e(value) join public.race_league_layout_stations s on s.layout_id = lay.id and s.pos = (e.value ->> 'position')::int;
  perform public.race_league_audit_log('league.attempt.stations', ch.season_id, 'race_league_attempts', v_att, null,
    jsonb_build_object('layout_version', lay.version, 'total', trim_scale(v_total), 'values', p_values));
  return v_res || jsonb_build_object('layoutVersion', lay.version);
end $$;

-- Administrator: correct a station attempt station by station. It goes through the ONE existing correction path (void + approved replacement, permanent record, re-score, audit);
-- the replacement stays under the layout version of the attempt it replaces, and the new values are validated against THAT version.
create or replace function race_league_correct_station_attempt(p_attempt uuid, p_values jsonb, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.race_league_attempts; v_layout uuid; v_ver int; v_reason text; v_total numeric; v_out jsonb; v_new uuid;
begin
  select * into a from public.race_league_attempts where id = p_attempt;
  if a.id is null then raise exception 'LEAGUE_NOT_FOUND: attempt' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(a.season_id);
  v_reason := public.race_league_reason(p_reason);
  select r.layout_id, l.version into v_layout, v_ver from public.race_league_station_results r join public.race_league_layouts l on l.id = r.layout_id where r.attempt_id = a.id limit 1;
  if v_layout is null then raise exception 'LEAGUE_INVALID: this result has no station breakdown; correct it as a single result' using errcode = 'check_violation'; end if;
  v_total := public.race_league_station_total(v_layout, p_values);
  v_out := public.race_league_apply_correction(a.id, v_total, v_reason, null);
  v_new := (v_out ->> 'replacement')::uuid;
  insert into public.race_league_station_results (attempt_id, layout_id, layout_station_id, value)
  select v_new, v_layout, s.id, (e.value ->> 'value')::numeric
    from jsonb_array_elements(p_values) e(value) join public.race_league_layout_stations s on s.layout_id = v_layout and s.pos = (e.value ->> 'position')::int;
  perform public.race_league_audit_log('league.attempt.stations.correct', a.season_id, 'race_league_attempts', a.id, jsonb_build_object('value', trim_scale(a.value)),
    jsonb_build_object('layout_version', v_ver, 'total', trim_scale(v_total), 'values', p_values), jsonb_build_object('reason', v_reason, 'replacement', v_new));
  return v_out || jsonb_build_object('total', v_total, 'layoutVersion', v_ver);
end $$;

-- Staff: every attempt of a challenge with its per-station values and the layout version it was recorded under (latest 500).
create or replace function race_league_station_breakdown(p_challenge uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ch public.race_league_challenges;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  if auth.uid() is null or public.race_league_has_role(ch.season_id, array['LEAGUE_ADMIN', 'JUDGE', 'REVIEWER']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: league staff only' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('attemptId', x.id, 'participantId', x.participant_id, 'displayName', x.display_name, 'attemptNo', x.attempt_no, 'status', x.status,
                    'value', x.value, 'layoutVersion', x.version, 'stations', public.race_league_attempt_stations(x.id)) order by x.attempted_at, x.attempt_no, x.id)
    from (select a.id, a.participant_id, p.display_name, a.attempt_no, a.status, trim_scale(a.value) as value, a.attempted_at,
                 (select l.version from public.race_league_station_results r join public.race_league_layouts l on l.id = r.layout_id where r.attempt_id = a.id limit 1) as version
            from public.race_league_attempts a join public.race_league_participants p on p.id = a.participant_id
           where a.challenge_id = p_challenge order by a.created_at desc limit 500) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- privileges: closed by default; only the five entry points are callable (a new function would otherwise be executable by PUBLIC)
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('race_league_layout_metric_ok', 'race_league_validate_layout', 'race_league_station_total', 'race_league_attempt_stations', 'race_league_check_station_attempt',
              'race_league_guard_layout_metric', 'race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt', 'race_league_correct_station_attempt',
              'race_league_station_breakdown') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt', 'race_league_correct_station_attempt', 'race_league_station_breakdown') loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
