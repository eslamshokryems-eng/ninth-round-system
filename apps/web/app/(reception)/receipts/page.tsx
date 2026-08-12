"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Receipt } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { ReceiptsCalendar, monthRange, toDateKey } from "../../../src/components/receipts-calendar";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";

const today = new Date();

/** Receipts (Phase 5, "Payments / Receipts") — a calendar of daily income for the displayed month; select one or more days to total just those, and the table below follows the selection. Real data from membership_payments, no mock numbers. */
export default function ReceiptsPage() {
  const branchId = useAuthStore((state) => state.branchId);
  const role = useAuthStore((state) => state.role);

  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const { startDate, endDate } = monthRange(year, month);
    const result = await getReceptionModule().listReceiptsByDateRange.execute({ branchId, startDate, endDate });
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage("Could not load receipts.");
      return;
    }
    setReceipts(result.value);
  }, [branchId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changing month invalidates any day selection from the previous month.
  useEffect(() => {
    setSelectedDates(new Set());
  }, [year, month]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const receipt of receipts) {
      const key = toDateKey(new Date(receipt.paymentDate));
      totals.set(key, (totals.get(key) ?? 0) + receipt.amount);
    }
    return totals;
  }, [receipts]);

  function toggleDate(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  const hasSelection = selectedDates.size > 0;
  const visibleReceipts = hasSelection
    ? receipts.filter((r) => selectedDates.has(toDateKey(new Date(r.paymentDate))))
    : receipts;
  const totalForView = visibleReceipts.reduce((sum, r) => sum + r.amount, 0);

  if (role !== "branch_manager" && role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">
            Payments / Receipts is only available to Branch Manager and Super Admin accounts.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Payments / Receipts</h1>

      <div className="mb-6 grid gap-6 md:grid-cols-[320px_1fr]">
        <ReceiptsCalendar
          year={year}
          month={month}
          dailyTotals={dailyTotals}
          selectedDates={selectedDates}
          onToggleDate={toggleDate}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
        />

        <div className="rounded-card border border-white/5 bg-surface p-4">
          <p className="text-xs uppercase text-muted">
            {hasSelection ? `${selectedDates.size} day${selectedDates.size > 1 ? "s" : ""} selected` : "Whole month"}
          </p>
          <p className="mt-1 text-3xl font-semibold text-gold">{totalForView.toLocaleString()} EGP</p>
          {hasSelection ? (
            <Button variant="ghost" className="mt-3" onClick={() => setSelectedDates(new Set())}>
              Clear selection
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : visibleReceipts.length === 0 ? (
        <p className="text-muted">No receipts {hasSelection ? "on the selected day(s)" : "this month"}.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Membership #</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleReceipts.map((receipt) => (
                <tr key={receipt.paymentId} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted">{receipt.paymentDate}</td>
                  <td className="px-4 py-3 text-ink">{receipt.memberFullName}</td>
                  <td className="px-4 py-3 text-muted">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3 text-muted">{receipt.membershipNumber}</td>
                  <td className="px-4 py-3 text-muted capitalize">{receipt.paymentMethod.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right font-medium text-gold">{receipt.amount.toLocaleString()} EGP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
