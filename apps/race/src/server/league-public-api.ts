import "server-only";
import { createPublicApi, readPublicApiConfig } from "@9thround/league/server";

/**
 * One public-API instance per server process (its in-process cache and fallback limiter live here). Configuration is read from the server environment only.
 * See docs/race/18-league-public-protection.md for every variable, the cache keys, the TTL and what is NOT protected.
 */
export const leaguePublicApi = createPublicApi({
  config: readPublicApiConfig(process.env),
  log: (message) => console.warn(`[league-public-api] ${message}`),
});
