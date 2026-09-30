-- THE NINTH — Station Screen (display-only).
--
-- A Station Screen is a TV mounted at one station. It is an account with the STATION_SCREEN role bound to that station and it can do
-- exactly one thing: call race_station_screen(). It cannot read result / ledger tables directly, cannot score, pause, skip, edit or open any
-- other station. Everything it shows comes from the authoritative race engine:
--
--   * the screen is sent AUTHORITATIVE RACE-TIME TIMESTAMPS (window start / end / scoring end, in race ms) plus the server's current race
--     time; the browser only counts DOWN to them (display-only) and re-derives its state from the next answer;
--   * after ANY outage the first successful call returns the correct current state — there is nothing on the device to "resume";
--   * the payload holds no personal data: a race code and a category, never a name, phone, e-mail or database id.
--
-- The call settles the race exactly like every other read (race_advance_core is idempotent and writes only what the arithmetic already
-- dictates). It never records an action, never changes a score and never creates a race event on behalf of the screen.

-- The screen no longer reads results directly (it uses the RPC): judges and race control keep their access.
drop policy if exists "race station results visible" on race_station_results;
create policy "race station results visible" on race_station_results for select to authenticated
  using (
    race_is_control(event_id)
    or race_has_role(event_id, array['JUDGE']::race_role[], station_id)
    or race_is_self_registration(registration_id)
  );

-- A Station Screen reads NO registration or start-slot rows (race codes, statuses, heats of the whole event): it only calls race_station_screen().
-- Judges keep the Phase 3 decision (they see race codes).
drop policy if exists "race registrations visible" on race_registrations;
create policy "race registrations visible" on race_registrations for select to authenticated
  using (race_is_ops(event_id) or race_has_role(event_id, array['JUDGE']::race_role[]) or race_is_self_registration(id));
drop policy if exists "race start slots visible" on race_start_slots;
create policy "race start slots visible" on race_start_slots for select to authenticated
  using (race_is_ops(event_id) or race_has_role(event_id, array['JUDGE']::race_role[]));

create or replace function race_station_screen(p_event_id uuid, p_station_number int)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e public.race_events;
  st public.race_stations;
  clk public.race_clock;
  cur record;
  nxt record;
  v_now bigint;
  v_ts timestamptz := clock_timestamp();
  v_served int;
  v_planned bigint;
  v_tally jsonb;
begin
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  if st.id is null then
    raise exception 'RACE_NOT_FOUND: no such station' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(p_event_id) is not true
     and public.race_has_role(p_event_id, array['STATION_SCREEN', 'JUDGE']::public.race_role[], st.id) is not true then
    raise exception 'RACE_FORBIDDEN: this screen is not assigned to that station' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  v_now := public.race_ms_from_clock(clk.started_at, clk.paused_at, clk.paused_total_ms, v_ts);

  -- who is at this station now: derived from the window arithmetic; withdrawn / absent athletes are not shown
  select sr.id, sr.window_start_race_ms ws, sr.window_end_race_ms we, r.race_number, c.code as category_code
    into cur
    from public.race_station_results sr
    join public.race_registrations r on r.id = sr.registration_id
    join public.race_categories c on c.id = r.category_id
   where sr.station_id = st.id and v_now is not null
     and sr.status not in ('VOID_DNS', 'NOT_REACHED')
     and r.race_status not in ('DNF', 'MISSED_START', 'WITHDRAWN')
     and sr.window_start_race_ms <= v_now and v_now < sr.window_end_race_ms + e.transition_ms
   order by sr.window_start_race_ms limit 1;
  if cur.id is not null then
    v_tally := public.race_result_tally(cur.id);   -- pure derivation from the ledger; nothing is written
  end if;

  -- who arrives next: the earliest bound athlete whose window here has not opened yet
  select h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms ws,
         r.race_number, c.code as category_code
    into nxt
    from public.race_start_slots sl
    join public.race_heats h on h.id = sl.heat_id
    join public.race_registrations r on r.id = sl.registration_id
    join public.race_categories c on c.id = r.category_id
   where sl.event_id = p_event_id and sl.status = 'BOUND' and v_now is not null
     and h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms > v_now
   order by 1 limit 1;

  -- a planned slot that is not bound to anybody yet (its athlete is announced 60 s before the start)
  select min(h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms)
    into v_planned
    from public.race_start_slots sl join public.race_heats h on h.id = sl.heat_id
   where sl.event_id = p_event_id and sl.status = 'OPEN' and v_now is not null
     and h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms > v_now;

  select count(*)::int into v_served from public.race_station_results z
   where z.station_id = st.id and z.status = 'LOCKED';

  return jsonb_build_object(
    'server_time', v_ts,
    'event', jsonb_build_object('name', e.name),
    'station', jsonb_build_object('number', st.number, 'name', st.name, 'is_last', st.number = 9),
    'clock', jsonb_build_object('started', clk.started_at is not null, 'paused', clk.paused_at is not null, 'finished', clk.finished_at is not null,
                                'race_ms', v_now, 'version', clk.version),
    'timing', jsonb_build_object('work_ms', e.work_ms, 'transition_ms', e.transition_ms, 'get_ready_ms', e.announce_lead_ms),
    'current', case when cur.id is null then null else jsonb_build_object(
        'race_number', cur.race_number, 'category_code', cur.category_code,
        'window_start_ms', cur.ws, 'window_end_ms', cur.we, 'scoring_end_ms', cur.we + e.transition_ms,
        'scoring_type', v_tally ->> 'scoring_type', 'score', v_tally -> 'score') end,
    'upcoming', case when nxt.ws is null then null else jsonb_build_object(
        'race_number', nxt.race_number, 'category_code', nxt.category_code, 'window_start_ms', nxt.ws) end,
    'planned_next_ms', v_planned,
    'served_any', v_served > 0);
end;
$$;
revoke execute on function race_station_screen(uuid, int) from public, anon;
grant execute on function race_station_screen(uuid, int) to authenticated;

-- Realtime: a change of the race clock (START / PAUSE / RESUME / FINISH) reaches every screen instantly. The clock table is public
-- configuration (no personal data). Screens still re-derive everything from race_station_screen(); a missed message costs nothing.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'race_clock') then
    alter publication supabase_realtime add table public.race_clock;
  end if;
end $$;
