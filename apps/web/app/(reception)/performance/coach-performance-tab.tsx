"use client";

import { useCallback, useEffect, useState } from "react";
import type { PerformanceRow, PerformanceTarget, ProgramType } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { exportToExcel } from "../../../src/lib/export-xlsx";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { SelectField } from "../../../src/components/ui/select-field";
import { StaffPicker } from "../../../src/components/staff-picker";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { monthRange } from "../../../src/components/receipts-calendar";
import { achievementPercent, formatEGP, targetTotalsByStaff } from "./shared";

const PROGRAM_TYPES: { value: ProgramType; label: string }[] = [
  { value: "ninth_round", label: "9th Round" },
  { value: "boxing", label: "Boxing" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "mma", label: "MMA" },
];

const today = new Date();

/**
 * Revenue attributed via memberships.coach_id — whose program the member
 * trains in. Same server-aggregated, double-payment-safe rollup as Sales
 * Performance (get_coach_performance()), grouped by coach instead of by
 * seller — a coach can train a member without having sold them anything,
 * and vice versa, so these are always reported separately.
 */
export function CoachPerformanceTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [staffFilter, setStaffFilter] = useState<StaffCandidate | null>(null);
  const [programType, setProgramType] = useState<ProgramType | "">("");
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const reception = getReceptionModule();
    const [rowsResult, targetsResult] = await Promise.all([
      reception.getCoachPerformance.execute({
        branchId,
        ...range,
        staffId: staffFilter?.profileId ?? null,
        programType: programType || null,
      }),
      reception.listPerformanceTargets.execute({ branchId, category: "coach", ...range }),
    ]);
    setIsLoading(false);
    if (rowsResult.isErr) {
      setErrorMessage(translateErrorCode(rowsResult.error.code));
      return;
    }
    setRows(rowsResult.value);
    setTargets(targetsResult.isOk ? targetsResult.value : []);
  }, [branchId, range, staffFilter, programType]);

  useEffect(() => {
    void load();
  }, [load]);

  const targetsByStaff = targetTotalsByStaff(targets);
  const totalCollected = rows.reduce((sum, r) => sum + r.collectedRevenue, 0);
  const totalNet = rows.reduce((sum, r) => sum + r.netRevenue, 0);
  const totalTransactions = rows.reduce((sum, r) => sum + r.transactionCount, 0);
  const aboveTargetCount = rows.filter((r) => {
    const pct = achievementPercent(r.collectedRevenue, targetsByStaff.get(r.staffId));
    return pct !== null && pct >= 100;
  }).length;

  const expandedRow = rows.find((r) => r.staffId === expandedStaffId) ?? null;

  function handleExport() {
    exportToExcel(`coach-performance-${range.startDate}-to-${range.endDate}.xlsx`, [
      {
        name: "Coach Performance",
        rows: rows.map((r) => {
          const target = targetsByStaff.get(r.staffId);
          const pct = achievementPercent(r.collectedRevenue, target);
          return {
            Coach: r.staffName,
            Transactions: r.transactionCount,
            "Gross Revenue (EGP)": r.grossRevenue,
            "Discount (EGP)": r.discountTotal,
            "Net Revenue (EGP)": r.netRevenue,
            "Collected Revenue (EGP)": r.collectedRevenue,
            "Target (EGP)": target ?? 0,
            "Achievement %": pct ?? "—",
          };
        }),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="w-56">
            <StaffPicker selected={staffFilter} onSelect={setStaffFilter} roleFilter="coach" label="Coach" />
          </div>
          <div className="w-40">
            <SelectField
              label="Program"
              value={programType}
              onChange={(e) => setProgramType(e.target.value as ProgramType | "")}
            >
              <option value="">All Programs</option>
              {PROGRAM_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>
          Export to Excel
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Collected Revenue" value={formatEGP(totalCollected)} />
            <StatCard label="Net Revenue" value={formatEGP(totalNet)} />
            <StatCard label="Transactions" value={totalTransactions} />
            <StatCard label="Coaches Above Target" value={`${aboveTargetCount} / ${rows.length}`} />
          </div>

          {expandedRow ? (
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{expandedRow.staffName} — Detail</h2>
                <button type="button" onClick={() => setExpandedStaffId(null)} className="text-xs text-gold hover:text-gold-soft">
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <StatCard label="Collected Revenue" value={formatEGP(expandedRow.collectedRevenue)} />
                <StatCard label="Net Revenue" value={formatEGP(expandedRow.netRevenue)} />
                <StatCard label="Gross Revenue" value={formatEGP(expandedRow.grossRevenue)} />
                <StatCard label="Discounts Given" value={formatEGP(expandedRow.discountTotal)} />
                <StatCard label="Transactions" value={expandedRow.transactionCount} />
                <StatCard
                  label="Target Achievement"
                  value={
                    achievementPercent(expandedRow.collectedRevenue, targetsByStaff.get(expandedRow.staffId)) !== null
                      ? `${achievementPercent(expandedRow.collectedRevenue, targetsByStaff.get(expandedRow.staffId))}%`
                      : "No target set"
                  }
                />
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Coach Performance ({rows.length})</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">No attributed coach revenue in this range.</p>
            ) : (
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Coach</th>
                      <th className="px-4 py-3 text-right">Transactions</th>
                      <th className="px-4 py-3 text-right">Net Revenue</th>
                      <th className="px-4 py-3 text-right">Collected</th>
                      <th className="px-4 py-3 text-right">Target</th>
                      <th className="px-4 py-3 text-right">Achievement</th>
                      <th className="px-4 py-3 text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const target = targetsByStaff.get(row.staffId);
                      const pct = achievementPercent(row.collectedRevenue, target);
                      const remaining = target ? Math.max(target - row.collectedRevenue, 0) : null;
                      return (
                        <tr
                          key={row.staffId}
                          onClick={() => setExpandedStaffId((current) => (current === row.staffId ? null : row.staffId))}
                          className="cursor-pointer border-t border-white/5 hover:bg-white/[0.04]"
                        >
                          <td className="px-4 py-3 text-ink">{row.staffName}</td>
                          <td className="px-4 py-3 text-right text-muted">{row.transactionCount}</td>
                          <td className="px-4 py-3 text-right text-muted">{row.netRevenue.toLocaleString()} EGP</td>
                          <td className="px-4 py-3 text-right font-medium text-gold">{row.collectedRevenue.toLocaleString()} EGP</td>
                          <td className="px-4 py-3 text-right text-muted">{target ? `${target.toLocaleString()} EGP` : "—"}</td>
                          <td className="px-4 py-3 text-right text-muted">{pct !== null ? `${pct}%` : "—"}</td>
                          <td className="px-4 py-3 text-right text-muted">{remaining !== null ? `${remaining.toLocaleString()} EGP` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
