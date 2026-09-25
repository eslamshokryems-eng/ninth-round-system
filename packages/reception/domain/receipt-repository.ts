import type { Result } from "@9thround/shared-kernel";
import type { Receipt, ReceiptFilters } from "./receipt";

export interface ReceiptRepository {
  /** Most recent payments, for the plain chronological list — capped, see infrastructure. */
  list(branchId: string): Promise<Result<Receipt[]>>;
  /**
   * All payments within a date range (inclusive, "YYYY-MM-DD"), for the
   * calendar/daily-income view — unlike list(), not capped to "most
   * recent". `filters` narrows further by the membership's program
   * and/or coach, combinable with each other and the date range.
   */
  listByDateRange(
    branchId: string,
    startDate: string,
    endDate: string,
    filters?: ReceiptFilters,
  ): Promise<Result<Receipt[]>>;
  /**
   * Corrects a payment's recorded date ("YYYY-MM-DD"). Gated at the
   * database level to super_admin only (20260827000001) — a non-admin
   * caller's UPDATE is rejected by RLS, not by this layer. Every other
   * field on a payment remains without an UPDATE path.
   */
  updateDate(paymentId: string, newDate: string): Promise<Result<void>>;
  /**
   * Permanently deletes a single payment/receipt record. Gated at the
   * database level to super_admin only (delete_receipt(), 20260926000001)
   * — a non-admin caller's call is rejected by the function itself, not
   * by this layer. Deletes exactly the one payment row; never touches the
   * parent membership, member, or any other record. The reason is
   * recorded on the resulting audit-log entry.
   */
  delete(paymentId: string, reason: string): Promise<Result<void>>;
}
