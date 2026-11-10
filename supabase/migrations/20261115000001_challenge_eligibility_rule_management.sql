-- ===========================================================================
-- Challenges — manage eligibility rules AFTER a competition is created
-- (additive).
--
-- Rules were only settable inside create_challenge(). There is no write
-- policy on challenge_eligibility_rules (a direct client write is refused by
-- RLS — see tests/challenges_phase2/105_rls_write_paths.sql), so a rule
-- forgotten at creation could only be added by someone with database access.
--
-- Two SECURITY DEFINER RPCs, same authorization as set_challenge_status():
-- a super admin for any competition, a branch manager only for a BRANCH
-- competition of their own branch; NULL / missing / deactivated identity is
-- refused via coalesce on auth_role().
--
-- Rules may only change while the competition is `draft` or `published`.
-- Eligibility is decided ONCE, at request time, and the decision and its
-- reason are stored permanently (request_challenge_participation). Changing
-- a rule after registration opens would leave athletes judged under rules
-- that no longer exist, and the stored `eligibility_reason` text would
-- describe a rule the competition no longer has. Closing that window keeps
-- every stored decision explainable by the rules as they stand.
-- ===========================================================================

create or replace function add_challenge_eligibility_rule(
  p_challenge_id uuid,
  p_rule_type text,
  p_age integer
)
returns table (rule_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.auth_role();
  v_caller_branch_id uuid;
  v_challenge public.challenges%rowtype;
  v_new_id uuid;
  v_other_age integer;
begin
  if coalesce(v_role, '') not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can change a competition''s eligibility rules.';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;

  if v_role = 'branch_manager' then
    select branch_id into v_caller_branch_id from public.profiles where id = auth.uid();
    if v_challenge.scope is distinct from 'BRANCH'
       or v_challenge.branch_id is null
       or v_challenge.branch_id is distinct from v_caller_branch_id then
      raise exception 'A branch manager can only change the eligibility rules of a branch-scoped competition for their own branch.';
    end if;
  end if;

  if v_challenge.status not in ('draft', 'published') then
    raise exception 'Eligibility rules can only be changed before registration opens (this competition is %).', v_challenge.status;
  end if;

  if p_rule_type is null or p_rule_type not in ('min_age', 'max_age') then
    raise exception 'Unsupported eligibility rule type: %. Only min_age and max_age are supported.', p_rule_type;
  end if;
  if p_age is null or p_age < 0 or p_age > 120 then
    raise exception 'Invalid eligibility rule: age must be a whole number between 0 and 120.';
  end if;

  if exists (
    select 1 from public.challenge_eligibility_rules
    where challenge_id = p_challenge_id and rule_type = p_rule_type::public.challenge_eligibility_rule_type
  ) then
    raise exception 'This competition already has a % rule — remove it first to change it.', p_rule_type;
  end if;

  -- A min above the max (or the reverse) would silently make everybody
  -- ineligible; refuse it instead of creating an unjoinable competition.
  if p_rule_type = 'min_age' then
    select (value ->> 'age')::integer into v_other_age
      from public.challenge_eligibility_rules
     where challenge_id = p_challenge_id and rule_type = 'max_age';
    if v_other_age is not null and p_age > v_other_age then
      raise exception 'The minimum age (%) cannot be greater than the maximum age (%).', p_age, v_other_age;
    end if;
  else
    select (value ->> 'age')::integer into v_other_age
      from public.challenge_eligibility_rules
     where challenge_id = p_challenge_id and rule_type = 'min_age';
    if v_other_age is not null and p_age < v_other_age then
      raise exception 'The maximum age (%) cannot be less than the minimum age (%).', p_age, v_other_age;
    end if;
  end if;

  insert into public.challenge_eligibility_rules (challenge_id, rule_type, value)
  values (p_challenge_id, p_rule_type::public.challenge_eligibility_rule_type, jsonb_build_object('age', p_age))
  returning id into v_new_id;

  perform public.log_audit_event(
    'add_challenge_eligibility_rule', 'challenge', p_challenge_id,
    null, jsonb_build_object('rule_type', p_rule_type, 'age', p_age), '{}'::jsonb
  );

  return query select v_new_id;
end;
$$;

create or replace function remove_challenge_eligibility_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.auth_role();
  v_caller_branch_id uuid;
  v_rule public.challenge_eligibility_rules%rowtype;
  v_challenge public.challenges%rowtype;
begin
  if coalesce(v_role, '') not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can change a competition''s eligibility rules.';
  end if;

  select * into v_rule from public.challenge_eligibility_rules where id = p_rule_id;
  if v_rule.id is null then
    raise exception 'Eligibility rule not found: %', p_rule_id;
  end if;
  select * into v_challenge from public.challenges where id = v_rule.challenge_id;

  if v_role = 'branch_manager' then
    select branch_id into v_caller_branch_id from public.profiles where id = auth.uid();
    if v_challenge.scope is distinct from 'BRANCH'
       or v_challenge.branch_id is null
       or v_challenge.branch_id is distinct from v_caller_branch_id then
      raise exception 'A branch manager can only change the eligibility rules of a branch-scoped competition for their own branch.';
    end if;
  end if;

  if v_challenge.status not in ('draft', 'published') then
    raise exception 'Eligibility rules can only be changed before registration opens (this competition is %).', v_challenge.status;
  end if;

  delete from public.challenge_eligibility_rules where id = p_rule_id;

  perform public.log_audit_event(
    'remove_challenge_eligibility_rule', 'challenge', v_rule.challenge_id,
    jsonb_build_object('rule_type', v_rule.rule_type, 'age', v_rule.value ->> 'age'), null, '{}'::jsonb
  );
end;
$$;

comment on function add_challenge_eligibility_rule(uuid, text, integer) is
  'Adds a min_age or max_age rule to a competition that has not yet opened registration. One rule per type; min cannot exceed max. Super admin for any competition, branch manager for their own branch''s BRANCH competitions.';
comment on function remove_challenge_eligibility_rule(uuid) is
  'Removes an eligibility rule from a competition that has not yet opened registration. Same authorization as add_challenge_eligibility_rule.';

revoke execute on function add_challenge_eligibility_rule(uuid, text, integer) from public;
grant execute on function add_challenge_eligibility_rule(uuid, text, integer) to authenticated;
revoke execute on function remove_challenge_eligibility_rule(uuid) from public;
grant execute on function remove_challenge_eligibility_rule(uuid) to authenticated;

-- ===========================================================================
-- get_challenge_weight_range() — the configured range, readable by anyone
-- allowed to create a competition.
--
-- challenge_settings is readable by super_admin only (by design: it holds
-- configuration nobody else needs). But the create form has to show and
-- pre-check the CURRENT weight range for a branch manager too. Until now it
-- fell back to packaged defaults for them, which was merely stale; once a
-- super admin can change the range from a screen, a branch manager would be
-- told a weight is out of range (or in range) based on numbers that are no
-- longer the real ones. create_challenge() re-validates against the real
-- range either way, so this is a correctness fix for the screen, not a
-- security boundary — and it deliberately returns ONLY the two numbers, not
-- the table, so no other setting becomes readable.
-- ===========================================================================
create or replace function get_challenge_weight_range()
returns table (min_weight integer, max_weight integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Same population that may create a competition. NULL / anon / deactivated
  -- identity is refused.
  if coalesce(public.auth_role(), '') not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can read the competition weight range.';
  end if;

  return query
    select
      coalesce((select value::integer from public.challenge_settings where key = 'min_weight'), 1),
      coalesce((select value::integer from public.challenge_settings where key = 'max_weight'), 10);
end;
$$;

revoke execute on function get_challenge_weight_range() from public;
grant execute on function get_challenge_weight_range() to authenticated;
