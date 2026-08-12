import type { Result } from "@9thround/shared-kernel";
import type { DayOfWeek, Shift } from "./shift";

export interface CreateShiftInput {
  profileId: string;
  branchId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface ShiftRepository {
  listForBranch(branchId: string): Promise<Result<Shift[]>>;
  create(input: CreateShiftInput): Promise<Result<Shift>>;
  delete(shiftId: string): Promise<Result<void>>;
}
