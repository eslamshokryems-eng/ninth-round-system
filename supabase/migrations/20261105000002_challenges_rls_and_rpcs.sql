-- 9th Round Challenges — Phase 2: RLS read policies + the full set of
-- privileged RPCs for the 8 tables created in
-- 20261105000001_challenges_foundation.sql.
--
-- NOT EXECUTED against Supabase or any production database. Local file
-- only, per Phase 2 authorization. This revision incorporates the Phase 2
-- Security Remediation pass (findings C-1, H-1, H-2, H-3, M-1, M-2, M-3,
-- M-4, L-1, L-2, L-3 from the read-only security audit) — see each
-- section's own comment for which finding it addresses. It has been
-- syntax- and behavior-verified against a local, throwaway PostgreSQL 16
-- instance in this sandbox (never against Supabase or any shared/
-- production database) — see the remediation report for the exact
-- commands and output.
--
-- Design: every WRITE to these 8 tables happens through a SECURITY
-- DEFINER RPC below, never through a direct RLS-gated INSERT/UPDATE
-- policy — Phase 1 deliberately left every table with zero policies
-- (default-deny), and this migration only ever ADDS read (select)
-- policies to that baseline. This mirrors convert_lead_to_member() /
-- register_membership() / log_audit_event()'s existing pattern in this
-- codebase for any write with cross-row invariants a RLS WITH CHECK can't
-- express alone (reviewer-not-author, the correction chain, the atomic
-- whole-challenge ranking recompute). Every RPC still re-derives its own
-- authorization from auth.uid()/auth_role() — never trusts a
-- client-supplied role or id — matching this codebase's "the database is
-- the real gate" convention used throughout (see
-- 20261020000001_lead_assignment_guard.sql).
--
-- L-2 remediation: every function below uses `set search_path = ''` with
-- every table/type/function reference explicitly schema-qualified
-- (`public.`), the stricter pattern already used by auth_role()/
-- is_branch_staff() (20260815000002_permissions_and_staff_status.sql,
-- 20260914000001_fix_is_branch_staff_rls_recursion.sql), rather than the
-- `search_path = public` + unqualified-references style used by this
-- migration's first draft. Built-in functions (now(), coalesce(),
-- jsonb_array_elements(), extract(), age(), rank(), etc.) need no
-- qualification — pg_catalog is always implicitly searched regardless of
-- search_path. auth.uid() is already schema-qualified (the `auth` schema)
-- and is unaffected either way.
--
-- Second remediation pass (post-approval final review) additionally
-- fixes: (a) a duplicate-original-submission gap in submit_challenge_
-- result() — see that function's own comment and the new
-- uq_challenge_results_no_duplicate_original index just below; (b) a
-- cross-branch gap in designate_challenge_coach() — see that function's
-- own comment. Both were found and verified against the same local
-- PostgreSQL 16 harness, now preserved as a repeatable, checked-in test
-- suite at supabase/tests/challenges_phase2/ rather than an ephemeral
-- scratch database.

-- ---------------------------------------------------------------------------
-- uq_challenge_results_no_duplicate_original — added here (rather than
-- editing the Phase 1 migration, which is purely additive by convention)
-- as the database-level guarantee behind submit_challenge_result()'s own
-- friendly check: at most one "original" chain (corrects_result_id is
-- null) per (challenge_id, member_id) may ever be live — pending OR
-- approved — at the same time. A rejected original is NOT live (so a
-- fresh resubmission after rejection is still allowed, unchanged); an
-- approved original that was later superseded by an approved correction
-- is STILL counted (its own status stays 'approved' forever — only
-- superseded_by_result_id changes — see challenge-result.ts's doc
-- comment on the correction chain), which is exactly right: once a
-- member has any official result, every further change must go through
-- the correction workflow, never a second "original" submission.
-- Coexists with (does not replace) the three Phase 1 indexes:
-- uq_challenge_results_current still separately guarantees at most one
-- CURRENT result; uq_challenge_results_one_pending_correction and
-- uq_challenge_results_one_pending_original are now a strict subset of
-- what this index also covers, but are left in place as Phase 1 is
-- additive-only by convention.
-- ---------------------------------------------------------------------------

create unique index uq_challenge_results_no_duplicate_original
  on challenge_results (challenge_id, member_id)
  where corrects_result_id is null and status in ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------

create policy "staff read challenge seasons" on challenge_seasons for select
  using (auth_role() is not null);

create policy "super admin reads challenge settings" on challenge_settings for select
  using (is_super_admin());

create policy "staff read challenges" on challenges for select
  using (scope = 'ALL_BRANCHES' or is_branch_staff(branch_id));

create policy "staff read challenge eligibility rules" on challenge_eligibility_rules for select
  using (exists (
    select 1 from challenges c
    where c.id = challenge_eligibility_rules.challenge_id
      and (c.scope = 'ALL_BRANCHES' or is_branch_staff(c.branch_id))
  ));

create policy "staff read challenge participants" on challenge_participants for select
  using (exists (
    select 1 from challenges c
    where c.id = challenge_participants.challenge_id
      and (c.scope = 'ALL_BRANCHES' or is_branch_staff(c.branch_id))
  ));
create policy "member reads own challenge participation" on challenge_participants for select
  using (exists (
    select 1 from members m
    where m.id = challenge_participants.member_id and m.linked_profile_id = auth.uid()
  ));

create policy "staff read challenge results" on challenge_results for select
  using (exists (
    select 1 from challenges c
    where c.id = challenge_results.challenge_id
      and (c.scope = 'ALL_BRANCHES' or is_branch_staff(c.branch_id))
  ));
create policy "member reads own challenge results" on challenge_results for select
  using (exists (
    select 1 from members m
    where m.id = challenge_results.member_id and m.linked_profile_id = auth.uid()
  ));

create policy "staff read challenge result reviews" on challenge_result_reviews for select
  using (exists (
    select 1 from challenge_results r
    join challenges c on c.id = r.challenge_id
    where r.id = challenge_result_reviews.result_id
      and (c.scope = 'ALL_BRANCHES' or is_branch_staff(c.branch_id))
  ));
create policy "member reads own challenge result reviews" on challenge_result_reviews for select
  using (exists (
    select 1 from challenge_results r
    join members m on m.id = r.member_id
    where r.id = challenge_result_reviews.result_id and m.linked_profile_id = auth.uid()
  ));

create policy "staff read challenge points ledger" on challenge_points_ledger for select
  using (exists (
    select 1 from challenges c
    where c.id = challenge_points_ledger.challenge_id
      and (c.scope = 'ALL_BRANCHES' or is_branch_staff(c.branch_id))
  ));
create policy "member reads own challenge points ledger" on challenge_points_ledger for select
  using (exists (
    select 1 from members m
    where m.id = challenge_points_ledger.member_id and m.linked_profile_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- resolve_automatic_coach_for_member — Phase 2 remediation (M-2): the
-- PURELY automatic half of coach resolution, deliberately ignoring any
-- designated_coach_id override, so designate_challenge_coach() can check
-- "would the automatic rule have resolved this on its own?" before
-- recording an override. Factored out of resolve_assigned_coach_for_
-- member() below so the two never duplicate this logic and drift apart.
-- ---------------------------------------------------------------------------

create or replace function resolve_automatic_coach_for_member(p_challenge_id uuid, p_member_id uuid)
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_program_type public.program_type;
  -- uuid has no built-in MIN/MAX aggregate (only orderable scalar types
  -- like text/numeric/timestamptz do) — array_agg(distinct ...) is the
  -- correct way to collect distinct uuids and check there's exactly one,
  -- without relying on an aggregate uuid doesn't support.
  v_coach_ids uuid[];
begin
  select program_type into v_program_type from public.challenges where id = p_challenge_id;

  if v_program_type is null then
    return null;
  end if;

  select array_agg(distinct coach_id) into v_coach_ids
  from public.memberships
  where member_id = p_member_id
    and status = 'active'
    and program_type = v_program_type
    and coach_id is not null;

  if array_length(v_coach_ids, 1) = 1 then
    return v_coach_ids[1];
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_assigned_coach_for_member — the server-side source of truth for
-- spec §6.6 / Risk A, kept in exactly one place and reused by both
-- submit_challenge_result() and request_challenge_result_correction()
-- below. Mirrors resolveAssignedCoach() in
-- packages/challenges/domain/challenge-coach-assignment.ts; the two must
-- never diverge. Collapses every "not resolved" reason to NULL — this
-- function only needs to answer "who, if anyone, is uniquely the
-- assigned coach", not explain why resolution failed (that explanation
-- lives in the TS domain function, used client-side for the UI message).
--
-- H-2 remediation: this function is no longer reachable by any client —
-- see the privilege-lockdown section at the end of this file. It is kept
-- SECURITY INVOKER (not DEFINER): its only remaining callers are the
-- SECURITY DEFINER RPCs below, whose execution context (the function
-- owner, which has BYPASSRLS/superuser privileges in this project) is
-- inherited by any SECURITY INVOKER function they call — so this
-- function already sees past RLS when called internally, with no need
-- to declare it DEFINER itself.
-- ---------------------------------------------------------------------------

create or replace function resolve_assigned_coach_for_member(p_challenge_id uuid, p_member_id uuid)
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_designated_coach_id uuid;
begin
  select designated_coach_id into v_designated_coach_id
  from public.challenge_participants
  where challenge_id = p_challenge_id and member_id = p_member_id;

  if v_designated_coach_id is not null then
    return v_designated_coach_id;
  end if;

  return public.resolve_automatic_coach_for_member(p_challenge_id, p_member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- recompute_challenge_points — spec §6/§8: whenever the set of CURRENT
-- approved results for a challenge changes (a new approval, or a
-- correction being approved), the whole challenge's ranking is
-- recomputed from scratch and reconciled against each member's existing
-- ledger total via a single compensating entry — never by rewriting any
-- existing ledger row. rank() is Postgres's own standard competition
-- ranking (1, 2, 2, 4), the same tie behavior as rankResults() in
-- packages/challenges/domain/challenge.ts.
--
-- C-1 remediation: this function is no longer reachable by any client —
-- see the privilege-lockdown section at the end of this file. It remains
-- SECURITY DEFINER because it must write challenge_points_ledger rows
-- regardless of the caller's own RLS/table privileges (this table has no
-- INSERT policy at all — see the Phase 1 migration), and its only
-- remaining callers (approve_challenge_result(),
-- approve_challenge_result_correction()) are themselves SECURITY DEFINER,
-- so no authorized call path is affected by the lockdown.
-- ---------------------------------------------------------------------------

create or replace function recompute_challenge_points(p_challenge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_weight integer;
  v_direction public.challenge_scoring_direction;
  v_policy jsonb;
begin
  select season_id, weight, scoring_direction into v_season_id, v_weight, v_direction
  from public.challenges where id = p_challenge_id;

  select value::jsonb into v_policy from public.challenge_settings where key = 'rank_points_policy';

  with current_results as (
    select r.id as result_id, r.member_id, r.result_value
    from public.challenge_results r
    where r.challenge_id = p_challenge_id
      and r.status = 'approved'
      and r.superseded_by_result_id is null
  ),
  ranked as (
    select
      cr.result_id,
      cr.member_id,
      rank() over (
        order by (case when v_direction = 'LOWER_IS_BETTER' then cr.result_value else -cr.result_value end)
      ) as rnk
    from current_results cr
  ),
  scored as (
    select
      result_id,
      member_id,
      -- rank() returns bigint; jsonb's ->> operator only has an overload
      -- for integer, not bigint, so the index must be cast explicitly.
      coalesce((v_policy -> 'byRank' ->> (rnk - 1)::integer)::numeric, (v_policy ->> 'beyond')::numeric) * v_weight as earned_points
    from ranked
  ),
  totals as (
    select member_id, coalesce(sum(points_delta), 0) as current_total
    from public.challenge_points_ledger
    where challenge_id = p_challenge_id
    group by member_id
  )
  insert into public.challenge_points_ledger (season_id, challenge_id, member_id, result_id, points_delta, reason, created_by)
  select
    v_season_id,
    p_challenge_id,
    s.member_id,
    s.result_id,
    s.earned_points - coalesce(t.current_total, 0),
    p_reason,
    auth.uid()
  from scored s
  left join totals t on t.member_id = s.member_id
  where s.earned_points - coalesce(t.current_total, 0) <> 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_challenge_season — Super Admin only (spec §2.4: "created
-- manually by administration").
-- ---------------------------------------------------------------------------

create or replace function create_challenge_season(
  p_name text,
  p_description text,
  p_starts_at date,
  p_ends_at date
)
returns table (season_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can create a competition season.';
  end if;

  insert into public.challenge_seasons (name, description, starts_at, ends_at, created_by)
  values (p_name, p_description, p_starts_at, p_ends_at, auth.uid())
  returning id into v_new_id;

  return query select v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_challenge_weight_range — Super Admin only (spec §2.3). Never
-- touches any existing challenge's own already-chosen weight — only
-- create_challenge() ever reads this range, and only at creation time
-- (L-3: the database's configured range is always the final authority;
-- a caller's own stale client-side range can only ever cause an
-- unnecessary client-side rejection or a clear, explicit server-side one
-- naming the actual current min/max — see create_challenge() below).
-- ---------------------------------------------------------------------------

create or replace function set_challenge_weight_range(p_min integer, p_max integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change the competition weight range.';
  end if;
  if p_min < 1 or p_max < p_min then
    raise exception 'The minimum weight must be at least 1 and no greater than the maximum.';
  end if;

  update public.challenge_settings set value = p_min::text, updated_by = auth.uid() where key = 'min_weight';
  update public.challenge_settings set value = p_max::text, updated_by = auth.uid() where key = 'max_weight';
end;
$$;

-- ---------------------------------------------------------------------------
-- create_challenge — Branch Manager creates BRANCH-scoped within their
-- own branch only; Super Admin may create either scope, any branch
-- (spec §2.1/§5.2). The weight range checked here is this RPC's own fresh
-- read of challenge_settings — the real gate — never the client-supplied
-- range CreateChallengeUseCase validated against (defense in depth only;
-- L-3). Eligibility rules are validated AND inserted atomically with the
-- challenge itself.
--
-- M-1 remediation: each eligibility rule's value is now validated for
-- semantic correctness (a real program type; a syntactically valid
-- branchId that also references an existing branch; a non-negative
-- integer age), not merely "has the right key with the right primitive
-- type" as packages/challenges/domain/challenge-eligibility-rule.ts's
-- validateChallengeEligibilityRule() alone can check (it has no database
-- access, so it cannot confirm a branchId names a real branch). An
-- invalid rule now fails loudly, with a clear message, AT CREATION TIME —
-- never later, as an unhandled cast exception, when a member calls
-- request_challenge_participation() against it.
-- ---------------------------------------------------------------------------

create or replace function create_challenge(
  p_season_id uuid,
  p_title text,
  p_description text,
  p_category challenge_category,
  p_program_type program_type,
  p_scope challenge_scope,
  p_branch_id uuid,
  p_measurement_type challenge_measurement_type,
  p_measurement_unit text,
  p_scoring_direction challenge_scoring_direction,
  p_weight integer,
  p_registration_start_at timestamptz,
  p_registration_end_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_eligibility_rules jsonb default '[]'::jsonb
)
returns table (challenge_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.auth_role();
  v_caller_branch_id uuid;
  v_min_weight integer;
  v_max_weight integer;
  v_new_id uuid;
  v_eligibility_rule jsonb;
  v_rule_type text;
  v_rule_value jsonb;
begin
  if v_role not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can create a competition.';
  end if;

  if v_role = 'branch_manager' then
    select branch_id into v_caller_branch_id from public.profiles where id = auth.uid();
    if p_scope <> 'BRANCH' or p_branch_id is distinct from v_caller_branch_id then
      raise exception 'A branch manager can only create a branch-scoped competition for their own branch.';
    end if;
  end if;

  select value::integer into v_min_weight from public.challenge_settings where key = 'min_weight';
  select value::integer into v_max_weight from public.challenge_settings where key = 'max_weight';

  if p_weight < v_min_weight or p_weight > v_max_weight then
    raise exception 'Competition weight must be between % and % (the currently configured range).', v_min_weight, v_max_weight;
  end if;

  insert into public.challenges (
    season_id, title, description, category, program_type, scope, branch_id,
    measurement_type, measurement_unit, scoring_direction, weight,
    registration_start_at, registration_end_at, starts_at, ends_at, created_by
  )
  values (
    p_season_id, p_title, p_description, p_category, p_program_type, p_scope, p_branch_id,
    p_measurement_type, p_measurement_unit, p_scoring_direction, p_weight,
    p_registration_start_at, p_registration_end_at, p_starts_at, p_ends_at, auth.uid()
  )
  returning id into v_new_id;

  for v_eligibility_rule in select * from jsonb_array_elements(p_eligibility_rules)
  loop
    v_rule_type := v_eligibility_rule ->> 'rule_type';
    v_rule_value := coalesce(v_eligibility_rule -> 'value', '{}'::jsonb);

    if v_rule_type = 'active_membership' then
      null; -- no parameters to validate

    elsif v_rule_type = 'program_type' then
      if not (v_rule_value ->> 'programType' = any (enum_range(null::public.program_type)::text[])) then
        raise exception 'Invalid eligibility rule: "%" is not a supported program type.', v_rule_value ->> 'programType';
      end if;

    elsif v_rule_type = 'min_age' or v_rule_type = 'max_age' then
      if (v_rule_value ->> 'age') !~ '^[0-9]+$' then
        raise exception 'Invalid eligibility rule: age "%" must be a non-negative integer.', v_rule_value ->> 'age';
      end if;

    elsif v_rule_type = 'branch' then
      if (v_rule_value ->> 'branchId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'Invalid eligibility rule: "%" is not a valid branchId (UUID).', v_rule_value ->> 'branchId';
      end if;
      if not exists (select 1 from public.branches where id = (v_rule_value ->> 'branchId')::uuid) then
        raise exception 'Invalid eligibility rule: branch "%" does not exist.', v_rule_value ->> 'branchId';
      end if;

    else
      raise exception 'Unsupported eligibility rule type: %.', v_rule_type;
    end if;

    insert into public.challenge_eligibility_rules (challenge_id, rule_type, value)
    values (v_new_id, v_rule_type::public.challenge_eligibility_rule_type, v_rule_value);
  end loop;

  return query select v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_challenge_participation — spec §2.7 FINAL DECISION: the
-- member's own request is auto-approved or auto-rejected in this same
-- call, server-side, against the challenge's configured eligibility
-- rules — never a manual coach approval step. The caller's member
-- identity is resolved via members.linked_profile_id = auth.uid(), which
-- stays unreachable in practice until that account-linking workflow
-- (Risk B) ships — this RPC is written and ready for that day, not
-- implementing it.
-- ---------------------------------------------------------------------------

create or replace function request_challenge_participation(p_challenge_id uuid)
returns table (
  participant_id uuid,
  challenge_id uuid,
  member_id uuid,
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
  v_member_id uuid;
  v_member_branch_id uuid;
  v_member_dob date;
  v_challenge public.challenges%rowtype;
  v_rule public.challenge_eligibility_rules%rowtype;
  v_eligible boolean := true;
  v_reason text := null;
  v_has_active_membership boolean;
  v_required_age integer;
  v_new_id uuid;
begin
  select id, branch_id, date_of_birth into v_member_id, v_member_branch_id, v_member_dob
  from public.members where linked_profile_id = auth.uid();

  if v_member_id is null then
    raise exception 'No linked member record for this account. Account linking is required before requesting participation.';
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

  if exists (
    select 1 from public.challenge_participants where challenge_id = p_challenge_id and member_id = v_member_id
  ) then
    raise exception 'A participation request already exists for this competition.';
  end if;

  select exists (
    select 1 from public.memberships where member_id = v_member_id and status = 'active'
  ) into v_has_active_membership;

  for v_rule in
    select * from public.challenge_eligibility_rules where challenge_id = p_challenge_id order by created_at
  loop
    exit when not v_eligible;

    if v_rule.rule_type = 'active_membership' then
      if not v_has_active_membership then
        v_eligible := false;
        v_reason := 'Requires an active membership.';
      end if;

    elsif v_rule.rule_type = 'program_type' then
      if not exists (
        select 1 from public.memberships
        where member_id = v_member_id and status = 'active'
          and program_type = (v_rule.value ->> 'programType')::public.program_type
      ) then
        v_eligible := false;
        v_reason := format('Requires an active %s membership.', v_rule.value ->> 'programType');
      end if;

    elsif v_rule.rule_type = 'min_age' then
      v_required_age := (v_rule.value ->> 'age')::integer;
      if v_member_dob is null then
        v_eligible := false;
        v_reason := 'Date of birth is required to check age eligibility.';
      elsif extract(year from age(v_member_dob)) < v_required_age then
        v_eligible := false;
        v_reason := format('Minimum age is %s.', v_required_age);
      end if;

    elsif v_rule.rule_type = 'max_age' then
      v_required_age := (v_rule.value ->> 'age')::integer;
      if v_member_dob is null then
        v_eligible := false;
        v_reason := 'Date of birth is required to check age eligibility.';
      elsif extract(year from age(v_member_dob)) > v_required_age then
        v_eligible := false;
        v_reason := format('Maximum age is %s.', v_required_age);
      end if;

    elsif v_rule.rule_type = 'branch' then
      if v_member_branch_id is distinct from (v_rule.value ->> 'branchId')::uuid then
        v_eligible := false;
        v_reason := 'Not a member of the required branch.';
      end if;
    end if;
  end loop;

  insert into public.challenge_participants (challenge_id, member_id, status, eligibility_result, eligibility_reason)
  values (
    p_challenge_id, v_member_id,
    case when v_eligible then 'approved' else 'rejected' end,
    v_eligible, v_reason
  )
  returning id into v_new_id;

  return query
    select cp.id, cp.challenge_id, cp.member_id, cp.status, cp.eligibility_result, cp.eligibility_reason, cp.requested_at, cp.created_at
    from public.challenge_participants cp
    where cp.id = v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- designate_challenge_coach — Branch Manager/Super Admin only; the
-- ambiguity-override escape hatch from spec §6.6. Every override is
-- audit-logged via the existing log_audit_event(), same as every other
-- privileged write in this codebase.
--
-- M-2 remediation: `p_reason` is now required — no override may be
-- silent. The automatic (non-override) resolution is computed and
-- recorded in the audit log regardless of whether it matched the
-- requested override, so a manager overriding an ALREADY-unambiguous
-- automatic assignment is never silent either — it is explicitly flagged
-- in the audit trail (`overrode_unambiguous_automatic_resolution`) rather
-- than hard-blocked outright, preserving the ability to correct a
-- technically-unambiguous-but-wrong automatic resolution (the existing
-- ambiguity-resolution workflow is unchanged and still works exactly as
-- before for the genuinely ambiguous case).
--
-- Second-pass remediation (branch isolation, found during final review):
-- the FIRST draft of this function scoped caller authorization to the
-- CHALLENGE's branch (`is_branch_staff(v_challenge.branch_id)`), which is
-- null/bypassed entirely for an ALL_BRANCHES challenge — meaning ANY
-- branch_manager, at ANY branch, could designate ANY coach, at ANY
-- branch, for an ALL_BRANCHES challenge, with only the coach's ROLE ever
-- checked, never their branch. The correct scope for "designate a coach
-- for THIS member" is the MEMBER's own home branch, not the challenge's
-- (which may have none, for ALL_BRANCHES) — a coach operates at a
-- branch, and coaching a member is inherently scoped to that member's
-- branch regardless of whether the competition itself spans every
-- branch. Both checks below now use the member's branch_id:
--   1. the caller must be branch staff (branch_manager/super_admin) FOR
--      THE MEMBER'S BRANCH, not the challenge's;
--   2. the designated coach's own profile must belong to that same
--      branch — never merely "a profile with the coach role," which was
--      this function's original, incomplete check.
-- ---------------------------------------------------------------------------

create or replace function designate_challenge_coach(p_participant_id uuid, p_coach_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.challenge_participants%rowtype;
  v_member_branch_id uuid;
  v_coach_role public.user_role;
  v_coach_branch_id uuid;
  v_old_coach_id uuid;
  v_automatic_coach_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to designate or change a participant''s assigned coach.';
  end if;

  select * into v_participant from public.challenge_participants where id = p_participant_id;
  if v_participant.id is null then
    raise exception 'Challenge participant not found: %', p_participant_id;
  end if;

  select branch_id into v_member_branch_id from public.members where id = v_participant.member_id;

  if not (
    public.auth_role() in ('branch_manager', 'super_admin')
    and public.is_branch_staff(v_member_branch_id)
  ) then
    raise exception 'Only a branch manager or super admin for this member''s branch may designate a coach for this participant.';
  end if;

  select role, branch_id into v_coach_role, v_coach_branch_id from public.profiles where id = p_coach_id;
  if v_coach_role is distinct from 'coach' then
    raise exception 'The designated coach must be a profile with the coach role.';
  end if;
  if v_coach_branch_id is distinct from v_member_branch_id then
    raise exception 'The designated coach must belong to the same branch as the member.';
  end if;

  v_old_coach_id := v_participant.designated_coach_id;
  v_automatic_coach_id := public.resolve_automatic_coach_for_member(v_participant.challenge_id, v_participant.member_id);

  update public.challenge_participants set designated_coach_id = p_coach_id where id = p_participant_id;

  perform public.log_audit_event(
    'designate_challenge_coach', 'challenge_participant', p_participant_id,
    jsonb_build_object('designated_coach_id', v_old_coach_id),
    jsonb_build_object('designated_coach_id', p_coach_id),
    jsonb_build_object(
      'reason', p_reason,
      'automatic_resolution', v_automatic_coach_id,
      'overrode_unambiguous_automatic_resolution', v_automatic_coach_id is not null and v_automatic_coach_id <> p_coach_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_challenge_result — only the member's resolved assigned coach
-- (spec §6.6/Risk A) may submit; never a silent guess when the rule
-- doesn't resolve to exactly one coach.
--
-- H-1 remediation — exact time-boundary rule: a result may be submitted
-- only while the challenge's own status is 'active' or 'completed'. Not
-- 'draft'/'published'/'registration_open' (the competition hasn't
-- started yet — there is nothing to report a result for), and not
-- 'archived' (the competition is permanently sealed). 'completed' is
-- deliberately included alongside 'active': in practice a result is
-- often entered and reviewed shortly AFTER the competition's own
-- starts_at/ends_at window closes (judges finish compiling results once
-- the event itself is over), and nothing in this schema auto-transitions
-- status over time on a schedule (confirmed: no cron job or trigger
-- advances challenge.status — it is changed only by an explicit,
-- human-driven status-transition call), so gating on raw timestamps
-- alone would be both too strict (blocking legitimate late entry during
-- 'completed') and too permissive (status could otherwise go stale) —
-- gating on status, which a Branch Manager/Super Admin explicitly
-- controls, is the correct and simplest boundary here.
--
-- Second-pass remediation (duplicate original submission, found during
-- final review): nothing previously stopped a coach from calling this a
-- SECOND time for a (challenge, member) pair that already has a current
-- official result (status='approved', superseded_by_result_id null) from
-- an earlier, separate submission — the three Phase 1 partial unique
-- indexes only ever prevented two *simultaneously pending* originals
-- (uq_challenge_results_one_pending_original), never a brand new
-- 'pending' original once one has already been approved. The fix is
-- two-layered, matching this codebase's "client/RPC validates too, the
-- index is still the real last-line gate" convention used everywhere
-- else in this file:
--   1. a friendly, explicit check here, raising a clear domain message
--      pointing at the correction workflow instead of a raw constraint
--      violation;
--   2. uq_challenge_results_no_duplicate_original (new, added at the end
--      of this file rather than editing the Phase 1 migration) as the
--      actual database-level guarantee, covering the identical race this
--      file's other checks all have (two concurrent submit calls could
--      both pass this IF check before either commits — the index is
--      what makes the second one fail instead of silently succeeding).
-- A REJECTED original never blocks a fresh resubmission (a rejected
-- result was never official — see this file's reject_challenge_result()
-- comment elsewhere), and a result that was later superseded by an
-- approved correction still correctly blocks a brand new original (the
-- member already has an official result; any further change belongs in
-- the correction workflow, targeting whatever is current now) — both
-- behaviors fall out of checking `status in ('pending', 'approved')`
-- rather than `status = 'approved' and superseded_by_result_id is null`.
-- ---------------------------------------------------------------------------

create or replace function submit_challenge_result(
  p_challenge_id uuid,
  p_member_id uuid,
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
  v_participant_status public.challenge_participant_status;
  v_required_coach uuid;
  v_new_id uuid;
begin
  select status into v_challenge_status from public.challenges where id = p_challenge_id;
  if v_challenge_status is null then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;
  if v_challenge_status not in ('active', 'completed') then
    raise exception 'Results can only be submitted while a competition is active or completed, not while it is % .', v_challenge_status;
  end if;

  select status into v_participant_status
  from public.challenge_participants
  where challenge_id = p_challenge_id and member_id = p_member_id;

  if v_participant_status is distinct from 'approved' then
    raise exception 'This member is not an approved participant in this competition.';
  end if;

  v_required_coach := public.resolve_assigned_coach_for_member(p_challenge_id, p_member_id);
  if v_required_coach is null or v_required_coach <> auth.uid() then
    raise exception 'Only this member''s assigned coach may submit a result for them.';
  end if;

  if exists (
    select 1 from public.challenge_results
    where challenge_id = p_challenge_id and member_id = p_member_id
      and corrects_result_id is null and status in ('pending', 'approved')
  ) then
    raise exception 'This member already has a result for this competition. Use the correction workflow to change it instead of submitting a new one.';
  end if;

  insert into public.challenge_results (challenge_id, member_id, entered_by_profile_id, result_value, measurement_unit, performed_at, status)
  values (p_challenge_id, p_member_id, auth.uid(), p_result_value, p_measurement_unit, p_performed_at, 'pending')
  returning id into v_new_id;

  return query select v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_challenge_result / reject_challenge_result — spec §7: a coach
-- can never approve or reject their own submitted result; approval by
-- another coach or Branch Manager (Super Admin always included, same
-- escalation convention as every other role check in this codebase).
-- Only an ordinary ('pending') submission is handled here — a
-- CORRECTION_PENDING row goes through approve/reject_challenge_result_
-- correction() below instead, since challenge_results.status already
-- distinguishes the two and a 'pending' row is never also a correction
-- (see the Phase 1 migration's three correction-chain indexes).
--
-- M-3 remediation: the initial status read now takes a row lock
-- (`for update`), closing the narrow window where two concurrent calls
-- on the same result_id could both read status='pending' before either
-- committed and both insert a review row. With the lock, the second
-- caller blocks until the first transaction commits, then re-reads the
-- now-'approved'/'rejected' status and correctly raises instead of
-- proceeding.
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
begin
  select * into v_result from public.challenge_results where id = p_result_id for update;
  if v_result.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_result.status <> 'pending' then
    raise exception 'Only a pending result can be approved.';
  end if;

  select * into v_challenge from public.challenges where id = v_result.challenge_id;

  if v_result.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot approve your own submitted result.';
  end if;
  if not (
    public.auth_role() in ('coach', 'branch_manager', 'super_admin')
    and (v_challenge.scope = 'ALL_BRANCHES' or public.is_branch_staff(v_challenge.branch_id))
  ) then
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

  if v_result.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot reject your own submitted result.';
  end if;
  if not (
    public.auth_role() in ('coach', 'branch_manager', 'super_admin')
    and (v_challenge.scope = 'ALL_BRANCHES' or public.is_branch_staff(v_challenge.branch_id))
  ) then
    raise exception 'Not authorized to review this result.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- request_challenge_result_correction — a correction is always a NEW row
-- (status = 'correction_pending'), never an edit of the current approved
-- row it targets. Same assigned-coach gate as an original submission.
--
-- H-1 remediation: same exact time-boundary rule as submit_challenge_
-- result() above — a correction may only be requested while the
-- challenge's status is 'active' or 'completed'.
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
  v_required_coach uuid;
  v_new_id uuid;
begin
  select * into v_original from public.challenge_results where id = p_corrects_result_id;
  if v_original.id is null then
    raise exception 'Challenge result not found: %', p_corrects_result_id;
  end if;
  if v_original.status <> 'approved' or v_original.superseded_by_result_id is not null then
    raise exception 'A correction can only be requested against the current approved result.';
  end if;

  select status into v_challenge_status from public.challenges where id = v_original.challenge_id;
  if v_challenge_status not in ('active', 'completed') then
    raise exception 'Corrections can only be requested while a competition is active or completed, not while it is % .', v_challenge_status;
  end if;

  v_required_coach := public.resolve_assigned_coach_for_member(v_original.challenge_id, v_original.member_id);
  if v_required_coach is null or v_required_coach <> auth.uid() then
    raise exception 'Only this member''s assigned coach may request a correction for them.';
  end if;

  insert into public.challenge_results (
    challenge_id, member_id, entered_by_profile_id, result_value, measurement_unit, performed_at, status, corrects_result_id
  )
  values (
    v_original.challenge_id, v_original.member_id, auth.uid(), p_result_value, p_measurement_unit, p_performed_at,
    'correction_pending', p_corrects_result_id
  )
  returning id into v_new_id;

  return query select v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_challenge_result_correction / reject_challenge_result_
-- correction — approving atomically (a) marks the correction row
-- 'approved', (b) sets superseded_by_result_id on the original it
-- replaces, and (c) recomputes the whole challenge's ranking so every
-- affected participant's points are reconciled, not just the corrected
-- member's — all inside this one function's single implicit transaction.
-- Rejecting a correction leaves the original row completely untouched
-- (still current), so no recompute is needed.
--
-- M-3 remediation: same `for update` row-lock fix as approve/reject_
-- challenge_result() above.
-- ---------------------------------------------------------------------------

create or replace function approve_challenge_result_correction(p_result_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.challenge_results%rowtype;
  v_challenge public.challenges%rowtype;
begin
  select * into v_correction from public.challenge_results where id = p_result_id for update;
  if v_correction.id is null then
    raise exception 'Challenge result not found: %', p_result_id;
  end if;
  if v_correction.status <> 'correction_pending' then
    raise exception 'Only a pending correction can be approved.';
  end if;

  select * into v_challenge from public.challenges where id = v_correction.challenge_id;

  if v_correction.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot approve your own correction request.';
  end if;
  if not (
    public.auth_role() in ('coach', 'branch_manager', 'super_admin')
    and (v_challenge.scope = 'ALL_BRANCHES' or public.is_branch_staff(v_challenge.branch_id))
  ) then
    raise exception 'Not authorized to review this correction.';
  end if;

  -- Order matters: uq_challenge_results_current (Phase 1 migration) is an
  -- IMMEDIATE partial unique index on (challenge_id, member_id) where
  -- status='approved' and superseded_by_result_id is null. Superseding
  -- the original FIRST removes it from that index's matching set before
  -- the correction's own status flips to 'approved' — doing it in the
  -- other order makes both rows match simultaneously (for the instant
  -- between the two statements) and the first UPDATE's own immediate
  -- constraint check fails with a duplicate-key violation. Caught by
  -- actually running this migration against a real local Postgres
  -- instance during the Phase 2 security remediation — reading the SQL
  -- alone never surfaced it.
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

  if v_correction.entered_by_profile_id = auth.uid() then
    raise exception 'You cannot reject your own correction request.';
  end if;
  if not (
    public.auth_role() in ('coach', 'branch_manager', 'super_admin')
    and (v_challenge.scope = 'ALL_BRANCHES' or public.is_branch_staff(v_challenge.branch_id))
  ) then
    raise exception 'Not authorized to review this correction.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- L-1 remediation — explicit, least-privilege EXECUTE grants/revokes.
--
-- Postgres grants EXECUTE on a newly created function to PUBLIC by
-- default. This migration's first draft relied entirely on each
-- function's own in-body role check instead of ever touching that
-- default — which is this codebase's established convention (
-- convert_lead_to_member(), register_membership(), enforce_lead_
-- assignment_rules() all do the same) — but it meant the two internal-
-- only helpers below (findings C-1, H-2) had NO protection at all,
-- in-body or privilege-level, since neither was ever meant to be called
-- by a client directly and so neither got an in-body check either.
--
-- This section locks every one of the 14 functions in this file down to
-- the minimum that is actually needed:
--   - The 11 business-action RPCs (each already self-checks the
--     caller's role/branch/ownership internally) are granted to
--     `authenticated` only, never `anon` — an unauthenticated caller can
--     never reach any of them. This is strictly additive protection: none
--     of them can meaningfully run for `anon` anyway (auth.uid() would be
--     null, and every one of them needs a real caller identity), so no
--     legitimate caller's behavior changes.
--   - The 3 internal-only helpers (resolve_automatic_coach_for_member,
--     resolve_assigned_coach_for_member, recompute_challenge_points) get
--     EXECUTE revoked from every client-facing role. Their remaining
--     callers are exclusively the SECURITY DEFINER RPCs above, which
--     call them from within their own elevated execution context — a
--     function's owner always retains EXECUTE on functions it owns
--     regardless of what is revoked from other roles, and a SECURITY
--     DEFINER caller's nested calls run under that same owner identity,
--     so no authorized internal call path is affected.
-- ---------------------------------------------------------------------------

revoke execute on function public.resolve_automatic_coach_for_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_assigned_coach_for_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.recompute_challenge_points(uuid, text) from public, anon, authenticated;

revoke execute on function public.create_challenge_season(text, text, date, date) from public;
grant execute on function public.create_challenge_season(text, text, date, date) to authenticated;

revoke execute on function public.set_challenge_weight_range(integer, integer) from public;
grant execute on function public.set_challenge_weight_range(integer, integer) to authenticated;

revoke execute on function public.create_challenge(
  uuid, text, text, challenge_category, program_type, challenge_scope, uuid,
  challenge_measurement_type, text, challenge_scoring_direction, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, jsonb
) from public;
grant execute on function public.create_challenge(
  uuid, text, text, challenge_category, program_type, challenge_scope, uuid,
  challenge_measurement_type, text, challenge_scoring_direction, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, jsonb
) to authenticated;

revoke execute on function public.request_challenge_participation(uuid) from public;
grant execute on function public.request_challenge_participation(uuid) to authenticated;

revoke execute on function public.designate_challenge_coach(uuid, uuid, text) from public;
grant execute on function public.designate_challenge_coach(uuid, uuid, text) to authenticated;

revoke execute on function public.submit_challenge_result(uuid, uuid, numeric, text, timestamptz) from public;
grant execute on function public.submit_challenge_result(uuid, uuid, numeric, text, timestamptz) to authenticated;

revoke execute on function public.approve_challenge_result(uuid, text) from public;
grant execute on function public.approve_challenge_result(uuid, text) to authenticated;

revoke execute on function public.reject_challenge_result(uuid, text) from public;
grant execute on function public.reject_challenge_result(uuid, text) to authenticated;

revoke execute on function public.request_challenge_result_correction(uuid, numeric, text, timestamptz) from public;
grant execute on function public.request_challenge_result_correction(uuid, numeric, text, timestamptz) to authenticated;

revoke execute on function public.approve_challenge_result_correction(uuid, text) from public;
grant execute on function public.approve_challenge_result_correction(uuid, text) to authenticated;

revoke execute on function public.reject_challenge_result_correction(uuid, text) from public;
grant execute on function public.reject_challenge_result_correction(uuid, text) to authenticated;
