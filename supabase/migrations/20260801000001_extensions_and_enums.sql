-- Phase 1 — extensions, shared enums, shared trigger/helper functions.
-- Updated for the 6-role model, bilingual (en/ar) content, and RLS helper
-- functions — see docs/12-roles-and-permissions.md and docs/11-internationalization.md.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy search on exercises.name / food_items.name

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Six platform roles. `client` is the end user; `trainer`/`nutritionist`/
-- `reception` are staff-facing; `admin`/`super_admin` are operator roles.
-- The distinction between admin and super_admin (see docs/12-roles-and-permissions.md):
-- super_admin can manage other admin accounts, global/financial settings, and
-- feature flags; admin handles day-to-day content/support/ops.
create type user_role as enum ('client', 'trainer', 'nutritionist', 'reception', 'admin', 'super_admin');

-- Subset of user_role that gets a staff_profiles row (see migration 0002).
create type staff_role as enum ('trainer', 'nutritionist', 'reception');

-- What a staff_client_assignments row governs — lets one generic assignment
-- table serve both coaching and nutrition-coaching relationships.
create type assignment_context as enum ('training', 'nutrition');

create type locale_code as enum ('en', 'ar');

create type fitness_goal as enum (
  'weight_loss',
  'fat_burning',
  'athletic_performance',
  'general_fitness',
  'home_workout'
);

create type experience_level as enum ('beginner', 'intermediate', 'advanced');
create type trainer_client_status as enum ('active', 'paused', 'ended');

create type subscription_tier as enum ('free', 'plus', 'elite');
create type billing_interval as enum ('monthly', 'annual');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type payment_status as enum ('succeeded', 'failed', 'refunded');
create type coupon_discount_type as enum ('percent', 'fixed');

create type exercise_difficulty as enum ('beginner', 'intermediate', 'advanced');
create type video_status as enum ('none', 'processing', 'ready', 'failed');
create type workout_format as enum ('9_round', 'circuit', 'strength', 'hiit', 'steady_state');
create type user_program_status as enum ('active', 'completed', 'abandoned');

create type habit_frequency as enum ('daily', 'weekly');
create type body_comp_source as enum ('manual', 'inbody_scan');
create type photo_angle as enum ('front', 'side', 'back');

create type meal_name as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type notification_type as enum (
  'workout_reminder',
  'streak_milestone',
  'trainer_message',
  'payment_failed',
  'system'
);

-- ---------------------------------------------------------------------------
-- RLS helper functions — every policy in every migration reads role state
-- through these instead of inlining `auth.jwt() ->> 'role'` checks, so the
-- 6-role model only has to be reasoned about correctly in one place.
-- See docs/07-security-plan.md §7.2 and docs/12-roles-and-permissions.md.
-- ---------------------------------------------------------------------------

create or replace function auth_role()
returns text
language sql stable
as $$
  select auth.jwt() ->> 'role';
$$;

create or replace function is_admin()
returns boolean
language sql stable
as $$
  select auth_role() in ('admin', 'super_admin');
$$;

create or replace function is_super_admin()
returns boolean
language sql stable
as $$
  select auth_role() = 'super_admin';
$$;

create or replace function is_staff(roles text[])
returns boolean
language sql stable
as $$
  select auth_role() = any(roles) or is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep `updated_at` current on every UPDATE.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI-readiness: a single append-only event log every bounded context can
-- write to, so AI features (progress analysis, adaptive plans, motivation
-- messages — see docs/13-ddd-architecture.md and the `ai` package) always
-- have a consistent stream of "what happened" to reason over, instead of
-- each feature needing its own bespoke integration when AI support is added.
-- See docs/04-database-schema.md §4.7.
-- ---------------------------------------------------------------------------

create table domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,        -- e.g. 'workout.completed', 'habit.logged'
  aggregate_type text not null,    -- e.g. 'workout_log'
  aggregate_id uuid not null,
  profile_id uuid,                 -- FK added in migration 0002 once profiles exists
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index idx_domain_events_profile on domain_events (profile_id, occurred_at desc);
create index idx_domain_events_type on domain_events (event_type, occurred_at desc);

create or replace function emit_domain_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_profile_id uuid,
  p_payload jsonb default '{}'
)
returns void
language sql
as $$
  insert into domain_events (event_type, aggregate_type, aggregate_id, profile_id, payload)
  values (p_event_type, p_aggregate_type, p_aggregate_id, p_profile_id, p_payload);
$$;

alter table domain_events enable row level security;
create policy "admins read domain events" on domain_events for select using (is_admin());
-- No client-facing insert policy: rows are written only by trigger functions
-- (SECURITY DEFINER context) or Edge Functions using the service-role key.

-- ---------------------------------------------------------------------------
-- AI-readiness: a place for any AI-generated content to attach back to a
-- user without a bespoke table per feature (motivation messages, progress
-- analysis, adaptive-plan suggestions all land here). See the `ai` package
-- (packages/ai) for the port/adapter this table backs.
-- ---------------------------------------------------------------------------

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,        -- FK added in migration 0002 once profiles exists
  entity_type text not null,       -- e.g. 'workout_log', 'nutrition_plan', 'progress_trend'
  entity_id uuid,
  insight_type text not null,      -- e.g. 'motivation_message', 'plan_adjustment_suggestion'
  content text not null,
  model text,                      -- which model produced it — audit + cost tracking
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_ai_insights_profile on ai_insights (profile_id, created_at desc);

alter table ai_insights enable row level security;
create policy "read own insights" on ai_insights for select using (profile_id = auth.uid());
create policy "admins all" on ai_insights for all using (is_admin());
-- Inserts happen only via AI Edge Functions using the service-role key.
