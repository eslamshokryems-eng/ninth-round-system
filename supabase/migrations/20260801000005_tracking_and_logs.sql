-- Phase 1 — workout logging and daily-tracking tables (habits, water, weight,
-- body composition, progress photos). See docs/10-scalability-plan.md §10.2
-- for the partitioning plan once these tables grow large.

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  workout_id uuid references workouts (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds int,
  calories_estimate int,
  notes text
);

create index idx_workout_logs_profile_started on workout_logs (profile_id, started_at desc);

-- Reference implementation of the AI-readiness event pattern (see migration
-- 0001 §"domain_events"): completing a workout is exactly the kind of signal
-- future AI progress-analysis/adaptive-plan features need to consume. New
-- tables adopt the same shape (trigger calling emit_domain_event on the
-- transition that matters) as their feature is implemented.
create or replace function trg_workout_logs_emit_event()
returns trigger
language plpgsql
as $$
begin
  if new.completed_at is not null and (tg_op = 'INSERT' or old.completed_at is null) then
    perform emit_domain_event(
      'workout.completed',
      'workout_log',
      new.id,
      new.profile_id,
      jsonb_build_object('workout_id', new.workout_id, 'duration_seconds', new.duration_seconds)
    );
  end if;
  return new;
end;
$$;

create trigger trg_workout_logs_domain_event
  after insert or update on workout_logs
  for each row execute function trg_workout_logs_emit_event();

create table exercise_set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references workout_logs (id) on delete cascade,
  workout_exercise_id uuid references workout_exercises (id),
  set_number int not null,
  reps_completed int,
  weight_used numeric(6, 2),
  round_number int,
  rpe numeric(3, 1)
);

create index idx_exercise_set_logs_workout_log on exercise_set_logs (workout_log_id);

create table habits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  target_frequency habit_frequency not null default 'daily',
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_habits_profile on habits (profile_id);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits (id) on delete cascade,
  logged_date date not null,
  completed boolean not null default true,
  unique (habit_id, logged_date)
);

create table water_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  amount_ml int not null
);

create index idx_water_logs_profile on water_logs (profile_id, logged_at desc);

create table weight_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  weight_kg numeric(5, 2) not null
);

create index idx_weight_logs_profile on weight_logs (profile_id, logged_at desc);

create table body_composition_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  body_fat_percent numeric(4, 1),
  muscle_mass_kg numeric(5, 2),
  source body_comp_source not null default 'manual',
  inbody_raw jsonb
);

create index idx_body_comp_logs_profile on body_composition_logs (profile_id, logged_at desc);

create table progress_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  taken_at timestamptz not null default now(),
  photo_url text not null,
  angle photo_angle not null default 'front'
);

create index idx_progress_photos_profile on progress_photos (profile_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- RLS — every tracking table follows the same "own rows + assigned staff
-- reads + admin all" shape; see docs/07-security-plan.md §7.2 for the pattern.
-- Staff reads route through `staff_client_assignments` regardless of
-- context (training/nutrition) — a table like weight_logs is relevant to
-- both a trainer and a nutritionist coaching the same client.
-- ---------------------------------------------------------------------------

alter table workout_logs enable row level security;
alter table exercise_set_logs enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table water_logs enable row level security;
alter table weight_logs enable row level security;
alter table body_composition_logs enable row level security;
alter table progress_photos enable row level security;

create policy "own rows" on workout_logs for all using (profile_id = auth.uid());
create policy "staff reads assigned clients" on workout_logs for select
  using (exists (
    select 1 from staff_client_assignments sca
    where sca.client_id = workout_logs.profile_id and sca.staff_id = auth.uid() and sca.status = 'active'
  ));
create policy "admins all" on workout_logs for all using (is_admin());

create policy "own rows" on exercise_set_logs for all
  using (exists (select 1 from workout_logs wl where wl.id = exercise_set_logs.workout_log_id and wl.profile_id = auth.uid()));
create policy "admins all" on exercise_set_logs for all using (is_admin());

create policy "own rows" on habits for all using (profile_id = auth.uid());
create policy "admins all" on habits for all using (is_admin());

create policy "own rows" on habit_logs for all
  using (exists (select 1 from habits h where h.id = habit_logs.habit_id and h.profile_id = auth.uid()));
create policy "admins all" on habit_logs for all using (is_admin());

create policy "own rows" on water_logs for all using (profile_id = auth.uid());
create policy "admins all" on water_logs for all using (is_admin());

create policy "own rows" on weight_logs for all using (profile_id = auth.uid());
create policy "staff reads assigned clients" on weight_logs for select
  using (exists (
    select 1 from staff_client_assignments sca
    where sca.client_id = weight_logs.profile_id and sca.staff_id = auth.uid() and sca.status = 'active'
  ));
create policy "admins all" on weight_logs for all using (is_admin());

create policy "own rows" on body_composition_logs for all using (profile_id = auth.uid());
create policy "staff reads assigned clients" on body_composition_logs for select
  using (exists (
    select 1 from staff_client_assignments sca
    where sca.client_id = body_composition_logs.profile_id and sca.staff_id = auth.uid() and sca.status = 'active'
  ));
create policy "admins all" on body_composition_logs for all using (is_admin());

create policy "own rows" on progress_photos for all using (profile_id = auth.uid());
create policy "staff reads assigned clients" on progress_photos for select
  using (exists (
    select 1 from staff_client_assignments sca
    where sca.client_id = progress_photos.profile_id and sca.staff_id = auth.uid() and sca.status = 'active'
  ));
create policy "admins all" on progress_photos for all using (is_admin());
