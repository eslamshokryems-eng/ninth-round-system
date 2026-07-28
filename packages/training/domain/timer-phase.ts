/**
 * The shape the future 9th Round Timer's state will take — a discriminated
 * union, not a running clock. This is a type declaration only: no reducer,
 * no interval/countdown, no start/pause/resume behavior. It exists now so
 * that when the timer *is* built, the mobile Workout Player component
 * (docs/phase-1/07-component-architecture.md §7.3) can be designed against
 * a stable contract from day one, and so `packages/ui/native`'s `TimerRing`
 * primitive (not yet built either) has a known prop shape to target.
 *
 * Planned (not implemented) companion pieces, for when this context's
 * implementation turn comes — see docs/phase-1/12-implementation-status.md:
 * - `TimerSession` aggregate (domain) — owns transitions between phases,
 *   raises a `workout.round_completed` domain event per round.
 * - `StartWorkoutSessionUseCase` / `CompleteWorkoutSessionUseCase`
 *   (application) — the latter writes `workout_logs`/`exercise_set_logs`
 *   and is what the existing `trg_workout_logs_domain_event` trigger
 *   (supabase/migrations/20260801000005_tracking_and_logs.sql) reacts to.
 * - The actual countdown mechanics (mobile-only, presentation-layer: a
 *   `useWorkoutSessionStore` per docs/phase-1/08-state-management.md §8.2,
 *   driven by `setInterval`/Reanimated, translating real elapsed time into
 *   `TimerPhase` values).
 */
export type TimerPhase =
  | { kind: "idle" }
  | { kind: "work"; roundNumber: number; remainingSeconds: number }
  | { kind: "rest"; roundNumber: number; remainingSeconds: number }
  | { kind: "complete" };
