import type { DomainError, Result } from "./result";

/**
 * The application-layer contract every use case implements, across every
 * bounded context. A presentation-layer hook (mobile/web) or an Edge
 * Function handler calls `.execute(input)` and never reaches past it into
 * `domain/` or `infrastructure/` — see docs/13-ddd-architecture.md and
 * docs/phase-1/07-component-architecture.md.
 */
export interface UseCase<TInput, TOutput, TError = DomainError> {
  execute(input: TInput): Promise<Result<TOutput, TError>>;
}
