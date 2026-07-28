import type { Result, UseCase } from "@9thround/shared-kernel";
import { Email } from "../domain/email";
import type { AuthPort, AuthSession } from "../domain/auth-port";

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * Login (docs/phase-1/05-screen-list.md). Password isn't policy-validated
 * here — an existing account may predate the current policy; Supabase Auth
 * itself is the authority on whether the credentials are correct.
 */
export class SignInUseCase implements UseCase<SignInInput, AuthSession> {
  constructor(private readonly auth: AuthPort) {}

  async execute(input: SignInInput): Promise<Result<AuthSession>> {
    const email = Email.create(input.email);
    if (email.isErr) return email;

    return this.auth.signInWithEmail({ email: email.value.value, password: input.password });
  }
}
