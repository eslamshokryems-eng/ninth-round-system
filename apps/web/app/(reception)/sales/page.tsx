"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SalesDashboardStats } from "@9thround/sales";
import { useAuthStore } from "../../../src/features/auth/store";
import { getSalesModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";
import { SALES_ROLES } from "../../../src/lib/staff-roles";

/** Sales Dashboard (Phase 6) — real counts from `leads`/`lead_followups`, RLS-scoped: a sales_employee sees only their own numbers, branch_manager/super_admin see the whole branch. */
export default function SalesDashboardPage() {
  const role = useAuthStore((state) => state.role);
  const [stats, setStats] = useState<SalesDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getSalesModule().getSalesDashboardStats.execute();
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setStats(result.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!role || !SALES_ROLES.has(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Sales is only available to Sales, Branch Manager, and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Sales</h1>
        <div className="flex gap-3">
          <Link href="/sales/leads/new">
            <Button>+ New Lead</Button>
          </Link>
          <Link href="/sales/leads">
            <Button variant="secondary">View Leads</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-red-400">{errorMessage}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Leads" value={stats.totalLeads} />
            <StatCard label="New Today" value={stats.newLeadsToday} />
            <StatCard label="Follow-ups Due Today" value={stats.followUpsDueToday} tone="warning" />
            <StatCard label="Overdue Follow-ups" value={stats.overdueFollowUps} tone="warning" />
            <StatCard label="Converted This Month" value={stats.convertedThisMonth} />
            <StatCard label="Lost This Month" value={stats.lostThisMonth} tone="warning" />
            <StatCard label="Conversion Rate" value={`${stats.conversionRatePercent}%`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/sales/followups?tab=today">
              <Card className="transition-colors hover:border-gold/40">
                <p className="text-sm font-semibold text-ink">Today&apos;s Follow-ups</p>
                <p className="mt-1 text-xs text-muted">Leads you need to contact today.</p>
              </Card>
            </Link>
            <Link href="/sales/followups?tab=overdue">
              <Card className="transition-colors hover:border-gold/40">
                <p className="text-sm font-semibold text-ink">Overdue Follow-ups</p>
                <p className="mt-1 text-xs text-muted">Past-due follow-ups that still need attention.</p>
              </Card>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
