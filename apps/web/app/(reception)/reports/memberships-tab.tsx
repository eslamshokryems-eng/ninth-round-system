"use client";

import { useCallback, useEffect, useState } from "react";
import type { MembershipsReport } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { exportToExcel } from "../../../src/lib/export-xlsx";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { BreakdownBars } from "../../../src/components/breakdown-bars";
import { monthRange } from "../../../src/components/receipts-calendar";

const today = new Date();

export function MembershipsTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [report, setReport] = useState<MembershipsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().getMembershipsReport.execute({ branchId, ...range });
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
    exportToExcel(`memberships-report-${range.startDate}-to-${range.endDate}.xlsx`, [
      {
        name: "Summary",
        rows: [
          { Metric: "Total Memberships", Value: report.totalMemberships },
          { Metric: "New Members", Value: report.newMemberCount },
          { Metric: "Renewals", Value: report.renewalCount },
          ...report.byMembershipType.map((e) => ({ Metric: `Type: ${e.label}`, Value: e.count })),
          ...report.byStatus.map((e) => ({ Metric: `Status: ${e.label}`, Value: e.count })),
        ],
      },
      {
        name: "Memberships",
        rows: report.rows.map((r) => ({
          Member: r.memberFullName,
          Type: r.membershipTypeName,
          "Start Date": r.startDate,
          "End Date": r.endDate,
          "Price (EGP)": r.finalPrice,
          Status: r.status,
          Kind: r.isNewMember ? "New Member" : "Renewal",
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
            <StatCard label="Total Memberships" value={report.totalMemberships} />
            <StatCard label="New Members" value={report.newMemberCount} />
            <StatCard label="Renewals" value={report.renewalCount} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Membership Type</h2>
              <BreakdownBars entries={report.byMembershipType.map((e) => ({ label: e.label, value: e.count }))} />
            </Card>
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-ink">By Status</h2>
              <BreakdownBars entries={report.byStatus.map((e) => ({ label: e.label, value: e.count }))} />
            </Card>
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Memberships ({report.rows.length})</h2>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted">No memberships starting in this range.</p>
            ) : (
              <div className="max-h-96 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Kind</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.membershipId} className="border-t border-white/5">
                        <td className="px-4 py-3 text-ink">{row.memberFullName}</td>
                        <td className="px-4 py-3 text-muted">{row.membershipTypeName}</td>
                        <td className="px-4 py-3 text-muted">
                          {row.startDate} → {row.endDate}
                        </td>
                        <td className="px-4 py-3">
                          <span className={row.isNewMember ? "text-gold" : "text-muted"}>{row.isNewMember ? "New Member" : "Renewal"}</span>
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${
                            row.status === "active" ? "text-gold" : row.status === "expired" ? "text-red-400" : "text-muted"
                          }`}
                        >
                          {row.status}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gold">{row.finalPrice.toLocaleString()} EGP</td>
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
