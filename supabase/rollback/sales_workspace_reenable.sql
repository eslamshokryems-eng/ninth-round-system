-- Release B — re-enable after sales_workspace_rollback_behavioral.sql. Puts back exactly what 20261124000001_sales_workspace.sql set
-- (policies, the two triggers, EXECUTE grants). No DROP; the history kept during the rollback is still there.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter policy "sales staff read leads" on public.leads
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager' or assigned_to = (select auth.uid())))
  );
alter policy "sales staff update leads" on public.leads
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager' or assigned_to = (select auth.uid())))
  )
  with check (public.can_manage_leads(branch_id));

alter table public.leads enable trigger trg_enforce_lead_insert_rules;
alter table public.leads enable trigger trg_guard_lead_last_contacted;

grant execute on function public.can_work_lead(uuid, uuid) to authenticated;
grant execute on function public.log_lead_interaction(uuid, text, text, text, text, timestamptz, public.lead_lost_reason, text) to authenticated;
grant execute on function public.set_lead_next_action(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.add_lead_note(uuid, text) to authenticated;
grant execute on function public.set_lead_interest(uuid, text) to authenticated;
grant execute on function public.assign_leads(uuid[], uuid, text) to authenticated;
grant execute on function public.get_my_worklist(uuid, integer, integer) to authenticated;
grant execute on function public.get_worklist_summary(uuid) to authenticated;
grant execute on function public.get_lead_activities(uuid) to authenticated;
grant execute on function public.get_lead_assignments(uuid) to authenticated;
grant execute on function public.get_lead_workspace_state(uuid) to authenticated;
commit;
