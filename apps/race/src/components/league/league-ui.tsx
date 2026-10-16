"use client";

import type { ReactNode } from "react";
import type { PublicStandingRow } from "@9thround/league";

/** Points are stored in hundredths; show them without noise (25, 22.5, 6.33). */
export function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function DemoBanner() {
  return (
    <div className="lg-demo" role="note" data-testid="demo-banner">
      Local test data — synthetic “Demo Athlete” fixtures. Not real members, not published.
    </div>
  );
}

export function Movement({ value }: { value: number | null }) {
  if (value === null) return <span className="lg-move-flat" aria-label="no movement data">–</span>;
  if (value > 0) return <span className="lg-move-up" aria-label={`up ${value}`}>▲ {value}</span>;
  if (value < 0) return <span className="lg-move-down" aria-label={`down ${-value}`}>▼ {-value}</span>;
  return <span className="lg-move-flat" aria-label="unchanged">＝</span>;
}

export function WeekBar({ statuses }: { statuses: readonly string[] }) {
  return (
    <div className="lg-bar" role="img" aria-label={`Season progress: ${statuses.filter((s) => s === "closed").length} of 8 challenges complete`}>
      {Array.from({ length: 8 }, (_, i) => <span key={i} data-s={statuses[i] ?? "none"} />)}
    </div>
  );
}

export function StandingRow({ row, href, children }: { row: PublicStandingRow; href?: string; children?: ReactNode }) {
  const inner = (
    <>
      <div className="lg-rank">{row.rank}</div>
      <div style={{ minWidth: 0 }}>
        <div className="lg-name">{row.displayName}</div>
        <div className="lg-sub">{row.challengesCompleted} challenge{row.challengesCompleted === 1 ? "" : "s"} · <Movement value={row.movement} />{row.gapToNext !== null ? ` · ${fmtPoints(row.gapToNext)} to next` : ""}</div>
      </div>
      <div className="lg-pts">{fmtPoints(row.totalPoints)}<div className="lg-sub" style={{ fontFamily: "var(--race-body)", fontWeight: 400 }}>pts</div></div>
      {children}
    </>
  );
  return href ? (
    <a className="lg-row" data-top={row.rank <= 3 ? "1" : "0"} href={href} data-testid="standing-row" data-public-id={row.publicId} style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>
  ) : (
    <div className="lg-row" data-top={row.rank <= 3 ? "1" : "0"} data-testid="standing-row">{inner}</div>
  );
}

export function weekStatuses(challenges: readonly { weekNumber: number; status: string }[]): string[] {
  const out: string[] = Array.from({ length: 8 }, () => "none");
  for (const c of challenges) out[c.weekNumber - 1] = c.status;
  return out;
}
