# 2. Database Schema (Phase 1)

Implemented as 7 real, ordered SQL migrations in `supabase/migrations/`. This is the subset of the full schema in [`docs/04-database-schema.md`](../04-database-schema.md) that Phase 1 features actually need; every table not listed here is deferred to the phase noted.

## 2.1 Migration Order

| File | Introduces |
|---|---|
| `20260801000001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`; every enum type; shared `set_updated_at()` trigger function |
| `20260801000002_profiles_and_trainers.sql` | `profiles` (now with `preferred_locale`), `handle_new_user()` trigger, unified `staff_profiles`/`staff_client_assignments` (replaces `trainer_profiles`/`trainer_clients` — see [Roles & Permissions §12.2](../12-roles-and-permissions.md#122-why-one-shared-staff-model-instead-of-three-parallel-ones)) |
| `20260801000003_billing.sql` | `subscription_plans`, `subscriptions`, `payments`, `processed_stripe_events`, `coupons`, `coupon_redemptions`, `reception_member_lookup()` RPC |
| `20260801000004_training_content.sql` | `exercise_categories`, `exercises`, `programs`, `program_weeks`, `workouts`, `workout_exercises`, `user_programs` — `name`/`description` columns are `translated_text` (bilingual jsonb) |
| `20260801000005_tracking_and_logs.sql` | `workout_logs` (+ `workout.completed` domain-event trigger), `exercise_set_logs`, `habits`, `habit_logs`, `water_logs`, `weight_logs`, `body_composition_logs`, `progress_photos` |
| `20260801000006_nutrition.sql` | `nutrition_plans`, `meals`, `food_items` (translated_text), `meal_food_items` — owned by `nutritionist` role, not `trainer` |
| `20260801000007_notifications_and_audit.sql` | `push_tokens`, `notifications`, `admin_audit_log` |

Migration `20260801000001_extensions_and_enums.sql` was also expanded beyond enums: it now includes the `is_admin()`/`is_super_admin()`/`is_staff()` RLS helper functions, and the two AI-readiness tables (`domain_events`, `ai_insights`) — see §2.3a and §2.4 below.

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
| `user_role` | `client`, `trainer`, `nutritionist`, `reception`, `admin`, `super_admin` |
| `staff_role` | `trainer`, `nutritionist`, `reception` (subset of `user_role` that gets a `staff_profiles` row) |
| `assignment_context` | `training`, `nutrition` |
| `locale_code` | `en`, `ar` |
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

## 2.3a Bilingual Content

`exercises`, `programs`, `workouts`, `exercise_categories`, and `food_items`' `name`/`description` columns use the `translated_text` domain (`jsonb`, English required) instead of plain `text` — see [Internationalization §11.3](../11-internationalization.md#113-translatable-content-database-strategy). `translate(text, locale)` in `packages/shared-kernel` is the one function every context reads these through.

## 2.4 Automatic Behavior Built Into the Schema

- **`handle_new_user()`** — a trigger on `auth.users` that inserts the matching `profiles` row automatically on sign-up, including `preferred_locale` from signup metadata (pulling `full_name`/`avatar_url`/locale from OAuth or the language-picker screen). No client code ever inserts into `profiles` directly.
- **`set_updated_at()`** — attached to every table with an `updated_at` column; application code never sets it manually.
- **`processed_stripe_events`** — an idempotency ledger the `stripe-webhook` Edge Function checks before processing any event, since Stripe redelivers.
- **`emit_domain_event()` / `domain_events`** — the AI-readiness event log (see [`docs/04-database-schema.md §4.7`](../04-database-schema.md#47-ai-readiness-tables)); `workout_logs` already wires a reference trigger (`trg_workout_logs_domain_event`) firing `workout.completed`, and `subscriptions` fires `subscription.status_changed` — the pattern every future table adopts as its feature is implemented.
- **`reception_member_lookup()`** — the `SECURITY DEFINER` RPC backing reception's narrow front-desk lookup (see [Roles & Permissions §12.5](../12-roles-and-permissions.md#125-receptions-narrow-surface-by-design)).

## 2.5 RLS Policy Shape (applied to every table)

Every table in every migration enables RLS in the same migration that creates it — there is no point where a Phase 1 table exists without policies. The recurring shape, detailed with rationale in [`docs/07-security-plan.md §7.2`](../07-security-plan.md#72-row-level-security-strategy):

1. **Own-row policy** — `profile_id = auth.uid()` (or via a join for child tables like `exercise_set_logs`).
2. **Staff-read policy** — a `select`-only policy that checks the caller is an *active* entry in `staff_client_assignments` for that client (any staff role, since e.g. weight logs are relevant to both a trainer and a nutritionist coaching the same client), on every table staff legitimately need to review.
3. **Admin-all policy** — `is_admin()` (true for both `admin` and `super_admin`), unconditional.
4. **Financial tables have no client write policy at all** — `subscriptions`/`payments` are read-only to the owning client (plus a narrow reception read of active subscriptions); every write goes through an Edge Function using the service-role key (which bypasses RLS), after Stripe signature verification.
5. **Privilege-escalation actions are not an RLS concern** — granting `admin`/`super_admin` and issuing refunds are gated to `super_admin` at the application layer (`Role.canAssignRole` in `packages/identity`), not by a database policy, since both admin tiers need equal row visibility. See [Roles & Permissions §12.3](../12-roles-and-permissions.md#123-admin-vs-super-admin--the-actual-distinction).

## 2.6 Regenerating Types

After any migration change:
```
pnpm db:types   # supabase gen types typescript --local > packages/database-types/src/index.ts
```
committed in the same PR as the migration, per [`docs/08-deployment-plan.md §8.5`](../08-deployment-plan.md#85-database-migrations). Until a real Supabase project exists, `packages/database-types/src/index.ts` is a hand-authored placeholder covering the tables the `identity` context's infrastructure layer actually queries.

Next: [ER Diagram →](03-er-diagram.md)
