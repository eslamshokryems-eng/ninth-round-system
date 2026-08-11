import type { Result } from "@9thround/shared-kernel";
import type { StaffPresence } from "./staff-presence";

export interface StaffPresenceRepository {
  /** Every non-member (staff) account, for the Manage Staff roster. */
  listStaff(): Promise<Result<StaffPresence[]>>;
  /** Bumps the caller's own last_seen_at — called periodically while a staff session is open. */
  recordHeartbeat(profileId: string): Promise<Result<void>>;
}
