import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Receipt } from "../domain/receipt";
import type { ReceiptRepository } from "../domain/receipt-repository";

export class ListReceiptsUseCase implements UseCase<string, Receipt[]> {
  constructor(private readonly receipts: ReceiptRepository) {}

  async execute(branchId: string): Promise<Result<Receipt[]>> {
    return this.receipts.list(branchId);
  }
}
