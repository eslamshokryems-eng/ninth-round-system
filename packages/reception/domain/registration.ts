export type Gender = "female" | "male" | "unspecified";
export type PaymentMethod = "cash" | "visa" | "instapay" | "vodafone_cash";

export interface RegisterMembershipInput {
  branchId: string;
  fullName: string;
  phone: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  membershipTypeId: string;
  receiptNumber: string;
  price: number;
  discount: number;
  startDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
}

export interface RegisterMembershipOutput {
  memberId: string;
  membershipId: string;
  membershipNumber: string;
}
