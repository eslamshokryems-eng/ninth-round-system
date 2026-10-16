import type { Challenge, LedgerEntry, Participant } from "./types";

export interface StandingRow {
  readonly participantId: string;
  readonly publicId: string;
  readonly displayName: string;
  /** Competition rank on total points: equal totals share a rank (1, 2, 2, 4). PROVISIONAL tie handling. */
  readonly rank: number;
  /** true when at least one other participant has exactly the same total. No final tie-break is defined: a tie is shown as a tie, also after week 8. */
  readonly tied: boolean;
  readonly totalCents: number;
  /** Points per week number (only weeks with a ledger line). */
  readonly weeklyCents: Readonly<Record<number, number>>;
  /** Challenges in which the participant has an approved, ranked result. */
  readonly challengesCompleted: number;
  readonly firstPlaces: number;
  /** Positive = moved up since the previous closed week; null when there is no earlier standing to compare with. */
  readonly movement: number | null;
  /** Points needed to reach the next better rank; null for the leader. */
  readonly gapToNextCents: number | null;
}

export interface Standings {
  readonly rows: readonly StandingRow[];
  /** Highest week number whose challenge is closed (points awarded); 0 before the first. */
  readonly throughWeek: number;
  readonly closedChallenges: number;
}

interface Acc {
  p: Participant;
  weekly: Map<number, number>;
  total: number;
  completed: Set<string>;
  firsts: Set<string>;
}

/** Display order is part of the contract (TV and phone must agree): total ↓, first places ↓, display name, public id. Equal totals still share a rank. */
function order(a: Acc, b: Acc): number {
  return b.total - a.total || b.firsts.size - a.firsts.size || a.p.displayName.localeCompare(b.p.displayName, "en", { sensitivity: "base" }) || (a.p.publicId < b.p.publicId ? -1 : 1);
}

function accumulate(participants: readonly Participant[], ledger: readonly LedgerEntry[], weekOf: Map<string, number>, upToWeek: number): Acc[] {
  const accs = new Map<string, Acc>();
  for (const p of participants) accs.set(p.id, { p, weekly: new Map(), total: 0, completed: new Set(), firsts: new Set() });
  const lastRank = new Map<string, number | null>(); // `${challenge}:${participant}` → latest rank
  for (const e of ledger) {
    const week = weekOf.get(e.challengeId);
    const acc = accs.get(e.participantId);
    if (!acc || week === undefined || week > upToWeek) continue;
    acc.total += e.pointsCents;
    acc.weekly.set(week, (acc.weekly.get(week) ?? 0) + e.pointsCents);
    lastRank.set(`${e.challengeId}\u0000${e.participantId}`, e.rank);
  }
  for (const [key, rank] of lastRank) {
    const [challengeId, participantId] = key.split("\u0000") as [string, string];
    const acc = accs.get(participantId);
    if (!acc || rank === null) continue;
    acc.completed.add(challengeId);
    if (rank === 1) acc.firsts.add(challengeId);
  }
  return [...accs.values()];
}

function rankAll(accs: Acc[]): Map<string, number> {
  const sorted = [...accs].sort(order);
  const ranks = new Map<string, number>();
  sorted.forEach((a, i) => {
    const prev = sorted[i - 1];
    ranks.set(a.p.id, prev && prev.total === a.total ? (ranks.get(prev.p.id) as number) : i + 1);
  });
  return ranks;
}

/**
 * Season standings from the points ledger — the ONLY authoritative source. Inactive participants who earned points stay on the board;
 * a participant with no ledger lines still appears (0 points) so nobody silently vanishes.
 */
export function buildStandings(participants: readonly Participant[], ledger: readonly LedgerEntry[], challenges: readonly Challenge[]): Standings {
  const weekOf = new Map(challenges.map((c) => [c.id, c.weekNumber]));
  const closed = challenges.filter((c) => c.status === "closed");
  const throughWeek = closed.reduce((m, c) => Math.max(m, c.weekNumber), 0);
  const current = accumulate(participants, ledger, weekOf, 8);
  const ranks = rankAll(current);
  const previousRanks = throughWeek > 1 ? rankAll(accumulate(participants, ledger, weekOf, throughWeek - 1)) : null;
  const sorted = [...current].sort(order);
  const rows: StandingRow[] = sorted.map((a) => {
    const rank = ranks.get(a.p.id) as number;
    const better = sorted.filter((o) => o.total > a.total).sort((x, y) => x.total - y.total)[0];
    const prev = previousRanks?.get(a.p.id);
    return {
      participantId: a.p.id,
      publicId: a.p.publicId,
      displayName: a.p.displayName,
      rank,
      tied: sorted.some((o) => o.p.id !== a.p.id && o.total === a.total),
      totalCents: a.total,
      weeklyCents: Object.fromEntries([...a.weekly.entries()].sort((x, y) => x[0] - y[0])),
      challengesCompleted: a.completed.size,
      firstPlaces: a.firsts.size,
      movement: prev === undefined || previousRanks === null ? null : prev - rank,
      gapToNextCents: better ? better.total - a.total : null,
    };
  });
  return { rows, throughWeek, closedChallenges: closed.length };
}

export const centsToPoints = (cents: number): number => cents / 100;
