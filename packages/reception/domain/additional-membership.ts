import type { PaymentMethod, ProgramType } from "./registration";

/**
 * Sells a new, concurrent membership to an existing member — e.g. a
 * Personal Training package sold alongside their regular gym membership.
 * Unlike RenewMembershipInput, this never expires any of the member's
 * other active memberships; see supabase/migrations/20260915000001 for
 * why that's now possible (one active membership per member per TYPE,
 * not per member overall).
 */
export interface SellAdditionalMembershipInput {
  memberId: string;
  membershipTypeId: string;
  receiptNumber: string;
  price: number;
  discount: number;
  startDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  coachId: string | null;
  sessionCount: number | null;
  programType: ProgramType | null;
  soldBy: string | null;
}

export interface SellAdditionalMembershipOutput {
  membershipId: string;
  membershipNumber: string;
  startDate: string;
  endDate: string;
}
