import type { Gender, PaymentMethod, ProgramType } from "./registration";
import type { MembershipStatus } from "./member-search-result";

export interface MembershipHistoryEntry {
  membershipId: string;
  membershipNumber: string;
  membershipTypeName: string;
  startDate: string;
  endDate: string;
  price: number;
  discount: number;
  finalPrice: number;
  paymentMethod: PaymentMethod;
  status: MembershipStatus;
  coachId: string | null;
  coachFullName: string | null;
  sessionCount: number | null;
  programType: ProgramType | null;
}

export interface MemberDetail {
  memberId: string;
  memberCode: string;
  qrCode: string;
  photoUrl: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  address: string | null;
  notes: string | null;
  membershipHistory: MembershipHistoryEntry[];
}
