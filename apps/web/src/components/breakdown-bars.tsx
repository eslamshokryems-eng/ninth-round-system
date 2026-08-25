"use client";

export interface BreakdownBarEntry {
  label: string;
  value: number;
}

export interface BreakdownBarsProps {
  entries: BreakdownBarEntry[];
  formatValue?: (value: number) => string;
}

/**
 * Ranked horizontal bars for a single-metric-per-category breakdown (by
 * payment method, by membership type, by lead source, …). One hue (gold) —
 * this is magnitude-by-category with one series, not identity, so no
 * categorical palette or legend is needed (dataviz skill: "a single series
 * needs no legend box — the label names it"). Values are direct-labeled,
 * never color-only.
 */
export function BreakdownBars({ entries, formatValue = (v) => v.toLocaleString() }: BreakdownBarsProps) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((e) => e.value));

  if (sorted.length === 0) {
    return <p className="text-sm text-muted">No data for this range.</p>;
  }

  return (
    <div className="space-y-2.5">
      {sorted.map((entry) => (
        <div key={entry.label} className="flex items-center gap-3">
          <span className="w-32 flex-shrink-0 truncate text-xs capitalize text-muted" title={entry.label}>
            {entry.label.replace(/_/g, " ")}
          </span>
          <div className="h-2 flex-1 rounded-full bg-white/5">
            <div className="h-2 rounded-full bg-gold" style={{ width: `${(entry.value / max) * 100}%` }} />
          </div>
          <span className="w-20 flex-shrink-0 text-right text-xs font-medium text-ink">{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}
