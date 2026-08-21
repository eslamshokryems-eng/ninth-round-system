"use client";

import { useState } from "react";
import { useAuthStore } from "../../../src/features/auth/store";
import { AttendanceTab } from "./attendance-tab";
import { ScheduleTab } from "./schedule-tab";
import { LeaveTab } from "./leave-tab";
import { PayrollTab } from "./payroll-tab";
import { EmployeesTab } from "./employees-tab";

type Tab = "attendance" | "schedule" | "leave" | "payroll" | "employees";

const isAdmin = (role: string | null) => role === "branch_manager" || role === "super_admin";

const TABS: { id: Tab; label: string }[] = [
  { id: "attendance", label: "Attendance" },
  { id: "schedule", label: "Schedule" },
  { id: "leave", label: "Leave Requests" },
  { id: "payroll", label: "Payroll" },
  { id: "employees", label: "Employees" },
];

/** HR (attendance, schedule, leave, payroll, employees) — one page, tabbed, per docs/phase-1/15-reception-web-app.md §15.9. */
export default function HrPage() {
  const role = useAuthStore((state) => state.role);
  const [tab, setTab] = useState<Tab>("attendance");

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "payroll") return role === "super_admin";
    if (t.id === "employees") return isAdmin(role);
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">HR</h1>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/5">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
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
      {tab === "employees" && isAdmin(role) ? <EmployeesTab /> : null}
    </div>
  );
}
