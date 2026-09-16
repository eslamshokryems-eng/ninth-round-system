import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Receipt, ReceiptFilters } from "../domain/receipt";
import type { ProgramType } from "../domain/registration";
import type { ReceiptRepository } from "../domain/receipt-repository";

export interface ListReceiptsByDateRangeInput {
  branchId: string;
  startDate: string;
  endDate: string;
  /** Combinable with each other and with the date range. */
  programType?: ProgramType | null;
  coachId?: string | null;
}

/** Backs the Receipts page's calendar/daily-income view — see ReceiptRepository.listByDateRange's own comment on why this isn't capped like the plain chronological list(). */
export class ListReceiptsByDateRangeUseCase implements UseCase<ListReceiptsByDateRangeInput, Receipt[]> {
  constructor(private readonly receipts: ReceiptRepository) {}

  async execute(input: ListReceiptsByDateRangeInput): Promise<Result<Receipt[]>> {
    const filters: ReceiptFilters = { programType: input.programType ?? null, coachId: input.coachId ?? null };
    return this.receipts.listByDateRange(input.branchId, input.startDate, input.endDate, filters);
  }
}
