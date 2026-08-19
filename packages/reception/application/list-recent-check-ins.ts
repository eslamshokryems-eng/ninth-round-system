import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RecentCheckInEntry } from "../domain/check-in";
import type { CheckInRepository } from "../domain/check-in-repository";

// No input: RLS scopes the query to the caller's branch, nothing for the
// client to pass. Enough rows to fill the Dashboard's list comfortably
// without an unbounded query — a display cap, not a product limit.
export type ListRecentCheckInsInput = Record<string, never>;
const LIMIT = 15;

/** Backs the Dashboard's "Recent Check-Ins" list — the most recent check-ins across all members, not one. */
export class ListRecentCheckInsUseCase implements UseCase<ListRecentCheckInsInput, RecentCheckInEntry[]> {
  constructor(private readonly checkIns: CheckInRepository) {}

  async execute(): Promise<Result<RecentCheckInEntry[]>> {
    return this.checkIns.listRecent(LIMIT);
  }
}
