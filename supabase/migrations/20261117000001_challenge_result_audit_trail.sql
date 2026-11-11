-- ===========================================================================
-- Challenges — a complete audit trail for result history (additive).
--
-- Until now the result workflow wrote NOTHING to admin_audit_log. History was
-- recoverable only by reading challenge_results (a rejected row stays) and the
-- append-only challenge_result_reviews, which is not what the Audit Log screen
-- shows, and which says nothing about WHO submitted or reviewed unless you
-- join three tables by hand. Competition-integrity disputes are exactly the
-- case where an audit log earns its keep: "who entered 58, who rejected it,
-- why, who entered the replacement, who approved that".
--
-- Implemented as TRIGGERS rather than by editing seven RPC bodies, so that:
--   * one place defines what is recorded, and a future RPC that touches these
--     tables is audited without anyone remembering to;
--   * no existing RPC is redefined (nothing to drift, nothing to re-verify);
--   * the actor comes from auth.uid() exactly as in every other audit event,
--     and is NULL for an owner-level maintenance statement, which is the
--     honest answer for one.
--
-- What is recorded (action / entity = challenge_result):
--   challenge_result_submitted             INSERT of an original result
--   challenge_result_correction_requested  INSERT of a correction
--   challenge_result_status_changed        status moved (pending -> approved, ...)
--   challenge_result_superseded            an approved correction replaced it
--   challenge_result_reviewed              each review row: decision + notes
--
-- The audit rows carry no secret: values, units, statuses, ids and the
-- reviewer's own note — all of which the Challenges screens already show to
-- the same staff.
-- ===========================================================================

create or replace function audit_challenge_result_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit_event(
      case when new.corrects_result_id is null
           then 'challenge_result_submitted'
           else 'challenge_result_correction_requested' end,
      'challenge_result', new.id,
      null,
      jsonb_build_object(
        'status', new.status,
        'result_value', new.result_value,
        'measurement_unit', new.measurement_unit,
        'performed_at', new.performed_at,
        'participant_profile_id', new.participant_profile_id,
        'entered_by_profile_id', new.entered_by_profile_id,
        'corrects_result_id', new.corrects_result_id),
      jsonb_build_object('challenge_id', new.challenge_id)
    );
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    perform public.log_audit_event(
      'challenge_result_status_changed', 'challenge_result', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      jsonb_build_object('challenge_id', new.challenge_id,
                         'participant_profile_id', new.participant_profile_id)
    );
  end if;

  if new.superseded_by_result_id is distinct from old.superseded_by_result_id then
    perform public.log_audit_event(
      'challenge_result_superseded', 'challenge_result', new.id,
      jsonb_build_object('superseded_by_result_id', old.superseded_by_result_id),
      jsonb_build_object('superseded_by_result_id', new.superseded_by_result_id),
      jsonb_build_object('challenge_id', new.challenge_id,
                         'participant_profile_id', new.participant_profile_id)
    );
  end if;
  return new;
end;
$$;

create or replace function audit_challenge_result_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
begin
  select challenge_id into v_challenge_id from public.challenge_results where id = new.result_id;
  perform public.log_audit_event(
    'challenge_result_reviewed', 'challenge_result', new.result_id,
    null,
    jsonb_build_object(
      'decision', new.decision,
      'notes', new.notes,
      'reviewer_profile_id', new.reviewer_profile_id),
    jsonb_build_object('challenge_id', v_challenge_id)
  );
  return new;
end;
$$;

create trigger trg_audit_challenge_result_insert
  after insert on challenge_results
  for each row execute function audit_challenge_result_change();

create trigger trg_audit_challenge_result_update
  after update of status, superseded_by_result_id on challenge_results
  for each row execute function audit_challenge_result_change();

create trigger trg_audit_challenge_result_review
  after insert on challenge_result_reviews
  for each row execute function audit_challenge_result_review();

-- Trigger functions are never meant to be called directly.
revoke execute on function audit_challenge_result_change() from public, anon, authenticated;
revoke execute on function audit_challenge_result_review() from public, anon, authenticated;
