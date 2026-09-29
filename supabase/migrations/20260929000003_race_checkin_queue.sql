-- THE NINTH race system — Phase 5: check-in, start queue, start-slot engine.
--
-- Design: docs/race/01-schema-and-timing-model.md §3 (approved). Nothing here
-- starts the race clock — START EVENT / pause / resume / skip arrive in
-- Phase 6 and will call the internal functions below:
--   race_anchor_heats_from()  — freeze heat anchors + create slots (the "freeze" part of START EVENT)
--   race_bind_due_slots()     — idempotent binder (the core of race_advance)
--
-- Principles enforced here
--   * Check-in order is decided by the SERVER, per heat: the RPC takes only a
--     registration id (Reception cannot choose a position), locks the heat,
--     and the row's timestamp is stamped by the database under that lock, so
--     order of timestamps == order of commits.
--   * Exact timestamp ties → an audited random draw among ONLY the tied athletes,
--     reproducible from the recorded seed.
--   * Late athletes are never cancelled and never move anyone: they sort last by
--     construction and get the next available slot (an overflow slot inside the
--     heat gap when the planned slots are used up).
--   * Slot start times are never stored — always heat anchor + index × interval.

-- ---------------------------------------------------------------------------
-- race_check_ins: append-only, with ONE legal follow-up write — attaching the
-- tie-draw result (NULL → draw id/position, once, only for a participant).
-- ---------------------------------------------------------------------------

drop trigger trg_race_check_ins_append_only on race_check_ins;

create or replace function race_guard_check_in_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_APPEND_ONLY: race_check_ins is append-only (DELETE refused)' using errcode = 'insufficient_privilege';
  end if;
  if OLD.tie_draw_id is not null or NEW.tie_draw_id is null or NEW.tie_draw_position is null
     or (NEW.id, NEW.event_id, NEW.registration_id, NEW.heat_id, NEW.checked_in_at, NEW.checked_in_by, NEW.kind)
        is distinct from (OLD.id, OLD.event_id, OLD.registration_id, OLD.heat_id, OLD.checked_in_at, OLD.checked_in_by, OLD.kind) then
    raise exception 'RACE_APPEND_ONLY: race_check_ins is append-only (only a tie-draw result may be attached, once)'
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
create trigger trg_race_check_ins_guard before update or delete on race_check_ins
  for each row execute function race_guard_check_in_update();

-- A heat's anchor and slot count are frozen once set (timing model §2.3).
create or replace function race_guard_heat_anchor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (OLD.anchor_race_ms is not null and NEW.anchor_race_ms is distinct from OLD.anchor_race_ms)
     or (OLD.planned_slot_count is not null and NEW.planned_slot_count is distinct from OLD.planned_slot_count) then
    raise exception 'RACE_ANCHOR_FROZEN: a heat''s start anchor and slot count never change once set' using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
create trigger trg_race_heats_anchor_guard before update on race_heats
  for each row execute function race_guard_heat_anchor();

-- Same lock key for check-in and slot binding, so they never interleave inside one heat.
create or replace function race_heat_lock_key(p_heat_id uuid)
returns bigint
language sql immutable
set search_path = ''
as $$ select hashtextextended('race_heat:' || p_heat_id::text, 0) $$;

-- ---------------------------------------------------------------------------
-- Tie draw (internal). Groups of >= 2 check-ins in one heat with the exact same
-- server timestamp get ONE random draw among only those athletes. The order is
-- a pure function of the recorded seed: sort by md5(seed_hex || registration_id).
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
    where c.heat_id = p_heat_id
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
     where c.heat_id = p_heat_id and c.checked_in_at = g.checked_in_at;
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

-- ---------------------------------------------------------------------------
-- Check-in (Reception / Event Manager)
-- ---------------------------------------------------------------------------

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

  -- One check-in at a time per heat: order of timestamps == order of commits.
  perform pg_advisory_xact_lock(public.race_heat_lock_key(r.heat_id));
  select * into r from public.race_registrations where id = p_registration_id for update;
  select * into e from public.race_events where id = r.event_id;
  select h.number, h.anchor_race_ms into v_heat_number, v_anchor from public.race_heats h where h.id = r.heat_id;

  select * into c from public.race_check_ins x where x.registration_id = r.id;
  if c.id is not null then
    v_existing := true;  -- double-click / second desk: report the original check-in, change nothing
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

    -- Late = after the heat's check-in deadline (heat start − 15:00, configurable).
    v_race_ms := public.race_now_ms(e.id);
    if v_race_ms is not null then
      v_late := v_anchor is not null and v_race_ms > v_anchor - e.checkin_deadline_before_heat_ms;
    else
      select ph.anchor_ms into v_plan from public.race_planned_heat_starts(e.id) ph where ph.heat_id = r.heat_id;
      v_late := e.planned_start_at is not null and v_plan is not null
                and clock_timestamp() > e.planned_start_at + make_interval(secs => (v_plan - e.checkin_deadline_before_heat_ms) / 1000.0);
    end if;
    v_kind := case when v_late then 'LATE'::public.race_checkin_kind else 'ON_TIME'::public.race_checkin_kind end;

    -- checked_in_at is stamped by trigger (clock_timestamp()) — not by this function, not by the client.
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
  end if;

  select count(*)::int into v_pos from public.race_check_ins x
   where x.heat_id = r.heat_id
     and (x.checked_in_at, coalesce(x.tie_draw_position, 0), x.id) <= (c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id);

  return query select c.id, c.checked_in_at, c.kind, v_pos, v_heat_number, v_existing;
end;
$$;
grant execute on function race_check_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Queue: who is checked in, in start order, with bound or projected slots.
-- Projection = the next free slot for each unbound athlete, in check-in order;
-- it can move earlier (someone burned a slot) but never later for an athlete
-- who is already ahead in the queue, because new check-ins always sort last.
-- ---------------------------------------------------------------------------

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
    from public.race_check_ins c where c.event_id = p_event_id
  ),
  base as (
    select ci.*, h.number as hn, coalesce(h.anchor_race_ms, ph.anchor_ms) as anchor_ms,
           s.slot_index as sidx, s.status as sst, s.is_overflow as sov,
           case when s.id is null then (row_number() over (partition by ci.heat_id, (s.id is null) order by ci.pos))::int end as urank
    from ci
    join public.race_heats h on h.id = ci.heat_id
    left join ph on ph.heat_id = ci.heat_id
    left join public.race_start_slots s on s.registration_id = ci.registration_id
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

-- ---------------------------------------------------------------------------
-- Slot engine (internal — Phase 6's START EVENT / race_advance call these)
-- ---------------------------------------------------------------------------

-- Freeze anchors from a heat onward and create their slots. The first heat gets
-- p_anchor_ms; each following AUTO heat = previous last start + gap (F-1). A heat
-- in MANUAL mode stops the chain (it, and everything after it, waits for START NEXT
-- HEAT, which calls this again with the manual heat's anchor). Idempotent.
create or replace function race_anchor_heats_from(p_event_id uuid, p_from_heat_number int, p_anchor_ms bigint)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e public.race_events;
  h record;
  v_count int;
  v_anchor bigint;
  v_prev_anchor bigint;
  v_prev_count int;
  v_first boolean := true;
  n int := 0;
begin
  select * into e from public.race_events where id = p_event_id;
  for h in
    select hh.*, (select count(*) from public.race_registrations r
                   where r.heat_id = hh.id and r.status <> 'CANCELLED' and r.race_status <> 'WITHDRAWN')::int as roster
    from public.race_heats hh
    where hh.event_id = p_event_id and hh.number >= p_from_heat_number
    order by hh.number
  loop
    v_count := coalesce(h.planned_slot_count, h.roster);
    continue when v_count = 0;  -- an empty heat holds no slots and takes no time
    if v_first then
      v_anchor := coalesce(h.anchor_race_ms, p_anchor_ms);
      if v_anchor <> p_anchor_ms then
        raise exception 'RACE_ANCHOR_CONFLICT: heat % is already anchored at % ms', h.number, h.anchor_race_ms using errcode = 'check_violation';
      end if;
      v_first := false;
    elsif h.anchor_race_ms is not null then
      v_anchor := h.anchor_race_ms;
    elsif coalesce(h.start_mode, e.heat_start_mode) = 'MANUAL' then
      update public.race_heats set status = 'AWAITING_START'
       where event_id = p_event_id and number >= h.number and anchor_race_ms is null;
      exit;
    else
      v_anchor := public.race_next_heat_anchor_ms(v_prev_anchor, v_prev_count, e.start_interval_ms, e.heat_gap_ms);
    end if;

    update public.race_heats
       set anchor_race_ms = v_anchor, planned_slot_count = v_count, anchored_by = auth.uid(),
           status = case when status = 'AWAITING_START' then 'LOCKED'::public.race_heat_status else status end
     where id = h.id and anchor_race_ms is null;
    insert into public.race_start_slots (event_id, heat_id, slot_index)
    select p_event_id, h.id, gs from generate_series(0, v_count - 1) gs
    on conflict (heat_id, slot_index) do nothing;
    v_prev_anchor := v_anchor;
    v_prev_count := v_count;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function race_anchor_heats_from(uuid, int, bigint) from public, anon, authenticated;

create or replace function race_freeze_schedule(p_event_id uuid)
returns int
language sql volatile security definer
set search_path = ''
as $$
  select public.race_anchor_heats_from(p_event_id, 0, e.first_start_offset_ms)
  from public.race_events e where e.id = p_event_id
$$;
revoke execute on function race_freeze_schedule(uuid) from public, anon, authenticated;

-- Idempotent binder. Safe to call every second from anywhere, in any order:
--  1. every OPEN slot whose bind time (start − bind_lead) has come binds to the first
--     eligible checked-in athlete of its heat (check-in order), or burns EMPTY;
--  2. if eligible athletes remain and no planned slot is left, late athletes get an
--     OVERFLOW slot inside the heat gap (never moving anyone; capacity floor(G/I) − 1);
--  3. once a heat can no longer take anyone, athletes who never checked in are DNS.
-- Frozen while paused (race_now_ms is frozen), so a pause never burns a slot.
create or replace function race_bind_due_slots(p_event_id uuid)
returns table (bound int, emptied int, overflow_created int, missed_start int)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e public.race_events;
  v_now bigint;
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
  v_last_bind bigint;
  m record;
begin
  select * into e from public.race_events where id = p_event_id;
  v_now := public.race_now_ms(p_event_id);
  if v_now is null then
    return query select 0, 0, 0, 0;
    return;
  end if;
  v_cap := public.race_overflow_capacity(e.start_interval_ms, e.heat_gap_ms);

  for h in select * from public.race_heats where event_id = p_event_id and anchor_race_ms is not null order by number loop
    perform pg_advisory_xact_lock(public.race_heat_lock_key(h.id));

    -- 1. planned / open slots that are due, in index order
    loop
      select * into s from public.race_start_slots
       where heat_id = h.id and status = 'OPEN'
         and (h.anchor_race_ms + slot_index::bigint * e.start_interval_ms - e.bind_lead_ms) <= v_now
       order by slot_index limit 1 for update;
      exit when not found;
      select r.id into v_reg
        from public.race_check_ins c join public.race_registrations r on r.id = c.registration_id
       where c.heat_id = h.id and r.status = 'CONFIRMED' and r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')
         and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id)
       order by c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id limit 1;
      if v_reg is null then
        update public.race_start_slots set status = 'EMPTY' where id = s.id;
        perform public.race_audit('race.slot.empty', p_event_id, 'race_start_slots', s.id, null,
          jsonb_build_object('heat', h.number, 'slot_index', s.slot_index, 'reason', 'nobody checked in and unbound at bind time'), '{}'::jsonb);
        v_empty := v_empty + 1;
      else
        update public.race_start_slots set status = 'BOUND', registration_id = v_reg, bound_at = clock_timestamp() where id = s.id;
        perform public.race_audit('race.slot.bind', p_event_id, 'race_start_slots', s.id, null,
          jsonb_build_object('heat', h.number, 'slot_index', s.slot_index, 'registration_id', v_reg), '{}'::jsonb);
        v_bound := v_bound + 1;
      end if;
    end loop;

    -- 2. late athletes: overflow slots, only when no planned slot is still waiting
    loop
      exit when not exists (
        select 1 from public.race_check_ins c join public.race_registrations r on r.id = c.registration_id
         where c.heat_id = h.id and r.status = 'CONFIRMED' and r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')
           and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id));
      exit when exists (select 1 from public.race_start_slots where heat_id = h.id and status = 'OPEN');
      select coalesce(max(x.slot_index), -1) + 1, count(*) filter (where x.is_overflow)
        into v_next_idx, v_ov_cnt from public.race_start_slots x where x.heat_id = h.id;
      exit when v_ov_cnt >= v_cap;
      v_start := h.anchor_race_ms + v_next_idx::bigint * e.start_interval_ms;
      exit when v_start <= v_now;  -- that start time has already passed
      insert into public.race_start_slots (event_id, heat_id, slot_index, is_overflow)
      values (p_event_id, h.id, v_next_idx, true) returning * into s;
      perform public.race_audit('race.slot.overflow_created', p_event_id, 'race_start_slots', s.id, null,
        jsonb_build_object('heat', h.number, 'slot_index', v_next_idx), '{}'::jsonb);
      v_ov := v_ov + 1;
      exit when (v_start - e.bind_lead_ms) > v_now;  -- not due yet: the next pass binds it
      select r.id into v_reg
        from public.race_check_ins c join public.race_registrations r on r.id = c.registration_id
       where c.heat_id = h.id and r.status = 'CONFIRMED' and r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')
         and not exists (select 1 from public.race_start_slots x where x.registration_id = r.id)
       order by c.checked_in_at, coalesce(c.tie_draw_position, 0), c.id limit 1;
      update public.race_start_slots set status = 'BOUND', registration_id = v_reg, bound_at = clock_timestamp() where id = s.id;
      perform public.race_audit('race.slot.bind', p_event_id, 'race_start_slots', s.id, null,
        jsonb_build_object('heat', h.number, 'slot_index', v_next_idx, 'registration_id', v_reg, 'overflow', true), '{}'::jsonb);
      v_bound := v_bound + 1;
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
          jsonb_build_object('race_number', m.race_number, 'heat', h.number, 'reason', 'never checked in before the heat closed'), '{}'::jsonb);
        v_miss := v_miss + 1;
      end loop;
    end if;
  end loop;

  return query select v_bound, v_empty, v_ov, v_miss;
end;
$$;
revoke execute on function race_bind_due_slots(uuid) from public, anon, authenticated;

revoke execute on function race_check_in(uuid) from public, anon;
revoke execute on function race_queue(uuid, int) from public, anon;
grant execute on function race_check_in(uuid) to authenticated;
grant execute on function race_queue(uuid, int) to authenticated;
