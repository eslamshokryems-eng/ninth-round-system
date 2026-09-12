import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RecentCheckInEntry } from "../domain/check-in";
import type { CheckInRepository } from "../domain/check-in-repository";

export interface ListCheckInsByDateRangeInput {
  startDate: string;
  endDate: string;
}

/** Backs the Check-in History page's calendar/daily-count view — see CheckInRepository.listByDateRange's own comment. */
export class ListCheckInsByDateRangeUseCase implements UseCase<ListCheckInsByDateRangeInput, RecentCheckInEntry[]> {
  constructor(private readonly checkIns: CheckInRepository) {}

  async execute(input: ListCheckInsByDateRangeInput): Promise<Result<RecentCheckInEntry[]>> {
    return this.checkIns.listByDateRange(input.startDate, input.endDate);
  }
}
