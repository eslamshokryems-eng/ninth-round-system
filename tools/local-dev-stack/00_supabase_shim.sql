-- ===========================================================================
-- LOCAL DEV ONLY — a minimal stand-in for the parts of a Supabase project
-- that the migrations in supabase/migrations/ depend on.
--
-- This exists so the real application can be run and operated against the
-- real migrations on a plain local PostgreSQL server, with no Docker and no
-- network access to a Supabase project. It is NOT a reimplementation of
-- Supabase and it has no security value: `auth.users` here stores a salted
-- SHA-256 of a demo password, the JWT secret is a constant in this
-- directory, and nothing is rate-limited. Never point it at real data and
-- never run it anywhere but a developer machine.
--
-- What it provides, and why each piece is needed:
--   auth schema       — `auth.uid()` is referenced 223 times across the
--                       migrations; `auth.jwt()` 3 times; `auth.users` is
--                       the parent of `profiles.id` and the target of a
--                       trigger.
--   storage schema    — 20260806000008 creates a bucket and policies on
--                       storage.objects for member photos.
--   anon /            — the two client roles every RLS policy is written
--   authenticated       against, plus service_role for the server-side
--   / service_role      route handlers.
--   default privileges— the platform grants SELECT/INSERT/UPDATE/DELETE on
--                       every new public table to anon and authenticated.
--                       Without this, RLS would never be reached: a client
--                       would be stopped by a missing SQL grant instead,
--                       which is not how the real project behaves.
-- ===========================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- BYPASSRLS mirrors the real service_role. It does NOT bypass function
  -- EXECUTE grants (only a superuser does), which is why
  -- 20261111000001 has to grant log_audit_event_as to it explicitly.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  -- Roles are CLUSTER-wide, not per-database, so an `if not exists` create
  -- silently keeps whatever attributes an earlier harness on the same
  -- PostgreSQL server gave the role. The test harnesses under
  -- supabase/tests/ create a service_role of their own WITHOUT bypassrls,
  -- which left this database's service_role unable to write the
  -- service-role-only tables (trusted_devices, device_verification_codes,
  -- admin_audit_log) — they have RLS on and zero policies, so bypassrls is
  -- the whole mechanism. Asserted rather than assumed.
  alter role service_role nologin bypassrls;
end $$;

do $$
begin
  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'service_role must have BYPASSRLS for the service-role-only tables to be writable.';
  end if;
end $$;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  encrypted_password text not null,
  email_confirmed_at timestamptz default now(),
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The request's identity, read from the GUCs the gateway sets per request.
-- Same shape as the real helper: NULL when there is no authenticated user.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      nullif(current_setting('request.jwt.claim.sub', true), '')
    ), ''
  )::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
-- Deliberately NOT granting any privilege on auth.users to anon or
-- authenticated: on a real project the clients cannot read it either.
grant select, insert, update, delete on auth.users to service_role;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$ select string_to_array(name, '/'); $$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
