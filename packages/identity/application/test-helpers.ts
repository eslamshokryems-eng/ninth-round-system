import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import { Profile, type ProfileProps } from "../domain/profile";
import type { ProfileRepository } from "../domain/profile-repository";

export function buildProfile(overrides: Partial<ProfileProps> = {}): Profile {
  return Profile.fromPersistence({
    id: "profile-1",
    fullName: "Test User",
    avatarUrl: null,
    role: "client",
    preferredLocale: "en",
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
