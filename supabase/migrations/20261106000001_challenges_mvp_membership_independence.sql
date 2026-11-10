-- 9th Round Challenges — Phase 3: MVP simplification. Removes every
-- dependency on gym membership (members, memberships, linked_profile_id,
-- memberships.coach_id, membership-based eligibility) per the approved
-- product pivot. Participant identity becomes profiles.id directly
-- (already populated for every authenticated account via the existing
-- handle_new_user() trigger — no new linking workflow needed, unlike the
-- permanently-unused members.linked_profile_id it replaces). Branch
-- association becomes a fact Challenges owns itself (challenge_
-- participants.branch_id, chosen by the participant at registration),
-- never derived from any membership record.
--
-- NOT EXECUTED against Supabase or any production database. Purely
-- additive relative to Phase 1 (20261105000001_challenges_foundation.sql)
-- and Phase 2 (20261105000002_challenges_rls_and_rpcs.sql) — neither of
-- those files is edited; everything below is new DDL/DML issued on top of
-- what they created. Verified against the same local, throwaway
-- PostgreSQL 16 harness as the prior two remediation rounds (now extended
-- — see supabase/tests/challenges_phase2/).
--
-- Scope also expands from 2 values (BRANCH, ALL_BRANCHES) to 3 (BRANCH,
-- GLOBAL, MULTI_BRANCH) per the approved revised architecture. Renaming
-- ALL_BRANCHES to GLOBAL (rather than leaving the old name and adding a
-- synonym) follows the same precedent already used in this exact
-- codebase for enum relabeling (20260806000001_role_model_v2.sql renamed
-- 'admin'->'branch_manager' etc.) — every policy/function that compared
-- against the literal 'ALL_BRANCHES' is updated below in the same breath.

-- ---------------------------------------------------------------------------
-- Scope enum expansion
-- ---------------------------------------------------------------------------

alter type challenge_scope rename value 'ALL_BRANCHES' to 'GLOBAL';
alter type challenge_scope add value 'MULTI_BRANCH';

-- Phase 1's chk_challenge_scope_branch check constraint is an exhaustive
-- OR of exactly the 2 scopes that existed at the time: it has no clause
-- for MULTI_BRANCH at all, so a MULTI_BRANCH row (branch_id null, same as
-- GLOBAL) matches NEITHER of its two clauses and is rejected outright —
-- confirmed by actually running this migration against the local
-- harness, not assumed from reading the DDL. Replaced with the
-- equivalent 3-way check.
alter table challenges drop constraint chk_challenge_scope_branch;
alter table challenges add constraint chk_challenge_scope_branch check (
  (scope = 'GLOBAL' and branch_id is null)
  or (scope = 'BRANCH' and branch_id is not null)
  or (scope = 'MULTI_BRANCH' and branch_id is null)
);

-- ---------------------------------------------------------------------------
-- challenge_branches — which branches a MULTI_BRANCH competition is open
-- to. Unused for GLOBAL (no rows; open to everyone) and BRANCH (the one
-- branch already lives on challenges.branch_id — no need to duplicate it
-- here). This table, not any membership record, is now the only source
-- of truth for "which branches can this competition's participants
-- choose from."
-- ---------------------------------------------------------------------------

create table challenge_branches (
  challenge_id uuid not null references challenges (id) on delete cascade,
  branch_id uuid not null references branches (id),
  created_at timestamptz not null default now(),
  primary key (challenge_id, branch_id)
);
alter table challenge_branches enable row level security;

-- ---------------------------------------------------------------------------
-- challenge_display_names — ONE display name per authenticated account,
-- reused across every competition and every season leaderboard (per the
-- approved product clarification: account-level, not competition-level).
-- Never defaults to profiles.full_name (a real name) — this is the only
-- thing ever shown publicly. Editable later through account settings via
-- the same set_challenge_display_name() RPC this migration adds.
-- ---------------------------------------------------------------------------

create table challenge_display_names (
  profile_id uuid primary key references profiles (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_challenge_display_names_length
    check (char_length(btrim(display_name)) between 2 and 30)
);

create trigger trg_challenge_display_names_updated_at
  before update on challenge_display_names
  for each row execute function set_updated_at();
alter table challenge_display_names enable row level security;

-- ---------------------------------------------------------------------------
-- challenge_participants — gains the participant's own, self-chosen
-- branch (competition-specific, per the approved clarification: the same
-- account may pick a different eligible branch for a different
-- competition). Nullable: null for GLOBAL participation, where there is
-- no branch to pick. Required (enforced in request_challenge_
-- participation(), not by a column constraint, since the requirement
-- depends on the parent challenge's scope) for BRANCH/MULTI_BRANCH.
-- ---------------------------------------------------------------------------

alter table challenge_participants add column branch_id uuid references branches (id);

-- ---------------------------------------------------------------------------
-- Identity retarget: member_id (-> members) becomes participant_profile_id
-- (-> profiles) on all three tables that carried it. This is the schema
-- expression of the whole MVP pivot — Challenges no longer has any
-- foreign key into members/memberships at all after this migration.
-- ---------------------------------------------------------------------------

alter table challenge_participants rename column member_id to participant_profile_id;
alter table challenge_participants drop constraint challenge_participants_member_id_fkey;
alter table challenge_participants add constraint challenge_participants_participant_profile_id_fkey
  foreign key (participant_profile_id) references profiles (id) on delete cascade;
alter index idx_challenge_participants_member rename to idx_challenge_participants_profile;

alter table challenge_results rename column member_id to participant_profile_id;
alter table challenge_results drop constraint challenge_results_member_id_fkey;
alter table challenge_results add constraint challenge_results_participant_profile_id_fkey
  foreign key (participant_profile_id) references profiles (id) on delete cascade;
alter index idx_challenge_results_member rename to idx_challenge_results_profile;

alter table challenge_points_ledger rename column member_id to participant_profile_id;
alter table challenge_points_ledger drop constraint challenge_points_ledger_member_id_fkey;
alter table challenge_points_ledger add constraint challenge_points_ledger_participant_profile_id_fkey
  foreign key (participant_profile_id) references profiles (id) on delete restrict;
alter index idx_challenge_points_ledger_season_member rename to idx_challenge_points_ledger_season_profile;

-- Note: the four Phase 1 partial unique indexes on challenge_results
-- (uq_challenge_results_current, uq_challenge_results_one_pending_
-- correction, uq_challenge_results_one_pending_original) and the Phase 2
-- addition (uq_challenge_results_no_duplicate_original) all reference
-- columns by position internally — Postgres updates them transparently
-- on a column rename, no index recreation needed. Verified against the
-- local harness below, not merely assumed.

-- ---------------------------------------------------------------------------
-- RLS — drop every policy that referenced members/linked_profile_id or
-- the old 'ALL_BRANCHES' literal, replace with ones reflecting the new
-- identity/branch/scope model. Customers can now browse and read
-- competition data directly (previously only staff could see anything
-- but ALL_BRANCHES challenges — a real gap for a feature whose first
-- step is "customers browse available competitions").
-- ---------------------------------------------------------------------------

drop policy "staff read challenges" on challenges;
drop policy "staff read challenge eligibility rules" on challenge_eligibility_rules;
drop policy "staff read challenge participants" on challenge_participants;
drop policy "member reads own challenge participation" on challenge_participants;
drop policy "staff read challenge results" on challenge_results;
drop policy "member reads own challenge results" on challenge_results;
drop policy "staff read challenge result reviews" on challenge_result_reviews;
drop policy "member reads own challenge result reviews" on challenge_result_reviews;
drop policy "staff read challenge points ledger" on challenge_points_ledger;
drop policy "member reads own challenge points ledger" on challenge_points_ledger;

-- challenges: any authenticated account (staff or customer) can browse a
-- published competition; a draft stays visible only to its own creator
-- or branch staff of the branch it's being built for (so a manager can
-- keep editing it) or super_admin.
create policy "authenticated read published challenges" on challenges for select
  using (auth_role() is not null and status <> 'draft');
create policy "staff read own draft challenges" on challenges for select
  using (status = 'draft' and (created_by = auth.uid() or is_branch_staff(branch_id) or is_super_admin()));

-- challenge_branches: which branches a competition is open to is exactly
-- what a customer needs to see to pick one at registration — no
-- restriction beyond being signed in.
create policy "authenticated read challenge branches" on challenge_branches for select
  using (auth_role() is not null);

-- challenge_eligibility_rules: visible wherever the parent challenge is
-- (same published/own-draft logic, via join, so customers can review the
-- rules before registering).
create policy "authenticated read challenge eligibility rules" on challenge_eligibility_rules for select
  using (
    auth_role() is not null
    and exists (
      select 1 from challenges c
      where c.id = challenge_eligibility_rules.challenge_id
        and (c.status <> 'draft' or c.created_by = auth.uid() or is_branch_staff(c.branch_id) or is_super_admin())
    )
  );

-- challenge_participants: a participant's RAW record is private. It
-- carries eligibility_reason (which states WHY someone was auto-rejected
-- — e.g. "Minimum age is 18.", effectively disclosing something about
-- their age) and designated_coach_id, neither of which belongs to any
-- other customer. Readable only by the participant themselves and by
-- staff within their permitted scope; a pending/rejected participant's
-- record is therefore never visible to another customer at all.
--
-- The public-facing subset (display name, branch, value, rank) is NOT
-- served from this table — it is served exclusively by the leaderboard
-- views at the bottom of this file, which project only those columns.
-- See the note above those views for why they must run with the view
-- owner's rights for that to work against these narrowed policies.
create policy "participant reads own participation" on challenge_participants for select
  using (participant_profile_id = auth.uid());
create policy "staff read challenge participants" on challenge_participants for select
  using (
    auth_role() in ('coach', 'reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from challenges c
      where c.id = challenge_participants.challenge_id
        and (c.scope = 'GLOBAL' or is_branch_staff(challenge_participants.branch_id))
    )
  );

-- challenge_results: an APPROVED, CURRENT result is the one thing that's
-- genuinely public (it's what a leaderboard shows) — readable by anyone
-- signed in. A pending/rejected/correction_pending result is not yet
-- public (it could be wrong, still disputed, or simply not reviewed yet)
-- and stays restricted to the participant themselves or branch staff —
-- scoped, for MULTI_BRANCH/GLOBAL, to the PARTICIPANT's own chosen
-- branch (there is no single challenge-level branch for either scope to
-- check against).
--
-- The staff policy's role gate (`auth_role() in (...)`) is load-bearing,
-- NOT redundant with is_branch_staff(): for a GLOBAL challenge the
-- branch clause short-circuits to true for EVERY caller (there is no
-- branch to match against), so without the role gate this single
-- permissive policy alone would expose every pending/rejected result of
-- every GLOBAL competition to any caller at all — `anon` included, since
-- Postgres unions permissive policies with OR and the other two policies
-- here cannot take that access back. The role list mirrors
-- is_branch_staff()'s own (branch_manager/reception/coach/sales_employee
-- + super_admin) so staff reads that worked under Phase 2's
-- branch-scoped policy keep working unchanged; it is the BRANCH
-- requirement, not the STAFF requirement, that GLOBAL waives. The
-- matching authorization check inside approve/reject_challenge_result()
-- already ANDs its own role check the same way — this policy was the one
-- place that shape got transcribed without it.
create policy "authenticated read current approved results" on challenge_results for select
  using (auth_role() is not null and status = 'approved' and superseded_by_result_id is null);
create policy "participant reads own results" on challenge_results for select
  using (participant_profile_id = auth.uid());
create policy "staff read challenge results" on challenge_results for select
  using (
    auth_role() in ('coach', 'reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from challenges c
      left join challenge_participants cp
        on cp.challenge_id = challenge_results.challenge_id and cp.participant_profile_id = challenge_results.participant_profile_id
      where c.id = challenge_results.challenge_id
        and (c.scope = 'GLOBAL' or is_branch_staff(cp.branch_id))
    )
  );

-- challenge_result_reviews: review notes can carry staff commentary —
-- not blanket-public like results/points. Same participant-branch
-- scoping as above for staff, and the same load-bearing role gate for
-- exactly the same GLOBAL-scope reason.
create policy "participant reads own result reviews" on challenge_result_reviews for select
  using (exists (
    select 1 from challenge_results r
    where r.id = challenge_result_reviews.result_id and r.participant_profile_id = auth.uid()
  ));
create policy "staff read challenge result reviews" on challenge_result_reviews for select
  using (
    auth_role() in ('coach', 'reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from challenge_results r
      join challenges c on c.id = r.challenge_id
      left join challenge_participants cp
        on cp.challenge_id = r.challenge_id and cp.participant_profile_id = r.participant_profile_id
      where r.id = challenge_result_reviews.result_id
        and (c.scope = 'GLOBAL' or is_branch_staff(cp.branch_id))
    )
  );

-- challenge_points_ledger: raw ledger entries are an append-only audit
-- trail (every award, every compensating reversal, with its reason and
-- the staff member who triggered it), not public data. Same shape as
-- challenge_participants above: own rows plus staff within scope, with
-- the participant's own chosen branch deciding that scope and GLOBAL
-- waiving the branch requirement (not the staff requirement). Season
-- TOTALS remain public, but only as aggregates through the two season
-- leaderboard views — never as the underlying per-entry rows.
create policy "participant reads own points ledger" on challenge_points_ledger for select
  using (participant_profile_id = auth.uid());
create policy "staff read challenge points ledger" on challenge_points_ledger for select
  using (
    auth_role() in ('coach', 'reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from challenges c
      left join challenge_participants cp
        on cp.challenge_id = challenge_points_ledger.challenge_id
       and cp.participant_profile_id = challenge_points_ledger.participant_profile_id
      where c.id = challenge_points_ledger.challenge_id
        and (c.scope = 'GLOBAL' or is_branch_staff(cp.branch_id))
    )
  );

-- challenge_display_names: the whole point of this table is to be the
-- public-facing name shown on leaderboards — broadly readable.
create policy "authenticated read display names" on challenge_display_names for select
  using (auth_role() is not null);

-- ---------------------------------------------------------------------------
-- Drop the membership-based coach-resolution machinery entirely. Coach
-- assignment for the MVP is EXCLUSIVELY designate_challenge_coach() —
-- there is no automatic resolution to fall back to or compare against
-- any more, per the approved product decision ("Remove automatic coach
-- resolution through active gym memberships... Do not use membership
-- records to determine coach authorization").
-- ---------------------------------------------------------------------------

drop function if exists resolve_automatic_coach_for_member(uuid, uuid);
drop function if exists resolve_assigned_coach_for_member(uuid, uuid);

-- ---------------------------------------------------------------------------
-- recompute_challenge_points — unchanged logic, renamed column only.
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
    select r.id as result_id, r.participant_profile_id, r.result_value
    from public.challenge_results r
    where r.challenge_id = p_challenge_id
      and r.status = 'approved'
      and r.superseded_by_result_id is null
  ),
  ranked as (
    select
      cr.result_id,
      cr.participant_profile_id,
      rank() over (
        order by (case when v_direction = 'LOWER_IS_BETTER' then cr.result_value else -cr.result_value end)
      ) as rnk
    from current_results cr
  ),
  scored as (
    select
      result_id,
      participant_profile_id,
      coalesce((v_policy -> 'byRank' ->> (rnk - 1)::integer)::numeric, (v_policy ->> 'beyond')::numeric) * v_weight as earned_points
    from ranked
  ),
  totals as (
    select participant_profile_id, coalesce(sum(points_delta), 0) as current_total
    from public.challenge_points_ledger
    where challenge_id = p_challenge_id
    group by participant_profile_id
  )
  insert into public.challenge_points_ledger (season_id, challenge_id, participant_profile_id, result_id, points_delta, reason, created_by)
  select
    v_season_id,
    p_challenge_id,
    s.participant_profile_id,
    s.result_id,
    s.earned_points - coalesce(t.current_total, 0),
    p_reason,
    auth.uid()
  from scored s
  left join totals t on t.participant_profile_id = s.participant_profile_id
  where s.earned_points - coalesce(t.current_total, 0) <> 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_challenge_display_name — the only write path for the account-level
-- display name. Always upserts the CALLER's own row (auth.uid() is never
-- client-suppliable) — any authenticated account, staff or customer.
-- ---------------------------------------------------------------------------

create or replace function set_challenge_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_display_name is null or char_length(btrim(p_display_name)) < 2 or char_length(btrim(p_display_name)) > 30 then
    raise exception 'A display name must be between 2 and 30 characters.';
  end if;

  insert into public.challenge_display_names (profile_id, display_name)
  values (auth.uid(), btrim(p_display_name))
  on conflict (profile_id) do update set display_name = excluded.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_challenge — signature gains p_branch_ids (MULTI_BRANCH only).
-- Scope validation now covers all three scopes explicitly. Eligibility
-- rules accept only min_age/max_age — active_membership/program_type/
-- branch are no longer accepted at all (membership-based eligibility is
-- removed; "branch" eligibility is now structural, enforced by scope +
-- the participant's own choice in request_challenge_participation(),
-- not a separate rule layered on top).
-- ---------------------------------------------------------------------------

drop function if exists create_challenge(
  uuid, text, text, challenge_category, program_type, challenge_scope, uuid,
  challenge_measurement_type, text, challenge_scoring_direction, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, jsonb
);

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
  p_eligibility_rules jsonb default '[]'::jsonb,
  p_branch_ids uuid[] default null
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
  v_branch_id uuid;
begin
  -- coalesce, not a bare `not in`: auth_role() is NULL for an `anon`
  -- caller and for a DEACTIVATED staff member holding a live token, and
  -- `NULL not in (...)` is NULL, which plpgsql's IF treats as false —
  -- i.e. the guard would be skipped and the competition created. See
  -- 20261107000001_fail_closed_authorization_guards.sql for the full
  -- root cause.
  if coalesce(v_role, '') not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can create a competition.';
  end if;

  if v_role = 'branch_manager' then
    select branch_id into v_caller_branch_id from public.profiles where id = auth.uid();
    if p_scope <> 'BRANCH' or p_branch_id is distinct from v_caller_branch_id then
      raise exception 'A branch manager can only create a branch-scoped competition for their own branch.';
    end if;
  end if;

  if p_scope = 'GLOBAL' and p_branch_id is not null then
    raise exception 'A global competition cannot be scoped to a single branch.';
  end if;
  if p_scope = 'BRANCH' and p_branch_id is null then
    raise exception 'A branch competition must specify its branch.';
  end if;
  if p_scope = 'MULTI_BRANCH' then
    if p_branch_id is not null then
      raise exception 'A multi-branch competition has no single branch — list its eligible branches instead.';
    end if;
    if p_branch_ids is null or coalesce(array_length(p_branch_ids, 1), 0) < 1 then
      raise exception 'A multi-branch competition must list at least one eligible branch.';
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

  if p_scope = 'MULTI_BRANCH' then
    foreach v_branch_id in array p_branch_ids
    loop
      if not exists (select 1 from public.branches where id = v_branch_id) then
        raise exception 'Branch "%" does not exist.', v_branch_id;
      end if;
      insert into public.challenge_branches (challenge_id, branch_id) values (v_new_id, v_branch_id)
      on conflict do nothing;
    end loop;
  end if;

  for v_eligibility_rule in select * from jsonb_array_elements(p_eligibility_rules)
  loop
    v_rule_type := v_eligibility_rule ->> 'rule_type';
    v_rule_value := coalesce(v_eligibility_rule -> 'value', '{}'::jsonb);

    if v_rule_type = 'min_age' or v_rule_type = 'max_age' then
      if (v_rule_value ->> 'age') !~ '^[0-9]+$' then
        raise exception 'Invalid eligibility rule: age "%" must be a non-negative integer.', v_rule_value ->> 'age';
      end if;
    else
      raise exception 'Unsupported eligibility rule type: %. Only min_age and max_age are supported.', v_rule_type;
    end if;

    insert into public.challenge_eligibility_rules (challenge_id, rule_type, value)
    values (v_new_id, v_rule_type::public.challenge_eligibility_rule_type, v_rule_value);
  end loop;

  return query select v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_challenge_participation — identity resolves directly from
-- auth.uid() (no members lookup at all — the single biggest source of
-- this feature's previous non-functionality). Requires a display name to
-- already be set (account-level, set once via set_challenge_display_
-- name()). Branch choice is validated structurally against the
-- challenge's scope, never requiring manager approval. Eligibility now
-- covers only min_age/max_age, read from profiles.date_of_birth.
-- ---------------------------------------------------------------------------

drop function if exists request_challenge_participation(uuid);

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
  v_display_name text;
  v_profile_dob date;
  v_challenge public.challenges%rowtype;
  v_rule public.challenge_eligibility_rules%rowtype;
  v_eligible boolean := true;
  v_reason text := null;
  v_required_age integer;
  v_new_id uuid;
begin
  select display_name into v_display_name from public.challenge_display_names where profile_id = auth.uid();
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
    select 1 from public.challenge_participants cp where cp.challenge_id = p_challenge_id and cp.participant_profile_id = auth.uid()
  ) then
    raise exception 'A participation request already exists for this competition.';
  end if;

  select date_of_birth into v_profile_dob from public.profiles where id = auth.uid();

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
    p_challenge_id, auth.uid(), p_branch_id,
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

-- ---------------------------------------------------------------------------
-- designate_challenge_coach — branch scoping now reads the PARTICIPANT's
-- own chosen branch_id directly (no members join at all). A participant
-- with no selected branch (GLOBAL) can only have a coach designated by a
-- super_admin — there is no "home branch" to scope a branch_manager's
-- authority against. No more "automatic resolution" to compare against
-- in the audit log — there is no automatic resolution left; every
-- designation is the only source of coach authority now, so the audit
-- metadata simplifies to just the reason.
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

  select role, branch_id into v_coach_role, v_coach_branch_id from public.profiles where id = p_coach_id;
  if v_coach_role is distinct from 'coach' then
    raise exception 'The designated coach must be a profile with the coach role.';
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

-- ---------------------------------------------------------------------------
-- submit_challenge_result — coach authorization is now EXCLUSIVELY
-- "are you this participant's designated_coach_id" — no automatic
-- resolution, no memberships query, at all. A participant with no
-- designated coach yet blocks submission with a clear, actionable
-- message rather than any kind of silent fallback. Lifecycle gating and
-- the duplicate-original guard are unchanged in behavior, renamed
-- columns only.
--
-- The signature's parameter TYPES are unchanged from Phase 2 (uuid,
-- uuid, numeric, text, timestamptz), but the second parameter's NAME
-- changes (p_member_id -> p_participant_profile_id) — Postgres rejects
-- that under a plain CREATE OR REPLACE ("cannot change name of input
-- parameter"), confirmed by actually running this migration, so an
-- explicit DROP is required first, same as the two signature changes
-- above.
-- ---------------------------------------------------------------------------

drop function if exists submit_challenge_result(uuid, uuid, numeric, text, timestamptz);

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
  v_participant public.challenge_participants%rowtype;
  v_new_id uuid;
begin
  select status into v_challenge_status from public.challenges where id = p_challenge_id;
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
  if v_participant.designated_coach_id <> auth.uid() then
    raise exception 'Only this participant''s designated coach may submit a result for them.';
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

-- ---------------------------------------------------------------------------
-- approve_challenge_result / reject_challenge_result — review
-- authorization is now scoped to the RESULT's own participant's chosen
-- branch (via challenge_participants.branch_id), not the challenge's
-- branch_id — the only way to correctly support MULTI_BRANCH, where the
-- challenge itself has no single branch but each participant does.
-- GLOBAL still bypasses entirely (open to all staff), same as before.
-- `for update` locking (M-3) unchanged.
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
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge.scope = 'GLOBAL' or public.is_branch_staff(v_participant_branch_id))
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
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge.scope = 'GLOBAL' or public.is_branch_staff(v_participant_branch_id))
  ) then
    raise exception 'Not authorized to review this result.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- request_challenge_result_correction — coach authorization simplifies
-- to the same direct designated_coach_id check as submit_challenge_
-- result(). Lifecycle gating unchanged.
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

  select status into v_challenge_status from public.challenges where id = v_original.challenge_id;
  if v_challenge_status not in ('active', 'completed') then
    raise exception 'Corrections can only be requested while a competition is active or completed, not while it is % .', v_challenge_status;
  end if;

  select * into v_participant
  from public.challenge_participants
  where challenge_id = v_original.challenge_id and participant_profile_id = v_original.participant_profile_id;

  if v_participant.designated_coach_id is null or v_participant.designated_coach_id <> auth.uid() then
    raise exception 'Only this participant''s designated coach may request a correction for them.';
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

-- ---------------------------------------------------------------------------
-- approve_challenge_result_correction / reject_challenge_result_
-- correction — same participant-branch-scoped review authorization as
-- approve/reject_challenge_result() above. Atomicity (supersede-then-
-- approve ordering, M-3 locking, whole-challenge recompute) unchanged.
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
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge.scope = 'GLOBAL' or public.is_branch_staff(v_participant_branch_id))
  ) then
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
  if not (
    coalesce(public.auth_role() in ('coach', 'branch_manager', 'super_admin'), false)
    and (v_challenge.scope = 'GLOBAL' or public.is_branch_staff(v_participant_branch_id))
  ) then
    raise exception 'Not authorized to review this correction.';
  end if;

  update public.challenge_results set status = 'rejected' where id = p_result_id;
  insert into public.challenge_result_reviews (result_id, reviewer_profile_id, decision, notes)
  values (p_result_id, auth.uid(), 'rejected', p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards — the first actual read-paths for this data (none existed
-- before this phase). Plain views, not RPCs: both ranking kinds need no
-- runtime parameters beyond simple WHERE/filter clauses a client can
-- already express.
--
-- These views run with the VIEW OWNER's rights (`security_invoker =
-- false`, Postgres's default, stated explicitly here because it is a
-- deliberate security decision rather than an oversight). That makes
-- each view the access-control boundary for public leaderboard data:
-- the base tables it reads (challenge_participants, challenge_points_
-- ledger, challenge_results) are restricted by RLS to "own rows plus
-- staff in scope", and the view is the one sanctioned path through which
-- one customer may see another's standing — exposing only display_name,
-- branch, value/points and rank, never eligibility_reason,
-- designated_coach_id, a raw ledger entry's reason, or any profile
-- field.
--
-- Two things make that safe, and both are verified in
-- supabase/tests/challenges_phase2/95_leaderboards_and_rls.sql rather
-- than assumed:
--   1. Every view carries its own `auth_role() is not null` predicate.
--      Owner's rights bypass base-table RLS, so without this an `anon`
--      caller (whose key is public by design in a Supabase client) would
--      read every leaderboard. auth_role() resolves from the REQUEST's
--      auth.uid(), not from the view owner, so it still correctly
--      identifies the caller inside an owner's-rights view.
--   2. Each view's own WHERE/projection is the curation: current
--      approved results only, and only the columns above.
--
-- Note the history here, because the earlier Phase 3 draft had the
-- opposite setting for a good reason at the time: while the base tables
-- were broadly readable by any authenticated account, `security_invoker
-- = true` was the correct fix, since owner's rights would then have been
-- the ONLY gate and `anon` leaked through. Once the base policies were
-- narrowed to own-rows-plus-staff (the Finding 2 change), invoker rights
-- would instead have blanked the leaderboards out for everyone except
-- each viewer's own row — breaking the feature. The pairing that holds
-- both properties at once is: narrow base-table RLS + owner's-rights
-- views + an explicit in-view auth gate.
--
-- Both the per-challenge view and the two season views compute "overall"
-- and "branch" rankings as separate window-function columns in the SAME
-- query — a branch with only one real branch in it today naturally
-- produces a branch_rank identical to overall_rank, with no
-- special-casing anywhere for that.
-- ---------------------------------------------------------------------------

create view challenge_leaderboard with (security_invoker = false) as
select
  r.id as result_id,
  r.challenge_id,
  r.participant_profile_id,
  cp.branch_id,
  d.display_name,
  r.result_value,
  rank() over (
    partition by r.challenge_id
    order by (case when c.scoring_direction = 'LOWER_IS_BETTER' then r.result_value else -r.result_value end)
  ) as overall_rank,
  rank() over (
    partition by r.challenge_id, cp.branch_id
    order by (case when c.scoring_direction = 'LOWER_IS_BETTER' then r.result_value else -r.result_value end)
  ) as branch_rank
from challenge_results r
join challenges c on c.id = r.challenge_id
join challenge_participants cp on cp.challenge_id = r.challenge_id and cp.participant_profile_id = r.participant_profile_id
join challenge_display_names d on d.profile_id = r.participant_profile_id
where r.status = 'approved' and r.superseded_by_result_id is null
  and auth_role() is not null;

-- Season points are summed only from ledger entries attributable to a
-- registration under that specific branch (via a join through challenge_
-- participants), not a participant's full season total split across
-- every branch they ever touched — "filtered by the participant's
-- selected competition branch" per the approved spec, not duplicated.
create view challenge_season_leaderboard_overall with (security_invoker = false) as
select
  l.season_id,
  l.participant_profile_id,
  d.display_name,
  sum(l.points_delta) as total_points,
  rank() over (partition by l.season_id order by sum(l.points_delta) desc) as rank
from challenge_points_ledger l
join challenge_display_names d on d.profile_id = l.participant_profile_id
where auth_role() is not null
group by l.season_id, l.participant_profile_id, d.display_name;

create view challenge_season_leaderboard_by_branch with (security_invoker = false) as
select
  l.season_id,
  cp.branch_id,
  l.participant_profile_id,
  d.display_name,
  sum(l.points_delta) as total_points,
  rank() over (partition by l.season_id, cp.branch_id order by sum(l.points_delta) desc) as rank
from challenge_points_ledger l
join challenge_participants cp on cp.challenge_id = l.challenge_id and cp.participant_profile_id = l.participant_profile_id
join challenge_display_names d on d.profile_id = l.participant_profile_id
where auth_role() is not null
group by l.season_id, cp.branch_id, l.participant_profile_id, d.display_name;

-- ---------------------------------------------------------------------------
-- Privilege lockdown for the new/changed functions — same L-1 pattern as
-- Phase 2: explicit revoke-from-public + grant-to-authenticated (never
-- anon) for every business-action RPC. The two dropped helpers need no
-- revoke (DROP FUNCTION removes their grants with them). Every signature
-- below matches exactly what's defined above — re-stating the unchanged
-- ones too (rather than leaving Phase 2's now-stale grant statements in
-- place) since create_challenge/request_challenge_participation's
-- signatures changed and a few functions were dropped and redefined.
-- ---------------------------------------------------------------------------

revoke execute on function public.recompute_challenge_points(uuid, text) from public, anon, authenticated;

revoke execute on function public.set_challenge_display_name(text) from public;
grant execute on function public.set_challenge_display_name(text) to authenticated;

revoke execute on function public.create_challenge_season(text, text, date, date) from public;
grant execute on function public.create_challenge_season(text, text, date, date) to authenticated;

revoke execute on function public.set_challenge_weight_range(integer, integer) from public;
grant execute on function public.set_challenge_weight_range(integer, integer) to authenticated;

revoke execute on function public.create_challenge(
  uuid, text, text, challenge_category, program_type, challenge_scope, uuid,
  challenge_measurement_type, text, challenge_scoring_direction, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, jsonb, uuid[]
) from public;
grant execute on function public.create_challenge(
  uuid, text, text, challenge_category, program_type, challenge_scope, uuid,
  challenge_measurement_type, text, challenge_scoring_direction, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, jsonb, uuid[]
) to authenticated;

revoke execute on function public.request_challenge_participation(uuid, uuid) from public;
grant execute on function public.request_challenge_participation(uuid, uuid) to authenticated;

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
