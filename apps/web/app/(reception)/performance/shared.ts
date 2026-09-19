import type { PerformanceTarget } from "@9thround/reception";

export function formatEGP(amount: number): string {
  return `${amount.toLocaleString()} EGP`;
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
