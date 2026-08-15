-- Production-safety layers 2/3 (staff activate/deactivate, part of Backup
-- & Recovery's "don't destroy data" principle) and 3/3 (Advanced
-- Permissions).
--
-- Security gap found during this audit, fixed first (before anything
-- else in this file depends on it): the "update own profile" policy
-- (`for update using (auth.uid() = id)`, 20260801000002) has no WITH
-- CHECK — and per Postgres's own documented behavior, an UPDATE policy
-- with no WITH CHECK reuses its USING expression as the check. That means
-- any signed-in account — reception, sales, coach, anyone — could today
-- issue `update profiles set role = 'super_admin' where id = auth.uid()`
-- directly against the API (not through the app UI, which never offers
-- this, but the database itself did not stop it) and self-promote. This
-- is exactly the "bypass permissions via a direct API request" class of
-- gap this request asks to be tested for. Fixed with a trigger rather
-- than a WITH CHECK clause, because "some columns are self-editable,
-- others require admin rights" needs an OLD-vs-NEW comparison, which a
-- declarative RLS expression cannot express on its own.
--
-- Prerequisite fix: is_admin()/is_super_admin() call auth_role()
-- *unqualified*. That's harmless when they run in a normal session (whose
-- search_path is "$user, public" by default), but this migration's new
-- functions below are all `set search_path = ''` (pinned, per the
-- security-definer convention 20260806000004_fix_auth_role.sql already
-- established) — and Postgres GUC-style SET clauses on a function persist
-- into the functions *it* calls, not just its own body. A
-- search_path=''-pinned function calling is_admin() would therefore hit
-- "function auth_role() does not exist" the instant is_admin() tries to
-- resolve its own unqualified `auth_role()` call — verified against
-- pglite: this is exactly the failure the first version of this migration
-- hit. Schema-qualifying the call inside is_admin()/is_super_admin() fixes
-- it for every caller, old and new alike, since `public.auth_role()`
-- resolves identically to the old unqualified form wherever `public` was
-- already on the search path.
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select public.auth_role() in ('branch_manager', 'super_admin');
$$;

create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select public.auth_role() = 'super_admin';
$$;

create or replace function protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
    or new.branch_id is distinct from old.branch_id
    or new.employee_code is distinct from old.employee_code
  ) and not public.is_admin() then
    raise exception 'Only a branch manager or super admin can change role, branch, or employee code.';
  end if;
  return new;
end;
$$;

create trigger trg_protect_privileged_profile_columns
  before update on profiles
  for each row execute function protect_privileged_profile_columns();

-- ---------------------------------------------------------------------------
-- Staff activate/deactivate. Two layers, deliberately:
--   1. `profiles.is_active` — fast to query for the Manage Staff list, and
--      feeds `auth_role()`/`is_branch_staff()` below (defense in depth:
--      any RLS-gated read/write immediately stops working for a disabled
--      account, even before/without relying on their session expiring).
--   2. Supabase Auth's own `ban_duration` (set via the Admin API from the
--      new /api/staff/set-active-status Route Handler, service-role only
--      — see that file) — this is what makes *signing in* itself fail
--      cleanly with a real error, instead of a disabled account still
--      being able to log in and then silently seeing empty/blocked
--      screens everywhere. `is_active` alone cannot do this: Supabase
--      Auth has no knowledge of an app-level `profiles` column.
-- Never a delete: matches "do not destroy a departed staff member's
-- historical identity" — their existing payments/memberships/check-ins/
-- audit log entries keep referencing their unchanged profile id.
-- ---------------------------------------------------------------------------

alter table profiles add column is_active boolean not null default true;

-- protect_privileged_profile_columns() (above) already covers is_active
-- too, since it's evaluated on every UPDATE regardless of which columns
-- changed — no separate migration needed for that; re-stated here only as
-- a comment for anyone reading this file in isolation.

create or replace function auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() and is_active;
$$;

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
        and p.is_active
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    );
$$;

-- Profile-specific audit trigger (separate from the generic
-- log_table_change() in 20260815000001_audit_log.sql, which only covers
-- members/membership_payments/check_ins/memberships): profiles needs its
-- own because "change_role"/"disable_user"/"enable_user" are meaningful,
-- named actions this app's stakeholders actually asked to see, not just
-- a generic "update_staff".
create or replace function log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  -- A null auth.uid() means this update came from a service-role
  -- connection (apps/web's staff Route Handlers — create-account,
  -- set-password, set-active-status — all use the service-role key so
  -- they can call the Supabase Auth Admin API, not the acting admin's own
  -- session). Those routes already know the real acting admin's id
  -- (verified via verify-staff-admin.ts before the service-role client is
  -- built) and call log_audit_event_as() themselves with correct
  -- attribution — logging again here would either produce a second,
  -- unknown-actor entry for the same change, or attribute it to nobody.
  -- Skipping keeps this trigger's job to what it can actually get right:
  -- attributing a change to the session that made it.
  if auth.uid() is null then
    return new;
  end if;

  if new.is_active is distinct from old.is_active then
    v_action := case when new.is_active then 'enable_user' else 'disable_user' end;
  elsif new.role is distinct from old.role then
    v_action := 'change_role';
  else
    v_action := 'update_staff';
  end if;

  perform public.log_audit_event(v_action, 'staff', new.id, to_jsonb(old), to_jsonb(new), '{}'::jsonb);
  return new;
end;
$$;

create trigger trg_audit_profiles_update
  after update on profiles
  for each row execute function log_profile_change();

-- ---------------------------------------------------------------------------
-- Advanced Permissions: a scalable catalog (Super Admin can grant/revoke
-- individual permissions per role or per user) layered ON TOP of the
-- existing 5-role model (packages/identity's Role/UserRoleName — reused
-- as-is, not duplicated: SUPER ADMIN=super_admin, MANAGER=branch_manager,
-- RECEPTION=reception, SALES=sales_employee, COACH=coach).
--
-- Scope of what this actually gates in this pass, stated plainly: the
-- catalog is fully wired to the Audit Log page (audit_logs.view) below,
-- and is the system of record shown/edited in the new Permissions admin
-- page. It is NOT retrofitted onto every pre-existing RLS policy in this
-- pass — those policies (is_branch_staff()/auth_role() checks on members,
-- memberships, payments, HR, etc.) already enforce real, tested,
-- database-level restrictions per role and continue to do so unchanged.
-- Routing every one of them through has_permission() instead is a
-- materially larger, higher-blast-radius change on a live production
-- system than this pass makes unilaterally — it's called out explicitly
-- as a recommended follow-up in the final report, not silently done or
-- silently skipped.
-- ---------------------------------------------------------------------------

create table permissions (
  key text primary key,
  category text not null,
  description text not null
);

insert into permissions (key, category, description) values
  ('members.view', 'members', 'View member records'),
  ('members.create', 'members', 'Create new members'),
  ('members.edit', 'members', 'Edit existing member records'),
  ('memberships.view', 'memberships', 'View memberships'),
  ('memberships.create', 'memberships', 'Register a new membership'),
  ('memberships.edit', 'memberships', 'Edit an existing membership'),
  ('memberships.renew', 'memberships', 'Renew a membership'),
  ('memberships.cancel', 'memberships', 'Cancel a membership'),
  ('payments.view', 'payments', 'View payment records'),
  ('payments.create', 'payments', 'Record a payment'),
  ('payments.edit', 'payments', 'Edit a payment record (not currently built in the app)'),
  ('payments.refund', 'payments', 'Refund a payment (not currently built in the app)'),
  ('receipts.view', 'receipts', 'View receipts'),
  ('receipts.create', 'receipts', 'Create a receipt'),
  ('receipts.void', 'receipts', 'Void a receipt (not currently built in the app)'),
  ('checkins.view', 'checkins', 'View check-in records'),
  ('checkins.create', 'checkins', 'Check a member in'),
  ('checkins.edit', 'checkins', 'Correct or delete a check-in (not currently built in the app)'),
  ('staff.view', 'staff', 'View staff accounts'),
  ('staff.create', 'staff', 'Create a staff account'),
  ('staff.edit', 'staff', 'Edit a staff account (role, etc.)'),
  ('staff.disable', 'staff', 'Activate or deactivate a staff account'),
  ('reports.view', 'reports', 'View reports'),
  ('audit_logs.view', 'system', 'View the audit log'),
  ('settings.manage', 'system', 'Manage system settings (not currently built in the app)'),
  ('roles.manage', 'system', 'Change a staff account''s role'),
  ('permissions.manage', 'system', 'Grant or revoke permissions for roles/users');

create table role_permissions (
  role user_role not null,
  permission_key text not null references permissions (key) on delete cascade,
  primary key (role, permission_key)
);

create table user_permission_overrides (
  profile_id uuid not null references profiles (id) on delete cascade,
  permission_key text not null references permissions (key) on delete cascade,
  granted boolean not null,
  granted_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

-- Seed defaults. super_admin gets every key explicitly (purely for a
-- correct-looking Permissions page display — has_permission() below
-- already short-circuits true for super_admin regardless of this table's
-- contents, so this row set is not what actually grants super_admin
-- access).
insert into role_permissions (role, permission_key)
select 'super_admin', key from permissions;

insert into role_permissions (role, permission_key) values
  ('branch_manager', 'members.view'), ('branch_manager', 'members.create'), ('branch_manager', 'members.edit'),
  ('branch_manager', 'memberships.view'), ('branch_manager', 'memberships.create'),
  ('branch_manager', 'memberships.edit'), ('branch_manager', 'memberships.renew'), ('branch_manager', 'memberships.cancel'),
  ('branch_manager', 'payments.view'), ('branch_manager', 'payments.create'),
  ('branch_manager', 'receipts.view'), ('branch_manager', 'receipts.create'),
  ('branch_manager', 'checkins.view'), ('branch_manager', 'checkins.create'),
  ('branch_manager', 'staff.view'), ('branch_manager', 'staff.create'), ('branch_manager', 'staff.edit'), ('branch_manager', 'staff.disable'),
  ('branch_manager', 'reports.view'),

  ('reception', 'members.view'), ('reception', 'members.create'), ('reception', 'members.edit'),
  ('reception', 'memberships.view'), ('reception', 'memberships.create'), ('reception', 'memberships.renew'),
  ('reception', 'payments.view'), ('reception', 'payments.create'),
  ('reception', 'receipts.view'), ('reception', 'receipts.create'),
  ('reception', 'checkins.view'), ('reception', 'checkins.create'),

  ('sales_employee', 'members.view'), ('sales_employee', 'members.create'), ('sales_employee', 'members.edit'),
  ('sales_employee', 'memberships.view'), ('sales_employee', 'memberships.create'), ('sales_employee', 'memberships.renew'),
  ('sales_employee', 'payments.view'), ('sales_employee', 'payments.create'),
  ('sales_employee', 'receipts.view'), ('sales_employee', 'receipts.create'),

  ('coach', 'members.view'), ('coach', 'memberships.view'), ('coach', 'checkins.view');

create or replace function has_permission(p_permission_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or coalesce(
      (select granted from public.user_permission_overrides
         where profile_id = auth.uid() and permission_key = p_permission_key),
      exists (
        select 1 from public.role_permissions rp
        where rp.role::text = public.auth_role() and rp.permission_key = p_permission_key
      )
    );
$$;

alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_permission_overrides enable row level security;

create policy "super_admin reads permission catalog" on permissions for select using (is_super_admin());
create policy "super_admin reads role permissions" on role_permissions for select using (is_super_admin());
create policy "super_admin reads all overrides, staff reads own" on user_permission_overrides for select
  using (is_super_admin() or profile_id = auth.uid());
-- No insert/update/delete policies on any of the three tables — writes go
-- exclusively through set_role_permission()/set_user_permission_override()
-- below, which check is_super_admin() themselves and log every change.

create or replace function set_role_permission(p_role user_role, p_permission_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can manage role permissions.';
  end if;

  if p_granted then
    insert into public.role_permissions (role, permission_key) values (p_role, p_permission_key)
    on conflict do nothing;
  else
    delete from public.role_permissions where role = p_role and permission_key = p_permission_key;
  end if;

  perform public.log_audit_event(
    'change_permissions', 'role_permissions', null, null,
    jsonb_build_object('role', p_role, 'permission_key', p_permission_key, 'granted', p_granted),
    '{}'::jsonb
  );
end;
$$;

grant execute on function set_role_permission(user_role, text, boolean) to authenticated;

create or replace function set_user_permission_override(p_profile_id uuid, p_permission_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can manage user permission overrides.';
  end if;

  insert into public.user_permission_overrides (profile_id, permission_key, granted, granted_by)
  values (p_profile_id, p_permission_key, p_granted, auth.uid())
  on conflict (profile_id, permission_key) do update set granted = excluded.granted, granted_by = excluded.granted_by;

  perform public.log_audit_event(
    'change_permissions', 'user_permission_overrides', p_profile_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'permission_key', p_permission_key, 'granted', p_granted),
    '{}'::jsonb
  );
end;
$$;

grant execute on function set_user_permission_override(uuid, text, boolean) to authenticated;

create or replace function clear_user_permission_override(p_profile_id uuid, p_permission_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can manage user permission overrides.';
  end if;

  delete from public.user_permission_overrides where profile_id = p_profile_id and permission_key = p_permission_key;

  perform public.log_audit_event(
    'change_permissions', 'user_permission_overrides', p_profile_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'permission_key', p_permission_key, 'cleared', true),
    '{}'::jsonb
  );
end;
$$;

grant execute on function clear_user_permission_override(uuid, text) to authenticated;

-- Upgrade the Audit Log's own access check from the hardcoded
-- is_super_admin() set in 20260815000001_audit_log.sql to the scalable
-- permission system now that it exists — functionally identical today
-- (has_permission() also resolves true for super_admin unconditionally,
-- and audit_logs.view is seeded to super_admin only above), but now a
-- future super_admin could grant a specific trusted branch_manager
-- audit_logs.view via set_user_permission_override() without a code
-- change, which is the whole point of building this catalog.
drop policy "super_admin reads audit log" on admin_audit_log;
create policy "authorized users read audit log" on admin_audit_log for select
  using (has_permission('audit_logs.view'));
