-- THE NINTH race system — Phase 6 (2/2): the Master race engine.
--
--   race_start_event()     START EVENT, once. Freezes the schedule and starts the ONE race clock.
--   race_pause/resume()    EMERGENCY PAUSE / RESUME. Frozen race time; every clock freezes with it.
--   race_advance()         The engine tick. Idempotent, safe to call from anywhere, any number of
--                          times: binds slots, STARTS athletes automatically, moves station results
--                          through WORK → SCORING → LOCKED, finishes athletes, heats and the event.
--   race_skip_athlete()    SKIP ATHLETE. The slot stays empty; nobody moves; no start time changes.
--   race_mark_dnf()        An athlete who started but will not finish.
--   race_start_next_heat() Administrative start of a MANUAL heat.
--   race_control_state()   One snapshot for the Master Control dashboard.
--
-- Timing model recap (docs/race/01-schema-and-timing-model.md):
--   race_ms(t) = (t − started_at) − paused_total_ms − (paused ? t − paused_at : 0)
--   Nothing "ticks": every start, window and lock is heat anchor + slot × 3:30 + station offset.
--   The engine only RECORDS what the arithmetic already says — if nobody calls race_advance for a
--   minute, the times are still exact; the next call catches up.
--
-- Pause exactness: pause and resume instants are aligned to whole milliseconds, so the
-- paused duration is an exact integer number of ms and a pause can never nudge race time by 1 ms.

-- ---------------------------------------------------------------------------
-- Millisecond-aligned pause instants
-- ---------------------------------------------------------------------------

create or replace function race_stamp_pause_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the function owner (an engine RPC) may supply the instant, and only within 10 s of the server clock.
  if public.race_caller_is_client() or NEW.paused_at is null
     or abs(extract(epoch from (NEW.paused_at - clock_timestamp()))) > 10 then
    NEW.paused_at := clock_timestamp();
  end if;
  NEW.paused_at := date_trunc('milliseconds', NEW.paused_at);
  return NEW;
end;
$$;
drop trigger trg_race_pauses_server_time on race_pauses;
create trigger trg_race_pauses_server_time before insert on race_pauses
  for each row execute function race_stamp_pause_time();

create or replace function race_guard_pause_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_NO_DELETE: race_pauses rows are never deleted' using errcode = 'insufficient_privilege';
  end if;
  if OLD.resumed_at is not null then
    raise exception 'RACE_APPEND_ONLY: pause % is already closed', OLD.id using errcode = 'insufficient_privilege';
  end if;
  if NEW.resumed_by is null
     or (NEW.id, NEW.event_id, NEW.paused_at, NEW.paused_race_ms, NEW.paused_by, NEW.reason)
        is distinct from (OLD.id, OLD.event_id, OLD.paused_at, OLD.paused_race_ms, OLD.paused_by, OLD.reason) then
    raise exception 'RACE_APPEND_ONLY: a pause can only be closed (resumed_at/resumed_by), nothing else changes'
      using errcode = 'insufficient_privilege';
  end if;
  NEW.resumed_at := date_trunc('milliseconds', clock_timestamp());
  return NEW;
end;
$$;

alter table race_heats
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references race_profiles (id),
  add column cancel_reason text,
  add column cancelled_race_ms bigint;

-- ---------------------------------------------------------------------------
-- OFFICIAL TIME. Everything the engine records is stamped with the moment it OFFICIALLY happened (derived from the
-- START EVENT timestamp and the pause intervals), never with the moment some device happened to notice.
-- race_wall_at(event, race_ms) = started_at + race_ms + the pauses that ended before that race moment.
-- ---------------------------------------------------------------------------

create or replace function race_wall_at(p_event_id uuid, p_race_ms bigint)
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select c.started_at + make_interval(secs => (p_race_ms + coalesce((
           select sum(round(extract(epoch from (p.resumed_at - p.paused_at)) * 1000))
             from public.race_pauses p
            where p.event_id = c.event_id and p.resumed_at is not null and p.paused_race_ms < p_race_ms), 0))::double precision / 1000.0)
    from public.race_clock c
   where c.event_id = p_event_id and c.started_at is not null;
$$;
revoke execute on function race_wall_at(uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- START EVENT
-- ---------------------------------------------------------------------------

create or replace function race_start_event(p_event_id uuid)
returns table (started_at timestamptz, first_start_ms bigint, heats_anchored int)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.race_events;
  clk public.race_clock;
  v_heats int;
  v_first bigint;
  v_summary jsonb;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can start the event' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.race_events where id = p_event_id for update;
  if e.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  select * into clk from public.race_clock where event_id = p_event_id for update;
  if clk.started_at is not null then
    raise exception 'RACE_ALREADY_STARTED: START EVENT can only be pressed once' using errcode = 'check_violation';
  end if;
  if e.status <> 'HEATS_LOCKED' then
    raise exception 'RACE_HEATS_NOT_LOCKED: lock the heats before starting the event (status is %)', e.status using errcode = 'check_violation';
  end if;

  v_heats := public.race_freeze_schedule(p_event_id);
  if v_heats = 0 then
    raise exception 'RACE_NO_ATHLETES: no heat has any athlete' using errcode = 'check_violation';
  end if;

  update public.race_clock
     set started_at = clock_timestamp(), started_by = auth.uid(), version = version + 1, updated_at = clock_timestamp()
   where event_id = p_event_id returning race_clock.started_at into started_at;
  update public.race_events set status = 'LIVE' where id = p_event_id;
  select h.anchor_race_ms into v_first from public.race_heats h
   where h.event_id = p_event_id and h.anchor_race_ms is not null order by h.number limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('heat', h.number, 'athletes', h.planned_slot_count, 'anchor_ms', h.anchor_race_ms, 'status', h.status) order by h.number), '[]'::jsonb)
    into v_summary from public.race_heats h where h.event_id = p_event_id and (h.anchor_race_ms is not null or h.status = 'AWAITING_START');
  perform public.race_audit('race.event.start', p_event_id, 'race_events', p_event_id,
    jsonb_build_object('status', 'HEATS_LOCKED'), jsonb_build_object('status', 'LIVE', 'started_at', started_at),
    jsonb_build_object('first_start_ms', v_first, 'countdown_ms', e.first_start_offset_ms, 'heats', v_summary));

  perform public.race_advance_core(p_event_id);
  return query select started_at, v_first, v_heats;
end;
$$;

-- ---------------------------------------------------------------------------
-- EMERGENCY PAUSE / RESUME
-- ---------------------------------------------------------------------------

-- p_reason is an OPTIONAL NOTE: an emergency pause never asks for a justification.
create or replace function race_pause(p_event_id uuid, p_reason text default null)
returns table (paused_at timestamptz, paused_race_ms bigint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  clk public.race_clock;
  v_ts timestamptz;
  v_race_ms bigint;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can pause the race' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);   -- the race state up to the instant of the pause is settled first
  select * into clk from public.race_clock where event_id = p_event_id for update;
  if clk.event_id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if clk.started_at is null then
    raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation';
  end if;
  if clk.finished_at is not null then
    raise exception 'RACE_EVENT_FINISHED' using errcode = 'check_violation';
  end if;
  if clk.paused_at is not null then
    raise exception 'RACE_ALREADY_PAUSED' using errcode = 'check_violation';
  end if;

  -- stamped only NOW, after the clock row is locked: a caller that waited for the lock must not carry a timestamp from before
  -- the pause/resume that ran while it waited, or pauses would overlap
  v_ts := greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', clk.started_at));
  v_race_ms := public.race_ms_from_clock(clk.started_at, null, clk.paused_total_ms, v_ts);
  insert into public.race_pauses (event_id, paused_at, paused_race_ms, paused_by, reason)
  values (p_event_id, v_ts, greatest(v_race_ms, 0), auth.uid(), nullif(trim(p_reason), ''));
  update public.race_clock set paused_at = v_ts, version = version + 1, updated_at = clock_timestamp() where event_id = p_event_id;

  perform public.race_audit('race.event.pause', p_event_id, 'race_clock', p_event_id,
    null, jsonb_build_object('paused_at', v_ts, 'paused_race_ms', v_race_ms),
    jsonb_build_object('note', nullif(trim(p_reason), '')));
  return query select v_ts, v_race_ms;
end;
$$;

create or replace function race_resume(p_event_id uuid)
returns table (resumed_at timestamptz, paused_ms bigint, race_ms bigint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  clk public.race_clock;
  p public.race_pauses;
  v_paused_ms bigint;
  v_race_ms bigint;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can resume the race' using errcode = 'insufficient_privilege';
  end if;
  select * into clk from public.race_clock where event_id = p_event_id for update;
  if clk.event_id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if clk.paused_at is null then
    raise exception 'RACE_NOT_PAUSED' using errcode = 'check_violation';
  end if;

  -- closing the pause stamps resumed_at (server time, whole ms) — see race_guard_pause_update()
  update public.race_pauses set resumed_by = auth.uid() where event_id = p_event_id and resumed_at is null returning * into p;
  v_paused_ms := round(extract(epoch from (p.resumed_at - p.paused_at)) * 1000)::bigint;
  update public.race_clock
     set paused_at = null, paused_total_ms = paused_total_ms + v_paused_ms, version = version + 1, updated_at = clock_timestamp()
   where event_id = p_event_id;
  v_race_ms := public.race_now_ms(p_event_id);

  perform public.race_audit('race.event.resume', p_event_id, 'race_clock', p_event_id,
    jsonb_build_object('paused_at', p.paused_at, 'paused_race_ms', p.paused_race_ms),
    jsonb_build_object('resumed_at', p.resumed_at, 'paused_ms', v_paused_ms),
    jsonb_build_object('pause_id', p.id));
  perform public.race_advance_core(p_event_id);
  return query select p.resumed_at, v_paused_ms, v_race_ms;
end;
$$;

-- ---------------------------------------------------------------------------
-- THE ENGINE TICK
-- ---------------------------------------------------------------------------

create or replace function race_advance_core(p_event_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e public.race_events;
  clk public.race_clock;
  v_now bigint;
  v_cap int;
  v_bind record;
  s record;
  r record;
  v_reg uuid;
  n_started int := 0;
  n_station_start int := 0;
  n_perf_lock int := 0;
  n_locked int := 0;
  n_finished int := 0;
  n_heats_done int := 0;
  v_event_finished boolean := false;
  v_fin_ms bigint;
begin
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  if e.id is null or clk.started_at is null or clk.finished_at is not null then
    return jsonb_build_object('advanced', false);
  end if;
  v_now := public.race_ms_from_clock(clk.started_at, clk.paused_at, clk.paused_total_ms, clock_timestamp());
  v_cap := public.race_overflow_capacity(e.start_interval_ms, e.heat_gap_ms);

  -- 1. bind / burn / overflow / heat close (frozen while paused)
  select * into v_bind from public.race_bind_due_slots(p_event_id);

  -- 2. athletes whose slot start has come START — automatically, exactly once
  for s in
    select sl.id as slot_id, sl.heat_id, sl.slot_index, h.anchor_race_ms, h.number as heat_number
      from public.race_start_slots sl join public.race_heats h on h.id = sl.heat_id
     where sl.event_id = p_event_id and sl.status = 'BOUND'
       and h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms <= v_now
     order by h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms, sl.id
  loop
    perform pg_advisory_xact_lock(public.race_heat_lock_key(s.heat_id));
    update public.race_start_slots set status = 'STARTED', started_at = public.race_wall_at(p_event_id, s.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms)
     where id = s.slot_id and status = 'BOUND';
    continue when not found;  -- skipped or corrected while we waited for the lock
    select registration_id into v_reg from public.race_start_slots where id = s.slot_id;
    update public.race_registrations set race_status = 'STARTED' where id = v_reg and race_status in ('CHECKED_IN', 'LATE_CHECK_IN');

    insert into public.race_station_results (event_id, registration_id, station_id, slot_id, window_start_race_ms, window_end_race_ms, judge_profile_id)
    select p_event_id, v_reg, st.id, s.slot_id, w.work_start_ms, w.work_end_ms,
           (select case when count(*) = 1 then (array_agg(rs.profile_id))[1] end
              from public.race_staff rs where rs.event_id = p_event_id and rs.role = 'JUDGE' and rs.station_id = st.id and rs.active)
      from public.race_stations st
      cross join lateral public.race_station_window(s.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms, st.number::int,
                                                    e.start_interval_ms, e.work_ms, e.transition_ms) w
     where st.event_id = p_event_id
    on conflict (registration_id, station_id) do nothing;

    perform public.race_audit('race.athlete.start', p_event_id, 'race_start_slots', s.slot_id, null,
      jsonb_build_object('registration_id', v_reg, 'heat', s.heat_number, 'slot_index', s.slot_index,
        'planned_start_ms', s.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms, 'engine_race_ms', v_now,
        'lag_ms', v_now - (s.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms)), '{}'::jsonb);
    n_started := n_started + 1;
  end loop;

  -- 3. station windows: WORK begins, performance input LOCKS at exactly 3:00 (no grace), scoring window closes 0:30 later
  for r in
    update public.race_station_results sr set status = 'ACTIVE'
     where sr.event_id = p_event_id and sr.status = 'SCHEDULED' and sr.window_start_race_ms <= v_now
    returning sr.id, sr.registration_id, sr.station_id, sr.window_start_race_ms
  loop
    perform public.race_audit('race.station.start', p_event_id, 'race_station_results', r.id, null,
      jsonb_build_object('registration_id', r.registration_id, 'window_start_ms', r.window_start_race_ms), '{}'::jsonb);
    n_station_start := n_station_start + 1;
  end loop;
  for r in
    update public.race_station_results sr set status = 'SCORING'
     where sr.event_id = p_event_id and sr.status = 'ACTIVE' and sr.window_end_race_ms <= v_now
    returning sr.id, sr.registration_id, sr.window_end_race_ms
  loop
    perform public.race_audit('race.station.performance_locked', p_event_id, 'race_station_results', r.id, null,
      jsonb_build_object('registration_id', r.registration_id, 'window_end_ms', r.window_end_race_ms), '{}'::jsonb);
    n_perf_lock := n_perf_lock + 1;
  end loop;
  for r in
    update public.race_station_results sr set status = 'LOCKED', locked_at = public.race_wall_at(p_event_id, sr.window_end_race_ms + e.transition_ms)
     where sr.event_id = p_event_id and sr.status = 'SCORING' and sr.window_end_race_ms + e.transition_ms <= v_now
    returning sr.id, sr.registration_id
  loop
    perform public.race_audit('race.station.lock', p_event_id, 'race_station_results', r.id, null,
      jsonb_build_object('registration_id', r.registration_id), '{}'::jsonb);
    n_locked := n_locked + 1;
  end loop;

  -- 4. push-up style is locked when the athlete's Station 02 starts
  update public.race_registrations rg set pushup_style_locked_at = public.race_wall_at(p_event_id, h.anchor_race_ms + (sl.slot_index + 1)::bigint * e.start_interval_ms)
    from public.race_start_slots sl join public.race_heats h on h.id = sl.heat_id
   where sl.registration_id = rg.id and sl.status = 'STARTED' and rg.event_id = p_event_id
     and rg.pushup_style_locked_at is null
     and h.anchor_race_ms + (sl.slot_index + 1)::bigint * e.start_interval_ms <= v_now;

  -- 5. athletes who complete Station 09 finish
  for r in
    update public.race_registrations rg set race_status = 'FINISHED'
      from public.race_start_slots sl join public.race_heats h on h.id = sl.heat_id
     where sl.registration_id = rg.id and sl.status = 'STARTED' and rg.event_id = p_event_id and rg.race_status = 'STARTED'
       and h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (e.station_count - 1)::bigint * e.start_interval_ms + e.work_ms <= v_now
    returning rg.id, rg.race_number
  loop
    perform public.race_audit('race.athlete.finish', p_event_id, 'race_registrations', r.id, null,
      jsonb_build_object('race_number', r.race_number, 'engine_race_ms', v_now), '{}'::jsonb);
    n_finished := n_finished + 1;
  end loop;

  -- 6. heats: RUNNING once someone starts; FINISHED once it is closed and nothing is left in it
  update public.race_heats h set status = 'RUNNING'
   where h.event_id = p_event_id and h.status in ('LOCKED', 'AWAITING_START') and h.anchor_race_ms is not null
     and exists (select 1 from public.race_start_slots x where x.heat_id = h.id and x.status = 'STARTED');
  for r in
    update public.race_heats h set status = 'FINISHED'
     where h.event_id = p_event_id and h.status in ('LOCKED', 'RUNNING') and h.anchor_race_ms is not null
       and v_now > h.anchor_race_ms + (coalesce(h.planned_slot_count, 1) - 1 + v_cap)::bigint * e.start_interval_ms - e.bind_lead_ms
       and not exists (select 1 from public.race_start_slots x where x.heat_id = h.id and x.status in ('OPEN', 'BOUND'))
       and not exists (select 1 from public.race_registrations g where g.heat_id = h.id and g.race_status = 'STARTED')
       -- the last station's 0:30 scoring window must close (and lock) before the heat is over
       and not exists (select 1 from public.race_station_results z join public.race_start_slots zs on zs.id = z.slot_id
                        where zs.heat_id = h.id and z.status in ('SCHEDULED', 'ACTIVE', 'SCORING'))
    returning h.id, h.number
  loop
    perform public.race_audit('race.heat.finish', p_event_id, 'race_heats', r.id, null, jsonb_build_object('heat', r.number), '{}'::jsonb);
    n_heats_done := n_heats_done + 1;
  end loop;

  -- 7. the event finishes when every heat that has athletes has run to its end
  if exists (select 1 from public.race_heats h where h.event_id = p_event_id and h.anchor_race_ms is not null and h.status <> 'CANCELLED')
     and not exists (select 1 from public.race_heats h where h.event_id = p_event_id and h.anchor_race_ms is not null and h.status not in ('FINISHED', 'CANCELLED'))
     and not exists (select 1 from public.race_heats h where h.event_id = p_event_id and h.anchor_race_ms is null and h.status <> 'CANCELLED'
                       and exists (select 1 from public.race_registrations g where g.heat_id = h.id and g.status <> 'CANCELLED' and g.race_status <> 'WITHDRAWN')) then
    -- anybody still waiting without a slot can no longer race
    for r in
      update public.race_registrations set race_status = 'MISSED_START'
       where event_id = p_event_id and status <> 'CANCELLED' and race_status in ('REGISTERED', 'CHECKED_IN', 'LATE_CHECK_IN')
      returning id, race_number
    loop
      perform public.race_audit('race.registration.missed_start', p_event_id, 'race_registrations', r.id, null,
        jsonb_build_object('race_number', r.race_number, 'reason', 'the event finished without a slot for this athlete'), '{}'::jsonb);
    end loop;
    -- the OFFICIAL finish: the last moment anything was still going on (a lock, a heat closing, a heat cancelled)
    v_fin_ms := least(v_now, greatest(
      coalesce((select max(z.window_end_race_ms) + e.transition_ms from public.race_station_results z where z.event_id = p_event_id and z.status <> 'VOID_DNS'), 0),
      coalesce((select max(hh.anchor_race_ms + (coalesce(hh.planned_slot_count, 1) - 1 + v_cap)::bigint * e.start_interval_ms - e.bind_lead_ms + 1)
                  from public.race_heats hh where hh.event_id = p_event_id and hh.anchor_race_ms is not null and hh.status <> 'CANCELLED'), 0),
      coalesce((select max(hh.cancelled_race_ms) from public.race_heats hh where hh.event_id = p_event_id), 0)));
    update public.race_clock set finished_at = public.race_wall_at(p_event_id, v_fin_ms), version = version + 1, updated_at = clock_timestamp() where event_id = p_event_id;
    update public.race_events set status = 'FINISHED' where id = p_event_id;
    perform public.race_audit('race.event.finish', p_event_id, 'race_events', p_event_id,
      jsonb_build_object('status', 'LIVE'), jsonb_build_object('status', 'FINISHED'),
      jsonb_build_object('engine_race_ms', v_fin_ms, 'observed_race_ms', v_now));
    v_event_finished := true;
  end if;

  return jsonb_build_object('advanced', true, 'race_ms', v_now, 'paused', clk.paused_at is not null,
    'bound', v_bind.bound, 'emptied', v_bind.emptied, 'overflow_created', v_bind.overflow_created, 'missed_start', v_bind.missed_start,
    'athletes_started', n_started, 'stations_started', n_station_start, 'performance_locked', n_perf_lock, 'stations_locked', n_locked,
    'athletes_finished', n_finished, 'heats_finished', n_heats_done, 'event_finished', v_event_finished);
end;
$$;

-- Public tick: any staff device (Master, judge, station screen) may call it; concurrent callers do no duplicate work.
create or replace function race_advance(p_event_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if public.race_is_event_staff(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('race_advance:' || p_event_id::text, 0)) then
    return jsonb_build_object('busy', true);
  end if;
  return public.race_advance_core(p_event_id);
end;
$$;

-- Backstop for a scheduler (pg_cron / an Edge Function on a timer): ticks every LIVE event.
create or replace function race_advance_all()
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e record;
  n int := 0;
begin
  for e in select id from public.race_events where status = 'LIVE' loop
    if pg_try_advisory_xact_lock(hashtextextended('race_advance:' || e.id::text, 0)) then
      perform public.race_advance_core(e.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- SKIP ATHLETE — the slot stays empty; nobody moves; every other start time is untouched
-- ---------------------------------------------------------------------------

create or replace function race_skip_athlete(p_slot_id uuid, p_reason text)
returns table (heat_number smallint, slot_index smallint, race_number text)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  sl public.race_start_slots;
  h public.race_heats;
  e public.race_events;
  rg public.race_registrations;
  v_now bigint;
  v_start bigint;
begin
  select * into sl from public.race_start_slots where id = p_slot_id;
  if sl.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(sl.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can skip an athlete' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  perform public.race_advance_core(sl.event_id);   -- catch the race up before deciding anything
  perform pg_advisory_xact_lock(public.race_heat_lock_key(sl.heat_id));
  select * into sl from public.race_start_slots where id = p_slot_id for update;
  select * into h from public.race_heats where id = sl.heat_id;
  select * into e from public.race_events where id = sl.event_id;
  if sl.status not in ('BOUND', 'STARTED') then
    raise exception 'RACE_SLOT_NOT_ASSIGNED: only a slot with an athlete can be skipped (this one is %)', sl.status using errcode = 'check_violation';
  end if;
  v_now := public.race_now_ms(sl.event_id);
  if v_now is null then
    raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation';
  end if;
  v_start := h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms;
  if v_now >= v_start + e.work_ms then
    raise exception 'RACE_SKIP_WINDOW_CLOSED: an athlete can only be skipped until their Station 01 window ends' using errcode = 'check_violation';
  end if;

  select * into rg from public.race_registrations where id = sl.registration_id for update;
  update public.race_start_slots
     set status = 'SKIPPED', skipped_at = clock_timestamp(), skipped_by = auth.uid(), skip_reason = trim(p_reason)
   where id = sl.id;
  update public.race_registrations set race_status = 'MISSED_START' where id = rg.id;
  update public.race_station_results set status = 'VOID_DNS' where registration_id = rg.id;

  perform public.race_audit('race.athlete.skip', sl.event_id, 'race_start_slots', sl.id,
    jsonb_build_object('slot_status', sl.status, 'race_status', rg.race_status),
    jsonb_build_object('slot_status', 'SKIPPED', 'race_status', 'MISSED_START'),
    jsonb_build_object('reason', trim(p_reason), 'race_number', rg.race_number, 'heat', h.number, 'slot_index', sl.slot_index,
                       'planned_start_ms', v_start, 'engine_race_ms', v_now));
  return query select h.number, sl.slot_index, rg.race_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- DNF — started but will not finish. Raw results and history are kept; they are
-- simply not ranked (approved decision F-2).
-- ---------------------------------------------------------------------------

create or replace function race_mark_dnf(p_registration_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  rg public.race_registrations;
begin
  select * into rg from public.race_registrations where id = p_registration_id;
  if rg.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(rg.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  perform public.race_advance_core(rg.event_id);   -- catch the race up before deciding anything
  select * into rg from public.race_registrations where id = p_registration_id for update;
  if rg.race_status <> 'STARTED' then
    raise exception 'RACE_NOT_RACING: only an athlete who is racing can be marked DNF (this one is %)', rg.race_status using errcode = 'check_violation';
  end if;
  update public.race_registrations set race_status = 'DNF' where id = rg.id;
  update public.race_station_results set status = 'NOT_REACHED' where registration_id = rg.id and status = 'SCHEDULED';
  perform public.race_audit('race.athlete.dnf', rg.event_id, 'race_registrations', rg.id,
    jsonb_build_object('race_status', 'STARTED'), jsonb_build_object('race_status', 'DNF'),
    jsonb_build_object('reason', trim(p_reason), 'race_number', rg.race_number, 'engine_race_ms', public.race_now_ms(rg.event_id)));
end;
$$;

-- ---------------------------------------------------------------------------
-- START NEXT HEAT — only for heats explicitly configured MANUAL (approved decision 3)
-- New heat starts no earlier than one interval after the previous heat's last slot,
-- and no earlier than the bind lead from now; later AUTO heats chain from it.
-- ---------------------------------------------------------------------------

create or replace function race_start_next_heat(p_event_id uuid, p_heat_number int)
returns table (heat_number smallint, anchor_race_ms bigint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.race_events;
  clk public.race_clock;
  h public.race_heats;
  prev public.race_heats;
  v_now bigint;
  v_used int;
  v_anchor bigint;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can start the next heat' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);   -- catch the race up before deciding anything
  select * into e from public.race_events where id = p_event_id for update;
  select * into clk from public.race_clock where event_id = p_event_id for update;
  if e.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if clk.started_at is null then
    raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation';
  end if;
  if clk.finished_at is not null then
    raise exception 'RACE_EVENT_FINISHED' using errcode = 'check_violation';
  end if;
  select * into h from public.race_heats where event_id = p_event_id and number = p_heat_number for update;
  if h.id is null then
    raise exception 'RACE_NOT_FOUND: no such heat' using errcode = 'no_data_found';
  end if;
  if h.anchor_race_ms is not null then
    raise exception 'RACE_HEAT_ALREADY_STARTED' using errcode = 'check_violation';
  end if;
  if coalesce(h.start_mode, e.heat_start_mode) <> 'MANUAL' then
    raise exception 'RACE_HEAT_NOT_MANUAL: heats start automatically unless configured MANUAL' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.race_registrations g where g.heat_id = h.id and g.status <> 'CANCELLED' and g.race_status <> 'WITHDRAWN') then
    raise exception 'RACE_HEAT_EMPTY' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_heats x where x.event_id = p_event_id and x.number < h.number and x.anchor_race_ms is null and x.status <> 'CANCELLED'
               and exists (select 1 from public.race_registrations g where g.heat_id = x.id and g.status <> 'CANCELLED' and g.race_status <> 'WITHDRAWN')) then
    raise exception 'RACE_PREVIOUS_HEAT_NOT_STARTED: start the earlier heat first' using errcode = 'check_violation';
  end if;

  select * into prev from public.race_heats x where x.event_id = p_event_id and x.number < h.number and x.anchor_race_ms is not null and x.status <> 'CANCELLED'
   order by x.number desc limit 1;
  v_now := public.race_now_ms(p_event_id);
  v_anchor := v_now + e.bind_lead_ms;
  if prev.id is not null then
    select coalesce(max(x.slot_index), -1) + 1 into v_used from public.race_start_slots x where x.heat_id = prev.id;
    v_anchor := greatest(v_anchor, prev.anchor_race_ms + v_used::bigint * e.start_interval_ms);
  end if;
  perform public.race_anchor_heats_from(p_event_id, h.number, v_anchor);

  perform public.race_audit('race.heat.start_next', p_event_id, 'race_heats', h.id, null,
    jsonb_build_object('heat', h.number, 'anchor_ms', v_anchor), jsonb_build_object('engine_race_ms', v_now));
  perform public.race_advance_core(p_event_id);
  return query select h.number, v_anchor;
end;
$$;

-- ---------------------------------------------------------------------------
-- CLOSE HEAT WITHOUT START — a heat that will never run (usually a MANUAL heat) must not block the event.
-- Event Manager or Master Control; a reason is required; fully audited. Nothing that already started is touched.
-- Its athletes become DNS (an Event Manager may still move them to a later heat that has room); an unstarted
-- AUTO heat that was waiting behind it is scheduled now.
-- ---------------------------------------------------------------------------

create or replace function race_close_heat_without_start(p_event_id uuid, p_heat_number int, p_reason text)
returns table (heat_number smallint, athletes_dns int, slots_emptied int, next_heat_anchored smallint)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.race_events;
  clk public.race_clock;
  h public.race_heats;
  nx public.race_heats;
  prev public.race_heats;
  v_now bigint;
  v_dns int := 0;
  v_slots int := 0;
  v_next smallint;
  v_anchor bigint;
  m record;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can close a heat' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  perform public.race_advance_core(p_event_id);   -- catch the race up before deciding anything
  select * into e from public.race_events where id = p_event_id for update;
  select * into clk from public.race_clock where event_id = p_event_id for update;
  if e.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if clk.started_at is null then
    raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation';
  end if;
  if clk.finished_at is not null then
    raise exception 'RACE_EVENT_FINISHED' using errcode = 'check_violation';
  end if;
  select * into h from public.race_heats where event_id = p_event_id and number = p_heat_number for update;
  if h.id is null then
    raise exception 'RACE_NOT_FOUND: no such heat' using errcode = 'no_data_found';
  end if;
  perform pg_advisory_xact_lock(public.race_heat_lock_key(h.id));
  if h.status in ('RUNNING', 'FINISHED', 'CANCELLED')
     or exists (select 1 from public.race_start_slots x where x.heat_id = h.id and x.status = 'STARTED') then
    raise exception 'RACE_HEAT_NOT_CANCELLABLE: heat % is % — only a heat in which nobody has started can be closed', h.number, h.status using errcode = 'check_violation';
  end if;
  v_now := public.race_now_ms(p_event_id);

  update public.race_start_slots set status = 'EMPTY' where heat_id = h.id and status in ('OPEN', 'BOUND');
  get diagnostics v_slots = row_count;

  for m in
    update public.race_registrations set race_status = 'MISSED_START'
     where heat_id = h.id and status <> 'CANCELLED' and race_status in ('REGISTERED', 'CHECKED_IN', 'LATE_CHECK_IN')
    returning id, race_number
  loop
    perform public.race_audit('race.registration.missed_start', p_event_id, 'race_registrations', m.id, null,
      jsonb_build_object('race_number', m.race_number, 'heat', h.number, 'reason', 'the heat was closed without starting: ' || trim(p_reason), 'official_race_ms', v_now), '{}'::jsonb);
    v_dns := v_dns + 1;
  end loop;

  update public.race_heats
     set status = 'CANCELLED', cancelled_at = clock_timestamp(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason), cancelled_race_ms = v_now
   where id = h.id;
  perform public.race_audit('race.heat.cancel', p_event_id, 'race_heats', h.id,
    jsonb_build_object('status', h.status), jsonb_build_object('status', 'CANCELLED'),
    jsonb_build_object('reason', trim(p_reason), 'heat', h.number, 'athletes_dns', v_dns, 'slots_emptied', v_slots, 'engine_race_ms', v_now));

  -- an unstarted AUTO heat that was waiting behind this one is scheduled now (a MANUAL one waits for its own START)
  select * into nx from public.race_heats x
   where x.event_id = p_event_id and x.number > h.number and x.status <> 'CANCELLED' and x.anchor_race_ms is null
   order by x.number limit 1;
  if nx.id is not null and coalesce(nx.start_mode, e.heat_start_mode) = 'AUTO'
     and exists (select 1 from public.race_registrations g where g.heat_id = nx.id and g.status <> 'CANCELLED' and g.race_status <> 'WITHDRAWN') then
    select * into prev from public.race_heats x where x.event_id = p_event_id and x.number < nx.number and x.anchor_race_ms is not null and x.status <> 'CANCELLED'
     order by x.number desc limit 1;
    v_anchor := v_now + e.bind_lead_ms;
    if prev.id is not null then
      v_anchor := greatest(v_anchor, public.race_next_heat_anchor_ms(prev.anchor_race_ms, prev.planned_slot_count, e.start_interval_ms, e.heat_gap_ms));
    end if;
    perform public.race_anchor_heats_from(p_event_id, nx.number, v_anchor);
    v_next := nx.number;
  end if;

  perform public.race_advance_core(p_event_id);
  return query select h.number, v_dns, v_slots, v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- MASTER CONTROL SNAPSHOT — everything the live dashboard shows, in one call
-- ---------------------------------------------------------------------------

create or replace function race_control_state(p_event_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e public.race_events;
  clk public.race_clock;
  v_ts timestamptz := clock_timestamp();
  v_now bigint;
  v_next jsonb;
  v_stations jsonb;
  v_heats jsonb;
  v_counts jsonb;
  v_attention jsonb;
  v_queue jsonb;
begin
  if public.race_is_control(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);   -- a dashboard opened after a blackout shows the settled, correct state
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  v_now := public.race_ms_from_clock(clk.started_at, clk.paused_at, clk.paused_total_ms, v_ts);

  select jsonb_build_object('registration_id', r.id, 'race_number', r.race_number, 'full_name', a.full_name, 'category_code', c.code,
           'heat', h.number, 'slot_index', s.slot_index,
           'start_ms', h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms,
           'starts_in_ms', h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms - v_now,
           'announce_in_ms', h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms - e.announce_lead_ms - v_now)
    into v_next
    from public.race_start_slots s
    join public.race_heats h on h.id = s.heat_id
    join public.race_registrations r on r.id = s.registration_id
    join public.race_athletes a on a.id = r.athlete_id
    join public.race_categories c on c.id = r.category_id
   where s.event_id = p_event_id and s.status = 'BOUND' and v_now is not null
     and h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms > v_now
   order by h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'number', st.number, 'name', st.name,
      'state', case when cur.id is null then 'IDLE' when v_now < cur.window_end_race_ms then 'WORK' else 'TRANSITION' end,
      'athlete', case when cur.id is null then null else jsonb_build_object('race_number', cur.race_number, 'full_name', cur.full_name, 'category_code', cur.category_code) end,
      'window_start_ms', cur.window_start_race_ms, 'window_end_ms', cur.window_end_race_ms, 'scoring_end_ms', cur.window_end_race_ms + e.transition_ms,
      'remaining_ms', case when cur.id is null then null when v_now < cur.window_end_race_ms then cur.window_end_race_ms - v_now
                           else cur.window_end_race_ms + e.transition_ms - v_now end,
      'score', null) order by st.number), '[]'::jsonb)
    into v_stations
    from public.race_stations st
    left join lateral (
      select sr.id, sr.window_start_race_ms, sr.window_end_race_ms, r.race_number, a.full_name, c.code as category_code
        from public.race_station_results sr
        join public.race_registrations r on r.id = sr.registration_id
        join public.race_athletes a on a.id = r.athlete_id
        join public.race_categories c on c.id = r.category_id
       where sr.station_id = st.id and sr.status <> 'VOID_DNS' and v_now is not null
         and sr.window_start_race_ms <= v_now and sr.window_end_race_ms + e.transition_ms > v_now
       order by sr.window_start_race_ms limit 1
    ) cur on true
   where st.event_id = p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'number', h.number, 'status', h.status, 'anchor_ms', h.anchor_race_ms, 'planned_slots', h.planned_slot_count,
      'start_mode', coalesce(h.start_mode, e.heat_start_mode),
      'roster', (select count(*) from public.race_registrations g where g.heat_id = h.id and g.status <> 'CANCELLED' and g.race_status <> 'WITHDRAWN'),
      'started', (select count(*) from public.race_start_slots x where x.heat_id = h.id and x.status = 'STARTED'),
      'bound', (select count(*) from public.race_start_slots x where x.heat_id = h.id and x.status = 'BOUND'),
      'empty', (select count(*) from public.race_start_slots x where x.heat_id = h.id and x.status = 'EMPTY'),
      'skipped', (select count(*) from public.race_start_slots x where x.heat_id = h.id and x.status = 'SKIPPED'),
      'open', (select count(*) from public.race_start_slots x where x.heat_id = h.id and x.status = 'OPEN')) order by h.number), '[]'::jsonb)
    into v_heats from public.race_heats h where h.event_id = p_event_id;

  select jsonb_build_object(
      'registered', count(*) filter (where g.status <> 'CANCELLED'),
      'checked_in', count(*) filter (where g.race_status in ('CHECKED_IN', 'LATE_CHECK_IN')),
      'racing', count(*) filter (where g.race_status = 'STARTED'),
      'finished', count(*) filter (where g.race_status = 'FINISHED'),
      'dns', count(*) filter (where g.race_status = 'MISSED_START'),
      'dnf', count(*) filter (where g.race_status = 'DNF'))
    into v_counts from public.race_registrations g where g.event_id = p_event_id;

  -- who can still be skipped right now: bound (waiting) or inside their Station 01 window
  select coalesce(jsonb_agg(jsonb_build_object(
      'slot_id', s.id, 'registration_id', r.id, 'race_number', r.race_number, 'full_name', a.full_name, 'category_code', c.code,
      'heat', h.number, 'slot_index', s.slot_index, 'is_overflow', s.is_overflow, 'status', s.status,
      'start_ms', h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms,
      'starts_in_ms', h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms - v_now)
      order by h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms, s.id), '[]'::jsonb)
    into v_queue
    from public.race_start_slots s
    join public.race_heats h on h.id = s.heat_id
    join public.race_registrations r on r.id = s.registration_id
    join public.race_athletes a on a.id = r.athlete_id
    join public.race_categories c on c.id = r.category_id
   where s.event_id = p_event_id and s.status in ('BOUND', 'STARTED') and v_now is not null
     and v_now < h.anchor_race_ms + s.slot_index::bigint * e.start_interval_ms + e.work_ms
     and clk.finished_at is null;

  -- athletes that need a human: DNS (Event Manager may override) and unslotted late athletes (may be moved)
  select jsonb_build_object(
      'dns', (select coalesce(jsonb_agg(jsonb_build_object('registration_id', g.id, 'race_number', g.race_number, 'full_name', a.full_name,
                   'heat', h.number, 'was_skipped', exists (select 1 from public.race_start_slots x where x.registration_id = g.id and x.status = 'SKIPPED'))
                   order by g.race_number), '[]'::jsonb)
                from public.race_registrations g join public.race_athletes a on a.id = g.athlete_id left join public.race_heats h on h.id = g.heat_id
               where g.event_id = p_event_id and g.race_status = 'MISSED_START' and g.status = 'CONFIRMED'),
      'no_slot', (select coalesce(jsonb_agg(jsonb_build_object('registration_id', q.registration_id, 'race_number', q.race_number,
                   'full_name', q.full_name, 'heat', q.heat_number) order by q.race_number), '[]'::jsonb)
                from public.race_queue(p_event_id) q where q.no_slot_available))
    into v_attention;

  return jsonb_build_object(
    'server_time', v_ts,
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'timezone', e.timezone,
                                'first_start_offset_ms', e.first_start_offset_ms, 'start_interval_ms', e.start_interval_ms,
                                'work_ms', e.work_ms, 'transition_ms', e.transition_ms, 'announce_lead_ms', e.announce_lead_ms),
    'clock', jsonb_build_object('started', clk.started_at is not null, 'paused', clk.paused_at is not null, 'finished', clk.finished_at is not null,
                                'race_ms', v_now, 'version', clk.version, 'started_at', clk.started_at, 'paused_at', clk.paused_at,
                                'pre_race', v_now is not null and v_now < e.first_start_offset_ms and clk.finished_at is null),
    'next_athlete', v_next, 'skippable', v_queue, 'stations', v_stations, 'heats', v_heats, 'counts', v_counts, 'attention', v_attention);
end;
$$;

-- ---------------------------------------------------------------------------
-- Exposure: engine internals are not API surface; the public RPCs are authenticated-only
-- (each still authorizes inside, NULL-safe).
-- ---------------------------------------------------------------------------

revoke execute on function race_advance_core(uuid) from public, anon, authenticated;
revoke execute on function race_advance_all() from public, anon, authenticated;

revoke execute on function race_start_event(uuid) from public, anon;
revoke execute on function race_pause(uuid, text) from public, anon;
revoke execute on function race_resume(uuid) from public, anon;
revoke execute on function race_advance(uuid) from public, anon;
revoke execute on function race_skip_athlete(uuid, text) from public, anon;
revoke execute on function race_mark_dnf(uuid, text) from public, anon;
revoke execute on function race_start_next_heat(uuid, int) from public, anon;
revoke execute on function race_control_state(uuid) from public, anon;
revoke execute on function race_close_heat_without_start(uuid, int, text) from public, anon;
grant execute on function race_close_heat_without_start(uuid, int, text) to authenticated;
grant execute on function race_start_event(uuid) to authenticated;
grant execute on function race_pause(uuid, text) to authenticated;
grant execute on function race_resume(uuid) to authenticated;
grant execute on function race_advance(uuid) to authenticated;
grant execute on function race_skip_athlete(uuid, text) to authenticated;
grant execute on function race_mark_dnf(uuid, text) to authenticated;
grant execute on function race_start_next_heat(uuid, int) to authenticated;
grant execute on function race_control_state(uuid) to authenticated;
