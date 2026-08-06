import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { DashboardRepository } from "../domain/dashboard-repository";
import type { DashboardStats } from "../domain/dashboard-stats";

export class SupabaseDashboardRepository implements DashboardRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getStats(): Promise<Result<DashboardStats>> {
    const { data, error } = await this.client.from("reception_dashboard_stats").select("*").single();

    if (error) {
      return err(domainError("DASHBOARD_STATS_QUERY_FAILED", error.message));
    }

    return ok({
      activeMembers: data.active_members,
      newMembersToday: data.new_members_today,
      expiringToday: data.expiring_today,
      expiringThisWeek: data.expiring_this_week,
      expiredMemberships: data.expired_memberships,
      dailyRevenue: Number(data.daily_revenue),
      monthlyRevenue: Number(data.monthly_revenue),
    });
  }
}
