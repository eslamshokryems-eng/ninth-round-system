-- Supporting schema for LOCAL-ONLY verification of
-- supabase/migrations/20261111000001_audit_log_function_execute_lockdown.sql
-- — the fix for H-1 (log_audit_event_as callable by anon/authenticated) and
-- M-2 (log_audit_event callable by anon).
--
-- Design, mirroring supabase/tests/identity_authorization/: this file builds
-- ONLY the supporting objects. run.sh then extracts the two audit functions
-- VERBATIM from 20260815000001_audit_log.sql and applies the REAL fix
-- migration by relative path, so what the tests exercise is the actual
-- shipped definitions and the actual shipped grants — never a copy of them.
--
-- THIS IS NOT THE PRODUCTION SUPABASE SCHEMA. auth.uid() reads a settable
-- GUC rather than a verified JWT, and only the objects the two audit
-- functions touch (profiles, admin_audit_log) are reproduced. See README.md
-- for exactly what is and is not covered.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- Supabase's service_role is a NON-SUPERUSER with BYPASSRLS. That matters:
  -- BYPASSRLS bypasses row-level security only, never function EXECUTE
  -- grants, which is why 20261111000001 has to grant service_role
  -- explicitly instead of relying on the PUBLIC default it is removing.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Supabase grants DML on new public tables to anon and authenticated at the
-- project level — measured on a real local stack as
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE for both. The
-- Challenges harness grants only SELECT, which is why its direct-write tests
-- pass for the wrong reason; this harness does NOT repeat that mistake, so a
-- denial here is a real authorization denial.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type user_role as enum
  ('member', 'coach', 'nutritionist', 'reception', 'branch_manager', 'super_admin', 'sales_employee');

-- profiles — only the columns log_audit_event()/log_audit_event_as() read
-- (id, role, full_name) plus is_active, which auth_role() needs.
create table profiles (
  id uuid primary key,
  full_name text,
  role user_role not null default 'member',
  is_active boolean not null default true
);

-- admin_audit_log — source: 20260815000001_audit_log.sql. Note there is
-- deliberately NO insert policy for anon or authenticated; every legitimate
-- write goes through the SECURITY DEFINER functions, which is exactly why
-- their EXECUTE grants are the only thing standing in the way.
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

alter table admin_audit_log enable row level security;

-- source: 20260815000002_permissions_and_staff_status.sql:96-102, with the
-- fail-closed coalesce from 20261107000001.
create or replace function auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select coalesce(public.auth_role() = 'super_admin', false);
$$;

-- source: 20260815000001_audit_log.sql:73 — super-admin SELECT only.
create policy "super_admin reads audit log" on admin_audit_log
  for select using (is_super_admin());

-- ---------------------------------------------------------------------------
-- SECURITY INVOKER proxy for the membership dependency.
--
-- register_membership() and renew_membership() are SECURITY INVOKER
-- (20260815000001:344 and :413; redefined with the same mode at
-- 20260917000001:26 and :119) and call log_audit_event() in their bodies, so
-- the inner call runs as the CALLING user and needs the authenticated
-- EXECUTE grant. That dependency — a security-invoker function calling
-- log_audit_event as the caller — is what this proxy reproduces exactly.
--
-- The real functions are NOT reproduced here: their final shape is assembled
-- across five migrations of ALTERs over members/memberships/
-- membership_types/membership_payments, and a hand-rebuilt approximation
-- would risk failing for schema reasons that have nothing to do with the
-- grant under test. run.sh instead asserts statically, against the real
-- migration files, that both functions are security invoker and do call
-- log_audit_event — which is the property this proxy stands in for. See
-- README.md.
-- ---------------------------------------------------------------------------
create or replace function harness_invoker_logs_audit(p_action text)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_log_id uuid;
begin
  v_log_id := public.log_audit_event(
    p_action, 'membership', gen_random_uuid(), null,
    jsonb_build_object('membership_number', '9R-000001'), '{}'::jsonb
  );
  return v_log_id;
end;
$$;

revoke execute on function harness_invoker_logs_audit(text) from public;
grant execute on function harness_invoker_logs_audit(text) to authenticated;
