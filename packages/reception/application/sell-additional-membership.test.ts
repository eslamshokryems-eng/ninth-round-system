import { describe, expect, it } from "vitest";
import { SellAdditionalMembershipUseCase } from "./sell-additional-membership";
import {
  buildSellAdditionalMembershipInput,
  fakeAdditionalMembershipRepository,
  FakeAdditionalMembershipRepository,
} from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("SellAdditionalMembershipUseCase", () => {
  it("sells and returns the new membership period", async () => {
    const repo = fakeAdditionalMembershipRepository({ membershipNumber: "9R-000099", endDate: "2026-12-01" });
    const useCase = new SellAdditionalMembershipUseCase(repo);

    const result = await useCase.execute(buildSellAdditionalMembershipInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.membershipNumber).toBe("9R-000099");
    expect(result.isOk && result.value.endDate).toBe("2026-12-01");
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = fakeAdditionalMembershipRepository();
    const useCase = new SellAdditionalMembershipUseCase(repo);
    const input = buildSellAdditionalMembershipInput({ memberId: "member-42" });

    await useCase.execute(input);

    expect(repo.lastInput?.memberId).toBe("member-42");
  });

  it("rejects an empty receipt number before hitting the repository", async () => {
    const repo = fakeAdditionalMembershipRepository();
    const useCase = new SellAdditionalMembershipUseCase(repo);

    const result = await useCase.execute(buildSellAdditionalMembershipInput({ receiptNumber: "  " }));

    expect(result.isErr && result.error.code).toBe("RECEIPT_NUMBER_REQUIRED");
    expect(repo.lastInput).toBeNull();
  });

  it("rejects a negative price", async () => {
    const useCase = new SellAdditionalMembershipUseCase(fakeAdditionalMembershipRepository());
    const result = await useCase.execute(buildSellAdditionalMembershipInput({ price: -1 }));
    expect(result.isErr && result.error.code).toBe("INVALID_PRICE");
  });

  it("rejects a discount greater than the price", async () => {
    const useCase = new SellAdditionalMembershipUseCase(fakeAdditionalMembershipRepository());
    const result = await useCase.execute(buildSellAdditionalMembershipInput({ price: 100, discount: 150 }));
    expect(result.isErr && result.error.code).toBe("INVALID_DISCOUNT");
  });

  it("propagates a repository failure (e.g. an existing active membership of this type) without transforming it", async () => {
    const repo = new FakeAdditionalMembershipRepository(err(domainError("ACTIVE_MEMBERSHIP_OF_TYPE_EXISTS", "exists")));
    const useCase = new SellAdditionalMembershipUseCase(repo);

    const result = await useCase.execute(buildSellAdditionalMembershipInput());

    expect(result.isErr && result.error.code).toBe("ACTIVE_MEMBERSHIP_OF_TYPE_EXISTS");
  });
});
