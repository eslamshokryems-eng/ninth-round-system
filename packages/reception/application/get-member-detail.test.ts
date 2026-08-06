import { describe, expect, it } from "vitest";
import { GetMemberDetailUseCase } from "./get-member-detail";
import { fakeMemberDetailRepository, FakeMemberDetailRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("GetMemberDetailUseCase", () => {
  it("returns the member's full detail including membership history", async () => {
    const repo = fakeMemberDetailRepository({
      fullName: "Sara Ali",
      membershipHistory: [
        {
          membershipId: "membership-1",
          membershipNumber: "9R-000001",
          membershipTypeName: "One Month",
          startDate: "2026-07-06",
          endDate: "2026-08-05",
          price: 500,
          discount: 0,
          finalPrice: 500,
          paymentMethod: "cash",
          status: "expired",
        },
      ],
    });
    const useCase = new GetMemberDetailUseCase(repo);

    const result = await useCase.execute("member-1");

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.fullName).toBe("Sara Ali");
    expect(result.isOk && result.value.membershipHistory).toHaveLength(1);
  });

  it("propagates a repository failure (e.g. not found) without transforming it", async () => {
    const repo = new FakeMemberDetailRepository(err(domainError("MEMBER_NOT_FOUND", "not found")));
    const useCase = new GetMemberDetailUseCase(repo);

    const result = await useCase.execute("missing");

    expect(result.isErr && result.error.code).toBe("MEMBER_NOT_FOUND");
  });

  it("passes the member id through unchanged", async () => {
    const repo = fakeMemberDetailRepository();
    const useCase = new GetMemberDetailUseCase(repo);

    await useCase.execute("member-42");

    expect(repo.lastMemberId).toBe("member-42");
  });
});
