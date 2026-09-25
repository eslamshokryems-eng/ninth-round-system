import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ReceiptRepository } from "../domain/receipt-repository";
import type { Receipt, ReceiptFilters } from "../domain/receipt";

const RECEIPT_COLUMNS = `id, payment_date, amount, payment_method,
         memberships!inner (branch_id, receipt_number, membership_number, program_type, coach_id, sold_by, members (full_name), coach:profiles!memberships_coach_id_fkey (full_name), sold_by_staff:profiles!memberships_sold_by_fkey (full_name))`;

interface ReceiptRow {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: Receipt["paymentMethod"];
  memberships: {
    receipt_number: string;
    membership_number: string;
    program_type: Receipt["programType"];
    coach_id: string | null;
    sold_by: string | null;
    members: { full_name: string };
    coach: { full_name: string | null } | null;
    sold_by_staff: { full_name: string | null } | null;
  };
}

// `memberships` (FK on membership_payments, even with `!inner`) and the
// nested `members` (FK on memberships) are both to-one embeds — PostgREST
// returns each as a single object, not an array. This file previously
// indexed both with `[0]`, which returns undefined on a plain object and
// silently produced "—" for every receipt's member name — a real
// production bug, confirmed live on the Expiring page (same underlying
// mistake, same "—" symptom) before being traced back here.
function toReceipt(row: ReceiptRow): Receipt {
  const membership = row.memberships;
  return {
    paymentId: row.id,
    receiptNumber: membership?.receipt_number ?? "—",
    membershipNumber: membership?.membership_number ?? "—",
    memberFullName: membership?.members?.full_name ?? "—",
    amount: row.amount,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    programType: membership?.program_type ?? null,
    coachId: membership?.coach_id ?? null,
    coachFullName: membership?.coach?.full_name ?? null,
    soldById: membership?.sold_by ?? null,
    soldByFullName: membership?.sold_by_staff?.full_name ?? null,
  };
}

export class SupabaseReceiptRepository implements ReceiptRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async list(branchId: string): Promise<Result<Receipt[]>> {
    // `!inner` on memberships makes it possible to filter on the embedded
    // relation's branch_id — membership_payments itself has no branch_id
    // column (a payment belongs to a membership, which belongs to a branch).
    const { data, error } = await this.client
      .from("membership_payments")
      .select(RECEIPT_COLUMNS)
      .eq("memberships.branch_id", branchId)
      .order("payment_date", { ascending: false })
      .limit(100);

    if (error) {
      return err(domainError("LIST_RECEIPTS_FAILED", error.message));
    }
    // supabase-js's own inferred type for `data` here is unreliable (see
    // the comment above `toReceipt`) — @9thround/database-types has no
    // `Relationships` metadata for it to key off, so every embedded field
    // resolves to `any` regardless of real cardinality; casting to the
    // hand-written, correct-by-construction ReceiptRow isn't fighting a
    // real type guarantee.
    return ok((data as unknown as ReceiptRow[]).map(toReceipt));
  }

  async listByDateRange(
    branchId: string,
    startDate: string,
    endDate: string,
    filters: ReceiptFilters = {},
  ): Promise<Result<Receipt[]>> {
    let query = this.client
      .from("membership_payments")
      .select(RECEIPT_COLUMNS)
      .eq("memberships.branch_id", branchId)
      .gte("payment_date", startDate)
      .lte("payment_date", `${endDate}T23:59:59.999`);

    if (filters.programType) {
      query = query.eq("memberships.program_type", filters.programType);
    }
    if (filters.coachId) {
      query = query.eq("memberships.coach_id", filters.coachId);
    }

    const { data, error } = await query.order("payment_date", { ascending: true }).limit(1000);

    if (error) {
      return err(domainError("LIST_RECEIPTS_FAILED", error.message));
    }
    // supabase-js's own inferred type for `data` here is unreliable (see
    // the comment above `toReceipt`) — @9thround/database-types has no
    // `Relationships` metadata for it to key off, so every embedded field
    // resolves to `any` regardless of real cardinality; casting to the
    // hand-written, correct-by-construction ReceiptRow isn't fighting a
    // real type guarantee.
    return ok((data as unknown as ReceiptRow[]).map(toReceipt));
  }

  async updateDate(paymentId: string, newDate: string): Promise<Result<void>> {
    const { error } = await this.client.from("membership_payments").update({ payment_date: newDate }).eq("id", paymentId);

    if (error) {
      return err(domainError("UPDATE_RECEIPT_DATE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async delete(paymentId: string, reason: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("delete_receipt", { p_payment_id: paymentId, p_reason: reason });

    if (error) {
      return err(domainError("DELETE_RECEIPT_FAILED", error.message));
    }
    return ok(undefined);
  }
}
