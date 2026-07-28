import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ExperienceLevel, FitnessGoal } from "../domain/profile";
import type { ProfileRepository } from "../domain/profile-repository";

export interface CompleteOnboardingInput {
  profileId: string;
  goal: FitnessGoal;
  experienceLevel: ExperienceLevel;
}

export interface CompleteOnboardingOutput {
  profileId: string;
  onboardingCompletedAt: Date;
}

/**
 * Backs the last step of the onboarding flow
 * (docs/phase-1/06-navigation-flow.md §6.3). The mobile app calls this
 * through a thin presentation hook — see docs/phase-1/07-component-architecture.md —
 * never by writing to `profiles` directly, so "what counts as onboarded" has
 * exactly one implementation (Profile.completeOnboarding) no matter which
 * screen or app triggers it.
 */
export class CompleteOnboardingUseCase
  implements UseCase<CompleteOnboardingInput, CompleteOnboardingOutput>
{
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: CompleteOnboardingInput): Promise<Result<CompleteOnboardingOutput>> {
    const found = await this.profiles.findById(input.profileId);
    if (found.isErr) return found;
    if (!found.value) {
      return err(domainError("PROFILE_NOT_FOUND", `No profile with id ${input.profileId}`));
    }

    const profile = found.value;
    profile.completeOnboarding({ goal: input.goal, experienceLevel: input.experienceLevel });

    const saved = await this.profiles.save(profile);
    if (saved.isErr) return saved;

    return ok({
      profileId: profile.id,
      onboardingCompletedAt: profile.onboardingCompletedAt as Date,
    });
  }
}
