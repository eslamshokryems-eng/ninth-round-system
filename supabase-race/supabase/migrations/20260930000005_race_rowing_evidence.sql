-- THE NINTH — Phase 10 (2/2): the Rowing (Station 09) evidence workflow.
--
--   judge photographs the display (after the 3:00 work window) -> OCR proposes a distance -> the judge CONFIRMS that proposal or RETAKES
--   -> only a confirmed distance becomes the official Station 09 score.   Nothing in this flow can move, extend or restart a time window.
--
--   * every attempt is a row in race_ocr_records: the original image path, the OCR raw output, extracted distance, confidence, processing
--     time and status are written once and never changed; a retake creates a NEW attempt, the old one is kept (RETAKEN)
--   * the judge cannot type or edit a distance: CONFIRM takes no distance — it confirms the stored proposal, and the database copies it
--   * a confirmation that reaches the server after the 0:30 transition becomes PENDING_REVIEW (Master Control decides)
--   * a Master Control / Event Manager correction is a ledger row citing the evidence (reason, user, time) — the OCR record is never rewritten
--   * evidence_state of a rowing result: PENDING_EVIDENCE -> (PENDING_MASTER_REVIEW) -> OFFICIAL; an unconfirmed result blocks OFFICIAL rankings

-- ---------------------------------------------------------------------------
-- Attempt columns
-- ---------------------------------------------------------------------------
alter table race_ocr_records
  add column client_capture_id uuid,
  add column attempt_no int not null default 1 check (attempt_no >= 1),
  add column capture_race_ms bigint,
  add column origin race_action_origin not null default 'ONLINE',
  add column device_id uuid references race_devices (id),
  add column device_seq bigint,
  add column device_recorded_at timestamptz,
  add column device_race_ms bigint,
  add column image_mime text,
  add column image_bytes int,
  add column image_sha256 text,
  add column ocr_status text not null default 'PENDING' check (ocr_status in ('PENDING', 'SUCCEEDED', 'LOW_CONFIDENCE', 'FAILED')),
  add column ocr_text text,
  add column ocr_engine text,
  add column ocr_processed_at timestamptz,
  add column ocr_submitted_by uuid references race_profiles (id),
  add column confirm_client_id uuid,
  add column confirmed_after_transition boolean not null default false,
  add column low_confidence_ack boolean not null default false,
  add column confirm_requested_by uuid references race_profiles (id),
  add column confirm_requested_at timestamptz,
  add column confirm_requested_race_ms bigint,
  add column retake_client_id uuid,
  add column retaken_by uuid references race_profiles (id),
  add column retaken_at timestamptz,
  add column retake_reason text,
  add column reviewed_by uuid references race_profiles (id),
  add column reviewed_at timestamptz,
  add column review_reason text;

create unique index uq_race_ocr_capture_id on race_ocr_records (client_capture_id) where client_capture_id is not null;
create unique index uq_race_ocr_confirm_id on race_ocr_records (confirm_client_id) where confirm_client_id is not null;
create unique index uq_race_ocr_retake_id on race_ocr_records (retake_client_id) where retake_client_id is not null;
create unique index uq_race_ocr_attempt_no on race_ocr_records (station_result_id, attempt_no);
-- one ACTIVE attempt per result at any time (a retake must close the current one first) — also the backstop against two simultaneous captures
create unique index uq_race_ocr_one_active on race_ocr_records (station_result_id) where status in ('CAPTURED', 'PENDING_REVIEW', 'CONFIRMED');
-- ... and at most one confirmed distance per result, ever
create unique index uq_race_ocr_one_confirmed on race_ocr_records (station_result_id) where status = 'CONFIRMED';

alter table race_result_corrections add column evidence_ocr_id uuid references race_ocr_records (id);

-- Rowing distance comes from the photographed display only (never from taps).
create or replace function race_guard_rowing_actions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.race_stations s where s.id = NEW.station_id and s.requires_ocr) then
    raise exception 'RACE_USE_OCR_EVIDENCE: a rowing distance comes from the photographed display, not from taps' using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
create trigger trg_race_rowing_no_taps before insert on race_performance_events for each row execute function race_guard_rowing_actions();

-- Configurable limits (defaults are also applied in code when a rule has none).
update race_station_rule_templates set rule = rule || '{"ocr_min_confidence": 0.60, "ocr_review_confidence": 0.85, "max_distance_m": 1500}'::jsonb where station_number = 9;
update race_station_rules set rule = rule || '{"ocr_min_confidence": 0.60, "ocr_review_confidence": 0.85, "max_distance_m": 1500}'::jsonb
 where station_id in (select id from race_stations where requires_ocr);

-- ---------------------------------------------------------------------------
-- Guard: what may change on an attempt, and when
-- ---------------------------------------------------------------------------
create or replace function race_guard_ocr_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ocr text[] := array['provider', 'raw_response', 'proposed_distance_m', 'confidence', 'ocr_status', 'ocr_text', 'ocr_engine', 'ocr_processed_at', 'ocr_submitted_by'];
  v_dec text[] := array['status', 'confirmed_distance_m', 'confirmed_by', 'confirmed_at', 'confirm_client_id', 'confirmed_after_transition', 'low_confidence_ack',
                        'confirm_requested_by', 'confirm_requested_at', 'confirm_requested_race_ms', 'retake_client_id', 'retaken_by', 'retaken_at', 'retake_reason',
                        'reviewed_by', 'reviewed_at', 'review_reason'];
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_NO_DELETE: OCR evidence is never deleted' using errcode = 'insufficient_privilege';
  end if;
  if OLD.status not in ('CAPTURED', 'PENDING_REVIEW') then
    raise exception 'RACE_APPEND_ONLY: OCR record % is already %', OLD.id, OLD.status using errcode = 'insufficient_privilege';
  end if;
  -- the evidence itself (image, capture metadata) never changes; the OCR output is written ONCE, while it is still PENDING
  if OLD.ocr_status = 'PENDING' then
    v_new := v_new - v_ocr; v_old := v_old - v_ocr;
  end if;
  if NEW.status = OLD.status then
    v_new := v_new - 'ocr_status'; v_old := v_old - 'ocr_status';          -- (already removed above while PENDING)
    if (to_jsonb(NEW) - v_ocr) is distinct from (to_jsonb(OLD) - v_ocr) then
      raise exception 'RACE_APPEND_ONLY: OCR evidence fields are immutable' using errcode = 'insufficient_privilege';
    end if;
  else
    if (v_new - v_dec) is distinct from (v_old - v_dec) then
      raise exception 'RACE_APPEND_ONLY: OCR evidence fields are immutable' using errcode = 'insufficient_privilege';
    end if;
    if not ((OLD.status = 'CAPTURED' and NEW.status in ('CONFIRMED', 'RETAKEN', 'PENDING_REVIEW'))
         or (OLD.status = 'PENDING_REVIEW' and NEW.status in ('CONFIRMED', 'REJECTED'))) then
      raise exception 'RACE_OCR_BAD_TRANSITION: % -> % is not allowed', OLD.status, NEW.status using errcode = 'check_violation';
    end if;
    if NEW.status = 'CONFIRMED' then
      -- the judge can never change the OCR number: the confirmed distance IS the proposal
      if NEW.proposed_distance_m is null or NEW.ocr_status = 'FAILED' or NEW.confirmed_distance_m is distinct from NEW.proposed_distance_m then
        raise exception 'RACE_OCR_SILENT_OVERWRITE: a confirmed distance must equal the OCR proposal; a different distance is a Master Control correction' using errcode = 'check_violation';
      end if;
      NEW.confirmed_at := clock_timestamp();
    elsif NEW.status = 'PENDING_REVIEW' then
      NEW.confirm_requested_at := clock_timestamp();
    elsif NEW.status = 'RETAKEN' then
      NEW.retaken_at := clock_timestamp();
    elsif NEW.status = 'REJECTED' then
      NEW.reviewed_at := clock_timestamp();
    end if;
    if NEW.status = 'CONFIRMED' and OLD.status = 'PENDING_REVIEW' then
      NEW.reviewed_at := clock_timestamp();
    end if;
  end if;
  if OLD.ocr_status = 'PENDING' and NEW.ocr_status <> 'PENDING' then
    NEW.ocr_processed_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------
create or replace function race_ocr_limits(p_result_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'min_confidence',    coalesce((rule.rule ->> 'ocr_min_confidence')::numeric, 0.60),
    'review_confidence', coalesce((rule.rule ->> 'ocr_review_confidence')::numeric, 0.85),
    'max_distance_m',    coalesce((rule.rule ->> 'max_distance_m')::int, 1500))
    from public.race_station_results r
    join public.race_registrations g on g.id = r.registration_id
    left join public.race_station_rules rule on rule.station_id = r.station_id and rule.category_id = g.category_id
   where r.id = p_result_id;
$$;
revoke execute on function race_ocr_limits(uuid) from public, anon, authenticated;

-- SUCCEEDED: readable and confident. LOW_CONFIDENCE: a number, but the judge must acknowledge it. FAILED: nothing usable — retake or a manual correction.
create or replace function race_ocr_classify(p_distance int, p_confidence numeric, p_limits jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_distance is null or p_distance < 0 or p_distance > (p_limits ->> 'max_distance_m')::int then 'FAILED'
    when p_confidence is null then 'LOW_CONFIDENCE'
    when p_confidence < (p_limits ->> 'min_confidence')::numeric then 'FAILED'
    when p_confidence < (p_limits ->> 'review_confidence')::numeric then 'LOW_CONFIDENCE'
    else 'SUCCEEDED' end;
$$;
revoke execute on function race_ocr_classify(int, numeric, jsonb) from public, anon, authenticated;

-- PENDING_EVIDENCE -> PENDING_MASTER_REVIEW -> OFFICIAL (NULL for a station that needs no evidence)
create or replace function race_evidence_state(p_result_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.race_station_results r join public.race_stations s on s.id = r.station_id where r.id = p_result_id and s.requires_ocr) then null
    when exists (select 1 from public.race_result_corrections c where c.station_result_id = p_result_id and c.field = 'rowing_distance_m') then 'OFFICIAL'
    when exists (select 1 from public.race_ocr_records o where o.station_result_id = p_result_id and o.status = 'CONFIRMED') then 'OFFICIAL'
    when exists (select 1 from public.race_ocr_records o where o.station_result_id = p_result_id and o.status = 'PENDING_REVIEW') then 'PENDING_MASTER_REVIEW'
    else 'PENDING_EVIDENCE' end;
$$;
revoke execute on function race_evidence_state(uuid) from public, anon, authenticated;

-- The score of a rowing result is now derived from confirmed evidence (see race_result_tally)
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

-- ---------------------------------------------------------------------------
-- 1. CAPTURE — the judge photographs the display. Idempotent by client_capture_id.
-- ---------------------------------------------------------------------------
create or replace function race_ocr_capture(
  p_station_result_id uuid, p_client_capture_id uuid, p_storage_path text, p_image_mime text, p_image_bytes int, p_image_sha256 text,
  p_origin public.race_action_origin default 'ONLINE', p_device_recorded_at timestamptz default null, p_device_race_ms bigint default null,
  p_device_seq bigint default null, p_device_id uuid default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_station_results;
  st public.race_stations;
  e public.race_events;
  a public.race_ocr_records;
  v_prev public.race_ocr_records;
  v_now bigint;
  v_prefix text;
  v_size numeric;
  v_found boolean;
begin
  if p_client_capture_id is null then
    raise exception 'RACE_CLIENT_EVENT_REQUIRED: every capture carries a client-generated id' using errcode = 'check_violation';
  end if;
  select * into r from public.race_station_results where id = p_station_result_id;
  if r.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(r.event_id) is not true
     and public.race_has_role(r.event_id, array['JUDGE']::public.race_role[], r.station_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the judge of this station (or race control) can capture its evidence' using errcode = 'insufficient_privilege';
  end if;
  select * into st from public.race_stations where id = r.station_id;
  if not st.requires_ocr then raise exception 'RACE_NOT_ROWING_STATION: only the rowing station uses photo evidence' using errcode = 'check_violation'; end if;
  if p_image_mime is null or p_image_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'RACE_OCR_BAD_IMAGE: a JPEG, PNG or WebP photo is required' using errcode = 'check_violation';
  end if;
  if p_image_bytes is null or p_image_bytes < 1 or p_image_bytes > 10485760 then
    raise exception 'RACE_OCR_BAD_IMAGE: the photo must be between 1 byte and 10 MB' using errcode = 'check_violation';
  end if;
  if p_image_sha256 is null or p_image_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'RACE_OCR_BAD_IMAGE: the photo needs its SHA-256 fingerprint' using errcode = 'check_violation';
  end if;
  v_prefix := r.event_id::text || '/rowing/' || r.id::text || '/';
  if p_storage_path is null or left(p_storage_path, length(v_prefix)) <> v_prefix or length(p_storage_path) > 300 or position('..' in p_storage_path) > 0 then
    raise exception 'RACE_OCR_BAD_PATH: evidence is stored under <event>/rowing/<result>/' using errcode = 'check_violation';
  end if;
  if p_origin = 'OFFLINE_QUEUE' and (p_device_recorded_at is null or p_device_seq is null) then
    raise exception 'RACE_OFFLINE_METADATA_REQUIRED: a replayed capture must carry its device time and sequence number' using errcode = 'check_violation';
  end if;

  -- a retry / replay of the same capture: answer with the original attempt, write nothing
  select * into a from public.race_ocr_records where client_capture_id = p_client_capture_id;
  if a.id is not null then
    if a.station_result_id <> p_station_result_id or a.storage_path <> p_storage_path or a.captured_by <> auth.uid() then
      raise exception 'RACE_IDEMPOTENCY_CONFLICT: that capture id was already used for a different photo' using errcode = 'unique_violation';
    end if;
    return jsonb_build_object('attempt_id', a.id, 'attempt_no', a.attempt_no, 'status', a.status, 'ocr_status', a.ocr_status, 'duplicate', true,
                              'capture_race_ms', a.capture_race_ms, 'after_transition', null);
  end if;

  perform public.race_advance_core(r.event_id);
  select * into r from public.race_station_results where id = p_station_result_id for update;     -- serialises everything on this result
  select * into e from public.race_events where id = r.event_id;
  select * into a from public.race_ocr_records where client_capture_id = p_client_capture_id;
  if a.id is not null then
    return jsonb_build_object('attempt_id', a.id, 'attempt_no', a.attempt_no, 'status', a.status, 'ocr_status', a.ocr_status, 'duplicate', true,
                              'capture_race_ms', a.capture_race_ms, 'after_transition', null);
  end if;

  if e.status in ('RESULTS_OFFICIAL', 'ARCHIVED') and public.race_is_control(r.event_id) is not true then
    raise exception 'RACE_EVENT_FROZEN: the results are official — only race control can change evidence' using errcode = 'check_violation';
  end if;
  v_now := public.race_now_ms(r.event_id);
  if v_now is null then raise exception 'RACE_NOT_STARTED' using errcode = 'check_violation'; end if;
  if r.status in ('VOID_DNS', 'NOT_REACHED') then
    raise exception 'RACE_ATHLETE_NOT_RACING: this athlete has no rowing result' using errcode = 'check_violation';
  end if;
  -- the display is only final once the 3:00 work window has closed. Capturing is allowed from that moment on; it never moves a window.
  if r.status = 'SCHEDULED' or v_now < r.window_end_race_ms then
    raise exception 'RACE_OCR_TOO_EARLY: the rowing display is final only when the 3:00 work window has ended' using errcode = 'check_violation';
  end if;
  if public.race_evidence_state(r.id) = 'OFFICIAL' then
    raise exception 'RACE_OCR_ALREADY_CONFIRMED: this rowing distance is already official — ask Master Control for a correction' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_ocr_records o where o.station_result_id = r.id and o.status in ('CAPTURED', 'PENDING_REVIEW')) then
    raise exception 'RACE_OCR_ATTEMPT_ACTIVE: confirm or retake the current photo first' using errcode = 'check_violation';
  end if;

  select true, (o.metadata ->> 'size')::numeric into v_found, v_size from storage.objects o where o.bucket_id = 'race-evidence' and o.name = p_storage_path;
  if v_found is not true then
    raise exception 'RACE_OCR_IMAGE_MISSING: upload the photo before registering it' using errcode = 'check_violation';
  end if;
  if v_size is not null and v_size <> p_image_bytes then
    raise exception 'RACE_OCR_IMAGE_MISMATCH: the uploaded file is not the photo that was described' using errcode = 'check_violation';
  end if;

  select * into v_prev from public.race_ocr_records o where o.station_result_id = r.id order by o.attempt_no desc limit 1;
  begin
    insert into public.race_ocr_records
      (event_id, station_id, station_result_id, storage_path, retake_of, captured_by, client_capture_id, attempt_no, capture_race_ms, origin,
       device_id, device_seq, device_recorded_at, device_race_ms, image_mime, image_bytes, image_sha256)
    values
      (r.event_id, r.station_id, r.id, p_storage_path, case when v_prev.status = 'RETAKEN' then v_prev.id end, auth.uid(), p_client_capture_id,
       coalesce(v_prev.attempt_no, 0) + 1, v_now, p_origin, p_device_id, p_device_seq, p_device_recorded_at, p_device_race_ms,
       p_image_mime, p_image_bytes, p_image_sha256)
    returning * into a;
  exception when unique_violation then
    select * into a from public.race_ocr_records where client_capture_id = p_client_capture_id;
    if a.id is null then
      raise exception 'RACE_OCR_ATTEMPT_ACTIVE: confirm or retake the current photo first' using errcode = 'check_violation';
    end if;
    return jsonb_build_object('attempt_id', a.id, 'attempt_no', a.attempt_no, 'status', a.status, 'ocr_status', a.ocr_status, 'duplicate', true,
                              'capture_race_ms', a.capture_race_ms, 'after_transition', null);
  end;
  perform public.race_audit('race.ocr.capture', r.event_id, 'race_ocr_records', a.id, null,
    jsonb_build_object('result_id', r.id, 'attempt_no', a.attempt_no, 'capture_race_ms', v_now, 'origin', p_origin, 'device_race_ms', p_device_race_ms,
                       'sha256', p_image_sha256, 'retake_of', a.retake_of), '{}'::jsonb);
  return jsonb_build_object('attempt_id', a.id, 'attempt_no', a.attempt_no, 'status', a.status, 'ocr_status', a.ocr_status, 'duplicate', false,
                            'capture_race_ms', v_now, 'after_transition', v_now >= r.window_end_race_ms + e.transition_ms);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. OCR RESULT — the output of the OCR run, stored once per attempt. Never touches a time window.
-- ---------------------------------------------------------------------------
create or replace function race_ocr_submit(
  p_attempt_id uuid, p_provider text, p_engine text, p_raw_text text, p_raw_response jsonb, p_distance_m int, p_confidence numeric
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a public.race_ocr_records;
  v_limits jsonb;
  v_status text;
begin
  select * into a from public.race_ocr_records where id = p_attempt_id;
  if a.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(a.event_id) is not true
     and public.race_has_role(a.event_id, array['JUDGE']::public.race_role[], a.station_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the judge of this station (or race control) can submit its OCR result' using errcode = 'insufficient_privilege';
  end if;
  if p_distance_m is not null and p_distance_m < 0 then raise exception 'RACE_INVALID_VALUE: a distance is zero or more' using errcode = 'check_violation'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then raise exception 'RACE_INVALID_VALUE: confidence is between 0 and 1' using errcode = 'check_violation'; end if;
  if p_provider is null or length(btrim(p_provider)) = 0 then raise exception 'RACE_INVALID_VALUE: name the OCR provider' using errcode = 'check_violation'; end if;

  select * into a from public.race_ocr_records where id = p_attempt_id for update;
  if a.ocr_status <> 'PENDING' then
    -- a retry of the same submission is answered with the stored result; a DIFFERENT result can never replace it
    if a.provider is not distinct from p_provider and a.proposed_distance_m is not distinct from p_distance_m
       and a.confidence is not distinct from p_confidence and a.ocr_text is not distinct from p_raw_text then
      return jsonb_build_object('attempt_id', a.id, 'ocr_status', a.ocr_status, 'proposed_distance_m', a.proposed_distance_m, 'confidence', a.confidence, 'duplicate', true);
    end if;
    raise exception 'RACE_OCR_ALREADY_PROCESSED: this attempt already has an OCR result — retake the photo for a new one' using errcode = 'check_violation';
  end if;
  if a.status <> 'CAPTURED' then
    raise exception 'RACE_OCR_NOT_ACTIVE: this photo is no longer the current attempt (%)', a.status using errcode = 'check_violation';
  end if;
  v_limits := public.race_ocr_limits(a.station_result_id);
  v_status := public.race_ocr_classify(p_distance_m, p_confidence, v_limits);
  update public.race_ocr_records
     set provider = btrim(p_provider), ocr_engine = p_engine, ocr_text = p_raw_text, raw_response = p_raw_response,
         proposed_distance_m = p_distance_m, confidence = p_confidence, ocr_status = v_status, ocr_submitted_by = auth.uid()
   where id = a.id
   returning * into a;
  perform public.race_audit('race.ocr.result', a.event_id, 'race_ocr_records', a.id, null,
    jsonb_build_object('result_id', a.station_result_id, 'attempt_no', a.attempt_no, 'ocr_status', v_status, 'proposed_distance_m', p_distance_m,
                       'confidence', p_confidence, 'provider', p_provider, 'engine', p_engine), '{}'::jsonb);
  return jsonb_build_object('attempt_id', a.id, 'ocr_status', a.ocr_status, 'proposed_distance_m', a.proposed_distance_m, 'confidence', a.confidence, 'duplicate', false,
                            'requires_acknowledgement', a.ocr_status = 'LOW_CONFIDENCE', 'can_confirm', a.ocr_status <> 'FAILED');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. CONFIRM — takes NO distance: it confirms what the OCR proposed. After the 0:30 transition it waits for Master Control.
-- ---------------------------------------------------------------------------
create or replace function race_ocr_confirm(p_attempt_id uuid, p_client_event_id uuid, p_acknowledge_low_confidence boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a public.race_ocr_records;
  r public.race_station_results;
  e public.race_events;
  v_now bigint;
  v_late boolean;
  v_tally jsonb;
begin
  if p_client_event_id is null then
    raise exception 'RACE_CLIENT_EVENT_REQUIRED: every confirmation carries a client-generated id' using errcode = 'check_violation';
  end if;
  select * into a from public.race_ocr_records where id = p_attempt_id;
  if a.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(a.event_id) is not true
     and public.race_has_role(a.event_id, array['JUDGE']::public.race_role[], a.station_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the judge of this station (or race control) can confirm its evidence' using errcode = 'insufficient_privilege';
  end if;
  -- a retry of the same confirmation
  select * into a from public.race_ocr_records where confirm_client_id = p_client_event_id;
  if a.id is not null then
    if a.id <> p_attempt_id then raise exception 'RACE_IDEMPOTENCY_CONFLICT: that confirmation id was already used for a different photo' using errcode = 'unique_violation'; end if;
    return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'official', a.status = 'CONFIRMED', 'duplicate', true, 'after_transition', a.confirmed_after_transition,
                              'distance_m', a.proposed_distance_m);
  end if;

  select * into a from public.race_ocr_records where id = p_attempt_id;
  perform public.race_advance_core(a.event_id);
  select * into r from public.race_station_results where id = a.station_result_id for update;       -- serialises with capture / review / correction
  select * into a from public.race_ocr_records where id = p_attempt_id for update;
  select * into e from public.race_events where id = a.event_id;
  if exists (select 1 from public.race_ocr_records o where o.confirm_client_id = p_client_event_id) then
    select * into a from public.race_ocr_records where confirm_client_id = p_client_event_id;
    return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'official', a.status = 'CONFIRMED', 'duplicate', true, 'after_transition', a.confirmed_after_transition,
                              'distance_m', a.proposed_distance_m);
  end if;

  if a.status = 'CONFIRMED' then raise exception 'RACE_OCR_ALREADY_CONFIRMED: this photo is already confirmed' using errcode = 'check_violation'; end if;
  if a.status <> 'CAPTURED' then
    raise exception 'RACE_OCR_NOT_ACTIVE: this photo can no longer be confirmed (%)', a.status using errcode = 'check_violation';
  end if;
  if public.race_evidence_state(r.id) = 'OFFICIAL' then
    raise exception 'RACE_OCR_ALREADY_CONFIRMED: this rowing distance is already official' using errcode = 'check_violation';
  end if;
  if e.status in ('RESULTS_OFFICIAL', 'ARCHIVED') and public.race_is_control(a.event_id) is not true then
    raise exception 'RACE_EVENT_FROZEN: the results are official — only race control can change evidence' using errcode = 'check_violation';
  end if;
  if a.ocr_status = 'PENDING' then raise exception 'RACE_OCR_NOT_PROCESSED: the OCR result is not in yet' using errcode = 'check_violation'; end if;
  if a.ocr_status = 'FAILED' then
    raise exception 'RACE_OCR_UNREADABLE: the display could not be read — retake the photo (or ask Master Control for a correction)' using errcode = 'check_violation';
  end if;
  if a.ocr_status = 'LOW_CONFIDENCE' and p_acknowledge_low_confidence is not true then
    raise exception 'RACE_OCR_LOW_CONFIDENCE: the reading is uncertain — check the display and acknowledge, or retake the photo' using errcode = 'check_violation';
  end if;

  v_now := public.race_now_ms(a.event_id);
  v_late := v_now >= r.window_end_race_ms + e.transition_ms;
  if v_late then
    -- reached the server after the 0:30 transition: it does NOT count until Master Control approves it
    update public.race_ocr_records
       set status = 'PENDING_REVIEW', confirm_client_id = p_client_event_id, confirmed_after_transition = true, low_confidence_ack = coalesce(p_acknowledge_low_confidence, false),
           confirm_requested_by = auth.uid(), confirm_requested_race_ms = v_now
     where id = a.id returning * into a;
    perform public.race_audit('race.ocr.confirm_late', a.event_id, 'race_ocr_records', a.id, null,
      jsonb_build_object('result_id', r.id, 'distance_m', a.proposed_distance_m, 'confirm_race_ms', v_now, 'transition_end_ms', r.window_end_race_ms + e.transition_ms), '{}'::jsonb);
    return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'official', false, 'duplicate', false, 'after_transition', true, 'distance_m', a.proposed_distance_m);
  end if;

  update public.race_ocr_records
     set status = 'CONFIRMED', confirm_client_id = p_client_event_id, confirmed_distance_m = a.proposed_distance_m, confirmed_by = auth.uid(),
         low_confidence_ack = coalesce(p_acknowledge_low_confidence, false), confirm_requested_by = auth.uid(), confirm_requested_race_ms = v_now
   where id = a.id returning * into a;
  v_tally := public.race_recompute_result(r.id);
  perform public.race_audit('race.ocr.confirm', a.event_id, 'race_ocr_records', a.id, null,
    jsonb_build_object('result_id', r.id, 'distance_m', a.confirmed_distance_m, 'confirm_race_ms', v_now, 'confidence', a.confidence, 'low_confidence_ack', a.low_confidence_ack), '{}'::jsonb);
  return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'official', true, 'duplicate', false, 'after_transition', false, 'distance_m', a.confirmed_distance_m,
                            'score', v_tally -> 'score');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RETAKE — closes the current attempt (kept forever) so a new photo can be captured
-- ---------------------------------------------------------------------------
create or replace function race_ocr_retake(p_attempt_id uuid, p_client_event_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a public.race_ocr_records;
  r public.race_station_results;
begin
  if p_client_event_id is null then
    raise exception 'RACE_CLIENT_EVENT_REQUIRED: every retake carries a client-generated id' using errcode = 'check_violation';
  end if;
  select * into a from public.race_ocr_records where id = p_attempt_id;
  if a.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(a.event_id) is not true
     and public.race_has_role(a.event_id, array['JUDGE']::public.race_role[], a.station_id) is not true then
    raise exception 'RACE_FORBIDDEN: only the judge of this station (or race control) can retake its evidence' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.race_ocr_records where retake_client_id = p_client_event_id;
  if a.id is not null then
    if a.id <> p_attempt_id then raise exception 'RACE_IDEMPOTENCY_CONFLICT: that retake id was already used for a different photo' using errcode = 'unique_violation'; end if;
    return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'duplicate', true);
  end if;
  select * into a from public.race_ocr_records where id = p_attempt_id;
  select * into r from public.race_station_results where id = a.station_result_id for update;
  select * into a from public.race_ocr_records where id = p_attempt_id for update;
  if exists (select 1 from public.race_ocr_records o where o.retake_client_id = p_client_event_id) then
    select * into a from public.race_ocr_records where retake_client_id = p_client_event_id;
    return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'duplicate', true);
  end if;
  if a.status = 'CONFIRMED' then raise exception 'RACE_OCR_ALREADY_CONFIRMED: a confirmed distance cannot be retaken — ask Master Control for a correction' using errcode = 'check_violation'; end if;
  if a.status <> 'CAPTURED' then raise exception 'RACE_OCR_NOT_ACTIVE: this photo can no longer be retaken (%)', a.status using errcode = 'check_violation'; end if;
  if public.race_evidence_state(r.id) = 'OFFICIAL' then
    raise exception 'RACE_OCR_ALREADY_CONFIRMED: this rowing distance is already official' using errcode = 'check_violation';
  end if;
  update public.race_ocr_records
     set status = 'RETAKEN', retake_client_id = p_client_event_id, retaken_by = auth.uid(), retake_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = a.id returning * into a;
  perform public.race_audit('race.ocr.retake', a.event_id, 'race_ocr_records', a.id, null,
    jsonb_build_object('result_id', a.station_result_id, 'attempt_no', a.attempt_no, 'reason', a.retake_reason, 'ocr_status', a.ocr_status, 'proposed_distance_m', a.proposed_distance_m), '{}'::jsonb);
  return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. REVIEW — Master Control / Event Manager decides a late confirmation
-- ---------------------------------------------------------------------------
create or replace function race_ocr_review(p_attempt_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a public.race_ocr_records;
  r public.race_station_results;
  v_tally jsonb;
begin
  select * into a from public.race_ocr_records where id = p_attempt_id;
  if a.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(a.event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  if p_decision not in ('APPROVED', 'REJECTED') then raise exception 'RACE_INVALID_VALUE: decide APPROVED or REJECTED' using errcode = 'check_violation'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: a decision needs a reason' using errcode = 'check_violation'; end if;
  select * into r from public.race_station_results where id = a.station_result_id for update;
  select * into a from public.race_ocr_records where id = p_attempt_id for update;
  if a.status <> 'PENDING_REVIEW' then
    raise exception 'RACE_OCR_NOT_PENDING: this confirmation is not waiting for review (%)', a.status using errcode = 'check_violation';
  end if;
  if p_decision = 'APPROVED' then
    update public.race_ocr_records
       set status = 'CONFIRMED', confirmed_distance_m = proposed_distance_m, confirmed_by = auth.uid(), reviewed_by = auth.uid(), review_reason = btrim(p_reason)
     where id = a.id returning * into a;
    v_tally := public.race_recompute_result(r.id);
  else
    update public.race_ocr_records set status = 'REJECTED', reviewed_by = auth.uid(), review_reason = btrim(p_reason) where id = a.id returning * into a;
  end if;
  perform public.race_audit('race.ocr.review', a.event_id, 'race_ocr_records', a.id, jsonb_build_object('status', 'PENDING_REVIEW'),
    jsonb_build_object('status', a.status, 'distance_m', a.confirmed_distance_m), jsonb_build_object('decision', p_decision, 'reason', btrim(p_reason), 'result_id', r.id));
  return jsonb_build_object('attempt_id', a.id, 'status', a.status, 'official', a.status = 'CONFIRMED', 'score', v_tally -> 'score');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. MANUAL CORRECTION — Master Control / Event Manager; cites the original evidence; never rewrites the OCR record
-- ---------------------------------------------------------------------------
create or replace function race_correct_rowing_result(p_result_id uuid, p_distance_m int, p_reason text, p_evidence_attempt_id uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_station_results;
  st public.race_stations;
  e public.race_events;
  a public.race_ocr_records;
  v_old numeric;
  v_limits jsonb;
  v_evidence uuid;
  v_tally jsonb;
  v_cat uuid;
  v_snap jsonb;
begin
  select * into r from public.race_station_results where id = p_result_id;
  if r.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(r.event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select * into st from public.race_stations where id = r.station_id;
  if not st.requires_ocr then raise exception 'RACE_NOT_ROWING_STATION: use the normal result correction' using errcode = 'check_violation'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: a correction needs a reason' using errcode = 'check_violation'; end if;
  v_limits := public.race_ocr_limits(r.id);
  if p_distance_m is null or p_distance_m < 0 or p_distance_m > (v_limits ->> 'max_distance_m')::int then
    raise exception 'RACE_INVALID_VALUE: a rowing distance is between 0 and % m', v_limits ->> 'max_distance_m' using errcode = 'check_violation';
  end if;
  select * into r from public.race_station_results where id = p_result_id for update;
  select * into e from public.race_events where id = r.event_id;
  if e.status = 'ARCHIVED' then raise exception 'RACE_EVENT_ARCHIVED: archived results cannot be corrected' using errcode = 'check_violation'; end if;
  if e.status = 'RESULTS_OFFICIAL' and public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN: once results are official only the Event Manager can correct them' using errcode = 'insufficient_privilege';
  end if;
  if r.status not in ('LOCKED', 'CORRECTED') then
    raise exception 'RACE_INVALID_STATE: a rowing result can be corrected once its 0:30 transition is over (this one is %)', r.status using errcode = 'check_violation';
  end if;
  -- the evidence reference: the photo being corrected (default: the latest attempt). Only a result with no photo at all may go without one.
  if p_evidence_attempt_id is not null then
    select * into a from public.race_ocr_records where id = p_evidence_attempt_id and station_result_id = r.id;
    if a.id is null then raise exception 'RACE_NOT_FOUND: that photo does not belong to this result' using errcode = 'no_data_found'; end if;
    v_evidence := a.id;
  else
    select id into v_evidence from public.race_ocr_records where station_result_id = r.id order by attempt_no desc limit 1;
  end if;
  v_old := (select coalesce(
              (select (c.new_value #>> '{}')::numeric from public.race_result_corrections c where c.station_result_id = r.id and c.field = 'rowing_distance_m' order by c.corrected_at desc, c.id desc limit 1),
              (select o.confirmed_distance_m from public.race_ocr_records o where o.station_result_id = r.id and o.status = 'CONFIRMED' limit 1)));
  if v_old is not distinct from p_distance_m::numeric then
    raise exception 'RACE_NO_CHANGE: the official distance is already % m', p_distance_m using errcode = 'check_violation';
  end if;

  insert into public.race_result_corrections (event_id, station_id, station_result_id, field, old_value, new_value, reason, corrected_by, evidence_ocr_id)
  values (r.event_id, r.station_id, r.id, 'rowing_distance_m', to_jsonb(v_old), to_jsonb(p_distance_m), btrim(p_reason), auth.uid(), v_evidence);
  update public.race_station_results set status = 'CORRECTED', official_score = p_distance_m where id = r.id;   -- (a CORRECTED result keeps its value through any later re-derivation)
  v_tally := public.race_recompute_result(r.id);
  perform public.race_audit('race.ocr.manual_correction', r.event_id, 'race_station_results', r.id, jsonb_build_object('distance_m', v_old),
    jsonb_build_object('distance_m', p_distance_m), jsonb_build_object('reason', btrim(p_reason), 'evidence_attempt_id', v_evidence, 'no_evidence', v_evidence is null));
  select category_id into v_cat from public.race_registrations where id = r.registration_id;
  if e.status = 'RESULTS_OFFICIAL' then v_snap := public.race_write_snapshot(r.event_id, v_cat, true); end if;
  return jsonb_build_object('result_id', r.id, 'old', v_old, 'new', p_distance_m, 'status', 'CORRECTED', 'evidence_attempt_id', v_evidence, 'score', v_tally -> 'score', 'snapshot', v_snap);
end;
$$;

-- Phase 9's generic correction must not become a way around the evidence
create or replace function race_correct_station_result(p_result_id uuid, p_field text, p_value numeric, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  sr public.race_station_results%rowtype;
  v_has_tech boolean;
  v_status public.race_event_status;
  v_cat uuid;
  v_old numeric;
  v_snap jsonb;
begin
  select * into sr from public.race_station_results where id = p_result_id for update;
  if not found then raise exception 'RACE_NOT_FOUND: result' using errcode = 'no_data_found'; end if;
  if public.race_is_manager(sr.event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: a correction needs a reason' using errcode = 'check_violation'; end if;
  if p_field not in ('official_score', 'technique_score') then raise exception 'RACE_INVALID_FIELD: %', p_field using errcode = 'check_violation'; end if;
  if p_value is null or p_value < 0 then raise exception 'RACE_INVALID_VALUE: a score is zero or more' using errcode = 'check_violation'; end if;
  select status into v_status from public.race_events where id = sr.event_id;
  if v_status = 'ARCHIVED' then raise exception 'RACE_EVENT_ARCHIVED: archived results cannot be corrected' using errcode = 'check_violation'; end if;
  if sr.status not in ('LOCKED', 'CORRECTED') then
    raise exception 'RACE_INVALID_STATE: only a locked result can be corrected (this one is %)', sr.status using errcode = 'check_violation';
  end if;
  select has_technique into v_has_tech from public.race_stations where id = sr.station_id;
  if exists (select 1 from public.race_stations where id = sr.station_id and requires_ocr) and p_field = 'official_score' then
    raise exception 'RACE_USE_EVIDENCE_CORRECTION: a rowing distance is corrected with race_correct_rowing_result, which cites the photo evidence' using errcode = 'check_violation';
  end if;
  if p_field = 'technique_score' then
    if not v_has_tech then raise exception 'RACE_NO_TECHNIQUE_AT_STATION' using errcode = 'check_violation'; end if;
    if p_value > 10 or p_value <> round(p_value, 1) then raise exception 'RACE_INVALID_VALUE: technique is 0–10 in steps of 0.1' using errcode = 'check_violation'; end if;
  end if;
  v_old := case p_field when 'official_score' then sr.official_score else sr.technique_score end;
  if v_old is not distinct from p_value then raise exception 'RACE_NO_CHANGE: the value is already %', p_value using errcode = 'check_violation'; end if;

  insert into public.race_result_corrections (event_id, station_id, station_result_id, field, old_value, new_value, reason, corrected_by)
  values (sr.event_id, sr.station_id, sr.id, p_field, to_jsonb(v_old), to_jsonb(p_value), btrim(p_reason), auth.uid());
  update public.race_station_results
     set official_score = case when p_field = 'official_score' then p_value else official_score end,
         technique_score = case when p_field = 'technique_score' then p_value else technique_score end,
         status = 'CORRECTED'
   where id = sr.id;
  perform public.race_audit('race.result.correct', sr.event_id, 'race_station_results', sr.id,
    jsonb_build_object(p_field, v_old), jsonb_build_object(p_field, p_value), jsonb_build_object('reason', btrim(p_reason)));

  select category_id into v_cat from public.race_registrations where id = sr.registration_id;
  if v_status = 'RESULTS_OFFICIAL' then
    v_snap := public.race_write_snapshot(sr.event_id, v_cat, true);
  end if;
  return jsonb_build_object('result_id', sr.id, 'field', p_field, 'old', v_old, 'new', p_value, 'status', 'CORRECTED', 'snapshot', v_snap);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rankings: an unconfirmed rowing result blocks OFFICIAL (and is not double-counted as "unscored" / "not locked")
-- ---------------------------------------------------------------------------
create or replace function race_rank_blockers(p_event_id uuid, p_category_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with r as (
    select rg.id, rg.race_status
      from public.race_registrations rg
     where rg.event_id = p_event_id and rg.category_id = p_category_id and rg.status = 'CONFIRMED'
  ),
  res as (
    select sr.*, public.race_evidence_state(sr.id) as ev
      from public.race_station_results sr join r on r.id = sr.registration_id and r.race_status = 'FINISHED'
     where sr.status not in ('VOID_DNS', 'NOT_REACHED')
  )
  select jsonb_build_object(
    'ranked',           (select count(*) from public.race_rank_rows(p_event_id, p_category_id)),
    'racing',           (select count(*) from r where r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN', 'STARTED')),
    'pending_review',   (select count(*) from res where res.status = 'REVIEW_PENDING' or coalesce((res.derived ->> 'pending_review')::int, 0) > 0),
    'not_locked',       (select count(*) from res where res.status not in ('LOCKED', 'CORRECTED', 'REVIEW_PENDING')),
    'pending_evidence', (select count(*) from res where res.ev is not null and res.ev <> 'OFFICIAL'),
    'unscored',         (select count(*) from res where res.official_score is null and (res.ev is null or res.ev = 'OFFICIAL'))
  );
$$;
revoke execute on function race_rank_blockers(uuid, uuid) from public, anon, authenticated;

create or replace function race_blockers_clear(p jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select (p ->> 'racing')::int = 0 and (p ->> 'pending_review')::int = 0 and (p ->> 'not_locked')::int = 0 and (p ->> 'unscored')::int = 0
     and coalesce((p ->> 'pending_evidence')::int, 0) = 0;
$$;
revoke execute on function race_blockers_clear(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Views for the rowing judge and for Master Control
-- ---------------------------------------------------------------------------
create or replace function race_rowing_view(p_event_id uuid, p_all boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  st public.race_stations;
  e public.race_events;
  clk public.race_clock;
  v_now bigint;
  v_items jsonb;
begin
  select * into st from public.race_stations where event_id = p_event_id and requires_ocr order by number limit 1;
  if st.id is null then raise exception 'RACE_NOT_FOUND: this event has no rowing station' using errcode = 'no_data_found'; end if;
  if public.race_is_control(p_event_id) is not true and public.race_has_role(p_event_id, array['JUDGE']::public.race_role[], st.id) is not true then
    raise exception 'RACE_FORBIDDEN: only the rowing judge (or race control) can open the evidence view' using errcode = 'insufficient_privilege';
  end if;
  perform public.race_advance_core(p_event_id);
  select * into e from public.race_events where id = p_event_id;
  select * into clk from public.race_clock where event_id = p_event_id;
  v_now := public.race_now_ms(p_event_id);

  select coalesce(jsonb_agg(x.item order by x.ws), '[]'::jsonb) into v_items
    from (
      select r.window_start_race_ms ws,
        jsonb_build_object(
          'result_id', r.id, 'race_number', g.race_number, 'name', a.full_name, 'category_code', c.code,
          'window_start_ms', r.window_start_race_ms, 'window_end_ms', r.window_end_race_ms, 'scoring_end_ms', r.window_end_race_ms + e.transition_ms,
          'phase', case when v_now is null or v_now < r.window_end_race_ms then 'WORK' when v_now < r.window_end_race_ms + e.transition_ms then 'TRANSITION' else 'AFTER' end,
          'result_status', r.status, 'evidence_state', public.race_evidence_state(r.id), 'official_distance_m', r.official_score,
          'limits', public.race_ocr_limits(r.id),
          'attempts', coalesce((select jsonb_agg(jsonb_build_object(
              'attempt_id', o.id, 'attempt_no', o.attempt_no, 'status', o.status, 'ocr_status', o.ocr_status, 'proposed_distance_m', o.proposed_distance_m,
              'confidence', o.confidence, 'ocr_text', o.ocr_text, 'ocr_engine', o.ocr_engine, 'captured_at', o.captured_at, 'capture_race_ms', o.capture_race_ms,
              'image_path', o.storage_path, 'confirmed_distance_m', o.confirmed_distance_m, 'retake_reason', o.retake_reason,
              'confirmed_after_transition', o.confirmed_after_transition, 'review_reason', o.review_reason, 'origin', o.origin) order by o.attempt_no)
              from public.race_ocr_records o where o.station_result_id = r.id), '[]'::jsonb)
        ) item
        from public.race_station_results r
        join public.race_registrations g on g.id = r.registration_id
        join public.race_athletes a on a.id = g.athlete_id
        join public.race_categories c on c.id = g.category_id
       where r.event_id = p_event_id and r.station_id = st.id and r.status in ('ACTIVE', 'SCORING', 'LOCKED', 'CORRECTED')
         and (coalesce(p_all, false) or r.status in ('ACTIVE', 'SCORING') or public.race_evidence_state(r.id) <> 'OFFICIAL' or r.window_end_race_ms > coalesce(v_now, 0) - 600000)
       order by r.window_start_race_ms desc
       limit 20
    ) x;
  return jsonb_build_object('server_time', to_jsonb(clock_timestamp()), 'station', jsonb_build_object('number', st.number, 'name', st.name),
    'clock', jsonb_build_object('started', clk.started_at is not null, 'paused', clk.paused_at is not null, 'finished', clk.finished_at is not null, 'race_ms', v_now, 'version', clk.version),
    'transition_ms', e.transition_ms, 'items', v_items);
end;
$$;

-- Everything known about one rowing result, for the Master Control evidence page: attempts, corrections, audit trail.
create or replace function race_evidence_history(p_result_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  r public.race_station_results;
begin
  select * into r from public.race_station_results where id = p_result_id;
  if r.id is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if public.race_is_control(r.event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'result_id', r.id, 'evidence_state', public.race_evidence_state(r.id), 'official_distance_m', r.official_score, 'result_status', r.status,
    'attempts', coalesce((select jsonb_agg(to_jsonb(o) - 'raw_response' order by o.attempt_no) from public.race_ocr_records o where o.station_result_id = r.id), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'old', c.old_value, 'new', c.new_value, 'reason', c.reason, 'by', c.corrected_by,
                                                                 'at', c.corrected_at, 'evidence_attempt_id', c.evidence_ocr_id) order by c.corrected_at, c.id)
                               from public.race_result_corrections c where c.station_result_id = r.id and c.field = 'rowing_distance_m'), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'action', l.action, 'actor', l.actor_full_name, 'target_id', l.target_id, 'after', l.after, 'metadata', l.metadata) order by l.created_at, l.id)
                         from public.race_audit_log l
                        where l.action like 'race.ocr.%' and (l.target_id = r.id or l.target_id in (select o.id from public.race_ocr_records o where o.station_result_id = r.id))), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: a judge may upload / read ONLY evidence of a result at the station they are assigned to
--          (path = <event>/rowing/<result>/<file>); race control may handle any evidence of the event.
-- ---------------------------------------------------------------------------
create or replace function race_evidence_judge_path_ok(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_f text[] := storage.foldername(p_name);
  v_event uuid := public.race_storage_event(p_name);
  v_res uuid;
begin
  if v_event is null or coalesce(array_length(v_f, 1), 0) < 3 or v_f[2] <> 'rowing'
     or v_f[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_res := v_f[3]::uuid;
  return exists (select 1 from public.race_station_results r
                  where r.id = v_res and r.event_id = v_event
                    and public.race_has_role(v_event, array['JUDGE']::public.race_role[], r.station_id));
end;
$$;

drop policy "race evidence: judges and control upload for their event" on storage.objects;
drop policy "race evidence: control and the uploader read" on storage.objects;
create policy "race evidence: the station judge and control upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'race-evidence' and public.race_storage_event(name) is not null
              and (public.race_is_super_admin() or public.race_is_control(public.race_storage_event(name)) or public.race_evidence_judge_path_ok(name)));
create policy "race evidence: control, the station judge and the uploader read" on storage.objects for select to authenticated
  using (bucket_id = 'race-evidence' and public.race_storage_event(name) is not null
         and (public.race_is_control(public.race_storage_event(name)) or public.race_evidence_judge_path_ok(name)
              or (owner = auth.uid() and public.race_auth_active() and public.race_evidence_judge_path_ok(name))));

-- ---------------------------------------------------------------------------
-- Grants: staff only; the station screen and anon get nothing
-- ---------------------------------------------------------------------------
grant execute on function race_ocr_capture(uuid, uuid, text, text, int, text, public.race_action_origin, timestamptz, bigint, bigint, uuid) to authenticated;
grant execute on function race_ocr_submit(uuid, text, text, text, jsonb, int, numeric) to authenticated;
grant execute on function race_ocr_confirm(uuid, uuid, boolean) to authenticated;
grant execute on function race_ocr_retake(uuid, uuid, text) to authenticated;
grant execute on function race_ocr_review(uuid, text, text) to authenticated;
grant execute on function race_correct_rowing_result(uuid, int, text, uuid) to authenticated;
grant execute on function race_rowing_view(uuid, boolean) to authenticated;
grant execute on function race_evidence_history(uuid) to authenticated;
revoke execute on function race_ocr_capture(uuid, uuid, text, text, int, text, public.race_action_origin, timestamptz, bigint, bigint, uuid) from public, anon;
revoke execute on function race_ocr_submit(uuid, text, text, text, jsonb, int, numeric) from public, anon;
revoke execute on function race_ocr_confirm(uuid, uuid, boolean) from public, anon;
revoke execute on function race_ocr_retake(uuid, uuid, text) from public, anon;
revoke execute on function race_ocr_review(uuid, text, text) from public, anon;
revoke execute on function race_correct_rowing_result(uuid, int, text, uuid) from public, anon;
revoke execute on function race_rowing_view(uuid, boolean) from public, anon;
revoke execute on function race_evidence_history(uuid) from public, anon;
revoke execute on function race_guard_rowing_actions() from public, anon, authenticated;
revoke execute on function race_evidence_judge_path_ok(text) from public, anon;
