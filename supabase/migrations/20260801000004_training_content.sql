-- Phase 1 — exercise library, programs, workouts, and per-user program enrollment.
--
-- Translatable text (name/description) is stored as jsonb keyed by locale
-- (`{"en": "...", "ar": "..."}`) rather than parallel `_en`/`_ar` columns, so
-- adding a third language later is a data migration, not a schema migration.
-- English is the required fallback — see docs/11-internationalization.md §11.3.

create domain translated_text as jsonb
  constraint translated_text_has_en check (value ? 'en');

create table exercise_categories (
  id uuid primary key default gen_random_uuid(),
  name translated_text not null,
  slug text not null unique,
  icon text
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references exercise_categories (id),
  name translated_text not null,
  description translated_text,
  equipment text[] not null default '{}',
  muscle_groups text[] not null default '{}',
  difficulty exercise_difficulty not null default 'beginner',
  video_id text,
  video_status video_status not null default 'none',
  thumbnail_url text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_exercises_updated_at
  before update on exercises
  for each row execute function set_updated_at();

-- pg_trgm search operates on the English fallback text; the mobile/web
-- search UI queries in the viewer's locale but falls back to English terms
-- matching too, per docs/11-internationalization.md §11.4.
create index idx_exercises_name_en_trgm on exercises using gin ((name ->> 'en') gin_trgm_ops);
create index idx_exercises_category on exercises (category_id);

create table programs (
  id uuid primary key default gen_random_uuid(),
  name translated_text not null,
  description translated_text,
  cover_image_url text,
  goal fitness_goal,
  duration_weeks int not null,
  difficulty exercise_difficulty not null default 'beginner',
  is_template boolean not null default true,
  is_published boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_programs_updated_at
  before update on programs
  for each row execute function set_updated_at();

create table program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  week_number int not null,
  unique (program_id, week_number)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  program_week_id uuid references program_weeks (id) on delete cascade,
  name translated_text not null,
  description translated_text,
  format workout_format not null default 'circuit',
  estimated_duration_minutes int,
  order_index int not null default 0
);

create index idx_workouts_program_week on workouts (program_week_id);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  order_index int not null default 0,
  rounds int,
  work_seconds int,
  rest_seconds int,
  sets int,
  reps int,
  target_weight numeric(6, 2),
  notes text
);

create index idx_workout_exercises_workout on workout_exercises (workout_id);
create index idx_workout_exercises_exercise on workout_exercises (exercise_id);

create table user_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  program_id uuid not null references programs (id),
  assigned_by uuid references profiles (id),
  started_at timestamptz not null default now(),
  status user_program_status not null default 'active',
  current_week int not null default 1
);

create index idx_user_programs_profile on user_programs (profile_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table exercise_categories enable row level security;
alter table exercises enable row level security;
alter table programs enable row level security;
alter table program_weeks enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table user_programs enable row level security;

create policy "anyone reads categories" on exercise_categories for select using (true);
create policy "admins manage categories" on exercise_categories for all using (is_admin());

create policy "anyone reads exercises" on exercises for select using (true);
create policy "trainers insert exercises" on exercises for insert
  with check (is_staff(array['trainer']));
create policy "creator or admin updates exercise" on exercises for update
  using (created_by = auth.uid() or is_admin());

create policy "anyone reads published programs" on programs for select
  using (is_published = true or created_by = auth.uid() or is_admin());
create policy "trainers insert programs" on programs for insert
  with check (is_staff(array['trainer']));
create policy "creator or admin updates program" on programs for update
  using (created_by = auth.uid() or is_admin());

create policy "read weeks of visible programs" on program_weeks for select
  using (
    exists (
      select 1 from programs p
      where p.id = program_weeks.program_id
        and (p.is_published or p.created_by = auth.uid() or is_admin())
    )
  );
create policy "trainers/admins manage weeks" on program_weeks for all
  using (is_staff(array['trainer']));

create policy "read workouts of visible programs" on workouts for select
  using (
    program_week_id is null
    or exists (
      select 1 from program_weeks pw
      join programs p on p.id = pw.program_id
      where pw.id = workouts.program_week_id
        and (p.is_published or p.created_by = auth.uid() or is_admin())
    )
  );
create policy "trainers/admins manage workouts" on workouts for all
  using (is_staff(array['trainer']));

create policy "read workout_exercises of visible workouts" on workout_exercises for select using (true);
create policy "trainers/admins manage workout_exercises" on workout_exercises for all
  using (is_staff(array['trainer']));

create policy "read own user_programs" on user_programs for select using (profile_id = auth.uid());
create policy "insert own user_programs" on user_programs for insert with check (profile_id = auth.uid());
create policy "update own user_programs" on user_programs for update using (profile_id = auth.uid());
create policy "staff reads assigned clients' user_programs" on user_programs for select
  using (
    exists (
      select 1 from staff_client_assignments sca
      where sca.client_id = user_programs.profile_id
        and sca.staff_id = auth.uid()
        and sca.status = 'active'
    )
  );
create policy "admins manage user_programs" on user_programs for all using (is_admin());
