import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { EquipmentSaleRepository } from "../domain/equipment-sale-repository";
import type { EquipmentSale, RecordEquipmentSaleInput } from "../domain/equipment-sale";
import type { OtherSaleRow } from "@9thround/database-types";

function toEquipmentSale(row: OtherSaleRow): EquipmentSale {
  return {
    id: row.id,
    itemName: row.item_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    paymentMethod: row.payment_method,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class SupabaseEquipmentSaleRepository implements EquipmentSaleRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async record(input: RecordEquipmentSaleInput): Promise<Result<EquipmentSale>> {
    const { data, error } = await this.client
      .from("other_sales")
      .insert({
        branch_id: input.branchId,
        item_name: input.itemName,
        quantity: input.quantity,
        unit_price: input.unitPrice,
        payment_method: input.paymentMethod,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        notes: input.notes,
      })
      .select()
      .single();

    if (error) {
      return err(domainError("RECORD_EQUIPMENT_SALE_FAILED", error.message));
    }
    return ok(toEquipmentSale(data));
  }

  async list(branchId: string): Promise<Result<EquipmentSale[]>> {
    const { data, error } = await this.client
      .from("other_sales")
      .select()
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return err(domainError("LIST_EQUIPMENT_SALES_FAILED", error.message));
    }
    return ok(data.map(toEquipmentSale));
  }
}
