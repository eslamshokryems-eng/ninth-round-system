# @9thround/training — Bounded Context

**Phase:** 1 — 9th Round Timer *architecture* prepared; everything else still a skeleton (see docs/phase-1/12-implementation-status.md)

Clean Architecture layering within this package (see `docs/13-ddd-architecture.md`):

- `domain/` — entities, value objects, domain events. Zero framework/IO dependencies; imports only `@9thround/shared-kernel`.
- `application/` — use cases orchestrating `domain/` through repository **ports** (interfaces) defined in `domain/`. No Supabase/HTTP import here either — only the port interfaces.
- `infrastructure/` — concrete adapters implementing `domain/`'s ports (Supabase-backed repositories, external service clients). This is the only layer allowed to import `@9thround/supabase-client` or `@9thround/database-types`.

## What's actually here

- `domain/round-plan.ts` — **implemented, tested.** A validated value object for a round-based workout's shape (rounds/work-seconds/rest-seconds), matching `workout_exercises` in `supabase/migrations/20260801000004_training_content.sql`. Not a timer — it has no notion of "running."
- `domain/timer-phase.ts` — **implemented (type only).** The discriminated union the future timer's state will take (`idle`/`work`/`rest`/`complete`), so the eventual Workout Player UI and a `TimerRing` design-system primitive have a stable contract to build against before either exists.

Both were added deliberately as prep for the 9th Round Timer, per the explicit instruction to prepare this context's architecture without implementing the timer itself — no countdown mechanics, no `TimerSession` aggregate, no use cases exist yet.

**Planned entities/value objects (not yet built):** Program, ProgramWeek, Workout, Exercise (aggregate root: Program; Workout/Exercise reference each other via a WorkoutExercise value object composed with `RoundPlan`), WorkoutLog, ExerciseSetLog, `TimerSession` (owns phase transitions, raises a `workout.round_completed` domain event per round).

**Planned use cases (not yet built):** EnrollInProgram, StartWorkoutSession, CompleteWorkoutSession (emits the `workout.completed` domain event that `trg_workout_logs_domain_event` — supabase/migrations/20260801000005_tracking_and_logs.sql — already has a reference trigger for), CreateExercise, PublishProgram.

**Planned ports (interfaces) implemented by `infrastructure/`:** ProgramRepository, ExerciseRepository, WorkoutLogRepository, AIWorkoutRecommendationPort (Phase 3 — implemented later by the `ai` package's Claude adapter).

Dependency rule: `domain` ← `application` ← `infrastructure`; apps depend only on `application`'s public exports, never reach into `infrastructure` or `domain` directly. See `docs/phase-1/07-component-architecture.md` for how this meets the presentation layer.
