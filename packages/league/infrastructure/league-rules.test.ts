import { describe, expect, it } from "vitest";
import { LeagueError } from "../domain/errors";
import { PROVISIONAL_POINTS_SCHEDULE, PROVISIONAL_SEASON_RULES, type Actor } from "../domain/types";
import { InMemoryLeague } from "./in-memory-league";

/**
 * The owner-supplied PROVISIONAL rules (points table, ties, eligibility, 3 attempts / best counts, absence, corrections, appeals, CSV adapter),
 * asserted end to end through the same gateway the screens use. Provisional = configurable and replaceable, never hard-wired.
 */
const admin: Actor = { id: "admin-1", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
const admin2: Actor = { id: "admin-2", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
const judge: Actor = { id: "judge-1", isSuperAdmin: false, roles: ["JUDGE"] };
const reviewer: Actor = { id: "reviewer-1", isSuperAdmin: false, roles: ["REVIEWER"] };
const outsider: Actor = { id: "outsider", isSuperAdmin: false, roles: [] };
const T0 = Date.parse("2026-11-04T12:00:00Z");
let n = 0;
const REQ = (p: string) => `req-${p}-${++n}`;

async function rejects(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof LeagueError && e.code === code);
}

/** A season with `count` verified participants and challenge 1 (reps) open, driven by a movable clock. */
async function league(count = 12, opts: { verify?: boolean } = {}) {
  const clock = { t: T0 };
  const l = new InMemoryLeague(admin, () => new Date(clock.t));
  const s = await l.createSeason({ slug: "rules-season", name: "Rules", startsOn: "2026-11-02", endsOn: "2026-12-27" });
  l.state.staff.push({ seasonId: s, profileId: judge.id, role: "JUDGE" }, { seasonId: s, profileId: reviewer.id, role: "REVIEWER" }, { seasonId: s, profileId: admin2.id, role: "LEAGUE_ADMIN" });
  const c1 = await l.upsertChallenge(s, 1, { name: "Push-ups", metricKind: "REPS", unit: "reps", requiresVerification: opts.verify ?? true });
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) await l.addParticipant(s, `Athlete ${String(i).padStart(2, "0")}`, `M-${i}`, true);
  for (const p of l.state.participants) ids.push(p.id);
  await l.setSeasonStatus(s, "scheduled");
  await l.setSeasonStatus(s, "active");
  await l.setChallengeStatus(c1, "published");
  await l.setChallengeStatus(c1, "open");
  return { l, s, c1, ids, clock };
}
async function record(l: InMemoryLeague, c: string, p: string, v: number, approve = true) {
  const a = await l.as(judge).recordAttempt({ challengeId: c, participantId: p, value: v, clientRequestId: REQ(p) });
  if (approve && a.status === "pending") await l.as(reviewer).reviewAttempt(a.id, "approve");
  return a;
}
const points = (l: InMemoryLeague, c: string, p: string) => l.state.ledger.filter((e) => e.challengeId === c && e.participantId === p).reduce((x, e) => x + e.pointsCents, 0);

describe("rule 1 — the configurable points table", () => {
  it("is the owner's table: 100, 90, 80, 75, 70, 65, 60, 55, 50, then 40 for every other approved valid result", () => {
    expect(PROVISIONAL_POINTS_SCHEDULE).toEqual({ byRank: [100, 90, 80, 75, 70, 65, 60, 55, 50], beyond: 40, participation: 40, absent: 0 });
    expect(PROVISIONAL_SEASON_RULES.points).toBe(PROVISIONAL_POINTS_SCHEDULE);
  });
  it("awards ranks 1–9 their points and everyone else 40", async () => {
    const { l, c1, ids } = await league(12);
    for (const [i, id] of ids.entries()) await record(l, c1, id, 100 - i * 3); // distinct, descending: athlete 1 wins
    await l.as(admin).setChallengeStatus(c1, "closed");
    expect(ids.map((id) => points(l, c1, id) / 100)).toEqual([100, 90, 80, 75, 70, 65, 60, 55, 50, 40, 40, 40]);
  });
  it("is configurable: a new table re-scores closed challenges by appending, with a reason", async () => {
    const { l, s, c1, ids } = await league(3);
    for (const [i, id] of ids.entries()) await record(l, c1, id, 50 - i);
    await l.as(admin).setChallengeStatus(c1, "closed");
    await l.updateRules(s, { ...PROVISIONAL_SEASON_RULES, points: { byRank: [10, 5], beyond: 1, participation: 1, absent: 0 } }, "agreed table");
    expect(ids.map((id) => points(l, c1, id) / 100)).toEqual([10, 5, 1]);
    await rejects(l.updateRules(s, { ...PROVISIONAL_SEASON_RULES, points: { byRank: [10, 50], beyond: 1, participation: 1, absent: 0 } }, "worse rank pays more"), "LEAGUE_INVALID");
  });
});

describe("rule 2 — ties", () => {
  it("equal performance gets the same rank and the same points; the next rank is skipped (1, 2, 2, 4)", async () => {
    const { l, c1, ids } = await league(4);
    for (const [id, v] of [[ids[0], 60], [ids[1], 50], [ids[2], 50], [ids[3], 40]] as const) await record(l, c1, id as string, v);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const ranks = ids.map((id) => l.state.ledger.find((e) => e.participantId === id)?.rank);
    expect(ranks).toEqual([1, 2, 2, 4]);
    expect(ids.map((id) => points(l, c1, id) / 100)).toEqual([100, 90, 90, 75]);
  });
  it("equal season totals share a rank, are flagged as a tie, and stay a tie after week 8 and after completion — no invented tie-break", async () => {
    const { l, s, c1, ids } = await league(3);
    for (const [id, v] of [[ids[0], 60], [ids[1], 60], [ids[2], 10]] as const) await record(l, c1, id as string, v);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const rows = () => l.state.seasons[0] && l.overview(s).then((o) => o.standings);
    let st = (await rows()) ?? [];
    expect(st.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true], [3, false]]);
    await l.setSeasonStatus(s, "completed");
    await l.setPublished(s, true, "final table");
    st = (await rows()) ?? [];
    expect(st.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true], [3, false]]);
    const pub = await l.as(null).publicLeague("rules-season");
    expect(pub?.standings.map((r) => r.tied)).toEqual([true, true, false]);
  });
});

describe("rule 3 — eligibility at registration, preserved through the season", () => {
  it("registration requires staff to confirm an active, verified membership; anything else is refused", async () => {
    const { l, s } = await league(1);
    await rejects(l.as(admin).addParticipant(s, "No Membership", "M-X", false), "LEAGUE_NOT_ELIGIBLE");
    await rejects(l.as(judge).addParticipant(s, "By Judge", "M-J", true), "LEAGUE_FORBIDDEN");
    const r = await l.as(admin).importParticipants(s, "display_name,external_member_ref,membership_verified\nVerified One,M-91,yes\nExpired Two,M-92,no\nUnclear Three,M-93,\n");
    expect(r.added).toBe(1);
    expect(r.preview.issues.map((i) => i.line)).toEqual([3, 4]);
    expect(l.state.participants.every((p) => p.membershipVerifiedOn === "2026-11-04")).toBe(true);
  });
  it("an accepted participant keeps eligibility and results when time passes — nothing in the league reads a membership end date", async () => {
    const { l, s, c1, ids, clock } = await league(2);
    await record(l, c1, ids[0] as string, 40);
    await l.as(admin).setChallengeStatus(c1, "closed");
    clock.t += 200 * 86_400_000; // long after any membership could have expired
    await l.recompute(c1);
    expect((await l.overview(s)).participants.every((p) => p.eligible)).toBe(true);
    expect(points(l, c1, ids[0] as string)).toBe(10000);
  });
  it("only a documented DISCIPLINARY or FRAUD decision removes eligibility; it is recorded and reversible by REINSTATEMENT", async () => {
    const { l, s, c1, ids } = await league(2);
    await record(l, c1, ids[0] as string, 40);
    await record(l, c1, ids[1] as string, 30);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const [a] = ids as [string, string];
    await rejects(l.as(judge).setEligibility(a, false, "FRAUD", "x"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(admin).setEligibility(a, false, "FRAUD", ""), "LEAGUE_REASON_REQUIRED");
    await rejects(l.setEligibility(a, false, "REINSTATEMENT", "wrong type"), "LEAGUE_INVALID");
    await l.setEligibility(a, false, "FRAUD", "result invented — documented in case 7");
    expect(points(l, c1, a)).toBe(0);
    expect(points(l, c1, ids[1] as string)).toBe(10000); // the runner-up moves up; nothing was rewritten, only appended
    await rejects(l.setEligibility(a, true, "DISCIPLINARY", "wrong type"), "LEAGUE_INVALID");
    await l.setEligibility(a, true, "REINSTATEMENT", "decision overturned");
    expect(points(l, c1, a)).toBe(10000);
    const o = await l.as(admin).overview(s);
    expect(o.eligibilityDecisions.map((d) => [d.category, d.previousEligible, d.newEligible, d.decidedBy])).toEqual([["FRAUD", true, false, admin.id], ["REINSTATEMENT", false, true, admin.id]]);
    expect((await l.as(judge).overview(s)).eligibilityDecisions).toEqual([]);
  });
});

describe("rule 4 — up to 3 attempts, the best valid judge-approved attempt counts", () => {
  it("a new challenge defaults to 3 attempts / BEST; the fourth is refused", async () => {
    const { l, s, c1, ids } = await league(1);
    const ch = (await l.overview(s)).challenges.find((c) => c.id === c1);
    expect(ch?.attemptPolicy).toEqual({ maxAttempts: 3, counting: "BEST" });
    for (const v of [30, 45, 40]) await record(l, c1, ids[0] as string, v, false);
    await rejects(l.as(judge).recordAttempt({ challengeId: c1, participantId: ids[0] as string, value: 99, clientRequestId: REQ("4th") }), "LEAGUE_ATTEMPT_LIMIT");
  });
  it("counts the best APPROVED attempt: a better pending or rejected attempt is ignored", async () => {
    const { l, c1, ids } = await league(2);
    const p = ids[0] as string;
    const a1 = await record(l, c1, p, 30, true);
    const a2 = await record(l, c1, p, 50, false); // better but never approved
    const a3 = await record(l, c1, p, 45, false);
    await l.as(reviewer).reviewAttempt(a3.id, "approve");
    await l.reviewAttempt(a2.id, "reject", "foot over the line");
    await record(l, c1, ids[1] as string, 44);
    await l.as(admin).setChallengeStatus(c1, "closed");
    expect(l.state.attempts.find((t) => t.id === a1.id)?.status).toBe("approved");
    expect(points(l, c1, p)).toBe(10000); // 45 beats 44
  });
  it("supports lower- and higher-is-better in any unit family: a plank hold ranks the LONGER time first, a sprint the shorter", async () => {
    const { l, s } = await league(2);
    const hold = await l.as(admin).upsertChallenge(s, 2, { name: "Plank hold", metricKind: "TIME", unit: "s", direction: "HIGHER_WINS" });
    const sprint = await l.upsertChallenge(s, 3, { name: "Sprint", metricKind: "TIME", unit: "ms", direction: "LOWER_WINS" });
    const o = await l.overview(s);
    expect(o.challenges.filter((c) => [hold, sprint].includes(c.id)).map((c) => [c.metric.kind, c.metric.unit, c.metric.direction])).toEqual([["TIME", "s", "HIGHER_WINS"], ["TIME", "ms", "LOWER_WINS"]]);
    await rejects(l.upsertChallenge(s, 4, { name: "Bad unit", metricKind: "LOAD", unit: "reps" }), "LEAGUE_INVALID");
  });
});

describe("rule 5 — absence", () => {
  it("an absent participant gets 0, writes no ledger line, and is not in the performance ranking", async () => {
    const { l, s, c1, ids } = await league(3);
    await record(l, c1, ids[0] as string, 40);
    await record(l, c1, ids[1] as string, 30);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const absent = ids[2] as string;
    expect(points(l, c1, absent)).toBe(0);
    expect(l.state.ledger.filter((e) => e.participantId === absent)).toEqual([]);
    await l.setPublished(s, true, "preview").catch(() => undefined);
    const res = await l.as(null).publicChallengeResults("rules-season", 1);
    expect(res?.results.map((r) => r.rank)).toEqual([1, 2]);
    const st = (await l.as(admin).overview(s)).standings.find((r) => r.id === absent);
    expect(st).toMatchObject({ totalPoints: 0, challengesCompleted: 0, firstPlaces: 0 });
  });
});

describe("rule 6 — result corrections", () => {
  it("a judge cannot change an approved result; a judge can request a change; only an administrator applies it", async () => {
    const { l, c1, ids } = await league(2);
    const p = ids[0] as string;
    const a = await record(l, c1, p, 30);
    await rejects(l.as(judge).correctAttempt(a.id, 99, "typo"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(reviewer).correctAttempt(a.id, 99, "typo"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(outsider).requestCorrection(a.id, 33, "typo"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(reviewer).requestCorrection(a.id, 33, "typo"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(judge).requestCorrection(a.id, 33, ""), "LEAGUE_REASON_REQUIRED");
    const req = await l.as(judge).requestCorrection(a.id, 33, "misread the tally");
    expect(l.state.attempts.find((x) => x.id === a.id)?.value).toBe(30); // a request changes nothing
    await rejects(l.requestCorrection(a.id, 34, "again"), "LEAGUE_DUPLICATE");
    await rejects(l.as(judge).decideCorrectionRequest(req, "apply", "ok"), "LEAGUE_FORBIDDEN");
    await l.as(admin).setChallengeStatus(c1, "closed");
    await l.decideCorrectionRequest(req, "apply", "tally sheet confirms 33");
    expect(l.state.correctionRequests[0]).toMatchObject({ status: "applied", decidedBy: admin.id, proposedValue: 33 });
  });
  it("an applied correction keeps previous value, new value, actor, time and reason, re-scores by appending, and is audited", async () => {
    const { l, s, c1, ids, clock } = await league(2);
    const [x, y] = ids as [string, string];
    const a = await record(l, c1, x, 30);
    await record(l, c1, y, 40);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const before = JSON.stringify(l.state.ledger);
    clock.t += 3_600_000;
    await l.as(admin2).correctAttempt(a.id, 50, "judge mistyped 30 instead of 50");
    expect(JSON.stringify(l.state.ledger).startsWith(before.slice(0, -1))).toBe(true);
    expect(points(l, c1, x)).toBe(10000);
    expect(points(l, c1, y)).toBe(9000);
    expect(l.state.corrections).toHaveLength(1);
    expect(l.state.corrections[0]).toMatchObject({ attemptId: a.id, previousValue: 30, newValue: 50, actor: admin2.id, at: new Date(clock.t).toISOString(), reason: "judge mistyped 30 instead of 50", requestId: null });
    const audit = (await l.audit(s)).find((e) => e.action === "league.attempt.correct");
    expect(audit?.metadata).toMatchObject({ previousValue: 30, newValue: 50, reason: "judge mistyped 30 instead of 50" });
  });
  it("a declined request changes nothing; a request to remove a result removes its points; the season cannot complete with a request pending", async () => {
    const { l, s, c1, ids } = await league(2);
    const [x, y] = ids as [string, string];
    const a = await record(l, c1, x, 30);
    const b = await record(l, c1, y, 40);
    await l.as(admin).setChallengeStatus(c1, "closed");
    const r1 = await l.as(judge).requestCorrection(a.id, 99, "I think it was 99");
    await l.as(admin).decideCorrectionRequest(r1, "decline", "tally sheet says 30");
    expect(points(l, c1, x)).toBe(9000);
    await rejects(l.decideCorrectionRequest(r1, "apply", "late"), "LEAGUE_INVALID");
    const r2 = await l.as(judge).requestCorrection(b.id, null, "recorded for the wrong athlete");
    await rejects(l.as(admin).setSeasonStatus(s, "completed"), "LEAGUE_INVALID");
    await l.decideCorrectionRequest(r2, "apply", "confirmed");
    expect(points(l, c1, y)).toBe(0);
    expect(points(l, c1, x)).toBe(10000);
    await l.setSeasonStatus(s, "completed");
    await rejects(l.correctAttempt(a.id, 1, "after completion"), "LEAGUE_SEASON_LOCKED");
  });
});

describe("rule 7 — appeals", () => {
  async function published() {
    const w = await league(3);
    const { l, s, c1, ids } = w;
    for (const [i, id] of ids.entries()) await record(l, c1, id, 50 - i * 5);
    await l.as(admin).setChallengeStatus(c1, "closed");
    await l.setPublished(s, true, "week 1 results");
    return w;
  }
  it("is accepted inside the window (default 48 hours after publication) and refused after it, and before publication", async () => {
    const w = await league(2);
    const { l, s, c1, ids, clock } = w;
    for (const id of ids) await record(l, c1, id, 30);
    await rejects(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[0] as string, reason: "too early" }), "LEAGUE_APPEAL_CLOSED"); // not closed
    l.as(admin);
    await l.setChallengeStatus(c1, "closed");
    await rejects(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[0] as string, reason: "not public yet" }), "LEAGUE_APPEAL_CLOSED"); // closed but not published
    await l.as(admin).setPublished(s, true, "publish");
    clock.t += 47 * 3_600_000;
    await expect(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[0] as string, reason: "my count was higher" })).resolves.toBeTruthy();
    clock.t += 2 * 3_600_000; // now 49 hours after publication
    await rejects(l.lodgeAppeal({ challengeId: c1, participantId: ids[1] as string, reason: "too late" }), "LEAGUE_APPEAL_CLOSED");
  });
  it("the window is measured from whichever happened last — closing or publishing — and is a configurable rule", async () => {
    const { l, s, c1, ids, clock } = await league(2);
    for (const id of ids) await record(l, c1, id, 30);
    await l.as(admin).setChallengeStatus(c1, "closed"); // t0
    clock.t += 30 * 3_600_000;
    await l.setPublished(s, true, "published 30h after closing"); // the window starts here
    clock.t += 40 * 3_600_000; // 70h after closing, 40h after publishing
    await expect(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[0] as string, reason: "ok" })).resolves.toBeTruthy();
    await l.as(admin).updateRules(s, { ...PROVISIONAL_SEASON_RULES, appealWindowHours: 24 }, "shorter window");
    await rejects(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[1] as string, reason: "late under 24h rule" }), "LEAGUE_APPEAL_CLOSED");
  });
  it("one appeal per participant per result; staff only; a reason is required", async () => {
    const { l, c1, ids } = await published();
    const [x] = ids as [string];
    await rejects(l.as(outsider).lodgeAppeal({ challengeId: c1, participantId: x, reason: "r" }), "LEAGUE_FORBIDDEN");
    await rejects(l.as(null).lodgeAppeal({ challengeId: c1, participantId: x, reason: "r" }), "LEAGUE_FORBIDDEN");
    await rejects(l.as(judge).lodgeAppeal({ challengeId: c1, participantId: x, reason: "  " }), "LEAGUE_REASON_REQUIRED");
    await l.as(judge).lodgeAppeal({ challengeId: c1, participantId: x, reason: "count" });
    await rejects(l.lodgeAppeal({ challengeId: c1, participantId: x, reason: "again" }), "LEAGUE_DUPLICATE");
  });
  it("only an administrator who did NOT record the result may decide; the decision and reason are kept; no score ever moves", async () => {
    const { l, s, c1, ids } = await published();
    const x = ids[0] as string;
    // admin-1 enters a correction on x, which makes admin-1 a recorder of x's result
    const a = l.state.attempts.find((t) => t.participantId === x && t.status === "approved") as { id: string };
    await l.as(admin).correctAttempt(a.id, 55, "tally recount");
    const appeal = await l.as(judge).lodgeAppeal({ challengeId: c1, participantId: x, reason: "I believe my count was 60" });
    const ledger = JSON.stringify(l.state.ledger);
    await rejects(l.as(judge).decideAppeal(appeal, "upheld", "r"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(reviewer).decideAppeal(appeal, "dismissed", "r"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(admin).decideAppeal(appeal, "upheld", "r"), "LEAGUE_CONFLICT_OF_INTEREST");
    await rejects(l.as(admin2).decideAppeal(appeal, "upheld", ""), "LEAGUE_REASON_REQUIRED");
    await l.as(admin2).decideAppeal(appeal, "upheld", "video review supports a recount");
    expect(l.state.appeals[0]).toMatchObject({ status: "upheld", decidedBy: admin2.id, decisionReason: "video review supports a recount" });
    expect(JSON.stringify(l.state.ledger)).toBe(ledger); // an appeal never changes a score by itself
    await rejects(l.as(admin2).decideAppeal(appeal, "dismissed", "again"), "LEAGUE_INVALID");
    expect((await l.as(admin).overview(s)).appeals).toHaveLength(1);
    expect((await l.as(judge).overview(s)).appeals).toEqual([]); // a participant's own words are administrators-only
    expect(l.state.audit.map((e) => e.action)).toEqual(expect.arrayContaining(["league.appeal.lodge", "league.appeal.upheld"]));
  });
  it("a completed season cannot complete with an open appeal", async () => {
    const { l, s, c1, ids } = await published();
    const ap = await l.as(judge).lodgeAppeal({ challengeId: c1, participantId: ids[1] as string, reason: "recount please" });
    await rejects(l.as(admin).setSeasonStatus(s, "completed"), "LEAGUE_INVALID");
    await l.as(admin2).decideAppeal(ap, "dismissed", "count verified on video");
    await expect(l.as(admin).setSeasonStatus(s, "completed")).resolves.toBeUndefined();
  });
});

describe("rule 8 — no gym database; CSV adapter only", () => {
  it("the gateway has no method that reads a member system, and external references are opaque strings only", async () => {
    const { l } = await league(1);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(l)).filter((m) => /gym|member|sync/i.test(m))).toEqual([]);
  });
});
