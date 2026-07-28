# 2. Database Schema (Phase 1)

Implemented as 7 real, ordered SQL migrations in `supabase/migrations/`. This is the subset of the full schema in [`docs/04-database-schema.md`](../04-database-schema.md) that Phase 1 features actually need; every table not listed here is deferred to the phase noted.

## 2.1 Migration Order

| File | Introduces |
|---|---|
| `20260801000001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`; every enum type; shared `set_updated_at()` trigger function |
| `20260801000002_profiles_and_trainers.sql` | `profiles`, `handle_new_user()` trigger, `trainer_profiles`, `trainer_clients` |
| `20260801000003_billing.sql` | `subscription_plans`, `subscriptions`, `payments`, `processed_stripe_events`, `coupons`, `coupon_redemptions` |
| `20260801000004_training_content.sql` | `exercise_categories`, `exercises`, `programs`, `program_weeks`, `workouts`, `workout_exercises`, `user_programs` |
| `20260801000005_tracking_and_logs.sql` | `workout_logs`, `exercise_set_logs`, `habits`, `habit_logs`, `water_logs`, `weight_logs`, `body_composition_logs`, `progress_photos` |
| `20260801000006_nutrition.sql` | `nutrition_plans`, `meals`, `food_items`, `meal_food_items` |
| `20260801000007_notifications_and_audit.sql` | `push_tokens`, `notifications`, `admin_audit_log` |

Migrations are additive and ordered so each file's foreign keys only ever point backward (e.g. `workout_logs.workout_id` in migration 5 references `workouts` from migration 4) — applying them in order never fails on a missing reference.

## 2.2 Deferred to Later Phases (tables that exist in the full schema, not created yet)

| Table(s) | Phase | Why deferred |
|---|---|---|
| `achievements`, `badges`, `user_achievements`, `challenges`, `challenge_participants` | 2 | Engagement layer, not core training loop |
| `community_posts`, `community_comments`, `community_likes` | 2 | Same |
| `chat_conversations`, `chat_messages` | 2 | Requires trainer accounts to be meaningful; ships with Trainer Dashboard depth |
| `venues`, `qr_checkins` | 2 | Requires at least one partner venue configured operationally first |
| `referrals` | 2 | Growth-loop feature, not core loop |
| `ai_coach_conversations`, `ai_coach_messages` | 3 | AI Coach phase |
| `support_tickets`, `support_ticket_messages` | 4 | Ships with Admin Dashboard depth |

## 2.3 Enum Reference

| Enum | Values |
|---|---|
| `user_role` | `client`, `trainer`, `admin` |
| `fitness_goal` | `weight_loss`, `fat_burning`, `athletic_performance`, `general_fitness`, `home_workout` |
| `experience_level` | `beginner`, `intermediate`, `advanced` |
| `trainer_client_status` | `active`, `paused`, `ended` |
| `subscription_tier` | `free`, `plus`, `elite` |
| `billing_interval` | `monthly`, `annual` |
| `subscription_status` | `trialing`, `active`, `past_due`, `canceled`, `incomplete` |
| `payment_status` | `succeeded`, `failed`, `refunded` |
| `coupon_discount_type` | `percent`, `fixed` |
| `exercise_difficulty` | `beginner`, `intermediate`, `advanced` |
| `video_status` | `none`, `processing`, `ready`, `failed` |
| `workout_format` | `9_round`, `circuit`, `strength`, `hiit`, `steady_state` |
| `user_program_status` | `active`, `completed`, `abandoned` |
| `habit_frequency` | `daily`, `weekly` |
| `body_comp_source` | `manual`, `inbody_scan` |
| `photo_angle` | `front`, `side`, `back` |
| `meal_name` | `breakfast`, `lunch`, `dinner`, `snack` |
| `notification_type` | `workout_reminder`, `streak_milestone`, `trainer_message`, `payment_failed`, `system` |

## 2.4 Automatic Behavior Built Into the Schema

- **`handle_new_user()`** — a trigger on `auth.users` that inserts the matching `profiles` row automatically on sign-up (pulling `full_name`/`avatar_url` from OAuth metadata when present). No client code ever inserts into `profiles` directly.
- **`set_updated_at()`** — attached to every table with an `updated_at` column; application code never sets it manually.
- **`processed_stripe_events`** — an idempotency ledger the `stripe-webhook` Edge Function checks before processing any event, since Stripe redelivers.

## 2.5 RLS Policy Shape (applied to every table)

Every table in every migration enables RLS in the same migration that creates it — there is no point where a Phase 1 table exists without policies. The recurring shape, detailed with rationale in [`docs/07-security-plan.md §7.2`](../07-security-plan.md#72-row-level-security-strategy):

1. **Own-row policy** — `profile_id = auth.uid()` (or via a join for child tables like `exercise_set_logs`).
2. **Trainer-read policy** — a `select`-only policy that checks the caller is an *active* entry in `trainer_clients` for that client, on every table trainers legitimately need to review (workout/weight/body-comp logs, progress photos, nutrition plans).
3. **Admin-all policy** — `(auth.jwt() ->> 'role') = 'admin'`, unconditional.
4. **Financial tables have no client write policy at all** — `subscriptions`/`payments` are read-only to the owning client; every write goes through an Edge Function using the service-role key (which bypasses RLS), after Stripe signature verification.

## 2.6 Regenerating Types

After any migration change:
```
pnpm db:types   # supabase gen types typescript --local > packages/types/src/supabase.ts
```
committed in the same PR as the migration, per [`docs/08-deployment-plan.md §8.5`](../08-deployment-plan.md#85-database-migrations).

Next: [ER Diagram →](03-er-diagram.md)
