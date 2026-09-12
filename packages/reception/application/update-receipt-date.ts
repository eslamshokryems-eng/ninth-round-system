import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ReceiptRepository } from "../domain/receipt-repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface UpdateReceiptDateInput {
  paymentId: string;
  newDate: string;
}

/**
 * Corrects a receipt's recorded payment date. Real authorization is the
 * database's RLS policy (super_admin only, 20260827000001) — same posture
 * as this module's other use cases: a non-authorized caller's update is
 * rejected at the database, not re-checked here. UI-level gating exists
 * purely as UX.
 */
export class UpdateReceiptDateUseCase implements UseCase<UpdateReceiptDateInput, void> {
  constructor(private readonly receipts: ReceiptRepository) {}

  async execute(input: UpdateReceiptDateInput): Promise<Result<void>> {
    if (!DATE_PATTERN.test(input.newDate)) {
      return err(domainError("INVALID_DATE", "Date must be in YYYY-MM-DD format."));
    }
    return this.receipts.updateDate(input.paymentId, input.newDate);
  }
}
