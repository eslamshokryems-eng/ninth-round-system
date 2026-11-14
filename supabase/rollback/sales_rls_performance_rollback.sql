-- Rollback for 20261123000001_sales_rls_performance.sql — restores the six policies and the helper EXACTLY as defined by 20260821000001
-- (SECURITY INVOKER, no search_path). No data is involved. Policies are swapped inside one transaction: no moment without a policy.
begin;
drop policy "sales staff read leads" on public.leads;
create policy "sales staff read leads" on public.leads for select
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  );
drop policy "sales staff update leads" on public.leads;
create policy "sales staff update leads" on public.leads for update
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  )
  with check (can_manage_leads(branch_id));
drop policy "sales staff read followups" on public.lead_followups;
create policy "sales staff read followups" on public.lead_followups for select
  using (
    can_manage_leads(branch_id)
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  );
drop policy "sales staff update followups" on public.lead_followups;
create policy "sales staff update followups" on public.lead_followups for update
  using (
    can_manage_leads(branch_id)
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  )
  with check (can_manage_leads(branch_id));
alter function public.can_manage_leads(uuid) security invoker reset search_path;
comment on function public.can_manage_leads(uuid) is null;
drop function public.my_sales_branch();
commit;
