import { describe, expect, it } from "vitest";
import { dateOfBirthFromAge } from "../domain/body-metrics";
import { CompleteOnboardingUseCase } from "./complete-onboarding";
import { InMemoryProfileRepository, buildProfile } from "./test-helpers";

function validInput(overrides: Partial<Parameters<CompleteOnboardingUseCase["execute"]>[0]> = {}) {
  return {
    profileId: "profile-1",
    fullName: "Eslam Shokry",
    goal: "muscle_gain" as const,
    experienceLevel: "beginner" as const,
    gender: "male" as const,
    dateOfBirth: dateOfBirthFromAge(28),
    heightCm: 178,
    weightKg: 80,
    ...overrides,
  };
}

describe("CompleteOnboardingUseCase", () => {
  it("marks the profile onboarded and stores name, goal, experience, and body metrics", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile());
    const useCase = new CompleteOnboardingUseCase(repo);

    const result = await useCase.execute(validInput());

    expect(result.isOk).toBe(true);
    const updated = await repo.findById("profile-1");
    expect(updated.isOk && updated.value?.isOnboarded).toBe(true);
    expect(updated.isOk && updated.value?.fullName).toBe("Eslam Shokry");
    expect(updated.isOk && updated.value?.goal).toBe("muscle_gain");
    expect(updated.isOk && updated.value?.heightCm).toBe(178);
  });

  it("fails with PROFILE_NOT_FOUND for an unknown profile", async () => {
    const repo = new InMemoryProfileRepository();
    const useCase = new CompleteOnboardingUseCase(repo);

    const result = await useCase.execute(validInput({ profileId: "does-not-exist" }));

    expect(result.isErr && result.error.code).toBe("PROFILE_NOT_FOUND");
  });

  it("fails with a body-metrics validation error before touching the repository", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile());
    const useCase = new CompleteOnboardingUseCase(repo);

    const result = await useCase.execute(validInput({ heightCm: 20 }));

    expect(result.isErr && result.error.code).toBe("INVALID_HEIGHT");
    const unchanged = await repo.findById("profile-1");
    expect(unchanged.isOk && unchanged.value?.isOnboarded).toBe(false);
  });
});
