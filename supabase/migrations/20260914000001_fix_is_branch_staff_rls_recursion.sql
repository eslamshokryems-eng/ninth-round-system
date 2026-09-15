-- Fixes production incident: Reception and Branch Manager got
-- "54001 stack depth limit exceeded" on every query that relies on
-- is_branch_staff() (Members, Trainers, etc.) — Super Admin was
-- unaffected.
--
-- Root cause: is_branch_staff() queries `profiles` internally and was
-- declared without `security definer`, so that internal query ran under
-- the CALLER's own RLS. The "branch staff read coach profiles" policy
-- added in 20260912000001_trainers_page_coach_visibility.sql calls
-- is_branch_staff() as part of evaluating RLS on `profiles` itself —
-- so evaluating that policy required re-evaluating is_branch_staff(),
-- which re-queried `profiles`, which re-evaluated the same policy again,
-- infinitely. Super Admin never hit this because is_branch_staff()'s
-- `is_super_admin() OR exists(...)` short-circuits before the recursive
-- exists() clause ever runs for that role.
--
-- Fix: make is_branch_staff() `security definer` (matching auth_role(),
-- right below it in 20260815000002, which already uses this exact
-- pattern for the same reason) so its internal profiles lookup bypasses
-- RLS instead of re-triggering it. The boolean this function computes is
-- unchanged — same branch/role/active check — only how it's executed
-- internally changes, so this does not broaden what any role can see.
create or replace function is_branch_staff(target_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    );
$$;
