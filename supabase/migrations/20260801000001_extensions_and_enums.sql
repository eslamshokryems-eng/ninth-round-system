-- Phase 1 — extensions, shared enums, and shared trigger utilities.
-- See docs/04-database-schema.md for the full (all-phase) schema this implements incrementally.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy search on exercises.name

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_role as enum ('client', 'trainer', 'admin');

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
