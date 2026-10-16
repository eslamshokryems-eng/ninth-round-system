import { describe, expect, it } from "vitest";
import { LeagueError, type LeagueErrorCode } from "../domain/errors";
import { PUBLIC_STANDING_KEYS } from "../domain/public";
import type { Actor } from "../domain/types";
import { buildDemoLeague, DEMO_SLUG, DEMO_USERS } from "./demo-fixtures";
import { InMemoryLeague } from "./in-memory-league";
import { SupabaseLeague } from "./supabase-league";

const NOW = new Date("2026-11-25T12:00:00Z"); // a Wednesday, inside week 4 of a season starting Mon 2026-11-02
const admin: Actor = DEMO_USERS.admin;
const judge: Actor = DEMO_USERS.judge;
const reviewer: Actor = DEMO_USERS.reviewer;
const outsider: Actor = DEMO_USERS.outsider;
const REQ = (n: string) => `req-${n}`;

async function rejects(p: Promise<unknown>, code: LeagueErrorCode): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

/** A small season: week 1 reps (verified, 2 attempts, BEST), week 2 time (not verified). */
async function small() {
  const l = new InMemoryLeague(admin, () => NOW);
  const s = await l.createSeason({ slug: "small-season", name: "Small", startsOn: "2026-11-02", endsOn: "2026-12-27" });
  l.state.staff.push({ seasonId: s, profileId: judge.id, role: "JUDGE" }, { seasonId: s, profileId: reviewer.id, role: "REVIEWER" });
  const c1 = await l.upsertChallenge(s, 1, { name: "Push-ups", metricKind: "REPS", unit: "reps", maxAttempts: 2, requiresVerification: true });
  const c2 = await l.upsertChallenge(s, 2, { name: "Plank run", metricKind: "TIME", unit: "s", maxAttempts: 1, requiresVerification: false });
  for (const n of ["Ahmed K.", "Bassem R.", "Chris T."]) await l.addParticipant(s, n, `M-${n[0]}`, true);
  const p = Object.fromEntries(l.state.participants.map((x) => [x.displayName[0] as string, x.id]));
  return { l, s, c1: c1, c2: c2, A: p.A as string, B: p.B as string, C: p.C as string };
}
async function open(l: InMemoryLeague, s: string, c: string) {
  await l.as(admin).setSeasonStatus(s, "scheduled").catch(() => undefined);
  await l.setSeasonStatus(s, "active").catch(() => undefined);
  await l.setChallengeStatus(c, "published");
  await l.setChallengeStatus(c, "open");
}

describe("InMemoryLeague — authorization", () => {
  it("only an administrator can create a season, change status, rules, challenges or participants", async () => {
    const { l, s, c1 } = await small();
    for (const who of [outsider, judge, reviewer, null]) {
      l.as(who);
      await rejects(l.setSeasonStatus(s, "scheduled"), "LEAGUE_FORBIDDEN");
      await rejects(l.updateRules(s, l.state.seasons[0]!.rules, "x"), "LEAGUE_FORBIDDEN");
      await rejects(l.upsertChallenge(s, 3, { name: "No", metricKind: "REPS", unit: "reps" }), "LEAGUE_FORBIDDEN");
      await rejects(l.setChallengeStatus(c1, "published"), "LEAGUE_FORBIDDEN");
      await rejects(l.addParticipant(s, "Nobody", null, true), "LEAGUE_FORBIDDEN");
      await rejects(l.audit(s), "LEAGUE_FORBIDDEN");
    }
    await rejects(l.as(outsider).createSeason({ slug: "mine", name: "Mine", startsOn: "2026-11-02", endsOn: "2026-12-27" }), "LEAGUE_FORBIDDEN");
    await rejects(l.as(null).createSeason({ slug: "mine", name: "Mine", startsOn: "2026-11-02", endsOn: "2026-12-27" }), "LEAGUE_FORBIDDEN");
  });
  it("the administrator of another season has no access here", async () => {
    const { l, s } = await small();
    const other: Actor = { id: "other-admin", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
    const s2 = await l.as(other).createSeason({ slug: "other-season", name: "Other", startsOn: "2026-11-02", endsOn: "2026-12-27" });
    await rejects(l.setSeasonStatus(s, "scheduled"), "LEAGUE_FORBIDDEN");
    await rejects(l.overview(s), "LEAGUE_FORBIDDEN");
    await expect(l.overview(s2)).resolves.toBeTruthy();
    expect((await l.mySeasons()).map((x) => x.slug)).toEqual(["other-season"]);
  });
  it("a judge records but cannot review; a reviewer reviews but cannot record", async () => {
    const { l, s, c1, A } = await small();
    await open(l, s, c1);
    await rejects(l.as(reviewer).recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("r") }), "LEAGUE_FORBIDDEN");
    await rejects(l.as(outsider).recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("o") }), "LEAGUE_FORBIDDEN");
    const a = await l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("j") });
    await rejects(l.as(judge).reviewAttempt(a.id, "approve"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(outsider).reviewAttempt(a.id, "approve"), "LEAGUE_FORBIDDEN");
  });
  it("nobody approves their own recorded result — not even an administrator", async () => {
    const { l, s, c1, A } = await small();
    await open(l, s, c1);
    const a = await l.as(admin).recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("a") });
    await rejects(l.as(admin).reviewAttempt(a.id, "approve"), "LEAGUE_SELF_REVIEW");
    await expect(l.as(reviewer).reviewAttempt(a.id, "approve")).resolves.toMatchObject({ status: "approved", reviewedBy: reviewer.id });
  });
  it("staff reads: a judge never receives external member references; an administrator does", async () => {
    const { l, s } = await small();
    expect((await l.as(judge).overview(s)).participants.every((p) => p.externalRef === null)).toBe(true);
    expect((await l.as(admin).overview(s)).participants.every((p) => p.externalRef !== null)).toBe(true);
    expect((await l.as(judge).overview(s)).staff).toBeNull();
  });
});

describe("InMemoryLeague — lifecycle", () => {
  it("season and challenge states only move along the allowed path", async () => {
    const { l, s, c1 } = await small();
    await rejects(l.setSeasonStatus(s, "active"), "LEAGUE_INVALID_TRANSITION");
    await rejects(l.setPublished(s, true, "go"), "LEAGUE_INVALID");
    await rejects(l.setPublished(s, true, ""), "LEAGUE_REASON_REQUIRED");
    await l.setSeasonStatus(s, "scheduled");
    await rejects(l.setChallengeStatus(c1, "open"), "LEAGUE_INVALID_TRANSITION");
    await l.setChallengeStatus(c1, "published");
    await rejects(l.setChallengeStatus(c1, "open"), "LEAGUE_INVALID");           // season not active yet
    await l.setSeasonStatus(s, "active");
    await l.setChallengeStatus(c1, "open");
    await l.setChallengeStatus(c1, "closed");
    await rejects(l.setChallengeStatus(c1, "open"), "LEAGUE_INVALID_TRANSITION"); // a closed challenge never reopens
  });
  it("a season is exactly eight weeks, an address is unique, a challenge week is 1..8", async () => {
    const { l, s } = await small();
    await rejects(l.createSeason({ slug: "short", name: "Short", startsOn: "2026-11-02", endsOn: "2026-12-20" }), "LEAGUE_INVALID");
    await rejects(l.createSeason({ slug: "small-season", name: "Dup", startsOn: "2026-11-02", endsOn: "2026-12-27" }), "LEAGUE_DUPLICATE");
    await rejects(l.upsertChallenge(s, 9, { name: "Nine", metricKind: "REPS", unit: "reps" }), "LEAGUE_INVALID");
    await rejects(l.upsertChallenge(s, 3, { name: "Bad", metricKind: "TIME", unit: "s", direction: "HIGHER_WINS" }), "LEAGUE_INVALID");
  });
  it("completion needs nothing open and nothing pending, and is final", async () => {
    const { l, s, c1, A } = await small();
    await open(l, s, c1);
    const a = await l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 20, clientRequestId: REQ("p") });
    await rejects(l.as(admin).setSeasonStatus(s, "completed"), "LEAGUE_INVALID");               // open challenge
    await rejects(l.setChallengeStatus(c1, "closed"), "LEAGUE_INVALID");                        // pending attempt
    await l.as(reviewer).reviewAttempt(a.id, "approve");
    await l.as(admin).setChallengeStatus(c1, "closed");
    await l.setSeasonStatus(s, "completed");
    await rejects(l.setSeasonStatus(s, "active"), "LEAGUE_INVALID_TRANSITION");
    await rejects(l.correctAttempt(a.id, 99, "late"), "LEAGUE_SEASON_LOCKED");
    await rejects(l.updateRules(s, l.state.seasons[0]!.rules, "late"), "LEAGUE_SEASON_LOCKED");
    await rejects(l.addParticipant(s, "Late Joiner", null, true), "LEAGUE_SEASON_LOCKED");
    await rejects(l.upsertChallenge(s, 5, { name: "Too late", metricKind: "REPS", unit: "reps" }), "LEAGUE_SEASON_LOCKED");
    await expect(l.setPublished(s, true, "final table")).resolves.toBeUndefined();               // publishing the final table is still allowed
  });
});

describe("InMemoryLeague — attempts", () => {
  it("validates the value, the window of time, eligibility and the open state", async () => {
    const { l, s, c1, A } = await small();
    await rejects(l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 5, clientRequestId: REQ("early") }), "LEAGUE_CHALLENGE_NOT_OPEN");
    await open(l, s, c1);
    l.as(judge);
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: -1, clientRequestId: REQ("n") }), "LEAGUE_INVALID");
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: 10.5, clientRequestId: REQ("f") }), "LEAGUE_INVALID");
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: Number.NaN, clientRequestId: REQ("nan") }), "LEAGUE_INVALID");
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: 5, attemptedAt: "2027-01-01T00:00:00Z", clientRequestId: REQ("fu") }), "LEAGUE_INVALID");
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: 5, clientRequestId: "" }), "LEAGUE_INVALID");
    await rejects(l.recordAttempt({ challengeId: c1, participantId: "nobody", value: 5, clientRequestId: REQ("np") }), "LEAGUE_NOT_FOUND");
    await l.as(admin).setParticipant(A, { eligible: false }, "not a member any more");
    await rejects(l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 5, clientRequestId: REQ("ne") }), "LEAGUE_NOT_ELIGIBLE");
  });
  it("is idempotent: a retried request returns the original and never doubles", async () => {
    const { l, s, c1, A } = await small();
    await open(l, s, c1);
    l.as(judge);
    const first = await l.recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("same") });
    const again = await l.recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("same") });
    expect(first.replay).toBe(false);
    expect(again).toMatchObject({ replay: true, id: first.id });
    expect(l.state.attempts).toHaveLength(1);
  });
  it("enforces the attempt limit (a rejected attempt does not use one up)", async () => {
    const { l, s, c1, A } = await small();
    await open(l, s, c1);
    const a1 = await l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 10, clientRequestId: REQ("1") });
    await l.recordAttempt({ challengeId: c1, participantId: A, value: 12, clientRequestId: REQ("2") });
    await rejects(l.recordAttempt({ challengeId: c1, participantId: A, value: 14, clientRequestId: REQ("3") }), "LEAGUE_ATTEMPT_LIMIT");
    await l.as(reviewer).reviewAttempt(a1.id, "reject", "not to depth");
    await expect(l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 14, clientRequestId: REQ("4") })).resolves.toMatchObject({ attemptNo: 3 });
  });
  it("a challenge without verification counts an attempt at once; one with verification waits", async () => {
    const { l, s, c1, c2, A } = await small();
    await open(l, s, c1); await l.as(admin).setChallengeStatus(c2, "published"); await l.setChallengeStatus(c2, "open");
    expect((await l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 5, clientRequestId: REQ("v") })).status).toBe("pending");
    expect((await l.recordAttempt({ challengeId: c2, participantId: A, value: 61, clientRequestId: REQ("nv") })).status).toBe("approved");
  });
  it("review: rejection needs a reason, a decided attempt cannot be decided again, approving twice replays", async () => {
    const { l, s, c1, A, B } = await small();
    await open(l, s, c1);
    const a = await l.as(judge).recordAttempt({ challengeId: c1, participantId: A, value: 30, clientRequestId: REQ("a") });
    const b = await l.recordAttempt({ challengeId: c1, participantId: B, value: 31, clientRequestId: REQ("b") });
    await rejects(l.as(reviewer).reviewAttempt(a.id, "reject"), "LEAGUE_REASON_REQUIRED");
    await l.reviewAttempt(a.id, "approve");
    await expect(l.reviewAttempt(a.id, "approve")).resolves.toMatchObject({ status: "approved" });
    await rejects(l.as({ ...reviewer, id: "rev-2" }).reviewAttempt(a.id, "reject", "changed my mind"), "LEAGUE_FORBIDDEN"); // not staff
    await l.as(reviewer).reviewAttempt(b.id, "approve");
  });
});

describe("InMemoryLeague — points", () => {
  async function played() {
    const x = await small();
    const { l, s, c1, A, B, C } = x;
    await open(l, s, c1);
    l.as(judge);
    const ids: string[] = [];
    for (const [p, v] of [[A, 30], [B, 42], [C, 42]] as const) ids.push((await l.recordAttempt({ challengeId: c1, participantId: p, value: v, clientRequestId: REQ(p) })).id);
    l.as(reviewer);
    for (const id of ids) await l.reviewAttempt(id, "approve");
    await l.as(admin).setChallengeStatus(c1, "closed");
    return { ...x, ids };
  }
  const total = (l: InMemoryLeague, id: string, ch: string) => l.state.ledger.filter((e) => e.participantId === id && e.challengeId === ch).reduce((n, e) => n + e.pointsCents, 0);
  it("closing awards once; ties share rank 1; the next rank is skipped; recomputing adds nothing", async () => {
    const { l, c1, A, B, C } = await played();
    expect([total(l, B, c1), total(l, C, c1), total(l, A, c1)]).toEqual([2500, 2500, 1600]);
    const before = l.state.ledger.length;
    expect(await l.recompute(c1)).toBe(0);
    expect(l.state.ledger).toHaveLength(before);
  });
  it("a correction appends the difference; the rest follow; voiding reverses; nothing is rewritten", async () => {
    const { l, c1, A, B, ids } = await played();
    const snapshot = JSON.stringify(l.state.ledger);
    await l.as(admin).correctAttempt(ids[0] as string, 50, "judge mistyped 30");
    expect(total(l, A, c1)).toBe(2500);
    expect(total(l, B, c1)).toBe(2000);
    expect(JSON.stringify(l.state.ledger).startsWith(snapshot.slice(0, -1))).toBe(true); // earlier lines untouched, new ones appended
    await l.correctAttempt(ids[1] as string, null, "recorded for the wrong person");
    expect(total(l, B, c1)).toBe(0);
    await rejects(l.as(reviewer).correctAttempt(ids[2] as string, 1, "x"), "LEAGUE_FORBIDDEN");
    await rejects(l.as(admin).correctAttempt(ids[2] as string, 1, ""), "LEAGUE_REASON_REQUIRED");
    expect(l.state.audit.some((e) => e.action === "league.attempt.correct")).toBe(true);
  });
  it("changing the rules re-scores closed challenges by appending; the same rules again change nothing", async () => {
    const { l, s, c1, B } = await played();
    const rules = { ...l.state.seasons[0]!.rules, points: { byRank: [10, 8, 6], beyond: 1, participation: 1, absent: 0 } };
    expect(await l.as(admin).updateRules(s, rules, "agreed table")).toBeGreaterThan(0);
    expect(total(l, B, c1)).toBe(1000);
    expect(await l.updateRules(s, rules, "again")).toBe(0);
    await rejects(l.updateRules(s, { ...rules, points: { ...rules.points, byRank: [1, 5] } }, "bad"), "LEAGUE_INVALID");
  });
  it("an inactive participant keeps earned points; an ineligible one loses them", async () => {
    const { l, c1, C } = await played();
    await l.as(admin).setParticipant(C, { active: false }, "left");
    expect(total(l, C, c1)).toBe(2500);
    await l.setParticipant(C, { eligible: false }, "not eligible after all");
    expect(total(l, C, c1)).toBe(0);
  });
});

describe("InMemoryLeague — import", () => {
  it("imports clean rows, reports bad/duplicate rows, never merges, and needs an administrator", async () => {
    const { l, s } = await small();
    const r = await l.as(admin).importParticipants(s, "display_name,external_member_ref\nDina S.,M-D\nAhmed K.,M-A\n=BAD(),M-X\nEman F.,M-E\n");
    expect(r.added).toBe(2);
    expect(r.issues.map((i) => i.row).sort()).toEqual([3, 4]);
    await rejects(l.as(judge).importParticipants(s, "display_name\nZed Z.\n"), "LEAGUE_FORBIDDEN");
  });
});

describe("public reads", () => {
  it("an unpublished season, a missing one and an unknown participant all look the same: null", async () => {
    const { l, s } = await small();
    l.as(null);
    expect(await l.publicLeague("small-season")).toBeNull();
    expect(await l.publicLeague("no-such")).toBeNull();
    await l.as(admin).setSeasonStatus(s, "scheduled");
    await l.setPublished(s, true, "preview");
    expect(await l.as(null).publicLeague("SMALL-SEASON")).not.toBeNull();
    expect(await l.publicParticipant("small-season", "nope")).toBeNull();
  });
  it("the demo league's public payload carries only allow-listed fields and never an id, a member reference or a staff identity", async () => {
    const { league } = await buildDemoLeague(NOW, 12);
    league.as(null);
    const pub = await league.publicLeague(DEMO_SLUG);
    expect(pub).not.toBeNull();
    expect(Object.keys(pub?.standings[0] ?? {}).sort()).toEqual([...PUBLIC_STANDING_KEYS].sort());
    const json = JSON.stringify(pub) + JSON.stringify(await league.publicChallengeResults(DEMO_SLUG, 1)) + JSON.stringify(await league.publicParticipant(DEMO_SLUG, pub?.standings[0]?.publicId ?? ""));
    for (const secret of ["DEMO-1", "externalRef", "participantId", "demo-judge", "demo-reviewer", "demo-admin", "recordedBy", "reviewedBy", "season-"]) expect(json).not.toContain(secret);
    expect(pub?.challenges.map((c) => c.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].filter((w) => w <= 4)); // drafts (weeks 5-8) are not public
    expect(pub?.season.currentWeek).toBe(4);
  });
  it("open-challenge results are not public until it closes; closed results are", async () => {
    const { league } = await buildDemoLeague(NOW, 12);
    league.as(null);
    expect(await league.publicChallengeResults(DEMO_SLUG, 4)).toBeNull();
    const w1 = await league.publicChallengeResults(DEMO_SLUG, 1);
    expect(w1?.results.length).toBeGreaterThan(5);
    expect(w1?.results[0]?.rank).toBe(1);
  });
  it("the TV and the phone read the same standings: the public table equals the staff table", async () => {
    const { league, seasonId } = await buildDemoLeague(NOW, 18);
    const staff = (await league.as(admin).overview(seasonId)).standings.map((r) => [r.publicId, r.rank, r.totalPoints]);
    const pub = (await league.as(null).publicLeague(DEMO_SLUG))?.standings.map((r) => [r.publicId, r.rank, r.totalPoints]);
    expect(pub).toEqual(staff);
    expect(new Set(staff.map((r) => r[0])).size).toBe(18);
  });
});

describe("SupabaseLeague (against a fake RPC client)", () => {
  const client = (reply: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message: string } }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return { calls, rpc: async (fn: string, args: Record<string, unknown> = {}) => { calls.push({ fn, args }); const r = reply(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } };
  };
  it("maps database errors to stable codes", async () => {
    const forbidden = new SupabaseLeague(client(() => ({ error: { code: "42501", message: "permission denied for function race_league_create_season" } })));
    await rejects(forbidden.createSeason({ slug: "x-y", name: "N", startsOn: "2026-11-02", endsOn: "2026-12-27" }), "LEAGUE_FORBIDDEN");
    const self = new SupabaseLeague(client(() => ({ error: { message: "LEAGUE_SELF_REVIEW: you cannot approve or reject a result you recorded yourself" } })));
    await expect(self.reviewAttempt("a", "approve")).rejects.toMatchObject({ code: "LEAGUE_SELF_REVIEW", message: "you cannot approve or reject a result you recorded yourself" });
    const missing = new SupabaseLeague(client(() => ({ error: { code: "PGRST202", message: "Could not find the function public.race_league_public_season" } })));
    await rejects(missing.publicLeague("x"), "LEAGUE_UNAVAILABLE");
    expect(new LeagueError("LEAGUE_FORBIDDEN", "x").code).toBe("LEAGUE_FORBIDDEN");
  });
  it("sends only the documented RPC arguments — never a score, a rank, a status or an approver chosen by the browser", async () => {
    const c = client((fn) => (fn === "race_league_record_attempt" ? { data: { id: "a", replay: false } } : {}));
    const g = new SupabaseLeague(c);
    await g.recordAttempt({ challengeId: "c", participantId: "p", value: 31, clientRequestId: "r1" });
    await g.reviewAttempt("a", "reject", "no depth");
    await g.upsertChallenge("s", 1, { name: "N", metricKind: "REPS", unit: "reps", maxAttempts: 2 });
    expect(c.calls[0]).toEqual({ fn: "race_league_record_attempt", args: { p_challenge: "c", p_participant: "p", p_value: 31, p_attempted_at: null, p_client_request_id: "r1" } });
    expect(c.calls[1]?.args).toEqual({ p_attempt: "a", p_decision: "reject", p_reason: "no depth" });
    expect(Object.keys(c.calls[2]?.args.p_cfg as object).sort()).toEqual(["max_attempts", "metric_kind", "name", "unit"]);
  });
  it("the public read returns null when the database says unavailable", async () => {
    const g = new SupabaseLeague(client(() => ({ data: { available: false } })));
    expect(await g.publicLeague("x")).toBeNull();
    expect(await g.publicParticipant("x", "y")).toBeNull();
  });
  it("participant import validates the file locally and then sends only validated rows", async () => {
    const c = client(() => ({ data: { added: 1, issues: [] } }));
    const r = await new SupabaseLeague(c).importParticipants("s", "full_name,external_member_ref\nAhmed Khaled Mostafa,M-1\n=cmd|' /C calc'!A0,M-2\n");
    expect(r.preview.issues).toHaveLength(1);
    expect(c.calls[0]?.args.p_rows).toEqual([{ display_name: "Ahmed M.", external_ref: "M-1", eligible: true }]);
  });
});
