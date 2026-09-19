import type { PaymentMethod, ProgramType } from "./registration";

export interface Receipt {
  paymentId: string;
  receiptNumber: string;
  membershipNumber: string;
  memberFullName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  programType: ProgramType | null;
  coachId: string | null;
  coachFullName: string | null;
  soldById: string | null;
  soldByFullName: string | null;
}

/** Combinable filters for the Receipts page — future coach-commission/revenue reporting by program and/or coach. */
export interface ReceiptFilters {
  programType?: ProgramType | null;
  coachId?: string | null;
}
