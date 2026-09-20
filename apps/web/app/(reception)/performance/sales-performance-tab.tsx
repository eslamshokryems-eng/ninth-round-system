"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerformanceRow, PerformanceTarget, ProgramType, SalesByProgramEntry, SalesTransaction } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { exportToExcel, exportToCsv } from "../../../src/lib/export-xlsx";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { SelectField } from "../../../src/components/ui/select-field";
import { TextField } from "../../../src/components/ui/text-field";
import { StaffPicker } from "../../../src/components/staff-picker";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { RevenueTrendChart } from "../../../src/components/revenue-trend-chart";
import { DonutChart } from "../../../src/components/donut-chart";
import { monthRange } from "../../../src/components/receipts-calendar";
import {
  achievementPercent,
  achievementTone,
  formatEGP,
  percentChange,
  previousPeriod,
  programColor,
  programLabel,
  targetTotalsByStaff,
} from "./shared";

const PROGRAM_TYPES: { value: ProgramType; label: string }[] = [
  { value: "ninth_round", label: "9th Round" },
  { value: "boxing", label: "Boxing" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "mma", label: "MMA" },
];

type SortKey = "revenue" | "target" | "achievement" | "memberships" | "avgSale";

interface EnrichedRow extends PerformanceRow {
  target: number | undefined;
  achievement: number | null;
  avgSale: number;
}

const today = new Date();

function deltaLabel(pct: number | null): { text: string; tone: string } | null {
  if (pct === null) return null;
  const tone = pct >= 0 ? "text-green-400" : "text-red-400";
  const arrow = pct >= 0 ? "↑" : "↓";
  return { text: `${arrow} ${Math.abs(pct)}% vs previous period`, tone };
}

/**
 * Sales Performance — revenue attributed via memberships.sold_by
 * (get_sales_performance/get_sales_daily_trend/get_sales_by_program/
 * get_sales_transactions, all server-aggregated, double-payment safe).
 * Red-accented per the 9th Round brand reference for this dashboard
 * specifically; Coach Performance/Targets keep the app's usual gold —
 * this tab isn't a global theme change.
 */
export function SalesPerformanceTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [staffFilter, setStaffFilter] = useState<StaffCandidate | null>(null);
  const [programType, setProgramType] = useState<ProgramType | "">("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDesc, setSortDesc] = useState(true);

  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [prevRows, setPrevRows] = useState<PerformanceRow[]>([]);
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
  const [dailyTrend, setDailyTrend] = useState<{ date: string; total: number }[]>([]);
  const [byProgram, setByProgram] = useState<SalesByProgramEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<SalesTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [employeeProgramMix, setEmployeeProgramMix] = useState<SalesByProgramEntry[]>([]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const reception = getReceptionModule();
    const input = {
      branchId,
      ...range,
      staffId: staffFilter?.profileId ?? null,
      programType: programType || null,
    };
    const [rowsResult, prevRowsResult, targetsResult, trendResult, byProgramResult] = await Promise.all([
      reception.getSalesPerformance.execute(input),
      reception.getSalesPerformance.execute({ ...input, ...previousPeriod(range) }),
      reception.listPerformanceTargets.execute({ branchId, category: "sales", ...range }),
      reception.getSalesDailyTrend.execute(input),
      reception.getSalesByProgram.execute(input),
    ]);
    setIsLoading(false);
    if (rowsResult.isErr) {
      setErrorMessage(translateErrorCode(rowsResult.error.code));
      return;
    }
    setRows(rowsResult.value);
    setPrevRows(prevRowsResult.isOk ? prevRowsResult.value : []);
    setTargets(targetsResult.isOk ? targetsResult.value : []);
    setDailyTrend(trendResult.isOk ? trendResult.value.map((p) => ({ date: p.date, total: p.collectedRevenue })) : []);
    setByProgram(byProgramResult.isOk ? byProgramResult.value : []);
  }, [branchId, range, staffFilter, programType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!expandedStaffId || !branchId) {
      setTransactions([]);
      setEmployeeProgramMix([]);
      return;
    }
    void (async () => {
      setIsLoadingTransactions(true);
      const reception = getReceptionModule();
      const [txResult, mixResult] = await Promise.all([
        reception.getSalesTransactions.execute({
          branchId,
          ...range,
          staffId: expandedStaffId,
          programType: programType || null,
        }),
        reception.getSalesByProgram.execute({ branchId, ...range, staffId: expandedStaffId }),
      ]);
      setIsLoadingTransactions(false);
      setTransactions(txResult.isOk ? txResult.value : []);
      setEmployeeProgramMix(mixResult.isOk ? mixResult.value : []);
    })();
  }, [expandedStaffId, branchId, range, programType]);

  const targetsByStaff = targetTotalsByStaff(targets);

  const enrichedRows: EnrichedRow[] = useMemo(
    () =>
      rows.map((row) => {
        const target = targetsByStaff.get(row.staffId);
        return {
          ...row,
          target,
          achievement: achievementPercent(row.collectedRevenue, target),
          avgSale: row.transactionCount > 0 ? row.collectedRevenue / row.transactionCount : 0,
        };
      }),
    [rows, targetsByStaff],
  );

  const visibleRows = useMemo(() => {
    const filtered = search.trim()
      ? enrichedRows.filter((r) => r.staffName.toLowerCase().includes(search.trim().toLowerCase()))
      : enrichedRows;
    const sorted = [...filtered].sort((a, b) => {
      const key: Record<SortKey, number> = {
        revenue: a.collectedRevenue - b.collectedRevenue,
        target: (a.target ?? 0) - (b.target ?? 0),
        achievement: (a.achievement ?? -1) - (b.achievement ?? -1),
        memberships: a.transactionCount - b.transactionCount,
        avgSale: a.avgSale - b.avgSale,
      };
      return sortDesc ? -key[sortKey] : key[sortKey];
    });
    return sorted;
  }, [enrichedRows, search, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const totalCollected = rows.reduce((sum, r) => sum + r.collectedRevenue, 0);
  const totalMemberships = rows.reduce((sum, r) => sum + r.transactionCount, 0);
  const avgSaleValue = totalMemberships > 0 ? totalCollected / totalMemberships : 0;
  const totalTarget = [...targetsByStaff.values()].reduce((sum, v) => sum + v, 0);
  const totalAchievement = achievementPercent(totalCollected, totalTarget);

  const prevTotalCollected = prevRows.reduce((sum, r) => sum + r.collectedRevenue, 0);
  const prevTotalMemberships = prevRows.reduce((sum, r) => sum + r.transactionCount, 0);
  const prevAvgSaleValue = prevTotalMemberships > 0 ? prevTotalCollected / prevTotalMemberships : 0;

  const revenueDelta = deltaLabel(percentChange(totalCollected, prevTotalCollected));
  const membershipsDelta = deltaLabel(percentChange(totalMemberships, prevTotalMemberships));
  const avgSaleDelta = deltaLabel(percentChange(avgSaleValue, prevAvgSaleValue));

  const programEntries = byProgram.map((entry) => ({
    label: programLabel(entry.programType),
    value: entry.collectedRevenue,
    color: programColor(entry.programType),
    count: entry.membershipCount,
  }));
  const programTotal = programEntries.reduce((sum, e) => sum + e.value, 0);
  const topPrograms = [...programEntries].sort((a, b) => b.value - a.value);
  const maxProgramValue = Math.max(1, ...topPrograms.map((p) => p.value));

  const expandedRow = enrichedRows.find((r) => r.staffId === expandedStaffId) ?? null;

  function buildExportRows() {
    return visibleRows.map((r, i) => ({
      "#": i + 1,
      "Sales Person": r.staffName,
      "Target (EGP)": r.target ?? 0,
      "Revenue (EGP)": r.collectedRevenue,
      Memberships: r.transactionCount,
      "Avg Sale (EGP)": Math.round(r.avgSale),
      "Achievement %": r.achievement ?? "No target assigned",
    }));
  }

  function handleExportExcel() {
    exportToExcel(`sales-performance-${range.startDate}-to-${range.endDate}.xlsx`, [
      { name: "Sales Performance", rows: buildExportRows() },
    ]);
  }

  function handleExportCsv() {
    exportToCsv(`sales-performance-${range.startDate}-to-${range.endDate}.csv`, buildExportRows());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-muted">Track your team&apos;s sales, targets and membership breakdown.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} disabled={rows.length === 0}>
            Export Excel
          </Button>
          <Button variant="secondary" onClick={() => window.print()} disabled={rows.length === 0}>
            Print
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card border border-white/5 bg-surface" />
          ))}
        </div>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Sales Revenue" value={formatEGP(totalCollected)} {...(revenueDelta ? { hint: revenueDelta.text } : {})} />
            <StatCard
              label="Total Memberships Sold"
              value={totalMemberships}
              {...(membershipsDelta ? { hint: membershipsDelta.text } : {})}
            />
            <StatCard
              label="Average Sale Value"
              value={formatEGP(Math.round(avgSaleValue))}
              {...(avgSaleDelta ? { hint: avgSaleDelta.text } : {})}
            />
            <div className="flex-1 rounded-card border border-white/5 bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Target Achievement</p>
              {totalTarget > 0 ? (
                <>
                  <p className="mt-2 text-3xl font-semibold text-red-500">{totalAchievement}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-red-500"
                      style={{ width: `${Math.min(totalAchievement ?? 0, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatEGP(totalCollected)} / {formatEGP(totalTarget)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">No target assigned for this period.</p>
              )}
            </div>
          </div>

          <Card className="space-y-3">
            <details className="sm:hidden" open>
              <summary className="cursor-pointer text-xs font-medium text-muted">Filters</summary>
            </details>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <DateRangePicker value={range} onChange={setRange} />
              </div>
              <SelectField label="Branch" value="all" disabled>
                <option value="all">All Branches</option>
              </SelectField>
              <SelectField label="Program" value={programType} onChange={(e) => setProgramType(e.target.value as ProgramType | "")}>
                <option value="">All Programs</option>
                {PROGRAM_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
              <StaffPicker selected={staffFilter} onSelect={setStaffFilter} label="Sales Person" />
            </div>
            {staffFilter || programType ? (
              <Button
                variant="ghost"
                className="!px-3 !py-1 text-xs"
                onClick={() => {
                  setStaffFilter(null);
                  setProgramType("");
                }}
              >
                Clear Filters
              </Button>
            ) : null}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">Sales Revenue Trend</h2>
              <RevenueTrendChart points={dailyTrend} color="#EF4444" />
            </Card>
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">Sales by Program Type</h2>
              <DonutChart entries={programEntries} centerLabel="Total" formatValue={formatEGP} />
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Sales Performance by Employee</h2>
              <TextField
                label=""
                aria-label="Search sales person"
                placeholder="Search sales person…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 !py-1.5"
              />
            </div>
            {visibleRows.length === 0 ? (
              <p className="text-sm text-muted">No sales found for the selected filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Sales Person</th>
                      <SortableHeader label="Target" active={sortKey === "target"} desc={sortDesc} onClick={() => toggleSort("target")} />
                      <SortableHeader label="Revenue" active={sortKey === "revenue"} desc={sortDesc} onClick={() => toggleSort("revenue")} />
                      <SortableHeader
                        label="Memberships"
                        active={sortKey === "memberships"}
                        desc={sortDesc}
                        onClick={() => toggleSort("memberships")}
                      />
                      <SortableHeader label="Avg. Sale" active={sortKey === "avgSale"} desc={sortDesc} onClick={() => toggleSort("avgSale")} />
                      <SortableHeader
                        label="Achievement"
                        active={sortKey === "achievement"}
                        desc={sortDesc}
                        onClick={() => toggleSort("achievement")}
                      />
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, i) => {
                      const tone = achievementTone(row.achievement);
                      return (
                        <tr key={row.staffId} className="border-t border-white/5">
                          <td className="px-4 py-3 text-muted">{i + 1}</td>
                          <td className="px-4 py-3 text-ink">{row.staffName}</td>
                          <td className="px-4 py-3 text-muted">{row.target ? formatEGP(row.target) : "—"}</td>
                          <td className="px-4 py-3 font-medium text-ink">{formatEGP(row.collectedRevenue)}</td>
                          <td className="px-4 py-3 text-muted">{row.transactionCount}</td>
                          <td className="px-4 py-3 text-muted">{formatEGP(Math.round(row.avgSale))}</td>
                          <td className="px-4 py-3">
                            {row.achievement !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 rounded-full bg-white/10">
                                  <div className={`h-1.5 rounded-full ${tone.bar}`} style={{ width: `${Math.min(row.achievement, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-medium ${tone.text}`}>{row.achievement}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted">No target assigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedStaffId((current) => (current === row.staffId ? null : row.staffId))}
                              className="text-xs font-medium text-red-400 hover:text-red-300"
                            >
                              {expandedStaffId === row.staffId ? "Hide Detail" : "View Detail"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10 font-semibold text-ink">
                      <td className="px-4 py-3" colSpan={2}>
                        Total
                      </td>
                      <td className="px-4 py-3">{formatEGP(totalTarget)}</td>
                      <td className="px-4 py-3">{formatEGP(totalCollected)}</td>
                      <td className="px-4 py-3">{totalMemberships}</td>
                      <td className="px-4 py-3">{formatEGP(Math.round(avgSaleValue))}</td>
                      <td className="px-4 py-3" colSpan={2}>
                        {totalAchievement !== null ? `${totalAchievement}%` : "No target assigned"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {expandedRow ? (
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{expandedRow.staffName} — Employee Detail</h2>
                <button type="button" onClick={() => setExpandedStaffId(null)} className="text-xs text-red-400 hover:text-red-300">
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <StatCard label="Target" value={expandedRow.target ? formatEGP(expandedRow.target) : "—"} />
                <StatCard label="Revenue" value={formatEGP(expandedRow.collectedRevenue)} />
                <StatCard
                  label="Achievement"
                  value={expandedRow.achievement !== null ? `${expandedRow.achievement}%` : "No target assigned"}
                />
                <StatCard label="Memberships Sold" value={expandedRow.transactionCount} />
                <StatCard label="Average Sale" value={formatEGP(Math.round(expandedRow.avgSale))} />
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase text-muted">Sales by Membership Type</h3>
                {isLoadingTransactions ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : (
                  <DonutChart
                    entries={employeeProgramMix.map((e) => ({
                      label: programLabel(e.programType),
                      value: e.collectedRevenue,
                      color: programColor(e.programType),
                    }))}
                    centerLabel="Total"
                    formatValue={formatEGP}
                  />
                )}
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase text-muted">Transactions ({transactions.length})</h3>
                {isLoadingTransactions ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : transactions.length === 0 ? (
                  <p className="text-sm text-muted">No sales found for the selected filters.</p>
                ) : (
                  <div className="max-h-96 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Member</th>
                          <th className="px-4 py-3">Membership</th>
                          <th className="px-4 py-3">Program</th>
                          <th className="px-4 py-3 text-right">Original Price</th>
                          <th className="px-4 py-3 text-right">Discount</th>
                          <th className="px-4 py-3 text-right">Final Price</th>
                          <th className="px-4 py-3 text-right">Collected</th>
                          <th className="px-4 py-3">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.paymentId} className="border-t border-white/5">
                            <td className="px-4 py-3 text-muted">{tx.paymentDate}</td>
                            <td className="px-4 py-3 text-ink">{tx.memberFullName}</td>
                            <td className="px-4 py-3 text-muted">{tx.membershipNumber}</td>
                            <td className="px-4 py-3 text-muted">{programLabel(tx.programType)}</td>
                            <td className="px-4 py-3 text-right text-muted">{tx.price.toLocaleString()} EGP</td>
                            <td className="px-4 py-3 text-right text-muted">{tx.discount.toLocaleString()} EGP</td>
                            <td className="px-4 py-3 text-right text-muted">{tx.finalPrice.toLocaleString()} EGP</td>
                            <td className="px-4 py-3 text-right font-medium text-red-400">{tx.collectedAmount.toLocaleString()} EGP</td>
                            <td className="px-4 py-3 text-muted">{tx.receiptNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">Membership Type Breakdown</h2>
              {programEntries.length === 0 ? (
                <p className="text-sm text-muted">No sales found for the selected filters.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-2">Program Type</th>
                      <th className="px-4 py-2 text-right">Sold</th>
                      <th className="px-4 py-2 text-right">Revenue</th>
                      <th className="px-4 py-2 text-right">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProgram.map((entry) => (
                      <tr key={entry.programType ?? "other"} className="border-t border-white/5">
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-2 text-ink">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: programColor(entry.programType) }} />
                            {programLabel(entry.programType)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-muted">{entry.membershipCount}</td>
                        <td className="px-4 py-2 text-right text-muted">{formatEGP(entry.collectedRevenue)}</td>
                        <td className="px-4 py-2 text-right text-muted">
                          {programTotal > 0 ? `${Math.round((entry.collectedRevenue / programTotal) * 1000) / 10}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">Top Performing Programs</h2>
              {topPrograms.length === 0 ? (
                <p className="text-sm text-muted">No sales found for the selected filters.</p>
              ) : (
                <div className="space-y-2.5">
                  {topPrograms.map((program) => (
                    <div key={program.label} className="flex items-center gap-3">
                      <span className="w-28 flex-shrink-0 truncate text-xs text-muted">{program.label}</span>
                      <div className="h-2 flex-1 rounded-full bg-white/5">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${(program.value / maxProgramValue) * 100}%`, backgroundColor: program.color }}
                        />
                      </div>
                      <span className="w-24 flex-shrink-0 text-right text-xs font-medium text-ink">{formatEGP(program.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SortableHeader({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  return (
    <th className="px-4 py-3">
      <button type="button" onClick={onClick} className={`flex items-center gap-1 ${active ? "text-red-400" : "hover:text-ink"}`}>
        {label}
        {active ? <span>{desc ? "↓" : "↑"}</span> : null}
      </button>
    </th>
  );
}
