"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardStats } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Button } from "../../../src/components/ui/button";

const canSeeRevenue = (role: string | null) => role === "branch_manager" || role === "super_admin";

/**
 * The Dashboard (Phase 4). Revenue figures are restricted to
 * branch_manager/super_admin — same "owner sees money, front desk doesn't"
 * split already established for Payroll (§15.9) — Reception/Sales
 * Employee see the operational counts (active/new/expiring/expired) only,
 * never daily/monthly revenue. One page, not a separate route: the
 * underlying query is identical, only which cards render differs.
 */
export default function DashboardPage() {
  const role = useAuthStore((state) => state.role);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().getDashboardStats.execute();
    if (result.isErr) {
      setErrorMessage("Could not load dashboard data.");
    } else {
      setStats(result.value);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Dashboard</h1>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-red-400">{errorMessage}</p>
          <Button variant="secondary" onClick={() => void loadStats()}>
            Retry
          </Button>
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active Members" value={stats.activeMembers} />
          <StatCard label="New Members Today" value={stats.newMembersToday} />
          <StatCard label="Expiring Today" value={stats.expiringToday} tone="warning" />
          <StatCard label="Expiring This Week" value={stats.expiringThisWeek} tone="warning" />
          <StatCard label="Expired Members" value={stats.expiredMemberships} tone="warning" />
          {canSeeRevenue(role) ? (
            <>
              <StatCard label="Today's Revenue" value={`${stats.dailyRevenue.toLocaleString()} EGP`} />
              <StatCard label="This Month's Revenue" value={`${stats.monthlyRevenue.toLocaleString()} EGP`} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
