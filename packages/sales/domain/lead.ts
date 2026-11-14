export type LeadStatus = "new" | "contacted" | "follow_up" | "converted" | "lost";
export type LeadSource = "walk_in" | "phone" | "facebook" | "instagram" | "referral" | "website" | "other";
export type LeadLostReason = "not_interested" | "too_expensive" | "chose_competitor" | "unreachable" | "other";
export type LeadGender = "female" | "male" | "unspecified";

/** One row of the Leads list — the browsable/searchable read model, not the full detail page. */
export interface LeadSummary {
  leadId: string;
  fullName: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  assignedToId: string | null;
  assignedToName: string | null;
  interestedMembershipTypeName: string | null;
  createdAt: Date;
}

/** The Lead Detail page's Profile + Interest sections. */
export interface LeadDetail {
  leadId: string;
  branchId: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: LeadGender | null;
  status: LeadStatus;
  source: LeadSource;
  interestedMembershipTypeId: string | null;
  interestedMembershipTypeName: string | null;
  interestNotes: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  lostReason: LeadLostReason | null;
  lostNote: string | null;
  lostAt: Date | null;
  convertedMemberId: string | null;
  convertedAt: Date | null;
  createdAt: Date;
}

export interface CreateLeadInput {
  branchId: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: LeadGender | null;
  source: LeadSource;
  interestedMembershipTypeId: string | null;
  interestNotes: string | null;
  assignedToId: string | null;
}

export interface UpdateLeadInput {
  leadId: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: LeadGender | null;
  source: LeadSource;
  interestedMembershipTypeId: string | null;
  interestNotes: string | null;
}

export interface ConvertLeadInput {
  leadId: string;
  membershipTypeId: string;
  receiptNumber: string;
  price: number;
  discount: number;
  startDate: string;
  paymentMethod: "cash" | "visa" | "instapay" | "vodafone_cash";
  notes: string | null;
  nationalId: string | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoUrl: string | null;
  coachId: string | null;
  sessionCount: number | null;
  /** Training program of the new membership (same values as Add Member). */
  programType?: ProgramType | null;
}

export type ProgramType = "ninth_round" | "boxing" | "kickboxing" | "mma";

export interface ConvertLeadOutput {
  memberId: string;
  /** null only for a lead converted before conversions were recorded (legacy). */
  membershipId: string | null;
  membershipNumber: string | null;
  memberQrCode: string | null;
  /** true = the lead was already converted (retry / double click): nothing new was created, the existing result is returned. */
  alreadyConverted: boolean;
}

/** Reopening a lost lead always schedules its next action (an active lead must have one). */
export interface ReopenLeadInput {
  leadId: string;
  nextKind: "call" | "whatsapp" | "visit" | "other";
  nextAt: Date;
  note: string | null;
}

/** Who was credited and who registered the sale (memberships.sold_by / created_by), recorded at conversion. */
export interface LeadConversion {
  memberId: string;
  membershipId: string;
  membershipNumber: string | null;
  leadOwnerId: string | null;
  leadOwnerName: string | null;
  convertedById: string | null;
  convertedByName: string | null;
  convertedAt: Date;
}
