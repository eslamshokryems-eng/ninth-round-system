import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { CheckInByQrCodeUseCase } from "./check-in-by-qr-code";
import { fakeMemberSearchRepository, fakeCheckInRepository, type FakeMemberSearchRepository } from "./test-helpers";
import type { MemberSearchResult } from "../domain/member-search-result";

function buildResult(overrides: Partial<MemberSearchResult> = {}): MemberSearchResult {
  return {
    memberId: "member-1",
    memberCode: "9R-000001",
    fullName: "Ahmed Mostafa",
    phone: "+201000000000",
    activeMembershipStatus: "active",
    activeMembershipEndDate: "2027-01-01",
    ...overrides,
  };
}

describe("CheckInByQrCodeUseCase", () => {
  it("resolves the scanned code to a member, then checks them in", async () => {
    const members = fakeMemberSearchRepository() as FakeMemberSearchRepository;
    members.byQrCode.set("qr-abc-123", buildResult());
    const checkIns = fakeCheckInRepository({ checkInId: "check-in-9", checkedInAt: "2026-08-19T10:00:00.000Z" });
    const useCase = new CheckInByQrCodeUseCase(members, checkIns);

    const result = await useCase.execute("qr-abc-123");

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.fullName).toBe("Ahmed Mostafa");
    expect(result.isOk && result.value.memberId).toBe("member-1");
    expect(checkIns.lastMemberId).toBe("member-1");
  });

  it("trims whitespace/newlines a scanner may add around the decoded value", async () => {
    const members = fakeMemberSearchRepository() as FakeMemberSearchRepository;
    members.byQrCode.set("qr-abc-123", buildResult());
    const checkIns = fakeCheckInRepository();
    const useCase = new CheckInByQrCodeUseCase(members, checkIns);

    const result = await useCase.execute("  qr-abc-123\n");

    expect(result.isOk).toBe(true);
  });

  it("fails with MEMBER_NOT_FOUND for a code that matches no member", async () => {
    const members = fakeMemberSearchRepository() as FakeMemberSearchRepository;
    const checkIns = fakeCheckInRepository();
    const useCase = new CheckInByQrCodeUseCase(members, checkIns);

    const result = await useCase.execute("unknown-code");

    expect(result.isErr && result.error.code).toBe("MEMBER_NOT_FOUND");
  });

  it("fails with INVALID_QR_CODE for an empty scan result", async () => {
    const members = fakeMemberSearchRepository() as FakeMemberSearchRepository;
    const checkIns = fakeCheckInRepository();
    const useCase = new CheckInByQrCodeUseCase(members, checkIns);

    const result = await useCase.execute("   ");

    expect(result.isErr && result.error.code).toBe("INVALID_QR_CODE");
  });

  it("propagates the underlying check-in error (e.g. no active membership) unchanged", async () => {
    const members = fakeMemberSearchRepository() as FakeMemberSearchRepository;
    members.byQrCode.set("qr-abc-123", buildResult());
    const checkIns = fakeCheckInRepository();
    checkIns.checkIn = async () => err(domainError("NO_ACTIVE_MEMBERSHIP", "no"));
    const useCase = new CheckInByQrCodeUseCase(members, checkIns);

    const result = await useCase.execute("qr-abc-123");

    expect(result.isErr && result.error.code).toBe("NO_ACTIVE_MEMBERSHIP");
  });
});
