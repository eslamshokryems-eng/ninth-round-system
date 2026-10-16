import { describe, expect, it } from "vitest";
import { buildStandings } from "./standings";
import { PUBLIC_CHALLENGE_KEYS, PUBLIC_SEASON_KEYS, PUBLIC_STANDING_KEYS, currentWeek, toPublicLeague } from "./public";
import { parseCsv, validateParticipantCsv, participantIdentityKey } from "./import";
import { defaultDirection, requireChallengeTransition, requireSeasonTransition, toPublicDisplayName, validateChallenge, validateDisplayName, validateMetric, validatePointsSchedule, validateResultValue, validateSeasonDates, weekWindow } from "./validation";
import { LeagueError, parseLeagueError } from "./errors";
import { PROVISIONAL_SEASON_RULES, type Challenge, type LedgerEntry, type Participant, type Season } from "./types";

const P = (id: string, name: string, extra: Partial<Participant> = {}): Participant => ({ id, seasonId: "s", publicId: `pub-${id}`, displayName: name, externalRef: `secret-${id}`, active: true, eligible: true, ...extra });
const C = (id: string, week: number, status: Challenge["status"] = "closed"): Challenge => ({
  id, seasonId: "s", weekNumber: week, name: `Week ${week}`, description: "", instructions: "", safetyNotes: "", metric: { kind: "REPS", unit: "reps", direction: "HIGHER_WINS" },
  attemptPolicy: { maxAttempts: 1, counting: "BEST" }, opensAt: null, closesAt: null, referenceUrl: null, requiresVerification: true, status,
});
const L = (challengeId: string, participantId: string, pointsCents: number, rank: number | null = 1): LedgerEntry => ({ seasonId: "s", challengeId, participantId, pointsCents, rank, reason: "AWARD" });
const season: Season = { id: "s", publicSlug: "season-1", name: "Season 1", status: "active", startsOn: "2026-11-02", endsOn: "2026-12-27", rules: PROVISIONAL_SEASON_RULES, published: true };

describe("season and challenge validation", () => {
  it("a season runs exactly eight weeks", () => {
    expect(() => validateSeasonDates("2026-11-02", "2026-12-27")).not.toThrow();
    expect(() => validateSeasonDates("2026-11-02", "2026-12-20")).toThrow(LeagueError);
    expect(() => validateSeasonDates("2026-11-02", "2026-12-28")).toThrow(/8 weeks/);
    expect(() => validateSeasonDates("2026-02-30", "2026-04-26")).toThrow(/calendar/);
  });
  it("week windows tile the season", () => {
    expect(weekWindow("2026-11-02", 1)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekWindow("2026-11-02", 8)).toEqual({ from: "2026-12-21", to: "2026-12-27" });
    expect(() => weekWindow("2026-11-02", 9)).toThrow();
  });
  it("season and challenge states only move forward; completed and closed are final", () => {
    expect(() => requireSeasonTransition("draft", "scheduled")).not.toThrow();
    expect(() => requireSeasonTransition("completed", "active")).toThrow(/cannot go/);
    expect(() => requireSeasonTransition("draft", "active")).toThrow();
    expect(() => requireChallengeTransition("closed", "open")).toThrow();
    expect(() => requireChallengeTransition("open", "closed")).not.toThrow();
  });
  it("metrics: explicit kinds, closed unit lists, and a ranking direction that matches the kind", () => {
    expect(() => validateMetric({ kind: "TIME", unit: "s", direction: "LOWER_WINS" })).not.toThrow();
    expect(() => validateMetric({ kind: "TIME", unit: "s", direction: "HIGHER_WINS" })).toThrow();
    expect(() => validateMetric({ kind: "REPS", unit: "kg", direction: "HIGHER_WINS" })).toThrow(/not allowed/);
    expect(() => validateMetric({ kind: "DISTANCE", unit: "m", direction: "LOWER_WINS" })).toThrow();
    expect(() => validateMetric({ kind: "NUMERIC", unit: "watts", direction: "LOWER_WINS" })).not.toThrow(); // a numeric metric may rank either way
    expect(() => validateMetric({ kind: "EVAL" as never, unit: "s", direction: "LOWER_WINS" })).toThrow();
    expect(defaultDirection("TIME")).toBe("LOWER_WINS");
  });
  it("challenge fields are bounded; the reference link must be https; the window needs both ends and must sit inside the week", () => {
    const ok = { weekNumber: 1, name: "Plank", description: "", instructions: "", safetyNotes: "", metric: { kind: "TIME" as const, unit: "s", direction: "LOWER_WINS" as const }, attemptPolicy: { maxAttempts: 2, counting: "BEST" as const }, opensAt: "2026-11-02T06:00:00Z", closesAt: "2026-11-08T20:00:00Z", referenceUrl: "https://example.com/v", requiresVerification: true };
    expect(() => validateChallenge(ok, season)).not.toThrow();
    expect(() => validateChallenge({ ...ok, name: "x" }, season)).toThrow();
    expect(() => validateChallenge({ ...ok, referenceUrl: "javascript:alert(1)" }, season)).toThrow(/https/);
    expect(() => validateChallenge({ ...ok, closesAt: null }, season)).toThrow(/both/);
    expect(() => validateChallenge({ ...ok, closesAt: "2026-11-01T00:00:00Z" }, season)).toThrow(/after it opens/);
    expect(() => validateChallenge({ ...ok, closesAt: "2026-12-30T00:00:00Z" }, season)).toThrow(/within/);
    expect(() => validateChallenge({ ...ok, attemptPolicy: { maxAttempts: 0, counting: "BEST" } }, season)).toThrow();
    expect(() => validateChallenge({ ...ok, weekNumber: 9 }, season)).toThrow();
  });
  it("points tables: bounded, two decimals, never rewarding a worse rank more", () => {
    expect(() => validatePointsSchedule({ byRank: [10, 8], beyond: 1, participation: 1, absent: 0 })).not.toThrow();
    expect(() => validatePointsSchedule({ byRank: [8, 10], beyond: 1, participation: 1, absent: 0 })).toThrow(/fewer/);
    expect(() => validatePointsSchedule({ byRank: [10.005], beyond: 1, participation: 1, absent: 0 })).toThrow(/two decimals/);
    expect(() => validatePointsSchedule({ byRank: [-1], beyond: 1, participation: 1, absent: 0 })).toThrow();
    expect(() => validatePointsSchedule({ byRank: [], beyond: 1, participation: 1, absent: 0 })).toThrow();
  });
  it("result values: finite, non-negative, bounded, whole reps", () => {
    const reps = { kind: "REPS" as const, unit: "reps", direction: "HIGHER_WINS" as const };
    expect(validateResultValue(30, reps)).toBe(30);
    expect(() => validateResultValue(Number.NaN, reps)).toThrow();
    expect(() => validateResultValue(-1, reps)).toThrow();
    expect(() => validateResultValue(10.5, reps)).toThrow(/whole/);
    expect(() => validateResultValue(2_000_000, reps)).toThrow(/range/);
    expect(validateResultValue(61.234, { kind: "TIME", unit: "s", direction: "LOWER_WINS" })).toBe(61.234);
    expect(() => validateResultValue(61.2345, { kind: "TIME", unit: "s", direction: "LOWER_WINS" })).toThrow(/three decimals/);
  });
  it("display names are public-safe", () => {
    expect(toPublicDisplayName("Ahmed Khaled Mostafa")).toBe("Ahmed M.");
    expect(toPublicDisplayName("  Sara  ")).toBe("Sara");
    expect(() => validateDisplayName("=SUM(A1)")).toThrow();
    expect(() => validateDisplayName("<b>x</b>")).toThrow();
    expect(() => validateDisplayName("a")).toThrow();
  });
  it("database error text maps to a stable code", () => {
    expect(parseLeagueError("LEAGUE_SELF_REVIEW: you recorded this")).toEqual({ code: "LEAGUE_SELF_REVIEW", message: "you recorded this" });
    expect(parseLeagueError("permission denied")).toBeNull();
  });
});

describe("standings", () => {
  const people = [P("a", "Ahmed K."), P("b", "Bassem R."), P("c", "Chris T."), P("d", "Dina S.", { active: false })];
  it("totals, weekly points, completed challenges and shared ranks", () => {
    const s = buildStandings(people, [L("c1", "a", 2500, 1), L("c1", "b", 2000, 2), L("c2", "b", 2500, 1), L("c2", "a", 2000, 2), L("c2", "c", 1600, 3)], [C("c1", 1), C("c2", 2)]);
    expect(s.throughWeek).toBe(2);
    const by = Object.fromEntries(s.rows.map((r) => [r.displayName, r]));
    expect(by["Ahmed K."]).toMatchObject({ rank: 1, totalCents: 4500, challengesCompleted: 2, firstPlaces: 1 });
    expect(by["Bassem R."]).toMatchObject({ rank: 1, totalCents: 4500, firstPlaces: 1 }); // equal totals share rank 1
    expect(by["Chris T."]).toMatchObject({ rank: 3, totalCents: 1600, challengesCompleted: 1, weeklyCents: { 2: 1600 }, gapToNextCents: 2900 });
    expect(by["Dina S."]).toMatchObject({ rank: 4, totalCents: 0 }); // nobody silently disappears
  });
  it("movement compares with the standing before the latest closed week; gap is to the next better total", () => {
    const s = buildStandings(people, [L("c1", "a", 2500), L("c1", "b", 2000), L("c1", "c", 1600), L("c2", "c", 2500), L("c2", "b", 2000)], [C("c1", 1), C("c2", 2)]);
    const c = s.rows.find((r) => r.displayName === "Chris T.");
    expect(s.rows[0]?.displayName).toBe("Chris T."); // 4100 vs 4000 (b) vs 2500 (a)
    expect(c?.rank).toBe(1);
    expect(c?.movement).toBe(2); // from 3rd to 1st
    expect(s.rows.find((r) => r.displayName === "Ahmed K.")?.movement).toBe(-2);
    expect(c?.gapToNextCents).toBeNull();
  });
  it("no movement on the first week", () => {
    const s = buildStandings(people, [L("c1", "a", 2500)], [C("c1", 1)]);
    expect(s.rows[0]?.movement).toBeNull();
  });
  it("same-total display order is stable: first places, then name", () => {
    const s = buildStandings([P("z", "Zed"), P("y", "Yara")], [L("c1", "z", 100, 2), L("c1", "y", 100, 2)], [C("c1", 1)]);
    expect(s.rows.map((r) => r.displayName)).toEqual(["Yara", "Zed"]);
    expect(s.rows.map((r) => r.rank)).toEqual([1, 1]);
  });
  it("is the ledger that decides: a reversing line lowers the total", () => {
    const s = buildStandings(people, [L("c1", "a", 2500), L("c1", "a", -2500, null)], [C("c1", 1)]);
    expect(s.rows.find((r) => r.displayName === "Ahmed K.")).toMatchObject({ totalCents: 0, challengesCompleted: 0 });
  });
});

describe("public projection", () => {
  const people = [P("a", "Ahmed K.")];
  const challenges = [C("c1", 1), C("c2", 2, "draft"), C("c3", 3, "published")];
  const standings = buildStandings(people, [L("c1", "a", 2500)], challenges);
  it("an unpublished season yields nothing", () => expect(toPublicLeague({ ...season, published: false }, challenges, standings, new Date())).toBeNull());
  it("exposes only the allow-listed fields — no internal id, external reference, rules or contact data", () => {
    const pub = toPublicLeague(season, challenges, standings, new Date("2026-11-10T10:00:00Z"));
    expect(pub).not.toBeNull();
    expect(Object.keys(pub?.standings[0] ?? {}).sort()).toEqual([...PUBLIC_STANDING_KEYS].sort());
    expect(Object.keys(pub?.season ?? {}).sort()).toEqual([...PUBLIC_SEASON_KEYS].sort());
    expect(Object.keys(pub?.challenges[0] ?? {}).sort()).toEqual([...PUBLIC_CHALLENGE_KEYS].sort());
    const json = JSON.stringify(pub);
    expect(json).not.toContain("secret-a");
    expect(json).not.toContain('"id"');
    expect(json).not.toContain("participantId");
    expect(json).not.toContain("externalRef");
    expect(pub?.challenges.map((c) => c.weekNumber)).toEqual([1, 3]); // drafts are not public
    expect(pub?.standings[0]?.totalPoints).toBe(25);
    expect(pub?.season.currentWeek).toBe(2);
  });
  it("current week is null outside the season", () => {
    expect(currentWeek("2026-11-02", "2026-12-27", new Date("2026-10-01T00:00:00Z"))).toBeNull();
    expect(currentWeek("2026-11-02", "2026-12-27", new Date("2026-12-27T23:00:00Z"))).toBe(8);
    expect(currentWeek("2026-11-02", "2026-12-27", new Date("2026-12-29T00:00:00Z"))).toBeNull();
  });
});

describe("participant CSV import", () => {
  const csv = (s: string) => s.trim().replace(/^ +/gm, "");
  it("accepts a clean file and reduces full names to a public name", () => {
    const r = validateParticipantCsv(csv(`full_name,external_member_ref,eligible
      Ahmed Khaled Mostafa,M-100,yes
      Sara Nabil,M-101,no`));
    expect(r.issues).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, displayName: "Ahmed M.", externalRef: "M-100", eligible: true },
      { line: 3, displayName: "Sara N.", externalRef: "M-101", eligible: false },
    ]);
  });
  it("rejects unknown columns, duplicate columns and files without a name column", () => {
    expect(() => validateParticipantCsv("display_name,phone\nA B,0100")).toThrow(/Unknown column/);
    expect(() => validateParticipantCsv("display_name,display_name\nA B,C D")).toThrow(/twice/);
    expect(() => validateParticipantCsv("external_member_ref\nM1")).toThrow(/display_name or full_name/);
    expect(() => validateParticipantCsv("")).toThrow(/empty/);
  });
  it("reports bad rows without stopping: formulas, bad eligibility, bad refs, wrong column count", () => {
    const r = validateParticipantCsv(csv(`display_name,external_member_ref,eligible
      =HYPERLINK("http://x"),M1,yes
      Good One,M2,maybe
      Another,bad ref!,yes
      Fine Person,M4
      Valid Person,M5,yes`));
    expect(r.rows.map((x) => x.displayName)).toEqual(["Valid Person"]);
    expect(r.issues.map((i) => i.line)).toEqual([2, 3, 4, 5]);
    expect(r.issues[0]?.message).toMatch(/formula/);
  });
  it("detects duplicates inside the file and against existing participants — never merging", () => {
    const existing = new Set([participantIdentityKey("Old Member", "M9")]);
    const r = validateParticipantCsv(csv(`display_name,external_member_ref
      Ahmed K.,M1
      Ahmed K.,M1
      Old Member,M9
      Other Person,`), existing);
    expect(r.rows.map((x) => x.line)).toEqual([2, 5]);
    expect(r.issues.map((i) => i.message)).toEqual(["Duplicate of line 2.", "Already a participant in this season."]);
  });
  it("handles quotes, CRLF and a BOM, and refuses an unclosed quote, binary data and oversize files", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(() => parseCsv('a,"b')).toThrow(/quote/);
    expect(() => validateParticipantCsv("display_name\nA\u0000B")).toThrow(/binary/);
    expect(() => validateParticipantCsv("display_name\n" + "x".repeat(1_100_000))).toThrow(/too large/);
  });
});
