-- Phase 1 — identity: profiles (extends auth.users), unified staff model
-- (trainer / nutritionist / reception), and staff↔client assignment.
--
-- Staff model note: trainers, nutritionists, and reception share one
-- extension table (`staff_profiles`) and one assignment table
-- (`staff_client_assignments`) rather than three near-identical parallel
-- tables — a new staff type (e.g. a future "physiotherapist" role) is then
-- an enum value + role-specific fields in `metadata`, not a new table. Each
-- bounded context (Training, Nutrition) still owns its own domain model in
-- `packages/training` / `packages/nutrition` — this table is shared
-- infrastructure, not a shared domain concept. See docs/13-ddd-architecture.md.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role user_role not null default 'client',
  preferred_locale locale_code not null default 'en',
  gender gender,
  date_of_birth date,
  -- Denormalized "current" body metrics captured during onboarding. Full
  -- weight *history* is owned by the tracking context's `weight_logs` table
  -- once it's implemented — see docs/phase-1/12-implementation-status.md.
  -- This column becomes a cached "latest known weight" convenience read at
  -- that point, not the source of truth.
  height_cm numeric(5, 1),
  weight_kg numeric(5, 2),
  goal fitness_goal,
  experience_level experience_level,
  onboarding_completed_at timestamptz,
  referral_code text unique not null default substr(md5(gen_random_uuid()::text), 1, 8),
  referred_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Now that profiles exists, wire the FKs deferred from migration 0001.
alter table domain_events
  add constraint fk_domain_events_profile foreign key (profile_id) references profiles (id) on delete set null;
alter table ai_insights
  add constraint fk_ai_insights_profile foreign key (profile_id) references profiles (id) on delete cascade;

-- Auto-create a profile row whenever a new Supabase Auth user is created.
-- Reads `preferred_locale` from signup metadata so the language picker
-- screen (shown before sign-up per docs/11-internationalization.md) takes
-- effect immediately, not just after the first profile update.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, preferred_locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce((new.raw_user_meta_data ->> 'preferred_locale')::locale_code, 'en')
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table staff_profiles (
  profile_id uuid primary key references profiles (id) on delete cascade,
  role staff_role not null,
  bio text,
  specialties text[] not null default '{}',
  certifications jsonb not null default '[]',
  years_experience int,
  is_approved boolean not null default false,
  rating_avg numeric(3, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_staff_profiles_updated_at
  before update on staff_profiles
  for each row execute function set_updated_at();

create index idx_staff_profiles_role on staff_profiles (role);

create table staff_client_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_profiles (profile_id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  context assignment_context not null default 'training',
  status trainer_client_status not null default 'active',
  assigned_at timestamptz not null default now()
);

create unique index uq_staff_client_assignments_active
  on staff_client_assignments (staff_id, client_id, context)
  where status = 'active';

create index idx_staff_client_assignments_client on staff_client_assignments (client_id);
create index idx_staff_client_assignments_staff on staff_client_assignments (staff_id);

-- Reception's front-desk member-lookup function lives in
-- 20260801000003_billing.sql, since it reads `subscriptions` — see that
-- file's "Reception support" section for the rationale.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table staff_profiles enable row level security;
alter table staff_client_assignments enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);
create policy "admins manage all profiles" on profiles for all using (is_admin());
create policy "staff reads assigned clients' profiles" on profiles for select
  using (
    exists (
      select 1 from staff_client_assignments sca
      where sca.client_id = profiles.id
        and sca.staff_id = auth.uid()
        and sca.status = 'active'
    )
  );

create policy "anyone reads approved staff profiles" on staff_profiles for select
  using (is_approved = true or profile_id = auth.uid());
create policy "staff manages own staff profile" on staff_profiles for update
  using (profile_id = auth.uid());
create policy "admins manage staff profiles" on staff_profiles for all using (is_admin());

create policy "clients read own assignments" on staff_client_assignments for select
  using (client_id = auth.uid());
create policy "staff reads own assignment list" on staff_client_assignments for select
  using (staff_id = auth.uid());
create policy "admins manage staff_client_assignments" on staff_client_assignments for all using (is_admin());
