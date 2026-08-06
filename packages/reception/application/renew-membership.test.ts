import { describe, expect, it } from "vitest";
import { RenewMembershipUseCase } from "./renew-membership";
import { buildRenewMembershipInput, fakeRenewalRepository, FakeRenewalRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("RenewMembershipUseCase", () => {
  it("renews and returns the new membership period", async () => {
    const repo = fakeRenewalRepository({ membershipNumber: "9R-000099", endDate: "2026-12-01" });
    const useCase = new RenewMembershipUseCase(repo);

    const result = await useCase.execute(buildRenewMembershipInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.membershipNumber).toBe("9R-000099");
    expect(result.isOk && result.value.endDate).toBe("2026-12-01");
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = fakeRenewalRepository();
    const useCase = new RenewMembershipUseCase(repo);
    const input = buildRenewMembershipInput({ memberId: "member-42" });

    await useCase.execute(input);

    expect(repo.lastInput?.memberId).toBe("member-42");
  });

  it("rejects an empty receipt number before hitting the repository", async () => {
    const repo = fakeRenewalRepository();
    const useCase = new RenewMembershipUseCase(repo);

    const result = await useCase.execute(buildRenewMembershipInput({ receiptNumber: "  " }));

    expect(result.isErr && result.error.code).toBe("RECEIPT_NUMBER_REQUIRED");
    expect(repo.lastInput).toBeNull();
  });

  it("rejects a negative price", async () => {
    const useCase = new RenewMembershipUseCase(fakeRenewalRepository());
    const result = await useCase.execute(buildRenewMembershipInput({ price: -1 }));
    expect(result.isErr && result.error.code).toBe("INVALID_PRICE");
  });

  it("rejects a discount greater than the price", async () => {
    const useCase = new RenewMembershipUseCase(fakeRenewalRepository());
    const result = await useCase.execute(buildRenewMembershipInput({ price: 100, discount: 150 }));
    expect(result.isErr && result.error.code).toBe("INVALID_DISCOUNT");
  });

  it("propagates a repository failure (e.g. duplicate receipt number) without transforming it", async () => {
    const repo = new FakeRenewalRepository(err(domainError("RECEIPT_NUMBER_TAKEN", "taken")));
    const useCase = new RenewMembershipUseCase(repo);

    const result = await useCase.execute(buildRenewMembershipInput());

    expect(result.isErr && result.error.code).toBe("RECEIPT_NUMBER_TAKEN");
  });
});
