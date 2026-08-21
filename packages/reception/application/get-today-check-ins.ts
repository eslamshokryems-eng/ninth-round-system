import type { Result, UseCase } from "@9thround/shared-kernel";
import type { TodayCheckInEntry } from "../domain/check-in";
import type { CheckInRepository } from "../domain/check-in-repository";

// No input: RLS scopes the query to the caller's branch, nothing for the client to pass.
export type GetTodayCheckInsInput = Record<string, never>;

/** Backs the Dashboard's check-in trend chart — every check-in from today, for bucketing by hour. */
export class GetTodayCheckInsUseCase implements UseCase<GetTodayCheckInsInput, TodayCheckInEntry[]> {
  constructor(private readonly checkIns: CheckInRepository) {}

  async execute(): Promise<Result<TodayCheckInEntry[]>> {
    return this.checkIns.listToday();
  }
}
