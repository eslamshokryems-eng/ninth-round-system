import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { SalesReport, SalesReportInput, SalesReportRow, SalespersonPerformance } from "../domain/sales-report";
import type { SalesReportRepository } from "../domain/sales-report-repository";

interface LeadRow {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  source: string;
  created_at: string;
  assigned: { full_name: string | null } | null;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59.999`;
}

/**
 * Cohort framing: every lead CREATED within the range, and — among those
 * same leads — how many have since converted or been lost (a lead created
 * near the end of the range may not be decided yet, which is expected).
 * Pure read over `leads`, already RLS-accessible to branch_manager/
 * super_admin (can_manage_leads()) — no new migration.
 */
export class SupabaseSalesReportRepository implements SalesReportRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getReport(input: SalesReportInput): Promise<Result<SalesReport>> {
    const { branchId, startDate, endDate } = input;

    const { data, error } = await this.client
      .from("leads")
      .select(`id, full_name, phone, status, source, created_at, assigned:profiles!leads_assigned_to_fkey (full_name)`)
      .eq("branch_id", branchId)
      .gte("created_at", startDate)
      .lte("created_at", endOfDay(endDate))
      .order("created_at", { ascending: true })
      .limit(5000);

    if (error) {
      return err(domainError("SALES_REPORT_FAILED", error.message));
    }

    const leads = data as unknown as LeadRow[];

    const rows: SalesReportRow[] = leads.map((l) => ({
      leadId: l.id,
      fullName: l.full_name,
      phone: l.phone,
      status: l.status,
      source: l.source,
      assignedToName: l.assigned?.full_name ?? null,
      createdAt: l.created_at,
    }));

    const convertedCount = rows.filter((r) => r.status === "converted").length;
    const lostCount = rows.filter((r) => r.status === "lost").length;
    const decided = convertedCount + lostCount;

    const bySource = new Map<string, number>();
    for (const row of rows) {
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    }

    const bySalespersonMap = new Map<string, { assigned: number; converted: number; lost: number }>();
    for (const row of rows) {
      const name = row.assignedToName ?? "Unassigned";
      const entry = bySalespersonMap.get(name) ?? { assigned: 0, converted: 0, lost: 0 };
      entry.assigned += 1;
      if (row.status === "converted") entry.converted += 1;
      if (row.status === "lost") entry.lost += 1;
      bySalespersonMap.set(name, entry);
    }
    const bySalesperson: SalespersonPerformance[] = [...bySalespersonMap.entries()].map(([salespersonName, stats]) => {
      const personDecided = stats.converted + stats.lost;
      return {
        salespersonName,
        assigned: stats.assigned,
        converted: stats.converted,
        lost: stats.lost,
        conversionRatePercent: personDecided === 0 ? 0 : Math.round((stats.converted / personDecided) * 100),
      };
    });

    return ok({
      totalLeadsCreated: rows.length,
      convertedCount,
      lostCount,
      conversionRatePercent: decided === 0 ? 0 : Math.round((convertedCount / decided) * 100),
      bySource: [...bySource.entries()].map(([label, count]) => ({ label, count })),
      bySalesperson,
      rows,
    });
  }
}
