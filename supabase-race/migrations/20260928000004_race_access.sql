-- THE NINTH race system — 4/5: access rules + database functions.
--
-- Contents:
--   A. Role/visibility helpers (event-scoped race roles, §17)
--   B. Timing functions (timing model §2 — pure arithmetic, server clock)
--   C. Guard triggers (config lock, heat lock, roster capacity, staff escalation)
--   D. Audit wiring into the EXISTING append-only race_audit_log
--   E. Grants (column-level) + RLS policies
--   F. Foundation RPCs (create event, status, lock heats, move athlete)
--
-- Authority model:
--   - Super Admin (race_profiles.is_super_admin) has full race access everywhere.
--   - Everyone else gets race authority ONLY from an active race_staff row
--     for that event (and that station, for JUDGE / STATION_SCREEN), and
--     only while their race profile is active (race_profiles.is_active).
--   - Creating an event needs a Super Admin or an account granted
--     can_create_events by a Super Admin; the creator becomes the event's Event Manager.
--   - Direct table writes by API clients are limited to explicit columns
--     (GRANT … (cols)) and further filtered by RLS. Every ledger write, every
--     status transition and every post-lock change goes through a
--     SECURITY DEFINER RPC that authorizes, validates, stamps server time and
--     audits.
--   - Guard triggers are SECURITY INVOKER so they see the caller's real
--     current_user: 'authenticated'/'anon' for a direct API write, the
--     function owner inside an authorized RPC. A client cannot forge this.

-- ===========================================================================
-- A. Helpers
-- ===========================================================================

-- race_is_super_admin() / race_can_create_events() / race_auth_active() live in the foundation
-- migration. All of them are strict (TRUE or FALSE, never NULL), and every guard below is
-- written `IS NOT TRUE`.

create or replace function race_has_role(p_event_id uuid, p_roles race_role[], p_station_id uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_auth_active()
    and exists (
      select 1 from public.race_staff s
      where s.event_id = p_event_id
        and s.profile_id = auth.uid()
        and s.active
        and s.role = any (p_roles)
        and (p_station_id is null or s.station_id = p_station_id)
    );
$$;

create or replace function race_is_manager(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_super_admin() or public.race_has_role(p_event_id, array['EVENT_MANAGER']::public.race_role[]);
$$;

-- Master Control + Event Manager (live control, results, reviews, corrections).
create or replace function race_is_control(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_super_admin()
    or public.race_has_role(p_event_id, array['EVENT_MANAGER', 'MASTER_CONTROL']::public.race_role[]);
$$;

-- Front-of-house: may see athlete identity/contact and check-ins.
create or replace function race_is_ops(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_super_admin()
    or public.race_has_role(p_event_id, array['EVENT_MANAGER', 'MASTER_CONTROL', 'RECEPTION']::public.race_role[]);
$$;

create or replace function race_is_event_staff(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_super_admin()
    or public.race_has_role(p_event_id, enum_range(null::public.race_role));
$$;

-- Published events (anything past DRAFT) are publicly readable config.
create or replace function race_event_visible(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.race_events e where e.id = p_event_id and e.status <> 'DRAFT')
    or public.race_is_event_staff(p_event_id)
    or public.race_can_create_events();
$$;

create or replace function race_results_public(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.race_events e
    where e.id = p_event_id and e.status in ('RESULTS_OFFICIAL', 'ARCHIVED')
  );
$$;

create or replace function race_event_accepts_judges(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.race_events e
    where e.id = p_event_id and e.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'HEATS_LOCKED')
  );
$$;

create or replace function race_is_self_registration(p_registration_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.race_registrations r
    join public.race_athletes a on a.id = r.athlete_id
    where r.id = p_registration_id and a.profile_id = auth.uid()
  );
$$;

create or replace function race_event_started(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.race_clock c where c.event_id = p_event_id and c.started_at is not null)
    or exists (
      select 1 from public.race_events e
      where e.id = p_event_id and e.status in ('LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'ARCHIVED')
    );
$$;

create or replace function race_heats_locked(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.race_events e where e.id = p_event_id and e.heats_locked_at is not null);
$$;

-- True for a direct API write; false inside a SECURITY DEFINER RPC (current_user = owner).
-- SECURITY INVOKER on purpose.
create or replace function race_caller_is_client()
returns boolean
language sql stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

-- Active roster size of a heat (excluding one registration), taking a row
-- lock on the heat so concurrent assignments can't both see "one seat left".
create or replace function race_heat_roster_count(p_heat_id uuid, p_exclude_registration_id uuid)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform 1 from public.race_heats where id = p_heat_id for update;
  select count(*) into v_count
  from public.race_registrations r
  where r.heat_id = p_heat_id
    and r.id is distinct from p_exclude_registration_id
    and r.status <> 'CANCELLED'
    and r.race_status <> 'WITHDRAWN';
  return v_count;
end;
$$;

-- ===========================================================================
-- B. Timing functions (§2). Milliseconds of RACE time throughout.
-- ===========================================================================

-- F-1: next heat starts G after the previous heat's LAST athlete START.
create or replace function race_next_heat_anchor_ms(
  p_prev_anchor_ms bigint, p_prev_slot_count int, p_interval_ms int, p_gap_ms int
)
returns bigint
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_prev_slot_count is null or p_prev_slot_count < 1 then
    raise exception 'RACE_TIMING: a heat needs at least one slot (got %)', p_prev_slot_count;
  end if;
  if p_gap_ms < p_interval_ms then
    raise exception 'RACE_HEAT_GAP_TOO_SHORT: heat gap % ms < start interval % ms', p_gap_ms, p_interval_ms;
  end if;
  return p_prev_anchor_ms + (p_prev_slot_count - 1)::bigint * p_interval_ms + p_gap_ms;
end;
$$;

-- §2.6: late-athlete slots that fit inside the heat gap without moving anyone
-- and without cutting any station changeover below one transition.
create or replace function race_overflow_capacity(p_interval_ms int, p_gap_ms int)
returns int
language sql immutable
set search_path = ''
as $$
  select greatest(floor(p_gap_ms::numeric / p_interval_ms)::int - 1, 0);
$$;

-- §2.4: station n window for an athlete whose slot starts at p_slot_start_ms.
-- scoring_end = end of the 30 s transition (technique/OCR window, F-3; also for S09).
create or replace function race_station_window(
  p_slot_start_ms bigint, p_station int,
  p_interval_ms int default 210000, p_work_ms int default 180000, p_transition_ms int default 30000
)
returns table (work_start_ms bigint, work_end_ms bigint, scoring_end_ms bigint)
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_station not between 1 and 9 then
    raise exception 'RACE_TIMING: station must be 1..9 (got %)', p_station;
  end if;
  work_start_ms := p_slot_start_ms + (p_station - 1)::bigint * p_interval_ms;
  work_end_ms := work_start_ms + p_work_ms;
  scoring_end_ms := work_end_ms + p_transition_ms;
  return next;
end;
$$;

-- Full planned schedule for a list of heat sizes (AUTO mode). Pure function —
-- the SQL twin of docs/race/scripts/timing-validation.mjs; the test suite checks the
-- two agree to the millisecond for the 50-athlete event.
create or replace function race_plan_schedule(
  p_heat_sizes int[],
  p_first_start_offset_ms int default 60000,
  p_interval_ms int default 210000,
  p_work_ms int default 180000,
  p_gap_ms int default 600000,
  p_bind_lead_ms int default 60000,
  p_announce_lead_ms int default 10000,
  p_station_count int default 9
)
returns table (
  athlete_no int, heat_number int, slot_index int,
  slot_start_ms bigint, bind_at_ms bigint, announce_at_ms bigint,
  s09_start_ms bigint, finish_ms bigint,
  heat_anchor_ms bigint, heat_last_start_ms bigint, next_heat_anchor_ms bigint
)
language plpgsql immutable
set search_path = ''
as $$
declare
  v_heats int := coalesce(array_length(p_heat_sizes, 1), 0);
  v_anchor bigint := p_first_start_offset_ms;
  v_next bigint;
  v_n int := 0;
  h int;
  k int;
begin
  if p_gap_ms < p_interval_ms then
    raise exception 'RACE_HEAT_GAP_TOO_SHORT: heat gap % ms < start interval % ms', p_gap_ms, p_interval_ms;
  end if;
  if (p_announce_lead_ms > 0 and p_announce_lead_ms <= p_bind_lead_ms and p_bind_lead_ms <= p_first_start_offset_ms) is not true then
    raise exception 'RACE_TIMING: require 0 < announce <= bind <= first start offset';
  end if;
  for h in 1..v_heats loop
    if p_heat_sizes[h] is null or p_heat_sizes[h] not between 1 and 9 then
      raise exception 'RACE_TIMING: heat % size must be 1..9 (got %)', h, p_heat_sizes[h];
    end if;
    v_next := case when h < v_heats
      then public.race_next_heat_anchor_ms(v_anchor, p_heat_sizes[h], p_interval_ms, p_gap_ms) end;
    for k in 0..p_heat_sizes[h] - 1 loop
      v_n := v_n + 1;
      athlete_no := v_n;
      heat_number := h;
      slot_index := k;
      slot_start_ms := v_anchor + k::bigint * p_interval_ms;
      bind_at_ms := slot_start_ms - p_bind_lead_ms;
      announce_at_ms := slot_start_ms - p_announce_lead_ms;
      s09_start_ms := slot_start_ms + (p_station_count - 1)::bigint * p_interval_ms;
      finish_ms := s09_start_ms + p_work_ms;
      heat_anchor_ms := v_anchor;
      heat_last_start_ms := v_anchor + (p_heat_sizes[h] - 1)::bigint * p_interval_ms;
      next_heat_anchor_ms := v_next;
      return next;
    end loop;
    v_anchor := v_next;
  end loop;
end;
$$;

-- §2.2 race time from clock state. Pure; valid for any p_at at or after the
-- clock's last state change (which is how the engine uses it: "now").
create or replace function race_ms_from_clock(
  p_started_at timestamptz, p_paused_at timestamptz, p_paused_total_ms bigint, p_at timestamptz
)
returns bigint
language sql immutable
set search_path = ''
as $$
  select case
    when p_started_at is null or p_at < p_started_at then null
    else floor(extract(epoch from (least(p_at, coalesce(p_paused_at, p_at)) - p_started_at)) * 1000)::bigint
         - coalesce(p_paused_total_ms, 0)
  end;
$$;

-- Official race time NOW for an event — the only clock the engine trusts.
create or replace function race_now_ms(p_event_id uuid)
returns bigint
language sql volatile security definer
set search_path = ''
as $$
  select public.race_ms_from_clock(c.started_at, c.paused_at, c.paused_total_ms, clock_timestamp())
  from public.race_clock c where c.event_id = p_event_id;
$$;

-- Clock-sync endpoint for every client (display only — see §10).
create or replace function race_server_time(p_event_id uuid)
returns table (server_time timestamptz, race_ms bigint, is_started boolean, is_paused boolean, clock_version bigint)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if public.race_event_visible(p_event_id) is not true then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  return query
    select v_now,
           public.race_ms_from_clock(c.started_at, c.paused_at, c.paused_total_ms, v_now),
           c.started_at is not null,
           c.paused_at is not null,
           c.version
    from public.race_clock c where c.event_id = p_event_id;
end;
$$;

-- Planned schedule for an event's current heat rosters (pre-START EVENT view).
create or replace function race_event_schedule(p_event_id uuid)
returns table (
  athlete_no int, heat_number int, slot_index int,
  slot_start_ms bigint, bind_at_ms bigint, announce_at_ms bigint,
  s09_start_ms bigint, finish_ms bigint,
  heat_anchor_ms bigint, heat_last_start_ms bigint, next_heat_anchor_ms bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.race_events;
  v_sizes int[];
begin
  if public.race_event_visible(p_event_id) is not true then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  select * into e from public.race_events where id = p_event_id;
  select array_agg(sz order by number) into v_sizes
  from (
    select h.number,
           coalesce(h.planned_slot_count,
                    (select count(*) from public.race_registrations r
                      where r.heat_id = h.id and r.status <> 'CANCELLED' and r.race_status <> 'WITHDRAWN'))::int as sz
    from public.race_heats h where h.event_id = p_event_id
  ) s
  where sz > 0;
  return query select * from public.race_plan_schedule(
    coalesce(v_sizes, '{}'), e.first_start_offset_ms, e.start_interval_ms, e.work_ms, e.heat_gap_ms,
    e.bind_lead_ms, e.announce_lead_ms, e.station_count);
end;
$$;

-- ===========================================================================
-- C. Guard triggers (SECURITY INVOKER — they must see the real caller)
-- ===========================================================================

create or replace function race_guard_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Timing model constants are frozen once the race clock starts (§2.1).
  if (NEW.work_ms, NEW.transition_ms, NEW.start_interval_ms, NEW.station_count, NEW.heat_size,
      NEW.heat_gap_ms, NEW.heat_start_mode, NEW.first_start_offset_ms, NEW.bind_lead_ms,
      NEW.announce_lead_ms, NEW.checkin_deadline_before_heat_ms)
     is distinct from
     (OLD.work_ms, OLD.transition_ms, OLD.start_interval_ms, OLD.station_count, OLD.heat_size,
      OLD.heat_gap_ms, OLD.heat_start_mode, OLD.first_start_offset_ms, OLD.bind_lead_ms,
      OLD.announce_lead_ms, OLD.checkin_deadline_before_heat_ms)
     and public.race_event_started(OLD.id) then
    raise exception 'RACE_CONFIG_LOCKED: timing configuration is frozen once the race has started'
      using errcode = 'check_violation';
  end if;
  -- Heat size is part of the locked roster.
  if NEW.heat_size is distinct from OLD.heat_size and OLD.heats_locked_at is not null
     and public.race_caller_is_client() then
    raise exception 'RACE_HEATS_LOCKED: heat size cannot change after heats are locked'
      using errcode = 'check_violation';
  end if;
  if NEW.timezone is distinct from OLD.timezone
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = NEW.timezone) then
    raise exception 'RACE_INVALID_TIMEZONE: %', NEW.timezone using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
create trigger trg_race_events_guard before update on race_events
  for each row execute function race_guard_event_update();

create or replace function race_guard_event_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.status <> 'DRAFT' then
    raise exception 'RACE_NO_DELETE: only DRAFT events can be deleted (archive instead)'
      using errcode = 'insufficient_privilege';
  end if;
  return OLD;
end;
$$;
create trigger trg_race_events_no_delete before delete on race_events
  for each row execute function race_guard_event_delete();

-- Categories / stations / rules are frozen once the race starts.
create or replace function race_guard_config_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid := coalesce(NEW.event_id, OLD.event_id);
begin
  if public.race_event_started(v_event) then
    raise exception 'RACE_CONFIG_LOCKED: % cannot change once the race has started', TG_TABLE_NAME
      using errcode = 'check_violation';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

-- Every rule edit bumps race_station_rules.version (audited by race_audit_row).
create or replace function race_bump_rule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (NEW.movement, NEW.equipment, NEW.rule, NEW.scoring_type, NEW.higher_is_better)
     is distinct from (OLD.movement, OLD.equipment, OLD.rule, OLD.scoring_type, OLD.higher_is_better) then
    NEW.version := OLD.version + 1;
  end if;
  return NEW;
end;
$$;
create trigger trg_race_categories_guard before insert or update or delete on race_categories
  for each row execute function race_guard_config_child();
create trigger trg_race_stations_guard before insert or update or delete on race_stations
  for each row execute function race_guard_config_child();
create trigger trg_race_station_rules_guard before insert or update or delete on race_station_rules
  for each row execute function race_guard_config_child();
create trigger trg_race_station_rules_version before update on race_station_rules
  for each row execute function race_bump_rule_version();

-- Heats: clients may shape heats only before lock and before start.
create or replace function race_guard_heat()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid := coalesce(NEW.event_id, OLD.event_id);
begin
  if public.race_caller_is_client() then
    if public.race_event_started(v_event) then
      raise exception 'RACE_EVENT_STARTED: heats cannot be edited once the race has started'
        using errcode = 'check_violation';
    end if;
    if public.race_heats_locked(v_event) then
      raise exception 'RACE_HEATS_LOCKED: heats are locked; use an authorized change with a reason'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(NEW, OLD);
end;
$$;
create trigger trg_race_heats_guard before insert or update or delete on race_heats
  for each row execute function race_guard_heat();

-- Registrations: heat lock, roster capacity, push-up style lock.
create or replace function race_guard_registration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_heat_size int;
begin
  if TG_OP = 'UPDATE' and NEW.heat_id is distinct from OLD.heat_id and public.race_caller_is_client()
     and (public.race_heats_locked(NEW.event_id) or public.race_event_started(NEW.event_id)) then
    raise exception 'RACE_HEATS_LOCKED: heat assignment is locked; use race_move_athlete_heat() with a reason'
      using errcode = 'check_violation';
  end if;

  if NEW.heat_id is not null
     and (TG_OP = 'INSERT' or NEW.heat_id is distinct from OLD.heat_id)
     and NEW.status <> 'CANCELLED' and NEW.race_status <> 'WITHDRAWN' then
    select heat_size into v_heat_size from public.race_events where id = NEW.event_id;
    if public.race_heat_roster_count(NEW.heat_id, NEW.id) >= v_heat_size then
      raise exception 'RACE_HEAT_FULL: heat already has % athletes', v_heat_size
        using errcode = 'check_violation';
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.pushup_style is distinct from OLD.pushup_style
     and OLD.pushup_style_locked_at is not null then
    raise exception 'RACE_PUSHUP_STYLE_LOCKED: push-up style is locked once Station 02 starts'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
create trigger trg_race_registrations_guard before insert or update on race_registrations
  for each row execute function race_guard_registration();

-- Race staff: server-stamped assignment; only super_admin may grant or
-- change EVENT_MANAGER (mirrors Role.canAssignRole for branch_manager).
create or replace function race_guard_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.race_caller_is_client() then
    if (NEW.role = 'EVENT_MANAGER' or (TG_OP = 'UPDATE' and OLD.role = 'EVENT_MANAGER'))
       and public.race_is_super_admin() is not true then
      raise exception 'RACE_FORBIDDEN: only a super admin can grant or change the EVENT_MANAGER race role'
        using errcode = 'insufficient_privilege';
    end if;
    if TG_OP = 'INSERT' then
      NEW.assigned_by := auth.uid();
      NEW.assigned_at := clock_timestamp();
    end if;
  end if;
  return NEW;
end;
$$;
create trigger trg_race_staff_guard before insert or update on race_staff
  for each row execute function race_guard_staff();

-- Judge applications: public insert is always SUBMITTED; review is server-stamped.
create or replace function race_guard_judge_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.status := 'SUBMITTED';
    NEW.reviewed_by := null;
    NEW.reviewed_at := null;
    NEW.created_at := clock_timestamp();
  elsif NEW.status is distinct from OLD.status then
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
create trigger trg_race_judge_applications_guard before insert or update on race_judge_applications
  for each row execute function race_guard_judge_application();

-- ===========================================================================
-- D. Audit → race_audit_log (append-only, via race_log_audit_event()).
-- Every entry carries metadata.event_id so event managers can read their
-- own event's trail (policy in section E).
-- ===========================================================================

create or replace function race_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_old jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_event uuid := case when TG_TABLE_NAME = 'race_events' then (v_row ->> 'id')::uuid
                       else (v_row ->> 'event_id')::uuid end;
  v_changed text[];
begin
  if TG_OP = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_changed is null then
      return null;  -- no-op update: nothing to audit
    end if;
  end if;

  perform public.race_log_audit_event(
    'race.' || substr(TG_TABLE_NAME, 6) || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new,
    jsonb_build_object('event_id', v_event, 'changed_fields', to_jsonb(v_changed))
  );
  return null;
end;
$$;

-- Configuration changes, heat changes, registration changes, race-role
-- (permission) changes, judge review decisions, devices.
create trigger trg_race_events_audit after insert or update or delete on race_events
  for each row execute function race_audit_row();
create trigger trg_race_categories_audit after update or delete on race_categories
  for each row execute function race_audit_row();
create trigger trg_race_stations_audit after update or delete on race_stations
  for each row execute function race_audit_row();
create trigger trg_race_station_rules_audit after update or delete on race_station_rules
  for each row execute function race_audit_row();
create trigger trg_race_heats_audit after insert or update or delete on race_heats
  for each row execute function race_audit_row();
create trigger trg_race_registrations_audit after insert or update on race_registrations
  for each row execute function race_audit_row();
create trigger trg_race_staff_audit after insert or update on race_staff
  for each row execute function race_audit_row();
create trigger trg_race_judge_applications_audit after update on race_judge_applications
  for each row execute function race_audit_row();
create trigger trg_race_devices_audit after insert or update on race_devices
  for each row execute function race_audit_row();

-- Explicit business-action audit helper for RPCs (race.<action>).
create or replace function race_audit(
  p_action text, p_event_id uuid, p_entity_type text, p_entity_id uuid,
  p_before jsonb default null, p_after jsonb default null, p_extra jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.race_log_audit_event(
    p_action, p_entity_type, p_entity_id, p_before, p_after,
    coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id)
  );
$$;
revoke execute on function race_audit(text, uuid, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- E. Grants + RLS policies
-- ===========================================================================

-- Public (anon) may read published configuration, the clock, and official results.
grant select on race_category_templates, race_station_templates, race_station_rule_templates,
  race_events, race_categories, race_stations, race_station_rules, race_heats, race_clock, race_rankings
  to anon, authenticated;

grant select on race_athletes, race_registrations, race_payments, race_payment_events, race_staff,
  race_judge_applications, race_devices, race_pauses, race_tie_draws, race_check_ins,
  race_start_slots, race_station_results, race_performance_events, race_action_reviews,
  race_ocr_records, race_result_corrections
  to authenticated;

-- Column-level write grants (anything not listed is RPC-only).
grant insert, update, delete on race_category_templates, race_station_templates, race_station_rule_templates
  to authenticated;  -- RLS: super_admin only
grant update (name, venue, event_date, timezone, heat_size, heat_gap_ms, heat_start_mode,
  first_start_offset_ms, bind_lead_ms, announce_lead_ms, checkin_deadline_before_heat_ms,
  planned_start_at, heats_lock_at, config)
  on race_events to authenticated;
grant update (name, min_age) on race_categories to authenticated;
grant update (name) on race_stations to authenticated;
grant update (movement, equipment, rule) on race_station_rules to authenticated;
grant insert (event_id, number, start_mode), update (number, start_mode), delete on race_heats to authenticated;
grant update (heat_id, pushup_style) on race_registrations to authenticated;
grant insert (event_id, profile_id, role, station_id), update (active, station_id) on race_staff to authenticated;
grant insert (event_id, full_name, phone, email, experience, preferred_stations)
  on race_judge_applications to anon, authenticated;
grant update (status, review_note) on race_judge_applications to authenticated;
grant insert (event_id, profile_id, kind, station_id, label), update (label, station_id, revoked_at)
  on race_devices to authenticated;
-- No write grants at all on: race_athletes, race_registrations (insert), race_payments,
-- race_payment_events, race_clock, race_pauses, race_tie_draws, race_check_ins,
-- race_start_slots, race_station_results, race_performance_events, race_action_reviews,
-- race_ocr_records, race_result_corrections, race_rankings.

-- Templates
create policy "race templates readable" on race_category_templates for select to anon, authenticated using (true);
create policy "race templates super admin writes" on race_category_templates for all to authenticated
  using (race_is_super_admin()) with check (race_is_super_admin());
create policy "race templates readable" on race_station_templates for select to anon, authenticated using (true);
create policy "race templates super admin writes" on race_station_templates for all to authenticated
  using (race_is_super_admin()) with check (race_is_super_admin());
create policy "race templates readable" on race_station_rule_templates for select to anon, authenticated using (true);
create policy "race templates super admin writes" on race_station_rule_templates for all to authenticated
  using (race_is_super_admin()) with check (race_is_super_admin());

-- Configuration
create policy "race events visible" on race_events for select to anon, authenticated
  using (race_event_visible(id));
create policy "race events managed" on race_events for update to authenticated
  using (race_is_manager(id)) with check (race_is_manager(id));

create policy "race categories visible" on race_categories for select to anon, authenticated
  using (race_event_visible(event_id));
create policy "race categories managed" on race_categories for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

create policy "race stations visible" on race_stations for select to anon, authenticated
  using (race_event_visible(event_id));
create policy "race stations managed" on race_stations for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

create policy "race station rules visible" on race_station_rules for select to anon, authenticated
  using (race_event_visible(event_id));
create policy "race station rules managed" on race_station_rules for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

create policy "race heats visible" on race_heats for select to anon, authenticated
  using (race_event_visible(event_id));
create policy "race heats insert" on race_heats for insert to authenticated
  with check (race_is_manager(event_id));
create policy "race heats update" on race_heats for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));
create policy "race heats delete" on race_heats for delete to authenticated
  using (race_is_manager(event_id));

-- People
create policy "race athletes visible" on race_athletes for select to authenticated
  using (
    profile_id = auth.uid()
    or race_is_super_admin()
    or exists (select 1 from race_registrations r where r.athlete_id = race_athletes.id and race_is_ops(r.event_id))
  );

create policy "race registrations visible" on race_registrations for select to authenticated
  using (race_is_event_staff(event_id) or race_is_self_registration(id));
create policy "race registrations managed" on race_registrations for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

create policy "race payments visible" on race_payments for select to authenticated
  using (race_is_ops(event_id) or race_is_self_registration(registration_id));

create policy "race payment events visible" on race_payment_events for select to authenticated
  using (race_is_super_admin() or exists (
    select 1 from race_payments p where p.id = race_payment_events.payment_id and race_is_manager(p.event_id)));

create policy "race staff visible" on race_staff for select to authenticated
  using (race_is_control(event_id) or profile_id = auth.uid());
create policy "race staff insert" on race_staff for insert to authenticated
  with check (race_is_manager(event_id) and (role <> 'EVENT_MANAGER' or race_is_super_admin()));
create policy "race staff update" on race_staff for update to authenticated
  using (race_is_manager(event_id))
  with check (race_is_manager(event_id) and (role <> 'EVENT_MANAGER' or race_is_super_admin()));

create policy "race judge applications submit" on race_judge_applications for insert to anon, authenticated
  with check (race_event_accepts_judges(event_id));
create policy "race judge applications visible" on race_judge_applications for select to authenticated
  using (race_is_manager(event_id));
create policy "race judge applications review" on race_judge_applications for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

create policy "race devices visible" on race_devices for select to authenticated
  using (race_is_control(event_id) or profile_id = auth.uid());
create policy "race devices insert" on race_devices for insert to authenticated
  with check (race_is_manager(event_id));
create policy "race devices update" on race_devices for update to authenticated
  using (race_is_manager(event_id)) with check (race_is_manager(event_id));

-- Race day (read-only to clients; all writes are engine RPCs)
create policy "race clock visible" on race_clock for select to anon, authenticated
  using (race_event_visible(event_id));
create policy "race pauses visible" on race_pauses for select to authenticated
  using (race_is_event_staff(event_id));
create policy "race tie draws visible" on race_tie_draws for select to authenticated
  using (race_is_ops(event_id));
create policy "race check-ins visible" on race_check_ins for select to authenticated
  using (race_is_ops(event_id));
create policy "race start slots visible" on race_start_slots for select to authenticated
  using (race_is_event_staff(event_id));

-- A judge / station screen sees ONLY its own station's results and actions.
create policy "race station results visible" on race_station_results for select to authenticated
  using (
    race_is_control(event_id)
    or race_has_role(event_id, array['JUDGE', 'STATION_SCREEN']::race_role[], station_id)
    or race_is_self_registration(registration_id)
  );
create policy "race performance events visible" on race_performance_events for select to authenticated
  using (race_is_control(event_id) or race_has_role(event_id, array['JUDGE']::race_role[], station_id));
create policy "race action reviews visible" on race_action_reviews for select to authenticated
  using (race_is_control(event_id));
create policy "race ocr records visible" on race_ocr_records for select to authenticated
  using (race_is_control(event_id) or race_has_role(event_id, array['JUDGE']::race_role[], station_id));
create policy "race result corrections visible" on race_result_corrections for select to authenticated
  using (race_is_control(event_id));
create policy "race rankings visible" on race_rankings for select to anon, authenticated
  using (
    race_is_control(event_id)
    or (is_official and race_results_public(event_id))
    or race_is_self_registration(registration_id)
  );

-- Event managers may read their own event's audit entries (Super Admin reads all: foundation).
-- Writes are impossible for every client (no insert/update/delete policy exists on race_audit_log).
create policy "race event managers read race audit entries" on race_audit_log for select to authenticated
  using (
    target_table like 'race\_%'
    and race_is_manager(nullif(metadata ->> 'event_id', '')::uuid)
  );

-- ===========================================================================
-- F. Foundation RPCs
-- ===========================================================================

create or replace function race_create_event(
  p_slug text,
  p_event_date date,
  p_name text default 'THE NINTH',
  p_timezone text default 'Africa/Cairo',
  p_planned_start_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event uuid;
  v_rules int;
begin
  if auth.uid() is null
     or public.race_can_create_events() is not true then
    raise exception 'RACE_FORBIDDEN: not allowed to create race events'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'RACE_INVALID_TIMEZONE: %', p_timezone using errcode = 'check_violation';
  end if;

  insert into public.race_events (slug, name, event_date, timezone, planned_start_at, created_by)
  values (p_slug, p_name, p_event_date, p_timezone, p_planned_start_at, v_uid)
  returning id into v_event;

  insert into public.race_clock (event_id) values (v_event);

  insert into public.race_categories (event_id, code, name, min_age, default_pushup_style, sort_order)
  select v_event, code, name, min_age, default_pushup_style, sort_order
  from public.race_category_templates;

  insert into public.race_stations (event_id, number, code, name, has_technique, requires_ocr)
  select v_event, number, code, name, has_technique, requires_ocr
  from public.race_station_templates;

  insert into public.race_station_rules (event_id, station_id, category_id, scoring_type, higher_is_better,
                                         movement, equipment, rule)
  select v_event, s.id, c.id, t.scoring_type, t.higher_is_better, t.movement, t.equipment, t.rule
  from public.race_station_rule_templates t
  join public.race_stations s on s.event_id = v_event and s.number = t.station_number
  join public.race_categories c on c.event_id = v_event and c.code = t.category_code;

  get diagnostics v_rules = row_count;
  if v_rules <> 27 or (select count(*) from public.race_stations where event_id = v_event) <> 9
     or (select count(*) from public.race_categories where event_id = v_event) <> 3 then
    raise exception 'RACE_SEED_INCOMPLETE: expected 9 stations x 3 categories = 27 rules, got %', v_rules;
  end if;

  if v_uid is not null then
    insert into public.race_staff (event_id, profile_id, role, assigned_by)
    values (v_event, v_uid, 'EVENT_MANAGER', v_uid);
  end if;

  return v_event;
end;
$$;

-- Administrative status transitions. LIVE / FINISHED / RESULTS_OFFICIAL are
-- reserved for the race engine (Phases 6 & 9); HEATS_LOCKED for race_lock_heats().
create or replace function race_set_event_status(p_event_id uuid, p_status race_event_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.race_event_status;
begin
  if public.race_is_manager(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  select status into v_old from public.race_events where id = p_event_id for update;
  if v_old is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if p_status in ('LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'HEATS_LOCKED') then
    raise exception 'RACE_STATUS_RESERVED: % is set by the race engine / race_lock_heats()', p_status
      using errcode = 'check_violation';
  end if;
  if not ((v_old = 'DRAFT' and p_status = 'REGISTRATION_OPEN')
       or (v_old = 'REGISTRATION_OPEN' and p_status = 'REGISTRATION_CLOSED')
       or (v_old = 'REGISTRATION_CLOSED' and p_status = 'REGISTRATION_OPEN')
       or (v_old in ('FINISHED', 'RESULTS_OFFICIAL') and p_status = 'ARCHIVED')) then
    raise exception 'RACE_INVALID_TRANSITION: % -> %', v_old, p_status using errcode = 'check_violation';
  end if;
  update public.race_events set status = p_status where id = p_event_id;
  perform public.race_audit('race.event.status', p_event_id, 'race_events', p_event_id,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status),
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function race_lock_heats(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.race_event_status;
  v_heats jsonb;
begin
  if public.race_is_manager(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  select status into v_status from public.race_events where id = p_event_id for update;
  if v_status not in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED') then
    raise exception 'RACE_INVALID_TRANSITION: cannot lock heats from %', v_status using errcode = 'check_violation';
  end if;
  select jsonb_agg(jsonb_build_object('heat', h.number, 'athletes',
           (select count(*) from public.race_registrations r
             where r.heat_id = h.id and r.status <> 'CANCELLED' and r.race_status <> 'WITHDRAWN'))
         order by h.number)
    into v_heats
  from public.race_heats h where h.event_id = p_event_id;
  if v_heats is null then
    raise exception 'RACE_NO_HEATS: create heats before locking' using errcode = 'check_violation';
  end if;

  update public.race_events
     set status = 'HEATS_LOCKED', heats_locked_at = clock_timestamp(), heats_locked_by = auth.uid()
   where id = p_event_id;
  update public.race_heats set status = 'LOCKED' where event_id = p_event_id;
  perform public.race_audit('race.heats.lock', p_event_id, 'race_events', p_event_id,
    null, jsonb_build_object('heats', v_heats));
end;
$$;

-- Authorized heat change. After lock a reason is mandatory and the change
-- is audited as race.heat.change_after_lock (§5 of the brief).
create or replace function race_move_athlete_heat(p_registration_id uuid, p_heat_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.race_registrations;
  v_locked boolean;
  v_from smallint;
  v_to smallint;
begin
  select * into r from public.race_registrations where id = p_registration_id for update;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if public.race_event_started(r.event_id) then
    raise exception 'RACE_EVENT_STARTED: heat moves after START EVENT are handled by the race engine'
      using errcode = 'check_violation';
  end if;
  select number into v_to from public.race_heats where id = p_heat_id and event_id = r.event_id;
  if v_to is null then
    raise exception 'RACE_NOT_FOUND: heat is not part of this event' using errcode = 'no_data_found';
  end if;
  v_locked := public.race_heats_locked(r.event_id);
  if v_locked and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED: heats are locked; a reason is required' using errcode = 'check_violation';
  end if;
  select number into v_from from public.race_heats where id = r.heat_id;

  update public.race_registrations set heat_id = p_heat_id where id = p_registration_id;

  perform public.race_audit(
    case when v_locked then 'race.heat.change_after_lock' else 'race.heat.change' end,
    r.event_id, 'race_registrations', p_registration_id,
    jsonb_build_object('heat_id', r.heat_id, 'heat', v_from),
    jsonb_build_object('heat_id', p_heat_id, 'heat', v_to),
    jsonb_build_object('reason', p_reason, 'race_number', r.race_number));
end;
$$;
