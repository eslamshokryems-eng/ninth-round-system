import type { PaymentMethod } from "./registration";

export interface RecordEquipmentSaleInput {
  branchId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  buyerName: string | null;
  buyerPhone: string | null;
  notes: string | null;
}

export interface EquipmentSale {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  buyerName: string | null;
  buyerPhone: string | null;
  notes: string | null;
  createdAt: string;
}
