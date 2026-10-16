import { LeagueError } from "./errors";
import {
  CHALLENGE_TRANSITIONS,
  METRIC_KINDS,
  METRIC_UNITS,
  SEASON_TRANSITIONS,
  SEASON_WEEKS,
  type AttemptPolicy,
  type Challenge,
  type ChallengeStatus,
  type CountingPolicy,
  type Metric,
  type MetricKind,
  type PointsSchedule,
  type RankDirection,
  type SeasonRules,
  type SeasonStatus,
} from "./types";

const bad = (message: string): never => {
  throw new LeagueError("LEAGUE_INVALID", message);
};

const DAY_MS = 86_400_000;

export function parseIsoDate(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad(`${label} must be a date (YYYY-MM-DD).`);
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) return bad(`${label} is not a real calendar date.`);
  return t;
}

/** An eight-week season runs exactly 56 days: ends_on = starts_on + 55. */
export function validateSeasonDates(startsOn: string, endsOn: string): void {
  const s = parseIsoDate(startsOn, "Start date");
  const e = parseIsoDate(endsOn, "End date");
  if ((e - s) / DAY_MS !== SEASON_WEEKS * 7 - 1) bad(`A season runs exactly ${SEASON_WEEKS} weeks (${SEASON_WEEKS * 7} days, start and end included).`);
}

/** The start and end date of week N (1-based) of a season. */
export function weekWindow(startsOn: string, weekNumber: number): { from: string; to: string } {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > SEASON_WEEKS) bad(`Week must be 1 to ${SEASON_WEEKS}.`);
  const s = parseIsoDate(startsOn, "Start date");
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(s + (weekNumber - 1) * 7 * DAY_MS), to: iso(s + ((weekNumber - 1) * 7 + 6) * DAY_MS) };
}

export function requireSeasonTransition(from: SeasonStatus, to: SeasonStatus): void {
  if (!SEASON_TRANSITIONS[from].includes(to)) throw new LeagueError("LEAGUE_INVALID_TRANSITION", `A season cannot go from ${from} to ${to}.`);
}
export function requireChallengeTransition(from: ChallengeStatus, to: ChallengeStatus): void {
  if (!CHALLENGE_TRANSITIONS[from].includes(to)) throw new LeagueError("LEAGUE_INVALID_TRANSITION", `A challenge cannot go from ${from} to ${to}.`);
}

/** TIME and a lower-is-better metric are the natural pair, but nothing is assumed: NUMERIC may go either way, the rest follow their kind unless stated. */
export function defaultDirection(kind: MetricKind): RankDirection {
  return kind === "TIME" ? "LOWER_WINS" : "HIGHER_WINS";
}

export function validateMetric(m: Metric): Metric {
  if (!METRIC_KINDS.includes(m.kind)) bad("Unknown challenge type.");
  if (!METRIC_UNITS[m.kind].includes(m.unit)) bad(`Unit "${m.unit}" is not allowed for a ${m.kind} challenge (allowed: ${METRIC_UNITS[m.kind].join(", ")}).`);
  if (m.direction !== "LOWER_WINS" && m.direction !== "HIGHER_WINS") bad("Ranking direction must be LOWER_WINS or HIGHER_WINS.");
  if (m.kind === "TIME" && m.direction !== "LOWER_WINS") bad("A time challenge ranks the lower valid time first.");
  if ((m.kind === "REPS" || m.kind === "DISTANCE") && m.direction !== "HIGHER_WINS") bad(`A ${m.kind.toLowerCase()} challenge ranks the higher valid result first.`);
  return m;
}

export function validateAttemptPolicy(p: AttemptPolicy): AttemptPolicy {
  if (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1 || p.maxAttempts > 10) bad("Attempts per challenge must be a whole number from 1 to 10.");
  const counting: readonly CountingPolicy[] = ["BEST", "LATEST", "FIRST_APPROVED"];
  if (!counting.includes(p.counting)) bad("Unknown attempt-counting rule.");
  return p;
}

const TEXT_MAX = { name: 80, description: 1000, instructions: 2000, safetyNotes: 1000 } as const;

export function validateChallenge(c: Omit<Challenge, "id" | "seasonId" | "status">, season: { startsOn: string }): void {
  if (!Number.isInteger(c.weekNumber) || c.weekNumber < 1 || c.weekNumber > SEASON_WEEKS) bad(`Week must be 1 to ${SEASON_WEEKS}.`);
  const name = c.name.trim();
  if (name.length < 2 || name.length > TEXT_MAX.name) bad(`Challenge name must be 2–${TEXT_MAX.name} characters.`);
  if (c.description.length > TEXT_MAX.description) bad("Description is too long.");
  if (c.instructions.length > TEXT_MAX.instructions) bad("Instructions are too long.");
  if (c.safetyNotes.length > TEXT_MAX.safetyNotes) bad("Safety notes are too long.");
  validateMetric(c.metric);
  validateAttemptPolicy(c.attemptPolicy);
  if (c.referenceUrl !== null && !/^https:\/\/[^\s]+$/.test(c.referenceUrl)) bad("The reference link must be an https:// address.");
  if ((c.opensAt === null) !== (c.closesAt === null)) bad("Set both the opening and the closing time, or neither.");
  if (c.opensAt !== null && c.closesAt !== null) {
    const o = Date.parse(c.opensAt);
    const x = Date.parse(c.closesAt);
    if (Number.isNaN(o) || Number.isNaN(x)) bad("The participation window must use valid timestamps.");
    if (x <= o) bad("The challenge must close after it opens.");
    const w = weekWindow(season.startsOn, c.weekNumber);
    if (o < Date.parse(`${w.from}T00:00:00Z`) - DAY_MS || x > Date.parse(`${w.to}T00:00:00Z`) + 2 * DAY_MS) bad("The participation window must fall within the challenge's week.");
  }
}

const cents = (n: number): number => Math.round(n * 100);

export function validatePointsSchedule(s: PointsSchedule): PointsSchedule {
  if (!Array.isArray(s.byRank) || s.byRank.length < 1 || s.byRank.length > 100) bad("The points table needs 1 to 100 ranks.");
  const all = [...s.byRank, s.beyond, s.participation, s.absent];
  for (const p of all) {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 10_000) bad("Points must be numbers from 0 to 10000.");
    if (Math.abs(p * 100 - cents(p)) > 1e-6) bad("Points can have at most two decimals.");
  }
  for (let i = 1; i < s.byRank.length; i++) if ((s.byRank[i] as number) > (s.byRank[i - 1] as number)) bad("A better rank can never earn fewer points than a worse one.");
  return s;
}

export function validateRules(r: SeasonRules): SeasonRules {
  validatePointsSchedule(r.points);
  if (r.tiePolicy !== "SHARE" && r.tiePolicy !== "SPLIT") bad("Unknown tie policy.");
  if (r.absencePolicy !== "ZERO" && r.absencePolicy !== "PARTICIPATION") bad("Unknown absence policy.");
  if (r.eligibility !== "AT_REGISTRATION" && r.eligibility !== "ENTIRE_SEASON") bad("Unknown eligibility policy.");
  return r;
}

/** A measured value: finite, non-negative, at most three decimals, bounded. */
export function validateResultValue(value: number, metric: Metric): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return bad("The result must be a number.");
  if (value < 0) return bad("A result cannot be negative.");
  if (value > 1_000_000) return bad("That result is out of range.");
  if (Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-6) return bad("A result can have at most three decimals.");
  if (metric.kind === "REPS" && !Number.isInteger(value)) return bad("Repetitions must be a whole number.");
  if (metric.direction === "HIGHER_WINS" && value === 0 && metric.kind === "REPS") return value; // zero reps is a valid (poor) result
  return value;
}

export function validateDisplayName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 40) return bad("A display name must be 2–40 characters.");
  if (/^[=+\-@\t\r]/.test(n)) return bad("A display name cannot start with = + - or @.");
  if (/[<>]/.test(n) || [...n].some((ch) => ch.charCodeAt(0) < 32)) return bad("A display name contains characters that are not allowed.");
  return n;
}

/** "Ahmed Khaled Mostafa" → "Ahmed M." — public pages show a first name and a last initial, never a full name. */
export function toPublicDisplayName(fullName: string): string {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return bad("A name is required.");
  const first = parts[0] as string;
  const last = parts.length > 1 ? (parts[parts.length - 1] as string) : "";
  const initial = last ? ` ${[...last][0]?.toUpperCase() ?? ""}.` : "";
  return validateDisplayName(`${first}${initial}`);
}
