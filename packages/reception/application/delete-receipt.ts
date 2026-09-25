import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ReceiptRepository } from "../domain/receipt-repository";

export interface DeleteReceiptInput {
  paymentId: string;
  reason: string;
}

/**
 * Permanently deletes one receipt/payment. Real authorization is
 * delete_receipt()'s own is_super_admin() check (20260926000001) — a
 * non-admin's call is rejected at the database, not re-checked here. This
 * layer only validates a reason was actually given, mirroring
 * RenewMembershipUseCase's shape (cheap, obvious rejections only; the DB
 * owns the rest).
 */
export class DeleteReceiptUseCase implements UseCase<DeleteReceiptInput, void> {
  constructor(private readonly receipts: ReceiptRepository) {}

  async execute(input: DeleteReceiptInput): Promise<Result<void>> {
    if (!input.reason.trim()) {
      return err(domainError("DELETE_REASON_REQUIRED", "Enter a reason for deleting this receipt."));
    }
    return this.receipts.delete(input.paymentId, input.reason.trim());
  }
}
