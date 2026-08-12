import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Shift } from "../domain/shift";
import type { ShiftRepository } from "../domain/shift-repository";

export class ListShiftsUseCase implements UseCase<string, Shift[]> {
  constructor(private readonly shifts: ShiftRepository) {}

  async execute(branchId: string): Promise<Result<Shift[]>> {
    return this.shifts.listForBranch(branchId);
  }
}
