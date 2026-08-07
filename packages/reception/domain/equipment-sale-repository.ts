import type { Result } from "@9thround/shared-kernel";
import type { EquipmentSale, RecordEquipmentSaleInput } from "./equipment-sale";

export interface EquipmentSaleRepository {
  record(input: RecordEquipmentSaleInput): Promise<Result<EquipmentSale>>;
  list(branchId: string): Promise<Result<EquipmentSale[]>>;
}
