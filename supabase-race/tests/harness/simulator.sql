-- THE NINTH race simulator (TEST-ONLY — never a migration, never applied to a real project).
--
-- It drives the REAL engine (race_start_event / race_advance_core / race_pause / race_skip_athlete …)
-- and only manipulates the clock's stored anchors, so hours of racing run in seconds:
--   travel_to(event, race_ms)  moves the race clock so race time == race_ms (while running)
--   age_pause(event, wall_ms)  makes an open pause LAST wall_ms of wall time, without waiting
--   script + run()             replays scripted desk/master actions at race times, ticks the
--                              engine, and checks the timing invariants after EVERY tick
--
-- Invariants (raise on the first violation):
--   I1  no two athletes ever occupy a station at the same time (work + 0:30 transition windows never overlap)
--   I2  every station window == heat anchor + slot × 3:30 + (station−1) × 3:30 (+3:00 work)
--   I3  every athlete who started has exactly 9 station results; a skipped athlete has no live result
--   I4  every result's status agrees with race time (SCHEDULED < ACTIVE < SCORING < LOCKED at the exact boundaries)
create schema race_sim;
grant usage on schema race_sim to anon, authenticated, service_role;

-- "The world's wall clock moved forward by p_delta": every wall timestamp already recorded for the event moves p_delta into the past,
-- so official instants (START EVENT + race ms + pauses) stay consistent with what was recorded. Triggers are bypassed (test only).
create function race_sim.shift_past(p_event uuid, p_delta interval) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.race_pauses set paused_at = paused_at - p_delta, resumed_at = resumed_at - p_delta where event_id = p_event;
  update public.race_check_ins set checked_in_at = checked_in_at - p_delta where event_id = p_event;
  update public.race_start_slots set bound_at = bound_at - p_delta, started_at = started_at - p_delta, skipped_at = skipped_at - p_delta where event_id = p_event;
  update public.race_station_results set locked_at = locked_at - p_delta where event_id = p_event;
  update public.race_registrations set pushup_style_locked_at = pushup_style_locked_at - p_delta where event_id = p_event;
  update public.race_heats set cancelled_at = cancelled_at - p_delta where event_id = p_event;
  update public.race_clock set finished_at = finished_at - p_delta where event_id = p_event;
  perform set_config('session_replication_role', 'origin', true);
end $$;

create function race_sim.travel_to(p_event uuid, p_race_ms bigint) returns void language plpgsql as $$
declare c public.race_clock; v_new timestamptz;
begin
  select * into c from public.race_clock where event_id = p_event;
  if c.paused_at is not null then raise exception 'race_sim: cannot travel while paused'; end if;
  v_new := clock_timestamp() - make_interval(secs => (p_race_ms + c.paused_total_ms) / 1000.0);
  perform race_sim.shift_past(p_event, c.started_at - v_new);
  update public.race_clock set started_at = v_new where event_id = p_event;
end $$;

-- A pause that LASTS p_wall_ms of wall time, without waiting: the whole recorded past moves p_wall_ms earlier (started_at and the open
-- pause's start included), so the frozen race time is unchanged and resuming subtracts exactly the pause.
create function race_sim.age_pause(p_event uuid, p_wall_ms bigint) returns void language plpgsql as $$
declare v_iv interval := make_interval(secs => p_wall_ms / 1000.0);
begin
  perform race_sim.shift_past(p_event, v_iv);
  perform set_config('session_replication_role', 'replica', true);
  update public.race_clock set started_at = started_at - v_iv, paused_at = paused_at - v_iv where event_id = p_event;
  perform set_config('session_replication_role', 'origin', true);
end $$;

create function race_sim.check_invariants(p_event uuid, p_race_ms bigint) returns void language plpgsql as $$
declare
  e public.race_events;
  n bigint;
begin
  select * into e from public.race_events where id = p_event;

  select count(*) into n from public.race_station_results a join public.race_station_results b
    on a.station_id = b.station_id and a.id < b.id and a.status <> 'VOID_DNS' and b.status <> 'VOID_DNS'
   and a.window_start_race_ms < b.window_end_race_ms + e.transition_ms and b.window_start_race_ms < a.window_end_race_ms + e.transition_ms
   where a.event_id = p_event;
  if n > 0 then raise exception 'race_sim I1 violated at race_ms %: % station overlaps', p_race_ms, n; end if;

  select count(*) into n from public.race_station_results sr
    join public.race_start_slots sl on sl.id = sr.slot_id join public.race_heats h on h.id = sl.heat_id join public.race_stations st on st.id = sr.station_id
   where sr.event_id = p_event
     and (sr.window_start_race_ms <> h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms
          or sr.window_end_race_ms <> sr.window_start_race_ms + e.work_ms);
  if n > 0 then raise exception 'race_sim I2 violated at race_ms %: % windows off the timing model', p_race_ms, n; end if;

  select count(*) into n from public.race_registrations r
   where r.event_id = p_event and r.race_status in ('STARTED', 'FINISHED', 'DNF')
     and (select count(*) from public.race_station_results x where x.registration_id = r.id) <> 9;
  if n > 0 then raise exception 'race_sim I3 violated at race_ms %: % started athletes without exactly 9 results', p_race_ms, n; end if;
  select count(*) into n from public.race_start_slots s join public.race_station_results x on x.slot_id = s.id
   where s.event_id = p_event and s.status = 'SKIPPED' and x.status <> 'VOID_DNS';
  if n > 0 then raise exception 'race_sim I3 violated at race_ms %: % live results for a skipped athlete', p_race_ms, n; end if;

  select count(*) into n from public.race_station_results sr
   where sr.event_id = p_event
     and ((sr.status = 'ACTIVE' and not (sr.window_start_race_ms <= p_race_ms and p_race_ms < sr.window_end_race_ms))
       or (sr.status = 'SCORING' and not (sr.window_end_race_ms <= p_race_ms and p_race_ms < sr.window_end_race_ms + e.transition_ms))
       or (sr.status = 'LOCKED' and p_race_ms < sr.window_end_race_ms + e.transition_ms)
       or (sr.status = 'SCHEDULED' and p_race_ms >= sr.window_start_race_ms));
  if n > 0 then raise exception 'race_sim I4 violated at race_ms %: % results whose status disagrees with race time', p_race_ms, n; end if;
end $$;

create table race_sim.script (
  event_id uuid not null, seq serial, at_ms bigint not null, action text not null, arg text, done boolean not null default false,
  primary key (event_id, seq)
);

create function race_sim.exec(p_event uuid, p_action text, p_arg text) returns void language plpgsql as $$
declare v_slot uuid;
begin
  case p_action
    when 'check_in' then perform public.race_check_in(p_arg::uuid);
    when 'skip' then
      perform public.race_advance_core(p_event);   -- the operator's screen syncs when it opens (control state does exactly this)
      select id into v_slot from public.race_start_slots where registration_id = p_arg::uuid and status in ('BOUND', 'STARTED');
      perform public.race_skip_athlete(v_slot, 'simulated: athlete not ready');
    when 'dnf' then perform public.race_mark_dnf(p_arg::uuid, 'simulated: athlete withdrew');
    when 'close_heat' then perform public.race_close_heat_without_start(p_event, p_arg::int, 'simulated: the heat will not start');
    when 'pause' then
      perform public.race_pause(p_event, 'simulated emergency pause');
      perform race_sim.age_pause(p_event, p_arg::bigint);
      perform public.race_resume(p_event);
    else raise exception 'race_sim: unknown action %', p_action;
  end case;
end $$;

-- One engine tick as an operator's device would send it: advance race time by p_step_ms (capped at p_to_ms), fire every scripted action that
-- has come due, tick the engine, check the invariants. Each call is its OWN transaction when driven by \gexec (see the tests): a long
-- simulation in one transaction bloats the rows it rewrites every tick.
create table race_sim.ticks (event_id uuid primary key, ticks int not null default 0, actions int not null default 0);
grant select on race_sim.ticks to anon, authenticated, service_role;

create function race_sim.step(p_event uuid, p_actor uuid, p_to_ms bigint, p_step_ms bigint)
returns void language plpgsql as $$
declare
  t bigint := coalesce(public.race_now_ms(p_event), 0);
  v jsonb;
  s record;
  n_act int := 0;
begin
  if t >= p_to_ms or exists (select 1 from public.race_clock where event_id = p_event and finished_at is not null) then return; end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  t := least(t + p_step_ms, p_to_ms);
  perform race_sim.travel_to(p_event, t);
  for s in select * from race_sim.script where event_id = p_event and not done and at_ms <= t order by at_ms, seq loop
    perform race_sim.exec(p_event, s.action, s.arg);
    update race_sim.script set done = true where event_id = p_event and seq = s.seq;
    n_act := n_act + 1;
  end loop;
  v := public.race_advance_core(p_event);
  perform race_sim.check_invariants(p_event, coalesce((v ->> 'race_ms')::bigint, t));
  insert into race_sim.ticks (event_id, ticks, actions) values (p_event, 1, n_act)
  on conflict (event_id) do update set ticks = race_sim.ticks.ticks + 1, actions = race_sim.ticks.actions + n_act;
end $$;

grant select on race_sim.script to anon, authenticated, service_role;

-- boolean form for race_test.ok(): raises with the violated invariant, otherwise true — and is only true when there is something to check
create function race_sim.invariants_hold(p_event uuid, p_race_ms bigint) returns boolean language plpgsql as $$
begin
  perform race_sim.check_invariants(p_event, p_race_ms);
  return exists (select 1 from public.race_station_results where event_id = p_event and status <> 'VOID_DNS');
end $$;


-- ---------------------------------------------------------------------------------------------------------------------
-- Sparse regime: NO device ticks. The clock jumps from one scripted action (or one reconnection) to the next; the only
-- thing that ever advances the race is the catch-up every state-changing RPC performs first — exactly what happens live
-- when every browser / judge / station screen disconnects and a device comes back later.
-- ---------------------------------------------------------------------------------------------------------------------
create function race_sim.step_sparse(p_event uuid, p_actor uuid, p_to_ms bigint, p_gap_ms bigint)
returns void language plpgsql as $$
declare
  t bigint := coalesce(public.race_now_ms(p_event), 0);
  nxt bigint;
  s record;
  n_act int := 0;
begin
  if t >= p_to_ms or exists (select 1 from public.race_clock where event_id = p_event and finished_at is not null) then return; end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  select min(at_ms) into nxt from race_sim.script where event_id = p_event and not done and at_ms > t;
  t := least(coalesce(nxt, p_to_ms), t + p_gap_ms, p_to_ms);
  perform race_sim.travel_to(p_event, t);
  for s in select * from race_sim.script where event_id = p_event and not done and at_ms <= t order by at_ms, seq loop
    perform race_sim.exec(p_event, s.action, s.arg);
    update race_sim.script set done = true where event_id = p_event and seq = s.seq;
    n_act := n_act + 1;
  end loop;
  insert into race_sim.ticks (event_id, ticks, actions) values (p_event, 0, n_act)
  on conflict (event_id) do update set actions = race_sim.ticks.actions + n_act;
end $$;

-- A device reconnects at the current race time: it asks for the dashboard (which settles the race) — nothing else.
create function race_sim.reconnect(p_event uuid, p_actor uuid) returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  return public.race_control_state(p_event);
end $$;

-- Canonical picture of an event's state, free of anything that legitimately differs between two runs (ids, real
-- wall-clock time, which device noticed what). Official times are expressed relative to START EVENT and rounded to the
-- second (the two runs differ only by the sub-second real time the SQL itself takes).
create function race_sim.digest(p_event uuid) returns text language sql as $$
  with c as (select started_at from public.race_clock where event_id = p_event),
  athletes as (
    select r.race_number, r.race_status::text st,
           (select h.number || ':' || s.slot_index || ':' || s.status || ':' || s.is_overflow || ':' ||
                   coalesce(round(extract(epoch from (s.started_at - (select started_at from c))))::text, '-') ||  ':' || coalesce(round(extract(epoch from (s.bound_at - (select started_at from c))))::text, '-')
              from public.race_start_slots s join public.race_heats h on h.id = s.heat_id
             where s.registration_id = r.id order by s.slot_index desc, s.id limit 1) slot,
           (select string_agg(st.number || ':' || x.window_start_race_ms || ':' || x.window_end_race_ms || ':' || x.status || ':' ||
                              coalesce(round(extract(epoch from (x.locked_at - (select started_at from c))))::text, '-'), ',' order by st.number)
              from public.race_station_results x join public.race_stations st on st.id = x.station_id where x.registration_id = r.id) res,
           coalesce(round(extract(epoch from (r.pushup_style_locked_at - (select started_at from c))))::text, '-') pu,
           (select string_agg(ci.kind::text, ',') from public.race_check_ins ci where ci.registration_id = r.id and ci.voided_by_correction_id is null) ck
      from public.race_registrations r where r.event_id = p_event
  ),
  heats as (select h.number, h.status::text st, coalesce(h.anchor_race_ms::text, '-') an, coalesce(h.planned_slot_count::text, '-') pc from public.race_heats h where h.event_id = p_event),
  slots as (select h.number hn, s.slot_index, s.status::text st, s.is_overflow ov from public.race_start_slots s join public.race_heats h on h.id = s.heat_id where s.event_id = p_event)
  select md5(
    coalesce((select string_agg(race_number || '|' || st || '|' || coalesce(slot, '-') || '|' || coalesce(res, '-') || '|' || pu || '|' || coalesce(ck, '-'), E'\n' order by race_number) from athletes), '') || E'\n#' ||
    coalesce((select string_agg(number || '|' || st || '|' || an || '|' || pc, E'\n' order by number) from heats), '') || E'\n#' ||
    coalesce((select string_agg(hn || '|' || slot_index || '|' || st || '|' || ov, E'\n' order by hn, slot_index) from slots), '') || E'\n#' ||
    (select e.status::text || '|' || coalesce(round(extract(epoch from (k.finished_at - k.started_at)))::text, '-') from public.race_events e join public.race_clock k on k.event_id = e.id where e.id = p_event)
  )
$$;

-- The 50-athlete final scenario: built through the same RPCs a real event uses, then scripted.
--   6 heats (9,9,9,9,9,5); heat 5 is MANUAL and will never be started (it gets closed);
--   #5 never arrives · #14 arrives late mid-heat · #27 skipped · #30 DNF · #48 late (overflow slot) · #49 late (no slot)
--   five emergency pauses of different lengths · heat 5 closed without start at 2:30:00
create function race_sim.scenario_50(p_slug text, p_creator uuid) returns uuid language plpgsql as $$
declare
  ev uuid; i int; h int; reg uuid;
  heat_ids uuid[] := '{}';
begin
  perform set_config('request.jwt.claim.sub', p_creator::text, true);
  ev := public.race_create_event(p_slug, date '2026-12-21', 'THE NINTH', 'Africa/Cairo', timestamptz '2026-12-21 07:00:00+00');
  perform public.race_set_event_status(ev, 'REGISTRATION_OPEN');
  for i in 1..50 loop
    perform public.race_register_athlete(ev, 'Sim Athlete ' || i, '0155' || lpad(i::text, 7, '0'), null, 'male', date '1990-01-01', 'MEN', null, true,
                                         '{"name":"Family","phone":"01011112222"}'::jsonb);
  end loop;
  for i in 1..6 loop
    insert into public.race_heats (event_id, number) values (ev, i) returning id into reg;
    heat_ids := heat_ids || reg;
  end loop;
  for i in 1..50 loop
    h := case when i <= 45 then (i - 1) / 9 + 1 else 6 end;
    perform public.race_move_athlete_heat((select id from public.race_registrations where event_id = ev and race_number = 'N' || lpad(i::text, 3, '0')), heat_ids[h]);
  end loop;
  update public.race_heats set start_mode = 'MANUAL' where id = heat_ids[5];
  perform public.race_lock_heats(ev);
  for i in 1..50 loop
    if i not in (5, 14, 48, 49) then
      perform public.race_check_in((select id from public.race_registrations where event_id = ev and race_number = 'N' || lpad(i::text, 3, '0')));
    end if;
  end loop;
  perform public.race_start_event(ev);
  insert into race_sim.script (event_id, at_ms, action, arg)
  select ev, x.at_ms, x.action, case when x.kind = 'reg' then (select id::text from public.race_registrations where event_id = ev and race_number = 'N' || lpad(x.arg::text, 3, '0')) else x.arg::text end
    from (values
      (1200000::bigint, 'pause', '120000', 'raw'), (2970000, 'check_in', '14', 'reg'), (3900000, 'pause', '300000', 'raw'),
      (5100000, 'pause', '20000', 'raw'), (5400000, 'pause', '45000', 'raw'), (6250000, 'skip', '27', 'reg'), (7920000, 'dnf', '30', 'reg'),
      (8000000, 'pause', '10000', 'raw'), (9000000, 'close_heat', '5', 'raw'), (9970000, 'check_in', '48', 'reg'), (9975000, 'check_in', '49', 'reg')
    ) x(at_ms, action, arg, kind);
  return ev;
end $$;
