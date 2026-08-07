import type { PaymentMethod } from "./registration";

export interface Receipt {
  paymentId: string;
  receiptNumber: string;
  membershipNumber: string;
  memberFullName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
}
