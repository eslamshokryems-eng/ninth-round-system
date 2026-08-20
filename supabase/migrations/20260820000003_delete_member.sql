-- Delete Member — Branch Manager / Super Admin only. Permanently erases
-- the member and everything tied to them (memberships, payments,
-- check-ins), per explicit product decision (not a soft-delete/deactivate
-- like staff accounts get — a member has no ongoing identity to preserve
-- the way a departed staff member's audit trail does).
--
-- membership_payments has `on delete restrict` from memberships
-- (20260806000002) specifically to stop payments being deleted as a
-- side effect of anything else in the app — deliberately bypassed here,
-- explicitly, since this feature's whole point is permanent erasure.
-- membership_alerts and check_ins are `on delete cascade` already, so
-- they clean up automatically once memberships/members are deleted.
--
-- The audit log entry captures who/what was deleted (name, code, branch)
-- since the member row itself won't exist afterward to look up.

create policy "branch_manager/super_admin delete members" on members for delete
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));

create policy "branch_manager/super_admin delete memberships" on memberships for delete
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));

create policy "branch_manager/super_admin delete payments" on membership_payments for delete
  using (
    auth_role() in ('branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );

create or replace function delete_member(p_member_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_full_name text;
  v_member_code text;
  v_branch_id uuid;
  v_deleted_count int;
begin
  select full_name, member_code, branch_id
  into v_full_name, v_member_code, v_branch_id
  from members where id = p_member_id;

  if v_full_name is null then
    raise exception 'Member not found or you do not have access to it.';
  end if;

  -- Explicit bypass of membership_payments' on-delete-restrict, see file header.
  delete from membership_payments
  where membership_id in (select id from memberships where member_id = p_member_id);

  perform log_audit_event(
    'delete_member', 'member', p_member_id,
    jsonb_build_object('full_name', v_full_name, 'member_code', v_member_code, 'branch_id', v_branch_id),
    null,
    '{}'::jsonb
  );

  delete from members where id = p_member_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'Could not delete member — you may not have permission.';
  end if;
end;
$$;

grant execute on function delete_member(uuid) to authenticated;
