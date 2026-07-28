import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Gender } from "../domain/body-metrics";
import { BodyMetrics } from "../domain/body-metrics";
import type { ExperienceLevel, FitnessGoal } from "../domain/profile";
import type { ProfileRepository } from "../domain/profile-repository";

export interface CompleteOnboardingInput {
  profileId: string;
  fullName: string;
  goal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  gender: Gender;
  dateOfBirth: Date;
  heightCm: number;
  weightKg: number;
}

export interface CompleteOnboardingOutput {
  profileId: string;
  onboardingCompletedAt: Date;
}

/**
 * Backs the entire onboarding flow (docs/phase-1/06-navigation-flow.md §6.3):
 * profile setup (name), fitness goal, training experience, and body
 * metrics all land in one atomic call once the user reaches the end of the
 * flow — the mobile app accumulates the answers screen-by-screen in
 * `useOnboardingStore` (docs/phase-1/08-state-management.md) and only calls
 * this use case once, on the final step.
 */
export class CompleteOnboardingUseCase
  implements UseCase<CompleteOnboardingInput, CompleteOnboardingOutput>
{
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: CompleteOnboardingInput): Promise<Result<CompleteOnboardingOutput>> {
    const metricsResult = BodyMetrics.create({
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
    });
    if (metricsResult.isErr) return metricsResult;

    const found = await this.profiles.findById(input.profileId);
    if (found.isErr) return found;
    if (!found.value) {
      return err(domainError("PROFILE_NOT_FOUND", `No profile with id ${input.profileId}`));
    }

    const profile = found.value;
    profile.setFullName(input.fullName);
    profile.completeOnboarding({
      goal: input.goal,
      experienceLevel: input.experienceLevel,
      bodyMetrics: metricsResult.value,
    });

    const saved = await this.profiles.save(profile);
    if (saved.isErr) return saved;

    return ok({
      profileId: profile.id,
      onboardingCompletedAt: profile.onboardingCompletedAt as Date,
    });
  }
}
