import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AttendanceRecord } from "../domain/attendance";
import type { AttendanceRepository } from "../domain/attendance-repository";

export class ClockOutUseCase implements UseCase<string, AttendanceRecord> {
  constructor(private readonly attendance: AttendanceRepository) {}

  async execute(profileId: string): Promise<Result<AttendanceRecord>> {
    const open = await this.attendance.findOpenForProfile(profileId);
    if (open.isErr) return open;
    if (!open.value) {
      return err(domainError("NOT_CLOCKED_IN", "Not currently clocked in."));
    }
    return this.attendance.clockOut(open.value.id);
  }
}
