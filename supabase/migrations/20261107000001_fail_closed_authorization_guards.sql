-- 9th Round — CRITICAL security remediation: authorization guards that
-- fail OPEN, and self-service privilege escalation on profiles.
--
-- Strictly additive. No historical migration is rewritten; every change
-- below is a CREATE OR REPLACE of a small, self-contained function plus
-- one privilege revoke.
--
-- ---------------------------------------------------------------------------
-- ROOT CAUSE
-- ---------------------------------------------------------------------------
-- auth_role() (20260815000002:96-102) returns NULL — not a role — for any
-- caller without an active profile row:
--
--   select role::text from public.profiles where id = auth.uid() and is_active;
--
-- That is NULL for three distinct callers: an unauthenticated `anon`
-- request, a `service_role` backend request, and — the dangerous one — a
-- staff member who has been DEACTIVATED (`is_active = false`) but still
-- holds an unexpired access token.
--
-- is_admin()/is_super_admin() then propagate that NULL, because SQL's
-- `IN` and `=` return NULL (not false) for a NULL left-hand side:
--
--   NULL in ('branch_manager','super_admin')  ->  NULL
--   not NULL                                  ->  NULL
--   IF NULL THEN ... END IF                   ->  branch NOT taken
--
-- So every guard shaped `if not public.is_super_admin() then raise ...`
-- silently PERMITS these callers. NULL fails safe in a *grant* check
-- (an RLS `using` clause needs TRUE) but fails OPEN in a *block* check,
-- which is how every privileged RPC in this codebase is written.
--
-- Verified against a real local Supabase stack (Postgres 17.11,
-- GoTrue v2.197.0, PostgREST v16.5), not inferred:
--   * A deactivated staff member holding a pre-ban token set their own
--     role to 'super_admin' (HTTP 204), changed their own branch_id
--     (HTTP 200), reactivated themselves (HTTP 204), then read and
--     DEACTIVATED the real owner's profile (HTTP 200).
--   * An unauthenticated `anon` caller passed the exact guard shape used
--     by prepare_staff_deletion() — a SECURITY DEFINER function with no
--     grant revocation (so EXECUTE defaults to PUBLIC) that nulls out
--     actor columns across 19 tables, including admin_audit_log.admin_id.
--   * GoTrue correctly refuses both sign-in (403 user_banned) and
--     refresh (400 "Invalid Refresh Token: User Banned") for a banned
--     user, so the exposure window is one access-token lifetime
--     (measured expires_in = 3600s) and cannot be extended.
--   * PostgREST validates a JWT locally and never consults GoTrue's ban
--     state, which is why the pre-ban token still worked.
--
-- ---------------------------------------------------------------------------
-- APPROACH
-- ---------------------------------------------------------------------------
-- Fix the three shared helpers rather than ~10 call sites. Every guard
-- already routes through them, so making them return a real boolean
-- closes all of those guards at once, with no large function bodies
-- duplicated into this migration and no behaviour change for callers who
-- were already getting a true/false answer.
--
-- The service_role backend is then re-permitted EXPLICITLY, via
-- is_service_role(), instead of riding on the NULL-propagation accident.
-- This is not a privilege expansion: service_role already bypasses RLS
-- entirely and can perform any of these writes directly against the
-- tables, so a guard that recognises it merely states the trust level
-- that already exists. What changes is that the trust is now declared
-- and auditable rather than implicit.

-- ---------------------------------------------------------------------------
-- is_service_role() — the explicit trusted-backend predicate.
--
-- current_user is unusable here: inside a SECURITY DEFINER function it
-- becomes the function OWNER (measured: 'postgres'), not the caller, and
-- session_user is PostgREST's authenticator role. The reliable signal is
-- the request's own JWT claims. On GoTrue v2.197/PostgREST v16.5 the
-- populated GUC is the `request.jwt.claims` JSON object (measured:
-- {"exp":...,"iss":...,"role":"service_role"}); the older per-claim GUC
-- `request.jwt.claim.role` is empty. Both forms are read so this keeps
-- working across PostgREST versions.
--
-- Deliberately matches ONLY service_role: an `anon` request also has a
-- NULL auth.uid(), so "auth.uid() is null" would have blessed
-- unauthenticated callers — measured anon claims are {"role":"anon"}.
-- ---------------------------------------------------------------------------

create or replace function is_service_role()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  ) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- Fail-closed helpers. Same role semantics as before for every caller
-- that previously got a real boolean; NULL now resolves to false instead
-- of to "guard skipped", and service_role is recognised explicitly.
-- ---------------------------------------------------------------------------

-- was: select public.auth_role() in ('branch_manager', 'super_admin');
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select coalesce(public.auth_role() in ('branch_manager', 'super_admin'), false)
      or public.is_service_role();
$$;

-- was: select public.auth_role() = 'super_admin';
create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select coalesce(public.auth_role() = 'super_admin', false)
      or public.is_service_role();
$$;

-- was: 20260914000001_fix_is_branch_staff_rls_recursion.sql:23-37 — the
-- security-definer, search_path-pinned version. Body preserved exactly;
-- only the coalesce wrapper and the service_role clause are added. The
-- `or exists (...)` already yielded false rather than NULL on its own,
-- but is_super_admin() used to make the whole expression NULL, so this
-- function returned NULL too.
create or replace function is_branch_staff(target_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- protect_privileged_profile_columns() — adds is_active to the protected
-- set, which is what made self-reactivation possible.
--
-- The comment at 20260815000002:91-94 claimed this trigger "already
-- covers is_active too, since it's evaluated on every UPDATE regardless
-- of which columns changed". It does fire on every UPDATE, but it only
-- ever BLOCKED the three columns named in its condition, and is_active
-- was not one of them. It is now.
--
-- The guard itself needs no `auth.uid() is null` carve-out: is_admin()
-- above now returns true for service_role, which is what keeps
-- /api/staff/create-account (service-role UPDATE of role + branch_id +
-- employee_code) and /api/staff/set-active-status (service-role UPDATE
-- of is_active) working. Both were verified to depend on the previous
-- NULL-open behaviour, so without that explicit recognition this change
-- would have broken staff account creation and staff activation.
-- ---------------------------------------------------------------------------

create or replace function protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
    or new.branch_id is distinct from old.branch_id
    or new.employee_code is distinct from old.employee_code
    or new.is_active is distinct from old.is_active
  ) and not public.is_admin() then
    raise exception 'Only a branch manager or super admin can change role, branch, employee code, or active status.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- prepare_staff_deletion() — defence in depth.
--
-- Its own guard (`if not public.is_super_admin()`) is already closed by
-- the helper fix above. But EXECUTE on it was never revoked, so it
-- inherited Postgres's default grant to PUBLIC, leaving a SECURITY
-- DEFINER function that nulls actor columns across 19 tables callable by
-- `anon`. The guard is the control; the grant should not have been open
-- as well. Its only legitimate caller is /api/staff/delete-account,
-- which invokes it with the service-role key.
--
-- The function body is deliberately NOT redefined here — nothing in it
-- needs to change, and reproducing 19 UPDATE statements in a second
-- place would create exactly the drift risk this migration is meant to
-- reduce.
-- ---------------------------------------------------------------------------

revoke execute on function prepare_staff_deletion(uuid) from public, anon, authenticated;
grant execute on function prepare_staff_deletion(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- enforce_lead_assignment_rules() — the one remaining fail-open guard
-- that the helper fix above does NOT reach, because it compares
-- auth_role() directly rather than going through is_admin():
--
--   if not (public.auth_role() in ('branch_manager','super_admin')) then
--
-- For a NULL auth_role() that condition is NULL, so the IF is skipped —
-- and with it the entire nested block, including the raise. A
-- deactivated sales employee holding a live token could therefore
-- reassign any lead in their branch, which is precisely what this
-- trigger exists to prevent.
--
-- Body reproduced from 20261020000001_lead_assignment_guard.sql:40-65
-- unchanged apart from the coalesce, including its `set search_path =
-- public` (not '') and the same-branch target check.
-- ---------------------------------------------------------------------------

create or replace function enforce_lead_assignment_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target_branch_id uuid;
begin
  if new.assigned_to is distinct from old.assigned_to then
    if not coalesce(public.auth_role() in ('branch_manager', 'super_admin'), false) then
      if not (old.assigned_to is null and new.assigned_to = auth.uid()) then
        raise exception 'Only a branch manager or super admin can reassign a lead. A sales employee may only claim an unassigned lead for themselves.';
      end if;
    end if;

    if new.assigned_to is not null then
      select branch_id into v_target_branch_id from public.profiles where id = new.assigned_to;
      if v_target_branch_id is distinct from new.branch_id then
        raise exception 'Cannot assign a lead to a staff member from a different branch.';
      end if;
    end if;
  end if;

  return new;
end;
$$;
