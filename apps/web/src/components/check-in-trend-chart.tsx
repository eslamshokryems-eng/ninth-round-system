"use client";

import { useState } from "react";
import type { TodayCheckInEntry } from "@9thround/reception";

interface CheckInTrendChartProps {
  checkIns: TodayCheckInEntry[];
}

const WIDTH = 600;
const HEIGHT = 160;
const PAD_X = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** A single-series hourly trend line for today's check-ins — real data, bucketed client-side from listToday(). No legend needed (one series, named by the section title). */
export function CheckInTrendChart({ checkIns }: CheckInTrendChartProps) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const buckets = Array.from({ length: 24 }, () => 0);
  for (const entry of checkIns) {
    const hour = entry.checkedInAt.getHours();
    buckets[hour] = (buckets[hour] ?? 0) + 1;
  }
  const max = Math.max(1, ...buckets);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = (WIDTH - PAD_X * 2) / (buckets.length - 1);

  const points = buckets.map((count, hour) => ({
    hour,
    count,
    x: PAD_X + hour * stepX,
    y: PAD_TOP + plotHeight - (count / max) * plotHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? PAD_X} ${PAD_TOP + plotHeight} L ${points[0]?.x ?? PAD_X} ${PAD_TOP + plotHeight} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverHour !== null ? points[hoverHour] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Check-ins by hour today"
        onMouseLeave={() => setHoverHour(null)}
      >
        {gridLines.map((fraction) => (
          <line
            key={fraction}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_TOP + plotHeight * fraction}
            y2={PAD_TOP + plotHeight * fraction}
            stroke="currentColor"
            className="text-white/5"
            strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill="url(#checkin-trend-fill)" />
        <path d={linePath} fill="none" stroke="#d4af37" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        <defs>
          <linearGradient id="checkin-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
          </linearGradient>
        </defs>

        {points
          .filter((_, i) => i % 6 === 0)
          .map((p) => (
            <text key={p.hour} x={p.x} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[10px]">
              {formatHour(p.hour)}
            </text>
          ))}

        {points.map((p) => (
          <rect
            key={p.hour}
            x={p.x - stepX / 2}
            y={PAD_TOP}
            width={stepX}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHoverHour(p.hour)}
          />
        ))}

        {hovered ? (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="currentColor"
              className="text-white/15"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="#d4af37" stroke="#0b0b0d" strokeWidth={2} />
          </>
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-white/10 bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(hovered.x / WIDTH) * 100}%` }}
        >
          <p className="font-semibold text-ink">
            {hovered.count} check-in{hovered.count === 1 ? "" : "s"}
          </p>
          <p className="text-muted">{formatHour(hovered.hour)}</p>
        </div>
      ) : null}
    </div>
  );
}
