import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ReceiptRepository } from "../domain/receipt-repository";
import type { Receipt } from "../domain/receipt";

export class SupabaseReceiptRepository implements ReceiptRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async list(branchId: string): Promise<Result<Receipt[]>> {
    // `!inner` on memberships makes it possible to filter on the embedded
    // relation's branch_id — membership_payments itself has no branch_id
    // column (a payment belongs to a membership, which belongs to a branch).
    const { data, error } = await this.client
      .from("membership_payments")
      .select(
        `id, payment_date, amount, payment_method,
         memberships!inner (branch_id, receipt_number, membership_number, members (full_name))`,
      )
      .eq("memberships.branch_id", branchId)
      .order("payment_date", { ascending: false })
      .limit(100);

    if (error) {
      return err(domainError("LIST_RECEIPTS_FAILED", error.message));
    }

    return ok(
      data.map((row) => {
        // Same hand-authored-types quirk as SupabaseMemberDetailRepository: no Relationships
        // metadata means an embedded (even `!inner`) relation infers as an array, not a single row.
        const membership = row.memberships[0];
        return {
          paymentId: row.id,
          receiptNumber: membership?.receipt_number ?? "—",
          membershipNumber: membership?.membership_number ?? "—",
          memberFullName: membership?.members[0]?.full_name ?? "—",
          amount: row.amount,
          paymentMethod: row.payment_method,
          paymentDate: row.payment_date,
        };
      }),
    );
  }
}
