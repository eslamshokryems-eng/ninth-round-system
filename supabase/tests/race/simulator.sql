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

create function race_sim.travel_to(p_event uuid, p_race_ms bigint) returns void language plpgsql as $$
declare c public.race_clock;
begin
  select * into c from public.race_clock where event_id = p_event;
  if c.paused_at is not null then raise exception 'race_sim: cannot travel while paused'; end if;
  update public.race_clock
     set started_at = clock_timestamp() - make_interval(secs => (p_race_ms + c.paused_total_ms) / 1000.0)
   where event_id = p_event;
end $$;

-- Shifting BOTH started_at and paused_at (and the pause row) earlier by X keeps the frozen race time
-- identical but makes the pause last X longer — exactly a pause of X wall-clock time.
create function race_sim.age_pause(p_event uuid, p_wall_ms bigint) returns void language plpgsql as $$
begin
  alter table public.race_pauses disable trigger trg_race_pauses_guard;
  update public.race_pauses set paused_at = paused_at - make_interval(secs => p_wall_ms / 1000.0)
   where event_id = p_event and resumed_at is null;
  alter table public.race_pauses enable trigger trg_race_pauses_guard;
  update public.race_clock
     set started_at = started_at - make_interval(secs => p_wall_ms / 1000.0), paused_at = paused_at - make_interval(secs => p_wall_ms / 1000.0)
   where event_id = p_event;
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
      select id into v_slot from public.race_start_slots where registration_id = p_arg::uuid and status in ('BOUND', 'STARTED');
      perform public.race_skip_athlete(v_slot, 'simulated: athlete not ready');
    when 'dnf' then perform public.race_mark_dnf(p_arg::uuid, 'simulated: athlete withdrew');
    when 'pause' then
      perform public.race_pause(p_event, 'simulated emergency pause');
      perform race_sim.age_pause(p_event, p_arg::bigint);
      perform public.race_resume(p_event);
    else raise exception 'race_sim: unknown action %', p_action;
  end case;
end $$;

-- Runs the engine from the current race time to p_to_ms in p_step_ms steps as p_actor (a user id with the needed rights).
create function race_sim.run(p_event uuid, p_actor uuid, p_to_ms bigint, p_step_ms bigint)
returns table (ticks int, actions int, final_race_ms bigint) language plpgsql as $$
declare
  t bigint := coalesce(public.race_now_ms(p_event), 0);
  v jsonb;
  s record;
  n_ticks int := 0;
  n_act int := 0;
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  while t < p_to_ms loop
    t := least(t + p_step_ms, p_to_ms);
    perform race_sim.travel_to(p_event, t);
    for s in select * from race_sim.script where event_id = p_event and not done and at_ms <= t order by at_ms, seq loop
      perform race_sim.exec(p_event, s.action, s.arg);
      update race_sim.script set done = true where event_id = p_event and seq = s.seq;
      n_act := n_act + 1;
    end loop;
    v := public.race_advance_core(p_event);
    perform race_sim.check_invariants(p_event, coalesce((v ->> 'race_ms')::bigint, t));
    n_ticks := n_ticks + 1;
    exit when (v ->> 'event_finished')::boolean is true;
  end loop;
  return query select n_ticks, n_act, public.race_now_ms(p_event);
end $$;

grant select on race_sim.script to anon, authenticated, service_role;

-- boolean form for race_test.ok(): raises with the violated invariant, otherwise true — and is only true when there is something to check
create function race_sim.invariants_hold(p_event uuid, p_race_ms bigint) returns boolean language plpgsql as $$
begin
  perform race_sim.check_invariants(p_event, p_race_ms);
  return exists (select 1 from public.race_station_results where event_id = p_event and status <> 'VOID_DNS');
end $$;
