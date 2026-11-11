-- Minimal supporting-schema harness for LOCAL-ONLY verification of the
-- Challenges migrations (supabase/migrations/20261105000001_challenges_
-- foundation.sql, 20261105000002_challenges_rls_and_rpcs.sql, and
-- 20261106000001_challenges_mvp_membership_independence.sql). Reproduces
-- just enough of this repo's pre-existing schema (roles, helper
-- functions, and the few tables Challenges' SQL references) to apply and
-- exercise all three real migrations unmodified, on a throwaway local
-- database.
--
-- THIS IS NOT THE PRODUCTION SUPABASE SCHEMA. It is a hand-built,
-- deliberately minimal stand-in — see README.md's "What this harness
-- does NOT verify" section for exactly what that means and what still
-- needs checking against the real Supabase project before this
-- migration is ever applied there. In particular: `auth.uid()` here
-- reads a plain settable session variable, not a real Supabase JWT; the
-- helper functions below are copied by hand from their real
-- definitions (cited per-function) and must be kept in sync by hand if
-- those real definitions ever change; and only the columns these
-- specific Challenges functions reference are reproduced — not the
-- full real table definitions.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Phase 3 harness-fidelity fix, widened for L-4: Supabase's own project
-- automatically grants SELECT, INSERT, UPDATE and DELETE on every new
-- table to anon+authenticated at the platform level — this is why no Challenges migration has ever had to
-- add a table-level grant itself (RLS alone decides row visibility on
-- top of this). Earlier harness phases never needed this, because every
-- prior test went through a SECURITY DEFINER RPC (which runs as the
-- table owner, bypassing grants entirely) rather than a direct table/view
-- read. Phase 3's new leaderboard views and its broader "authenticated
-- can read" RLS policies are the first things this harness tests via a
-- plain client SELECT — without this, every one of those would fail
-- with "permission denied for table/view X" even though RLS itself would
-- have allowed the row, silently testing against a stricter-than-real
-- privilege model.
--
-- L-4: the earlier version of this line granted SELECT only, which made
-- every write-path test in this harness pass for the WRONG REASON — a
-- direct client INSERT/UPDATE/DELETE was stopped by a missing SQL GRANT
-- ("permission denied for table X"), which is a condition that does not
-- exist on a real Supabase project. With the write privileges granted as
-- the platform grants them, the only thing left standing between a
-- client and a direct table write is the absence of a write POLICY, which
-- is what 105_rls_write_paths.sql now tests, with negative controls that
-- prove each assertion actually detects.
--
-- Must run before any table/view is created (applies only to objects the
-- SAME role — postgres, here — creates afterward).
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists pg_trgm;

-- auth schema shim: auth.uid() reads a per-session GUC instead of a real
-- JWT claim. Good enough to drive RLS/ownership/role-switching tests via
-- `set role authenticated; set request.jwt.claim.sub = '<uuid>';` from
-- plain psql, which is this harness's whole point — it is NOT a
-- recreation of Supabase's actual auth stack.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Pre-existing enums these Challenges functions reference.
create type user_role as enum ('member', 'coach', 'nutritionist', 'reception', 'branch_manager', 'super_admin', 'sales_employee');
create type gender as enum ('male', 'female');
create type program_type as enum ('ninth_round', 'boxing', 'kickboxing', 'mma');
create type membership_status as enum ('active', 'expired', 'cancelled');

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Pre-existing tables Challenges' SQL references (trimmed to the columns
-- actually used by challenges_foundation.sql / challenges_rls_and_rpcs.sql).
create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table profiles (
  id uuid primary key,
  full_name text,
  role user_role not null default 'member',
  branch_id uuid references branches (id),
  date_of_birth date,
  is_active boolean not null default true
);

create table members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  full_name text not null,
  date_of_birth date,
  linked_profile_id uuid references profiles (id)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id),
  branch_id uuid not null references branches (id),
  status membership_status not null default 'active',
  program_type program_type,
  coach_id uuid references profiles (id)
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

-- Pre-existing helper functions Challenges' SQL calls — reproduced
-- verbatim from their real definitions so behavior under test matches
-- production's functions, not a simplified stand-in. Source migrations
-- cited per function; re-sync by hand if those ever change.

-- source: 20260815000002_permissions_and_staff_status.sql
create or replace function auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() and is_active;
$$;

-- source: 20261107000001_fail_closed_authorization_guards.sql (the
-- fail-closed replacement for 20260815000002's original, which returned
-- NULL rather than false whenever auth_role() was NULL — an `anon`
-- caller, a service_role backend, or a DEACTIVATED staff member holding
-- a live token — so that every `if not is_super_admin() then raise`
-- guard was silently skipped for them).
create or replace function is_service_role()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  ) = 'service_role';
$$;

-- source: 20261107000001_fail_closed_authorization_guards.sql
--
-- is_admin() is not called by any Challenges object, but it IS one of the
-- two helpers that 20261113000001 pins a search_path onto, so the L-2
-- A/B negative control needs the PRE-fix definition present here —
-- otherwise `APPLY_L1L2=0` would make the L-2 regression checks fail
-- merely because the function does not exist, rather than because it is
-- unpinned. Byte-identical to the migration's body — run.sh asserts
-- that textually against the migration file before applying anything,
-- so this copy cannot silently drift from the real definition.
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select coalesce(public.auth_role() in ('branch_manager', 'super_admin'), false)
      or public.is_service_role();
$$;

-- source: 20261107000001_fail_closed_authorization_guards.sql
create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select coalesce(public.auth_role() = 'super_admin', false)
      or public.is_service_role();
$$;

-- source: 20261107000001_fail_closed_authorization_guards.sql (the
-- fail-closed replacement for 20260914000001_fix_is_branch_staff_rls_
-- recursion.sql's security-definer version; body otherwise identical)
create or replace function is_branch_staff(target_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role in ('branch_manager', 'reception', 'coach', 'sales_employee')
    ),
    false
  );
$$;

-- source: 20260815000001_audit_log.sql
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
