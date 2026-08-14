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
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoUrl: string | null;
  /** No usage tracking — a plain recorded number, see supabase/migrations/20260812000002_membership_coach_assignment.sql. */
  coachId: string | null;
  sessionCount: number | null;
}

export interface RegisterMembershipOutput {
  memberId: string;
  membershipId: string;
  membershipNumber: string;
  memberQrCode: string;
}
