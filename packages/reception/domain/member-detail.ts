import type { Gender, PaymentMethod } from "./registration";
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
  coachFullName: string | null;
  sessionCount: number | null;
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
