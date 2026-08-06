import { describe, expect, it } from "vitest";
import { UpdateMemberUseCase } from "./update-member";
import { buildUpdateMemberInput, FakeUpdateMemberRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("UpdateMemberUseCase", () => {
  it("updates and returns ok on success", async () => {
    const repo = new FakeUpdateMemberRepository();
    const useCase = new UpdateMemberUseCase(repo);

    const result = await useCase.execute(buildUpdateMemberInput());

    expect(result.isOk).toBe(true);
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = new FakeUpdateMemberRepository();
    const useCase = new UpdateMemberUseCase(repo);
    const input = buildUpdateMemberInput({ fullName: "Sara Ali" });

    await useCase.execute(input);

    expect(repo.lastInput?.fullName).toBe("Sara Ali");
  });

  it("rejects an empty full name before hitting the repository", async () => {
    const repo = new FakeUpdateMemberRepository();
    const useCase = new UpdateMemberUseCase(repo);

    const result = await useCase.execute(buildUpdateMemberInput({ fullName: "  " }));

    expect(result.isErr && result.error.code).toBe("FULL_NAME_REQUIRED");
    expect(repo.lastInput).toBeNull();
  });

  it("rejects an empty phone number", async () => {
    const useCase = new UpdateMemberUseCase(new FakeUpdateMemberRepository());
    const result = await useCase.execute(buildUpdateMemberInput({ phone: "" }));
    expect(result.isErr && result.error.code).toBe("PHONE_REQUIRED");
  });

  it("propagates a repository failure (e.g. duplicate phone) without transforming it", async () => {
    const repo = new FakeUpdateMemberRepository(err(domainError("PHONE_ALREADY_REGISTERED", "taken")));
    const useCase = new UpdateMemberUseCase(repo);

    const result = await useCase.execute(buildUpdateMemberInput());

    expect(result.isErr && result.error.code).toBe("PHONE_ALREADY_REGISTERED");
  });
});
