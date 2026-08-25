"use client";

import { useCallback, useEffect, useState } from "react";
import type { RevenueReport } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { exportToExcel } from "../../../src/lib/export-xlsx";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { BreakdownBars } from "../../../src/components/breakdown-bars";
import { RevenueTrendChart } from "../../../src/components/revenue-trend-chart";
import { monthRange } from "../../../src/components/receipts-calendar";

const today = new Date();

export function RevenueTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().getRevenueReport.execute({ branchId, ...range });
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setReport(result.value);
  }, [branchId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExport() {
    if (!report) return;
    exportToExcel(`revenue-report-${range.startDate}-to-${range.endDate}.xlsx`, [
      {
        name: "Summary",
        rows: [
          { Metric: "Total Revenue", Value: report.totalRevenue },
          { Metric: "Membership Revenue", Value: report.membershipRevenue },
          { Metric: "Other Sales Revenue", Value: report.otherSalesRevenue },
          ...report.byPaymentMethod.map((e) => ({ Metric: `Payment Method: ${e.label}`, Value: e.total })),
          ...report.byMembershipType.map((e) => ({ Metric: `Membership Type: ${e.label}`, Value: e.total })),
        ],
      },
      {
        name: "Transactions",
        rows: report.rows.map((r) => ({
          Date: r.date,
          Source: r.source === "membership" ? "Membership" : "Other Sale",
          Description: r.description,
          Person: r.personName ?? "—",
          "Payment Method": r.paymentMethod,
          "Amount (EGP)": r.amount,
        })),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="secondary" onClick={handleExport} disabled={!report}>
          Export to Excel
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Total Revenue" value={`${report.totalRevenue.toLocaleString()} EGP`} />
            <StatCard label="Membership Revenue" value={`${report.membershipRevenue.toLocaleString()} EGP`} />
            <StatCard label="Other Sales Revenue" value={`${report.otherSalesRevenue.toLocaleString()} EGP`} />
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Daily Revenue</h2>
            <RevenueTrendChart points={report.dailyTrend} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Payment Method</h2>
              <BreakdownBars entries={report.byPaymentMethod.map((e) => ({ label: e.label, value: e.total }))} formatValue={(v) => `${v.toLocaleString()} EGP`} />
            </Card>
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Membership Type</h2>
              <BreakdownBars entries={report.byMembershipType.map((e) => ({ label: e.label, value: e.total }))} formatValue={(v) => `${v.toLocaleString()} EGP`} />
            </Card>
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Transactions ({report.rows.length})</h2>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted">No transactions in this range.</p>
            ) : (
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Person</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="px-4 py-3 text-muted">{row.date.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-ink">{row.description}</td>
                        <td className="px-4 py-3 text-muted">{row.personName ?? "—"}</td>
                        <td className="px-4 py-3 capitalize text-muted">{row.paymentMethod.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-right font-medium text-gold">{row.amount.toLocaleString()} EGP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
