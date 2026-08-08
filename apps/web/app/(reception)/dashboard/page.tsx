"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardStats } from "@9thround/reception";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Button } from "../../../src/components/ui/button";

/** The Reception Dashboard (Phase 4) — the seven headline numbers, one query, real data only. */
export default function DashboardPage() {
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
          <StatCard label="Today's Revenue" value={`${stats.dailyRevenue.toLocaleString()} EGP`} />
          <StatCard label="This Month's Revenue" value={`${stats.monthlyRevenue.toLocaleString()} EGP`} />
        </div>
      ) : null}
    </div>
  );
}
