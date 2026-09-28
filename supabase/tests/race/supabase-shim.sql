-- Minimal stand-in for the parts of a Supabase Postgres that this repo's
-- migrations depend on, so they can be applied to a vanilla Postgres for
-- testing (see run.sh). NOT a migration — never applied to a real project.
--
-- Mirrors Supabase semantics that matter for RLS tests:
--   - roles anon / authenticated / service_role (service_role BYPASSRLS)
--   - auth.uid() / auth.jwt() read the same GUCs PostgREST sets
--     (request.jwt.claim.sub, request.jwt.claims)
--   - default privileges: public-schema objects are granted to the API roles,
--     so RLS (not GRANTs) is the security boundary — exactly as on Supabase.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to current_user;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid, metadata jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
