-- Minimal schema for the device-verification harness. The device_verification_codes
-- table itself is NOT redefined here: run.sh extracts its real DDL from
-- 20260922000001_device_verification.sql, so there is no second copy to drift.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  alter role service_role nologin bypassrls;
end $$;
-- Supabase grants service_role every privilege on new public tables by default
-- (RLS is bypassed by BYPASSRLS, not by lack of grants). Mirror that, so a
-- direct call to one of the helpers fails or succeeds for the right reason.
alter default privileges in schema public grant all on tables to service_role;
create extension if not exists pgcrypto;
create table profiles (id uuid primary key);
