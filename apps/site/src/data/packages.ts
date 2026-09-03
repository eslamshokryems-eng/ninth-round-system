/**
 * FIT PRO pricing was left blank in every duration in the brand brief —
 * not invented here, rendered as TBC until confirmed. FIGHTER prices are
 * exactly as given.
 */
export interface PackageRow {
  durationKey: "month" | "months3" | "months6";
  fitPro: number | null;
  fighter: number;
}

export const PACKAGES: PackageRow[] = [
  { durationKey: "month", fitPro: null, fighter: 2400 },
  { durationKey: "months3", fitPro: null, fighter: 6000 },
  { durationKey: "months6", fitPro: null, fighter: 10800 },
];
