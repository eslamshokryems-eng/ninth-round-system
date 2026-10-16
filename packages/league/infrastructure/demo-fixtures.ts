import type { Actor } from "../domain/types";
import { InMemoryLeague } from "./in-memory-league";

/**
 * SYNTHETIC LOCAL DEMO DATA — "Demo Athlete NN", invented numbers, no real member. Used only by `next dev` and by tests; a production build never
 * reads it (see apps/race/src/features/league/source.ts). Built through the gateway's own methods so it obeys exactly the same rules as real data.
 */
export const DEMO_SLUG = "demo-season";

export const DEMO_USERS = {
  admin: { id: "demo-admin", isSuperAdmin: true, roles: ["LEAGUE_ADMIN"] } as Actor,
  judge: { id: "demo-judge", isSuperAdmin: false, roles: ["JUDGE"] } as Actor,
  reviewer: { id: "demo-reviewer", isSuperAdmin: false, roles: ["REVIEWER"] } as Actor,
  outsider: { id: "demo-outsider", isSuperAdmin: false, roles: [] } as Actor,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface DemoLeague {
  readonly league: InMemoryLeague;
  readonly seasonId: string;
  readonly slug: string;
  readonly now: Date;
}

/** An 8-week season in week 4: weeks 1–3 closed (points awarded), week 4 open, weeks 5–8 still drafts. */
export async function buildDemoLeague(now: Date = new Date(), participants = 24): Promise<DemoLeague> {
  const league = new InMemoryLeague(DEMO_USERS.admin, () => now, 20261101);
  const day = 86_400_000;
  const today = Date.parse(`${isoDay(now.getTime())}T00:00:00Z`);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * day;
  const start = monday - 3 * 7 * day; // today falls in week 4
  const startsOn = isoDay(start);
  const endsOn = isoDay(start + 55 * day);
  const seasonId = await league.createSeason({ slug: DEMO_SLUG, name: "THE NINTH League — Season 1 (demo data)", startsOn, endsOn });
  league.state.staff.push({ seasonId, profileId: DEMO_USERS.judge.id, role: "JUDGE" }, { seasonId, profileId: DEMO_USERS.reviewer.id, role: "REVIEWER" });
  await league.setSeasonStatus(seasonId, "scheduled");
  await league.setSeasonStatus(seasonId, "active");

  const weeks = [
    { name: "Max push-ups (2 min)", metricKind: "REPS", unit: "reps", verify: true, gen: (r: () => number) => Math.round(25 + r() * 45) },
    { name: "400 m run", metricKind: "TIME", unit: "s", verify: false, gen: (r: () => number) => Math.round((80 + r() * 60) * 10) / 10 },
    { name: "2-minute row", metricKind: "DISTANCE", unit: "m", verify: true, gen: (r: () => number) => Math.round(380 + r() * 220) },
    { name: "Burpees (3 min)", metricKind: "REPS", unit: "reps", verify: true, gen: (r: () => number) => Math.round(30 + r() * 40) },
    { name: "3-rep deadlift", metricKind: "LOAD", unit: "kg", verify: true, gen: () => 0 },
    { name: "5 km bike", metricKind: "TIME", unit: "s", verify: true, gen: () => 0 },
    { name: "Kettlebell swings (3 min)", metricKind: "REPS", unit: "reps", verify: true, gen: () => 0 },
    { name: "Season finale ladder", metricKind: "TIME", unit: "s", verify: true, gen: () => 0 },
  ] as const;
  const ids: string[] = [];
  for (const [i, w] of weeks.entries()) {
    ids.push(await league.upsertChallenge(seasonId, i + 1, {
      name: w.name, metricKind: w.metricKind, unit: w.unit, requiresVerification: w.verify,
      description: `Week ${i + 1} challenge — demo data.`, instructions: "Full range of motion. A judge counts every repetition.", safetyNotes: "Stop if you feel pain or dizziness.",
    }));
  }
  for (let n = 1; n <= participants; n++) await league.addParticipant(seasonId, `Demo Athlete ${String(n).padStart(2, "0")}`, `DEMO-${n}`, true);
  const people = league.state.participants.filter((p) => p.seasonId === seasonId);

  const rand = mulberry32(9);
  for (let w = 0; w < 4; w++) {
    const challengeId = ids[w] as string;
    await league.as(DEMO_USERS.admin).setChallengeStatus(challengeId, "published");
    await league.setChallengeStatus(challengeId, "open");
    for (const [idx, p] of people.entries()) {
      if (w === 3 && idx < 4) continue; // the week in progress: the first four athletes have not had their turn yet
      if (rand() < 0.15) continue; // absent this week
      const spec = weeks[w] as (typeof weeks)[number];
      league.as(DEMO_USERS.judge);
      const att = await league.recordAttempt({ challengeId, participantId: p.id, value: spec.gen(rand), clientRequestId: `demo-${w}-${p.id}` });
      if (spec.verify) await league.as(DEMO_USERS.reviewer).reviewAttempt(att.id, "approve");
    }
    if (w < 3) await league.as(DEMO_USERS.admin).setChallengeStatus(challengeId, "closed");
  }
  league.as(DEMO_USERS.admin);
  await league.setPublished(seasonId, true, "demo data");
  return { league, seasonId, slug: DEMO_SLUG, now };
}
