-- THE NINTH — 0/N: standalone foundation.
--
-- THE NINTH runs in its OWN Supabase project. This migration is the only place the
-- shared building blocks live, so no later migration needs anything from another system:
--
--   * race_profiles  — one row per THE NINTH account (a Supabase Auth user of THIS project).
--                      Global authority: is_super_admin, can_create_events, is_active.
--                      Event roles (Event Manager, Master Control, Reception, Judge, Station
--                      Screen) live in race_staff (migration 4) and are per-event.
--   * race_audit_log — THE NINTH's own append-only audit history.
--   * race_gender    — the athlete gender enum.
--
-- Nothing here references, reads or mirrors any other database. The same person may hold an
-- account in the gym-management system and one here; the two accounts, passwords, sessions
-- and permissions are unrelated.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- athlete name search

create type race_gender as enum ('female', 'male', 'unspecified');

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table race_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  is_active boolean not null default true,
  -- Global authority. Never client-writable: only a super admin, through race_set_account_flags().
  is_super_admin boolean not null default false,
  can_create_events boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_race_profiles_email on race_profiles (lower(email));

create or replace function race_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Every new Auth user of this project gets a profile — with NO authority.
create or replace function race_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.race_profiles (id, email, full_name)
  values (NEW.id, NEW.email, coalesce(NEW.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return NEW;
end;
$$;
create trigger trg_race_on_auth_user_created after insert on auth.users
  for each row execute function race_handle_new_user();

-- The database owner (SQL editor / bootstrap script) may change flags; an API client never can,
-- not even on its own row.
create or replace function race_guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if NEW.is_super_admin is distinct from OLD.is_super_admin
       or NEW.can_create_events is distinct from OLD.can_create_events
       or NEW.is_active is distinct from OLD.is_active
       or NEW.id is distinct from OLD.id
       or NEW.email is distinct from OLD.email then
      raise exception 'RACE_FORBIDDEN: account flags are changed only through race_set_account_flags()' using errcode = 'insufficient_privilege';
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
create trigger trg_race_profiles_guard before update on race_profiles
  for each row execute function race_guard_profile_update();

-- ---------------------------------------------------------------------------
-- Authority helpers. Strict: they return TRUE or FALSE, never NULL, so every guard can be
-- written `IS NOT TRUE` and an anonymous or deactivated caller is refused.
-- ---------------------------------------------------------------------------

create or replace function race_auth_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_active from public.race_profiles p where p.id = auth.uid()), false);
$$;

create or replace function race_is_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_active and p.is_super_admin from public.race_profiles p where p.id = auth.uid()), false);
$$;

create or replace function race_can_create_events()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_active and (p.is_super_admin or p.can_create_events) from public.race_profiles p where p.id = auth.uid()), false);
$$;

alter table race_profiles enable row level security;
revoke all on race_profiles from anon, authenticated;
create policy "race profiles: own row" on race_profiles for select to authenticated using (id = auth.uid());
create policy "race profiles: super admin reads all" on race_profiles for select to authenticated using (race_is_super_admin());
grant select on race_profiles to authenticated;
grant update (full_name, phone) on race_profiles to authenticated;
create policy "race profiles: edit own name and phone" on race_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Super admin only: promote/demote, grant event creation, deactivate. Audited. A super admin
-- cannot remove their own super-admin flag (no accidental lock-out).
create or replace function race_set_account_flags(
  p_user_id uuid,
  p_is_super_admin boolean default null,
  p_can_create_events boolean default null,
  p_is_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.race_profiles;
begin
  if public.race_is_super_admin() is not true then
    raise exception 'RACE_FORBIDDEN: only a super admin can change account flags' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.race_profiles where id = p_user_id for update;
  if o.id is null then
    raise exception 'RACE_NOT_FOUND: no such account' using errcode = 'no_data_found';
  end if;
  if p_user_id = auth.uid() and (p_is_super_admin is false or p_is_active is false) then
    raise exception 'RACE_FORBIDDEN: you cannot remove your own super-admin access or deactivate yourself' using errcode = 'insufficient_privilege';
  end if;
  update public.race_profiles
     set is_super_admin = coalesce(p_is_super_admin, is_super_admin),
         can_create_events = coalesce(p_can_create_events, can_create_events),
         is_active = coalesce(p_is_active, is_active)
   where id = p_user_id;
  perform public.race_log_audit_event(
    'race.account.flags', 'race_profiles', p_user_id,
    jsonb_build_object('is_super_admin', o.is_super_admin, 'can_create_events', o.can_create_events, 'is_active', o.is_active),
    jsonb_build_object('is_super_admin', coalesce(p_is_super_admin, o.is_super_admin), 'can_create_events', coalesce(p_can_create_events, o.can_create_events),
                       'is_active', coalesce(p_is_active, o.is_active)),
    '{}'::jsonb);
end;
$$;
revoke execute on function race_set_account_flags(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function race_set_account_flags(uuid, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- THE NINTH's own audit history (append-only; every write goes through
-- race_log_audit_event(), which stamps the caller and the server time).
-- ---------------------------------------------------------------------------

create table race_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  actor_id uuid,                     -- deliberately no FK: history must outlive an account
  actor_full_name text,
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb
);
create index idx_race_audit_log_action on race_audit_log (action, created_at desc);
create index idx_race_audit_log_target on race_audit_log (target_table, target_id);
create index idx_race_audit_log_event on race_audit_log (((metadata ->> 'event_id')), created_at desc);
alter table race_audit_log enable row level security;
revoke all on race_audit_log from anon, authenticated;
-- No insert/update/delete policy for any API role: the log can only be written by the function below.

create or replace function race_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'RACE_APPEND_ONLY: the audit log cannot be changed or deleted' using errcode = 'insufficient_privilege';
end;
$$;
create trigger trg_race_audit_log_immutable before update or delete on race_audit_log
  for each row execute function race_audit_log_immutable();
create trigger trg_race_audit_log_no_truncate before truncate on race_audit_log
  for each statement execute function race_audit_log_immutable();

create or replace function race_log_audit_event(
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
  v_id uuid;
begin
  insert into public.race_audit_log (actor_id, actor_full_name, action, target_table, target_id, before, after, metadata)
  values (auth.uid(), (select p.full_name from public.race_profiles p where p.id = auth.uid()),
          p_action, p_entity_type, p_entity_id, p_previous_value, p_new_value, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
-- Internal: reachable only from other SECURITY DEFINER functions and triggers.
revoke execute on function race_log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

create policy "race audit: super admin reads all" on race_audit_log for select to authenticated using (race_is_super_admin());
grant select on race_audit_log to authenticated;
