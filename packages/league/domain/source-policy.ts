/**
 * Which data the league screens read. SYNTHETIC FIXTURES are for local development only: a production build (NODE_ENV === "production" — what
 * `next build` / Vercel always set) can never select them, whatever any environment variable says. The real source is the database, which answers
 * "not published" until the league is activated and a season is published.
 */
export type LeagueSourceKind = "demo-fixtures" | "database";

export function chooseLeagueSource(env: { nodeEnv: string | undefined; source: string | undefined }): LeagueSourceKind {
  if (env.nodeEnv === "production") return "database";
  return env.source === "database" ? "database" : "demo-fixtures";
}
