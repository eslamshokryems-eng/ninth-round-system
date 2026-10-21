import { LeagueError } from "../domain/errors";
import type { PublicChallengeResults, PublicParticipantPage } from "../domain/gateway";
import type { PublicLeague } from "../domain/public";

/** The server answered 429 or 503: the caller should wait this long before asking again (the polling hook honours it). */
export class LeagueRetryError extends LeagueError {
  constructor(readonly retryAfterSeconds: number, message: string) {
    super("LEAGUE_UNAVAILABLE", message);
    this.name = "LeagueRetryError";
  }
}

export interface PublicReader {
  publicLeague(slug: string): Promise<PublicLeague | null>;
  publicChallengeResults(slug: string, week: number): Promise<PublicChallengeResults | null>;
  publicParticipant(slug: string, publicId: string): Promise<PublicParticipantPage | null>;
}

/**
 * The browser's public reads: same-origin GETs to the league's public API (cache + rate limit in front of the database), never a direct database call.
 * 404 = not published / unknown (null); 429 / 503 carry Retry-After; anything else is "unavailable". The response was already allow-listed server-side.
 */
export class PublicHttpLeague implements PublicReader {
  constructor(private readonly base: string, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  private async get<T>(path: string): Promise<T | null> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base.replace(/\/+$/, "")}${path}`, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit" });
    } catch {
      throw new LeagueError("LEAGUE_UNAVAILABLE", "Check your connection and try again.");
    }
    if (res.status === 404) return null;
    if (res.status === 429 || res.status === 503) {
      const wait = Number(res.headers.get("Retry-After"));
      throw new LeagueRetryError(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 300) : 30, res.status === 429 ? "Too many requests — retrying shortly." : "The league is temporarily unavailable.");
    }
    if (!res.ok) throw new LeagueError("LEAGUE_UNAVAILABLE", "Something went wrong. Check your connection and try again.");
    return (await res.json()) as T;
  }
  async publicLeague(slug: string) { return this.get<PublicLeague>(`/season/${encodeURIComponent(slug)}`); }
  async publicChallengeResults(slug: string, week: number) { return this.get<PublicChallengeResults>(`/season/${encodeURIComponent(slug)}/week/${week}`); }
  async publicParticipant(slug: string, publicId: string) { return this.get<PublicParticipantPage>(`/season/${encodeURIComponent(slug)}/athlete/${encodeURIComponent(publicId)}`); }
}
