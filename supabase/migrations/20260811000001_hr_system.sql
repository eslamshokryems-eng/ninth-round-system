-- HR system: work shifts (schedule), attendance (clock in/out), leave
-- requests, and salaries (payroll). A new bounded context
-- (packages/hr), same branch-scoping pattern as Reception
-- (is_branch_staff()/is_admin() from earlier migrations) rather than a new
-- permission model.
--
-- Scope decisions made without asking (documented, not silent):
-- - Shifts are weekly-recurring (day_of_week + start/end time), not
--   specific-dated — matches how a small gym actually staffs, and is a
--   fraction of the complexity of a full dated-shift calendar.
-- - Shifts are set BY branch_manager/super_admin, not self-service by
--   the employee — matches "you set which days/hours each employee
--   works."
-- - Attendance is self-service: a staff member clocks themself in/out;
--   branch_manager/super_admin can read everyone's at their branch.
-- - Leave requests: a staff member creates their own; branch_manager/
--   super_admin approve/reject.
-- - Salaries are the one piece restricted to super_admin only — even
--   branch_manager cannot read or write them. This is the most
--   sensitive data in the system, matching how refunds and
--   admin/super_admin role grants are already super_admin-only
--   (docs/12-roles-and-permissions.md §12.3/§12.4).

-- ---------------------------------------------------------------------------
-- Work Shifts (Schedule)
-- ---------------------------------------------------------------------------
create table staff_shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null references branches (id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint chk_shift_time_order check (start_time < end_time)
);

create index idx_staff_shifts_profile on staff_shifts (profile_id);
create index idx_staff_shifts_branch on staff_shifts (branch_id);

alter table staff_shifts enable row level security;

create policy "branch staff read shifts" on staff_shifts for select
  using (is_branch_staff(branch_id));
create policy "branch_manager/super_admin manage shifts" on staff_shifts for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));
create policy "branch_manager/super_admin delete shifts" on staff_shifts for delete
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));

-- ---------------------------------------------------------------------------
-- Attendance (Clock In / Clock Out)
-- ---------------------------------------------------------------------------
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null references branches (id),
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  constraint chk_clock_out_after_in check (clock_out is null or clock_out > clock_in)
);

create index idx_attendance_profile on attendance_records (profile_id);
create index idx_attendance_branch_date on attendance_records (branch_id, clock_in);
-- Enforces "one open (not-yet-clocked-out) record per employee" at the
-- database level, not just in application code — a partial unique index
-- on profile_id where clock_out is null.
create unique index uq_attendance_one_open_per_profile on attendance_records (profile_id) where (clock_out is null);

alter table attendance_records enable row level security;

create policy "own attendance read" on attendance_records for select
  using (profile_id = auth.uid());
create policy "branch admins read all attendance" on attendance_records for select
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));
create policy "staff clock self in" on attendance_records for insert
  with check (profile_id = auth.uid() and is_branch_staff(branch_id));
create policy "staff clock self out" on attendance_records for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Leave Requests
-- ---------------------------------------------------------------------------
create type leave_status as enum ('pending', 'approved', 'rejected');

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null references branches (id),
  start_date date not null,
  end_date date not null,
  reason text not null,
  status leave_status not null default 'pending',
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_leave_date_order check (start_date <= end_date)
);

create index idx_leave_requests_profile on leave_requests (profile_id);
create index idx_leave_requests_branch on leave_requests (branch_id);

alter table leave_requests enable row level security;

create policy "own leave requests read" on leave_requests for select
  using (profile_id = auth.uid());
create policy "branch admins read all leave requests" on leave_requests for select
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));
create policy "staff create own leave request" on leave_requests for insert
  with check (profile_id = auth.uid() and is_branch_staff(branch_id));
create policy "branch admins review leave requests" on leave_requests for update
  using (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'))
  with check (is_branch_staff(branch_id) and auth_role() in ('branch_manager', 'super_admin'));

-- ---------------------------------------------------------------------------
-- Salaries (Payroll) — super_admin only, see note at top of file.
-- ---------------------------------------------------------------------------
create table staff_salaries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null references branches (id),
  monthly_amount numeric(10, 2) not null check (monthly_amount >= 0),
  effective_from date not null,
  created_at timestamptz not null default now()
);

create index idx_staff_salaries_profile on staff_salaries (profile_id, effective_from desc);

alter table staff_salaries enable row level security;

create policy "super_admin manages salaries" on staff_salaries for all
  using (is_super_admin())
  with check (is_super_admin());
