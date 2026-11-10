import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { CreateChallengeUseCase, type CreateChallengeUseCaseInput } from "./create-challenge";
import { buildCreateChallengeInput, fakeChallengeRepository, FakeChallengeRepository } from "./test-helpers";

function buildInput(overrides: Partial<CreateChallengeUseCaseInput> = {}): CreateChallengeUseCaseInput {
  return {
    ...buildCreateChallengeInput(),
    weightRange: { min: 1, max: 10 },
    ...overrides,
  };
}

describe("CreateChallengeUseCase", () => {
  it("rejects a weight outside the caller-supplied range", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ weight: 11 }));

    expect(result.isErr && result.error.code).toBe("WEIGHT_OUT_OF_RANGE");
  });

  it("rejects a non-integer weight", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ weight: 2.5 }));

    expect(result.isErr && result.error.code).toBe("INVALID_WEIGHT");
  });

  it("rejects a GLOBAL challenge that also specifies a branchId", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ scope: "GLOBAL", branchId: "branch-1" }));

    expect(result.isErr && result.error.code).toBe("INVALID_SCOPE");
  });

  it("rejects a BRANCH challenge with no branchId", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ scope: "BRANCH", branchId: null }));

    expect(result.isErr && result.error.code).toBe("INVALID_SCOPE");
  });

  it("rejects a MULTI_BRANCH challenge with no branch list", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ scope: "MULTI_BRANCH", branchId: null, branchIds: [] }));

    expect(result.isErr && result.error.code).toBe("INVALID_SCOPE");
  });

  it("accepts a MULTI_BRANCH challenge with a branch list and no single branchId", async () => {
    const challenges = fakeChallengeRepository();
    const useCase = new CreateChallengeUseCase(challenges);

    const result = await useCase.execute(buildInput({ scope: "MULTI_BRANCH", branchId: null, branchIds: ["branch-1", "branch-2"] }));

    expect(result.isOk).toBe(true);
  });

  it("rejects an eligibility rule with an unsupported type", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ eligibilityRules: [{ ruleType: "has_tattoo" as never, value: {} }] }));

    expect(result.isErr && result.error.code).toBe("UNSUPPORTED_ELIGIBILITY_RULE");
  });

  it("rejects a membership-based eligibility rule type — no longer supported", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ eligibilityRules: [{ ruleType: "active_membership" as never, value: {} }] }));

    expect(result.isErr && result.error.code).toBe("UNSUPPORTED_ELIGIBILITY_RULE");
  });

  it("rejects a min_age eligibility rule with a non-integer age", async () => {
    const useCase = new CreateChallengeUseCase(fakeChallengeRepository());

    const result = await useCase.execute(buildInput({ eligibilityRules: [{ ruleType: "min_age", value: { age: -1 } }] }));

    expect(result.isErr && result.error.code).toBe("INVALID_ELIGIBILITY_RULE");
  });

  it("delegates a valid challenge (including eligibility rules) to the repository", async () => {
    const challenges = fakeChallengeRepository();
    const useCase = new CreateChallengeUseCase(challenges);
    const input = buildInput({ eligibilityRules: [{ ruleType: "min_age", value: { age: 18 } }] });

    const result = await useCase.execute(input);

    expect(result.isOk).toBe(true);
    expect(challenges.lastCreateInput?.eligibilityRules).toEqual([{ ruleType: "min_age", value: { age: 18 } }]);
  });

  // create_challenge()'s own role/branch/weight-range checks (the SQL
  // migration) are the real authorization gate — a fake repository cannot
  // exercise them. This test only covers that a database rejection
  // propagates as an error rather than being swallowed.
  it("propagates a rejection from the database as an error result", async () => {
    const challenges = new FakeChallengeRepository({
      create: err(domainError("CHALLENGE_CREATE_FAILED", "Only a branch manager or super admin can create a competition.")),
    });
    const useCase = new CreateChallengeUseCase(challenges);

    const result = await useCase.execute(buildInput());

    expect(result.isErr && result.error.code).toBe("CHALLENGE_CREATE_FAILED");
  });
});
