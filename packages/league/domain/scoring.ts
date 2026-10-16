import { LeagueError } from "./errors";
import type { Attempt, CountingPolicy, LedgerEntry, Metric, PointsSchedule, Season, SeasonRules, TiePolicy } from "./types";

/** Hundredths of a point; all accounting is integer. */
const toCents = (n: number): number => Math.round(n * 100);

export interface RankInput {
  readonly participantId: string;
  readonly value: number;
}
export interface Ranked extends RankInput {
  /** Competition rank: equal results share a rank, the next rank skips (1, 2, 2, 4). */
  readonly rank: number;
  /** The 1-based place of the first result in this tie group ("positions rank..rank+size-1"). */
  readonly tieSize: number;
}

/**
 * Rank results by the challenge's declared direction. Deterministic: ties are exact numeric equality, and the output order is
 * (rank, participantId) so identical inputs always produce identical output.
 */
export function rankResults(inputs: readonly RankInput[], metric: Pick<Metric, "direction">): Ranked[] {
  const sorted = [...inputs].sort((a, b) => {
    const d = metric.direction === "LOWER_WINS" ? a.value - b.value : b.value - a.value;
    return d !== 0 ? d : a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  });
  const out: Ranked[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] as RankInput).value === (sorted[i] as RankInput).value) j++;
    const size = j - i + 1;
    for (let k = i; k <= j; k++) out.push({ ...(sorted[k] as RankInput), rank: i + 1, tieSize: size });
    i = j + 1;
  }
  return out;
}

/** Points for place p (1-based): the table, then `beyond`, never below the participation floor. */
export function pointsForPlaceCents(place: number, schedule: PointsSchedule): number {
  const table = schedule.byRank;
  const raw = place <= table.length ? (table[place - 1] as number) : schedule.beyond;
  return Math.max(toCents(raw), toCents(schedule.participation));
}

/**
 * SHARE: every tied participant gets the points of the shared (best) rank.
 * SPLIT: they share the average of the places the group occupies, rounded half up to a hundredth.
 */
export function pointsForRankedCents(r: Ranked, schedule: PointsSchedule, tie: TiePolicy): number {
  if (tie === "SHARE" || r.tieSize === 1) return pointsForPlaceCents(r.rank, schedule);
  let sum = 0;
  for (let p = r.rank; p < r.rank + r.tieSize; p++) sum += pointsForPlaceCents(p, schedule);
  return Math.floor((sum * 2 + r.tieSize) / (2 * r.tieSize)); // round half up on integer cents
}

/** Choose the one counted attempt from a participant's APPROVED attempts. Only approved attempts may be passed in. */
export function selectCountedAttempt(approved: readonly Attempt[], counting: CountingPolicy, metric: Pick<Metric, "direction">): Attempt | null {
  const live = approved.filter((a) => a.status === "approved");
  if (live.length === 0) return null;
  const byNo = (a: Attempt, b: Attempt) => a.attemptNo - b.attemptNo || (a.attemptedAt < b.attemptedAt ? -1 : 1);
  if (counting === "FIRST_APPROVED") return [...live].sort(byNo)[0] as Attempt;
  if (counting === "LATEST") return [...live].sort(byNo).at(-1) as Attempt;
  return [...live].sort((a, b) => {
    const d = metric.direction === "LOWER_WINS" ? a.value - b.value : b.value - a.value;
    return d !== 0 ? d : byNo(a, b);
  })[0] as Attempt;
}

export interface ChallengeScoreInput {
  readonly seasonId: string;
  readonly challengeId: string;
  readonly metric: Metric;
  readonly counting: CountingPolicy;
  readonly rules: SeasonRules;
  /** Participants who may earn points (active + eligible). */
  readonly eligibleParticipantIds: readonly string[];
  /** All attempts for the challenge, any status — only the approved ones are used. */
  readonly attempts: readonly Attempt[];
}

/** The TARGET net points per participant for one challenge. Pure and deterministic. */
export function scoreChallenge(input: ChallengeScoreInput): LedgerEntry[] {
  const eligible = new Set(input.eligibleParticipantIds);
  const counted: RankInput[] = [];
  const byParticipant = new Map<string, Attempt[]>();
  for (const a of input.attempts) {
    if (a.challengeId !== input.challengeId || a.status !== "approved" || !eligible.has(a.participantId)) continue;
    const list = byParticipant.get(a.participantId) ?? [];
    list.push(a);
    byParticipant.set(a.participantId, list);
  }
  for (const [participantId, list] of byParticipant) {
    const pick = selectCountedAttempt(list, input.counting, input.metric);
    if (pick) counted.push({ participantId, value: pick.value });
  }
  const entries: LedgerEntry[] = rankResults(counted, input.metric).map((r) => ({
    seasonId: input.seasonId,
    challengeId: input.challengeId,
    participantId: r.participantId,
    pointsCents: pointsForRankedCents(r, input.rules.points, input.rules.tiePolicy),
    rank: r.rank,
    reason: "AWARD" as const,
  }));
  const scored = new Set(entries.map((e) => e.participantId));
  const absentCents = input.rules.absencePolicy === "PARTICIPATION" ? toCents(input.rules.points.participation) : toCents(input.rules.points.absent);
  const absent = [...eligible]
    .filter((id) => !scored.has(id))
    .sort()
    .map((participantId) => ({ seasonId: input.seasonId, challengeId: input.challengeId, participantId, pointsCents: absentCents, rank: null, reason: "ABSENT" as const }));
  return [...entries, ...absent.filter((a) => a.pointsCents !== 0)];
}

/** Net points per participant for a challenge from existing ledger lines. */
export function netByParticipant(ledger: readonly LedgerEntry[], challengeId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of ledger) if (e.challengeId === challengeId) m.set(e.participantId, (m.get(e.participantId) ?? 0) + e.pointsCents);
  return m;
}

/** The rank carried by a participant's LATEST ledger line for a challenge (lines are in append order). */
export function latestRank(ledger: readonly LedgerEntry[], challengeId: string): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const e of ledger) if (e.challengeId === challengeId) m.set(e.participantId, e.rank);
  return m;
}

/**
 * Append-only reconciliation: the lines that move the ledger to the target. Running it twice (a retry, a replayed request) yields nothing the
 * second time, so points are never awarded twice. A participant who drops out of the target gets a reversing line; a rank change with the
 * same points gets a zero-point line that records the new rank.
 */
export function reconcileChallenge(existing: readonly LedgerEntry[], target: readonly LedgerEntry[], challengeId: string, seasonId: string): LedgerEntry[] {
  const have = netByParticipant(existing, challengeId);
  const haveRank = latestRank(existing, challengeId);
  const want = new Map<string, LedgerEntry>();
  for (const t of target) want.set(t.participantId, t);
  const out: LedgerEntry[] = [];
  const ids = [...new Set([...have.keys(), ...want.keys()])].sort();
  for (const id of ids) {
    const goal = want.get(id);
    const delta = (goal?.pointsCents ?? 0) - (have.get(id) ?? 0);
    const firstLine = !have.has(id);
    const goalRank = goal?.rank ?? null;
    const rankChanged = !firstLine && (haveRank.get(id) ?? null) !== goalRank;
    if (delta === 0 && !rankChanged && !(firstLine && goal)) continue;
    out.push({
      seasonId,
      challengeId,
      participantId: id,
      pointsCents: delta,
      rank: goalRank,
      reason: firstLine ? (goal?.reason ?? "ADJUSTMENT") : "ADJUSTMENT",
    });
  }
  return out;
}

export function assertSeasonOpenForScoring(season: Pick<Season, "status">): void {
  if (season.status === "completed") throw new LeagueError("LEAGUE_SEASON_LOCKED", "This season is completed — its results are final.");
}
