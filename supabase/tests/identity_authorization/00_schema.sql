-- Minimal supporting-schema harness for LOCAL-ONLY verification of
-- supabase/migrations/20261107000001_fail_closed_authorization_guards.sql
-- — the fix for the confirmed profile privilege-escalation (F-1) and the
-- NULL-open authorization guards.
--
-- The design mirrors supabase/tests/challenges_phase2/: this file builds
-- the PRE-FIX world (the real profiles table, policies, helpers and
-- triggers exactly as the historical migrations leave them), and run.sh
-- then applies the REAL fix migration by relative path. So what is under
-- test is the actual migration file, not a copy of it.
--
-- THIS IS NOT THE PRODUCTION SUPABASE SCHEMA. auth.uid() here reads a
-- settable GUC rather than a verified JWT, and only the columns and
-- tables these specific functions touch are reproduced. See README.md.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- service_role exists in every real Supabase project; the fix migration
  -- grants EXECUTE on prepare_staff_deletion() to it.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- Supabase grants DML on new public tables to anon and authenticated at
-- the project level — measured on a real local stack as
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE for both. RLS
-- is therefore the only gate, which is exactly why these guards matter.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;

create extension if not exists pgcrypto;

-- auth shim. auth.uid() reads request.jwt.claim.sub; is_service_role()
-- (added by the fix migration) reads request.jwt.claims — measured to be
-- the GUC PostgREST actually populates on GoTrue v2.197/PostgREST v16.5.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type user_role as enum
  ('member', 'coach', 'nutritionist', 'reception', 'branch_manager', 'super_admin', 'sales_employee');

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- profiles, with the columns the guards reference (source:
-- 20260801000002_profiles_and_trainers.sql + the later add-column
-- migrations 20260806000002 branch_id, 20260812000001 employee_code,
-- 20260815000002 is_active).
create table profiles (
  id uuid primary key,
  full_name text,
  role user_role not null default 'member',
  branch_id uuid references branches (id),
  employee_code text unique,
  is_active boolean not null default true,
  referred_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  actor_role text,
  actor_full_name text,
  action text,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Leads, for the enforce_lead_assignment_rules() guard (source:
-- 20261020000001_lead_assignment_guard.sql). Trimmed to the columns that
-- trigger reads.
create table leads (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches (id),
  assigned_to uuid references profiles (id),
  created_by uuid references profiles (id)
);

-- ---------------------------------------------------------------------------
-- PRE-FIX definitions, verbatim from their real migrations. run.sh
-- applies the real fix migration on top of these, so the diff in
-- behaviour that the tests observe is produced by the fix itself.
-- ---------------------------------------------------------------------------

-- source: 20260815000002_permissions_and_staff_status.sql:96-102
create or replace function auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() and is_active;
$$;

-- source: 20260815000002:35-40 (PRE-FIX: returns NULL when auth_role() is NULL)
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select public.auth_role() in ('branch_manager', 'super_admin');
$$;

-- source: 20260815000002:42-47 (PRE-FIX)
create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select public.auth_role() = 'super_admin';
$$;

-- source: 20260914000001_fix_is_branch_staff_rls_recursion.sql:23-37 (PRE-FIX)
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

-- source: 20260815000001_audit_log.sql:125-147ish — the generic logger the
-- profile trigger calls. Trimmed to the insert these tests observe.
create or replace function log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous_value jsonb default null,
  p_new_value jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_actor_name text;
  v_log_id uuid;
begin
  select role::text, full_name into v_actor_role, v_actor_name
  from public.profiles where id = auth.uid();

  insert into public.admin_audit_log
    (admin_id, actor_role, actor_full_name, action, target_table, target_id, before, after, metadata)
  values
    (auth.uid(), v_actor_role, v_actor_name, p_action, p_entity_type, p_entity_id, p_previous_value, p_new_value, p_metadata)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- source: 20260815000002:49-69 (PRE-FIX: is_active is NOT protected)
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

-- source: 20260815000002:125-164 — the profile audit trigger, including
-- its deliberate "skip when auth.uid() is null (service-role write)".
create or replace function log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
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

alter table profiles enable row level security;

-- source: 20260801000002:119-121
create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);
create policy "admins manage all profiles" on profiles for all using (is_admin());

-- source: 20261020000001_lead_assignment_guard.sql:40-69 (PRE-FIX)
create or replace function enforce_lead_assignment_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target_branch_id uuid;
begin
  if new.assigned_to is distinct from old.assigned_to then
    if not (public.auth_role() in ('branch_manager', 'super_admin')) then
      if not (old.assigned_to is null and new.assigned_to = auth.uid()) then
        raise exception 'Only a branch manager or super admin can reassign a lead. A sales employee may only claim an unassigned lead for themselves.';
      end if;
    end if;

    if new.assigned_to is not null then
      select branch_id into v_target_branch_id from public.profiles where id = new.assigned_to;
      if v_target_branch_id is distinct from new.branch_id then
        raise exception 'Cannot assign a lead to a staff member from a different branch.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_lead_assignment_rules
  before update on leads
  for each row execute function enforce_lead_assignment_rules();

alter table leads enable row level security;
create policy "branch staff manage leads" on leads for all using (is_branch_staff(branch_id));

-- prepare_staff_deletion(): the REAL guard, with the destructive body
-- deliberately trimmed to the two actor-column updates these tests can
-- observe (the real function at 20260821000002:45-63 nulls 19 such
-- columns). The guard, the SECURITY DEFINER context and the default
-- EXECUTE-to-PUBLIC grant — the three things under test — are faithful.
create or replace function prepare_staff_deletion(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can delete a staff account.';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  select role::text into v_target_role from public.profiles where id = p_profile_id;
  if v_target_role is null then
    raise exception 'Employee not found.';
  end if;
  if v_target_role = 'member' then
    raise exception 'That account is a member, not a staff account.';
  end if;

  update public.leads set created_by = null where created_by = p_profile_id;
  update public.admin_audit_log set admin_id = null where admin_id = p_profile_id;

  perform public.log_audit_event(
    'delete_user', 'staff', p_profile_id,
    jsonb_build_object('role', v_target_role), null, '{}'::jsonb
  );
end;
$$;
