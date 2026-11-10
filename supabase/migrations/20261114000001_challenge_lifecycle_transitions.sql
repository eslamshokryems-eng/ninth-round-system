-- ===========================================================================
-- Challenges — competition lifecycle transitions (additive).
--
-- The gap this closes. `challenges.status` defaults to 'draft' and
-- create_challenge() never sets it, so every competition is created as a
-- draft. There was no function anywhere in the module that could move one
-- out of draft: no publish, no open-registration, no activate, no complete.
-- The write path for `challenges` is a single SECURITY DEFINER function
-- (create_challenge) and the table carries no UPDATE policy at all, so a
-- direct client UPDATE silently affects zero rows — verified in
-- supabase/tests/challenges_phase2/105_rls_write_paths.sql, test (3g),
-- where an in-branch branch manager's direct `update challenges set status`
-- returns UPDATE 0.
--
-- The practical effect was that the module could not run a competition at
-- all: a draft is invisible to members (the `authenticated read published
-- challenges` policy requires status <> 'draft'), registration can only be
-- requested while status = 'registration_open', and results can only be
-- submitted while status = 'active'. Every one of those gates was reachable
-- only by someone with direct database access. The existing test harnesses
-- had been moving competitions along with owner-level UPDATEs for exactly
-- this reason.
--
-- What this adds: one RPC, with the same authorization rule as
-- create_challenge() and the domain layer's one-step-forward transition rule.
-- ===========================================================================

create or replace function set_challenge_status(
  p_challenge_id uuid,
  p_status challenge_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.auth_role();
  v_caller_branch_id uuid;
  v_challenge public.challenges%rowtype;
  v_allowed public.challenge_status[];
begin
  -- Same shape as create_challenge(): coalesce, because auth_role() is NULL
  -- for anon, for service_role and for a DEACTIVATED staff member holding a
  -- live token, and `NULL not in (...)` is NULL, which plpgsql's IF treats
  -- as false — i.e. the guard would be skipped entirely. See
  -- 20261107000001_fail_closed_authorization_guards.sql.
  if coalesce(v_role, '') not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or super admin can change a competition''s status.';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;

  -- A branch manager's authority is exactly what it is in
  -- create_challenge(): their own branch's own BRANCH-scoped competitions.
  -- GLOBAL and MULTI_BRANCH competitions belong to a super admin, because a
  -- branch manager cannot be the right person to complete a competition
  -- that other branches are competing in.
  if v_role = 'branch_manager' then
    select branch_id into v_caller_branch_id from public.profiles where id = auth.uid();
    if v_challenge.scope is distinct from 'BRANCH'
       or v_challenge.branch_id is null
       or v_challenge.branch_id is distinct from v_caller_branch_id then
      raise exception 'A branch manager can only change the status of a branch-scoped competition for their own branch.';
    end if;
  end if;

  if v_challenge.status = p_status then
    raise exception 'This competition is already %.', p_status;
  end if;

  -- One step forward at a time, exactly the rule the domain layer already
  -- states in canTransitionChallengeStatus() (packages/challenges/domain/
  -- challenge.ts): draft -> published -> registration_open -> active ->
  -- completed -> archived. There is deliberately no second, looser rule here
  -- — the database and the TypeScript domain must agree about what a legal
  -- transition is, and when they have differed the database is the one that
  -- actually decides. Nothing may go back: a competition that has had
  -- results approved and points awarded cannot be reopened for registration
  -- or un-completed, because its standings and the points ledger were
  -- computed against the state it has now.
  v_allowed := case v_challenge.status
    when 'draft'              then array['published']::public.challenge_status[]
    when 'published'          then array['registration_open']::public.challenge_status[]
    when 'registration_open'  then array['active']::public.challenge_status[]
    when 'active'             then array['completed']::public.challenge_status[]
    when 'completed'          then array['archived']::public.challenge_status[]
    when 'archived'           then array[]::public.challenge_status[]
  end;

  if not (p_status = any (v_allowed)) then
    raise exception 'A competition cannot go from % to %.', v_challenge.status, p_status;
  end if;

  -- Completing a competition is the point at which its standings become
  -- final, so the points ledger is recomputed once more here. The reason
  -- is passed through so the ledger's own audit trail says why.
  update public.challenges set status = p_status where id = p_challenge_id;

  if p_status = 'completed' then
    perform public.recompute_challenge_points(
      p_challenge_id,
      coalesce(nullif(btrim(p_reason), ''), 'Competition completed.')
    );
  end if;

  perform public.log_audit_event(
    'set_challenge_status', 'challenge', p_challenge_id,
    jsonb_build_object('status', v_challenge.status),
    jsonb_build_object('status', p_status),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

comment on function set_challenge_status(uuid, challenge_status, text) is
  'Moves a competition one step along its lifecycle: draft -> published -> registration_open -> active -> completed -> archived. Forward-only, one step at a time, matching canTransitionChallengeStatus() in the domain layer. A branch manager may do this for their own branch''s BRANCH-scoped competitions, a super admin for any. Completing a competition recomputes its points ledger.';

-- Postgres grants EXECUTE on a new function to PUBLIC, which would make
-- this callable by `anon`. Same least-privilege pattern as every other
-- business-action RPC in this module (20261105000002:1089 onward): revoked
-- from PUBLIC, granted to `authenticated` only. The function's own
-- authorization is what distinguishes a branch manager from a member.
revoke execute on function set_challenge_status(uuid, challenge_status, text) from public;
grant execute on function set_challenge_status(uuid, challenge_status, text) to authenticated;
