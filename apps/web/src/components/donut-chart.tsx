"use client";

import { useState } from "react";

export interface DonutChartEntry {
  label: string;
  value: number;
  /** Fixed per label by the caller — never auto-cycled (dataviz skill: categorical hues are assigned, not generated). */
  color: string;
}

export interface DonutChartProps {
  entries: DonutChartEntry[];
  centerLabel: string;
  formatValue?: (value: number) => string;
}

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** A small visual gap between adjacent segments — degrees of the circle left blank per segment boundary. */
const GAP_DEGREES = 2;

/**
 * A single-metric-per-category donut — same "magnitude by category" job
 * BreakdownBars already does for a plain list; this is the same data shown
 * as a ring for pages that want the at-a-glance whole-vs-parts read (Sales
 * by Program Type). Colors are always paired with a text legend — never
 * color-alone identification, per the dataviz skill's accessibility pass.
 */
export function DonutChart({ entries, centerLabel, formatValue = (v) => v.toLocaleString() }: DonutChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const total = entries.reduce((sum, e) => sum + e.value, 0);

  if (entries.length === 0 || total === 0) {
    return <p className="text-sm text-muted">No data for this range.</p>;
  }

  let cumulativeDegrees = 0;
  const segments = entries.map((entry, i) => {
    const fraction = entry.value / total;
    const segmentDegrees = fraction * 360;
    const startDegrees = cumulativeDegrees;
    cumulativeDegrees += segmentDegrees;
    const gap = entries.length > 1 ? GAP_DEGREES : 0;
    const drawDegrees = Math.max(segmentDegrees - gap, 0);
    const dash = (drawDegrees / 360) * CIRCUMFERENCE;
    return {
      ...entry,
      index: i,
      percent: Math.round(fraction * 1000) / 10,
      dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
      dashOffset: -((startDegrees / 360) * CIRCUMFERENCE) - (gap / 2 / 360) * CIRCUMFERENCE,
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={centerLabel}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" className="text-white/5" strokeWidth={STROKE} />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={hoverIndex === segment.index ? STROKE + 4 : STROKE}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              onMouseEnter={() => setHoverIndex(segment.index)}
              onMouseLeave={() => setHoverIndex(null)}
              className="cursor-pointer transition-[stroke-width]"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-muted">{hoverIndex !== null ? segments[hoverIndex]?.label : centerLabel}</p>
          <p className="text-lg font-semibold text-ink">
            {hoverIndex !== null ? formatValue(segments[hoverIndex]?.value ?? 0) : formatValue(total)}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="flex-1 truncate text-muted">{segment.label}</span>
            <span className="font-medium text-ink">{formatValue(segment.value)}</span>
            <span className="w-12 flex-shrink-0 text-right text-xs text-muted">{segment.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
