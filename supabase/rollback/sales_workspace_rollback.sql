-- Rollback for 20261124000001_sales_workspace.sql. SAFETY: refuses to run if it would destroy history or data entered through the workspace:
-- any lead_activities / lead_assignments row, any lead with a contact date or a non-default interest level, any follow-up with an outcome
-- or a non-default kind. With none of that present it restores the Release A policies exactly and removes the objects.
begin;
do $$
begin
  if exists (select 1 from public.lead_activities) or exists (select 1 from public.lead_assignments) then
    raise exception 'ROLLBACK REFUSED: lead activity / assignment history exists (% / % rows).',
      (select count(*) from public.lead_activities), (select count(*) from public.lead_assignments);
  end if;
  if exists (select 1 from public.leads where last_contacted_at is not null or interest_level <> 'warm')
     or exists (select 1 from public.lead_followups where outcome is not null or kind <> 'call') then
    raise exception 'ROLLBACK REFUSED: workspace data (contact dates, interest levels, follow-up kinds/outcomes) exists.';
  end if;
end $$;

drop trigger if exists trg_record_lead_assignment_ins on public.leads;
drop trigger if exists trg_record_lead_assignment_upd on public.leads;
drop trigger if exists trg_guard_lead_last_contacted on public.leads;
drop trigger if exists trg_enforce_lead_insert_rules on public.leads;
drop function if exists public.record_lead_assignment();
drop function if exists public.guard_lead_last_contacted();
drop function if exists public.enforce_lead_insert_rules();

-- restore the Release A policies (pool visible to branch employees again)
drop policy "sales staff read leads" on public.leads;
create policy "sales staff read leads" on public.leads for select
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and ((select public.auth_role()) in ('branch_manager', 'super_admin') or assigned_to = (select auth.uid()) or assigned_to is null)
  );
drop policy "sales staff update leads" on public.leads;
create policy "sales staff update leads" on public.leads for update
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and ((select public.auth_role()) in ('branch_manager', 'super_admin') or assigned_to = (select auth.uid()) or assigned_to is null)
  )
  with check (public.can_manage_leads(branch_id));

drop function if exists public.get_lead_workspace_state(uuid);
drop function if exists public.get_lead_assignments(uuid);
drop function if exists public.get_lead_activities(uuid);
drop function if exists public.get_worklist_summary(uuid);
drop function if exists public.get_my_worklist(uuid, integer, integer);
drop function if exists public.assign_leads(uuid[], uuid, text);
drop function if exists public.set_lead_interest(uuid, text);
drop function if exists public.add_lead_note(uuid, text);
drop function if exists public.set_lead_next_action(uuid, text, timestamptz, text);
drop function if exists public.log_lead_interaction(uuid, text, text, text, text, timestamptz, public.lead_lost_reason, text);
drop function if exists public.can_work_lead(uuid, uuid);

drop table public.lead_assignments;
drop table public.lead_activities;
drop function if exists public.guard_lead_history();
drop index if exists public.idx_lead_followups_pending_lead;
drop index if exists public.idx_leads_owner_status;
alter table public.lead_followups drop column outcome, drop column kind;
alter table public.leads drop column last_contacted_at, drop column interest_level;
commit;
