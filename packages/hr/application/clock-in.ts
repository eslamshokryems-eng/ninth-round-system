import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AttendanceRecord } from "../domain/attendance";
import type { AttendanceRepository } from "../domain/attendance-repository";

export interface ClockInInput {
  profileId: string;
  branchId: string;
  latitude: number;
  longitude: number;
}

export class ClockInUseCase implements UseCase<ClockInInput, AttendanceRecord> {
  constructor(private readonly attendance: AttendanceRepository) {}

  async execute(input: ClockInInput): Promise<Result<AttendanceRecord>> {
    const open = await this.attendance.findOpenForProfile(input.profileId);
    if (open.isErr) return open;
    if (open.value) {
      return err(domainError("ALREADY_CLOCKED_IN", "Already clocked in — clock out first."));
    }
    return this.attendance.clockIn(input.profileId, input.branchId, input.latitude, input.longitude);
  }
}
