"use client";

import { useState } from "react";
import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";
import { RevenueTab } from "./revenue-tab";
import { MembershipsTab } from "./memberships-tab";
import { SalesTab } from "./sales-tab";

type Tab = "revenue" | "memberships" | "sales";

const TABS: { id: Tab; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "memberships", label: "Memberships" },
  { id: "sales", label: "Sales" },
];

/**
 * Reports — real data, date-range filtered, exportable to Excel. Branch
 * Manager/Super Admin only, matching every other financial page (Receipts,
 * Payroll, Dashboard's revenue cards) — Reports mixes membership revenue
 * and sales-team performance, both money-adjacent data Reception/Sales
 * Employee accounts don't see elsewhere either.
 */
export default function ReportsPage() {
  const role = useAuthStore((state) => state.role);
  const [tab, setTab] = useState<Tab>("revenue");

  if (role !== "branch_manager" && role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Reports are only available to Branch Manager and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Reports</h1>

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

      {tab === "revenue" ? <RevenueTab /> : null}
      {tab === "memberships" ? <MembershipsTab /> : null}
      {tab === "sales" ? <SalesTab /> : null}
    </div>
  );
}
