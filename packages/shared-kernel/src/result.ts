/**
 * A use case never throws for expected failure modes (validation failure,
 * "not found", "not entitled") — it returns a Result so the caller (an Edge
 * Function, a route handler, a mobile hook) is forced by the type system to
 * handle both branches. Thrown exceptions are reserved for truly
 * unexpected/programmer errors, matching the Clean Architecture boundary in
 * docs/13-ddd-architecture.md.
 */
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

export function map<TValue, TError, TMapped>(
  result: Result<TValue, TError>,
  fn: (value: TValue) => TMapped,
): Result<TMapped, TError> {
  return result.isOk ? ok(fn(result.value)) : result;
}

export function mapErr<TValue, TError, TMappedError>(
  result: Result<TValue, TError>,
  fn: (error: TError) => TMappedError,
): Result<TValue, TMappedError> {
  return result.isErr ? err(fn(result.error)) : result;
}

/** Every use case's failure branch is one of these, never a raw string. */
export interface DomainError {
  readonly code: string;
  readonly message: string;
}

export function domainError(code: string, message: string): DomainError {
  return { code, message };
}
