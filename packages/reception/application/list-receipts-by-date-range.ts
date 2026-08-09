import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Receipt } from "../domain/receipt";
import type { ReceiptRepository } from "../domain/receipt-repository";

export interface ListReceiptsByDateRangeInput {
  branchId: string;
  startDate: string;
  endDate: string;
}

/** Backs the Receipts page's calendar/daily-income view — see ReceiptRepository.listByDateRange's own comment on why this isn't capped like the plain chronological list(). */
export class ListReceiptsByDateRangeUseCase implements UseCase<ListReceiptsByDateRangeInput, Receipt[]> {
  constructor(private readonly receipts: ReceiptRepository) {}

  async execute(input: ListReceiptsByDateRangeInput): Promise<Result<Receipt[]>> {
    return this.receipts.listByDateRange(input.branchId, input.startDate, input.endDate);
  }
}
