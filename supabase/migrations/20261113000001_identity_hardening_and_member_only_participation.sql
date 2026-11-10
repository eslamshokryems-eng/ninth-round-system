-- ===========================================================================
-- Challenges — L-1 and L-2 hardening (additive).
--
-- L-1  Identity handling in request_challenge_participation()
-- L-2  search_path pinning on is_admin() / is_super_admin()
--
-- Nothing here is edited in place: every object below is replaced with
-- CREATE OR REPLACE, which preserves existing EXECUTE grants. No historical
-- migration is touched, no data is modified, and no existing participant,
-- result, designation or ledger row is read or rewritten by this file.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- L-2. is_admin() and is_super_admin() were the only two authorization
-- helpers left without a pinned search_path. Verified against a local
-- harness database built from the real migrations:
--
--   proname          | prosecdef | proconfig
--   -----------------+-----------+----------------
--   auth_role        | t         | search_path=""
--   is_branch_staff  | t         | search_path=""
--   is_service_role  | f         | search_path=""
--   is_super_admin   | f         | (none)        <-- this file
--   is_admin         | f         | (none)        <-- this file
--
-- Both are SECURITY INVOKER and both already schema-qualify every function
-- they call (`public.auth_role()`, `public.is_service_role()`), so this is
-- hardening rather than the repair of a reachable bypass: a caller cannot
-- shadow a `public.`-qualified name. What an unpinned search_path does leave
-- open is OPERATOR resolution — the `=` and `in` comparisons in these bodies
-- resolve through search_path, so an account that could create an operator
-- in an earlier schema could change what `auth_role() = 'super_admin'`
-- means. Pinning removes that class of attack outright and makes all five
-- helpers consistent, which is the real win: the next reader no longer has
-- to work out why three of them are pinned and two are not.
--
-- The BODIES below are byte-for-byte the ones installed by
-- 20261107000001_fail_closed_authorization_guards.sql. Only the
-- `set search_path = ''` line is new, so the fail-closed coalesce() wrapper
-- and the explicit service_role recognition are preserved exactly.
-- ---------------------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.auth_role() in ('branch_manager', 'super_admin'), false)
      or public.is_service_role();
$$;

create or replace function is_super_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.auth_role() = 'super_admin', false)
      or public.is_service_role();
$$;

-- ---------------------------------------------------------------------------
-- L-1. request_challenge_participation() — identity handling.
--
-- Two defects, both found by calling the real function against a local
-- harness database rather than by reading it:
--
-- (a) A caller with NO identity at all (role `authenticated`, no
--     `request.jwt.claim.sub` — the shape of a request whose token carries
--     no usable `sub`, and also the shape of a `service_role` call, since
--     service_role has no profiles row) was refused, but with the message
--     "Set a display name before requesting to join a competition."
--     The refusal was accidental: `auth.uid()` was NULL, so the
--     display-name lookup found no row, so the display-name guard fired.
--     Nothing was written — verified by before/after row counts on
--     challenge_participants — so this was never a bypass. It was a
--     misleading error and, worse, a guard that happened to hold for a
--     reason unrelated to authorization. If a later change ever made a
--     display name optional, or defaulted one in, the identity check would
--     have disappeared with it. It is now stated explicitly and first.
--
-- (b) A STAFF account could enter itself as a competitor. Proven against
--     the harness: Coach One (role `coach`, active, Branch B) set a display
--     name, called this function on a registration-open Branch B
--     competition, and was inserted with status `approved`. This is the
--     reason it matters:
--
--       * Review authority. A coach may approve or reject results in
--           BRANCH and MULTI_BRANCH competitions. The self-review ban in
--           approve_/reject_challenge_result only compares the REVIEWER to
--           the result's AUTHOR, so two coaches who are both competing can
--           submit each other's results and approve each other's — neither
--           is reviewing a result they authored, and the standings are
--           decided entirely between them.
--       * Coach designation. designate_challenge_coach() only checks that
--           the target has the coach role and is active; nothing stops a
--           competing coach from being designated as another competitor's
--           coach, which makes them the only account allowed to record
--           that rival's score.
--       * It contradicts the rest of the module. M-1 reserves every staff
--           member's real name so that no competitor can wear a staff
--           identity on the leaderboard, and the M-1 suite asserts that no
--           staff profile appears on a leaderboard at all — an assertion
--           that passed only because no staff member had happened to join.
--
--     Participation is therefore restricted to an ACTIVE `member` profile.
--     The staff test is `role <> 'member'`, which is the same authoritative
--     staff-identity source the rest of the schema already uses
--     (20260812000001:27, 20260816000001:22, 20260821000002:41,
--     20261112000001's reserved-name check) rather than a new parallel
--     notion of "staff".
--
--     This is a PRODUCT decision as much as a security one, and it is
--     reversible: a gym that wants its coaches to compete should drop this
--     one guard AND give the review path a participant-conflict rule, not
--     drop the guard alone. No existing row is touched — a staff account
--     that is already a participant keeps its row, its results and its
--     ledger entries; only NEW requests are refused. Nothing is deleted,
--     renamed or recomputed.
--
-- Everything else in this function is carried over unchanged from
-- 20261106000001_challenges_mvp_membership_independence.sql: the display
-- name requirement, the lifecycle and registration-window checks, the
-- per-scope branch rules, the duplicate-request guard, and the age
-- eligibility evaluation that records `approved`/`rejected` with a reason.
-- ---------------------------------------------------------------------------

create or replace function request_challenge_participation(p_challenge_id uuid, p_branch_id uuid default null)
returns table (
  participant_id uuid,
  challenge_id uuid,
  participant_profile_id uuid,
  branch_id uuid,
  status challenge_participant_status,
  eligibility_result boolean,
  eligibility_reason text,
  requested_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_actor_role public.user_role;
  v_actor_is_active boolean;
  v_display_name text;
  v_profile_dob date;
  v_challenge public.challenges%rowtype;
  v_rule public.challenge_eligibility_rules%rowtype;
  v_eligible boolean := true;
  v_reason text := null;
  v_required_age integer;
  v_new_id uuid;
begin
  -- (a) An explicit, first-thing identity check. Resolved once into
  -- v_actor so that every later use of the caller's id in this function
  -- is the same value this check validated.
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Not authorized to request participation in a competition.';
  end if;

  -- (b) Competitors are members. `is distinct from` rejects a NULL role
  -- and `is distinct from true` rejects both false and NULL for
  -- is_active, so a missing profile row cannot satisfy either test.
  select role, is_active into v_actor_role, v_actor_is_active
  from public.profiles where id = v_actor;

  if v_actor_role is distinct from 'member' then
    raise exception 'Only a member account can enter a competition.';
  end if;
  if v_actor_is_active is distinct from true then
    raise exception 'Not authorized to request participation in a competition.';
  end if;

  select display_name into v_display_name from public.challenge_display_names where profile_id = v_actor;
  if v_display_name is null then
    raise exception 'Set a display name before requesting to join a competition.';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;
  if v_challenge.status <> 'registration_open' then
    raise exception 'This competition is not currently open for registration.';
  end if;
  if now() < v_challenge.registration_start_at or now() > v_challenge.registration_end_at then
    raise exception 'This competition''s registration window is not currently open.';
  end if;

  if v_challenge.scope = 'GLOBAL' then
    if p_branch_id is not null then
      raise exception 'This competition has no branch to select — it is open globally.';
    end if;
  elsif v_challenge.scope = 'BRANCH' then
    if p_branch_id is distinct from v_challenge.branch_id then
      raise exception 'This competition is only open to its own branch.';
    end if;
  elsif v_challenge.scope = 'MULTI_BRANCH' then
    if p_branch_id is null or not exists (
      select 1 from public.challenge_branches cb where cb.challenge_id = p_challenge_id and cb.branch_id = p_branch_id
    ) then
      raise exception 'This competition is not open to the selected branch.';
    end if;
  end if;

  if exists (
    select 1 from public.challenge_participants cp where cp.challenge_id = p_challenge_id and cp.participant_profile_id = v_actor
  ) then
    raise exception 'A participation request already exists for this competition.';
  end if;

  select date_of_birth into v_profile_dob from public.profiles where id = v_actor;

  for v_rule in
    select * from public.challenge_eligibility_rules cer where cer.challenge_id = p_challenge_id order by cer.created_at
  loop
    exit when not v_eligible;

    if v_rule.rule_type = 'min_age' then
      v_required_age := (v_rule.value ->> 'age')::integer;
      if v_profile_dob is null then
        v_eligible := false;
        v_reason := 'Date of birth is required to check age eligibility.';
      elsif extract(year from age(v_profile_dob)) < v_required_age then
        v_eligible := false;
        v_reason := format('Minimum age is %s.', v_required_age);
      end if;

    elsif v_rule.rule_type = 'max_age' then
      v_required_age := (v_rule.value ->> 'age')::integer;
      if v_profile_dob is null then
        v_eligible := false;
        v_reason := 'Date of birth is required to check age eligibility.';
      elsif extract(year from age(v_profile_dob)) > v_required_age then
        v_eligible := false;
        v_reason := format('Maximum age is %s.', v_required_age);
      end if;
    end if;
  end loop;

  insert into public.challenge_participants (challenge_id, participant_profile_id, branch_id, status, eligibility_result, eligibility_reason)
  values (
    p_challenge_id, v_actor, p_branch_id,
    (case when v_eligible then 'approved' else 'rejected' end)::public.challenge_participant_status,
    v_eligible, v_reason
  )
  returning id into v_new_id;

  return query
    select cp.id, cp.challenge_id, cp.participant_profile_id, cp.branch_id, cp.status, cp.eligibility_result, cp.eligibility_reason, cp.requested_at, cp.created_at
    from public.challenge_participants cp
    where cp.id = v_new_id;
end;
$$;

comment on function request_challenge_participation(uuid, uuid) is
  'A member enters a competition. Requires an authenticated, ACTIVE profile with the member role (staff accounts may not compete — see 20261113000001), a display name, a registration-open competition inside its registration window, a branch selection valid for the competition scope, and no existing request. Records approved/rejected against the competition eligibility rules.';
