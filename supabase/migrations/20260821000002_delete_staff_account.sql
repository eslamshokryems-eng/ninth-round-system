-- 9th Round — Delete Employee (Super Admin only).
--
-- Deleting a staff account must not silently destroy the business records
-- they created (memberships, payments, audit trail, etc.) — those clear to
-- NULL on the "who did this" column, exactly like an already-completed
-- transaction whose actor is now unknown, and are never deleted themselves.
-- Personal HR records that belong TO the employee (attendance, shifts,
-- leave, salary, presence, permission overrides, domain events, AI
-- insights) already cascade-delete via their existing `on delete cascade`
-- foreign keys to profiles — nothing new is needed for those.
--
-- This function only clears the "actor" FK references and logs the
-- deletion; the actual account removal (auth.users, which cascades to
-- profiles via its own `on delete cascade`) happens through Supabase's
-- Admin API from /api/staff/delete-account — the same "service_role key
-- only inside a Route Handler, never client code" pattern already used by
-- /api/staff/create-account and /api/staff/set-password. Nothing here
-- deletes an auth-schema row directly.

create or replace function prepare_staff_deletion(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can delete a staff account.';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  select role::text into v_target_role from public.profiles where id = p_profile_id;
  if v_target_role is null then
    raise exception 'Employee not found.';
  end if;
  if v_target_role = 'member' then
    raise exception 'That account is a member, not a staff account.';
  end if;

  update public.members set created_by = null where created_by = p_profile_id;
  update public.memberships set created_by = null where created_by = p_profile_id;
  update public.memberships set coach_id = null where coach_id = p_profile_id;
  update public.membership_payments set received_by = null where received_by = p_profile_id;
  update public.check_ins set checked_in_by = null where checked_in_by = p_profile_id;
  update public.expenses set created_by = null where created_by = p_profile_id;
  update public.other_sales set created_by = null where created_by = p_profile_id;
  update public.leads set created_by = null where created_by = p_profile_id;
  update public.leads set assigned_to = null where assigned_to = p_profile_id;
  update public.lead_followups set created_by = null where created_by = p_profile_id;
  update public.leave_requests set reviewed_by = null where reviewed_by = p_profile_id;
  update public.admin_audit_log set admin_id = null where admin_id = p_profile_id;
  update public.profiles set referred_by = null where referred_by = p_profile_id;
  update public.exercises set created_by = null where created_by = p_profile_id;
  update public.programs set created_by = null where created_by = p_profile_id;
  update public.user_programs set assigned_by = null where assigned_by = p_profile_id;
  update public.nutrition_plans set assigned_by = null where assigned_by = p_profile_id;
  update public.food_items set created_by = null where created_by = p_profile_id;
  update public.user_permission_overrides set granted_by = null where granted_by = p_profile_id;

  perform public.log_audit_event(
    'delete_user', 'staff', p_profile_id,
    jsonb_build_object('role', v_target_role), null, '{}'::jsonb
  );
end;
$$;
