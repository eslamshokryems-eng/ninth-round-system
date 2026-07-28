import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const MIN_WORK_SECONDS = 5;
const MAX_WORK_SECONDS = 600;
const MIN_REST_SECONDS = 0;
const MAX_REST_SECONDS = 300;

export interface RoundPlanProps {
  rounds: number;
  workSeconds: number;
  restSeconds: number;
}

/**
 * Architecture prep for the future 9th Round Timer — this value object
 * captures and validates the shape a round-based workout is configured
 * with (`workout_exercises.rounds`/`work_seconds`/`rest_seconds`,
 * supabase/migrations/20260801000004_training_content.sql), which is all
 * that's needed to *describe* a round plan. It is deliberately **not** a
 * timer: it has no notion of "currently running," no countdown, no
 * start/pause/tick behavior. That's the `TimerSession` aggregate + a
 * `StartWorkoutSessionUseCase`/`CompleteWorkoutSessionUseCase` pair, which
 * are the next things built when the Training context's implementation
 * turn comes — see `../README.md` and docs/phase-1/12-implementation-status.md.
 */
export class RoundPlan {
  private constructor(private readonly props: RoundPlanProps) {}

  static create(input: RoundPlanProps): Result<RoundPlan> {
    if (!Number.isInteger(input.rounds) || input.rounds < MIN_ROUNDS || input.rounds > MAX_ROUNDS) {
      return err(
        domainError("INVALID_ROUNDS", `Rounds must be a whole number between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`),
      );
    }
    if (input.workSeconds < MIN_WORK_SECONDS || input.workSeconds > MAX_WORK_SECONDS) {
      return err(
        domainError(
          "INVALID_WORK_SECONDS",
          `Work interval must be between ${MIN_WORK_SECONDS}s and ${MAX_WORK_SECONDS}s.`,
        ),
      );
    }
    if (input.restSeconds < MIN_REST_SECONDS || input.restSeconds > MAX_REST_SECONDS) {
      return err(
        domainError(
          "INVALID_REST_SECONDS",
          `Rest interval must be between ${MIN_REST_SECONDS}s and ${MAX_REST_SECONDS}s.`,
        ),
      );
    }
    return ok(new RoundPlan({ ...input }));
  }

  get rounds(): number {
    return this.props.rounds;
  }

  get workSeconds(): number {
    return this.props.workSeconds;
  }

  get restSeconds(): number {
    return this.props.restSeconds;
  }

  /** The one piece of derived behavior worth having now — everything that displays "~32 min" needs it, long before a real timer exists. */
  get totalDurationSeconds(): number {
    return this.props.rounds * (this.props.workSeconds + this.props.restSeconds);
  }
}
