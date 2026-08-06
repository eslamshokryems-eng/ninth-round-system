import { describe, expect, it } from "vitest";
import { GetCurrentProfileUseCase } from "./get-current-profile";
import { InMemoryProfileRepository, buildProfile } from "./test-helpers";

describe("GetCurrentProfileUseCase", () => {
  it("returns a plain DTO reflecting the profile's current state", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "profile-1", role: "coach", preferredLocale: "ar" }));
    const useCase = new GetCurrentProfileUseCase(repo);

    const result = await useCase.execute({ profileId: "profile-1" });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toEqual({
      profileId: "profile-1",
      fullName: "Test User",
      role: "coach",
      preferredLocale: "ar",
      isOnboarded: false,
    });
  });

  it("fails with PROFILE_NOT_FOUND for an unknown profile", async () => {
    const repo = new InMemoryProfileRepository();
    const useCase = new GetCurrentProfileUseCase(repo);

    const result = await useCase.execute({ profileId: "ghost" });

    expect(result.isErr && result.error.code).toBe("PROFILE_NOT_FOUND");
  });
});
