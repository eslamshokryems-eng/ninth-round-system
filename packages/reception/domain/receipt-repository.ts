import type { Result } from "@9thround/shared-kernel";
import type { Receipt } from "./receipt";

export interface ReceiptRepository {
  /** Most recent payments, for the plain chronological list — capped, see infrastructure. */
  list(branchId: string): Promise<Result<Receipt[]>>;
  /** All payments within a date range (inclusive, "YYYY-MM-DD"), for the calendar/daily-income view — unlike list(), not capped to "most recent". */
  listByDateRange(branchId: string, startDate: string, endDate: string): Promise<Result<Receipt[]>>;
}
