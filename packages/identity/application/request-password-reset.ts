import type { Result, UseCase } from "@9thround/shared-kernel";
import { Email } from "../domain/email";
import type { AuthPort } from "../domain/auth-port";

export interface RequestPasswordResetInput {
  email: string;
  redirectTo: string;
}

/**
 * Forgot Password (docs/phase-1/05-screen-list.md). Always returns success
 * to the caller regardless of whether the email exists — the screen must
 * show the same "check your email" confirmation either way, so the
 * response can't be used to enumerate registered accounts. Supabase Auth's
 * `resetPasswordForEmail` already behaves this way; the use case exists so
 * the mobile screen never talks to Supabase directly.
 */
export class RequestPasswordResetUseCase implements UseCase<RequestPasswordResetInput, void> {
  constructor(private readonly auth: AuthPort) {}

  async execute(input: RequestPasswordResetInput): Promise<Result<void>> {
    const email = Email.create(input.email);
    if (email.isErr) return email;

    return this.auth.requestPasswordReset(email.value.value, input.redirectTo);
  }
}
