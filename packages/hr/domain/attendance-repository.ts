import type { Result } from "@9thround/shared-kernel";
import type { AttendanceRecord } from "./attendance";

export interface AttendanceRepository {
  /** The caller's own open (not-yet-clocked-out) record, if any — used to reject a double clock-in. */
  findOpenForProfile(profileId: string): Promise<Result<AttendanceRecord | null>>;
  /** Requires the caller's current device coordinates — real server-side enforcement, see clock_in_at_location(). */
  clockIn(profileId: string, branchId: string, latitude: number, longitude: number): Promise<Result<AttendanceRecord>>;
  clockOut(recordId: string): Promise<Result<AttendanceRecord>>;
  listForBranch(branchId: string, startDate: string, endDate: string): Promise<Result<AttendanceRecord[]>>;
}
