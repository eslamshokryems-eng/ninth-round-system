import type { PerformanceTarget, ProgramType } from "@9thround/reception";
import type { DateRange } from "../../../src/components/date-range-picker";
import { toDateKey } from "../../../src/components/receipts-calendar";

export function formatEGP(amount: number): string {
  return `${amount.toLocaleString()} EGP`;
}

/** Fixed per label, never auto-cycled — validated for CVD-safe contrast against the app's dark surface (dataviz skill, scripts/validate_palette.js). Matches the reference design's semantic hues (blue=Boxing, green=Kickboxing, amber=MMA, red=9th Round). */
export const PROGRAM_COLORS: Record<ProgramType, string> = {
  ninth_round: "#EF4444",
  boxing: "#3B82F6",
  kickboxing: "#16A34A",
  mma: "#D97706",
};
/** A null program_type is real, unclassified data (never backfilled) — shown as "Other" with a neutral color, not invented as a new category. */
export const UNCLASSIFIED_COLOR = "#6B7280";

export const PROGRAM_LABELS: Record<ProgramType, string> = {
  ninth_round: "9th Round",
  boxing: "Boxing",
  kickboxing: "Kickboxing",
  mma: "MMA",
};

export function programLabel(programType: ProgramType | null): string {
  return programType ? PROGRAM_LABELS[programType] : "Other";
}

export function programColor(programType: ProgramType | null): string {
  return programType ? PROGRAM_COLORS[programType] : UNCLASSIFIED_COLOR;
}

/**
 * The equivalent-length period immediately before `range` — e.g. "This
 * Month" (Sep 1–30) compares against Aug 1–31; a custom 10-day range
 * compares against the 10 days before it. Used for every KPI card's "vs
 * previous period" delta, computed generically so it's correct for any
 * range, not just calendar months.
 */
export function previousPeriod(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { startDate: toDateKey(prevStart), endDate: toDateKey(prevEnd) };
}

/** Percent change from `previous` to `current` — null when there's no previous-period baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Achievement-percent status tiers — an explicit business rule (100%+/80–99%/60–79%/below 60%), not a general dataviz choice. Percentage is always shown alongside these, never color alone. */
export function achievementTone(pct: number | null): { text: string; bar: string } {
  if (pct === null) return { text: "text-muted", bar: "bg-white/10" };
  if (pct >= 100) return { text: "text-green-400", bar: "bg-green-500" };
  if (pct >= 80) return { text: "text-lime-400", bar: "bg-lime-500" };
  if (pct >= 60) return { text: "text-amber-400", bar: "bg-amber-500" };
  return { text: "text-red-400", bar: "bg-red-500" };
}

/**
 * Sums every target whose period overlaps the report's own date range,
 * per staff member — a report spanning two half-months' worth of weekly
 * targets should count both, not just the first match.
 */
export function targetTotalsByStaff(targets: PerformanceTarget[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const target of targets) {
    totals.set(target.staffId, (totals.get(target.staffId) ?? 0) + target.targetAmount);
  }
  return totals;
}

export function achievementPercent(collected: number, target: number | undefined): number | null {
  if (!target) return null;
  return Math.round((collected / target) * 1000) / 10;
}
