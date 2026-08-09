"use client";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthRange(year: number, month: number): { startDate: string; endDate: string } {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

interface ReceiptsCalendarProps {
  year: number;
  month: number; // 0-11
  dailyTotals: Map<string, number>;
  selectedDates: Set<string>;
  onToggleDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/** A lightweight month-grid calendar (no date library) for the Receipts page's daily-income view — click a day to add/remove it from the selection. */
export function ReceiptsCalendar({
  year,
  month,
  dailyTotals,
  selectedDates,
  onToggleDate,
  onPrevMonth,
  onNextMonth,
}: ReceiptsCalendarProps) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay();

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(Date.UTC(year, month, i + 1)))),
  ];

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="rounded-card border border-white/5 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/[0.06] hover:text-ink"
        >
          ←
        </button>
        <p className="font-semibold text-ink">{monthLabel}</p>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/[0.06] hover:text-ink"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-muted">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateKey, index) => {
          if (!dateKey) return <div key={`blank-${index}`} />;
          const total = dailyTotals.get(dateKey);
          const isSelected = selectedDates.has(dateKey);
          const dayNumber = Number(dateKey.slice(8, 10));
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onToggleDate(dateKey)}
              className={`flex flex-col items-center rounded-lg px-1 py-1.5 text-xs transition-colors ${
                isSelected ? "bg-gold text-bg" : "text-ink hover:bg-white/[0.06]"
              }`}
            >
              <span className="font-medium">{dayNumber}</span>
              <span className={`mt-0.5 truncate text-[10px] ${isSelected ? "text-bg/80" : "text-muted"}`}>
                {total ? total.toLocaleString() : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
