export type Gender = "female" | "male" | "unspecified";
export type PaymentMethod = "cash" | "visa" | "instapay" | "vodafone_cash";
/** The sport/program a membership is for — orthogonal to MembershipType (duration/price package). Never backfilled on historical rows; null means unclassified. */
export type ProgramType = "ninth_round" | "boxing" | "kickboxing" | "mma";

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
  programType: ProgramType | null;
  /**
   * Who sold this membership — any staff account, not just sales_employee.
   * Required by the web Reception UI (Save is disabled until one is
   * picked), but typed nullable here to match coachId/programType's shape:
   * the column stays nullable at the DB level (no backfill on historical
   * rows), and apps/mobile has no picker for this yet.
   */
  soldBy: string | null;
}

export interface RegisterMembershipOutput {
  memberId: string;
  membershipId: string;
  membershipNumber: string;
  memberQrCode: string;
}
