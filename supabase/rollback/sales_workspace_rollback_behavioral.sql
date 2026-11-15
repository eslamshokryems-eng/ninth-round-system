-- Release B — BEHAVIOURAL rollback (PREFERRED; non-destructive). Use it if Release B must be withdrawn after staff have used it.
-- Restores Release A BEHAVIOUR for every user while KEEPING every row written under Release B (lead_activities, lead_assignments,
-- follow-up kinds / outcomes, interest levels, last-contacted dates). No DROP, no DELETE, no TRUNCATE, no data change.
--   1. the two leads policies are ALTERED back to the exact Release A predicates (employees see the unassigned pool again);
--   2. the Release B insert rule and last_contacted guard are DISABLED (A had neither);
--   3. EXECUTE on the Release B RPCs is revoked from authenticated (the A-era frontend never calls them);
--   KEPT ON purposely: the ownership-history recorder (trg_record_lead_assignment_*) — keeps recording every owner change, invisible to
--   users — and the append-only guards on the two history tables. Their tables stay readable under their own RLS.
-- Deploy the previous frontend (Production deployment before Release B) together with this script.
-- Re-enable: supabase/rollback/sales_workspace_reenable.sql. Full removal (only while NO history exists): sales_workspace_rollback.sql.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter policy "sales staff read leads" on public.leads
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and ((select public.auth_role()) in ('branch_manager', 'super_admin') or assigned_to = (select auth.uid()) or assigned_to is null)
  );
alter policy "sales staff update leads" on public.leads
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and ((select public.auth_role()) in ('branch_manager', 'super_admin') or assigned_to = (select auth.uid()) or assigned_to is null)
  )
  with check (public.can_manage_leads(branch_id));

alter table public.leads disable trigger trg_enforce_lead_insert_rules;
alter table public.leads disable trigger trg_guard_lead_last_contacted;

revoke execute on function public.can_work_lead(uuid, uuid) from authenticated;
revoke execute on function public.log_lead_interaction(uuid, text, text, text, text, timestamptz, public.lead_lost_reason, text) from authenticated;
revoke execute on function public.set_lead_next_action(uuid, text, timestamptz, text) from authenticated;
revoke execute on function public.add_lead_note(uuid, text) from authenticated;
revoke execute on function public.set_lead_interest(uuid, text) from authenticated;
revoke execute on function public.assign_leads(uuid[], uuid, text) from authenticated;
revoke execute on function public.get_my_worklist(uuid, integer, integer) from authenticated;
revoke execute on function public.get_worklist_summary(uuid) from authenticated;
revoke execute on function public.get_lead_activities(uuid) from authenticated;
revoke execute on function public.get_lead_assignments(uuid) from authenticated;
revoke execute on function public.get_lead_workspace_state(uuid) from authenticated;
commit;
