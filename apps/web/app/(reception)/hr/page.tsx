"use client";

import { useState } from "react";
import { useAuthStore } from "../../../src/features/auth/store";
import { AttendanceTab } from "./attendance-tab";
import { ScheduleTab } from "./schedule-tab";
import { LeaveTab } from "./leave-tab";
import { PayrollTab } from "./payroll-tab";

type Tab = "attendance" | "schedule" | "leave" | "payroll";

const TABS: { id: Tab; label: string }[] = [
  { id: "attendance", label: "Attendance" },
  { id: "schedule", label: "Schedule" },
  { id: "leave", label: "Leave Requests" },
  { id: "payroll", label: "Payroll" },
];

/** HR (attendance, schedule, leave, payroll) — one page, tabbed, per docs/phase-1/15-reception-web-app.md §15.9. */
export default function HrPage() {
  const role = useAuthStore((state) => state.role);
  const [tab, setTab] = useState<Tab>("attendance");

  const visibleTabs = TABS.filter((t) => t.id !== "payroll" || role === "super_admin");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">HR</h1>

      <div className="mb-6 flex gap-1 border-b border-white/5">
        {visibleTabs.map((t) => (
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

      {tab === "attendance" ? <AttendanceTab /> : null}
      {tab === "schedule" ? <ScheduleTab /> : null}
      {tab === "leave" ? <LeaveTab /> : null}
      {tab === "payroll" && role === "super_admin" ? <PayrollTab /> : null}
    </div>
  );
}
