import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { SalesDashboardRepository } from "../domain/sales-dashboard-repository";
import type { SalesDashboardStats } from "../domain/sales-dashboard-stats";

function startOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfNextDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function startOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

/**
 * Plain count() queries against `leads`/`lead_followups`, scoped by RLS
 * exactly like every list already is — not a SQL view (unlike the
 * Reception Dashboard's `reception_dashboard_stats`), since this is a
 * handful of independent counts, not one wide aggregate row.
 */
export class SupabaseSalesDashboardRepository implements SalesDashboardRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getStats(): Promise<Result<SalesDashboardStats>> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);

    const [total, newToday, dueToday, overdue, converted, lost] = await Promise.all([
      this.client.from("leads").select("id", { count: "exact", head: true }),
      this.client.from("leads").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
      this.client
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("due_at", todayStart)
        .lt("due_at", startOfNextDay(now)),
      this.client
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("due_at", todayStart),
      this.client
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "converted")
        .gte("converted_at", monthStart),
      this.client
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "lost")
        .gte("lost_at", monthStart),
    ]);

    const firstError = [total, newToday, dueToday, overdue, converted, lost].find((r) => r.error)?.error;
    if (firstError) {
      return err(domainError("SALES_DASHBOARD_STATS_FAILED", firstError.message));
    }

    const convertedThisMonth = converted.count ?? 0;
    const lostThisMonth = lost.count ?? 0;
    const decided = convertedThisMonth + lostThisMonth;

    return ok({
      totalLeads: total.count ?? 0,
      newLeadsToday: newToday.count ?? 0,
      followUpsDueToday: dueToday.count ?? 0,
      overdueFollowUps: overdue.count ?? 0,
      convertedThisMonth,
      lostThisMonth,
      conversionRatePercent: decided === 0 ? 0 : Math.round((convertedThisMonth / decided) * 100),
    });
  }
}
