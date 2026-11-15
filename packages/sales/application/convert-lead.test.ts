import { describe, expect, it } from "vitest";
import { ConvertLeadUseCase } from "./convert-lead";
import { buildConvertLeadInput, fakeLeadRepository } from "./test-helpers";

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

  it("delegates a valid conversion to the repository — the same path that calls the existing register_membership()", async () => {
    const leads = fakeLeadRepository();
    const useCase = new ConvertLeadUseCase(leads);

    const result = await useCase.execute(buildConvertLeadInput());

    expect(result.isOk).toBe(true);
    expect(leads.lastConvertInput?.leadId).toBe("lead-1");
  });
});
