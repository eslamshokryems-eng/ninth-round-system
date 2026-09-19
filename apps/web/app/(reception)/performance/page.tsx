"use client";

import { useState } from "react";
import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";
import { SalesPerformanceTab } from "./sales-performance-tab";
import { CoachPerformanceTab } from "./coach-performance-tab";
import { TargetsTab } from "./targets-tab";

type Tab = "sales" | "coach" | "targets";

const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Sales Performance" },
  { id: "coach", label: "Coach Performance" },
  { id: "targets", label: "Targets" },
];

/**
 * Sales & Coaching Performance — revenue already attributed via
 * memberships.sold_by/coach_id, rolled up server-side and measured against
 * targets. Branch Manager/Super Admin only, same money-visibility boundary
 * as Reports/Receipts/Payroll.
 */
export default function PerformancePage() {
  const role = useAuthStore((state) => state.role);
  const [tab, setTab] = useState<Tab>("sales");

  if (role !== "branch_manager" && role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Performance is only available to Branch Manager and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Performance</h1>

      <div className="mb-6 flex gap-1 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "border-b-2 border-gold text-gold" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sales" ? <SalesPerformanceTab /> : null}
      {tab === "coach" ? <CoachPerformanceTab /> : null}
      {tab === "targets" ? <TargetsTab /> : null}
    </div>
  );
}
