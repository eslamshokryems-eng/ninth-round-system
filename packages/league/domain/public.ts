import type { Challenge, Season } from "./types";
import { centsToPoints, type Standings } from "./standings";

/**
 * THE PUBLIC SHAPE. Everything a TV or phone page may ever receive is listed here, field by field. There is deliberately no spread of a
 * source object anywhere in this file: a new private field added to a domain type can never leak, because it is not copied.
 */
export interface PublicSeason {
  readonly slug: string;
  readonly name: string;
  readonly status: Season["status"];
  readonly startsOn: string;
  readonly endsOn: string;
  readonly totalWeeks: number;
  readonly throughWeek: number;
  readonly currentWeek: number | null;
  /** How many athletes the season has, and whether `standings` was cut at PUBLIC_ROW_LIMIT (the list is never silently incomplete). */
  readonly participantCount: number;
  readonly truncated: boolean;
}
export interface PublicChallenge {
  readonly weekNumber: number;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly safetyNotes: string;
  readonly metricKind: string;
  readonly unit: string;
  readonly direction: string;
  readonly referenceUrl: string | null;
  readonly status: Challenge["status"];
}
export interface PublicStandingRow {
  readonly publicId: string;
  readonly displayName: string;
  readonly rank: number;
  /** Shares this rank with at least one other participant (equal season totals). */
  readonly tied: boolean;
  readonly totalPoints: number;
  readonly weeklyPoints: Readonly<Record<number, number>>;
  readonly challengesCompleted: number;
  readonly movement: number | null;
  readonly gapToNext: number | null;
}
export interface PublicLeague {
  readonly season: PublicSeason;
  readonly challenges: readonly PublicChallenge[];
  readonly standings: readonly PublicStandingRow[];
  readonly generatedAt: string;
}

/** A public read returns at most this many standings rows (best first). Mirrors the database function. */
export const PUBLIC_ROW_LIMIT = 1000;

export const PUBLIC_STANDING_KEYS = ["publicId", "displayName", "rank", "tied", "totalPoints", "weeklyPoints", "challengesCompleted", "movement", "gapToNext"] as const;
export const PUBLIC_SEASON_KEYS = ["slug", "name", "status", "startsOn", "endsOn", "totalWeeks", "throughWeek", "currentWeek", "participantCount", "truncated"] as const;
export const PUBLIC_CHALLENGE_KEYS = ["weekNumber", "name", "description", "instructions", "safetyNotes", "metricKind", "unit", "direction", "referenceUrl", "status"] as const;

/** Challenges still in draft are never public. */
export function toPublicChallenge(c: Challenge): PublicChallenge | null {
  if (c.status === "draft") return null;
  return {
    weekNumber: c.weekNumber,
    name: c.name,
    description: c.description,
    instructions: c.instructions,
    safetyNotes: c.safetyNotes,
    metricKind: c.metric.kind,
    unit: c.metric.unit,
    direction: c.metric.direction,
    referenceUrl: c.referenceUrl,
    status: c.status,
  };
}

/** Which week "now" falls in (1..8), or null before the season starts / after it ends. */
export function currentWeek(startsOn: string, endsOn: string, now: Date): number | null {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T23:59:59Z`);
  const t = now.getTime();
  if (t < start || t > end) return null;
  return Math.floor((t - start) / (7 * 86_400_000)) + 1;
}

export function toPublicLeague(season: Season, challenges: readonly Challenge[], standings: Standings, now: Date): PublicLeague | null {
  if (!season.published) return null;
  const rows: PublicStandingRow[] = standings.rows.slice(0, PUBLIC_ROW_LIMIT).map((r) => ({
    publicId: r.publicId,
    displayName: r.displayName,
    rank: r.rank,
    tied: r.tied,
    totalPoints: centsToPoints(r.totalCents),
    weeklyPoints: Object.fromEntries(Object.entries(r.weeklyCents).map(([w, c]) => [Number(w), centsToPoints(c)])),
    challengesCompleted: r.challengesCompleted,
    movement: r.movement,
    gapToNext: r.gapToNextCents === null ? null : centsToPoints(r.gapToNextCents),
  }));
  return {
    season: {
      slug: season.publicSlug,
      name: season.name,
      status: season.status,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      totalWeeks: 8,
      throughWeek: standings.throughWeek,
      currentWeek: currentWeek(season.startsOn, season.endsOn, now),
      participantCount: standings.rows.length,
      truncated: standings.rows.length > PUBLIC_ROW_LIMIT,
    },
    challenges: challenges.map(toPublicChallenge).filter((c): c is PublicChallenge => c !== null).sort((a, b) => a.weekNumber - b.weekNumber),
    standings: rows,
    generatedAt: now.toISOString(),
  };
}
