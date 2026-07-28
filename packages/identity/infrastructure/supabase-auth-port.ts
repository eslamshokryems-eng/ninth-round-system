import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type {
  AuthPort,
  AuthSession,
  SignInWithEmailInput,
  SignUpWithEmailInput,
} from "../domain/auth-port";

/**
 * The Supabase Auth-backed implementation of AuthPort. `preferred_locale` is
 * passed as signup metadata so `handle_new_user()`
 * (supabase/migrations/20260801000002_profiles_and_trainers.sql) sets it on
 * the `profiles` row the instant it's created — see
 * docs/11-internationalization.md §11.6.
 */
export class SupabaseAuthPort implements AuthPort {
  constructor(private readonly client: TypedSupabaseClient) {}

  async signUpWithEmail(input: SignUpWithEmailInput): Promise<Result<AuthSession>> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { preferred_locale: input.preferredLocale } },
    });

    if (error) return err(domainError("SIGN_UP_FAILED", error.message));
    if (!data.user) return err(domainError("SIGN_UP_FAILED", "No user returned from sign-up."));

    return ok({ profileId: data.user.id, emailVerified: data.user.email_confirmed_at != null });
  }

  async signInWithEmail(input: SignInWithEmailInput): Promise<Result<AuthSession>> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) return err(domainError("SIGN_IN_FAILED", error.message));
    if (!data.user) return err(domainError("SIGN_IN_FAILED", "No user returned from sign-in."));

    return ok({ profileId: data.user.id, emailVerified: data.user.email_confirmed_at != null });
  }

  async signOut(): Promise<Result<void>> {
    const { error } = await this.client.auth.signOut();
    if (error) return err(domainError("SIGN_OUT_FAILED", error.message));
    return ok(undefined);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<Result<void>> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return err(domainError("PASSWORD_RESET_FAILED", error.message));
    return ok(undefined);
  }
}
