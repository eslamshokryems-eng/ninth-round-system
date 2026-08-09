-- Grants sales_employee the same write/read surface as reception, except
-- check-ins (docs/12-roles-and-permissions.md §12.4). Policies can't be
-- altered in place — each one is dropped and recreated with
-- 'sales_employee' added to its role list. "reception/branch_manager
-- insert check-ins" (supabase/migrations/20260806000006_check_ins.sql) is
-- deliberately NOT touched here — check-in stays reception-only.

-- Branch-scoping helper: extend read access to sales_employee.
create or replace function is_branch_staff(target_branch_id uuid)
returns boolean
language sql stable
as $$
  select
    is_super_admin()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    );
$$;

-- members
drop policy "reception/branch_manager insert members" on members;
create policy "reception/branch_manager/sales insert members" on members for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
drop policy "reception/branch_manager update members" on members;
create policy "reception/branch_manager/sales update members" on members for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));

-- memberships
drop policy "reception/branch_manager insert memberships" on memberships;
create policy "reception/branch_manager/sales insert memberships" on memberships for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
drop policy "reception/branch_manager update memberships" on memberships;
create policy "reception/branch_manager/sales update memberships" on memberships for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));

-- membership_payments
drop policy "reception/branch_manager insert payments" on membership_payments;
create policy "reception/branch_manager/sales insert payments" on membership_payments for insert
  with check (
    auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );

-- membership_alerts
drop policy "reception/branch_manager acknowledge alerts" on membership_alerts;
create policy "reception/branch_manager/sales acknowledge alerts" on membership_alerts for update
  using (
    auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_alerts.membership_id and is_branch_staff(ms.branch_id)
    )
  );

-- member-photos storage bucket
drop policy "reception/branch_manager upload member photos" on storage.objects;
create policy "reception/branch_manager/sales upload member photos" on storage.objects for insert
  with check (bucket_id = 'member-photos' and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
drop policy "reception/branch_manager replace member photos" on storage.objects;
create policy "reception/branch_manager/sales replace member photos" on storage.objects for update
  using (bucket_id = 'member-photos' and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));

-- expenses
drop policy "reception/branch_manager insert expenses" on expenses;
create policy "reception/branch_manager/sales insert expenses" on expenses for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
drop policy "reception/branch_manager update expenses" on expenses;
create policy "reception/branch_manager/sales update expenses" on expenses for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));

-- other_sales
drop policy "reception/branch_manager insert other sales" on other_sales;
create policy "reception/branch_manager/sales insert other sales" on other_sales for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
drop policy "reception/branch_manager update other sales" on other_sales;
create policy "reception/branch_manager/sales update other sales" on other_sales for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin'));
