"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalesReport } from "@9thround/sales";
import { useAuthStore } from "../../../src/features/auth/store";
import { getSalesModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { exportToExcel } from "../../../src/lib/export-xlsx";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { BreakdownBars } from "../../../src/components/breakdown-bars";
import { monthRange } from "../../../src/components/receipts-calendar";

const today = new Date();

export function SalesTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getSalesModule().getSalesReport.execute({ branchId, ...range });
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
    exportToExcel(`sales-report-${range.startDate}-to-${range.endDate}.xlsx`, [
      {
        name: "Summary",
        rows: [
          { Metric: "Leads Created", Value: report.totalLeadsCreated },
          { Metric: "Converted", Value: report.convertedCount },
          { Metric: "Lost", Value: report.lostCount },
          { Metric: "Conversion Rate (%)", Value: report.conversionRatePercent },
          ...report.bySource.map((e) => ({ Metric: `Source: ${e.label}`, Value: e.count })),
        ],
      },
      {
        name: "By Salesperson",
        rows: report.bySalesperson.map((p) => ({
          Salesperson: p.salespersonName,
          Assigned: p.assigned,
          Converted: p.converted,
          Lost: p.lost,
          "Conversion Rate (%)": p.conversionRatePercent,
        })),
      },
      {
        name: "Leads",
        rows: report.rows.map((r) => ({
          Name: r.fullName,
          Phone: r.phone,
          Status: r.status,
          Source: r.source,
          "Assigned To": r.assignedToName ?? "Unassigned",
          "Created At": r.createdAt.slice(0, 10),
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Leads Created" value={report.totalLeadsCreated} />
            <StatCard label="Converted" value={report.convertedCount} />
            <StatCard label="Lost" value={report.lostCount} tone="warning" />
            <StatCard label="Conversion Rate" value={`${report.conversionRatePercent}%`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Source</h2>
              <BreakdownBars entries={report.bySource.map((e) => ({ label: e.label, value: e.count }))} />
            </Card>
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Salesperson</h2>
              {report.bySalesperson.length === 0 ? (
                <p className="text-sm text-muted">No leads in this range.</p>
              ) : (
                <div className="space-y-3">
                  {[...report.bySalesperson]
                    .sort((a, b) => b.converted - a.converted)
                    .map((p) => (
                      <div key={p.salespersonName} className="flex items-center justify-between text-sm">
                        <span className="text-ink">{p.salespersonName}</span>
                        <span className="text-muted">
                          {p.assigned} assigned · <span className="text-gold">{p.converted} converted</span> · {p.conversionRatePercent}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Leads ({report.rows.length})</h2>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted">No leads created in this range.</p>
            ) : (
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Assigned To</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.leadId} className="border-t border-white/5">
                        <td className="px-4 py-3 text-ink">{row.fullName}</td>
                        <td
                          className={`px-4 py-3 font-medium capitalize ${
                            row.status === "converted" ? "text-green-400" : row.status === "lost" ? "text-red-400" : "text-muted"
                          }`}
                        >
                          {row.status.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted">{row.source.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-muted">{row.assignedToName ?? "Unassigned"}</td>
                        <td className="px-4 py-3 text-muted">{row.createdAt.slice(0, 10)}</td>
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
