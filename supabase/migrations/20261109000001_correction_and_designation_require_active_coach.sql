-- ---------------------------------------------------------------------------
-- Security fix: the two remaining Challenges authorization gaps found by
-- the audit that followed
-- 20261108000001_submit_result_requires_active_authorized_coach.sql.
--
-- Both are the same root cause as that migration's: a function that
-- authorizes by STORED IDENTITY (or by a stored role) without asking
-- whether the profile behind it is still active, and an SQL comparison
-- that yields NULL rather than TRUE when there is no identity at all.
--
-- ===========================================================================
-- FINDING A — request_challenge_result_correction()
-- ===========================================================================
-- As left by 20261106000001:928, the whole authorization was:
--
--     if v_participant.designated_coach_id is null
--        or v_participant.designated_coach_id <> auth.uid() then raise ...
--
-- No role check, no active-status check. Two consequences, both measured
-- on a local scratch database before this migration was written:
--
--   A1. DEACTIVATED COACH. profiles.is_active = false does not clear
--       challenge_participants.designated_coach_id, and cannot revoke an
--       already-issued access token, so a deactivated coach still
--       satisfied the identity test. A probe confirmed one creating a
--       correction row successfully ("correction rows created by the
--       DEACTIVATED coach= 1"). This is the live gap.
--
--   A2. NULL auth.uid() FELL THROUGH. `designated_coach_id <> auth.uid()`
--       is NULL when auth.uid() is NULL, and `false or NULL` is NULL, so
--       `if NULL then raise` took the false branch and an identityless
--       caller reached the INSERT. It was then rejected by
--       challenge_results.entered_by_profile_id being NOT NULL — a schema
--       constraint, NOT an authorization decision (measured: "null value
--       in column entered_by_profile_id ... violates not-null
--       constraint"). So A2 was not an unauthorized write, and is not
--       claimed as one; closing it converts a constraint-violation 500
--       into a proper authorization refusal.
--
-- FIX A, mirroring submit_challenge_result() exactly:
--
--   a. The identity test becomes NULL-safe. The `is null` clause is KEPT
--      and kept FIRST: `is distinct from` alone would wrongly pass when
--      designated_coach_id and auth.uid() are BOTH null (null is not
--      distinct from null), so the pair is needed, in this order.
--
--   b. The established fail-closed role-and-scope gate is added:
--
--        coalesce(public.auth_role() in ('coach','branch_manager','super_admin'), false)
--        and (scope = 'GLOBAL' or public.is_branch_staff(participant.branch_id))
--
--      copied verbatim from submit_challenge_result() and the four review
--      RPCs. auth_role() selects `where id = auth.uid() and is_active`, so
--      it is NULL for anon, for service_role and for a deactivated
--      profile; coalesce(..., false) makes all three fail CLOSED.
--
--      The branch clause MUST stay guarded by `scope = 'GLOBAL'`: a GLOBAL
--      competition has no branch, so challenge_participants.branch_id is
--      NULL for its participants, and an unguarded is_branch_staff(NULL)
--      would deny every legitimate GLOBAL correction.
--
--      Reading the challenge's `scope` is why the existing single-column
--      `select status into v_challenge_status` becomes a two-column
--      select; nothing else about the lifecycle gate changes.
--
-- Not broadened: the new gate is ANDed with the unchanged designated-coach
-- identity test, so the permitted callers remain exactly one profile per
-- participant, now additionally required to be active and in scope.
--
-- Untouched: the result-exists check, the "current approved result only"
-- rule, the lifecycle gate, the insert (including its 'correction_pending'
-- status and corrects_result_id), and the returned shape. Review and
-- approval stay entirely separate operations — approve_challenge_result_
-- correction() and reject_challenge_result_correction() are NOT modified
-- by this migration and keep their own independent authorization.
--
-- ===========================================================================
-- FINDING B — designate_challenge_coach()
-- ===========================================================================
-- The function validated the TARGET profile's role and branch:
--
--     select role, branch_id into v_coach_role, v_coach_branch_id
--       from public.profiles where id = p_coach_id;
--     if v_coach_role is distinct from 'coach' then raise ...
--
-- but never its is_active. So a DEACTIVATED coach could be newly
-- designated. Since 20261108000001 that designation is unusable — the
-- deactivated coach cannot submit — so the practical effect is a
-- participant left with a coach who cannot act for them, rather than a
-- privilege escalation. It is still wrong, and the database (not the UI or
-- the TypeScript layer) is where it has to be refused.
--
-- FIX B: also read is_active and require it, fail-closed via
-- `is distinct from true`, which rejects both false and NULL (NULL being
-- what a non-existent profile yields).
--
-- The role check stays FIRST so that a non-existent or non-coach profile
-- still produces the existing "must be a profile with the coach role"
-- message, exactly as today. The caller-side authorization (super_admin
-- for a branchless participant; branch_manager/super_admin in-branch
-- otherwise), the cross-branch rule, the reason requirement and the audit
-- log entry are all byte-for-byte unchanged.
--
-- NO DATA IS CHANGED. This migration does not clear, rewrite or audit any
-- existing designated_coach_id. Participants currently pointing at a
-- deactivated coach keep that row untouched; only NEW designations are
-- validated. Removing them is a separate product decision.
--
-- ===========================================================================
-- Both functions are replaced with CREATE OR REPLACE, never DROP +
-- CREATE: the signatures and every parameter name are unchanged, so the
-- existing privilege lockdown in 20261106000001:1179-1189
-- (`revoke execute ... from public; grant execute ... to authenticated`)
-- is preserved rather than being reset to PUBLIC. Additive only; no
-- historical migration is edited, renamed or reordered.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- FINDING A
-- ---------------------------------------------------------------------------
create or replace function request_challenge_result_correction(
  p_corrects_result_id uuid,
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
  v_original public.challenge_results%rowtype;
  v_challenge_status public.challenge_status;
  v_challenge_scope public.challenge_scope;
  v_participant public.challenge_participants%rowtype;
  v_new_id uuid;
begin
  select * into v_original from public.challenge_results where id = p_corrects_result_id;
  if v_original.id is null then
    raise exception 'Challenge result not found: %', p_corrects_result_id;
  end if;
  if v_original.status <> 'approved' or v_original.superseded_by_result_id is not null then
    raise exception 'A correction can only be requested against the current approved result.';
  end if;

  select status, scope into v_challenge_status, v_challenge_scope
  from public.challenges where id = v_original.challenge_id;
  if v_challenge_status not in ('active', 'completed') then
    raise exception 'Corrections can only be requested while a competition is active or completed, not while it is % .', v_challenge_status;
  end if;

  select * into v_participant
  from public.challenge_participants
  where challenge_id = v_original.challenge_id and participant_profile_id = v_original.participant_profile_id;

  -- NULL-safe. `<>` yielded NULL for a NULL auth.uid(), and `false or NULL`
  -- is NULL, so `if NULL then raise` skipped this gate entirely. The
  -- `is null` clause stays first on purpose: `is distinct from` alone
  -- would pass when both sides are null.
  if v_participant.designated_coach_id is null
     or v_participant.designated_coach_id is distinct from auth.uid() then
    raise exception 'Only this participant''s designated coach may request a correction for them.';
  end if;

  -- Holding the designation is necessary but not sufficient: the caller
  -- must ALSO still be an active staff profile in a coaching role and in
  -- scope for this participant. coalesce() keeps this fail-closed when
  -- auth_role() is NULL — anon, service_role, or a DEACTIVATED profile
  -- whose access token has not yet expired.
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge_scope = 'GLOBAL' or public.is_branch_staff(v_participant.branch_id))
  ) then
    raise exception 'Not authorized to request a correction for this participant.';
  end if;

  insert into public.challenge_results (
    challenge_id, participant_profile_id, entered_by_profile_id, result_value, measurement_unit, performed_at, status, corrects_result_id
  )
  values (
    v_original.challenge_id, v_original.participant_profile_id, auth.uid(), p_result_value, p_measurement_unit, p_performed_at,
    'correction_pending', p_corrects_result_id
  )
  returning id into v_new_id;

  return query select v_new_id;
end;
$$;

comment on function public.request_challenge_result_correction(uuid, numeric, text, timestamptz) is
  'Requests a correction against a participant''s current approved result. The caller must be that participant''s currently designated coach AND an active staff profile in a coaching role in scope for them; authorization fails closed when auth_role() is NULL (anon, service_role, or a deactivated profile). Approval remains a separate, independently authorized operation.';

-- ---------------------------------------------------------------------------
-- FINDING B
-- ---------------------------------------------------------------------------
create or replace function designate_challenge_coach(p_participant_id uuid, p_coach_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.challenge_participants%rowtype;
  v_coach_role public.user_role;
  v_coach_branch_id uuid;
  v_coach_is_active boolean;
  v_old_coach_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to designate or change a participant''s assigned coach.';
  end if;

  select * into v_participant from public.challenge_participants where id = p_participant_id;
  if v_participant.id is null then
    raise exception 'Challenge participant not found: %', p_participant_id;
  end if;

  if v_participant.branch_id is null then
    if not public.is_super_admin() then
      raise exception 'Only a super admin may designate a coach for a participant with no selected branch.';
    end if;
  else
    if not (
      coalesce(public.auth_role() in ('branch_manager', 'super_admin'), false)
      and public.is_branch_staff(v_participant.branch_id)
    ) then
      raise exception 'Only a branch manager or super admin for this participant''s branch may designate a coach for this participant.';
    end if;
  end if;

  select role, branch_id, is_active
    into v_coach_role, v_coach_branch_id, v_coach_is_active
  from public.profiles where id = p_coach_id;

  -- Role first, so a non-existent or non-coach profile still produces the
  -- long-standing message for that case.
  if v_coach_role is distinct from 'coach' then
    raise exception 'The designated coach must be a profile with the coach role.';
  end if;
  -- NEW: the target must be ACTIVE. `is distinct from true` rejects both
  -- false and NULL, so this cannot be satisfied by a missing row.
  if v_coach_is_active is distinct from true then
    raise exception 'The designated coach must be an active profile.';
  end if;
  if v_participant.branch_id is not null and v_coach_branch_id is distinct from v_participant.branch_id then
    raise exception 'The designated coach must belong to the same branch as the participant.';
  end if;

  v_old_coach_id := v_participant.designated_coach_id;

  update public.challenge_participants set designated_coach_id = p_coach_id where id = p_participant_id;

  perform public.log_audit_event(
    'designate_challenge_coach', 'challenge_participant', p_participant_id,
    jsonb_build_object('designated_coach_id', v_old_coach_id),
    jsonb_build_object('designated_coach_id', p_coach_id),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

comment on function public.designate_challenge_coach(uuid, uuid, text) is
  'Designates a participant''s coach. The acting caller must be a super admin (branchless participant) or an in-branch branch manager/super admin; the TARGET profile must hold the coach role, be is_active = true, and belong to the participant''s branch. Existing designations are never altered by this check.';
