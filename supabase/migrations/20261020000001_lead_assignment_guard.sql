-- Sales CRM — Phase 1: Ownership & Permissions Hardening.
--
-- The existing "sales staff update leads" RLS policy's WITH CHECK
-- (20260821000001_sales_leads_crm.sql) only verifies branch
-- (can_manage_leads(branch_id)) — it says nothing about what the new
-- assigned_to value is allowed to be. In practice this means a
-- sales_employee (whose UPDATE access is already correctly scoped by
-- USING to their own lead, or an unassigned one) can still set assigned_to
-- to anyone's id on either kind of row — reassigning their own lead away,
-- or handing an unassigned lead to a coworker instead of claiming it for
-- themselves — even though the UI never offers that control to them
-- (apps/web's lead detail page already hides "Reassign To" from anyone
-- but branch_manager/super_admin, via CAN_ASSIGN_OTHERS). This closes that
-- gap at the one place that can't be bypassed by calling the API/RPC
-- directly instead of the UI.
--
-- Rule enforced (only when assigned_to actually changes — editing a
-- lead's other fields is completely unaffected):
--   - branch_manager / super_admin: unrestricted here (existing RLS
--     already scopes which leads' branch they may touch).
--   - everyone else (sales_employee, and defensively anyone else RLS's
--     USING clause let onto this row): only a legitimate self-claim of an
--     unassigned lead is allowed — old value must be null, new value must
--     be the caller's own id. Any other transition is rejected, so an
--     already-assigned lead can never be reassigned (to self or anyone
--     else) by a non-manager.
--
-- Also enforced whenever assigned_to is set to a non-null value: the
-- target profile must belong to the SAME branch as the lead. The
-- StaffPicker UI already only ever offers same-branch candidates
-- (profiles RLS, 20260920000001_staff_profile_visibility_for_attribution),
-- but nothing previously stopped a direct write from pointing assigned_to
-- at a profile in a different branch.
--
-- No RLS policy is changed, no new table, additive only. A BEFORE UPDATE
-- trigger is used (not a WITH CHECK rewrite) because comparing OLD vs NEW
-- together is exactly what a trigger is for — RLS's own WITH CHECK only
-- ever sees the NEW row.

create or replace function enforce_lead_assignment_rules()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

create trigger trg_enforce_lead_assignment_rules
  before update on leads
  for each row execute function enforce_lead_assignment_rules();
