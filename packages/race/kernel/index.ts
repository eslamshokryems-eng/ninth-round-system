/**
 * THE NINTH's own copy of the tiny Result / UseCase kernel (a few dozen lines). It is vendored on purpose:
 * the race system must not depend on any package that belongs to another system.
 */

/** Expected failures are returned, never thrown: callers must handle both branches. */
export type Result<TValue, TError = DomainError> = Ok<TValue> | Err<TError>;

export interface Ok<TValue> {
  readonly isOk: true;
  readonly isErr: false;
  readonly value: TValue;
}

export interface Err<TError> {
  readonly isOk: false;
  readonly isErr: true;
  readonly error: TError;
}

export function ok<TValue>(value: TValue): Ok<TValue> {
  return { isOk: true, isErr: false, value };
}

export function err<TError>(error: TError): Err<TError> {
  return { isOk: false, isErr: true, error };
}

/** Every failure is one of these, never a raw string. */
export interface DomainError {
  readonly code: string;
  readonly message: string;
}

export function domainError(code: string, message: string): DomainError {
  return { code, message };
}

/** The application-layer contract every use case implements. */
export interface UseCase<TInput, TOutput, TError = DomainError> {
  execute(input: TInput): Promise<Result<TOutput, TError>>;
}
