import { describe, expect, it } from "vitest";
import { CompleteOnboardingUseCase } from "./complete-onboarding";
import { InMemoryProfileRepository, buildProfile } from "./test-helpers";

describe("CompleteOnboardingUseCase", () => {
  it("marks the profile onboarded and stores the chosen goal/experience", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile());
    const useCase = new CompleteOnboardingUseCase(repo);

    const result = await useCase.execute({
      profileId: "profile-1",
      goal: "fat_burning",
      experienceLevel: "beginner",
    });

    expect(result.isOk).toBe(true);
    const updated = await repo.findById("profile-1");
    expect(updated.isOk && updated.value?.isOnboarded).toBe(true);
    expect(updated.isOk && updated.value?.goal).toBe("fat_burning");
  });

  it("fails with PROFILE_NOT_FOUND for an unknown profile", async () => {
    const repo = new InMemoryProfileRepository();
    const useCase = new CompleteOnboardingUseCase(repo);

    const result = await useCase.execute({
      profileId: "does-not-exist",
      goal: "fat_burning",
      experienceLevel: "beginner",
    });

    expect(result.isErr && result.error.code).toBe("PROFILE_NOT_FOUND");
  });
});
