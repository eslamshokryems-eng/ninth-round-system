-- SECURITY FIX: NULL-bypass in super-admin guards (found in THE NINTH Phase 3 testing,
-- see docs/race/03-phase-3-migration-report.md "Pre-existing gym-system vulnerability").
--
-- is_super_admin() is `auth_role() = 'super_admin'`, and auth_role() is NULL
-- for any caller without an active profile: anonymous requests (public anon
-- key, no JWT) and deactivated staff. `NOT NULL` is NULL and plpgsql skips an
-- IF whose condition is NULL — so `if not public.is_super_admin() then raise`
-- silently let those callers through. For the four SECURITY DEFINER functions
-- below that meant anyone holding the anon key could rewrite the permission
-- matrix, grant any user any permission, or run staff-deletion prep.
--
-- Fix: each function is re-created from its latest definition with exactly
-- one line changed — the guard becomes `is not true` (NULL counts as "no").
-- Nothing else in any function body changes. delete_receipt() (SECURITY
-- INVOKER, so RLS already blocked anon) gets the same one-line fix for
-- consistency. As defence in depth, anon/public lose EXECUTE on these
-- admin-only functions; `authenticated` keeps it (the UI calls them as a
-- signed-in super admin).
--
-- Regression tests: supabase/tests/race/tests/09_gym_null_guard.sql.

-- set_role_permission: from 20260815000002_permissions_and_staff_status.sql (guard line only)
create or replace function set_role_permission(p_role user_role, p_permission_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() is not true then
    raise exception 'Only super_admin can manage role permissions.';
  end if;

  if p_granted then
    insert into public.role_permissions (role, permission_key) values (p_role, p_permission_key)
    on conflict do nothing;
  else
    delete from public.role_permissions where role = p_role and permission_key = p_permission_key;
  end if;

  perform public.log_audit_event(
    'change_permissions', 'role_permissions', null, null,
    jsonb_build_object('role', p_role, 'permission_key', p_permission_key, 'granted', p_granted),
    '{}'::jsonb
  );
end;
$$;

-- set_user_permission_override: from 20260815000002_permissions_and_staff_status.sql (guard line only)
create or replace function set_user_permission_override(p_profile_id uuid, p_permission_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() is not true then
    raise exception 'Only super_admin can manage user permission overrides.';
  end if;

  insert into public.user_permission_overrides (profile_id, permission_key, granted, granted_by)
  values (p_profile_id, p_permission_key, p_granted, auth.uid())
  on conflict (profile_id, permission_key) do update set granted = excluded.granted, granted_by = excluded.granted_by;

  perform public.log_audit_event(
    'change_permissions', 'user_permission_overrides', p_profile_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'permission_key', p_permission_key, 'granted', p_granted),
    '{}'::jsonb
  );
end;
$$;

-- clear_user_permission_override: from 20260815000002_permissions_and_staff_status.sql (guard line only)
create or replace function clear_user_permission_override(p_profile_id uuid, p_permission_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_super_admin() is not true then
    raise exception 'Only super_admin can manage user permission overrides.';
  end if;

  delete from public.user_permission_overrides where profile_id = p_profile_id and permission_key = p_permission_key;

  perform public.log_audit_event(
    'change_permissions', 'user_permission_overrides', p_profile_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'permission_key', p_permission_key, 'cleared', true),
    '{}'::jsonb
  );
end;
$$;

-- prepare_staff_deletion: from 20260821000002_delete_staff_account.sql (guard line only)
create or replace function prepare_staff_deletion(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if public.is_super_admin() is not true then
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

-- delete_receipt: from 20260926000001_delete_receipt.sql (guard line only)
create or replace function delete_receipt(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_payment membership_payments%rowtype;
  v_member_id uuid;
  v_member_full_name text;
  v_receipt_number text;
  v_branch_id uuid;
begin
  if public.is_super_admin() is not true then
    raise exception 'Only Super Admin can delete a receipt.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to delete a receipt.';
  end if;

  select * into v_payment from membership_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Receipt not found.';
  end if;

  select ms.member_id, ms.receipt_number, ms.branch_id, m.full_name
  into v_member_id, v_receipt_number, v_branch_id, v_member_full_name
  from memberships ms
  join members m on m.id = ms.member_id
  where ms.id = v_payment.membership_id;

  perform log_audit_event(
    'delete_receipt',
    'payment',
    p_payment_id,
    to_jsonb(v_payment),
    null,
    jsonb_build_object(
      'reason', p_reason,
      'member_id', v_member_id,
      'member_full_name', v_member_full_name,
      'receipt_number', v_receipt_number,
      'branch_id', v_branch_id,
      'amount', v_payment.amount,
      'payment_date', v_payment.payment_date
    )
  );

  delete from membership_payments where id = p_payment_id;
end;
$$;

revoke execute on function set_role_permission(user_role, text, boolean) from public, anon;
revoke execute on function set_user_permission_override(uuid, text, boolean) from public, anon;
revoke execute on function clear_user_permission_override(uuid, text) from public, anon;
revoke execute on function prepare_staff_deletion(uuid) from public, anon;
revoke execute on function delete_receipt(uuid, text) from public, anon;
grant execute on function set_role_permission(user_role, text, boolean) to authenticated;
grant execute on function set_user_permission_override(uuid, text, boolean) to authenticated;
grant execute on function clear_user_permission_override(uuid, text) to authenticated;
grant execute on function prepare_staff_deletion(uuid) to authenticated;
grant execute on function delete_receipt(uuid, text) to authenticated;
