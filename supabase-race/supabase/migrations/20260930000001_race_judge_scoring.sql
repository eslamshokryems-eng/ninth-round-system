-- THE NINTH — judge scoring.
--
--   race_record_action()    THE judge RPC. One call = one action (REP, NO_REP, LAP, PENALTY, HOLD_*, TECHNIQUE_SCORE, VOID).
--                           * idempotent: the client-generated client_event_id is the key; a retry, a double tap or a device
--                             replaying its queue returns the ORIGINAL row (duplicate = true) and writes nothing
--                           * server time is the only time: server_race_ms is stamped here (race clock, pause-aware)
--                           * window rules are exact and have no grace period: performance input is accepted while the
--                             station window is ACTIVE (start <= t < start + 3:00); technique until the 0:30 scoring window ends
--                           * an action that arrives too late is KEPT, never dropped: REJECTED (with a code) — or, if it came
--                             from an offline queue and the device says it happened inside the window, PENDING_MASTER_REVIEW
--                           * only the judge bound to that station (or Master Control / Event Manager) may score it
--   race_review_action()    Master Control decides a PENDING_MASTER_REVIEW action (APPROVED / REJECTED, reason required)
--   race_station_view()     what a judge / station screen shows: current athlete, window, remaining time, live tally
--   race_result_tally()     the score is DERIVED from the ledger (never typed in): re-computed after every accepted change
--
-- The ledger (race_performance_events) is append-only. Corrections are new rows (VOID, reviews), never edits.

-- ---------------------------------------------------------------------------
-- Score derivation (internal)
-- ---------------------------------------------------------------------------

create or replace function race_result_tally(p_result_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_station_results;
  reg public.race_registrations;
  rule public.race_station_rules;
  v_now bigint;
  v_end bigint;
  v_reps numeric := 0;
  v_no numeric := 0;
  v_laps numeric := 0;
  v_pen numeric := 0;
  v_hold bigint := 0;
  v_tech numeric;
  v_holding boolean := false;
  v_ended boolean := false;
  v_breaks int := 0;
  v_max_breaks int;
  v_since bigint;
  v_pending int;
  v_rejected int;
  v_score numeric;
  ev record;
begin
  select * into r from public.race_station_results where id = p_result_id;
  select * into reg from public.race_registrations where id = r.registration_id;
  select * into rule from public.race_station_rules where station_id = r.station_id and category_id = reg.category_id;
  v_now := public.race_now_ms(r.event_id);
  v_end := least(coalesce(v_now, r.window_end_race_ms), r.window_end_race_ms);

  v_max_breaks := nullif(rule.rule ->> 'max_breaks', '')::int;
  for ev in
    select e.id, e.type, e.value, e.server_race_ms
      from public.race_performance_events e
      left join public.race_action_reviews rv on rv.performance_event_id = e.id
     where e.station_result_id = p_result_id
       and (e.status = 'ACCEPTED' or (e.status = 'PENDING_MASTER_REVIEW' and rv.decision = 'APPROVED'))
       and not exists (select 1 from public.race_performance_events v
                         left join public.race_action_reviews vr on vr.performance_event_id = v.id
                        where v.voids_event_id = e.id and v.type = 'VOID'
                          and (v.status = 'ACCEPTED' or (v.status = 'PENDING_MASTER_REVIEW' and vr.decision = 'APPROVED')))
       and e.type <> 'VOID'
     order by e.server_race_ms, e.id
  loop
    case ev.type
      when 'REP' then v_reps := v_reps + coalesce(ev.value, 1);
      when 'NO_REP' then v_no := v_no + 1;
      when 'LAP' then v_laps := v_laps + coalesce(ev.value, 1);
      when 'PENALTY' then
        -- F-4: a penalty cancels the last completed lap; with no lap done it cancels nothing; laps never go negative
        v_pen := v_pen + 1;
        if rule.scoring_type = 'LAPS' and v_laps > 0 then v_laps := v_laps - 1; end if;
      when 'HOLD_START', 'HOLD_RESUME' then
        if not v_holding and not v_ended then v_holding := true; v_since := least(ev.server_race_ms, v_end); end if;
      when 'HOLD_BREAK' then
        if v_holding then
          v_hold := v_hold + greatest(least(ev.server_race_ms, v_end) - v_since, 0);
          v_holding := false;
          v_breaks := v_breaks + 1;
          if v_max_breaks is not null and v_breaks > v_max_breaks then v_ended := true; end if;   -- the exit beyond the limit ends the hold
        end if;
      when 'TECHNIQUE_SCORE' then v_tech := ev.value;
      else null;
    end case;
  end loop;
  if v_holding then v_hold := v_hold + greatest(v_end - v_since, 0); end if;

  select count(*) filter (where e.status = 'PENDING_MASTER_REVIEW' and rv.id is null),
         count(*) filter (where e.status = 'REJECTED' or rv.decision = 'REJECTED')
    into v_pending, v_rejected
    from public.race_performance_events e left join public.race_action_reviews rv on rv.performance_event_id = e.id
   where e.station_result_id = p_result_id;

  v_score := case rule.scoring_type
    when 'REPS' then v_reps
    when 'CONVERTED_REPS' then case when reg.pushup_style = 'KNEE' then floor(v_reps / coalesce(nullif(rule.rule ->> 'knee_ratio', '')::numeric, 3)) else v_reps end
    when 'LAPS' then v_laps
    when 'HOLD_MS' then v_hold
    else null end;

  return jsonb_build_object('reps', v_reps, 'no_reps', v_no, 'laps', v_laps, 'penalty', v_pen, 'hold_ms', v_hold,
                            'technique', v_tech, 'pending_review', v_pending, 'rejected', v_rejected,
                            'scoring_type', rule.scoring_type, 'score', v_score);
end;
$$;
revoke execute on function race_result_tally(uuid) from public, anon, authenticated;

-- Re-computes and stores the derived tally + official score of a result. Internal.
create or replace function race_recompute_result(p_result_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_t jsonb := public.race_result_tally(p_result_id);
begin
  update public.race_station_results
     set derived = v_t,
         official_score = nullif(v_t ->> 'score', '')::numeric,
         technique_score = case when (v_t ->> 'technique') is null then technique_score else (v_t ->> 'technique')::numeric end,
         derived_version = derived_version + 1
   where id = p_result_id;
  return v_t;
end;
$$;
revoke execute on function race_recompute_result(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- THE judge RPC
-- ---------------------------------------------------------------------------

create or replace function race_record_action(
  p_station_result_id uuid,
  p_type public.race_action_type,
  p_client_event_id uuid,
  p_value numeric default null,
  p_origin public.race_action_origin default 'ONLINE',
  p_device_recorded_at timestamptz default null,
  p_device_race_ms bigint default null,
  p_device_seq bigint default null,
  p_device_id uuid default null,
  p_voids_event_id uuid default null
)
returns table (performance_event_id uuid, status public.race_action_status, rejection_code text, server_race_ms bigint, duplicate boolean, tally jsonb)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.race_station_results;
  st public.race_stations;
  x public.race_performance_events;
  v_now bigint;
  v_status public.race_action_status;
  v_code text;
  v_is_perf boolean := p_type in ('REP', 'NO_REP', 'LAP', 'PENALTY', 'HOLD_START', 'HOLD_BREAK', 'HOLD_RESUME', 'VOID');
  v_tally jsonb;
  vt public.race_performance_events;
begin
  if p_client_event_id is null then
    raise exception 'RACE_CLIENT_EVENT_REQUIRED: every action carries a client-generated id' using errcode = 'check_violation';
  end if;
  select * into r from public.race_station_results where id = p_station_result_id;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(r.event_id) is not true
     and public.race_has_role(r.event_id, array['JUDGE']::public.race_role[], r.station_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the judge of this station (or race control) can score it' using errcode = 'insufficient_privilege';
  end if;
  if p_type in ('OCR_CAPTURE', 'OCR_CONFIRM', 'OCR_RETAKE') then
    raise exception 'RACE_ACTION_NOT_SUPPORTED: OCR capture has its own flow' using errcode = 'check_violation';
  end if;
  if p_type = 'TECHNIQUE_SCORE' and (p_value is null or p_value < 0 or p_value > 10) then
    raise exception 'RACE_INVALID_VALUE: a technique score is between 0 and 10' using errcode = 'check_violation';
  end if;
  if p_type in ('REP', 'LAP', 'PENALTY') and p_value is not null and (p_value <= 0 or p_value > 1000) then
    raise exception 'RACE_INVALID_VALUE' using errcode = 'check_violation';
  end if;
  if p_origin = 'OFFLINE_QUEUE' and (p_device_recorded_at is null or p_device_seq is null) then
    raise exception 'RACE_OFFLINE_METADATA_REQUIRED: a replayed action must carry its device time and sequence number' using errcode = 'check_violation';
  end if;

  -- 1. a retry / replay: answer with the ORIGINAL row, write nothing
  select * into x from public.race_performance_events e where e.client_event_id = p_client_event_id;
  if x.id is not null then
    if x.station_result_id <> p_station_result_id or x.type <> p_type or x.judge_profile_id <> auth.uid() then
      raise exception 'RACE_IDEMPOTENCY_CONFLICT: that client_event_id was already used for a different action' using errcode = 'unique_violation';
    end if;
    return query select x.id, x.status, x.rejection_code, x.server_race_ms, true, public.race_result_derived(x.station_result_id);
    return;
  end if;

  -- 2. settle the race, then serialise everything that touches this result
  perform public.race_advance_core(r.event_id);
  select * into r from public.race_station_results where id = p_station_result_id for update;
  select * into st from public.race_stations where id = r.station_id;
  select * into x from public.race_performance_events e where e.client_event_id = p_client_event_id;
  if x.id is not null then
    return query select x.id, x.status, x.rejection_code, x.server_race_ms, true, public.race_result_derived(x.station_result_id);
    return;
  end if;

  v_now := public.race_now_ms(r.event_id);
  if v_now is null then
    raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation';
  end if;

  -- 3. the exact window rules (no grace period)
  if p_type = 'TECHNIQUE_SCORE' and not st.has_technique then
    v_status := 'REJECTED'; v_code := 'NO_TECHNIQUE_AT_STATION';
  elsif v_is_perf then
    if r.status = 'ACTIVE' then
      v_status := 'ACCEPTED';
    elsif r.status = 'SCHEDULED' then
      v_status := 'REJECTED'; v_code := 'NOT_STARTED';
    elsif r.status in ('VOID_DNS', 'NOT_REACHED') then
      v_status := 'REJECTED'; v_code := 'ATHLETE_NOT_RACING';
    else
      v_status := 'REJECTED'; v_code := 'WINDOW_CLOSED';
    end if;
  else
    if r.status in ('ACTIVE', 'SCORING') then
      v_status := 'ACCEPTED';
    elsif r.status = 'SCHEDULED' then
      v_status := 'REJECTED'; v_code := 'NOT_STARTED';
    elsif r.status in ('VOID_DNS', 'NOT_REACHED') then
      v_status := 'REJECTED'; v_code := 'ATHLETE_NOT_RACING';
    else
      v_status := 'REJECTED'; v_code := 'WINDOW_CLOSED';
    end if;
  end if;

  -- a VOID must point at an accepted, not-yet-voided action of the SAME result
  if p_type = 'VOID' then
    select * into vt from public.race_performance_events e where e.id = p_voids_event_id;
    if vt.id is null or vt.station_result_id <> r.id or vt.type = 'VOID' then
      raise exception 'RACE_VOID_TARGET_INVALID: a VOID must name an action of this same result' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.race_performance_events e where e.type = 'VOID' and e.voids_event_id = vt.id and e.status <> 'REJECTED') then
      raise exception 'RACE_VOID_TARGET_INVALID: that action is already voided' using errcode = 'check_violation';
    end if;
  elsif p_voids_event_id is not null then
    raise exception 'RACE_VOID_TARGET_INVALID: only a VOID names another action' using errcode = 'check_violation';
  end if;

  -- a replayed offline action that was lost to the lock but happened inside the window goes to Master Control
  if v_status = 'REJECTED' and v_code = 'WINDOW_CLOSED' and p_origin = 'OFFLINE_QUEUE'
     and p_device_race_ms is not null and p_device_race_ms >= r.window_start_race_ms
     and p_device_race_ms < (case when v_is_perf then r.window_end_race_ms else r.window_end_race_ms + 30000 end) then
    v_status := 'PENDING_MASTER_REVIEW'; v_code := null;
  end if;

  begin
    insert into public.race_performance_events
      (event_id, station_id, station_result_id, type, value, voids_event_id, client_event_id, device_id, device_seq, origin,
       device_recorded_at, device_race_ms, server_race_ms, judge_profile_id, status, rejection_code)
    values
      (r.event_id, r.station_id, r.id, p_type, p_value, p_voids_event_id, p_client_event_id, p_device_id, p_device_seq, p_origin,
       p_device_recorded_at, p_device_race_ms, v_now, auth.uid(), v_status, v_code)
    returning * into x;
  exception
    when unique_violation then
      select * into x from public.race_performance_events e where e.client_event_id = p_client_event_id;
      if x.id is not null then
        return query select x.id, x.status, x.rejection_code, x.server_race_ms, true, public.race_result_derived(x.station_result_id);
        return;
      end if;
      raise exception 'RACE_DEVICE_SEQ_CONFLICT: that device sequence number was already used' using errcode = 'unique_violation';
  end;

  v_tally := public.race_recompute_result(r.id);
  if v_status <> 'ACCEPTED' then
    perform public.race_audit(case when v_status = 'REJECTED' then 'race.action.rejected' else 'race.action.pending_review' end, r.event_id,
      'race_performance_events', x.id, null,
      jsonb_build_object('type', p_type, 'result_id', r.id, 'status', v_status, 'code', v_code, 'server_race_ms', v_now, 'device_race_ms', p_device_race_ms), '{}'::jsonb);
  end if;
  return query select x.id, x.status, x.rejection_code, x.server_race_ms, false, v_tally;
end;
$$;

-- helper: the stored tally of a result (used for duplicate answers)
create or replace function race_result_derived(p_result_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$ select derived from public.race_station_results where id = p_result_id $$;
revoke execute on function race_result_derived(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Master Control decides a pending (offline) action
-- ---------------------------------------------------------------------------

create or replace function race_review_action(p_performance_event_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  x public.race_performance_events;
  v_tally jsonb;
begin
  select * into x from public.race_performance_events where id = p_performance_event_id;
  if x.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(x.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: only Master Control or the Event Manager can review an action' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'RACE_INVALID_VALUE: decision must be APPROVED or REJECTED' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  perform 1 from public.race_station_results where id = x.station_result_id for update;
  if x.status <> 'PENDING_MASTER_REVIEW' then
    raise exception 'RACE_NOT_PENDING: only a pending action can be reviewed' using errcode = 'check_violation';
  end if;
  begin
    insert into public.race_action_reviews (event_id, performance_event_id, decision, reason, reviewed_by)
    values (x.event_id, x.id, p_decision, trim(p_reason), auth.uid());
  exception when unique_violation then
    raise exception 'RACE_ALREADY_REVIEWED: this action already has a decision' using errcode = 'check_violation';
  end;
  v_tally := public.race_recompute_result(x.station_result_id);
  perform public.race_audit('race.action.review', x.event_id, 'race_performance_events', x.id,
    jsonb_build_object('status', x.status), jsonb_build_object('decision', p_decision),
    jsonb_build_object('reason', trim(p_reason), 'type', x.type, 'result_id', x.station_result_id));
  return v_tally;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a judge / station screen shows. Derived on read (settles the race first).
-- ---------------------------------------------------------------------------

create or replace function race_station_view(p_event_id uuid, p_station_number int)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  st public.race_stations;
  e public.race_events;
  clk public.race_clock;
  cur record;
  nxt record;
  v_now bigint;
  v_ts timestamptz := clock_timestamp();
begin
  select * into st from public.race_stations where event_id = p_event_id and number = p_station_number;
  if st.id is null then
    raise exception 'RACE_NOT_FOUND: no such station' using errcode = 'no_data_found';
  end if;
  if public.race_is_control(p_event_id) is not true
     and public.race_has_role(p_event_id, array['JUDGE', 'STATION_SCREEN']::public.race_role[], st.id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  v_now := public.race_ms_from_clock(clk.started_at, clk.paused_at, clk.paused_total_ms, v_ts);

  select sr.id, sr.window_start_race_ms ws, sr.window_end_race_ms we, sr.status, sr.derived, r.race_number, a.full_name, c.code as category_code,
         (select rl.movement from public.race_station_rules rl where rl.station_id = sr.station_id and rl.category_id = r.category_id) movement
    into cur
    from public.race_station_results sr
    join public.race_registrations r on r.id = sr.registration_id
    join public.race_athletes a on a.id = r.athlete_id
    join public.race_categories c on c.id = r.category_id
   where sr.station_id = st.id and sr.status in ('ACTIVE', 'SCORING') and v_now is not null
   order by sr.window_start_race_ms limit 1;

  -- the next athlete to arrive here: the earliest BOUND slot whose station window has not opened yet
  select h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms ws, r.race_number, a.full_name
    into nxt
    from public.race_start_slots sl
    join public.race_heats h on h.id = sl.heat_id
    join public.race_registrations r on r.id = sl.registration_id
    join public.race_athletes a on a.id = r.athlete_id
   where sl.event_id = p_event_id and sl.status = 'BOUND' and v_now is not null
     and h.anchor_race_ms + sl.slot_index::bigint * e.start_interval_ms + (st.number - 1)::bigint * e.start_interval_ms > v_now
   order by 1 limit 1;

  return jsonb_build_object(
    'server_time', v_ts,
    'station', jsonb_build_object('number', st.number, 'name', st.name, 'has_technique', st.has_technique),
    'clock', jsonb_build_object('started', clk.started_at is not null, 'paused', clk.paused_at is not null, 'finished', clk.finished_at is not null,
                                'race_ms', v_now, 'version', clk.version),
    'current', case when cur.id is null then null else jsonb_build_object(
        'result_id', cur.id, 'race_number', cur.race_number, 'full_name', cur.full_name, 'category_code', cur.category_code, 'movement', cur.movement,
        'state', case when v_now < cur.we then 'WORK' else 'TRANSITION' end,
        'window_start_ms', cur.ws, 'window_end_ms', cur.we, 'scoring_end_ms', cur.we + e.transition_ms,
        'remaining_ms', case when v_now < cur.we then cur.we - v_now else cur.we + e.transition_ms - v_now end,
        'tally', cur.derived) end,
    'next', case when nxt.ws is null then null else jsonb_build_object(
        'race_number', nxt.race_number, 'full_name', nxt.full_name, 'starts_in_ms', nxt.ws - v_now) end);
end;
$$;

revoke execute on function race_record_action(uuid, public.race_action_type, uuid, numeric, public.race_action_origin, timestamptz, bigint, bigint, uuid, uuid) from public, anon;
revoke execute on function race_review_action(uuid, text, text) from public, anon;
revoke execute on function race_station_view(uuid, int) from public, anon;
grant execute on function race_record_action(uuid, public.race_action_type, uuid, numeric, public.race_action_origin, timestamptz, bigint, bigint, uuid, uuid) to authenticated;
grant execute on function race_review_action(uuid, text, text) to authenticated;
grant execute on function race_station_view(uuid, int) to authenticated;
