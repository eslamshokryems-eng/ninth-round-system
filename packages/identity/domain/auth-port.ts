import type { Result } from "@9thround/shared-kernel";
import type { LocaleCode } from "@9thround/shared-kernel";

export interface AuthSession {
  profileId: string;
  emailVerified: boolean;
}

export interface SignUpWithEmailInput {
  email: string;
  password: string;
  preferredLocale: LocaleCode;
}

export interface SignInWithEmailInput {
  email: string;
  password: string;
}

/**
 * Port for Supabase Auth (email/password today; OAuth providers are the
 * same port, extended, when that screen is built — see
 * docs/phase-1/12-implementation-status.md). Implemented by
 * infrastructure/supabase-auth-port.ts; use cases only ever see this
 * interface, so they're testable with a fake and swappable if the auth
 * provider ever changes without touching application code.
 */
export interface AuthPort {
  signUpWithEmail(input: SignUpWithEmailInput): Promise<Result<AuthSession>>;
  signInWithEmail(input: SignInWithEmailInput): Promise<Result<AuthSession>>;
  signOut(): Promise<Result<void>>;
  requestPasswordReset(email: string, redirectTo: string): Promise<Result<void>>;
  /**
   * Resolves an Employee ID ("EMP-000001") to the email its account was
   * created with, via the `resolve_login_email` SQL function — callable
   * pre-auth, since the caller isn't signed in yet at login time. `null`
   * (not an error) for an unknown code, so callers can fold it into the
   * same generic "invalid credentials" message as a wrong password
   * (see docs/phase-1/16-employee-login.md).
   */
  resolveEmployeeCode(employeeCode: string): Promise<Result<string | null>>;
}
