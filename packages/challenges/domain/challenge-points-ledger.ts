/**
 * Append-only (database-enforced: no update/delete grant — see the Phase 1
 * migration). A member's total points for a season is always
 * `sum(pointsDelta)` over their ledger rows for that season — never a
 * separately stored, independently-updatable total, so it's always
 * reproducible from history alone (spec §6/§8's auditability requirement).
 * A correction never rewrites an existing row; it adds a compensating
 * negative entry plus a new entry (see challenge-result.ts's doc comment
 * on the correction chain).
 */
export interface ChallengePointsLedgerEntry {
  entryId: string;
  seasonId: string;
  challengeId: string;
  memberId: string;
  resultId: string;
  pointsDelta: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

/** Pure aggregation — the same arithmetic the leaderboard queries (Phase 4) perform in SQL, kept here too so it's independently testable and so the two can never silently disagree. */
export function sumLedgerPoints(entries: ChallengePointsLedgerEntry[]): number {
  return entries.reduce((total, entry) => total + entry.pointsDelta, 0);
}

/** Groups ledger entries by member and sums each — the pure core of a season's aggregate points leaderboard, before the database/infra layer adds branch scoping, nickname lookup, and sorting (Phase 4). */
export function aggregatePointsByMember(entries: ChallengePointsLedgerEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.memberId, (totals.get(entry.memberId) ?? 0) + entry.pointsDelta);
  }
  return totals;
}
