import type { Gender } from "./registration";

export interface UpdateMemberInput {
  memberId: string;
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
}
