-- ROLLBACK of the SHARED objects changed by the Challenges release (migrations 20261107000001,
-- 20261111000001, 20261113000001). NOT a migration: it is never applied automatically. Run it only if
-- the release must be undone at database level. The definitions below are the production definitions
-- as inspected read-only on 2026-11-11 (byte-for-byte equal, whitespace-normalised, to what the repo's
-- migrations before 20261105 produce), and the grants are production's actual ACLs:
--   EXECUTE for PUBLIC, anon, authenticated, service_role.
-- Challenges tables/functions are isolated from Reception/Sales and may stay in place after a rollback;
-- the pre-Challenges application code does not call them.
-- Tested locally: apply all 63 migrations, run this file, and the shared functions hash-match the
-- pre-release state (see docs/phase-1/19-production-release-plan.md).
begin;
CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select role::text from public.profiles where id = auth.uid() and is_active;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_lead_assignment_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_target_branch_id uuid;
begin
  if new.assigned_to is distinct from old.assigned_to then
    if not (public.auth_role() in ('branch_manager', 'super_admin')) then
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
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select public.auth_role() in ('branch_manager', 'super_admin');
$function$
;
CREATE OR REPLACE FUNCTION public.is_branch_staff(target_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    );
$function$
;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select public.auth_role() = 'super_admin';
$function$
;
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (
    new.role is distinct from old.role
    or new.branch_id is distinct from old.branch_id
    or new.employee_code is distinct from old.employee_code
  ) and not public.is_admin() then
    raise exception 'Only a branch manager or super admin can change role, branch, or employee code.';
  end if;
  return new;
end;
$function$
;

grant execute on function public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) to public, anon, authenticated, service_role;
grant execute on function public.log_audit_event_as(uuid, text, text, uuid, jsonb, jsonb, jsonb) to public, anon, authenticated, service_role;
grant execute on function public.prepare_staff_deletion(uuid) to public, anon, authenticated, service_role;
commit;
