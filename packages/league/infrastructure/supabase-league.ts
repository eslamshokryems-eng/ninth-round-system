import { LeagueError, parseLeagueError } from "../domain/errors";
import type { AdminOverview, AuditLine, ChallengeInput, LeagueGateway, MySeason, PublicChallengeResults, PublicParticipantPage } from "../domain/gateway";
import { validateParticipantCsv } from "../domain/import";
import type { PublicLeague } from "../domain/public";
import type { EligibilityDecisionCategory, SeasonRules } from "../domain/types";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
/** Anything with the Supabase client's `rpc` — kept structural so this package depends on no SDK. */
export interface RpcClient {
  rpc: Rpc;
}

const rulesToDb = (r: SeasonRules) => ({
  points: { by_rank: r.points.byRank, beyond: r.points.beyond, participation: r.points.participation, absent: r.points.absent },
  tie_policy: r.tiePolicy,
  absence_policy: r.absencePolicy,
  eligibility: r.eligibility,
  appeal_window_hours: r.appealWindowHours,
});

/**
 * The real data source: every call is a SECURITY DEFINER RPC that re-checks who is asking. Nothing here decides authorization, ranks, points or
 * approval — a browser that lies to this class gets the database's refusal, not a result.
 */
export class SupabaseLeague implements LeagueGateway {
  constructor(private readonly client: RpcClient) {}

  private async call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) {
      const parsed = parseLeagueError(error.message);
      if (parsed) throw new LeagueError(parsed.code, parsed.message);
      if (error.code === "42501") throw new LeagueError("LEAGUE_FORBIDDEN", "Your account is not allowed to do that.");
      if (error.code === "42883" || error.code === "PGRST202" || /does not exist|could not find the function/i.test(error.message)) throw new LeagueError("LEAGUE_UNAVAILABLE", "The league is not available yet.");
      throw new LeagueError("LEAGUE_UNAVAILABLE", "Something went wrong. Check your connection and try again.");
    }
    return data as T;
  }

  async publicLeague(slug: string): Promise<PublicLeague | null> {
    const d = await this.call<{ available: boolean } & Partial<PublicLeague>>("race_league_public_season", { p_slug: slug });
    return d.available ? ({ season: d.season, challenges: d.challenges, standings: d.standings, generatedAt: d.generatedAt } as PublicLeague) : null;
  }
  async publicChallengeResults(slug: string, week: number): Promise<PublicChallengeResults | null> {
    const d = await this.call<{ available: boolean } & Partial<PublicChallengeResults>>("race_league_public_challenge_results", { p_slug: slug, p_week: week });
    return d.available ? (d as PublicChallengeResults) : null;
  }
  async publicParticipant(slug: string, publicId: string): Promise<PublicParticipantPage | null> {
    const d = await this.call<{ available: boolean } & Partial<PublicParticipantPage>>("race_league_public_participant", { p_slug: slug, p_public_id: publicId });
    return d.available ? ({ standing: d.standing ?? null, results: d.results ?? [] } as PublicParticipantPage) : null;
  }
  mySeasons() { return this.call<readonly MySeason[]>("race_league_my_seasons"); }
  overview(seasonId: string) { return this.call<AdminOverview>("race_league_admin_overview", { p_season: seasonId }); }
  createSeason(i: { slug: string; name: string; startsOn: string; endsOn: string; rules?: SeasonRules }) {
    return this.call<string>("race_league_create_season", { p_slug: i.slug, p_name: i.name, p_starts_on: i.startsOn, p_ends_on: i.endsOn, p_rules: i.rules ? rulesToDb(i.rules) : null });
  }
  async setSeasonStatus(seasonId: string, status: string, reason?: string) { await this.call("race_league_set_season_status", { p_season: seasonId, p_status: status, p_reason: reason ?? null }); }
  async setPublished(seasonId: string, published: boolean, reason: string) { await this.call("race_league_set_published", { p_season: seasonId, p_published: published, p_reason: reason }); }
  updateRules(seasonId: string, rules: SeasonRules, reason: string) { return this.call<number>("race_league_update_rules", { p_season: seasonId, p_rules: rulesToDb(rules), p_reason: reason }); }
  upsertChallenge(seasonId: string, week: number, c: ChallengeInput) {
    const cfg: Record<string, unknown> = {};
    const map: [keyof ChallengeInput, string][] = [["name", "name"], ["description", "description"], ["instructions", "instructions"], ["safetyNotes", "safety_notes"], ["metricKind", "metric_kind"], ["unit", "unit"],
      ["direction", "direction"], ["maxAttempts", "max_attempts"], ["counting", "counting"], ["opensAt", "opens_at"], ["closesAt", "closes_at"], ["referenceUrl", "reference_url"], ["requiresVerification", "requires_verification"]];
    for (const [k, col] of map) if (c[k] !== undefined) cfg[col] = c[k];
    return this.call<string>("race_league_upsert_challenge", { p_season: seasonId, p_week: week, p_cfg: cfg });
  }
  setChallengeStatus(challengeId: string, status: string) { return this.call<{ ledgerLines: number }>("race_league_set_challenge_status", { p_challenge: challengeId, p_status: status }); }
  addParticipant(seasonId: string, displayName: string, externalRef: string | null, membershipVerified: boolean) {
    return this.call<string>("race_league_add_participant", { p_season: seasonId, p_display_name: displayName, p_external_ref: externalRef, p_membership_verified: membershipVerified });
  }
  async importParticipants(seasonId: string, csv: string) {
    const preview = validateParticipantCsv(csv); // validated here for fast feedback; the database validates every row again
    const r = await this.call<{ added: number; issues: { row: number; message: string }[] }>("race_league_import_participants", {
      p_season: seasonId,
      p_rows: preview.rows.map((x) => ({ display_name: x.displayName, external_ref: x.externalRef, membership_verified: x.membershipVerified })),
    });
    return { preview, added: r.added, issues: r.issues };
  }
  async setParticipant(participantId: string, patch: { displayName?: string; active?: boolean }, reason: string) {
    await this.call("race_league_set_participant", { p_participant: participantId, p_display_name: patch.displayName ?? null, p_active: patch.active ?? null, p_reason: reason });
  }
  setEligibility(participantId: string, eligible: boolean, category: EligibilityDecisionCategory, reason: string) {
    return this.call<{ ledgerLines: number }>("race_league_set_eligibility", { p_participant: participantId, p_eligible: eligible, p_category: category, p_reason: reason });
  }
  recordAttempt(i: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }) {
    return this.call<never>("race_league_record_attempt", { p_challenge: i.challengeId, p_participant: i.participantId, p_value: i.value, p_attempted_at: i.attemptedAt ?? null, p_client_request_id: i.clientRequestId });
  }
  reviewAttempt(attemptId: string, decision: "approve" | "reject", reason?: string) { return this.call<never>("race_league_review_attempt", { p_attempt: attemptId, p_decision: decision, p_reason: reason ?? null }); }
  correctAttempt(attemptId: string, newValue: number | null, reason: string) { return this.call<{ ledgerLines: number }>("race_league_correct_attempt", { p_attempt: attemptId, p_new_value: newValue, p_reason: reason }); }
  requestCorrection(attemptId: string, proposedValue: number | null, reason: string) { return this.call<string>("race_league_request_correction", { p_attempt: attemptId, p_proposed_value: proposedValue, p_reason: reason }); }
  decideCorrectionRequest(requestId: string, decision: "apply" | "decline", reason: string) { return this.call<{ ledgerLines: number }>("race_league_decide_correction_request", { p_request: requestId, p_decision: decision, p_reason: reason }); }
  lodgeAppeal(i: { challengeId: string; participantId: string; reason: string }) { return this.call<string>("race_league_lodge_appeal", { p_challenge: i.challengeId, p_participant: i.participantId, p_reason: i.reason }); }
  async decideAppeal(appealId: string, decision: "upheld" | "dismissed", reason: string) { await this.call("race_league_decide_appeal", { p_appeal: appealId, p_decision: decision, p_reason: reason }); }
  recompute(challengeId: string) { return this.call<number>("race_league_recompute", { p_challenge: challengeId }); }
  audit(seasonId: string, limit = 100) { return this.call<readonly AuditLine[]>("race_league_audit", { p_season: seasonId, p_limit: limit }); }
}
