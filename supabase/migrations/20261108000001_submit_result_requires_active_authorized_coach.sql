-- ---------------------------------------------------------------------------
-- Security fix: submit_challenge_result() must require an AUTHENTICATED,
-- ACTIVE, AUTHORIZED actor.
--
-- FINDING. As left by 20261106000001_challenges_mvp_membership_
-- independence.sql, submit_challenge_result() authorized the caller
-- EXCLUSIVELY by identity:
--
--     if v_participant.designated_coach_id is null then raise ...
--     if v_participant.designated_coach_id <> auth.uid() then raise ...
--
-- There was no role check and no active-status check anywhere in the
-- function. Two distinct gaps followed from that.
--
-- (1) DEACTIVATED COACH. Deactivation in this system is
--     profiles.is_active = false; it does not revoke the coach's
--     challenge_participants.designated_coach_id row, and it cannot
--     revoke an access token GoTrue has already issued (PostgREST
--     validates a JWT locally — signature and expiry only — and never
--     consults GoTrue ban state). So a coach deactivated moments ago
--     still satisfied `designated_coach_id = auth.uid()` and could keep
--     entering competition results for the rest of that token's life.
--     Every other authorization check in the Challenges module reads
--     auth_role(), which is NULL for a deactivated profile, and so
--     rejects them; this one read no role at all, which is why the
--     fail-closed sweep in 20261107000001 did not reach it.
--
-- (2) NULL auth.uid() FELL THROUGH THE IDENTITY GATE. `designated_coach_
--     id <> auth.uid()` is NULL — not true — when auth.uid() is NULL, and
--     `if NULL then raise` takes the FALSE branch, so the guard was
--     skipped entirely for a caller with no identity, which then ran on
--     into the duplicate-original check and the INSERT. Same SQL
--     three-valued-logic root cause as 20261107000001, in a comparison
--     rather than a boolean helper.
--
--     This one was NOT exploitable as an unauthorized write, and is not
--     claimed as such: challenge_results.entered_by_profile_id is NOT
--     NULL, and the insert stores auth.uid(), so an identityless caller
--     that reached the insert was rejected by the column constraint —
--     measured, not assumed. Fixing it is therefore hardening plus
--     correct error reporting (an authorization refusal instead of a
--     constraint-violation 500), not the closure of a live hole. The
--     EXECUTE grant (authenticated only) is a second, independent
--     barrier in front of all of it.
--
-- THE FIX, in two narrowly scoped parts:
--
--   a. The identity comparison becomes `is distinct from`, which is TRUE
--      (not NULL) when auth.uid() is NULL, so an unidentified caller is
--      rejected by the gate instead of falling past it.
--
--   b. An active-role-and-scope gate is added, reusing verbatim the
--      expression every review RPC in this module already uses:
--
--        coalesce(public.auth_role() in ('coach','branch_manager','super_admin'), false)
--        and (scope = 'GLOBAL' or public.is_branch_staff(participant.branch_id))
--
--      auth_role() selects `where id = auth.uid() and is_active`, so it
--      returns NULL for anon, for service_role and for a DEACTIVATED
--      profile; coalesce(..., false) makes all three fail CLOSED.
--
-- THIS DOES NOT BROADEN PERMISSIONS. The new gate is ANDed with the
-- unchanged designated-coach identity check, so the set of callers who
-- may submit is a strict SUBSET of before: still exactly one profile per
-- participant, now additionally required to be active and in scope. The
-- role list mirrors designate_challenge_coach()'s own invariant (it
-- rejects any p_coach_id whose profile role is not 'coach') while also
-- tolerating a coach since promoted to branch_manager/super_admin who
-- still holds live designations — a legitimate existing workflow that a
-- strict `= 'coach'` test would have silently broken.
--
-- The branch clause is guarded by `scope = 'GLOBAL'` exactly as the
-- review RPCs guard theirs, and for the same reason: a GLOBAL
-- competition has no branch, so challenge_participants.branch_id is NULL
-- for its participants (request_challenge_participation() rejects a
-- non-null branch for GLOBAL scope), and an unguarded
-- is_branch_staff(NULL) would deny every legitimate GLOBAL submission.
--
-- EVERYTHING ELSE IS BYTE-FOR-BYTE UNCHANGED: the challenge-exists and
-- lifecycle gating, the approved-participant check, the
-- no-coach-designated message, the wrong-coach message, the
-- duplicate-original guard, the insert and its 'pending' status, and the
-- returned shape. The new gate sits AFTER the identity checks (so every
-- existing error message is produced in exactly the cases it was before)
-- and BEFORE the duplicate-original guard (so an unauthorized caller is
-- told they are unauthorized, never handed information about whether a
-- result already exists).
--
-- CREATE OR REPLACE, deliberately: the signature and every parameter
-- NAME are identical to the Phase 3 version, so no DROP is needed, and
-- replacing in place preserves the existing privilege lockdown
-- (`revoke execute ... from public; grant execute ... to authenticated`)
-- rather than resetting EXECUTE to PUBLIC the way a DROP + CREATE would.
-- service_role holds no EXECUTE grant on this function and none is
-- added: there is no server-side submission workflow, and auth_role()
-- returns NULL for service_role, so it now fails closed on both counts.
--
-- Additive only. No historical migration is edited, renamed or reordered.
-- ---------------------------------------------------------------------------

create or replace function submit_challenge_result(
  p_challenge_id uuid,
  p_participant_profile_id uuid,
  p_result_value numeric,
  p_measurement_unit text,
  p_performed_at timestamptz
)
returns table (result_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_status public.challenge_status;
  v_challenge_scope public.challenge_scope;
  v_participant public.challenge_participants%rowtype;
  v_new_id uuid;
begin
  select status, scope into v_challenge_status, v_challenge_scope
  from public.challenges where id = p_challenge_id;
  if v_challenge_status is null then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;
  if v_challenge_status not in ('active', 'completed') then
    raise exception 'Results can only be submitted while a competition is active or completed, not while it is % .', v_challenge_status;
  end if;

  select * into v_participant
  from public.challenge_participants
  where challenge_id = p_challenge_id and participant_profile_id = p_participant_profile_id;

  if v_participant.id is null or v_participant.status <> 'approved' then
    raise exception 'This participant is not an approved participant in this competition.';
  end if;

  if v_participant.designated_coach_id is null then
    raise exception 'No coach has been designated for this participant yet. Ask a branch manager or super admin to designate one.';
  end if;

  -- `is distinct from`, not `<>`: with auth.uid() NULL, `<>` evaluated to
  -- NULL and `if NULL then raise` took the false branch, skipping this
  -- gate for a caller with no identity at all. `is distinct from` is TRUE
  -- in that case, so the caller is rejected here.
  if v_participant.designated_coach_id is distinct from auth.uid() then
    raise exception 'Only this participant''s designated coach may submit a result for them.';
  end if;

  -- Holding the designation is necessary but no longer sufficient: the
  -- caller must ALSO still be an active staff profile in a coaching role
  -- and in scope for this participant. coalesce() keeps this fail-closed
  -- when auth_role() is NULL — anon, service_role, or a DEACTIVATED
  -- profile whose access token has not yet expired.
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge_scope = 'GLOBAL' or public.is_branch_staff(v_participant.branch_id))
  ) then
    raise exception 'Not authorized to submit a result for this participant.';
  end if;

  if exists (
    select 1 from public.challenge_results
    where challenge_id = p_challenge_id and participant_profile_id = p_participant_profile_id
      and corrects_result_id is null and status in ('pending', 'approved')
  ) then
    raise exception 'This participant already has a result for this competition. Use the correction workflow to change it instead of submitting a new one.';
  end if;

  insert into public.challenge_results (challenge_id, participant_profile_id, entered_by_profile_id, result_value, measurement_unit, performed_at, status)
  values (p_challenge_id, p_participant_profile_id, auth.uid(), p_result_value, p_measurement_unit, p_performed_at, 'pending')
  returning id into v_new_id;

  return query select v_new_id;
end;
$$;

comment on function public.submit_challenge_result(uuid, uuid, numeric, text, timestamptz) is
  'Submits a pending competition result. The caller must be the participant''s currently designated coach AND an active staff profile in a coaching role in scope for that participant; authorization fails closed when auth_role() is NULL (anon, service_role, or a deactivated profile).';
