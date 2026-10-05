-- FINAL VALIDATION FIX — the score tally must be DETERMINISTIC when two actions carry the same race millisecond.
--
-- Found by the final end-to-end simulation: a judge device that comes back online flushes its queue, so e.g. HOLD_BREAK and HOLD_RESUME (or a LAP and a
-- PENALTY, or two TECHNIQUE scores) can be stamped with the SAME server_race_ms. The tally ordered ties by the random row id, so the same ledger could score
-- differently from one recomputation to the next (hold 168,410 ms vs 168,688 ms; laps 6 vs 7). Ties now follow the order the server actually received
-- the actions (server_received_at is a clock_timestamp, unique per call), then the id only as a last resort.
-- Only the ORDER BY changes; the function is otherwise identical to the one in 20260930000005.
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
  v_dist numeric;
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
     order by e.server_race_ms, e.server_received_at, e.id
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

  -- ROWING: the score is the distance a judge CONFIRMED from the photographed display, or (if one exists) the latest Master/Event Manager
  -- correction that cites that evidence. Nothing else — no tap, no typed number — can produce it.
  select coalesce(
           (select (c.new_value #>> '{}')::numeric from public.race_result_corrections c
             where c.station_result_id = p_result_id and c.field = 'rowing_distance_m' order by c.corrected_at desc, c.id desc limit 1),
           (select o.confirmed_distance_m from public.race_ocr_records o where o.station_result_id = p_result_id and o.status = 'CONFIRMED' limit 1))
    into v_dist;

  v_score := case rule.scoring_type
    when 'REPS' then v_reps
    when 'CONVERTED_REPS' then case when reg.pushup_style = 'KNEE' then floor(v_reps / coalesce(nullif(rule.rule ->> 'knee_ratio', '')::numeric, 3)) else v_reps end
    when 'LAPS' then v_laps
    when 'HOLD_MS' then v_hold
    when 'DISTANCE_M' then v_dist
    else null end;

  return jsonb_build_object('reps', v_reps, 'no_reps', v_no, 'laps', v_laps, 'penalty', v_pen, 'hold_ms', v_hold,
                            'technique', v_tech, 'pending_review', v_pending, 'rejected', v_rejected,
                            'scoring_type', rule.scoring_type, 'score', v_score);
end;
$$;


revoke execute on function race_result_tally(uuid) from public, anon, authenticated;
