import type { PaymentMethod } from "./registration";

export interface RenewMembershipInput {
  memberId: string;
  membershipTypeId: string;
  receiptNumber: string;
  price: number;
  discount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
}

export interface RenewMembershipOutput {
  membershipId: string;
  membershipNumber: string;
  startDate: string;
  endDate: string;
}
