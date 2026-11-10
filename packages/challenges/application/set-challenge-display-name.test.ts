import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { SetChallengeDisplayNameUseCase } from "./set-challenge-display-name";
import { fakeChallengeDisplayNameRepository, FakeChallengeDisplayNameRepository } from "./test-helpers";

describe("SetChallengeDisplayNameUseCase", () => {
  it("rejects a name shorter than 2 characters", async () => {
    const useCase = new SetChallengeDisplayNameUseCase(fakeChallengeDisplayNameRepository());

    const result = await useCase.execute({ displayName: "A" });

    expect(result.isErr && result.error.code).toBe("INVALID_DISPLAY_NAME");
  });

  it("rejects a name longer than 30 characters", async () => {
    const useCase = new SetChallengeDisplayNameUseCase(fakeChallengeDisplayNameRepository());

    const result = await useCase.execute({ displayName: "A".repeat(31) });

    expect(result.isErr && result.error.code).toBe("INVALID_DISPLAY_NAME");
  });

  it("delegates a valid, trimmed name to the repository", async () => {
    const displayNames = fakeChallengeDisplayNameRepository();
    const useCase = new SetChallengeDisplayNameUseCase(displayNames);

    const result = await useCase.execute({ displayName: "  Iron Fist  " });

    expect(result.isOk).toBe(true);
    expect(displayNames.lastSetOwn).toBe("Iron Fist");
  });

  // set_challenge_display_name() always forces profile_id = auth.uid()
  // server-side — a fake repository cannot exercise that. This test only
  // covers that a database rejection propagates as an error rather than
  // being swallowed.
  it("propagates a rejection from the database as an error result", async () => {
    const displayNames = new FakeChallengeDisplayNameRepository({
      setOwn: err(domainError("CHALLENGE_DISPLAY_NAME_SET_FAILED", "network error")),
    });
    const useCase = new SetChallengeDisplayNameUseCase(displayNames);

    const result = await useCase.execute({ displayName: "Iron Fist" });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_DISPLAY_NAME_SET_FAILED");
  });
});
