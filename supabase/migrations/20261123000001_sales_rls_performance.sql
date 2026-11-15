-- Sales Release A — stability.
-- PROBLEM (measured in Production, 13–14 Nov): HTTP 500 on /rest/v1/leads and /rest/v1/lead_followups = "canceling statement due to statement
-- timeout" (role authenticated: 8 s). Tables are tiny (≈830 leads / ≈370 follow-ups); the cost is RLS evaluated PER ROW:
--   (1) can_manage_leads(branch_id) is a SECURITY INVOKER SQL function, inlined into a correlated sub-select that re-reads public.profiles
--       through profiles' own RLS for every row;
--   (2) policies call auth_role() / auth.uid() per row instead of once per query;
--   (3) the follow-up policies re-run the same per-row work through their EXISTS (select … from leads).
-- FIX (semantics unchanged, no data, no table/column/grant change):
--   * can_manage_leads(): SECURITY DEFINER, search_path empty. Identity is auth.uid(); the argument is a BRANCH, never a user; it only answers
--     "does the CALLER manage leads of this branch?"; fully schema-qualified; no dynamic SQL. EXECUTE grants intentionally unchanged.
--   * my_sales_branch(): same idea as a scalar — the caller's branch if (and only if) they are an ACTIVE branch_manager / sales_employee, else NULL.
--   * The four leads/lead_followups policies that used can_manage_leads()/auth_role() per row are altered IN PLACE (ALTER POLICY: no
--     DROP, the policy never disappears, name/command/roles unchanged) to use ( select … ) sub-queries, which PostgreSQL evaluates
--     ONCE per statement (initPlan). The predicates are logically identical:
--       can_manage_leads(b)  ≡  auth_role() = 'super_admin'  OR  b = my_sales_branch()
-- Insert policies and everything else are untouched. Rollback: supabase/rollback/sales_rls_performance_rollback_alter.sql
-- (ALTER POLICY, preferred) or supabase/rollback/sales_rls_performance_rollback.sql (DROP/CREATE; same end state).
-- Verified by supabase/tests/sales_crm/release_a_run.sh: identical behaviour before/after/rollback/re-apply for every persona.

alter function public.can_manage_leads(uuid) security definer set search_path = '';
comment on function public.can_manage_leads(uuid) is
  'Does the CALLER (auth.uid()) manage leads of this branch? Super Admin, or an active branch_manager / sales_employee of that branch. SECURITY DEFINER (owner postgres, search_path empty) only so that the per-row RLS call is a cheap key lookup; the argument is a branch id, never an identity.';

create or replace function public.my_sales_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.branch_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role in ('branch_manager', 'sales_employee');
$$;
comment on function public.my_sales_branch() is
  'The CALLER''s branch when they are an ACTIVE branch_manager or sales_employee, else NULL. Identity = auth.uid(); used as a once-per-statement initPlan in the leads/lead_followups policies.';

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

alter policy "sales staff read followups" on public.lead_followups
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and exists (
      select 1 from public.leads l
      where l.id = lead_followups.lead_id
        and ((select public.auth_role()) in ('branch_manager', 'super_admin') or l.assigned_to = (select auth.uid()))
    )
  );

alter policy "sales staff update followups" on public.lead_followups
  using (
    ((select public.auth_role()) = 'super_admin' or branch_id = (select public.my_sales_branch()))
    and exists (
      select 1 from public.leads l
      where l.id = lead_followups.lead_id
        and ((select public.auth_role()) in ('branch_manager', 'super_admin') or l.assigned_to = (select auth.uid()))
    )
  )
  with check (public.can_manage_leads(branch_id));
-- "sales staff insert leads" and "sales staff insert followups" are single-row checks and stay exactly as they are.
