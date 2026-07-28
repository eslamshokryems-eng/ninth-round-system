# @9thround/training — Bounded Context

**Phase:** 1 (domain/application skeleton only — no implementation yet)

Clean Architecture layering within this package (see `docs/13-ddd-architecture.md`):

- `domain/` — entities, value objects, domain events. Zero framework/IO dependencies; imports only `@9thround/shared-kernel`.
- `application/` — use cases orchestrating `domain/` through repository **ports** (interfaces) defined in `domain/`. No Supabase/HTTP import here either — only the port interfaces.
- `infrastructure/` — concrete adapters implementing `domain/`'s ports (Supabase-backed repositories, external service clients). This is the only layer allowed to import `@9thround/supabase-client` or `@9thround/database-types`.

**Planned entities/value objects:** Program, ProgramWeek, Workout, Exercise (aggregate root: Program; Workout/Exercise reference each other via WorkoutExercise value object), WorkoutLog, ExerciseSetLog, RoundPlan (value object: rounds/work-seconds/rest-seconds for the 9-Round format)

**Planned use cases:** EnrollInProgram, StartWorkoutSession, CompleteWorkoutSession (emits workout.completed domain event), CreateExercise, PublishProgram

**Planned ports (interfaces) implemented by `infrastructure/`:** ProgramRepository, ExerciseRepository, WorkoutLogRepository, AIWorkoutRecommendationPort (Phase 3 — implemented later by the `ai` package's Claude adapter)

Dependency rule: `domain` ← `application` ← `infrastructure`; apps depend only on `application`'s public exports, never reach into `infrastructure` or `domain` directly. See `docs/phase-1/07-component-architecture.md` for how this meets the presentation layer.
