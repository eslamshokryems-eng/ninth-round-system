import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import { Profile, type ProfileProps } from "../domain/profile";
import type { ProfileRepository } from "../domain/profile-repository";
import type {
  AuthPort,
  AuthSession,
  SignInWithEmailInput,
  SignUpWithEmailInput,
} from "../domain/auth-port";

export function buildProfile(overrides: Partial<ProfileProps> = {}): Profile {
  return Profile.fromPersistence({
    id: "profile-1",
    fullName: "Test User",
    avatarUrl: null,
    role: "client",
    preferredLocale: "en",
    gender: null,
    dateOfBirth: null,
    heightCm: null,
    weightKg: null,
    goal: null,
    experienceLevel: null,
    onboardingCompletedAt: null,
    referralCode: "abc123",
    ...overrides,
  });
}

/** Test double for ProfileRepository — no Supabase, no network, per docs/13-ddd-architecture.md. */
export class InMemoryProfileRepository implements ProfileRepository {
  private readonly byId = new Map<string, Profile>();

  seed(profile: Profile): void {
    this.byId.set(profile.id, profile);
  }

  async findById(id: string): Promise<Result<Profile | null>> {
    return ok(this.byId.get(id) ?? null);
  }

  async save(profile: Profile): Promise<Result<void>> {
    this.byId.set(profile.id, profile);
    return ok(undefined);
  }
}

/** Test double for AuthPort — records calls so tests can assert on them, per docs/13-ddd-architecture.md. */
export class FakeAuthPort implements AuthPort {
  public signUpCalls: SignUpWithEmailInput[] = [];
  public signInCalls: SignInWithEmailInput[] = [];
  public passwordResetCalls: { email: string; redirectTo: string }[] = [];
  public nextSession: AuthSession = { profileId: "profile-1", emailVerified: false };

  async signUpWithEmail(input: SignUpWithEmailInput): Promise<Result<AuthSession>> {
    this.signUpCalls.push(input);
    return ok(this.nextSession);
  }

  async signInWithEmail(input: SignInWithEmailInput): Promise<Result<AuthSession>> {
    this.signInCalls.push(input);
    return ok(this.nextSession);
  }

  async signOut(): Promise<Result<void>> {
    return ok(undefined);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<Result<void>> {
    this.passwordResetCalls.push({ email, redirectTo });
    return ok(undefined);
  }
}
