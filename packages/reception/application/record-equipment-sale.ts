import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { EquipmentSale, RecordEquipmentSaleInput } from "../domain/equipment-sale";
import type { EquipmentSaleRepository } from "../domain/equipment-sale-repository";

export class RecordEquipmentSaleUseCase implements UseCase<RecordEquipmentSaleInput, EquipmentSale> {
  constructor(private readonly sales: EquipmentSaleRepository) {}

  async execute(input: RecordEquipmentSaleInput): Promise<Result<EquipmentSale>> {
    if (!input.itemName.trim()) {
      return err(domainError("ITEM_NAME_REQUIRED", "Item name is required."));
    }
    if (input.quantity <= 0) {
      return err(domainError("INVALID_QUANTITY", "Quantity must be at least 1."));
    }
    if (input.unitPrice < 0) {
      return err(domainError("INVALID_PRICE", "Price cannot be negative."));
    }
    return this.sales.record(input);
  }
}
