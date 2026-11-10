import { describe, expect, it } from "vitest";
import { SetChallengeStatusUseCase } from "./set-challenge-status";
import { fakeChallengeRepository } from "./test-helpers";

describe("SetChallengeStatusUseCase", () => {
  it("passes a legal one-step move through to the repository", async () => {
    const repo = fakeChallengeRepository();
    const result = await new SetChallengeStatusUseCase(repo).execute({
      challengeId: "c1", currentStatus: "draft", nextStatus: "published", reason: "  Announcing  ",
    });
    expect(result.isOk).toBe(true);
    expect(repo.lastSetStatus).toEqual({ challengeId: "c1", status: "published", reason: "Announcing" });
  });

  it("turns a blank reason into null rather than sending whitespace", async () => {
    const repo = fakeChallengeRepository();
    await new SetChallengeStatusUseCase(repo).execute({
      challengeId: "c1", currentStatus: "active", nextStatus: "completed", reason: "   ",
    });
    expect(repo.lastSetStatus?.reason).toBeNull();
  });

  it.each([
    ["draft", "active"],
    ["draft", "registration_open"],
    ["published", "active"],
    ["completed", "active"],
    ["completed", "registration_open"],
    ["archived", "draft"],
    ["active", "active"],
  ] as const)("refuses %s -> %s without calling the repository", async (from, to) => {
    const repo = fakeChallengeRepository();
    const result = await new SetChallengeStatusUseCase(repo).execute({
      challengeId: "c1", currentStatus: from, nextStatus: to, reason: null,
    });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("CHALLENGE_STATUS_TRANSITION_INVALID");
    expect(repo.lastSetStatus).toBeNull();
  });
});
