import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { DeleteMemberUseCase } from "./delete-member";
import { fakeDeleteMemberRepository } from "./test-helpers";

describe("DeleteMemberUseCase", () => {
  it("delegates straight to the repository on success", async () => {
    const members = fakeDeleteMemberRepository();
    const useCase = new DeleteMemberUseCase(members);

    const result = await useCase.execute("member-1");

    expect(result.isOk).toBe(true);
    expect(members.lastMemberId).toBe("member-1");
  });

  it("propagates a repository error unchanged (e.g. blocked by RLS)", async () => {
    const members = fakeDeleteMemberRepository(err(domainError("DELETE_MEMBER_FAILED", "not permitted")));
    const useCase = new DeleteMemberUseCase(members);

    const result = await useCase.execute("member-1");

    expect(result.isErr && result.error.code).toBe("DELETE_MEMBER_FAILED");
  });
});
