import { describe, expect, it } from "vitest";
import { RegisterMembershipUseCase } from "./register-membership";
import { buildRegisterMembershipInput, fakeRegistrationRepository, FakeRegistrationRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("RegisterMembershipUseCase", () => {
  it("registers and returns the generated membership number", async () => {
    const repo = fakeRegistrationRepository({ membershipNumber: "9R-000042" });
    const useCase = new RegisterMembershipUseCase(repo);

    const result = await useCase.execute(buildRegisterMembershipInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.membershipNumber).toBe("9R-000042");
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = fakeRegistrationRepository();
    const useCase = new RegisterMembershipUseCase(repo);
    const input = buildRegisterMembershipInput({ fullName: "Sara Ali" });

    await useCase.execute(input);

    expect(repo.lastInput?.fullName).toBe("Sara Ali");
  });

  it("rejects an empty full name before hitting the repository", async () => {
    const repo = fakeRegistrationRepository();
    const useCase = new RegisterMembershipUseCase(repo);

    const result = await useCase.execute(buildRegisterMembershipInput({ fullName: "  " }));

    expect(result.isErr && result.error.code).toBe("FULL_NAME_REQUIRED");
    expect(repo.lastInput).toBeNull();
  });

  it("rejects an empty phone number", async () => {
    const useCase = new RegisterMembershipUseCase(fakeRegistrationRepository());
    const result = await useCase.execute(buildRegisterMembershipInput({ phone: "" }));
    expect(result.isErr && result.error.code).toBe("PHONE_REQUIRED");
  });

  it("rejects an empty receipt number", async () => {
    const useCase = new RegisterMembershipUseCase(fakeRegistrationRepository());
    const result = await useCase.execute(buildRegisterMembershipInput({ receiptNumber: "" }));
    expect(result.isErr && result.error.code).toBe("RECEIPT_NUMBER_REQUIRED");
  });

  it("rejects a discount greater than the price", async () => {
    const useCase = new RegisterMembershipUseCase(fakeRegistrationRepository());
    const result = await useCase.execute(buildRegisterMembershipInput({ price: 100, discount: 150 }));
    expect(result.isErr && result.error.code).toBe("INVALID_DISCOUNT");
  });

  it("propagates a repository failure (e.g. duplicate phone) without transforming it", async () => {
    const repo = new FakeRegistrationRepository(err(domainError("PHONE_ALREADY_REGISTERED", "taken")));
    const useCase = new RegisterMembershipUseCase(repo);

    const result = await useCase.execute(buildRegisterMembershipInput());

    expect(result.isErr && result.error.code).toBe("PHONE_ALREADY_REGISTERED");
  });
});
