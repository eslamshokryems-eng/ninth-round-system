-- THE NINTH race system — Phase 6 (1/2): queue corrections after the fact.
--
-- Three authorized ways to change WHO is where in the start queue once check-in
-- has happened. All share one append-only ledger, race_check_in_corrections,
-- and none of them edits, overwrites or deletes the original check-in:
--
--   WRONG_ATHLETE  Master Control only. Reception checked in the wrong person.
--                  The corrected athlete inherits the ORIGINAL arrival time (they
--                  were physically there at that moment); the wrong athlete's
--                  check-in is marked superseded and they are back to REGISTERED.
--   DNS_OVERRIDE   Event Manager only. A DNS athlete arrives after their heat closed.
--                  Placed at the END of the queue (LATE) — but only if a genuinely
--                  free slot exists; otherwise nothing changes and the answer is
--                  NO SLOT AVAILABLE.
--   HEAT_MOVE      Event Manager only. An unslotted athlete is moved to a LATER heat,
--                  again only if that heat has a genuinely free slot.
--
-- "Genuinely free" (race_heat_free_capacity): open slots + overflow room that fits
-- before the next heat − athletes of that heat still entitled to a slot. So a
-- correction can never take a slot from anybody who holds or is still owed one,
-- never moves an assigned athlete, and never changes an existing start time.
--
-- Because check_ins/slots gain history, two uniqueness rules become "active only":
-- a superseded check-in and a SKIPPED slot no longer block the athlete's next one.

create type race_correction_type as enum ('WRONG_ATHLETE', 'DNS_OVERRIDE', 'HEAT_MOVE');

create table race_check_in_corrections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id),
  type race_correction_type not null,
  original_check_in_id uuid references race_check_ins (id),   -- the check-in that is superseded (null: athlete had none)
  old_registration_id uuid not null,                          -- the athlete who WAS checked in / is being placed
  new_registration_id uuid not null,                          -- the corrected athlete (same athlete for DNS_OVERRIDE / HEAT_MOVE)
  old_heat_id uuid,
  new_heat_id uuid,
  new_check_in_id uuid references race_check_ins (id) deferrable initially deferred,  -- the check-in that replaces it (deferred: the ledger row is written before the check-in it names, so the old one can be superseded first)
  reason text not null check (length(trim(reason)) > 0),
  corrected_by uuid not null references race_profiles (id),
  corrected_at timestamptz not null default clock_timestamp(),
  foreign key (old_registration_id, event_id) references race_registrations (id, event_id),
  foreign key (new_registration_id, event_id) references race_registrations (id, event_id),
  foreign key (old_heat_id, event_id) references race_heats (id, event_id),
  foreign key (new_heat_id, event_id) references race_heats (id, event_id),
  check ((type = 'WRONG_ATHLETE') = (old_registration_id <> new_registration_id)),
  check (type <> 'WRONG_ATHLETE' or (original_check_in_id is not null and new_check_in_id is not null))
);
create index idx_race_check_in_corrections_event on race_check_in_corrections (event_id, corrected_at);

create trigger trg_race_check_in_corrections_server_time before insert on race_check_in_corrections
  for each row execute function race_stamp_server_time('corrected_at');
select race_make_append_only('race_check_in_corrections');

alter table race_check_in_corrections enable row level security;
revoke all on race_check_in_corrections from anon, authenticated;
grant select on race_check_in_corrections to authenticated;
create policy "race check-in corrections visible" on race_check_in_corrections for select to authenticated
  using (race_is_control(event_id));

-- ---------------------------------------------------------------------------
-- race_check_ins: a check-in can be marked SUPERSEDED (once) — the only follow-up
-- write besides the tie-draw result. Ordering, queue and binder ignore superseded rows.
-- ---------------------------------------------------------------------------

alter table race_check_ins add column voided_by_correction_id uuid references race_check_in_corrections (id);
alter table race_check_ins drop constraint race_check_ins_registration_id_key;
create unique index uq_race_check_ins_active on race_check_ins (registration_id) where voided_by_correction_id is null;

create or replace function race_guard_check_in_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_APPEND_ONLY: race_check_ins is append-only (DELETE refused)' using errcode = 'insufficient_privilege';
  end if;

  -- (a) mark superseded, once, by a recorded correction of THIS check-in
  if OLD.voided_by_correction_id is null and NEW.voided_by_correction_id is not null
     and (NEW.id, NEW.event_id, NEW.registration_id, NEW.heat_id, NEW.checked_in_at, NEW.checked_in_by, NEW.kind, NEW.tie_draw_id, NEW.tie_draw_position)
         is not distinct from
         (OLD.id, OLD.event_id, OLD.registration_id, OLD.heat_id, OLD.checked_in_at, OLD.checked_in_by, OLD.kind, OLD.tie_draw_id, OLD.tie_draw_position) then
    if not exists (
      select 1 from public.race_check_in_corrections c
      where c.id = NEW.voided_by_correction_id and c.original_check_in_id = NEW.id and c.old_registration_id = NEW.registration_id
    ) then
      raise exception 'RACE_APPEND_ONLY: a check-in can only be superseded by a recorded correction of it' using errcode = 'insufficient_privilege';
    end if;
    return NEW;
  end if;

  -- (b) attach the tie-draw result, once, for a real participant
  if OLD.tie_draw_id is not null or NEW.tie_draw_id is null or NEW.tie_draw_position is null
     or NEW.voided_by_correction_id is distinct from OLD.voided_by_correction_id
     or (NEW.id, NEW.event_id, NEW.registration_id, NEW.heat_id, NEW.checked_in_at, NEW.checked_in_by, NEW.kind)
        is distinct from (OLD.id, OLD.event_id, OLD.registration_id, OLD.heat_id, OLD.checked_in_at, OLD.checked_in_by, OLD.kind) then
    raise exception 'RACE_APPEND_ONLY: race_check_ins is append-only (only a tie-draw result or a supersede marker may be attached, once)'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.race_tie_draws d
    where d.id = NEW.tie_draw_id and d.heat_id = NEW.heat_id
      and array_position(d.participants, NEW.registration_id) = NEW.tie_draw_position
      and d.tied_at = NEW.checked_in_at
  ) then
    raise exception 'RACE_APPEND_ONLY: tie-draw result does not match the recorded draw' using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end;
$$;

-- The check-in time is stamped by the server. The ONE exception is a Master's
-- WRONG_ATHLETE correction, which restores the original arrival time through a
-- transaction-local setting that only the function owner (never an API role) may use.
create or replace function race_stamp_check_in_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_backdate text := current_setting('race.backdated_check_in_at', true);
begin
  if v_backdate is not null and v_backdate <> '' and not public.race_caller_is_client() then
    NEW.checked_in_at := v_backdate::timestamptz;
  else
    NEW.checked_in_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
drop trigger trg_race_check_ins_server_time on race_check_ins;
create trigger trg_race_check_ins_server_time before insert on race_check_ins
  for each row execute function race_stamp_check_in_time();

-- ---------------------------------------------------------------------------
-- race_start_slots: a SKIPPED slot keeps its history without blocking the
-- athlete's next slot — only BOUND / STARTED slots are exclusive.
-- ---------------------------------------------------------------------------

alter table race_start_slots add column started_at timestamptz;  -- server time when the engine started the athlete
alter table race_start_slots drop constraint race_start_slots_registration_id_key;
create unique index uq_race_start_slots_active_registration on race_start_slots (registration_id) where status in ('BOUND', 'STARTED');

create or replace function race_is_master(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_super_admin() or public.race_has_role(p_event_id, array['MASTER_CONTROL']::public.race_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Phase 5 functions, re-created to (1) ignore superseded check-ins, (2) treat only
-- BOUND/STARTED slots as "holding a slot", (3) never let an overflow slot land
-- within one interval of the NEXT anchored heat. For every case that Phase 5
-- tested, behaviour is identical.
-- ---------------------------------------------------------------------------

create or replace function race_resolve_check_in_ties(p_heat_id uuid)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  g record;
  v_seed bytea;
  v_participants uuid[];
  v_draw uuid;
  n int := 0;
begin
  for g in
    select c.checked_in_at, c.event_id, array_agg(c.registration_id) as ids,
           bool_and(c.tie_draw_id is null) as undrawn, bool_or(c.tie_draw_id is null) as any_undrawn
    from public.race_check_ins c
    where c.heat_id = p_heat_id and c.voided_by_correction_id is null
    group by c.checked_in_at, c.event_id
    having count(*) >= 2 and bool_or(c.tie_draw_id is null)
  loop
    if not g.undrawn then
      raise exception 'RACE_TIE_GROUP_CHANGED: athletes joined an already-drawn tie group' using errcode = 'check_violation';
    end if;
    v_seed := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    select array_agg(x order by md5(encode(v_seed, 'hex') || x::text)) into v_participants from unnest(g.ids) x;
    insert into public.race_tie_draws (event_id, heat_id, tied_at, seed, participants)
    values (g.event_id, p_heat_id, g.checked_in_at, v_seed, v_participants)
    returning id into v_draw;
    update public.race_check_ins c
       set tie_draw_id = v_draw, tie_draw_position = array_position(v_participants, c.registration_id)
     where c.heat_id = p_heat_id and c.checked_in_at = g.checked_in_at and c.voided_by_correction_id is null;
    perform public.race_audit('race.checkin.random_draw', g.event_id, 'race_tie_draws', v_draw, null,
      jsonb_build_object('seed', encode(v_seed, 'hex'), 'participants_in_order', to_jsonb(v_participants),
                         'tied_at', g.checked_in_at, 'method', 'sort by md5(seed_hex || registration_id)'),
      jsonb_build_object('heat_id', p_heat_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function race_resolve_check_in_ties(uuid) from public, anon, authenticated;

create or replace function race_check_in(p_registration_id uuid)
returns table (
  check_in_id uuid, checked_in_at timestamptz, kind public.race_checkin_kind,
  queue_position int, heat_number smallint, already_checked_in boolean
)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.race_registrations;
  e public.race_events;
  c public.race_check_ins;
  v_heat_number smallint;
  v_anchor bigint;
  v_plan bigint;
  v_race_ms bigint;
  v_late boolean;
  v_kind public.race_checkin_kind;
  v_pos int;
  v_existing boolean := false;
begin
  select * into r from public.race_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_can_register_athletes(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if r.heat_id is null then
    raise exception 'RACE_NO_HEAT: this athlete has no heat yet' using errcode = 'check_violation';
  end if;

  -- Bring the race up to date FIRST: an athlete who arrives after their heat closed must find it closed even if no
  -- device was ticking, and their slot is decided at their arrival moment, not at some later tick.
  perform public.race_advance_core(r.event_id);
  perform pg_advisory_xact_lock(public.race_heat_lock_key(r.heat_id));
  select * into r from public.race_registrations where id = p_registration_id for update;
  select * into e from public.race_events where id = r.event_id;
  select h.number, h.anchor_race_ms into v_heat_number, v_anchor from public.race_heats h where h.id = r.heat_id;

  select * into c from public.race_check_ins x where x.registration_id = r.id and x.voided_by_correction_id is null;
  if c.id is not null then
    v_existing := true;
  else
    if r.status = 'CANCELLED' then
      raise exception 'RACE_REGISTRATION_CANCELLED' using errcode = 'check_violation';
    end if;
    if r.status <> 'CONFIRMED' then
      raise exception 'RACE_NOT_CONFIRMED: payment must be confirmed before check-in' using errcode = 'check_violation';
    end if;
    if e.status not in ('HEATS_LOCKED', 'LIVE') then
      raise exception 'RACE_CHECKIN_NOT_OPEN: check-in opens when heats are locked' using errcode = 'check_violation';
    end if;
    if r.race_status <> 'REGISTERED' then
      raise exception 'RACE_CHECKIN_NOT_ELIGIBLE: athlete is %', r.race_status using errcode = 'check_violation';
    end if;

    v_race_ms := public.race_now_ms(e.id);
    if v_race_ms is not null then
      v_late := v_anchor is not null and v_race_ms > v_anchor - e.checkin_deadline_before_heat_ms;
    else
      select ph.anchor_ms into v_plan from public.race_planned_heat_starts(e.id) ph where ph.heat_id = r.heat_id;
      v_late := e.planned_start_at is not null and v_plan is not null
                and clock_timestamp() > e.planned_start_at + make_interval(secs => (v_plan - e.checkin_deadline_before_heat_ms) / 1000.0);
    end if;
    v_kind := case when v_late then 'LATE'::public.race_checkin_kind else 'ON_TIME'::public.race_checkin_kind end;

    insert into public.race_check_ins (event_id, registration_id, heat_id, checked_in_by, kind)
    values (r.event_id, r.id, r.heat_id, auth.uid(), v_kind)
    returning * into c;
    update public.race_registrations
       set race_status = case when v_kind = 'LATE' then 'LATE_CHECK_IN'::public.race_status else 'CHECKED_IN'::public.race_status end
     where id = r.id;
    perform public.race_resolve_check_in_ties(r.heat_id);
    select * into c from public.race_check_ins x where x.id = c.id;
    perform public.race_audit(case when v_kind = 'LATE' then 'race.checkin.late' else 'race.checkin' end, r.event_id,
      'race_check_ins', c.id, null, jsonb_build_object('race_number', r.race_number, 'heat', v_heat_number,
        'kind', v_kind, 'checked_in_at', c.checked_in_at), jsonb_build_object('registration_id', r.id));
    perform public.race_advance_core(r.event_id);   -- bind / overflow decided at the arrival moment
  end if;

  select count(*)::int into v_pos from public.race_check_ins x
   where x.heat_id = r.heat_id and x.voided_by_correction_id is null
     and (x.checked_in_at, coalesce(x.tie_draw_position, 0), x.id) <= (c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id);

  return query select c.id, c.checked_in_at, c.kind, v_pos, v_heat_number, v_existing;
end;
$$;
grant execute on function race_check_in(uuid) to authenticated;
revoke execute on function race_check_in(uuid) from public, anon;

create or replace function race_queue(p_event_id uuid, p_heat_number int default null)
returns table (
  heat_number smallint, queue_position int, registration_id uuid, race_number text, full_name text,
  category_code public.race_category_code, race_status public.race_status,
  checked_in_at timestamptz, kind public.race_checkin_kind,
  slot_index smallint, slot_status public.race_slot_status, is_overflow boolean,
  projected_slot_index int, projected_start_ms bigint, projected_start_at timestamptz, no_slot_available boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.race_events;
  clk public.race_clock;
  v_cap int;
begin
  if public.race_is_ops(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  v_cap := public.race_overflow_capacity(e.start_interval_ms, e.heat_gap_ms);

  return query
  with ph as (select * from public.race_planned_heat_starts(p_event_id)),
  ci as (
    select c.*, (row_number() over (partition by c.heat_id order by c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id))::int as pos
    from public.race_check_ins c where c.event_id = p_event_id and c.voided_by_correction_id is null
  ),
  base as (
    select ci.*, h.number as hn, coalesce(h.anchor_race_ms, ph.anchor_ms) as anchor_ms,
           s.slot_index as sidx, s.status as sst, s.is_overflow as sov,
           case when s.id is null then (row_number() over (partition by ci.heat_id, (s.id is null) order by ci.pos))::int end as urank
    from ci
    join public.race_heats h on h.id = ci.heat_id
    left join ph on ph.heat_id = ci.heat_id
    left join lateral (
      select x.* from public.race_start_slots x
       where x.registration_id = ci.registration_id and x.status in ('BOUND', 'STARTED', 'SKIPPED')
       order by (x.status = 'SKIPPED'), x.slot_index desc limit 1
    ) s on true
  ),
  os as (
    select x.heat_id, x.slot_index, (row_number() over (partition by x.heat_id order by x.slot_index))::int as rn
    from public.race_start_slots x where x.event_id = p_event_id and x.status = 'OPEN'
  ),
  hs as (
    select x.heat_id, count(*)::int as total, (count(*) filter (where x.status = 'OPEN'))::int as open_cnt,
           (count(*) filter (where x.is_overflow))::int as ov_cnt, max(x.slot_index)::int as max_idx
    from public.race_start_slots x where x.event_id = p_event_id group by x.heat_id
  ),
  proj as (
    select b.*,
      case when b.sidx is not null then b.sidx::int
           when hs.total is null then b.urank - 1
           when b.urank <= hs.open_cnt then os.slot_index::int
           when (b.urank - hs.open_cnt) <= v_cap - hs.ov_cnt then hs.max_idx + (b.urank - hs.open_cnt)
           else null end as pidx
    from base b
    left join hs on hs.heat_id = b.heat_id
    left join os on os.heat_id = b.heat_id and os.rn = b.urank
  )
  select p.hn, p.pos, r.id, r.race_number, a.full_name, cat.code, r.race_status, p.checked_in_at, p.kind,
         p.sidx, p.sst, p.sov, p.pidx,
         case when p.pidx is not null and p.anchor_ms is not null then p.anchor_ms + p.pidx::bigint * e.start_interval_ms end,
         case when p.pidx is not null and p.anchor_ms is not null then
           case when clk.started_at is not null
                then clk.started_at + make_interval(secs => (p.anchor_ms + p.pidx::bigint * e.start_interval_ms + clk.paused_total_ms) / 1000.0)
                when e.planned_start_at is not null
                then e.planned_start_at + make_interval(secs => (p.anchor_ms + p.pidx::bigint * e.start_interval_ms) / 1000.0) end
         end,
         (p.sidx is null and p.pidx is null)
  from proj p
  join public.race_registrations r on r.id = p.registration_id
  join public.race_athletes a on a.id = r.athlete_id
  join public.race_categories cat on cat.id = r.category_id
  where p_heat_number is null or p.hn = p_heat_number
  order by p.hn, p.pos;
end;
$$;
grant execute on function race_queue(uuid, int) to authenticated;
revoke execute on function race_queue(uuid, int) from public, anon;

-- How many more athletes could this heat take right now WITHOUT displacing anybody:
--   open slots + overflow room (must fit at least one interval before the next anchored heat)
--   − athletes still entitled to a slot (not yet slotted, not cancelled/withdrawn/DNS).
-- 0 or less = no safe slot.
create or replace function race_heat_free_capacity(p_heat_id uuid, p_exclude_registration_id uuid default null)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  h public.race_heats;
  e public.race_events;
  v_now bigint;
  v_cap int;
  v_open int;
  v_ov int;
  v_max int;
  v_next_anchor bigint;
  v_first_start bigint;
  v_by_cap int;
  v_by_next int;
  v_room int;
  v_demand int;
begin
  select * into h from public.race_heats where id = p_heat_id;
  if h.id is null or h.anchor_race_ms is null then
    return 0;
  end if;
  select * into e from public.race_events where id = h.event_id;
  v_now := public.race_now_ms(e.id);
  if v_now is null then
    return 0;
  end if;
  v_cap := public.race_overflow_capacity(e.start_interval_ms, e.heat_gap_ms);

  -- the heat can take nobody after its last possible bind time
  if v_now > h.anchor_race_ms + (coalesce(h.planned_slot_count, 1) - 1 + v_cap)::bigint * e.start_interval_ms - e.bind_lead_ms then
    return 0;
  end if;

  select (count(*) filter (where x.status = 'OPEN'))::int, (count(*) filter (where x.is_overflow))::int, coalesce(max(x.slot_index), -1)::int
    into v_open, v_ov, v_max from public.race_start_slots x where x.heat_id = p_heat_id;
  select min(n.anchor_race_ms) into v_next_anchor from public.race_heats n
   where n.event_id = h.event_id and n.number > h.number and n.anchor_race_ms is not null;

  v_first_start := h.anchor_race_ms + (v_max + 1)::bigint * e.start_interval_ms;
  v_by_cap := greatest(v_cap - v_ov, 0);
  v_by_next := case when v_next_anchor is null then v_by_cap
                    else greatest(floor((v_next_anchor - e.start_interval_ms - v_first_start)::numeric / e.start_interval_ms)::int + 1, 0) end;
  v_room := case when v_first_start > v_now then least(v_by_cap, v_by_next) else 0 end;

  select count(*)::int into v_demand
    from public.race_registrations r
   where r.heat_id = p_heat_id and r.id is distinct from p_exclude_registration_id
     and r.status <> 'CANCELLED' and r.race_status in ('REGISTERED', 'CHECKED_IN', 'LATE_CHECK_IN')
     and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id and x.status in ('BOUND', 'STARTED'));

  return v_open + v_room - v_demand;
end;
$$;
revoke execute on function race_heat_free_capacity(uuid, uuid) from public, anon, authenticated;

create or replace function race_bind_due_slots(p_event_id uuid)
returns table (bound int, emptied int, overflow_created int, missed_start int)
language plpgsql volatile security definer
set search_path = ''
as $$
-- CATCH-UP semantics. This function brings slot assignment up to the current race time by REPLAYING every
-- decision at the race moment it belongs to (a slot binds at start − 60 s, whenever anybody happens to call
-- this). No device has to be online for the schedule to be right: every state-changing RPC catches up first,
-- so the set of checked-in athletes cannot change between the last catch-up and this one.
declare
  e public.race_events;
  v_now bigint;
  v_m bigint;          -- the race moment being decided
  v_cap int;
  h record;
  s public.race_start_slots;
  v_reg uuid;
  v_bound int := 0;
  v_empty int := 0;
  v_ov int := 0;
  v_miss int := 0;
  v_next_idx int;
  v_ov_cnt int;
  v_start bigint;
  v_t bigint;
  v_last_bind bigint;
  v_next_anchor bigint;
  v_progress boolean;
  m record;
begin
  select * into e from public.race_events where id = p_event_id;
  v_now := public.race_now_ms(p_event_id);
  if v_now is null then
    return query select 0, 0, 0, 0;
    return;
  end if;
  v_cap := public.race_overflow_capacity(e.start_interval_ms, e.heat_gap_ms);

  for h in select * from public.race_heats where event_id = p_event_id and anchor_race_ms is not null and status <> 'CANCELLED' order by number loop
    perform pg_advisory_xact_lock(public.race_heat_lock_key(h.id));
    select min(n.anchor_race_ms) into v_next_anchor from public.race_heats n
     where n.event_id = p_event_id and n.number > h.number and n.anchor_race_ms is not null and n.status <> 'CANCELLED';
    v_m := v_now;

    loop
      v_progress := false;

      -- 1. planned / overflow slots that are due, in index order, each decided at its own bind moment
      loop
        select * into s from public.race_start_slots
         where heat_id = h.id and status = 'OPEN' order by slot_index limit 1 for update;
        exit when not found;
        v_t := h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms - e.bind_lead_ms;
        exit when v_t > v_now;
        v_m := v_t;
        v_progress := true;
        select r.id into v_reg
          from public.race_check_ins c join public.race_registrations r on r.id = c.registration_id
         where c.heat_id = h.id and c.voided_by_correction_id is null
           and r.status = 'CONFIRMED' and r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')
           and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id and x.status in ('BOUND', 'STARTED'))
         order by c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id limit 1;
        if v_reg is null then
          update public.race_start_slots set status = 'EMPTY' where id = s.id;
          perform public.race_audit('race.slot.empty', p_event_id, 'race_start_slots', s.id, null,
            jsonb_build_object('heat', h.number, 'slot_index', s.slot_index, 'reason', 'nobody checked in and unbound at bind time', 'official_race_ms', v_t), '{}'::jsonb);
          v_empty := v_empty + 1;
        else
          update public.race_start_slots set status = 'BOUND', registration_id = v_reg, bound_at = public.race_wall_at(p_event_id, v_t) where id = s.id;
          perform public.race_audit('race.slot.bind', p_event_id, 'race_start_slots', s.id, null,
            jsonb_build_object('heat', h.number, 'slot_index', s.slot_index, 'registration_id', v_reg, 'official_race_ms', v_t), '{}'::jsonb);
          v_bound := v_bound + 1;
        end if;
      end loop;

      -- 2. late athletes: an overflow slot, only when no planned slot is still waiting, only if the slot still lies
      --    in the future AT THAT MOMENT and ends at least one interval before the next heat
      if exists (
           select 1 from public.race_check_ins c join public.race_registrations r on r.id = c.registration_id
            where c.heat_id = h.id and c.voided_by_correction_id is null
              and r.status = 'CONFIRMED' and r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')
              and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id and x.status in ('BOUND', 'STARTED')))
         and not exists (select 1 from public.race_start_slots where heat_id = h.id and status = 'OPEN') then
        select coalesce(max(x.slot_index), -1) + 1, count(*) filter (where x.is_overflow)
          into v_next_idx, v_ov_cnt from public.race_start_slots x where x.heat_id = h.id;
        v_start := h.anchor_race_ms + v_next_idx::bigint * e.start_interval_ms;
        if v_ov_cnt < v_cap and v_start > v_m and not (v_next_anchor is not null and v_start + e.start_interval_ms > v_next_anchor) then
          insert into public.race_start_slots (event_id, heat_id, slot_index, is_overflow)
          values (p_event_id, h.id, v_next_idx, true) returning * into s;
          perform public.race_audit('race.slot.overflow_created', p_event_id, 'race_start_slots', s.id, null,
            jsonb_build_object('heat', h.number, 'slot_index', v_next_idx, 'official_race_ms', v_m), '{}'::jsonb);
          v_ov := v_ov + 1;
          v_progress := true;   -- the new slot is bound (or waits) in the next round, at its own bind moment
        end if;
      end if;

      exit when not v_progress;
    end loop;

    -- 3. the heat can take nobody else after its last possible bind time
    v_last_bind := h.anchor_race_ms + (coalesce(h.planned_slot_count, 1) - 1 + v_cap)::bigint * e.start_interval_ms - e.bind_lead_ms;
    if v_now > v_last_bind then
      for m in
        update public.race_registrations set race_status = 'MISSED_START'
         where heat_id = h.id and race_status = 'REGISTERED' and status <> 'CANCELLED'
        returning id, race_number
      loop
        perform public.race_audit('race.registration.missed_start', p_event_id, 'race_registrations', m.id, null,
          jsonb_build_object('race_number', m.race_number, 'heat', h.number, 'reason', 'never checked in before the heat closed', 'official_race_ms', v_last_bind), '{}'::jsonb);
        v_miss := v_miss + 1;
      end loop;
    end if;
  end loop;

  return query select v_bound, v_empty, v_ov, v_miss;
end;
$$;
revoke execute on function race_bind_due_slots(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. CORRECT CHECK-IN (Master Control only)
-- ---------------------------------------------------------------------------

create or replace function race_correct_check_in(p_old_registration_id uuid, p_new_registration_id uuid, p_reason text)
returns table (correction_id uuid, new_check_in_id uuid, queue_position int, heat_number smallint, slot_rebound boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o public.race_registrations;
  n public.race_registrations;
  oc public.race_check_ins;
  v_slot public.race_start_slots;
  v_corr uuid := gen_random_uuid();
  v_new_ci uuid := gen_random_uuid();
  v_heat_number smallint;
  v_pos int;
  v_new_ci_row public.race_check_ins;
  v_rebound boolean := false;
begin
  select * into o from public.race_registrations where id = p_old_registration_id;
  select * into n from public.race_registrations where id = p_new_registration_id;
  if o.id is null or n.id is null or o.event_id <> n.event_id then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_master(o.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control can correct a check-in' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  if o.id = n.id then
    raise exception 'RACE_CORRECTION_SAME_ATHLETE: choose a different athlete' using errcode = 'check_violation';
  end if;
  if o.heat_id is null or n.heat_id is distinct from o.heat_id then
    raise exception 'RACE_CORRECTION_DIFFERENT_HEAT: both athletes must be in the same heat' using errcode = 'check_violation';
  end if;

  perform public.race_advance_core(o.event_id);   -- catch the race up before deciding anything
  perform pg_advisory_xact_lock(public.race_heat_lock_key(o.heat_id));
  select * into o from public.race_registrations where id = p_old_registration_id for update;
  select * into n from public.race_registrations where id = p_new_registration_id for update;

  select * into oc from public.race_check_ins x where x.registration_id = o.id and x.voided_by_correction_id is null;
  if oc.id is null then
    raise exception 'RACE_NOT_CHECKED_IN: the first athlete has no active check-in to correct' using errcode = 'check_violation';
  end if;
  if o.race_status not in ('CHECKED_IN', 'LATE_CHECK_IN') then
    raise exception 'RACE_ATHLETE_ALREADY_STARTED: a started athlete cannot be corrected — use SKIP' using errcode = 'check_violation';
  end if;
  if n.status <> 'CONFIRMED' or n.race_status <> 'REGISTERED' then
    raise exception 'RACE_CORRECTION_NOT_ELIGIBLE: the corrected athlete must be confirmed and not yet checked in' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_check_ins x where x.registration_id = n.id and x.voided_by_correction_id is null) then
    raise exception 'RACE_ALREADY_CHECKED_IN: the corrected athlete is already checked in' using errcode = 'check_violation';
  end if;

  -- the corrected athlete's check-in carries the ORIGINAL arrival time
  perform set_config('race.backdated_check_in_at', oc.checked_in_at::text, true);
  insert into public.race_check_ins (id, event_id, registration_id, heat_id, checked_in_by, kind)
  values (v_new_ci, o.event_id, n.id, o.heat_id, auth.uid(), oc.kind)
  returning * into v_new_ci_row;
  perform set_config('race.backdated_check_in_at', '', true);

  insert into public.race_check_in_corrections (id, event_id, type, original_check_in_id, old_registration_id, new_registration_id,
                                                old_heat_id, new_heat_id, new_check_in_id, reason, corrected_by)
  values (v_corr, o.event_id, 'WRONG_ATHLETE', oc.id, o.id, n.id, o.heat_id, o.heat_id, v_new_ci, p_reason, auth.uid());
  update public.race_check_ins set voided_by_correction_id = v_corr where id = oc.id;

  update public.race_registrations set race_status = 'REGISTERED' where id = o.id;
  update public.race_registrations
     set race_status = case when oc.kind = 'LATE' then 'LATE_CHECK_IN'::public.race_status else 'CHECKED_IN'::public.race_status end
   where id = n.id;

  -- a slot already bound to the wrong athlete goes to the right one (same slot, same time)
  select * into v_slot from public.race_start_slots where registration_id = o.id and status = 'BOUND' for update;
  if v_slot.id is not null then
    update public.race_start_slots set registration_id = n.id where id = v_slot.id;
    v_rebound := true;
  end if;

  select h.number into v_heat_number from public.race_heats h where h.id = o.heat_id;
  select count(*)::int into v_pos from public.race_check_ins x
   where x.heat_id = o.heat_id and x.voided_by_correction_id is null
     and (x.checked_in_at, coalesce(x.tie_draw_position, 0), x.id) <= (v_new_ci_row.checked_in_at, coalesce(v_new_ci_row.tie_draw_position, 0), v_new_ci_row.id);

  perform public.race_audit('race.checkin.correct', o.event_id, 'race_check_in_corrections', v_corr,
    jsonb_build_object('athlete', o.race_number, 'registration_id', o.id, 'check_in_id', oc.id, 'checked_in_at', oc.checked_in_at),
    jsonb_build_object('athlete', n.race_number, 'registration_id', n.id, 'check_in_id', v_new_ci, 'checked_in_at', v_new_ci_row.checked_in_at),
    jsonb_build_object('reason', p_reason, 'heat', v_heat_number, 'slot_rebound', v_rebound));

  return query select v_corr, v_new_ci, v_pos, v_heat_number, v_rebound;
end;
$$;
grant execute on function race_correct_check_in(uuid, uuid, text) to authenticated;
revoke execute on function race_correct_check_in(uuid, uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. OVERRIDE DNS (Event Manager only)
-- ---------------------------------------------------------------------------

create or replace function race_override_dns(p_registration_id uuid, p_reason text)
returns table (outcome text, queue_position int, heat_number smallint, slot_index smallint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.race_registrations;
  e public.race_events;
  oc public.race_check_ins;
  v_free int;
  v_corr uuid := gen_random_uuid();
  v_new_ci uuid := gen_random_uuid();
  v_heat_number smallint;
  v_pos int;
  v_ci public.race_check_ins;
  v_slot public.race_start_slots;
begin
  select * into r from public.race_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the Event Manager can override a DNS' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  select * into e from public.race_events where id = r.event_id;
  if e.status <> 'LIVE' then
    raise exception 'RACE_EVENT_NOT_LIVE: a DNS can only be overridden while the race is live' using errcode = 'check_violation';
  end if;
  if r.heat_id is null then
    raise exception 'RACE_NO_HEAT' using errcode = 'check_violation';
  end if;

  perform public.race_advance_core(r.event_id);   -- catch the race up before deciding anything
  perform pg_advisory_xact_lock(public.race_heat_lock_key(r.heat_id));
  select * into r from public.race_registrations where id = p_registration_id for update;
  if r.race_status <> 'MISSED_START' or r.status <> 'CONFIRMED' then
    raise exception 'RACE_NOT_DNS: only a confirmed DNS athlete can be overridden' using errcode = 'check_violation';
  end if;
  select h.number into v_heat_number from public.race_heats h where h.id = r.heat_id;

  v_free := public.race_heat_free_capacity(r.heat_id, r.id);
  if v_free < 1 then
    perform public.race_audit('race.dns_override.no_slot', r.event_id, 'race_registrations', r.id, null,
      jsonb_build_object('race_number', r.race_number, 'heat', v_heat_number, 'free_capacity', v_free),
      jsonb_build_object('reason', p_reason));
    return query select 'NO_SLOT_AVAILABLE'::text, null::int, v_heat_number, null::smallint;
    return;
  end if;

  select * into oc from public.race_check_ins x where x.registration_id = r.id and x.voided_by_correction_id is null;
  -- ledger first, then supersede the old check-in, then write the new one (one active check-in per athlete at every step)
  insert into public.race_check_in_corrections (id, event_id, type, original_check_in_id, old_registration_id, new_registration_id,
                                                old_heat_id, new_heat_id, new_check_in_id, reason, corrected_by)
  values (v_corr, r.event_id, 'DNS_OVERRIDE', oc.id, r.id, r.id, r.heat_id, r.heat_id, v_new_ci, p_reason, auth.uid());
  if oc.id is not null then
    update public.race_check_ins set voided_by_correction_id = v_corr where id = oc.id;
  end if;
  insert into public.race_check_ins (id, event_id, registration_id, heat_id, checked_in_by, kind)
  values (v_new_ci, r.event_id, r.id, r.heat_id, auth.uid(), 'LATE') returning * into v_ci;
  update public.race_registrations set race_status = 'LATE_CHECK_IN' where id = r.id;

  perform public.race_advance_core(r.event_id);
  select * into v_slot from public.race_start_slots where registration_id = r.id and status in ('BOUND', 'STARTED');
  select count(*)::int into v_pos from public.race_check_ins x
   where x.heat_id = r.heat_id and x.voided_by_correction_id is null
     and (x.checked_in_at, coalesce(x.tie_draw_position, 0), x.id) <= (v_ci.checked_in_at, coalesce(v_ci.tie_draw_position, 0), v_ci.id);

  perform public.race_audit('race.dns_override', r.event_id, 'race_check_in_corrections', v_corr,
    jsonb_build_object('race_number', r.race_number, 'race_status', 'MISSED_START'),
    jsonb_build_object('race_number', r.race_number, 'race_status', 'LATE_CHECK_IN', 'slot_index', v_slot.slot_index),
    jsonb_build_object('reason', p_reason, 'heat', v_heat_number, 'free_capacity_before', v_free));

  return query select case when v_slot.id is not null then 'ASSIGNED' else 'QUEUED' end, v_pos, v_heat_number, v_slot.slot_index;
end;
$$;
grant execute on function race_override_dns(uuid, text) to authenticated;
revoke execute on function race_override_dns(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. MOVE TO A LATER HEAT (Event Manager only)
-- ---------------------------------------------------------------------------

create or replace function race_move_athlete_later_heat(p_registration_id uuid, p_target_heat_number int, p_reason text)
returns table (heat_number smallint, queue_position int, slot_index smallint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.race_registrations;
  e public.race_events;
  cur public.race_heats;
  tgt public.race_heats;
  oc public.race_check_ins;
  v_free int;
  v_corr uuid := gen_random_uuid();
  v_new_ci uuid := gen_random_uuid();
  v_ci public.race_check_ins;
  v_pos int;
  v_slot public.race_start_slots;
begin
  select * into r from public.race_registrations where id = p_registration_id;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the Event Manager can move an athlete to a later heat' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  select * into e from public.race_events where id = r.event_id;
  if e.status <> 'LIVE' then
    raise exception 'RACE_EVENT_NOT_LIVE' using errcode = 'check_violation';
  end if;
  select * into cur from public.race_heats where id = r.heat_id;
  select * into tgt from public.race_heats where event_id = r.event_id and number = p_target_heat_number;
  if tgt.id is null then
    raise exception 'RACE_NOT_FOUND: no such heat' using errcode = 'no_data_found';
  end if;
  if cur.id is null or tgt.number <= cur.number then
    raise exception 'RACE_MOVE_NOT_LATER: an athlete can only move to a LATER heat' using errcode = 'check_violation';
  end if;

  perform public.race_advance_core(r.event_id);   -- catch the race up before deciding anything
  -- both heat locks, lower heat number first (same order the binder uses → no deadlock)
  perform pg_advisory_xact_lock(public.race_heat_lock_key(cur.id));
  perform pg_advisory_xact_lock(public.race_heat_lock_key(tgt.id));
  select * into r from public.race_registrations where id = p_registration_id for update;

  if r.status <> 'CONFIRMED' or r.race_status not in ('REGISTERED', 'CHECKED_IN', 'LATE_CHECK_IN', 'MISSED_START') then
    raise exception 'RACE_MOVE_NOT_ELIGIBLE: athlete is %', r.race_status using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_start_slots x where x.registration_id = r.id and x.status in ('BOUND', 'STARTED')) then
    raise exception 'RACE_ATHLETE_HAS_SLOT: an athlete who already holds a start slot is never moved' using errcode = 'check_violation';
  end if;
  if tgt.anchor_race_ms is null or tgt.status in ('FINISHED', 'CANCELLED') then
    raise exception 'RACE_NO_SLOT_AVAILABLE: that heat is not open for new athletes' using errcode = 'check_violation';
  end if;
  v_free := public.race_heat_free_capacity(tgt.id, r.id);
  if v_free < 1 then
    raise exception 'RACE_NO_SLOT_AVAILABLE: heat % has no free slot that would not displace someone', tgt.number using errcode = 'check_violation';
  end if;

  select * into oc from public.race_check_ins x where x.registration_id = r.id and x.voided_by_correction_id is null;
  update public.race_registrations set heat_id = tgt.id where id = r.id;   -- roster capacity (9) is enforced by trigger
  insert into public.race_check_in_corrections (id, event_id, type, original_check_in_id, old_registration_id, new_registration_id,
                                                old_heat_id, new_heat_id, new_check_in_id, reason, corrected_by)
  values (v_corr, r.event_id, 'HEAT_MOVE', oc.id, r.id, r.id, cur.id, tgt.id, v_new_ci, p_reason, auth.uid());
  if oc.id is not null then
    update public.race_check_ins set voided_by_correction_id = v_corr where id = oc.id;
  end if;
  insert into public.race_check_ins (id, event_id, registration_id, heat_id, checked_in_by, kind)
  values (v_new_ci, r.event_id, r.id, tgt.id, auth.uid(), 'LATE') returning * into v_ci;
  update public.race_registrations set race_status = 'LATE_CHECK_IN' where id = r.id;

  perform public.race_advance_core(r.event_id);
  select * into v_slot from public.race_start_slots where registration_id = r.id and status in ('BOUND', 'STARTED');
  select count(*)::int into v_pos from public.race_check_ins x
   where x.heat_id = tgt.id and x.voided_by_correction_id is null
     and (x.checked_in_at, coalesce(x.tie_draw_position, 0), x.id) <= (v_ci.checked_in_at, coalesce(v_ci.tie_draw_position, 0), v_ci.id);

  perform public.race_audit('race.heat.move_after_start', r.event_id, 'race_check_in_corrections', v_corr,
    jsonb_build_object('race_number', r.race_number, 'heat', cur.number),
    jsonb_build_object('race_number', r.race_number, 'heat', tgt.number, 'slot_index', v_slot.slot_index),
    jsonb_build_object('reason', p_reason, 'free_capacity_before', v_free));

  return query select tgt.number, v_pos, v_slot.slot_index;
end;
$$;
grant execute on function race_move_athlete_later_heat(uuid, int, text) to authenticated;
revoke execute on function race_move_athlete_later_heat(uuid, int, text) from public, anon;
