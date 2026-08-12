import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AttendanceRecord } from "../domain/attendance";
import type { AttendanceRepository } from "../domain/attendance-repository";

export interface ListAttendanceInput {
  branchId: string;
  startDate: string;
  endDate: string;
}

export class ListAttendanceUseCase implements UseCase<ListAttendanceInput, AttendanceRecord[]> {
  constructor(private readonly attendance: AttendanceRepository) {}

  async execute(input: ListAttendanceInput): Promise<Result<AttendanceRecord[]>> {
    return this.attendance.listForBranch(input.branchId, input.startDate, input.endDate);
  }
}
