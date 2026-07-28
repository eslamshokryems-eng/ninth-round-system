import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LocaleCode } from "@9thround/shared-kernel";
import { Email } from "../domain/email";
import { Password } from "../domain/password";
import type { AuthPort, AuthSession } from "../domain/auth-port";

export interface SignUpInput {
  email: string;
  password: string;
  preferredLocale: LocaleCode;
}

/**
 * Registration (docs/phase-1/05-screen-list.md). Only validates and
 * delegates — `profiles` row creation is handled entirely by the
 * `handle_new_user()` database trigger
 * (supabase/migrations/20260801000002_profiles_and_trainers.sql), so this
 * use case never touches ProfileRepository itself.
 */
export class SignUpUseCase implements UseCase<SignUpInput, AuthSession> {
  constructor(private readonly auth: AuthPort) {}

  async execute(input: SignUpInput): Promise<Result<AuthSession>> {
    const email = Email.create(input.email);
    if (email.isErr) return email;

    const password = Password.create(input.password);
    if (password.isErr) return password;

    return this.auth.signUpWithEmail({
      email: email.value.value,
      password: password.value.value,
      preferredLocale: input.preferredLocale,
    });
  }
}
