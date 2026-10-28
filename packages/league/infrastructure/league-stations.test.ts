import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LeagueError, type LeagueErrorCode } from "../domain/errors";
import type { StationLayoutInput } from "../domain/layout";
import type { Actor } from "../domain/types";
import { buildDemoLeague, DEMO_SLUG, DEMO_USERS } from "./demo-fixtures";
import { InMemoryLeague } from "./in-memory-league";
import { SupabaseLeague } from "./supabase-league";

const NOW = new Date("2026-11-25T12:00:00Z");
const admin: Actor = DEMO_USERS.admin;
const judge: Actor = DEMO_USERS.judge;
const reviewer: Actor = DEMO_USERS.reviewer;
const outsider: Actor = DEMO_USERS.outsider;
const sv = (...v: number[]) => v.map((value, i) => ({ position: i + 1, value }));
const code = (c: LeagueErrorCode) => ({ code: c });
async function rejects(p: Promise<unknown>, c: LeagueErrorCode): Promise<void> {
  await expect(p).rejects.toMatchObject(code(c));
}

const L1: StationLayoutInput = {
  resultType: "REPS",
  stations: [
    { name: "Pull-ups", maxValue: 50, exercises: [{ name: "Strict pull-up", standard: "Chin over the bar", equipment: "Bar", target: "Max reps" }] },
    { name: "Squats", exercises: [{ name: "Air squat", standard: "Hip below the knee" }, { name: "Jump squat" }] },
    { name: "Dips", maxValue: 40, exercises: [{ name: "Bench dip" }] },
  ],
};
const L1b: StationLayoutInput = { ...L1, stations: [L1.stations[0]!, { name: "Squats", exercises: [{ name: "Goblet squat", equipment: "Kettlebell" }] }, L1.stations[2]!] };

/** A season with a REPS circuit (verified), a TIME pair (not verified), a COMPLETION checklist and a plain REPS week; five athletes. */
async function setup() {
  const l = new InMemoryLeague(admin, () => NOW);
  const s = await l.createSeason({ slug: "stations-season", name: "Stations", startsOn: "2026-11-02", endsOn: "2026-12-27" });
  l.state.staff.push({ seasonId: s, profileId: judge.id, role: "JUDGE" }, { seasonId: s, profileId: reviewer.id, role: "REVIEWER" }, { seasonId: s, profileId: "second-admin", role: "LEAGUE_ADMIN" });
  const w1 = await l.upsertChallenge(s, 1, { name: "Circuit", metricKind: "REPS", unit: "reps", maxAttempts: 2, requiresVerification: true });
  const w2 = await l.upsertChallenge(s, 2, { name: "Row and ski", metricKind: "TIME", unit: "s", maxAttempts: 2, requiresVerification: false });
  const w3 = await l.upsertChallenge(s, 3, { name: "Checklist", metricKind: "NUMERIC", unit: "count", maxAttempts: 1, requiresVerification: false });
  const w4 = await l.upsertChallenge(s, 4, { name: "Plain", metricKind: "REPS", unit: "reps", maxAttempts: 2, requiresVerification: false });
  const w5 = await l.upsertChallenge(s, 5, { name: "Heavy", metricKind: "LOAD", unit: "kg", maxAttempts: 2, requiresVerification: false });
  for (const [n, r] of [["Sam A.", "M-1"], ["Bo B.", "M-2"], ["Cy C.", "M-3"], ["Di D.", "M-4"], ["Ed E.", "M-5"]] as const) await l.addParticipant(s, n, r, true);
  const p = Object.fromEntries(l.state.participants.map((x) => [x.displayName[0] as string, x.id])) as Record<"S" | "B" | "C" | "D" | "E", string>;
  return { l, s, w1, w2, w3, w4, w5, ...p };
}
async function openAll(l: InMemoryLeague, s: string, ids: string[]) {
  await l.as(admin).setSeasonStatus(s, "scheduled");
  for (const c of ids) await l.setChallengeStatus(c, "published");
  await l.setSeasonStatus(s, "active");
  for (const c of ids) await l.setChallengeStatus(c, "open");
}
const TIME2: StationLayoutInput = { resultType: "TIME", stations: [{ name: "Row", exercises: [{ name: "Row 500 m" }] }, { name: "Ski", maxValue: 600, exercises: [{ name: "Ski 500 m" }] }] };
const COMP4: StationLayoutInput = { resultType: "COMPLETION", stations: [1, 2, 3, 4].map((n) => ({ name: `S${n}`, exercises: [{ name: `Move ${n}` }] })) };

describe("station layouts — configuring (InMemoryLeague mirrors the database rules)", () => {
  it("only an administrator of THIS season configures a layout; staff read it; everyone else is refused", async () => {
    const { l, s, w1 } = await setup();
    for (const who of [outsider, judge, reviewer, null]) await rejects(l.as(who).setLayout(w1, L1, "first"), "LEAGUE_FORBIDDEN");
    const other: Actor = { id: "other-admin", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
    await l.as(other).createSeason({ slug: "other-season", name: "Other", startsOn: "2026-11-02", endsOn: "2026-12-27" });
    await rejects(l.setLayout(w1, L1, "first"), "LEAGUE_FORBIDDEN");
    await rejects(l.getLayout(w1), "LEAGUE_FORBIDDEN");
    await rejects(l.stationBreakdown(w1), "LEAGUE_FORBIDDEN");
    await l.as(admin).setLayout(w1, L1, "week 1 circuit");
    for (const who of [admin, judge, reviewer]) expect((await l.as(who).getLayout(w1))?.version).toBe(1);
    await rejects(l.as(outsider).getLayout(w1), "LEAGUE_FORBIDDEN");
    expect(s).toBeTruthy();
  });
  it("a reason is mandatory, and a refused request stores nothing", async () => {
    const { l, w1 } = await setup();
    await rejects(l.setLayout(w1, L1, ""), "LEAGUE_REASON_REQUIRED");
    await rejects(l.setLayout(w1, L1, "   "), "LEAGUE_REASON_REQUIRED");
    expect(l.state.layouts).toHaveLength(0);
    expect(await l.getLayout(w1)).toBeNull();
  });
  it("the layout is validated against the challenge: LOAD and mixed types are refused, a TIME layout needs a TIME challenge", async () => {
    const { l, w1, w5, w3 } = await setup();
    await rejects(l.setLayout(w5, { resultType: "LOAD" as never, stations: L1.stations }, "heavy"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w1, { resultType: "MIXED" as never, stations: L1.stations }, "mixed"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w1, TIME2, "wrong type"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w3, L1, "wrong type"), "LEAGUE_INVALID");
    await expect(l.setLayout(w3, COMP4, "checklist")).resolves.toMatchObject({ version: 1 });
  });
  it("a station needs a safe name; markup and spreadsheet formulas are refused", async () => {
    const { l, w1 } = await setup();
    await rejects(l.setLayout(w1, { resultType: "REPS", stations: [{ name: "<b>x</b>", exercises: [{ name: "a" }] }] }, "markup"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w1, { resultType: "REPS", stations: [{ name: "=SUM(A1)", exercises: [{ name: "a" }] }] }, "formula"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w1, { resultType: "REPS", stations: [] }, "empty"), "LEAGUE_INVALID");
  });
  it("substituting an exercise creates version 2 with a reason; version 1 stays readable and unchanged", async () => {
    const { l, w1 } = await setup();
    await l.setLayout(w1, L1, "first");
    await expect(l.setLayout(w1, L1b, "no rack today: goblet squats")).resolves.toMatchObject({ version: 2 });
    expect((await l.getLayout(w1))?.stations[1]?.exercises[0]?.name).toBe("Goblet squat");
    expect((await l.getLayout(w1, 1))?.stations[1]?.exercises[0]?.name).toBe("Air squat");
    expect((await l.getLayout(w1))?.versions.map((v) => v.reason)).toEqual(["first", "no rack today: goblet squats"]);
    const entry = (await l.audit(l.state.seasons[0]!.id)).find((a) => a.action === "league.layout.substitute");
    expect(JSON.stringify(entry?.metadata)).toContain("Air squat");
    expect(JSON.stringify(entry?.metadata)).toContain("Goblet squat");
  });
  it("submitting the identical layout again is refused (no empty version)", async () => {
    const { l, w1 } = await setup();
    await l.setLayout(w1, L1, "first");
    await rejects(l.setLayout(w1, L1, "again"), "LEAGUE_INVALID");
    expect(l.state.layouts).toHaveLength(1);
  });
  it("the metric and unit are fixed once a challenge has a layout (the name is not)", async () => {
    const { l, s, w3 } = await setup();
    await l.setLayout(w3, COMP4, "checklist");
    await rejects(l.upsertChallenge(s, 3, { metricKind: "REPS", unit: "reps" }), "LEAGUE_INVALID");
    await rejects(l.upsertChallenge(s, 3, { unit: "points" }), "LEAGUE_INVALID");
    await expect(l.upsertChallenge(s, 3, { name: "Checklist (renamed)" })).resolves.toBe(w3);
  });
  it("a closed challenge and a completed season cannot change their layout", async () => {
    const { l, s, w1 } = await setup();
    await l.setLayout(w1, L1, "first");
    await openAll(l, s, [w1]);
    await l.setChallengeStatus(w1, "closed");
    await rejects(l.setLayout(w1, L1b, "after close"), "LEAGUE_INVALID");
    const w2 = l.state.challenges.find((c) => c.weekNumber === 2)!.id;
    await l.setLayout(w2, TIME2, "row and ski").catch(() => undefined);
  });
});

describe("station layouts — judging", () => {
  async function ready() {
    const t = await setup();
    await t.l.setLayout(t.w1, L1, "week 1 circuit");
    await t.l.setLayout(t.w2, TIME2, "row and ski");
    await t.l.setLayout(t.w3, COMP4, "checklist");
    await openAll(t.l, t.s, [t.w1, t.w2, t.w3, t.w4]);
    return t;
  }
  it("the attempt value is the SUM of the station values; it starts pending and carries its version and station rows", async () => {
    const { l, w1, S } = await ready();
    const r = await l.as(judge).recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(10, 12, 8), clientRequestId: "r1" });
    expect(r).toMatchObject({ value: 30, status: "pending", replay: false, layoutVersion: 1 });
    expect(l.state.stationResults.filter((x) => x.attemptId === r.id).map((x) => x.value)).toEqual([10, 12, 8]);
  });
  it("only a judge or administrator records; the base rules (eligibility, limit, open challenge) still apply", async () => {
    const { l, w1, S, B } = await ready();
    for (const who of [outsider, reviewer, null]) await rejects(l.as(who).recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(1, 1, 1), clientRequestId: "x" }), "LEAGUE_FORBIDDEN");
    l.as(judge);
    await l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(1, 1, 1), clientRequestId: "a" });
    await l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(2, 2, 2), clientRequestId: "b" });
    await rejects(l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(3, 3, 3), clientRequestId: "c" }), "LEAGUE_ATTEMPT_LIMIT");
    expect(l.state.stationResults.filter((x) => l.state.attempts.find((a) => a.id === x.attemptId)?.participantId === S)).toHaveLength(6);
    l.as(admin);
    await l.setParticipant(B, { active: false }, "left");
    await rejects(l.as(judge).recordStationAttempt({ challengeId: w1, participantId: B, layoutVersion: 1, values: sv(1, 1, 1), clientRequestId: "d" }), "LEAGUE_NOT_ELIGIBLE");
    expect(l.state.attempts.some((a) => a.participantId === B)).toBe(false);
  });
  it("a bad value is refused and leaves nothing behind (no attempt, no station row)", async () => {
    const { l, w1, S } = await ready();
    l.as(judge);
    for (const values of [sv(1, 2), sv(1, 2, 3, 4), [{ position: 1, value: 1 }, { position: 1, value: 2 }, { position: 3, value: 3 }], sv(-1, 2, 3), sv(51, 2, 3), sv(1, 2.5, 3), sv(1, 2, 41)]) {
      await rejects(l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values, clientRequestId: "bad" }), "LEAGUE_INVALID");
    }
    expect(l.state.attempts).toHaveLength(0);
    expect(l.state.stationResults).toHaveLength(0);
  });
  it("a retry of the same request returns the original attempt, whatever the retry carries", async () => {
    const { l, w1, S } = await ready();
    l.as(judge);
    const first = await l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(10, 12, 8), clientRequestId: "same" });
    const again = await l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(40, 40, 40), clientRequestId: "same" });
    expect(again).toMatchObject({ id: first.id, replay: true, value: 30 });
    expect(l.state.attempts).toHaveLength(1);
    expect(l.state.stationResults).toHaveLength(3);
  });
  it("a form built from an older version is refused after a substitution (LEAGUE_LAYOUT_CHANGED); the current version works", async () => {
    const { l, w1, S, B } = await ready();
    await l.as(admin).setLayout(w1, L1b, "goblet squats");
    l.as(judge);
    await rejects(l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(1, 1, 1), clientRequestId: "old" }), "LEAGUE_LAYOUT_CHANGED");
    await rejects(l.recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 3, values: sv(1, 1, 1), clientRequestId: "future" }), "LEAGUE_LAYOUT_CHANGED");
    await expect(l.recordStationAttempt({ challengeId: w1, participantId: B, layoutVersion: 2, values: sv(1, 1, 1), clientRequestId: "ok" })).resolves.toMatchObject({ layoutVersion: 2 });
  });
  it("after the first attempt the structure is frozen; exercises can still be substituted; a layout cannot be introduced late", async () => {
    const { l, w1, w4, S } = await ready();
    await l.as(judge).recordStationAttempt({ challengeId: w1, participantId: S, layoutVersion: 1, values: sv(1, 1, 1), clientRequestId: "first" });
    l.as(admin);
    await rejects(l.setLayout(w1, { resultType: "REPS", stations: [L1.stations[0]!] }, "fewer"), "LEAGUE_INVALID");
    await rejects(l.setLayout(w1, { resultType: "REPS", stations: [{ ...L1.stations[0]!, maxValue: 60 }, L1.stations[1]!, L1.stations[2]!] }, "bigger cap"), "LEAGUE_INVALID");
    await expect(l.setLayout(w1, L1b, "goblet squats")).resolves.toMatchObject({ version: 2 });
    await l.as(judge).recordAttempt({ challengeId: w4, participantId: S, value: 25, clientRequestId: "plain" });
    await rejects(l.as(admin).setLayout(w4, L1, "too late"), "LEAGUE_INVALID");
  });
  it("TIME, COMPLETION and DISTANCE layouts add up in the challenge's unit", async () => {
    const { l, w2, w3, S } = await ready();
    l.as(judge);
    expect((await l.recordStationAttempt({ challengeId: w2, participantId: S, layoutVersion: 1, values: sv(30.5, 40.25), clientRequestId: "t" })).value).toBe(70.75);
    expect((await l.recordStationAttempt({ challengeId: w3, participantId: S, layoutVersion: 1, values: sv(1, 1, 0, 1), clientRequestId: "c" })).value).toBe(3);
    await rejects(l.recordStationAttempt({ challengeId: w2, participantId: S, layoutVersion: 1, values: sv(1, 601), clientRequestId: "cap" }), "LEAGUE_INVALID");
    await rejects(l.recordStationAttempt({ challengeId: w3, participantId: S, layoutVersion: 1, values: sv(1, 2, 0, 1), clientRequestId: "two" }), "LEAGUE_INVALID");
  });
  it("without a layout a challenge takes no station form, and behaves exactly as before", async () => {
    const { l, w4, S } = await ready();
    await rejects(l.as(judge).recordStationAttempt({ challengeId: w4, participantId: S, layoutVersion: 1, values: sv(5), clientRequestId: "x" }), "LEAGUE_INVALID");
    await expect(l.recordAttempt({ challengeId: w4, participantId: S, value: 25, clientRequestId: "plain" })).resolves.toMatchObject({ value: 25 });
    expect(l.state.stationResults).toHaveLength(0);
    expect(await l.as(admin).getLayout(w4)).toBeNull();
  });
});

describe("station layouts — the commit-time rule: generic single-value paths fail closed", () => {
  async function withAttempt() {
    const t = await setup();
    await t.l.setLayout(t.w1, L1, "circuit");
    await openAll(t.l, t.s, [t.w1]);
    const a = await t.l.as(judge).recordStationAttempt({ challengeId: t.w1, participantId: t.S, layoutVersion: 1, values: sv(10, 12, 8), clientRequestId: "a" });
    return { ...t, a };
  }
  it("a plain single-value attempt on a station challenge is refused and stores nothing", async () => {
    const { l, w1, B, a } = await withAttempt();
    await rejects(l.as(judge).recordAttempt({ challengeId: w1, participantId: B, value: 30, clientRequestId: "plain" }), "LEAGUE_INVALID");
    expect(l.state.attempts.map((x) => x.id)).toEqual([a.id]);
  });
  it("the ordinary errors win over the station rule, as they do in the database", async () => {
    const { l, w1, B } = await withAttempt();
    await l.as(admin).setParticipant(B, { active: false }, "left");
    await rejects(l.as(judge).recordAttempt({ challengeId: w1, participantId: B, value: 30, clientRequestId: "plain" }), "LEAGUE_NOT_ELIGIBLE");
  });
  it("a single-number correction of a station attempt is refused; voiding is not", async () => {
    const { l, a } = await withAttempt();
    await rejects(l.as(admin).correctAttempt(a.id, 99, "bare total"), "LEAGUE_INVALID");
    expect(l.state.attempts.find((x) => x.id === a.id)?.status).toBe("pending");
    expect(l.state.corrections).toHaveLength(0);
    await l.correctAttempt(a.id, null, "wrong athlete");
    expect(l.state.attempts.find((x) => x.id === a.id)?.status).toBe("void");
    expect(l.state.stationResults.filter((x) => x.attemptId === a.id)).toHaveLength(3);
  });
  it("applying a judge's bare-total request is refused and leaves the request pending", async () => {
    const { l, a } = await withAttempt();
    const req = await l.as(judge).requestCorrection(a.id, 99, "I think it is 99");
    await rejects(l.as(admin).decideCorrectionRequest(req, "apply", "applying"), "LEAGUE_INVALID");
    expect(l.state.correctionRequests.find((r) => r.id === req)?.status).toBe("pending");
    expect(l.state.attempts).toHaveLength(1);
    await l.decideCorrectionRequest(req, "decline", "the sheet says 30");
    expect(l.state.correctionRequests.find((r) => r.id === req)?.status).toBe("declined");
  });
});

describe("station layouts — review, ties, corrections, breakdown", () => {
  async function closedWeek() {
    const t = await setup();
    await t.l.setLayout(t.w1, L1, "circuit");
    await openAll(t.l, t.s, [t.w1]);
    const { l, w1 } = t;
    l.as(judge);
    const rec = (p: string, v: number[], r: string, ver = 1) => l.recordStationAttempt({ challengeId: w1, participantId: p, layoutVersion: ver, values: sv(...v), clientRequestId: r });
    const a1 = await rec(t.S, [10, 12, 8], "s1");
    await l.as(admin).setLayout(w1, L1b, "goblet squats");
    l.as(judge);
    const a2 = await rec(t.S, [12, 12, 12], "s2", 2);
    const b = await rec(t.B, [14, 14, 14], "b", 2);
    const c = await rec(t.C, [20, 10, 12], "c", 2);
    const d = await rec(t.D, [4, 4, 4], "d", 2);
    const e = await rec(t.E, [8, 6, 6], "e", 2);
    for (const x of [a1, a2, b, c, d, e]) await l.as(reviewer).reviewAttempt(x.id, "approve");
    await l.as(admin).setChallengeStatus(w1, "closed");
    return { ...t, a1, a2, b, c, d, e };
  }
  const pts = (l: InMemoryLeague, p: string) => l.state.ledger.filter((x) => x.participantId === p).reduce((n, x) => n + x.pointsCents, 0);
  const rank = (l: InMemoryLeague, p: string) => l.state.ledger.filter((x) => x.participantId === p).at(-1)?.rank;
  it("review is the base workflow; equal TOTALS tie however the stations were distributed", async () => {
    const { l, B, C, S, E, D } = await closedWeek();
    expect([pts(l, B), rank(l, B)]).toEqual([10000, 1]);
    expect([pts(l, C), rank(l, C)]).toEqual([10000, 1]);
    expect([pts(l, S), rank(l, S)]).toEqual([8000, 3]); // best of 30 and 36
    expect([pts(l, E), rank(l, E)]).toEqual([7500, 4]);
    expect([pts(l, D), rank(l, D)]).toEqual([7000, 5]);
  });
  it("a per-station correction goes through the one correction path: void + approved replacement, appended differences, permanent record, audit", async () => {
    const { l, d, D, S, E } = await closedWeek();
    const before = l.state.ledger.length;
    const r = await l.as(admin).correctStationAttempt(d.id, sv(14, 14, 10), "recount of the station sheet");
    expect(r).toMatchObject({ total: 38, layoutVersion: 2 });
    expect(l.state.attempts.find((x) => x.id === d.id)?.status).toBe("void");
    const repl = l.state.attempts.find((x) => x.correctedFrom === d.id)!;
    expect(repl).toMatchObject({ value: 38, status: "approved" });
    expect(l.state.stationResults.filter((x) => x.attemptId === repl.id).map((x) => x.value)).toEqual([14, 14, 10]);
    expect(l.state.stationResults.filter((x) => x.attemptId === d.id)).toHaveLength(3); // history is never rewritten
    expect([pts(l, D), rank(l, D)]).toEqual([8000, 3]);
    expect([pts(l, S), rank(l, S)]).toEqual([7500, 4]);
    expect([pts(l, E), rank(l, E)]).toEqual([7000, 5]);
    expect(l.state.ledger.length - before).toBe(3);
    expect(l.state.corrections.at(-1)).toMatchObject({ attemptId: d.id, previousValue: 12, newValue: 38, reason: "recount of the station sheet" });
    expect((await l.audit(l.state.seasons[0]!.id, 200)).some((a) => a.action === "league.attempt.stations.correct")).toBe(true);
  });
  it("a correction stays under the version of the attempt it replaces, and is validated against the layout", async () => {
    const { l, a1 } = await closedWeek();
    l.as(admin);
    await rejects(l.correctStationAttempt(a1.id, sv(51, 12, 8), "cap"), "LEAGUE_INVALID");
    await rejects(l.correctStationAttempt(a1.id, sv(11, 12), "short"), "LEAGUE_INVALID");
    await rejects(l.correctStationAttempt(a1.id, sv(11, 12, 8), ""), "LEAGUE_REASON_REQUIRED");
    expect(l.state.attempts.find((x) => x.id === a1.id)?.status).toBe("approved");
    const r = await l.correctStationAttempt(a1.id, sv(11, 12, 8), "first attempt recount");
    expect(r.layoutVersion).toBe(1);
    const repl = l.state.attempts.find((x) => x.correctedFrom === a1.id)!;
    const layoutId = l.state.stationResults.find((x) => x.attemptId === repl.id)!.layoutId;
    expect(l.state.layouts.find((x) => x.id === layoutId)?.version).toBe(1);
    await rejects(l.correctStationAttempt(a1.id, sv(1, 1, 1), "already void"), "LEAGUE_INVALID");
  });
  it("only an administrator corrects; an attempt without a breakdown is corrected the ordinary way", async () => {
    const { l, e, w4, S } = await closedWeek();
    for (const who of [judge, reviewer, outsider, null]) await rejects(l.as(who).correctStationAttempt(e.id, sv(1, 1, 1), "no"), "LEAGUE_FORBIDDEN");
    await l.as(admin).setChallengeStatus(w4, "published");
    await l.setChallengeStatus(w4, "open");
    const plain = await l.as(judge).recordAttempt({ challengeId: w4, participantId: S, value: 25, clientRequestId: "p" });
    await rejects(l.as(admin).correctStationAttempt(plain.id, sv(1, 1, 1), "no breakdown"), "LEAGUE_INVALID");
    await expect(l.correctAttempt(plain.id, 26, "recount")).resolves.toMatchObject({ ledgerLines: 0 });
  });
  it("the breakdown lists every attempt with its per-station values and version (staff only)", async () => {
    const { l, w1, a1, d } = await closedWeek();
    await rejects(l.as(outsider).stationBreakdown(w1), "LEAGUE_FORBIDDEN");
    const rows = await l.as(reviewer).stationBreakdown(w1);
    expect(rows).toHaveLength(6);
    const first = rows.find((r) => r.attemptId === a1.id)!;
    expect(first).toMatchObject({ layoutVersion: 1, value: 30, displayName: "Sam A." });
    expect(first.stations.map((x) => [x.name, x.value])).toEqual([["Pull-ups", 10], ["Squats", 12], ["Dips", 8]]);
    expect(rows.find((r) => r.attemptId === d.id)?.layoutVersion).toBe(2);
  });
});

describe("station layouts — privacy and independence", () => {
  it("public pages carry no exercise, station, standard or equipment data", async () => {
    const demo = await buildDemoLeague(NOW);
    const pub = JSON.stringify(await demo.league.as(null).publicLeague(DEMO_SLUG));
    const week = JSON.stringify(await demo.league.as(null).publicChallengeResults(DEMO_SLUG, 1));
    for (const text of [pub, week]) expect(text).not.toMatch(/two-hand|goblet|hips fully|hip crease|chest to the floor|exercise|layout|station|maxvalue/i);
    // ... while staff do see the demo layout
    const staffView = await demo.league.as(DEMO_USERS.admin).getLayout(demo.league.state.challenges.find((c) => c.weekNumber === 7)!.id);
    expect(staffView?.stations).toHaveLength(3);
  });
  it("the station code never touches the race engine (no import, no race table)", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const sources = [read("../domain/layout.ts"), read("./supabase-league.ts"), read("./in-memory-league.ts")];
    for (const src of sources) {
      expect(src).not.toMatch(/@9thround\/race/);
      expect(src).not.toMatch(/\brace_(stations|events|clock|station_results|start_slots|heats)\b/);
    }
    const migration = read("../../../supabase-race/proposed/league/20261101000002_race_league_stations.sql").replace(/^\s*--.*$/gm, "");
    expect(migration).not.toMatch(/\brace_(stations|events|clock|station_results|start_slots|heats|event_)\w*/);
    expect(migration).not.toMatch(/references race_(?!league_|profiles)/);
  });
  it("the proposed stations migration is not in supabase/migrations and the gate is never opened by it", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const sql = read("../../../supabase-race/proposed/league/20261101000002_race_league_stations.sql").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/race_league_public_gate/);
    expect(sql).not.toMatch(/grant execute on function [^;]* to anon/i);
    expect(sql).not.toMatch(/\bgrant\b[^;]*\b(super|role|staff)\b/i);
  });
});

describe("SupabaseLeague — station layout RPCs (against a fake RPC client)", () => {
  const client = (reply: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message: string } }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return { calls, rpc: async (fn: string, args: Record<string, unknown> = {}) => { calls.push({ fn, args }); const r = reply(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } };
  };
  it("sends only the documented arguments, in the wire form the database validates again", async () => {
    const c = client(() => ({ data: { layoutId: "l", version: 1 } }));
    const g = new SupabaseLeague(c);
    await g.setLayout("ch", { resultType: "REPS", stations: [{ name: "A", maxValue: 9, exercises: [{ name: "x", standard: "s" }] }] }, "why");
    await g.getLayout("ch", 2);
    await g.recordStationAttempt({ challengeId: "ch", participantId: "p", layoutVersion: 2, values: sv(1, 2), clientRequestId: "r" });
    await g.correctStationAttempt("a", sv(3, 4), "fix");
    await g.stationBreakdown("ch");
    expect(c.calls[0]).toEqual({ fn: "race_league_set_layout", args: { p_challenge: "ch", p_layout: { result_type: "REPS", stations: [{ name: "A", max_value: 9, exercises: [{ name: "x", standard: "s" }] }] }, p_reason: "why" } });
    expect(c.calls[1]).toEqual({ fn: "race_league_get_layout", args: { p_challenge: "ch", p_version: 2 } });
    expect(c.calls[2]).toEqual({ fn: "race_league_record_station_attempt", args: { p_challenge: "ch", p_participant: "p", p_layout_version: 2, p_values: sv(1, 2), p_attempted_at: null, p_client_request_id: "r" } });
    expect(c.calls[3]).toEqual({ fn: "race_league_correct_station_attempt", args: { p_attempt: "a", p_values: sv(3, 4), p_reason: "fix" } });
    expect(c.calls[4]).toEqual({ fn: "race_league_station_breakdown", args: { p_challenge: "ch" } });
  });
  it("never lets the browser choose a total, a version row, a status or an approver", async () => {
    const c = client(() => ({ data: {} }));
    await new SupabaseLeague(c).recordStationAttempt({ challengeId: "ch", participantId: "p", layoutVersion: 1, values: sv(1), clientRequestId: "r" });
    expect(Object.keys(c.calls[0]!.args).sort()).toEqual(["p_attempted_at", "p_challenge", "p_client_request_id", "p_layout_version", "p_participant", "p_values"]);
  });
  it("maps the stale-layout refusal, and reads a missing stations migration as LEAGUE_UNAVAILABLE", async () => {
    const stale = new SupabaseLeague(client(() => ({ error: { message: "LEAGUE_LAYOUT_CHANGED: the exercises were changed (now version 3); reload the form and record again" } })));
    await expect(stale.recordStationAttempt({ challengeId: "c", participantId: "p", layoutVersion: 2, values: sv(1), clientRequestId: "r" })).rejects.toMatchObject({ code: "LEAGUE_LAYOUT_CHANGED" });
    const missing = new SupabaseLeague(client(() => ({ error: { code: "PGRST202", message: "Could not find the function public.race_league_get_layout" } })));
    await expect(missing.getLayout("c")).rejects.toMatchObject({ code: "LEAGUE_UNAVAILABLE" });
    await expect(missing.stationBreakdown("c")).rejects.toMatchObject({ code: "LEAGUE_UNAVAILABLE" });
    expect(new LeagueError("LEAGUE_LAYOUT_CHANGED", "x").code).toBe("LEAGUE_LAYOUT_CHANGED");
  });
});
