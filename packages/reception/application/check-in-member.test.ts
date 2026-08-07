import { describe, expect, it } from "vitest";
import { CheckInMemberUseCase } from "./check-in-member";
import { fakeCheckInRepository, FakeCheckInRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("CheckInMemberUseCase", () => {
  it("checks in and returns the new check-in record", async () => {
    const repo = fakeCheckInRepository({ checkInId: "check-in-42", checkedInAt: "2026-08-06T12:00:00.000Z" });
    const useCase = new CheckInMemberUseCase(repo);

    const result = await useCase.execute("member-1");

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.checkInId).toBe("check-in-42");
  });

  it("passes the member id through unchanged", async () => {
    const repo = fakeCheckInRepository();
    const useCase = new CheckInMemberUseCase(repo);

    await useCase.execute("member-42");

    expect(repo.lastMemberId).toBe("member-42");
  });

  it("propagates a repository failure (e.g. no active membership) without transforming it", async () => {
    const repo = new FakeCheckInRepository(err(domainError("NO_ACTIVE_MEMBERSHIP", "no active membership")));
    const useCase = new CheckInMemberUseCase(repo);

    const result = await useCase.execute("member-1");

    expect(result.isErr && result.error.code).toBe("NO_ACTIVE_MEMBERSHIP");
  });
});
