import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { RevenueReport, RevenueReportInput, RevenueReportRow } from "../domain/revenue-report";
import type { RevenueReportRepository } from "../domain/revenue-report-repository";
import type { PaymentMethod } from "../domain/registration";

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  memberships: {
    membership_types: { name: string } | null;
    members: { full_name: string } | null;
  } | null;
}

interface OtherSaleRow {
  id: string;
  created_at: string;
  total_price: number;
  payment_method: PaymentMethod;
  item_name: string;
  buyer_name: string | null;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59.999`;
}

/**
 * Aggregates two already-RLS-accessible sources (membership_payments,
 * other_sales) into one report — client-side aggregation, same pattern the
 * Receipts page already uses for its daily-income calendar (dailyTotals via
 * useMemo). No new table, view, or migration; this is a pure read.
 */
export class SupabaseRevenueReportRepository implements RevenueReportRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getReport(input: RevenueReportInput): Promise<Result<RevenueReport>> {
    const { branchId, startDate, endDate } = input;

    const [paymentsResult, otherSalesResult] = await Promise.all([
      this.client
        .from("membership_payments")
        .select(
          `id, payment_date, amount, payment_method,
           memberships!inner (branch_id, membership_types (name), members (full_name))`,
        )
        .eq("memberships.branch_id", branchId)
        .gte("payment_date", startDate)
        .lte("payment_date", endOfDay(endDate))
        .order("payment_date", { ascending: true })
        .limit(5000),
      this.client
        .from("other_sales")
        .select("id, created_at, total_price, payment_method, item_name, buyer_name")
        .eq("branch_id", branchId)
        .gte("created_at", startDate)
        .lte("created_at", endOfDay(endDate))
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);

    if (paymentsResult.error) {
      return err(domainError("REVENUE_REPORT_FAILED", paymentsResult.error.message));
    }
    if (otherSalesResult.error) {
      return err(domainError("REVENUE_REPORT_FAILED", otherSalesResult.error.message));
    }

    const payments = paymentsResult.data as unknown as PaymentRow[];
    const otherSales = otherSalesResult.data as unknown as OtherSaleRow[];

    const rows: RevenueReportRow[] = [
      ...payments.map((p) => ({
        date: p.payment_date,
        source: "membership" as const,
        description: p.memberships?.membership_types?.name ?? "Membership",
        personName: p.memberships?.members?.full_name ?? null,
        paymentMethod: p.payment_method,
        amount: Number(p.amount),
      })),
      ...otherSales.map((s) => ({
        date: s.created_at,
        source: "other_sale" as const,
        description: s.item_name,
        personName: s.buyer_name,
        paymentMethod: s.payment_method,
        amount: Number(s.total_price),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const membershipRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const otherSalesRevenue = otherSales.reduce((sum, s) => sum + Number(s.total_price), 0);

    const byPaymentMethod = new Map<string, number>();
    const byMembershipType = new Map<string, number>();
    const dailyTrend = new Map<string, number>();

    for (const row of rows) {
      byPaymentMethod.set(row.paymentMethod, (byPaymentMethod.get(row.paymentMethod) ?? 0) + row.amount);
      const dateKey = row.date.slice(0, 10);
      dailyTrend.set(dateKey, (dailyTrend.get(dateKey) ?? 0) + row.amount);
    }
    for (const p of payments) {
      const typeName = p.memberships?.membership_types?.name ?? "Unknown";
      byMembershipType.set(typeName, (byMembershipType.get(typeName) ?? 0) + Number(p.amount));
    }

    return ok({
      totalRevenue: membershipRevenue + otherSalesRevenue,
      membershipRevenue,
      otherSalesRevenue,
      byPaymentMethod: [...byPaymentMethod.entries()].map(([label, total]) => ({ label, total })),
      byMembershipType: [...byMembershipType.entries()].map(([label, total]) => ({ label, total })),
      dailyTrend: [...dailyTrend.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
      rows,
    });
  }
}
