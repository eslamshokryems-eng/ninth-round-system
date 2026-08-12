import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Shift } from "../domain/shift";
import type { CreateShiftInput, ShiftRepository } from "../domain/shift-repository";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftUseCase implements UseCase<CreateShiftInput, Shift> {
  constructor(private readonly shifts: ShiftRepository) {}

  async execute(input: CreateShiftInput): Promise<Result<Shift>> {
    if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
      return err(domainError("INVALID_SHIFT_TIME", "Start and end time must be in HH:MM (24-hour) format."));
    }
    if (input.startTime >= input.endTime) {
      return err(domainError("INVALID_SHIFT_RANGE", "Shift end time must be after start time."));
    }
    return this.shifts.create(input);
  }
}
