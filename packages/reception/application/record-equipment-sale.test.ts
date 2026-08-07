import { describe, expect, it } from "vitest";
import { RecordEquipmentSaleUseCase } from "./record-equipment-sale";
import {
  buildRecordEquipmentSaleInput,
  fakeEquipmentSaleRepository,
  FakeEquipmentSaleRepository,
} from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("RecordEquipmentSaleUseCase", () => {
  it("records and returns the sale with its computed total", async () => {
    const repo = fakeEquipmentSaleRepository({ id: "sale-42", totalPrice: 700 });
    const useCase = new RecordEquipmentSaleUseCase(repo);

    const result = await useCase.execute(buildRecordEquipmentSaleInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.totalPrice).toBe(700);
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = fakeEquipmentSaleRepository();
    const useCase = new RecordEquipmentSaleUseCase(repo);
    const input = buildRecordEquipmentSaleInput({ itemName: "Jump Rope" });

    await useCase.execute(input);

    expect(repo.lastInput?.itemName).toBe("Jump Rope");
  });

  it("rejects an empty item name before hitting the repository", async () => {
    const repo = fakeEquipmentSaleRepository();
    const useCase = new RecordEquipmentSaleUseCase(repo);

    const result = await useCase.execute(buildRecordEquipmentSaleInput({ itemName: "  " }));

    expect(result.isErr && result.error.code).toBe("ITEM_NAME_REQUIRED");
    expect(repo.lastInput).toBeNull();
  });

  it("rejects a zero or negative quantity", async () => {
    const useCase = new RecordEquipmentSaleUseCase(fakeEquipmentSaleRepository());
    const result = await useCase.execute(buildRecordEquipmentSaleInput({ quantity: 0 }));
    expect(result.isErr && result.error.code).toBe("INVALID_QUANTITY");
  });

  it("rejects a negative unit price", async () => {
    const useCase = new RecordEquipmentSaleUseCase(fakeEquipmentSaleRepository());
    const result = await useCase.execute(buildRecordEquipmentSaleInput({ unitPrice: -1 }));
    expect(result.isErr && result.error.code).toBe("INVALID_PRICE");
  });

  it("propagates a repository failure without transforming it", async () => {
    const repo = new FakeEquipmentSaleRepository(err(domainError("RECORD_EQUIPMENT_SALE_FAILED", "db error")));
    const useCase = new RecordEquipmentSaleUseCase(repo);

    const result = await useCase.execute(buildRecordEquipmentSaleInput());

    expect(result.isErr && result.error.code).toBe("RECORD_EQUIPMENT_SALE_FAILED");
  });
});
