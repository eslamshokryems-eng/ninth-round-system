-- Rollback for 20261123000001 (ALTER POLICY variant: no DROP, so no destructive-statement confirmation is needed).
-- Restores the four policies' expressions, can_manage_leads (INVOKER, no search_path, no comment) and removes my_sales_branch().
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter policy "sales staff read leads" on public.leads
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  );
alter policy "sales staff update leads" on public.leads
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  )
  with check (can_manage_leads(branch_id));
alter policy "sales staff read followups" on public.lead_followups
  using (
    can_manage_leads(branch_id)
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  );
alter policy "sales staff update followups" on public.lead_followups
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
