-- PROPOSED — NOT APPLIED. THE NINTH League (8-week cumulative-points season), additive and self-contained.
--
-- This file lives in supabase-race/proposed/league/, NOT in supabase/migrations/, on purpose: `supabase db push` and staging_setup.sh only ever see
-- supabase/migrations/. It is exercised ONLY against a throw-away local database by tests/harness (suite 32). To activate it, after explicit approval:
-- see docs/race/17-league.md ("Activation").
--
-- Isolation: every object is race_league_* (the repository's isolation checks require every object in public to be race_*); nothing references
-- any gym object; there is no cross-database foreign key. Members are linked by an OPTIONAL opaque external reference (text) only.
-- It does not touch, alter or call the race engine: no race_events / race_clock / race_station_* reference, no race timing, slots or scoring.
--
-- Security model: all six tables have RLS enabled and NO client privileges at all. Clients reach data only through the SECURITY DEFINER functions
-- below, each of which re-checks the caller (season staff role, or Super Admin). Public pages use the three race_league_public_* functions, which
-- return an explicit allow-list of fields for a PUBLISHED season only.
--
-- Business rules still PROVISIONAL (stored per season in `rules`, never hard-wired): points table, tie handling, eligibility timing, absence handling,
-- attempts per challenge and which attempt counts (per challenge). Corrections: allowed to the league admin, with a mandatory reason, until the season is
-- completed. Appeals: not modelled (undecided).

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table race_league_seasons (
  id uuid primary key default gen_random_uuid(),
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_slug) between 3 and 60),
  name text not null check (length(trim(name)) between 2 and 80),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'completed')),
  starts_on date not null,
  ends_on date not null,
  weeks smallint not null default 8 check (weeks = 8),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  published boolean not null default false,
  created_by uuid references race_profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint race_league_seasons_eight_weeks check (ends_on - starts_on = 55),
  constraint race_league_seasons_completed_at check ((status = 'completed') = (completed_at is not null))
);

create table race_league_challenges (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references race_league_seasons (id),
  week_number smallint not null check (week_number between 1 and 8),
  name text not null check (length(trim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 1000),
  instructions text not null default '' check (length(instructions) <= 2000),
  safety_notes text not null default '' check (length(safety_notes) <= 1000),
  metric_kind text not null check (metric_kind in ('TIME', 'REPS', 'DISTANCE', 'LOAD', 'NUMERIC')),
  unit text not null,
  direction text not null check (direction in ('LOWER_WINS', 'HIGHER_WINS')),
  max_attempts smallint not null default 1 check (max_attempts between 1 and 10),
  counting text not null default 'BEST' check (counting in ('BEST', 'LATEST', 'FIRST_APPROVED')),
  opens_at timestamptz,
  closes_at timestamptz,
  reference_url text check (reference_url is null or reference_url ~ '^https://[^[:space:]]+$'),
  requires_verification boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'open', 'closed')),
  created_at timestamptz not null default clock_timestamp(),
  unique (season_id, week_number),
  constraint race_league_challenges_metric check (
       (metric_kind = 'TIME' and unit in ('s', 'ms') and direction = 'LOWER_WINS')
    or (metric_kind = 'REPS' and unit = 'reps' and direction = 'HIGHER_WINS')
    or (metric_kind = 'DISTANCE' and unit in ('m', 'km') and direction = 'HIGHER_WINS')
    or (metric_kind = 'LOAD' and unit = 'kg' and direction = 'HIGHER_WINS')
    or (metric_kind = 'NUMERIC' and unit in ('count', 'points', 'kcal', 'watts', '%'))),
  constraint race_league_challenges_window check ((opens_at is null) = (closes_at is null) and (opens_at is null or closes_at > opens_at))
);

create table race_league_participants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references race_league_seasons (id),
  public_id text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),   -- opaque, random: the only id a public page may carry
  display_name text not null check (length(display_name) between 2 and 40 and display_name !~ '^[=+@-]' and display_name !~ '[<>]'),
  external_ref text check (external_ref is null or external_ref ~ '^[A-Za-z0-9._:/#-]{1,60}$'),   -- link to a gym member; PRIVATE, never returned publicly
  identity_key text not null,
  active boolean not null default true,
  eligible boolean not null default true,
  joined_on date not null default current_date,
  created_by uuid references race_profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (season_id, identity_key)
);

create table race_league_attempts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references race_league_seasons (id),
  challenge_id uuid not null references race_league_challenges (id),
  participant_id uuid not null references race_league_participants (id),
  value numeric(14, 3) not null check (value >= 0 and value <= 1000000),
  unit text not null,
  attempt_no smallint not null check (attempt_no between 1 and 10),
  attempted_at timestamptz not null,
  recorded_by uuid not null references race_profiles (id),
  reviewed_by uuid references race_profiles (id),
  reviewed_at timestamptz,
  status text not null check (status in ('pending', 'approved', 'rejected', 'void')),
  reason text,
  corrected_from uuid references race_league_attempts (id),
  client_request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (challenge_id, participant_id, client_request_id),
  constraint race_league_attempts_reject_reason check (status <> 'rejected' or length(trim(coalesce(reason, ''))) > 0)
);
create index idx_race_league_attempts_challenge on race_league_attempts (challenge_id, status);
create index idx_race_league_attempts_participant on race_league_attempts (participant_id);

create table race_league_points_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  season_id uuid not null references race_league_seasons (id),
  challenge_id uuid not null references race_league_challenges (id),
  participant_id uuid not null references race_league_participants (id),
  points_cents integer not null,
  rank integer check (rank is null or rank >= 1),
  reason text not null check (reason in ('AWARD', 'ABSENT', 'ADJUSTMENT')),
  created_by uuid references race_profiles (id),
  created_at timestamptz not null default clock_timestamp()
);
create index idx_race_league_ledger_season on race_league_points_ledger (season_id, participant_id);
create index idx_race_league_ledger_challenge on race_league_points_ledger (challenge_id, participant_id, seq);

create table race_league_staff (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references race_league_seasons (id),
  profile_id uuid not null references race_profiles (id),
  role text not null check (role in ('LEAGUE_ADMIN', 'JUDGE', 'REVIEWER')),
  active boolean not null default true,
  assigned_by uuid references race_profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (season_id, profile_id, role)
);

alter table race_league_seasons enable row level security;
alter table race_league_challenges enable row level security;
alter table race_league_participants enable row level security;
alter table race_league_attempts enable row level security;
alter table race_league_points_ledger enable row level security;
alter table race_league_staff enable row level security;
revoke all on race_league_seasons, race_league_challenges, race_league_participants, race_league_attempts, race_league_points_ledger, race_league_staff
  from public, anon, authenticated;
-- (no policies: a table without a policy returns nothing to any client role; every access goes through the functions below)

select race_make_append_only('race_league_points_ledger');
create trigger trg_race_league_seasons_no_delete before delete on race_league_seasons for each row execute function race_forbid_delete();
create trigger trg_race_league_challenges_no_delete before delete on race_league_challenges for each row execute function race_forbid_delete();
create trigger trg_race_league_participants_no_delete before delete on race_league_participants for each row execute function race_forbid_delete();
create trigger trg_race_league_attempts_no_delete before delete on race_league_attempts for each row execute function race_forbid_delete();

-- a completed season is final: nothing under it changes any more (and the season row itself never leaves 'completed')
create or replace function race_league_guard_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_season uuid; v_status text;
begin
  if TG_TABLE_NAME = 'race_league_seasons' then
    -- a completed season is final; the only thing that may still change is whether its final table is published
    if OLD.status = 'completed' and (to_jsonb(NEW) - 'published') is distinct from (to_jsonb(OLD) - 'published') then
      raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation';
    end if;
    return NEW;
  end if;
  v_season := coalesce(NEW.season_id, OLD.season_id);
  select status into v_status from public.race_league_seasons where id = v_season;
  if v_status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  return coalesce(NEW, OLD);
end $$;
revoke execute on function race_league_guard_completed() from public, anon, authenticated;
create trigger trg_race_league_seasons_final before update on race_league_seasons for each row execute function race_league_guard_completed();
create trigger trg_race_league_challenges_final before insert or update on race_league_challenges for each row execute function race_league_guard_completed();
create trigger trg_race_league_participants_final before insert or update on race_league_participants for each row execute function race_league_guard_completed();
create trigger trg_race_league_attempts_final before insert or update on race_league_attempts for each row execute function race_league_guard_completed();
create trigger trg_race_league_ledger_final before insert on race_league_points_ledger for each row execute function race_league_guard_completed();
create trigger trg_race_league_staff_final before insert or update on race_league_staff for each row execute function race_league_guard_completed();

-- ---------------------------------------------------------------------------
-- helpers (internal: no client execute)
-- ---------------------------------------------------------------------------
create or replace function race_league_default_rules()
returns jsonb language sql immutable set search_path = '' as $$
  -- DEVELOPMENT DEFAULT ONLY. The real points table is an undecided business rule.
  select jsonb_build_object(
    'points', jsonb_build_object('by_rank', jsonb_build_array(25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1), 'beyond', 1, 'participation', 1, 'absent', 0),
    'tie_policy', 'SHARE', 'absence_policy', 'ZERO', 'eligibility', 'AT_REGISTRATION')
$$;

create or replace function race_league_validate_rules(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare t jsonb; v numeric; prev numeric := null; el jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'LEAGUE_INVALID: the rules must be an object' using errcode = 'check_violation'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('points', 'tie_policy', 'absence_policy', 'eligibility') then raise exception 'LEAGUE_INVALID: unknown rule %', k using errcode = 'check_violation'; end if;
  end loop;
  t := p -> 'points';
  if t is null or jsonb_typeof(t) <> 'object' or jsonb_typeof(t -> 'by_rank') <> 'array' or jsonb_array_length(t -> 'by_rank') not between 1 and 100 then
    raise exception 'LEAGUE_INVALID: the points table needs 1 to 100 ranks' using errcode = 'check_violation';
  end if;
  for k in select jsonb_object_keys(t) loop
    if k not in ('by_rank', 'beyond', 'participation', 'absent') then raise exception 'LEAGUE_INVALID: unknown points field %', k using errcode = 'check_violation'; end if;
  end loop;
  for el in select * from jsonb_array_elements(t -> 'by_rank') loop
    if jsonb_typeof(el) <> 'number' then raise exception 'LEAGUE_INVALID: points must be numbers' using errcode = 'check_violation'; end if;
    v := (el #>> '{}')::numeric;
    if v < 0 or v > 10000 or v <> round(v, 2) then raise exception 'LEAGUE_INVALID: points must be 0 to 10000 with at most two decimals' using errcode = 'check_violation'; end if;
    if prev is not null and v > prev then raise exception 'LEAGUE_INVALID: a better rank can never earn fewer points than a worse one' using errcode = 'check_violation'; end if;
    prev := v;
  end loop;
  foreach k in array array['beyond', 'participation', 'absent'] loop
    if jsonb_typeof(t -> k) <> 'number' then raise exception 'LEAGUE_INVALID: % must be a number', k using errcode = 'check_violation'; end if;
    v := (t ->> k)::numeric;
    if v < 0 or v > 10000 or v <> round(v, 2) then raise exception 'LEAGUE_INVALID: % must be 0 to 10000 with at most two decimals', k using errcode = 'check_violation'; end if;
  end loop;
  if (p ->> 'tie_policy') is null or (p ->> 'tie_policy') not in ('SHARE', 'SPLIT') then raise exception 'LEAGUE_INVALID: unknown tie policy' using errcode = 'check_violation'; end if;
  if (p ->> 'absence_policy') is null or (p ->> 'absence_policy') not in ('ZERO', 'PARTICIPATION') then raise exception 'LEAGUE_INVALID: unknown absence policy' using errcode = 'check_violation'; end if;
  if (p ->> 'eligibility') is null or (p ->> 'eligibility') not in ('AT_REGISTRATION', 'ENTIRE_SEASON') then raise exception 'LEAGUE_INVALID: unknown eligibility policy' using errcode = 'check_violation'; end if;
  return p;
end $$;

create or replace function race_league_has_role(p_season uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.race_is_super_admin(), false)
      or exists (select 1 from public.race_league_staff s
                  where s.season_id = p_season and s.profile_id = auth.uid() and s.active and s.role = any (p_roles));
$$;
revoke execute on function race_league_has_role(uuid, text[]) from public, anon, authenticated;

create or replace function race_league_audit_log(p_action text, p_season uuid, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_extra jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  select public.race_log_audit_event(p_action, p_entity, p_entity_id, p_before, p_after, coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('season_id', p_season));
$$;
revoke execute on function race_league_audit_log(text, uuid, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function race_league_require_admin(p_season uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.race_league_has_role(p_season, array['LEAGUE_ADMIN']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: league administrators only' using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke execute on function race_league_require_admin(uuid) from public, anon, authenticated;

create or replace function race_league_reason(p_reason text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'LEAGUE_REASON_REQUIRED: a reason is required' using errcode = 'check_violation'; end if;
  return left(trim(p_reason), 300);
end $$;

-- points for place p (1-based), in cents: the table, then `beyond`, never below the participation floor
create or replace function race_league_place_cents(p_place int, p_rules jsonb)
returns int language sql immutable set search_path = '' as $$
  select greatest(
    round(case when p_place <= jsonb_array_length(p_rules -> 'points' -> 'by_rank')
               then ((p_rules -> 'points' -> 'by_rank' ->> (p_place - 1))::numeric)
               else (p_rules -> 'points' ->> 'beyond')::numeric end * 100)::int,
    round((p_rules -> 'points' ->> 'participation')::numeric * 100)::int);
$$;

-- the ONE counted attempt per eligible participant (approved attempts only)
create or replace function race_league_counted_attempts(p_challenge uuid)
returns table (participant_id uuid, attempt_id uuid, value numeric)
language sql stable security definer set search_path = '' as $$
  select distinct on (a.participant_id) a.participant_id, a.id, a.value
    from public.race_league_attempts a
    join public.race_league_challenges c on c.id = a.challenge_id
   where a.challenge_id = p_challenge and a.status = 'approved'
   order by a.participant_id,
            case when c.counting = 'BEST' and c.direction = 'LOWER_WINS' then a.value end asc,
            case when c.counting = 'BEST' and c.direction = 'HIGHER_WINS' then a.value end desc,
            case when c.counting = 'LATEST' then a.attempt_no end desc,
            case when c.counting = 'LATEST' then a.attempted_at end desc,
            a.attempt_no asc, a.attempted_at asc, a.id asc;
$$;
revoke execute on function race_league_counted_attempts(uuid) from public, anon, authenticated;

-- Award / reconcile points for ONE challenge, append-only and exactly-once: only the difference between the ledger and the target is written.
create or replace function race_league_apply_scores(p_challenge uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  ch public.race_league_challenges; se public.race_league_seasons; v_added int;
begin
  select * into ch from public.race_league_challenges where id = p_challenge for update;
  select * into se from public.race_league_seasons where id = ch.season_id;
  perform pg_advisory_xact_lock(hashtextextended('race-league-score:' || p_challenge::text, 0));
  with eligible as (
    select p.id from public.race_league_participants p
     where p.season_id = ch.season_id and p.eligible
       and (se.rules ->> 'eligibility' = 'AT_REGISTRATION' or p.joined_on <= se.starts_on)
       and (p.active or exists (select 1 from public.race_league_points_ledger l where l.challenge_id = ch.id and l.participant_id = p.id))
  ), counted as (
    select k.participant_id, k.value from public.race_league_counted_attempts(ch.id) k join eligible e on e.id = k.participant_id
  ), ranked as (
    select participant_id, value,
           rank() over (order by case when ch.direction = 'LOWER_WINS' then value end asc, case when ch.direction = 'HIGHER_WINS' then value end desc) as rnk,
           count(*) over (partition by value) as tie_size
      from counted
  ), awards as (
    select r.participant_id, r.rnk::int as rnk, 'AWARD'::text as reason,
           case when se.rules ->> 'tie_policy' = 'SHARE' or r.tie_size = 1 then public.race_league_place_cents(r.rnk::int, se.rules)
                else (select floor((sum(public.race_league_place_cents(g, se.rules)) * 2 + r.tie_size) / (2.0 * r.tie_size))::int
                        from generate_series(r.rnk::int, r.rnk::int + r.tie_size::int - 1) g) end as cents
      from ranked r
  ), absent as (
    select e.id as participant_id, null::int as rnk, 'ABSENT'::text as reason,
           round((case when se.rules ->> 'absence_policy' = 'PARTICIPATION' then (se.rules -> 'points' ->> 'participation')::numeric
                       else (se.rules -> 'points' ->> 'absent')::numeric end) * 100)::int as cents
      from eligible e where e.id not in (select participant_id from counted)
  ), target as (
    select * from awards union all select * from absent where cents <> 0
  ), have as (
    select l.participant_id, sum(l.points_cents)::int as net,
           (array_agg(l.rank order by l.seq desc))[1] as last_rank
      from public.race_league_points_ledger l where l.challenge_id = ch.id group by l.participant_id
  ), delta as (
    select coalesce(t.participant_id, h.participant_id) as participant_id,
           coalesce(t.cents, 0) - coalesce(h.net, 0) as d,
           t.rnk as new_rank,
           (h.participant_id is null) as first_line,
           coalesce(t.reason, 'ADJUSTMENT') as reason,
           (h.participant_id is not null and h.last_rank is distinct from t.rnk) as rank_changed,
           (t.participant_id is not null) as has_target
      from target t full join have h on h.participant_id = t.participant_id
  ), ins as (
    insert into public.race_league_points_ledger (season_id, challenge_id, participant_id, points_cents, rank, reason, created_by)
    select ch.season_id, ch.id, d.participant_id, d.d, d.new_rank, case when d.first_line then d.reason else 'ADJUSTMENT' end, auth.uid()
      from delta d
     where d.d <> 0 or d.rank_changed or (d.first_line and d.has_target)
    returning 1
  )
  select count(*)::int into v_added from ins;
  return v_added;
end $$;
revoke execute on function race_league_apply_scores(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- standings (the ledger is the ONLY source of truth)
-- ---------------------------------------------------------------------------
create or replace function race_league_totals(p_season uuid, p_max_week int)
returns table (participant_id uuid, total_cents bigint, completed int, firsts int)
language sql stable security definer set search_path = '' as $$
  with lines as (
    select l.participant_id, l.points_cents, c.week_number, l.challenge_id
      from public.race_league_points_ledger l join public.race_league_challenges c on c.id = l.challenge_id
     where l.season_id = p_season and c.week_number <= p_max_week
  ), latest as (
    select distinct on (l.challenge_id, l.participant_id) l.challenge_id, l.participant_id, l.rank
      from public.race_league_points_ledger l join public.race_league_challenges c on c.id = l.challenge_id
     where l.season_id = p_season and c.week_number <= p_max_week
     order by l.challenge_id, l.participant_id, l.seq desc
  )
  select p.id,
         coalesce((select sum(points_cents) from lines where lines.participant_id = p.id), 0)::bigint,
         (select count(*) from latest where latest.participant_id = p.id and latest.rank is not null)::int,
         (select count(*) from latest where latest.participant_id = p.id and latest.rank = 1)::int
    from public.race_league_participants p where p.season_id = p_season;
$$;
revoke execute on function race_league_totals(uuid, int) from public, anon, authenticated;

-- rows ordered (total desc, first places desc, name, public id); equal totals share a competition rank; ids are internal-only fields (`id`).
create or replace function race_league_standings_rows(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_through int; v_out jsonb;
begin
  select coalesce(max(week_number), 0) into v_through from public.race_league_challenges where season_id = p_season and status = 'closed';
  with cur as (
    select t.*, p.public_id, p.display_name,
           rank() over (order by t.total_cents desc) as rnk
      from public.race_league_totals(p_season, 8) t join public.race_league_participants p on p.id = t.participant_id
  ), prev as (
    select t.participant_id, rank() over (order by t.total_cents desc) as rnk
      from public.race_league_totals(p_season, greatest(v_through - 1, 0)) t
     where v_through > 1
  ), weekly as (
    select l.participant_id, c.week_number, sum(l.points_cents) as cents
      from public.race_league_points_ledger l join public.race_league_challenges c on c.id = l.challenge_id
     where l.season_id = p_season group by l.participant_id, c.week_number
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.participant_id, 'publicId', c.public_id, 'displayName', c.display_name, 'rank', c.rnk, 'totalPoints', c.total_cents / 100.0,
      'weeklyPoints', coalesce((select jsonb_object_agg(w.week_number::text, w.cents / 100.0) from weekly w where w.participant_id = c.participant_id), '{}'::jsonb),
      'challengesCompleted', c.completed, 'firstPlaces', c.firsts,
      'movement', (select pv.rnk - c.rnk from prev pv where pv.participant_id = c.participant_id),
      'gapToNext', (select min(o.total_cents) - c.total_cents from cur o where o.total_cents > c.total_cents) / 100.0
    ) order by c.total_cents desc, c.firsts desc, lower(c.display_name) collate "C", c.public_id), '[]'::jsonb)
    into v_out from cur c;
  return v_out;
end $$;
revoke execute on function race_league_standings_rows(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC reads (anon + authenticated): published seasons only, explicit allow-list, bounded size
-- ---------------------------------------------------------------------------
create or replace function race_league_public_season(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare se public.race_league_seasons; v_through int; v_week int; v_rows jsonb;
begin
  select * into se from public.race_league_seasons where public_slug = lower(coalesce(p_slug, '')) and published;
  if se.id is null then return jsonb_build_object('available', false); end if;
  select coalesce(max(week_number), 0) into v_through from public.race_league_challenges where season_id = se.id and status = 'closed';
  v_week := case when current_date between se.starts_on and se.ends_on then ((current_date - se.starts_on) / 7) + 1 end;
  -- standings rows with every internal field removed (the `id` key never leaves the database)
  select coalesce(jsonb_agg(r - 'id' - 'firstPlaces'), '[]'::jsonb) into v_rows
    from (select value as r from jsonb_array_elements(public.race_league_standings_rows(se.id)) limit 1000) x;
  return jsonb_build_object(
    'available', true,
    'season', jsonb_build_object('slug', se.public_slug, 'name', se.name, 'status', se.status, 'startsOn', se.starts_on, 'endsOn', se.ends_on,
                                 'totalWeeks', 8, 'throughWeek', v_through, 'currentWeek', v_week),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object('weekNumber', c.week_number, 'name', c.name, 'description', c.description,
                  'instructions', c.instructions, 'safetyNotes', c.safety_notes, 'metricKind', c.metric_kind, 'unit', c.unit, 'direction', c.direction,
                  'referenceUrl', c.reference_url, 'status', c.status) order by c.week_number)
                  from public.race_league_challenges c where c.season_id = se.id and c.status <> 'draft'), '[]'::jsonb),
    'standings', v_rows,
    'generatedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

create or replace function race_league_public_challenge_results(p_slug text, p_week int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare se public.race_league_seasons; ch public.race_league_challenges;
begin
  select * into se from public.race_league_seasons where public_slug = lower(coalesce(p_slug, '')) and published;
  if se.id is null then return jsonb_build_object('available', false); end if;
  select * into ch from public.race_league_challenges where season_id = se.id and week_number = p_week and status = 'closed';
  if ch.id is null then return jsonb_build_object('available', false); end if;
  return jsonb_build_object('available', true, 'weekNumber', ch.week_number, 'name', ch.name, 'unit', ch.unit, 'direction', ch.direction,
    'results', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rnk, 'publicId', x.public_id, 'displayName', x.display_name, 'value', x.value, 'points', x.cents / 100.0)
                                        order by x.rnk, lower(x.display_name) collate "C", x.public_id)
       from (select l.rank as rnk, p.public_id, p.display_name, k.value, (select sum(z.points_cents) from public.race_league_points_ledger z where z.challenge_id = ch.id and z.participant_id = p.id) as cents
               from (select distinct on (participant_id) participant_id, rank from public.race_league_points_ledger where challenge_id = ch.id order by participant_id, seq desc) l
               join public.race_league_participants p on p.id = l.participant_id
               left join public.race_league_counted_attempts(ch.id) k on k.participant_id = p.id
              where l.rank is not null limit 1000) x), '[]'::jsonb));
end $$;

create or replace function race_league_public_participant(p_slug text, p_public_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare se public.race_league_seasons; p public.race_league_participants; v_row jsonb;
begin
  select * into se from public.race_league_seasons where public_slug = lower(coalesce(p_slug, '')) and published;
  if se.id is null then return jsonb_build_object('available', false); end if;
  select * into p from public.race_league_participants where season_id = se.id and public_id = p_public_id;
  if p.id is null then return jsonb_build_object('available', false); end if;
  select r - 'id' - 'firstPlaces' into v_row from jsonb_array_elements(public.race_league_standings_rows(se.id)) r where r ->> 'publicId' = p.public_id;
  return jsonb_build_object('available', true, 'standing', v_row,
    'results', coalesce((select jsonb_agg(jsonb_build_object('weekNumber', c.week_number, 'challenge', c.name, 'unit', c.unit,
         'value', (select k.value from public.race_league_counted_attempts(c.id) k where k.participant_id = p.id),
         'rank', (select z.rank from public.race_league_points_ledger z where z.challenge_id = c.id and z.participant_id = p.id order by z.seq desc limit 1),
         'points', (select sum(z.points_cents) from public.race_league_points_ledger z where z.challenge_id = c.id and z.participant_id = p.id) / 100.0)
         order by c.week_number)
       from public.race_league_challenges c where c.season_id = se.id and c.status = 'closed'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- season administration
-- ---------------------------------------------------------------------------
create or replace function race_league_create_season(p_slug text, p_name text, p_starts_on date, p_ends_on date, p_rules jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_rules jsonb;
begin
  if auth.uid() is null or (public.race_can_create_events() is not true and public.race_is_super_admin() is not true) then
    raise exception 'LEAGUE_FORBIDDEN: not allowed to create a league season' using errcode = 'insufficient_privilege';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on - p_starts_on <> 55 then
    raise exception 'LEAGUE_INVALID: a season runs exactly 8 weeks (56 days, start and end included)' using errcode = 'check_violation';
  end if;
  v_rules := public.race_league_validate_rules(coalesce(p_rules, public.race_league_default_rules()));
  insert into public.race_league_seasons (public_slug, name, starts_on, ends_on, rules, created_by)
  values (lower(trim(p_slug)), trim(p_name), p_starts_on, p_ends_on, v_rules, auth.uid()) returning id into v_id;
  insert into public.race_league_staff (season_id, profile_id, role, assigned_by) values (v_id, auth.uid(), 'LEAGUE_ADMIN', auth.uid());
  perform public.race_league_audit_log('league.season.create', v_id, 'race_league_seasons', v_id, null, jsonb_build_object('slug', lower(trim(p_slug)), 'name', trim(p_name), 'rules', v_rules));
  return v_id;
exception when unique_violation then
  raise exception 'LEAGUE_DUPLICATE: that season address is already used' using errcode = 'unique_violation';
end $$;

create or replace function race_league_set_season_status(p_season uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare se public.race_league_seasons; ok boolean;
begin
  perform public.race_league_require_admin(p_season);
  select * into se from public.race_league_seasons where id = p_season for update;
  if se.id is null then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  ok := (se.status = 'draft' and p_status = 'scheduled') or (se.status = 'scheduled' and p_status in ('active', 'draft')) or (se.status = 'active' and p_status = 'completed');
  if not ok then raise exception 'LEAGUE_INVALID_TRANSITION: a season cannot go from % to %', se.status, p_status using errcode = 'check_violation'; end if;
  if p_status = 'completed' then
    if exists (select 1 from public.race_league_challenges where season_id = p_season and status in ('open')) then
      raise exception 'LEAGUE_INVALID: close the open challenge first' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.race_league_attempts where season_id = p_season and status = 'pending') then
      raise exception 'LEAGUE_INVALID: some attempts are still waiting for review' using errcode = 'check_violation';
    end if;
  end if;
  update public.race_league_seasons set status = p_status, completed_at = case when p_status = 'completed' then clock_timestamp() end where id = p_season;
  perform public.race_league_audit_log('league.season.status', p_season, 'race_league_seasons', p_season, jsonb_build_object('status', se.status), jsonb_build_object('status', p_status),
    jsonb_build_object('reason', p_reason));
end $$;

create or replace function race_league_set_published(p_season uuid, p_published boolean, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare se public.race_league_seasons;
begin
  perform public.race_league_require_admin(p_season);
  perform public.race_league_reason(p_reason);
  select * into se from public.race_league_seasons where id = p_season for update;
  if se.id is null then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  if p_published and se.status = 'draft' then raise exception 'LEAGUE_INVALID: schedule the season before publishing it' using errcode = 'check_violation'; end if;
  update public.race_league_seasons set published = p_published where id = p_season;
  perform public.race_league_audit_log('league.season.publish', p_season, 'race_league_seasons', p_season, jsonb_build_object('published', se.published), jsonb_build_object('published', p_published),
    jsonb_build_object('reason', trim(p_reason)));
end $$;

-- changing the points rules re-scores every CLOSED challenge by appending the difference (nothing is rewritten)
create or replace function race_league_update_rules(p_season uuid, p_rules jsonb, p_reason text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare se public.race_league_seasons; v_rules jsonb; ch record; v_lines int := 0;
begin
  perform public.race_league_require_admin(p_season);
  perform public.race_league_reason(p_reason);
  select * into se from public.race_league_seasons where id = p_season for update;
  if se.id is null then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  if se.status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  v_rules := public.race_league_validate_rules(p_rules);
  update public.race_league_seasons set rules = v_rules where id = p_season;
  for ch in select id from public.race_league_challenges where season_id = p_season and status = 'closed' order by week_number loop
    v_lines := v_lines + public.race_league_apply_scores(ch.id);
  end loop;
  perform public.race_league_audit_log('league.rules.update', p_season, 'race_league_seasons', p_season, jsonb_build_object('rules', se.rules), jsonb_build_object('rules', v_rules),
    jsonb_build_object('reason', trim(p_reason), 'ledger_lines', v_lines));
  return v_lines;
end $$;

create or replace function race_league_upsert_challenge(p_season uuid, p_week int, p_cfg jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare se public.race_league_seasons; ex public.race_league_challenges; v_id uuid; k text;
  v_kind text; v_unit text; v_dir text; v_max int; v_count text; v_open timestamptz; v_close timestamptz; v_url text;
begin
  perform public.race_league_require_admin(p_season);
  select * into se from public.race_league_seasons where id = p_season;
  if se.id is null then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  if se.status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  if p_week is null or p_week not between 1 and 8 then raise exception 'LEAGUE_INVALID: week must be 1 to 8' using errcode = 'check_violation'; end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then raise exception 'LEAGUE_INVALID: the challenge must be an object' using errcode = 'check_violation'; end if;
  for k in select jsonb_object_keys(p_cfg) loop
    if k not in ('name', 'description', 'instructions', 'safety_notes', 'metric_kind', 'unit', 'direction', 'max_attempts', 'counting', 'opens_at', 'closes_at', 'reference_url', 'requires_verification') then
      raise exception 'LEAGUE_INVALID: unknown field %', k using errcode = 'check_violation';     -- no mass assignment: status, season, ids are never taken from the client
    end if;
  end loop;
  select * into ex from public.race_league_challenges where season_id = p_season and week_number = p_week for update;
  if ex.id is not null and ex.status not in ('draft', 'published') then raise exception 'LEAGUE_INVALID: an open or closed challenge can no longer be edited' using errcode = 'check_violation'; end if;
  v_kind := coalesce(p_cfg ->> 'metric_kind', ex.metric_kind);
  v_unit := coalesce(p_cfg ->> 'unit', ex.unit);
  v_dir := coalesce(p_cfg ->> 'direction', ex.direction, case when v_kind = 'TIME' then 'LOWER_WINS' else 'HIGHER_WINS' end);
  v_max := coalesce((p_cfg ->> 'max_attempts')::int, ex.max_attempts, 1);
  v_count := coalesce(p_cfg ->> 'counting', ex.counting, 'BEST');
  v_open := case when p_cfg ? 'opens_at' then (p_cfg ->> 'opens_at')::timestamptz else ex.opens_at end;
  v_close := case when p_cfg ? 'closes_at' then (p_cfg ->> 'closes_at')::timestamptz else ex.closes_at end;
  v_url := case when p_cfg ? 'reference_url' then nullif(p_cfg ->> 'reference_url', '') else ex.reference_url end;
  if v_open is not null and (v_open < (se.starts_on + (p_week - 1) * 7)::timestamptz - interval '1 day' or v_close > (se.starts_on + (p_week - 1) * 7 + 6)::timestamptz + interval '2 days') then
    raise exception 'LEAGUE_INVALID: the participation window must fall within the challenge''s week' using errcode = 'check_violation';
  end if;
  if ex.id is null then
    insert into public.race_league_challenges (season_id, week_number, name, description, instructions, safety_notes, metric_kind, unit, direction, max_attempts, counting,
                                               opens_at, closes_at, reference_url, requires_verification)
    values (p_season, p_week, trim(coalesce(p_cfg ->> 'name', '')), coalesce(p_cfg ->> 'description', ''), coalesce(p_cfg ->> 'instructions', ''), coalesce(p_cfg ->> 'safety_notes', ''),
            v_kind, v_unit, v_dir, v_max, v_count, v_open, v_close, v_url, coalesce((p_cfg ->> 'requires_verification')::boolean, true))
    returning id into v_id;
  else
    update public.race_league_challenges set name = trim(coalesce(p_cfg ->> 'name', name)), description = coalesce(p_cfg ->> 'description', description),
           instructions = coalesce(p_cfg ->> 'instructions', instructions), safety_notes = coalesce(p_cfg ->> 'safety_notes', safety_notes),
           metric_kind = v_kind, unit = v_unit, direction = v_dir, max_attempts = v_max, counting = v_count, opens_at = v_open, closes_at = v_close, reference_url = v_url,
           requires_verification = coalesce((p_cfg ->> 'requires_verification')::boolean, requires_verification)
     where id = ex.id returning id into v_id;
  end if;
  perform public.race_league_audit_log(case when ex.id is null then 'league.challenge.create' else 'league.challenge.update' end, p_season, 'race_league_challenges', v_id,
    case when ex.id is null then null else to_jsonb(ex) end, (select to_jsonb(c) from public.race_league_challenges c where c.id = v_id));
  return v_id;
end $$;

create or replace function race_league_set_challenge_status(p_challenge uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare ch public.race_league_challenges; se public.race_league_seasons; v_lines int := 0;
begin
  select * into ch from public.race_league_challenges where id = p_challenge for update;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(ch.season_id);
  select * into se from public.race_league_seasons where id = ch.season_id;
  if se.status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  if not ((ch.status = 'draft' and p_status = 'published') or (ch.status = 'published' and p_status in ('open', 'draft')) or (ch.status = 'open' and p_status in ('closed', 'published'))) then
    raise exception 'LEAGUE_INVALID_TRANSITION: a challenge cannot go from % to %', ch.status, p_status using errcode = 'check_violation';
  end if;
  if p_status in ('published', 'open') and se.status = 'draft' then raise exception 'LEAGUE_INVALID: schedule the season first' using errcode = 'check_violation'; end if;
  if p_status = 'open' and se.status <> 'active' then raise exception 'LEAGUE_INVALID: the season must be active to open a challenge' using errcode = 'check_violation'; end if;
  if p_status = 'closed' and exists (select 1 from public.race_league_attempts where challenge_id = ch.id and status = 'pending') then
    raise exception 'LEAGUE_INVALID: some attempts are still waiting for review' using errcode = 'check_violation';
  end if;
  update public.race_league_challenges set status = p_status where id = ch.id;
  if p_status = 'closed' then v_lines := public.race_league_apply_scores(ch.id); end if;
  perform public.race_league_audit_log('league.challenge.status', ch.season_id, 'race_league_challenges', ch.id, jsonb_build_object('status', ch.status), jsonb_build_object('status', p_status),
    jsonb_build_object('ledger_lines', v_lines));
  return jsonb_build_object('status', p_status, 'ledgerLines', v_lines);
end $$;

-- ---------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------
create or replace function race_league_identity_key(p_name text, p_ref text)
returns text language sql immutable set search_path = '' as $$
  select case when p_ref is not null and p_ref <> '' then 'ref:' || lower(p_ref) else 'name:' || lower(trim(p_name)) end
$$;

create or replace function race_league_add_participant(p_season uuid, p_display_name text, p_external_ref text default null, p_eligible boolean default true)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_name text := regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'); v_ref text := nullif(trim(coalesce(p_external_ref, '')), ''); v_public text;
begin
  perform public.race_league_require_admin(p_season);
  if not exists (select 1 from public.race_league_seasons where id = p_season) then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  if length(v_name) not between 2 and 40 or v_name ~ '^[=+@-]' or v_name ~ '[<>]' then
    raise exception 'LEAGUE_INVALID: a display name must be 2-40 characters and cannot start with = + - @' using errcode = 'check_violation';
  end if;
  insert into public.race_league_participants (season_id, display_name, external_ref, identity_key, eligible, created_by)
  values (p_season, v_name, v_ref, public.race_league_identity_key(v_name, v_ref), coalesce(p_eligible, true), auth.uid()) returning public_id into v_public;
  perform public.race_league_audit_log('league.participant.add', p_season, 'race_league_participants', null, null, jsonb_build_object('display_name', v_name, 'eligible', coalesce(p_eligible, true)));
  return v_public;
exception when unique_violation then
  raise exception 'LEAGUE_DUPLICATE: already a participant in this season' using errcode = 'unique_violation';
end $$;

-- p_rows: [{"display_name":"Ahmed K.","external_ref":"M-100","eligible":true}, ...] — re-validated here; duplicates are reported, never merged
create or replace function race_league_import_participants(p_season uuid, p_rows jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; i int := 0; v_added int := 0; v_issues jsonb := '[]'::jsonb; v_name text; v_ref text; v_key text; v_elig boolean;
begin
  perform public.race_league_require_admin(p_season);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'LEAGUE_INVALID: send an array of at most 5000 rows' using errcode = 'check_violation'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      if jsonb_typeof(r) <> 'object' then raise exception 'LEAGUE_INVALID: row must be an object'; end if;
      v_name := regexp_replace(trim(coalesce(r ->> 'display_name', '')), '\s+', ' ', 'g');
      v_ref := nullif(trim(coalesce(r ->> 'external_ref', '')), '');
      v_elig := coalesce((r ->> 'eligible')::boolean, true);
      if length(v_name) not between 2 and 40 or v_name ~ '^[=+@-]' or v_name ~ '[<>]' then raise exception 'LEAGUE_INVALID: bad display name'; end if;
      if v_ref is not null and v_ref !~ '^[A-Za-z0-9._:/#-]{1,60}$' then raise exception 'LEAGUE_INVALID: bad member reference'; end if;
      v_key := public.race_league_identity_key(v_name, v_ref);
      insert into public.race_league_participants (season_id, display_name, external_ref, identity_key, eligible, created_by) values (p_season, v_name, v_ref, v_key, v_elig, auth.uid());
      v_added := v_added + 1;
    exception
      when unique_violation then v_issues := v_issues || jsonb_build_object('row', i, 'message', 'already a participant');
      when others then v_issues := v_issues || jsonb_build_object('row', i, 'message', regexp_replace(sqlerrm, '^LEAGUE_[A-Z_]+: ?', ''));
    end;
  end loop;
  perform public.race_league_audit_log('league.participant.import', p_season, 'race_league_seasons', p_season, null, jsonb_build_object('added', v_added, 'issues', jsonb_array_length(v_issues)));
  return jsonb_build_object('added', v_added, 'issues', v_issues);
end $$;

create or replace function race_league_set_participant(p_participant uuid, p_display_name text, p_active boolean, p_eligible boolean, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare p public.race_league_participants; v_name text; v_lines int := 0; ch record;
begin
  select * into p from public.race_league_participants where id = p_participant for update;
  if p.id is null then raise exception 'LEAGUE_NOT_FOUND: participant' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(p.season_id);
  perform public.race_league_reason(p_reason);
  v_name := coalesce(nullif(regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), ''), p.display_name);
  if length(v_name) not between 2 and 40 or v_name ~ '^[=+@-]' or v_name ~ '[<>]' then raise exception 'LEAGUE_INVALID: bad display name' using errcode = 'check_violation'; end if;
  update public.race_league_participants set display_name = v_name, active = coalesce(p_active, active), eligible = coalesce(p_eligible, eligible), identity_key = case when external_ref is null then 'name:' || lower(v_name) else identity_key end
   where id = p.id;
  -- losing eligibility removes the points (an append-only reversal); going inactive keeps every historical result
  if p_eligible is not null and p_eligible <> p.eligible then
    for ch in select id from public.race_league_challenges where season_id = p.season_id and status = 'closed' order by week_number loop v_lines := v_lines + public.race_league_apply_scores(ch.id); end loop;
  end if;
  perform public.race_league_audit_log('league.participant.update', p.season_id, 'race_league_participants', p.id, jsonb_build_object('display_name', p.display_name, 'active', p.active, 'eligible', p.eligible),
    jsonb_build_object('display_name', v_name, 'active', coalesce(p_active, p.active), 'eligible', coalesce(p_eligible, p.eligible)), jsonb_build_object('reason', trim(p_reason), 'ledger_lines', v_lines));
exception when unique_violation then
  raise exception 'LEAGUE_DUPLICATE: another participant already has that name' using errcode = 'unique_violation';
end $$;

-- ---------------------------------------------------------------------------
-- attempts: record → review → (correct)
-- ---------------------------------------------------------------------------
create or replace function race_league_attempt_json(a public.race_league_attempts)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'challengeId', a.challenge_id, 'participantId', a.participant_id, 'value', a.value, 'unit', a.unit, 'attemptNo', a.attempt_no,
    'attemptedAt', a.attempted_at, 'status', a.status, 'reason', a.reason, 'recordedBy', a.recorded_by, 'reviewedBy', a.reviewed_by, 'correctedFrom', a.corrected_from)
$$;

create or replace function race_league_check_value(p_value numeric, p_kind text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or p_value < 0 or p_value > 1000000 then raise exception 'LEAGUE_INVALID: the result must be a number from 0 to 1000000' using errcode = 'check_violation'; end if;
  if p_value <> round(p_value, 3) then raise exception 'LEAGUE_INVALID: a result can have at most three decimals' using errcode = 'check_violation'; end if;
  if p_kind = 'REPS' and p_value <> trunc(p_value) then raise exception 'LEAGUE_INVALID: repetitions must be a whole number' using errcode = 'check_violation'; end if;
end $$;

create or replace function race_league_record_attempt(p_challenge uuid, p_participant uuid, p_value numeric, p_attempted_at timestamptz, p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare ch public.race_league_challenges; se public.race_league_seasons; pa public.race_league_participants; ex public.race_league_attempts; a public.race_league_attempts;
  v_live int; v_max_no int; v_when timestamptz := coalesce(p_attempted_at, clock_timestamp()); v_status text;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  if auth.uid() is null or public.race_league_has_role(ch.season_id, array['LEAGUE_ADMIN', 'JUDGE']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: only a league judge or administrator can record an attempt' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then raise exception 'LEAGUE_INVALID: every attempt needs its own request id' using errcode = 'check_violation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('race-league-attempt:' || p_challenge::text || ':' || p_participant::text, 0));
  -- a retry of the same request returns the original attempt: no duplicate, no second count
  select * into ex from public.race_league_attempts where challenge_id = p_challenge and participant_id = p_participant and client_request_id = p_client_request_id;
  if ex.id is not null then return public.race_league_attempt_json(ex) || jsonb_build_object('replay', true); end if;
  select * into se from public.race_league_seasons where id = ch.season_id;
  if se.status = 'completed' then raise exception 'LEAGUE_SEASON_LOCKED: a completed season is final' using errcode = 'check_violation'; end if;
  if se.status <> 'active' or ch.status <> 'open' or (ch.opens_at is not null and (clock_timestamp() < ch.opens_at or clock_timestamp() > ch.closes_at)) then
    raise exception 'LEAGUE_CHALLENGE_NOT_OPEN: this challenge is not open for attempts' using errcode = 'check_violation';
  end if;
  select * into pa from public.race_league_participants where id = p_participant and season_id = ch.season_id;
  if pa.id is null then raise exception 'LEAGUE_NOT_FOUND: participant' using errcode = 'no_data_found'; end if;
  if not pa.active or not pa.eligible or (se.rules ->> 'eligibility' = 'ENTIRE_SEASON' and pa.joined_on > se.starts_on) then
    raise exception 'LEAGUE_NOT_ELIGIBLE: this participant is not eligible' using errcode = 'check_violation';
  end if;
  perform public.race_league_check_value(p_value, ch.metric_kind);
  if v_when > clock_timestamp() + interval '5 minutes' then raise exception 'LEAGUE_INVALID: the attempt time is in the future' using errcode = 'check_violation'; end if;
  select count(*) filter (where status in ('pending', 'approved')), coalesce(max(attempt_no), 0) into v_live, v_max_no
    from public.race_league_attempts where challenge_id = p_challenge and participant_id = p_participant;
  if v_live >= ch.max_attempts or v_max_no >= 10 then raise exception 'LEAGUE_ATTEMPT_LIMIT: the attempt limit for this challenge has been reached' using errcode = 'check_violation'; end if;
  v_status := case when ch.requires_verification then 'pending' else 'approved' end;
  insert into public.race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, status, client_request_id)
  values (ch.season_id, ch.id, pa.id, p_value, ch.unit, v_max_no + 1, v_when, auth.uid(), v_status, p_client_request_id) returning * into a;
  perform public.race_league_audit_log('league.attempt.record', ch.season_id, 'race_league_attempts', a.id, null, public.race_league_attempt_json(a));
  return public.race_league_attempt_json(a) || jsonb_build_object('replay', false);
end $$;

create or replace function race_league_review_attempt(p_attempt uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.race_league_attempts; ch public.race_league_challenges; v_new text;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'LEAGUE_INVALID: decision must be approve or reject' using errcode = 'check_violation'; end if;
  v_new := case p_decision when 'approve' then 'approved' else 'rejected' end;
  select * into a from public.race_league_attempts where id = p_attempt for update;
  if a.id is null then raise exception 'LEAGUE_NOT_FOUND: attempt' using errcode = 'no_data_found'; end if;
  select * into ch from public.race_league_challenges where id = a.challenge_id;
  if auth.uid() is null or public.race_league_has_role(a.season_id, array['LEAGUE_ADMIN', 'REVIEWER']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: only a league reviewer or administrator can decide an attempt' using errcode = 'insufficient_privilege';
  end if;
  if a.recorded_by = auth.uid() then raise exception 'LEAGUE_SELF_REVIEW: you cannot approve or reject a result you recorded yourself' using errcode = 'check_violation'; end if;
  if a.status = v_new and a.reviewed_by = auth.uid() then return public.race_league_attempt_json(a) || jsonb_build_object('replay', true); end if;
  if a.status <> 'pending' then raise exception 'LEAGUE_INVALID: this attempt has already been decided' using errcode = 'check_violation'; end if;
  if ch.status <> 'open' then raise exception 'LEAGUE_CHALLENGE_NOT_OPEN: attempts can only be reviewed while the challenge is open (use a correction afterwards)' using errcode = 'check_violation'; end if;
  if p_decision = 'reject' then perform public.race_league_reason(p_reason); end if;
  update public.race_league_attempts set status = v_new, reviewed_by = auth.uid(), reviewed_at = clock_timestamp(), reason = case when p_decision = 'reject' then left(trim(p_reason), 300) else reason end
   where id = a.id returning * into a;
  perform public.race_league_audit_log('league.attempt.' || p_decision, a.season_id, 'race_league_attempts', a.id, jsonb_build_object('status', 'pending'), public.race_league_attempt_json(a));
  return public.race_league_attempt_json(a) || jsonb_build_object('replay', false);
end $$;

-- administrator correction: the old attempt is voided, a new approved one replaces it, a closed challenge is re-scored by appending the difference. Reason mandatory; audited.
create or replace function race_league_correct_attempt(p_attempt uuid, p_new_value numeric, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.race_league_attempts; ch public.race_league_challenges; n public.race_league_attempts; v_lines int := 0; v_reason text;
begin
  select * into a from public.race_league_attempts where id = p_attempt for update;
  if a.id is null then raise exception 'LEAGUE_NOT_FOUND: attempt' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(a.season_id);
  v_reason := public.race_league_reason(p_reason);
  if a.status not in ('pending', 'approved') then raise exception 'LEAGUE_INVALID: only a pending or approved attempt can be corrected' using errcode = 'check_violation'; end if;
  select * into ch from public.race_league_challenges where id = a.challenge_id for update;
  if ch.status in ('draft', 'published') then raise exception 'LEAGUE_CHALLENGE_NOT_OPEN: the challenge has not opened' using errcode = 'check_violation'; end if;
  if p_new_value is not null then perform public.race_league_check_value(p_new_value, ch.metric_kind); end if;
  update public.race_league_attempts set status = 'void', reason = v_reason where id = a.id;
  if p_new_value is not null then
    insert into public.race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, reviewed_by, reviewed_at, status, reason, corrected_from, client_request_id)
    values (a.season_id, a.challenge_id, a.participant_id, p_new_value, a.unit, a.attempt_no, a.attempted_at, auth.uid(), auth.uid(), clock_timestamp(), 'approved', v_reason, a.id, gen_random_uuid())
    returning * into n;
  end if;
  if ch.status = 'closed' then v_lines := public.race_league_apply_scores(ch.id); end if;
  perform public.race_league_audit_log('league.attempt.correct', a.season_id, 'race_league_attempts', a.id, public.race_league_attempt_json(a),
    case when n.id is null then jsonb_build_object('voided', true) else public.race_league_attempt_json(n) end, jsonb_build_object('reason', v_reason, 'ledger_lines', v_lines));
  return jsonb_build_object('voided', a.id, 'replacement', n.id, 'ledgerLines', v_lines);
end $$;

create or replace function race_league_recompute(p_challenge uuid)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare ch public.race_league_challenges; v_lines int;
begin
  select * into ch from public.race_league_challenges where id = p_challenge;
  if ch.id is null then raise exception 'LEAGUE_NOT_FOUND: challenge' using errcode = 'no_data_found'; end if;
  perform public.race_league_require_admin(ch.season_id);
  if ch.status <> 'closed' then raise exception 'LEAGUE_INVALID: only a closed challenge has points to reconcile' using errcode = 'check_violation'; end if;
  v_lines := public.race_league_apply_scores(ch.id);
  perform public.race_league_audit_log('league.challenge.recompute', ch.season_id, 'race_league_challenges', ch.id, null, null, jsonb_build_object('ledger_lines', v_lines));
  return v_lines;
end $$;

-- ---------------------------------------------------------------------------
-- staff + admin reads
-- ---------------------------------------------------------------------------
create or replace function race_league_set_staff(p_season uuid, p_profile uuid, p_role text, p_active boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_role not in ('LEAGUE_ADMIN', 'JUDGE', 'REVIEWER') then raise exception 'LEAGUE_INVALID: unknown role' using errcode = 'check_violation'; end if;
  if p_role = 'LEAGUE_ADMIN' then
    if public.race_is_super_admin() is not true then raise exception 'LEAGUE_FORBIDDEN: only a Super Admin can appoint a league administrator' using errcode = 'insufficient_privilege'; end if;
  else
    perform public.race_league_require_admin(p_season);
  end if;
  if not exists (select 1 from public.race_profiles where id = p_profile) then raise exception 'LEAGUE_NOT_FOUND: account' using errcode = 'no_data_found'; end if;
  insert into public.race_league_staff (season_id, profile_id, role, active, assigned_by) values (p_season, p_profile, p_role, coalesce(p_active, true), auth.uid())
  on conflict (season_id, profile_id, role) do update set active = coalesce(p_active, true), assigned_by = auth.uid();
  perform public.race_league_audit_log('league.staff.set', p_season, 'race_league_staff', null, null, jsonb_build_object('profile_id', p_profile, 'role', p_role, 'active', coalesce(p_active, true)));
end $$;

create or replace function race_league_my_seasons()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.public_slug, 'name', s.name, 'status', s.status, 'published', s.published, 'startsOn', s.starts_on, 'endsOn', s.ends_on,
    'roles', (select coalesce(jsonb_agg(distinct f.role), '[]'::jsonb) from public.race_league_staff f where f.season_id = s.id and f.profile_id = auth.uid() and f.active),
    'isSuperAdmin', public.race_is_super_admin()) order by s.starts_on desc), '[]'::jsonb)
    from public.race_league_seasons s
   where auth.uid() is not null and public.race_league_has_role(s.id, array['LEAGUE_ADMIN', 'JUDGE', 'REVIEWER']);
$$;

create or replace function race_league_admin_overview(p_season uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare se public.race_league_seasons; v_admin boolean;
begin
  if auth.uid() is null or public.race_league_has_role(p_season, array['LEAGUE_ADMIN', 'JUDGE', 'REVIEWER']) is not true then
    raise exception 'LEAGUE_FORBIDDEN: league staff only' using errcode = 'insufficient_privilege';
  end if;
  v_admin := public.race_league_has_role(p_season, array['LEAGUE_ADMIN']);
  select * into se from public.race_league_seasons where id = p_season;
  if se.id is null then raise exception 'LEAGUE_NOT_FOUND: season' using errcode = 'no_data_found'; end if;
  return jsonb_build_object(
    'season', jsonb_build_object('id', se.id, 'slug', se.public_slug, 'name', se.name, 'status', se.status, 'published', se.published, 'startsOn', se.starts_on, 'endsOn', se.ends_on, 'rules', se.rules),
    'isAdmin', v_admin,
    'challenges', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'weekNumber', c.week_number, 'name', c.name, 'description', c.description, 'instructions', c.instructions,
                    'safetyNotes', c.safety_notes, 'metricKind', c.metric_kind, 'unit', c.unit, 'direction', c.direction, 'maxAttempts', c.max_attempts, 'counting', c.counting,
                    'opensAt', c.opens_at, 'closesAt', c.closes_at, 'referenceUrl', c.reference_url, 'requiresVerification', c.requires_verification, 'status', c.status)
                    order by c.week_number) from public.race_league_challenges c where c.season_id = p_season), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'publicId', p.public_id, 'displayName', p.display_name, 'active', p.active, 'eligible', p.eligible,
                    'externalRef', case when v_admin then p.external_ref end) order by lower(p.display_name) collate "C", p.public_id)
                    from (select * from public.race_league_participants where season_id = p_season limit 5000) p), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(public.race_league_attempt_json(a) order by a.created_at desc)
                    from (select * from public.race_league_attempts where season_id = p_season order by created_at desc limit 500) a), '[]'::jsonb),
    'standings', public.race_league_standings_rows(p_season),
    'staff', case when v_admin then coalesce((select jsonb_agg(jsonb_build_object('profileId', f.profile_id, 'role', f.role, 'active', f.active)) from public.race_league_staff f where f.season_id = p_season), '[]'::jsonb) end);
end $$;

create or replace function race_league_audit(p_season uuid, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.race_league_require_admin(p_season);
  return coalesce((select jsonb_agg(jsonb_build_object('at', x.created_at, 'actor', x.actor_full_name, 'action', x.action, 'before', x.before, 'after', x.after, 'metadata', x.metadata) order by x.created_at desc)
    from (select * from public.race_audit_log where metadata ->> 'season_id' = p_season::text and action like 'league.%' order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- privileges: closed by default; only the listed entry points are callable
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('race_league_public_season', 'race_league_public_challenge_results', 'race_league_public_participant') loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('race_league_create_season', 'race_league_set_season_status', 'race_league_set_published', 'race_league_update_rules', 'race_league_upsert_challenge',
              'race_league_set_challenge_status', 'race_league_add_participant', 'race_league_import_participants', 'race_league_set_participant', 'race_league_record_attempt',
              'race_league_review_attempt', 'race_league_correct_attempt', 'race_league_recompute', 'race_league_set_staff', 'race_league_my_seasons', 'race_league_admin_overview',
              'race_league_audit') loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
