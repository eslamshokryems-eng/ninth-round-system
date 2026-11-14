import { describe, expect, it } from "vitest";
import { ConvertLeadUseCase } from "./convert-lead";
import { ok } from "@9thround/shared-kernel";
import { buildConvertLeadInput, fakeLeadRepository, FakeLeadRepository } from "./test-helpers";

describe("ConvertLeadUseCase", () => {
  it("rejects a missing receipt number", async () => {
    const useCase = new ConvertLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildConvertLeadInput({ receiptNumber: " " }));
    expect(result.isErr && result.error.code).toBe("RECEIPT_NUMBER_REQUIRED");
  });

  it("rejects a negative price", async () => {
    const useCase = new ConvertLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildConvertLeadInput({ price: -1 }));
    expect(result.isErr && result.error.code).toBe("INVALID_PRICE");
  });

  it("rejects a discount greater than the price", async () => {
    const useCase = new ConvertLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildConvertLeadInput({ price: 100, discount: 150 }));
    expect(result.isErr && result.error.code).toBe("INVALID_DISCOUNT");
  });

  it("rejects a missing membership type and start date", async () => {
    const useCase = new ConvertLeadUseCase(fakeLeadRepository());
    const a = await useCase.execute(buildConvertLeadInput({ membershipTypeId: "" }));
    expect(a.isErr && a.error.code).toBe("MEMBERSHIP_TYPE_REQUIRED");
    const b = await useCase.execute(buildConvertLeadInput({ startDate: "" }));
    expect(b.isErr && b.error.code).toBe("START_DATE_REQUIRED");
  });

  it("passes through the idempotent result of a retried conversion (already converted: nothing new created)", async () => {
    const leads = new FakeLeadRepository({
      convert: ok({ memberId: "m", membershipId: "ms", membershipNumber: "9R-1", memberQrCode: "q", alreadyConverted: true }),
    });
    const result = await new ConvertLeadUseCase(leads).execute(buildConvertLeadInput());
    expect(result.isOk && result.value.alreadyConverted).toBe(true);
  });

  it("delegates a valid conversion to the repository — the same path that calls the existing register_membership()", async () => {
    const leads = fakeLeadRepository();
    const useCase = new ConvertLeadUseCase(leads);

    const result = await useCase.execute(buildConvertLeadInput());

    expect(result.isOk).toBe(true);
    expect(leads.lastConvertInput?.leadId).toBe("lead-1");
  });
});
