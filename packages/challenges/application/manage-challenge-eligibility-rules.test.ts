import { describe, expect, it } from "vitest";
import { AddChallengeEligibilityRuleUseCase, RemoveChallengeEligibilityRuleUseCase } from "./manage-challenge-eligibility-rules";
import { fakeChallengeRepository } from "./test-helpers";

describe("AddChallengeEligibilityRuleUseCase", () => {
  it("passes a valid rule through", async () => {
    const repo = fakeChallengeRepository();
    const r = await new AddChallengeEligibilityRuleUseCase(repo).execute({ challengeId: "c", ruleType: "min_age", age: 16, otherAge: null });
    expect(r.isOk).toBe(true);
    expect(repo.lastAddRule).toEqual({ challengeId: "c", ruleType: "min_age", age: 16 });
  });

  it.each([
    ["min_age", -1, null],
    ["min_age", 1.5, null],
    ["min_age", 121, null],
    ["max_age", 10, 12],
    ["min_age", 40, 39],
  ] as const)("refuses %s %s (other %s) without calling the repository", async (ruleType, age, otherAge) => {
    const repo = fakeChallengeRepository();
    const r = await new AddChallengeEligibilityRuleUseCase(repo).execute({ challengeId: "c", ruleType, age, otherAge });
    expect(r.isErr).toBe(true);
    expect(repo.lastAddRule).toBeNull();
  });

  it("refuses an unsupported rule type", async () => {
    const repo = fakeChallengeRepository();
    const r = await new AddChallengeEligibilityRuleUseCase(repo).execute({ challengeId: "c", ruleType: "weight" as never, age: 5, otherAge: null });
    expect(r.isErr).toBe(true);
  });
});

describe("RemoveChallengeEligibilityRuleUseCase", () => {
  it("delegates to the repository", async () => {
    const repo = fakeChallengeRepository();
    await new RemoveChallengeEligibilityRuleUseCase(repo).execute("rule-9");
    expect(repo.lastRemoveRule).toBe("rule-9");
  });
});
