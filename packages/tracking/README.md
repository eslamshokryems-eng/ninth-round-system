# @9thround/tracking — Bounded Context

**Phase:** 1 (domain/application skeleton only — no implementation yet)

Clean Architecture layering within this package (see `docs/13-ddd-architecture.md`):

- `domain/` — entities, value objects, domain events. Zero framework/IO dependencies; imports only `@9thround/shared-kernel`.
- `application/` — use cases orchestrating `domain/` through repository **ports** (interfaces) defined in `domain/`. No Supabase/HTTP import here either — only the port interfaces.
- `infrastructure/` — concrete adapters implementing `domain/`'s ports (Supabase-backed repositories, external service clients). This is the only layer allowed to import `@9thround/supabase-client` or `@9thround/database-types`.

**Planned entities/value objects:** Habit, HabitLog, WaterLog, WeightLog, BodyCompositionLog, ProgressPhoto, StreakCount (value object, computed from HabitLog history)

**Planned use cases:** LogHabit, LogWater, LogWeight, LogBodyComposition, UploadProgressPhoto, ComputeStreak

**Planned ports (interfaces) implemented by `infrastructure/`:** TrackingRepository (one per log type), AIProgressAnalysisPort (Phase 3)

Dependency rule: `domain` ← `application` ← `infrastructure`; apps depend only on `application`'s public exports, never reach into `infrastructure` or `domain` directly. See `docs/phase-1/07-component-architecture.md` for how this meets the presentation layer.
