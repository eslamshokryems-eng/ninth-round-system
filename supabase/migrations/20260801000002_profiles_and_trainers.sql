-- Phase 1 — identity: profiles (extends auth.users), trainer profiles, trainer/client assignment.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role user_role not null default 'client',
  gender text,
  date_of_birth date,
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

-- Auto-create a profile row whenever a new Supabase Auth user is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table trainer_profiles (
  profile_id uuid primary key references profiles (id) on delete cascade,
  bio text,
  specialties text[] not null default '{}',
  certifications jsonb not null default '[]',
  years_experience int,
  is_approved boolean not null default false,
  rating_avg numeric(3, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_trainer_profiles_updated_at
  before update on trainer_profiles
  for each row execute function set_updated_at();

create table trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles (profile_id) on delete cascade,
  client_id uuid not null references profiles (id) on delete cascade,
  status trainer_client_status not null default 'active',
  assigned_at timestamptz not null default now()
);

create unique index uq_trainer_clients_active
  on trainer_clients (trainer_id, client_id)
  where status = 'active';

create index idx_trainer_clients_client on trainer_clients (client_id);
create index idx_trainer_clients_trainer on trainer_clients (trainer_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table trainer_profiles enable row level security;
alter table trainer_clients enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);
create policy "admins manage all profiles" on profiles for all
  using ((auth.jwt() ->> 'role') = 'admin');
create policy "trainers read assigned clients' profiles" on profiles for select
  using (
    exists (
      select 1 from trainer_clients tc
      where tc.client_id = profiles.id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
    )
  );

create policy "anyone reads approved trainer profiles" on trainer_profiles for select
  using (is_approved = true or profile_id = auth.uid());
create policy "trainer manages own trainer profile" on trainer_profiles for update
  using (profile_id = auth.uid());
create policy "admins manage trainer profiles" on trainer_profiles for all
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "clients read own assignment" on trainer_clients for select
  using (client_id = auth.uid());
create policy "trainers read own client list" on trainer_clients for select
  using (trainer_id = auth.uid());
create policy "admins manage trainer_clients" on trainer_clients for all
  using ((auth.jwt() ->> 'role') = 'admin');
