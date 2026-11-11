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
  participantProfileId: string;
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

/** Groups ledger entries by participant and sums each — the pure core of a season's aggregate points leaderboard; the actual leaderboard views (this migration's challenge_season_leaderboard_overall/by_branch) perform the same arithmetic in SQL, kept here too so it's independently testable and so the two can never silently disagree. */
export function aggregatePointsByParticipant(entries: ChallengePointsLedgerEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.participantProfileId, (totals.get(entry.participantProfileId) ?? 0) + entry.pointsDelta);
  }
  return totals;
}
