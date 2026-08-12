import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ShiftRepository } from "../domain/shift-repository";

export class DeleteShiftUseCase implements UseCase<string, void> {
  constructor(private readonly shifts: ShiftRepository) {}

  async execute(shiftId: string): Promise<Result<void>> {
    return this.shifts.delete(shiftId);
  }
}
