"use client";

import { buildDemoLeague, chooseLeagueSource, DEMO_SLUG, DEMO_USERS, PublicHttpLeague, SupabaseLeague, type InMemoryLeague, type LeagueGateway } from "@9thround/league";
import { getRaceClient } from "../../lib/composition-root";

export interface LeagueSource {
  readonly gateway: LeagueGateway;
  /** true = synthetic local fixtures ("Demo Athlete NN"); every screen shows a banner. Never true in a production build. */
  readonly demo: boolean;
  /** The season the public screens show when the address names none (NEXT_PUBLIC_LEAGUE_SEASON; the demo season in development). */
  readonly defaultSlug: string | null;
  /** Present only for the fixtures: lets the staff screens play the part of the judge / reviewer / administrator. */
  readonly fixtures: { readonly league: InMemoryLeague; readonly seasonId: string } | null;
}

export const ACTOR_KEY = "league-demo-actor";
let cached: Promise<LeagueSource> | null = null;

export function getLeagueSource(): Promise<LeagueSource> {
  cached ??= (async (): Promise<LeagueSource> => {
    if (chooseLeagueSource({ nodeEnv: process.env.NODE_ENV, source: process.env.NEXT_PUBLIC_LEAGUE_SOURCE }) === "demo-fixtures") {
      const d = await buildDemoLeague();
      // the fixtures' "acting as" choice survives page loads in this tab (the data itself is rebuilt from scratch each load)
      try {
        const k = window.sessionStorage.getItem(ACTOR_KEY);
        if (k === "anonymous") d.league.as(null);
        else if (k === "judge" || k === "reviewer" || k === "outsider" || k === "admin") d.league.as(DEMO_USERS[k]);
      } catch { /* sessionStorage blocked: stay as the administrator */ }
      return { gateway: d.league, demo: true, defaultSlug: DEMO_SLUG, fixtures: { league: d.league, seasonId: d.seasonId } };
    }
    // staff calls: the database (RPCs re-check every caller). Public reads: the same-origin public API — cached at the edge, rate limited, allow-listed.
    return { gateway: new SupabaseLeague(getRaceClient() as unknown as ConstructorParameters<typeof SupabaseLeague>[0], new PublicHttpLeague("/race/league/api")), demo: false, defaultSlug: process.env.NEXT_PUBLIC_LEAGUE_SEASON ?? null, fixtures: null };
  })();
  return cached;
}

export { DEMO_USERS };
