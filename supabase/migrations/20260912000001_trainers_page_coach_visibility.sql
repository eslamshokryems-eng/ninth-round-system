-- Trainers page: let branch staff (not just branch_manager/super_admin)
-- see who a member's coach is.
--
-- profiles' existing RLS only lets an account read its own row, or (via
-- "admins manage all profiles", 20260801000002) any row if is_admin()
-- (branch_manager/super_admin). There was no policy letting a plain
-- reception/coach account read a *coworker's* profile row at all — so the
-- Trainers page's trainer list, and the existing "Assign a Coach" picker
-- in Add Member/Renew, both silently return zero coaches for those roles
-- (RLS filters the rows out, no error). Scoped as narrowly as the actual
-- need: only role = 'coach' rows (never another reception/branch_manager/
-- super_admin's own profile), and only at the caller's own branch, via the
-- same is_branch_staff() helper every other branch-scoped policy in this
-- schema already uses.
create policy "branch staff read coach profiles" on profiles for select
  using (role = 'coach' and is_branch_staff(branch_id));
