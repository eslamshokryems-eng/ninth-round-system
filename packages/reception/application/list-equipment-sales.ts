import type { Result, UseCase } from "@9thround/shared-kernel";
import type { EquipmentSale } from "../domain/equipment-sale";
import type { EquipmentSaleRepository } from "../domain/equipment-sale-repository";

export class ListEquipmentSalesUseCase implements UseCase<string, EquipmentSale[]> {
  constructor(private readonly sales: EquipmentSaleRepository) {}

  async execute(branchId: string): Promise<Result<EquipmentSale[]>> {
    return this.sales.list(branchId);
  }
}
