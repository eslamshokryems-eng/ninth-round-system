"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecentCheckInEntry } from "@9thround/reception";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { ReceiptsCalendar, monthRange, toDateKey } from "../../../src/components/receipts-calendar";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";

const today = new Date();

/** Check-in History — a calendar of daily check-in counts for the displayed month; select one or more days to see just those check-ins. Real data from check_ins, branch-scoped by RLS same as the Dashboard's lists. */
export default function CheckInHistoryPage() {
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [checkIns, setCheckIns] = useState<RecentCheckInEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const { startDate, endDate } = monthRange(year, month);
    const result = await getReceptionModule().listCheckInsByDateRange.execute({ startDate, endDate });
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage("Could not load check-in history.");
      return;
    }
    setCheckIns(result.value);
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changing month invalidates any day selection from the previous month.
  useEffect(() => {
    setSelectedDates(new Set());
  }, [year, month]);

  const dailyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of checkIns) {
      const key = toDateKey(entry.checkedInAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [checkIns]);

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
  const visibleCheckIns = hasSelection
    ? checkIns.filter((c) => selectedDates.has(toDateKey(c.checkedInAt)))
    : checkIns;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Check-in History</h1>

      <div className="mb-6 grid gap-6 md:grid-cols-[320px_1fr]">
        <ReceiptsCalendar
          year={year}
          month={month}
          dailyTotals={dailyCounts}
          selectedDates={selectedDates}
          onToggleDate={toggleDate}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
        />

        <div className="rounded-card border border-white/5 bg-surface p-4">
          <p className="text-xs uppercase text-muted">
            {hasSelection ? `${selectedDates.size} day${selectedDates.size > 1 ? "s" : ""} selected` : "Whole month"}
          </p>
          <p className="mt-1 text-3xl font-semibold text-gold">{visibleCheckIns.length.toLocaleString()}</p>
          <p className="text-sm text-muted">check-in{visibleCheckIns.length === 1 ? "" : "s"}</p>
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
      ) : visibleCheckIns.length === 0 ? (
        <p className="text-muted">No check-ins {hasSelection ? "on the selected day(s)" : "this month"}.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Member</th>
              </tr>
            </thead>
            <tbody>
              {[...visibleCheckIns].reverse().map((entry) => (
                <tr key={entry.checkInId} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted">{toDateKey(entry.checkedInAt)}</td>
                  <td className="px-4 py-3 text-muted">
                    {entry.checkedInAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3 text-ink">{entry.memberName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
