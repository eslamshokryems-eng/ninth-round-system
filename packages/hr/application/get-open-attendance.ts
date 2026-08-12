import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AttendanceRecord } from "../domain/attendance";
import type { AttendanceRepository } from "../domain/attendance-repository";

/** Backs the Clock In/Out button's initial state — is the caller already clocked in right now? */
export class GetOpenAttendanceUseCase implements UseCase<string, AttendanceRecord | null> {
  constructor(private readonly attendance: AttendanceRepository) {}

  async execute(profileId: string): Promise<Result<AttendanceRecord | null>> {
    return this.attendance.findOpenForProfile(profileId);
  }
}
