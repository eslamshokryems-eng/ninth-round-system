import type { UserRoleName } from "./role";

export interface StaffPresence {
  profileId: string;
  fullName: string | null;
  role: UserRoleName;
  branchId: string | null;
  lastSeenAt: Date | null;
}
