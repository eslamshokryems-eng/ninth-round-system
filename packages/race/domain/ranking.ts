/** Results & rankings — what the leaderboard and the staff results screen work with. The ranking itself is computed in the database. */

export interface RankRow {
  rank: number;
  raceNumber: string;
  /** "First L." — the only name the public leaderboard carries. */
  name: string;
  totalPoints: number;
  /** Placement at each station, keyed 1..9. */
  placements: Record<number, number>;
  techniqueS04: number | null;
  techniqueS07: number | null;
}

export type ExcludedStatus = "DNS" | "DNF" | "WITHDRAWN";

export interface CategoryBoard {
  code: string;
  name: string;
  state: "OFFICIAL" | "PROVISIONAL";
  version: number | null;
  rows: RankRow[];
  racing: number;
  excluded: { raceNumber: string; name: string; status: ExcludedStatus }[];
}

export type Leaderboard =
  | { available: false }
  | { available: true; serverTime: string; eventName: string; official: boolean; categories: CategoryBoard[] };

export interface Blockers {
  ranked: number;
  racing: number;
  pendingReview: number;
  notLocked: number;
  unscored: number;
  /** Rowing results whose distance is not yet confirmed from the photo evidence. */
  pendingEvidence: number;
}

export interface SnapshotInfo {
  categoryId: string;
  version: number | null;
  official: boolean;
  unchanged: boolean;
  ranked: number;
  blockers: Blockers;
}

export interface AthleteStationResult {
  resultId: string;
  station: number;
  stationName: string;
  status: string;
  officialScore: number | null;
  techniqueScore: number | null;
  hasTechnique: boolean;
}

export interface AthleteResults {
  raceNumber: string;
  name: string;
  categoryCode: string;
  raceStatus: string;
  results: AthleteStationResult[];
}

export type CorrectableField = "official_score" | "technique_score";

/** True when nothing stands between this category and an official result. */
export function blockersClear(b: Blockers): boolean {
  return b.racing === 0 && b.pendingReview === 0 && b.notLocked === 0 && b.unscored === 0 && b.pendingEvidence === 0;
}

/** Human list of what is still open, empty when ready. */
export function describeBlockers(b: Blockers): string[] {
  const out: string[] = [];
  if (b.racing > 0) out.push(`${b.racing} athlete${b.racing === 1 ? " is" : "s are"} still racing`);
  if (b.notLocked > 0) out.push(`${b.notLocked} result${b.notLocked === 1 ? " is" : "s are"} not locked yet`);
  if (b.pendingReview > 0) out.push(`${b.pendingReview} result${b.pendingReview === 1 ? " is" : "s are"} waiting for a Master Control review`);
  if (b.pendingEvidence > 0) out.push(`${b.pendingEvidence} rowing result${b.pendingEvidence === 1 ? ' is' : 's are'} waiting for confirmed photo evidence`);
  if (b.unscored > 0) out.push(`${b.unscored} result${b.unscored === 1 ? " has" : "s have"} no score`);
  return out;
}

/** "1", "2", "T2"? — a shared place is shown with a T so nobody reads a tie as a mistake. */
export function placeLabel(rows: readonly RankRow[], row: RankRow): string {
  const shared = rows.filter((r) => r.rank === row.rank).length > 1;
  return shared ? `T${row.rank}` : String(row.rank);
}
