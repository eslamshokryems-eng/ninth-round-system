-- ---------------------------------------------------------------------------
-- Security fix H-2: GLOBAL-scope result review must be restricted to
-- branch managers and super admins.
--
-- FINDING (confirmed by execution during the final Challenges audit).
-- All four review RPCs shared one authorization predicate, defined at
-- 20261106000001_challenges_mvp_membership_independence.sql:828-831,
-- :866-869, :977-980 and :1027-1030:
--
--     if not (
--       coalesce(public.auth_role() in ('coach','branch_manager','super_admin'), false)
--       and (v_challenge.scope = 'GLOBAL' or public.is_branch_staff(v_participant_branch_id))
--     ) then
--
-- For scope = 'GLOBAL' the second conjunct short-circuits to TRUE, so the
-- only surviving requirement was "an active profile in one of three
-- roles" — anywhere, with no branch, no competition and no relationship
-- to the athlete. `coach` is the lowest staff tier, so any active coach
-- in the company could approve OR reject any athlete's result in any
-- GLOBAL competition. Reproduced: Coach Three (Branch C, unrelated to the
-- athlete) rejected a GLOBAL result and the athlete disappeared from the
-- standings (leaderboard rows went to 0). The self-review ban does not
-- help — it only blocks reviewing one's OWN submission, so two coaches
-- could trivially review for each other.
--
-- APPROVED BUSINESS RULE. On a GLOBAL competition only branch_manager and
-- super_admin may approve or reject a result or a correction. An active
-- coach must never do so, whatever their branch or relationship to the
-- athlete.
--
-- THE FIX. The predicate becomes scope-explicit rather than
-- scope-bypassing:
--
--     if not coalesce(
--       case
--         when v_challenge.scope = 'GLOBAL' then
--           public.auth_role() in ('branch_manager', 'super_admin')
--         else
--           public.auth_role() in ('coach', 'branch_manager', 'super_admin')
--           and public.is_branch_staff(v_participant_branch_id)
--       end, false) then
--
-- * The GLOBAL arm names the two permitted roles outright. There is no
--   longer any branch clause that can short-circuit a role check away.
-- * The ELSE arm is the BRANCH / MULTI_BRANCH behaviour UNCHANGED: for a
--   non-GLOBAL scope the old predicate already reduced to exactly
--   `role in (coach, branch_manager, super_admin) and is_branch_staff(...)`,
--   which is what the ELSE arm says. So this migration changes nothing for
--   BRANCH or MULTI_BRANCH; the only behavioural delta anywhere is that a
--   coach is now refused on GLOBAL.
-- * coalesce(..., false) wraps the WHOLE case, keeping it fail-closed:
--   auth_role() is NULL for anon, for service_role and for a DEACTIVATED
--   profile, and a NULL predicate would otherwise make `if not (...)`
--   take the false branch and skip the guard entirely. A NULL or unknown
--   scope also falls to the stricter ELSE arm, which additionally
--   requires is_branch_staff().
-- * No branch check is applied on the GLOBAL arm because a GLOBAL
--   competition has no branch and its participants have branch_id = NULL
--   (request_challenge_participation() rejects a non-null branch for
--   GLOBAL scope), so is_branch_staff(NULL) is false for every
--   non-super-admin and would deny the branch managers this rule admits.
--
-- EVERYTHING ELSE IS BYTE-FOR-BYTE UNCHANGED in all four functions. These
-- bodies were extracted verbatim from 20261106000001 and the only edit
-- applied was the predicate above (verified: the diff between the
-- extracted originals and the text below is exactly 4 x 14 lines, all of
-- it that predicate). Preserved: the `for update` row lock (M-3), the
-- result/correction existence and status checks, the reason requirement on
-- both reject paths, the self-review prohibition, the participant-branch
-- lookup, the supersede-then-approve ordering in the correction approver,
-- the review-row inserts and the whole-challenge points recompute.
--
-- CREATE OR REPLACE, never DROP + CREATE: signatures and parameter names
-- are unchanged, so the existing privilege lockdown at 20261106000001:
-- 1185-1198 (`revoke execute ... from public; grant execute ... to
-- authenticated` for each of the four) is preserved rather than reset to
-- PUBLIC. Additive only; no historical migration is edited, renamed or
-- reordered. Scope is these four functions and nothing else.
-- ---------------------------------------------------------------------------

create or replace function approve_challenge_result(p_result_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.challenge_results%rowtype;
  v_challenge public.challenges%rowtype;
  v_participant_branch_id uuid;
begin
  select * into v_result from public.challenge_results where id = p_result_id for update;
  if v_result.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_result.status <> 'pending' then
    raise exception 'Only a pending result can be approved.';
  end if;

  select * into v_challenge from public.challenges where id = v_result.challenge_id;
  select branch_id into v_participant_branch_id
  from public.challenge_participants
  where challenge_id = v_result.challenge_id and participant_profile_id = v_result.participant_profile_id;

  if v_result.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot approve your own submitted result.';
  end if;
  if not coalesce(
    case
      when v_challenge.scope = 'GLOBAL' then
        public.auth_role() in ('branch_manager', 'super_admin')
      else
        public.auth_role() in ('coach', 'branch_manager', 'super_admin')
        and public.is_branch_staff(v_participant_branch_id)
    end, false) then
    raise exception 'Not authorized to review this result.';
  end if;

  update public.challenge_results set status = 'approved' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'approved', p_notes);

  perform public.recompute_challenge_points(v_result.challenge_id, 'Result approved');
end;
$$;

create or replace function reject_challenge_result(p_result_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.challenge_results%rowtype;
  v_challenge public.challenges%rowtype;
  v_participant_branch_id uuid;
begin
  if p_notes is null or btrim(p_notes) = '' then
    raise exception 'A reason is required to reject a result.';
  end if;

  select * into v_result from public.challenge_results where id = p_result_id for update;
  if v_result.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_result.status <> 'pending' then
    raise exception 'Only a pending result can be rejected.';
  end if;

  select * into v_challenge from public.challenges where id = v_result.challenge_id;
  select branch_id into v_participant_branch_id
  from public.challenge_participants
  where challenge_id = v_result.challenge_id and participant_profile_id = v_result.participant_profile_id;

  if v_result.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot reject your own submitted result.';
  end if;
  if not coalesce(
    case
      when v_challenge.scope = 'GLOBAL' then
        public.auth_role() in ('branch_manager', 'super_admin')
      else
        public.auth_role() in ('coach', 'branch_manager', 'super_admin')
        and public.is_branch_staff(v_participant_branch_id)
    end, false) then
    raise exception 'Not authorized to review this result.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

create or replace function approve_challenge_result_correction(p_result_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.challenge_results%rowtype;
  v_challenge public.challenges%rowtype;
  v_participant_branch_id uuid;
begin
  select * into v_correction from public.challenge_results where id = p_result_id for update;
  if v_correction.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_correction.status <> 'correction_pending' then
    raise exception 'Only a pending correction can be approved.';
  end if;

  select * into v_challenge from public.challenges where id = v_correction.challenge_id;
  select branch_id into v_participant_branch_id
  from public.challenge_participants
  where challenge_id = v_correction.challenge_id and participant_profile_id = v_correction.participant_profile_id;

  if v_correction.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot approve your own correction request.';
  end if;
  if not coalesce(
    case
      when v_challenge.scope = 'GLOBAL' then
        public.auth_role() in ('branch_manager', 'super_admin')
      else
        public.auth_role() in ('coach', 'branch_manager', 'super_admin')
        and public.is_branch_staff(v_participant_branch_id)
    end, false) then
    raise exception 'Not authorized to review this correction.';
  end if;

  update public.challenge_results set superseded_by_result_id = v_correction.id where id = v_correction.corrects_result_id;
  update public.challenge_results set status = 'approved' where id = v_correction.id;

  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'approved', p_notes);

  perform public.recompute_challenge_points(v_correction.challenge_id, 'Result correction approved');
end;
$$;

create or replace function reject_challenge_result_correction(p_result_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.challenge_results%rowtype;
  v_challenge public.challenges%rowtype;
  v_participant_branch_id uuid;
begin
  if p_notes is null or btrim(p_notes) = '' then
    raise exception 'A reason is required to reject a correction.';
  end if;

  select * into v_correction from public.challenge_results where id = p_result_id for update;
  if v_correction.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_correction.status <> 'correction_pending' then
    raise exception 'Only a pending correction can be rejected.';
  end if;

  select * into v_challenge from public.challenges where id = v_correction.challenge_id;
  select branch_id into v_participant_branch_id
  from public.challenge_participants
  where challenge_id = v_correction.challenge_id and participant_profile_id = v_correction.participant_profile_id;

  if v_correction.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot reject your own correction request.';
  end if;
  if not coalesce(
    case
      when v_challenge.scope = 'GLOBAL' then
        public.auth_role() in ('branch_manager', 'super_admin')
      else
        public.auth_role() in ('coach', 'branch_manager', 'super_admin')
        and public.is_branch_staff(v_participant_branch_id)
    end, false) then
    raise exception 'Not authorized to review this correction.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

comment on function public.approve_challenge_result(uuid, text) is
  'Approves a pending result. On a GLOBAL competition only a branch manager or super admin may review; on BRANCH/MULTI_BRANCH an in-branch coach, branch manager or super admin may. Never the result''s own author. Fails closed when auth_role() is NULL.';
comment on function public.reject_challenge_result(uuid, text) is
  'Rejects a pending result (reason required). On a GLOBAL competition only a branch manager or super admin may review; on BRANCH/MULTI_BRANCH an in-branch coach, branch manager or super admin may. Never the result''s own author. Fails closed when auth_role() is NULL.';
comment on function public.approve_challenge_result_correction(uuid, text) is
  'Approves a pending correction, superseding the original. On a GLOBAL competition only a branch manager or super admin may review; on BRANCH/MULTI_BRANCH an in-branch coach, branch manager or super admin may. Never the correction''s own author. Fails closed when auth_role() is NULL.';
comment on function public.reject_challenge_result_correction(uuid, text) is
  'Rejects a pending correction (reason required). On a GLOBAL competition only a branch manager or super admin may review; on BRANCH/MULTI_BRANCH an in-branch coach, branch manager or super admin may. Never the correction''s own author. Fails closed when auth_role() is NULL.';
