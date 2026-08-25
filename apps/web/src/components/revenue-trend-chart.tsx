"use client";

import { useState } from "react";
import type { RevenueTrendPoint } from "@9thround/reception";

interface RevenueTrendChartProps {
  points: RevenueTrendPoint[];
}

const WIDTH = 600;
const HEIGHT = 160;
const PAD_X = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const MAX_LABELS = 7;

/** Same single-series line style as CheckInTrendChart — one series, no legend needed, labeled by the section title. */
export function RevenueTrendChart({ points }: RevenueTrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-muted">No revenue in this range.</p>;
  }

  const max = Math.max(1, ...points.map((p) => p.total));
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;

  const plotted = points.map((p, i) => ({
    ...p,
    x: PAD_X + i * stepX,
    y: PAD_TOP + plotHeight - (p.total / max) * plotHeight,
  }));

  const linePath = plotted.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${plotted[plotted.length - 1]?.x ?? PAD_X} ${PAD_TOP + plotHeight} L ${plotted[0]?.x ?? PAD_X} ${PAD_TOP + plotHeight} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex !== null ? plotted[hoverIndex] : null;
  const labelStride = Math.max(1, Math.ceil(plotted.length / MAX_LABELS));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Daily revenue trend"
        onMouseLeave={() => setHoverIndex(null)}
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

        <path d={areaPath} fill="url(#revenue-trend-fill)" />
        <path d={linePath} fill="none" stroke="#d4af37" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        <defs>
          <linearGradient id="revenue-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
          </linearGradient>
        </defs>

        {plotted
          .filter((_, i) => i % labelStride === 0)
          .map((p) => (
            <text key={p.date} x={p.x} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[10px]">
              {p.date.slice(5)}
            </text>
          ))}

        {plotted.map((p, i) => (
          <rect
            key={p.date}
            x={p.x - stepX / 2}
            y={PAD_TOP}
            width={Math.max(stepX, 4)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {hovered ? (
          <>
            <line x1={hovered.x} x2={hovered.x} y1={PAD_TOP} y2={PAD_TOP + plotHeight} stroke="currentColor" className="text-white/15" strokeWidth={1} />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="#d4af37" stroke="#0b0b0d" strokeWidth={2} />
          </>
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-white/10 bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(hovered.x / WIDTH) * 100}%` }}
        >
          <p className="font-semibold text-ink">{hovered.total.toLocaleString()} EGP</p>
          <p className="text-muted">{hovered.date}</p>
        </div>
      ) : null}
    </div>
  );
}
