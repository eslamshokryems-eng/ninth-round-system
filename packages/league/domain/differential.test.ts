import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryLeague } from "../infrastructure/in-memory-league";
import type { Actor, Metric, MetricKind, SeasonRules } from "./types";

/**
 * Differential test, TypeScript side. 150 pseudo-random but deterministic scenarios (ties, missing results, rejected attempts, retries, administrator
 * corrections, a mid-season rule change, an eligibility decision) are replayed through the full InMemoryLeague flow. The expected ledger state after every stage is
 * stored in differential-cases.json; the SQL harness (league/38_league_differential.sql) replays the SAME scenarios against the REAL database functions and must
 * land on the same numbers. Regenerate with `LEAGUE_WRITE_CASES=1 pnpm --filter @9thround/league test`.
 */
const FILE = new URL("./differential-cases.json", import.meta.url);

interface Scenario {
  name: string;
  metric: Metric;
  counting: "BEST" | "LATEST" | "FIRST_APPROVED";
  rules: SeasonRules;
  rules2: SeasonRules | null;
  participants: string[];
  attempts: { idx: number; p: string; value: number; status: "approved" | "rejected" }[];
  corrections: { attempt: number; newValue: number | null }[];
  restrict: string | null;
  expect?: Record<string, Stage>;
}
interface Stage {
  lines: number;
  byP: Record<string, { cents: number; rank: number | null }>;
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: { kind: MetricKind; unit: string }[] = [{ kind: "REPS", unit: "reps" }, { kind: "TIME", unit: "s" }, { kind: "DISTANCE", unit: "m" }, { kind: "LOAD", unit: "kg" }, { kind: "NUMERIC", unit: "count" }];

function generate(): Scenario[] {
  const r = prng(20261101);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const out: Scenario[] = [];
  const makeRules = (): SeasonRules => {
    const n = 1 + Math.floor(r() * 6);
    const table: number[] = [];
    let v = 40 + Math.floor(r() * 80);
    for (let i = 0; i < n; i++) { table.push(v); v = Math.max(0, v - Math.floor(r() * 25)); }
    return { points: { byRank: table, beyond: Math.floor(r() * 12), participation: Math.floor(r() * 8), absent: pick([0, 0, 0, 2.5]) }, tiePolicy: pick(["SHARE", "SPLIT"] as const), absencePolicy: pick(["ZERO", "PARTICIPATION"] as const), eligibility: "AT_REGISTRATION", appealWindowHours: 48 };
  };
  for (let i = 0; i < 150; i++) {
    const k = pick(KINDS);
    const n = 2 + Math.floor(r() * 8);
    const participants = Array.from({ length: n }, (_, j) => `p${j}`);
    const values = [10, 20, 20, 30, 40, 40, 55];
    const attempts: Scenario["attempts"] = [];
    for (const p of participants) {
      const count = Math.floor(r() * 4);
      for (let a = 0; a < count; a++) attempts.push({ idx: attempts.length, p, value: pick(values), status: r() < 0.7 ? "approved" : "rejected" });
    }
    const approved = attempts.filter((a) => a.status === "approved");
    const corrections: Scenario["corrections"] = [];
    const used = new Set<number>();
    for (let c = 0; c < Math.floor(r() * 4) && approved.length > 0; c++) {
      const a = pick(approved);
      if (used.has(a.idx)) continue;
      used.add(a.idx);
      corrections.push({ attempt: a.idx, newValue: r() < 0.3 ? null : pick(values) });
    }
    out.push({
      name: `scenario ${i}`, metric: { kind: k.kind, unit: k.unit, direction: pick(["LOWER_WINS", "HIGHER_WINS"] as const) }, counting: pick(["BEST", "LATEST", "FIRST_APPROVED"] as const),
      rules: makeRules(), rules2: r() < 0.4 ? makeRules() : null, participants, attempts, corrections, restrict: r() < 0.35 ? pick(participants) : null,
    });
  }
  return out;
}

const admin: Actor = { id: "adm-1", isSuperAdmin: false, roles: ["LEAGUE_ADMIN"] };
const judge: Actor = { id: "jdg-1", isSuperAdmin: false, roles: ["JUDGE"] };
const reviewer: Actor = { id: "rev-1", isSuperAdmin: false, roles: ["REVIEWER"] };

async function run(sc: Scenario): Promise<Record<string, Stage>> {
  const base = Date.parse("2026-11-04T12:00:00Z");
  const l = new InMemoryLeague(admin, () => new Date(base + 86_400_000));
  const s = await l.createSeason({ slug: "diff-season", name: "Differential", startsOn: "2026-11-02", endsOn: "2026-12-27", rules: sc.rules });
  l.state.staff.push({ seasonId: s, profileId: "adm-2", role: "LEAGUE_ADMIN" }, { seasonId: s, profileId: judge.id, role: "JUDGE" }, { seasonId: s, profileId: reviewer.id, role: "REVIEWER" });
  const ch = await l.upsertChallenge(s, 1, { name: "Differential", metricKind: sc.metric.kind, unit: sc.metric.unit, direction: sc.metric.direction, maxAttempts: 10, counting: sc.counting, requiresVerification: true });
  const pid = new Map<string, string>();
  for (const p of sc.participants) await l.addParticipant(s, `Player ${p}`, `ref-${p}`, true);
  for (const p of l.state.participants) pid.set(p.displayName.replace("Player ", ""), p.id);
  await l.setSeasonStatus(s, "scheduled");
  await l.setSeasonStatus(s, "active");
  await l.setChallengeStatus(ch, "published");
  await l.setChallengeStatus(ch, "open");
  const aid = new Map<number, string>();
  for (const a of sc.attempts) {
    const rec = await l.as(judge).recordAttempt({ challengeId: ch, participantId: pid.get(a.p) as string, value: a.value, attemptedAt: new Date(base + a.idx * 60_000).toISOString(), clientRequestId: `diff-${a.idx}` });
    aid.set(a.idx, rec.id);
    await l.as(reviewer).reviewAttempt(rec.id, a.status === "approved" ? "approve" : "reject", a.status === "rejected" ? "invalid" : undefined);
  }
  const snap = (): Stage => {
    const byP: Stage["byP"] = {};
    for (const p of sc.participants) {
      const lines = l.state.ledger.filter((e) => e.challengeId === ch && e.participantId === pid.get(p));
      byP[p] = { cents: lines.reduce((n, e) => n + e.pointsCents, 0), rank: lines.length ? (lines.at(-1)?.rank ?? null) : null };
    }
    return { lines: l.state.ledger.filter((e) => e.challengeId === ch).length, byP };
  };
  const out: Record<string, Stage> = {};
  await l.as(admin).setChallengeStatus(ch, "closed");
  out.close = snap();
  expect(await l.recompute(ch)).toBe(0); // a retry appends nothing
  out.retry = snap();
  for (const c of sc.corrections) await l.correctAttempt(aid.get(c.attempt) as string, c.newValue, "differential correction");
  out.corrected = snap();
  if (sc.rules2) { await l.updateRules(s, sc.rules2, "differential rules"); out.rules2 = snap(); }
  if (sc.restrict) { await l.setEligibility(pid.get(sc.restrict) as string, false, "FRAUD", "differential decision"); out.restricted = snap(); }
  return out;
}

describe("differential scoring cases (TypeScript side; the SQL side replays the same file)", () => {
  it("regenerates exactly the checked-in file, and every stage is internally consistent", async () => {
    const scenarios = generate();
    for (const sc of scenarios) sc.expect = await run(sc);
    const json = JSON.stringify({ cases: scenarios }, null, 1) + "\n";
    if (process.env.LEAGUE_WRITE_CASES === "1") writeFileSync(FILE, json);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(json));
    // spot-check that the corpus really exercises what it claims
    const all = scenarios.flatMap((s) => Object.values(s.expect ?? {}));
    expect(scenarios.some((s) => s.corrections.length > 0)).toBe(true);
    expect(scenarios.some((s) => s.rules2 !== null)).toBe(true);
    expect(scenarios.some((s) => s.restrict !== null)).toBe(true);
    expect(scenarios.some((s) => s.rules.tiePolicy === "SPLIT" && s.attempts.length > 3)).toBe(true);
    expect(all.length).toBeGreaterThan(400);
  });
});
