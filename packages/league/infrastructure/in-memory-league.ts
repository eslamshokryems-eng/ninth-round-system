import { LeagueError } from "../domain/errors";
import type { AccountLookup, AdminAttempt, AdminOverview, AdminStanding, AuditLine, ChallengeInput, LeagueGateway, MySeason, PublicChallengeResults, PublicParticipantPage, SetStaffInput, SetStaffResult } from "../domain/gateway";
import { participantIdentityKey, validateParticipantCsv } from "../domain/import";
import { layoutInputToWire, normalizeLayout, replacedExercises, sameLayout, stationTotal, structureChange, wireToStations, type StationBreakdownRow, type StationLayout, type StationLayoutInput, type StationValue, type WireLayout } from "../domain/layout";
import { toPublicLeague, type PublicLeague } from "../domain/public";
import { reconcileChallenge, scoreChallenge, selectCountedAttempt } from "../domain/scoring";
import { buildStandings, centsToPoints } from "../domain/standings";
import {
  DEFAULT_ATTEMPT_POLICY,
  ELIGIBILITY_DECISION_CATEGORIES,
  PROVISIONAL_SEASON_RULES,
  type Actor,
  type Appeal,
  type Attempt,
  type Challenge,
  type ChallengeStatus,
  type CorrectionRecord,
  type CorrectionRequest,
  type EligibilityDecision,
  type EligibilityDecisionCategory,
  type LedgerEntry,
  type LeagueRole,
  type Metric,
  type Participant,
  type Season,
  type SeasonRules,
  type SeasonStatus,
} from "../domain/types";
import {
  appealDeadline,
  requireChallengeTransition,
  requireReason,
  resultPublishedAt,
  requireSeasonTransition,
  validateChallenge,
  validateDisplayName,
  validateResultValue,
  validateRules,
  validateSeasonDates,
} from "../domain/validation";

/** One immutable layout VERSION of a challenge (mirrors race_league_layouts). */
interface StoredLayout { id: string; seasonId: string; challengeId: string; version: number; spec: WireLayout; reason: string; createdBy: string; createdAt: string }
/** One value of one station of one attempt (mirrors race_league_station_results; append-only). */
interface StationResult { attemptId: string; layoutId: string; position: number; value: number }
const STATION_RULE = "This challenge has a station layout, so a result needs one value per station; use the station form.";

interface State {
  seasons: Season[];
  challenges: Challenge[];
  participants: Participant[];
  attempts: Attempt[];
  ledger: LedgerEntry[]; // append-only
  audit: (AuditLine & { seasonId: string })[];
  /** `active` undefined = active (older callers push plain rows). */
  staff: { seasonId: string; profileId: string; role: LeagueRole; active?: boolean }[];
  /** The project's user directory (the mirror of the Auth users). Synthetic in the fixtures. */
  accounts: { id: string; email: string; fullName: string; active: boolean; emailConfirmed: boolean; banned: boolean }[];
  correctionRequests: CorrectionRequest[];
  corrections: CorrectionRecord[]; // append-only
  appeals: Appeal[];
  eligibilityDecisions: EligibilityDecision[]; // append-only
  layouts: StoredLayout[]; // append-only versions
  stationResults: StationResult[]; // append-only
}

function fail(code: ConstructorParameters<typeof LeagueError>[0], message: string): never {
  throw new LeagueError(code, message);
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The same rules as the database, in memory — for local development fixtures and for tests. It is NOT a second authority: production reads and
 * writes go through SupabaseLeague. It exists so the screens can be built and exercised without a database, and so the rules can be asserted
 * in a fast unit test. (The SQL equivalents are proven in the harness, including a shared scoring-parity file.)
 */
export class InMemoryLeague implements LeagueGateway {
  readonly state: State = { seasons: [], challenges: [], participants: [], attempts: [], ledger: [], audit: [], staff: [], accounts: [], correctionRequests: [], corrections: [], appeals: [], eligibilityDecisions: [], layouts: [], stationResults: [] };
  private actorValue: Actor | null;

  private readonly rand: () => number;
  private counter = 0;

  /** `seed` makes every generated id reproducible (the dev fixtures use it so a page refresh keeps the same links); omit it for random ids. */
  constructor(
    actor: Actor | null,
    private readonly now: () => Date = () => new Date(),
    seed?: number,
  ) {
    this.actorValue = actor;
    this.rand = seed === undefined ? Math.random : seeded(seed);
  }
  private uid(prefix: string): string {
    return `${prefix}-${(++this.counter).toString(36)}-${this.rand().toString(36).slice(2, 8)}`;
  }
  private newPublicId(): string {
    return this.rand().toString(36).slice(2, 10) + this.rand().toString(36).slice(2, 10);
  }

  /** Switch the signed-in user (null = anonymous). */
  as(actor: Actor | null): this {
    this.actorValue = actor;
    return this;
  }
  get actor(): Actor | null {
    return this.actorValue;
  }

  // ---- authorization ------------------------------------------------------------------------------------------------------------------
  private has(seasonId: string, roles: readonly LeagueRole[]): boolean {
    const a = this.actorValue;
    if (!a) return false;
    if (a.isSuperAdmin) return true;
    return this.state.staff.some((s) => s.seasonId === seasonId && s.profileId === a.id && s.active !== false && roles.includes(s.role));
  }
  private requireAdmin(seasonId: string): void {
    if (!this.has(seasonId, ["LEAGUE_ADMIN"])) fail("LEAGUE_FORBIDDEN", "League administrators only.");
  }
  private season(id: string): Season {
    return this.state.seasons.find((s) => s.id === id) ?? fail("LEAGUE_NOT_FOUND", "Season not found.");
  }
  private challenge(id: string): Challenge {
    return this.state.challenges.find((c) => c.id === id) ?? fail("LEAGUE_NOT_FOUND", "Challenge not found.");
  }
  private log(seasonId: string, action: string, metadata: Record<string, unknown> = {}): void {
    this.state.audit.push({ seasonId, at: this.now().toISOString(), actor: this.actorValue?.id ?? null, action, metadata });
  }
  private patch<T extends { id: string }>(list: T[], id: string, change: Partial<T>): T {
    const i = list.findIndex((x) => x.id === id);
    const next = { ...(list[i] as T), ...change };
    list[i] = next;
    return next;
  }
  /** Two distinct league-administrator accounts. A Super Admin's implicit access does not count as one of them. */
  private independentAdmins(seasonId: string): number {
    return new Set(this.state.staff.filter((s) => s.seasonId === seasonId && s.role === "LEAGUE_ADMIN" && s.active !== false).map((s) => s.profileId)).size;
  }
  private lockCompleted(seasonId: string): void {
    if (this.season(seasonId).status === "completed") fail("LEAGUE_SEASON_LOCKED", "This season is completed — its results are final.");
  }

  // ---- scoring ------------------------------------------------------------------------------------------------------------------------
  private applyScores(challengeId: string): number {
    const ch = this.challenge(challengeId);
    const se = this.season(ch.seasonId);
    const hasLines = (id: string) => this.state.ledger.some((l) => l.challengeId === ch.id && l.participantId === id);
    const eligible = this.state.participants
      .filter((p) => p.seasonId === ch.seasonId && p.eligible && (se.rules.eligibility === "AT_REGISTRATION" || p.joinedOn <= se.startsOn) && (p.active || hasLines(p.id)))
      .map((p) => p.id);
    const target = scoreChallenge({ seasonId: se.id, challengeId: ch.id, metric: ch.metric, counting: ch.attemptPolicy.counting, rules: se.rules, eligibleParticipantIds: eligible, attempts: this.state.attempts.filter((a) => a.challengeId === ch.id) });
    const lines = reconcileChallenge(this.state.ledger, target, ch.id, se.id);
    this.state.ledger.push(...lines);
    return lines.length;
  }

  // ---- public reads -------------------------------------------------------------------------------------------------------------------
  private publishedSeason(slug: string): Season | null {
    return this.state.seasons.find((s) => s.publicSlug === slug.toLowerCase() && s.published) ?? null;
  }
  private standings(seasonId: string) {
    return buildStandings(this.state.participants.filter((p) => p.seasonId === seasonId), this.state.ledger.filter((l) => l.seasonId === seasonId), this.state.challenges.filter((c) => c.seasonId === seasonId));
  }
  async publicLeague(slug: string): Promise<PublicLeague | null> {
    const se = this.publishedSeason(slug);
    if (!se) return null;
    return toPublicLeague(se, this.state.challenges.filter((c) => c.seasonId === se.id), this.standings(se.id), this.now());
  }
  async publicChallengeResults(slug: string, week: number): Promise<PublicChallengeResults | null> {
    const se = this.publishedSeason(slug);
    const ch = se && this.state.challenges.find((c) => c.seasonId === se.id && c.weekNumber === week && c.status === "closed");
    if (!se || !ch) return null;
    const ids = [...new Set(this.state.ledger.filter((l) => l.challengeId === ch.id).map((l) => l.participantId))];
    const results = ids.flatMap((id) => {
      const lines = this.state.ledger.filter((l) => l.challengeId === ch.id && l.participantId === id);
      const rank = lines.at(-1)?.rank ?? null;
      const p = this.state.participants.find((x) => x.id === id);
      const counted = selectCountedAttempt(this.state.attempts.filter((a) => a.challengeId === ch.id && a.participantId === id), ch.attemptPolicy.counting, ch.metric);
      if (rank === null || !p || !counted) return [];
      return [{ rank, publicId: p.publicId, displayName: p.displayName, value: counted.value, points: centsToPoints(lines.reduce((n, l) => n + l.pointsCents, 0)) }];
    });
    results.sort((a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName) || (a.publicId < b.publicId ? -1 : 1));
    return { weekNumber: ch.weekNumber, name: ch.name, unit: ch.metric.unit, direction: ch.metric.direction, results };
  }
  async publicParticipant(slug: string, pid: string): Promise<PublicParticipantPage | null> {
    const pub = await this.publicLeague(slug);
    const se = this.publishedSeason(slug);
    const p = se && this.state.participants.find((x) => x.seasonId === se.id && x.publicId === pid);
    if (!pub || !se || !p) return null;
    const row = pub.standings.find((r) => r.publicId === pid) ?? null;
    const results = this.state.challenges.filter((c) => c.seasonId === se.id && c.status === "closed").sort((a, b) => a.weekNumber - b.weekNumber).map((c) => {
      const lines = this.state.ledger.filter((l) => l.challengeId === c.id && l.participantId === p.id);
      const counted = selectCountedAttempt(this.state.attempts.filter((a) => a.challengeId === c.id && a.participantId === p.id), c.attemptPolicy.counting, c.metric);
      return { weekNumber: c.weekNumber, challenge: c.name, unit: c.metric.unit, value: counted?.value ?? null, rank: lines.at(-1)?.rank ?? null, points: centsToPoints(lines.reduce((n, l) => n + l.pointsCents, 0)) };
    });
    return { standing: row, results };
  }

  // ---- staff reads --------------------------------------------------------------------------------------------------------------------
  async mySeasons(): Promise<readonly MySeason[]> {
    const a = this.actorValue;
    if (!a) return [];
    return this.state.seasons.filter((s) => this.has(s.id, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])).map((s) => ({
      id: s.id, slug: s.publicSlug, name: s.name, status: s.status, published: s.published, startsOn: s.startsOn, endsOn: s.endsOn,
      roles: [...new Set(this.state.staff.filter((f) => f.seasonId === s.id && f.profileId === a.id && f.active !== false).map((f) => f.role))], isSuperAdmin: a.isSuperAdmin,
    }));
  }
  async overview(seasonId: string): Promise<AdminOverview> {
    if (!this.has(seasonId, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "League staff only.");
    const se = this.season(seasonId);
    const admin = this.has(seasonId, ["LEAGUE_ADMIN"]);
    const st = this.standings(seasonId);
    const standings: AdminStanding[] = st.rows.map((r) => ({
      id: r.participantId, publicId: r.publicId, displayName: r.displayName, rank: r.rank, tied: r.tied, totalPoints: centsToPoints(r.totalCents),
      weeklyPoints: Object.fromEntries(Object.entries(r.weeklyCents).map(([w, c]) => [Number(w), centsToPoints(c)])), challengesCompleted: r.challengesCompleted, firstPlaces: r.firstPlaces,
      movement: r.movement, gapToNext: r.gapToNextCents === null ? null : centsToPoints(r.gapToNextCents),
    }));
    const attempts: AdminAttempt[] = this.state.attempts.filter((a) => a.seasonId === seasonId).slice(-500).map((a) => ({
      id: a.id, challengeId: a.challengeId, participantId: a.participantId, value: a.value, unit: a.unit, attemptNo: a.attemptNo, attemptedAt: a.attemptedAt, status: a.status, reason: a.reason,
      recordedBy: a.recordedBy, reviewedBy: a.reviewedBy, correctedFrom: a.correctedFrom,
    }));
    return {
      season: se, isAdmin: admin, isSuperAdmin: this.actorValue?.isSuperAdmin === true,
      challenges: this.state.challenges.filter((c) => c.seasonId === seasonId).sort((a, b) => a.weekNumber - b.weekNumber),
      participants: this.state.participants.filter((p) => p.seasonId === seasonId).map((p) => ({ id: p.id, publicId: p.publicId, displayName: p.displayName, active: p.active, eligible: p.eligible, externalRef: admin ? p.externalRef : null, membershipVerifiedOn: p.membershipVerifiedOn })),
      attempts, standings,
      correctionRequests: this.state.correctionRequests.filter((r) => r.seasonId === seasonId),
      corrections: admin ? this.state.corrections.filter((c) => c.seasonId === seasonId) : [],
      appeals: admin ? this.state.appeals.filter((x) => x.seasonId === seasonId) : [],
      eligibilityDecisions: admin ? this.state.eligibilityDecisions.filter((d) => d.seasonId === seasonId) : [],
      staff: admin ? this.state.staff.filter((f) => f.seasonId === seasonId).map((f) => {
        const acc = this.state.accounts.find((x) => x.id === f.profileId);
        return { profileId: f.profileId, role: f.role, active: f.active !== false, fullName: acc?.fullName ?? "", emailHint: acc ? `${acc.email.slice(0, 1)}***@${acc.email.split("@")[1] ?? ""}` : null };
      }) : null,
    };
  }
  async findAccount(email: string): Promise<AccountLookup> {
    if (!this.actorValue?.isSuperAdmin) fail("LEAGUE_FORBIDDEN", "Only a Super Admin can look up an account.");
    const e = email.trim().toLowerCase();
    if (e.length < 5 || e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail("LEAGUE_INVALID", "That is not an e-mail address.");
    const a = this.state.accounts.find((x) => x.email.toLowerCase() === e);
    return a ? { found: true, id: a.id, email: a.email, fullName: a.fullName, active: a.active, emailConfirmed: a.emailConfirmed, banned: a.banned } : { found: false };
  }
  async setStaff(i: SetStaffInput): Promise<SetStaffResult> {
    const actor = this.actorValue;
    if (!actor) fail("LEAGUE_FORBIDDEN", "Sign in first.");
    if (!["LEAGUE_ADMIN", "JUDGE", "REVIEWER"].includes(i.role)) fail("LEAGUE_INVALID", "Unknown role.");
    if (!i.profileId) fail("LEAGUE_INVALID", "Choose an account.");
    const se = this.state.seasons.find((x) => x.id === i.seasonId) ?? fail("LEAGUE_NOT_FOUND", "Season not found.");
    if (i.role === "LEAGUE_ADMIN") { if (!actor?.isSuperAdmin) fail("LEAGUE_FORBIDDEN", "Only a Super Admin can appoint or remove a league administrator."); } else this.requireAdmin(i.seasonId);
    const why = requireReason(i.reason);
    if (se.status === "completed") fail("LEAGUE_SEASON_LOCKED", "This season is completed — its results are final.");
    const acc = this.state.accounts.find((x) => x.id === i.profileId) ?? fail("LEAGUE_NOT_FOUND", "Account not found.");
    if (i.active && (!acc.active || acc.banned)) fail("LEAGUE_INVALID", "That account is deactivated.");
    if (i.active && i.role === "LEAGUE_ADMIN" && !acc.emailConfirmed) fail("LEAGUE_INVALID", "That account has not confirmed its e-mail address.");
    const cur = this.state.staff.find((f) => f.seasonId === i.seasonId && f.profileId === i.profileId && f.role === i.role);
    if ((!cur && !i.active) || (cur && (cur.active !== false) === i.active)) return { changed: false, administrators: this.independentAdmins(i.seasonId) };
    const before = cur ? { ...cur } : null;
    if (cur) cur.active = i.active; else this.state.staff.push({ seasonId: i.seasonId, profileId: i.profileId, role: i.role, active: i.active });
    const n = this.independentAdmins(i.seasonId);
    if (i.role === "LEAGUE_ADMIN" && !i.active && n < 2 && (se.status === "active" || se.published)) {
      if (before && cur) cur.active = before.active !== false; // the whole operation is refused: nothing is left half-done
      else this.state.staff.pop();
      fail("LEAGUE_INVALID", "An active or published season needs two independent league administrators.");
    }
    this.log(i.seasonId, `league.staff.${i.active ? "appoint" : "remove"}`, { target: i.profileId, role: i.role, reason: why, administratorsAfter: n });
    return { changed: true, administrators: n };
  }
  async audit(seasonId: string, limit = 100): Promise<readonly AuditLine[]> {
    this.requireAdmin(seasonId);
    return this.state.audit.filter((l) => l.seasonId === seasonId).slice(-Math.min(Math.max(limit, 1), 500)).reverse().map(({ seasonId: _s, ...rest }) => rest);
  }

  // ---- season / challenge administration ----------------------------------------------------------------------------------------------
  async createSeason(i: { slug: string; name: string; startsOn: string; endsOn: string; rules?: SeasonRules }): Promise<string> {
    const a = this.actorValue;
    if (!a || !(a.isSuperAdmin || a.roles.includes("LEAGUE_ADMIN"))) fail("LEAGUE_FORBIDDEN", "Not allowed to create a league season.");
    validateSeasonDates(i.startsOn, i.endsOn);
    const rules = validateRules(i.rules ?? PROVISIONAL_SEASON_RULES);
    const slug = i.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 60) fail("LEAGUE_INVALID", "The season address may only use lowercase letters, numbers and dashes.");
    if (this.state.seasons.some((s) => s.publicSlug === slug)) fail("LEAGUE_DUPLICATE", "That season address is already used.");
    const name = i.name.trim();
    if (name.length < 2 || name.length > 80) fail("LEAGUE_INVALID", "A season name is 2–80 characters.");
    const s: Season = { id: this.uid("season"), publicSlug: slug, name, status: "draft", startsOn: i.startsOn, endsOn: i.endsOn, rules, published: false, firstPublishedAt: null };
    this.state.seasons.push(s);
    this.state.staff.push({ seasonId: s.id, profileId: a.id, role: "LEAGUE_ADMIN" });
    this.log(s.id, "league.season.create", { slug });
    return s.id;
  }
  async setSeasonStatus(seasonId: string, status: SeasonStatus, reason?: string): Promise<void> {
    this.requireAdmin(seasonId);
    const se = this.season(seasonId);
    requireSeasonTransition(se.status, status);
    if (status === "active" && this.independentAdmins(seasonId) < 2) fail("LEAGUE_INVALID", "Two independent league administrators are required before the season can be activated.");
    if (status === "completed") {
      if (this.state.challenges.some((c) => c.seasonId === seasonId && c.status === "open")) fail("LEAGUE_INVALID", "Close the open challenge first.");
      if (this.state.attempts.some((a) => a.seasonId === seasonId && a.status === "pending")) fail("LEAGUE_INVALID", "Some attempts are still waiting for review.");
      if (this.state.appeals.some((x) => x.seasonId === seasonId && x.status === "submitted")) fail("LEAGUE_INVALID", "Some appeals have not been decided yet.");
      if (this.state.correctionRequests.some((x) => x.seasonId === seasonId && x.status === "pending")) fail("LEAGUE_INVALID", "Some correction requests have not been decided yet.");
    }
    this.patch(this.state.seasons, seasonId, { status });
    this.log(seasonId, "league.season.status", { from: se.status, to: status, reason: reason ?? null });
  }
  async setPublished(seasonId: string, published: boolean, reason: string): Promise<void> {
    this.requireAdmin(seasonId);
    if (reason.trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    const se = this.season(seasonId);
    if (published && se.status === "draft") fail("LEAGUE_INVALID", "Schedule the season before publishing it.");
    if (published && this.independentAdmins(seasonId) < 2) fail("LEAGUE_INVALID", "Two independent league administrators are required before the season can be published.");
    this.patch(this.state.seasons, seasonId, { published, firstPublishedAt: published ? (se.firstPublishedAt ?? this.now().toISOString()) : se.firstPublishedAt });
    this.log(seasonId, "league.season.publish", { published, reason });
  }
  async updateRules(seasonId: string, rules: SeasonRules, reason: string): Promise<number> {
    this.requireAdmin(seasonId);
    if (reason.trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    this.lockCompleted(seasonId);
    const valid = validateRules(rules);
    this.patch(this.state.seasons, seasonId, { rules: valid });
    let lines = 0;
    for (const c of this.state.challenges.filter((x) => x.seasonId === seasonId && x.status === "closed").sort((a, b) => a.weekNumber - b.weekNumber)) lines += this.applyScores(c.id);
    this.log(seasonId, "league.rules.update", { reason, ledgerLines: lines });
    return lines;
  }
  async upsertChallenge(seasonId: string, week: number, input: ChallengeInput): Promise<string> {
    this.requireAdmin(seasonId);
    const se = this.season(seasonId);
    this.lockCompleted(seasonId);
    const ex = this.state.challenges.find((c) => c.seasonId === seasonId && c.weekNumber === week);
    if (ex && ex.status !== "draft" && ex.status !== "published") fail("LEAGUE_INVALID", "An open or closed challenge can no longer be edited.");
    const kind = (input.metricKind ?? ex?.metric.kind ?? "REPS") as Metric["kind"];
    const direction = (input.direction ?? ex?.metric.direction ?? (kind === "TIME" ? "LOWER_WINS" : "HIGHER_WINS")) as Metric["direction"];
    const next: Challenge = {
      id: ex?.id ?? this.uid("challenge"), seasonId, weekNumber: week, status: ex?.status ?? "draft",
      name: (input.name ?? ex?.name ?? "").trim(), description: input.description ?? ex?.description ?? "", instructions: input.instructions ?? ex?.instructions ?? "", safetyNotes: input.safetyNotes ?? ex?.safetyNotes ?? "",
      metric: { kind, unit: input.unit ?? ex?.metric.unit ?? "reps", direction },
      attemptPolicy: { maxAttempts: input.maxAttempts ?? ex?.attemptPolicy.maxAttempts ?? DEFAULT_ATTEMPT_POLICY.maxAttempts, counting: (input.counting ?? ex?.attemptPolicy.counting ?? DEFAULT_ATTEMPT_POLICY.counting) as Challenge["attemptPolicy"]["counting"] },
      closedAt: ex?.closedAt ?? null,
      opensAt: input.opensAt !== undefined ? input.opensAt : (ex?.opensAt ?? null), closesAt: input.closesAt !== undefined ? input.closesAt : (ex?.closesAt ?? null),
      referenceUrl: input.referenceUrl !== undefined ? input.referenceUrl : (ex?.referenceUrl ?? null), requiresVerification: input.requiresVerification ?? ex?.requiresVerification ?? true,
    };
    validateChallenge(next, se);
    if (ex && this.latestLayout(ex.id) && (next.metric.kind !== ex.metric.kind || next.metric.unit !== ex.metric.unit)) fail("LEAGUE_INVALID", "The metric and unit are fixed once a challenge has a station layout.");
    if (ex) this.patch(this.state.challenges, ex.id, next); else this.state.challenges.push(next);
    this.log(seasonId, ex ? "league.challenge.update" : "league.challenge.create", { week });
    return next.id;
  }
  async setChallengeStatus(challengeId: string, status: ChallengeStatus): Promise<{ ledgerLines: number }> {
    const ch = this.challenge(challengeId);
    this.requireAdmin(ch.seasonId);
    const se = this.season(ch.seasonId);
    this.lockCompleted(ch.seasonId);
    requireChallengeTransition(ch.status, status);
    if ((status === "published" || status === "open") && se.status === "draft") fail("LEAGUE_INVALID", "Schedule the season first.");
    if (status === "open" && se.status !== "active") fail("LEAGUE_INVALID", "The season must be active to open a challenge.");
    if (status === "closed" && this.state.attempts.some((a) => a.challengeId === ch.id && a.status === "pending")) fail("LEAGUE_INVALID", "Some attempts are still waiting for review.");
    this.patch(this.state.challenges, ch.id, { status, closedAt: status === "closed" ? this.now().toISOString() : ch.closedAt });
    const ledgerLines = status === "closed" ? this.applyScores(ch.id) : 0;
    this.log(ch.seasonId, "league.challenge.status", { week: ch.weekNumber, from: ch.status, to: status, ledgerLines });
    return { ledgerLines };
  }

  // ---- participants -------------------------------------------------------------------------------------------------------------------
  async addParticipant(seasonId: string, displayName: string, externalRef: string | null, membershipVerified: boolean): Promise<string> {
    this.requireAdmin(seasonId);
    this.lockCompleted(seasonId);
    if (membershipVerified !== true) fail("LEAGUE_NOT_ELIGIBLE", "An active, verified gym membership is required to register for a season.");
    const name = validateDisplayName(displayName);
    const ref = externalRef && externalRef.trim() !== "" ? externalRef.trim() : null;
    if (ref !== null && !/^[A-Za-z0-9._:/#-]{1,60}$/.test(ref)) fail("LEAGUE_INVALID", "The member reference may only contain letters, numbers and . _ : / # -");
    const key = participantIdentityKey(name, ref);
    if (this.state.participants.some((p) => p.seasonId === seasonId && participantIdentityKey(p.displayName, p.externalRef) === key)) fail("LEAGUE_DUPLICATE", "Already a participant in this season.");
    const p: Participant = { id: this.uid("participant"), seasonId, publicId: this.newPublicId(), displayName: name, externalRef: ref, active: true, eligible: true, joinedOn: this.now().toISOString().slice(0, 10), membershipVerifiedOn: this.now().toISOString().slice(0, 10) };
    this.state.participants.push(p);
    this.log(seasonId, "league.participant.add", { membershipVerified: true });
    return p.publicId;
  }
  async importParticipants(seasonId: string, csv: string) {
    this.requireAdmin(seasonId);
    const existing = new Set(this.state.participants.filter((p) => p.seasonId === seasonId).map((p) => participantIdentityKey(p.displayName, p.externalRef)));
    const preview = validateParticipantCsv(csv, existing);
    let added = 0;
    const issues: { row: number; message: string }[] = preview.issues.map((i) => ({ row: i.line, message: i.message }));
    for (const r of preview.rows) {
      try { await this.addParticipant(seasonId, r.displayName, r.externalRef, r.membershipVerified); added++; } catch (e) { issues.push({ row: r.line, message: e instanceof LeagueError ? e.message : "Invalid row." }); }
    }
    this.log(seasonId, "league.participant.import", { added, issues: issues.length });
    return { preview, added, issues };
  }
  async setParticipant(participantId: string, patch: { displayName?: string; active?: boolean }, reason: string): Promise<void> {
    const p = this.state.participants.find((x) => x.id === participantId) ?? fail("LEAGUE_NOT_FOUND", "Participant not found.");
    this.requireAdmin(p.seasonId);
    requireReason(reason);
    this.lockCompleted(p.seasonId);
    const name = patch.displayName ? validateDisplayName(patch.displayName) : p.displayName;
    this.patch(this.state.participants, p.id, { displayName: name, active: patch.active ?? p.active });
    this.log(p.seasonId, "league.participant.update", { reason: reason.trim() });
  }
  async setEligibility(participantId: string, eligible: boolean, category: EligibilityDecisionCategory, reason: string): Promise<{ ledgerLines: number }> {
    const p = this.state.participants.find((x) => x.id === participantId) ?? fail("LEAGUE_NOT_FOUND", "Participant not found.");
    this.requireAdmin(p.seasonId);
    const why = requireReason(reason, "The documented decision");
    if (!ELIGIBILITY_DECISION_CATEGORIES.includes(category)) fail("LEAGUE_INVALID", "Unknown decision type.");
    // Eligibility is preserved for the whole season. It changes only by a documented decision: restriction = DISCIPLINARY or FRAUD, reversal = REINSTATEMENT.
    if (eligible ? category !== "REINSTATEMENT" : category === "REINSTATEMENT") fail("LEAGUE_INVALID", eligible ? "Reinstating a participant is recorded as REINSTATEMENT." : "A restriction must be a DISCIPLINARY or FRAUD decision.");
    this.lockCompleted(p.seasonId);
    if (p.eligible === eligible) fail("LEAGUE_INVALID", "The participant already has that eligibility.");
    this.patch(this.state.participants, p.id, { eligible });
    this.state.eligibilityDecisions.push({ id: this.uid("elig"), seasonId: p.seasonId, participantId: p.id, category, previousEligible: p.eligible, newEligible: eligible, reason: why, decidedBy: (this.actorValue as Actor).id, decidedAt: this.now().toISOString() });
    let ledgerLines = 0;
    for (const c of this.state.challenges.filter((x) => x.seasonId === p.seasonId && x.status === "closed").sort((a, b) => a.weekNumber - b.weekNumber)) ledgerLines += this.applyScores(c.id);
    this.log(p.seasonId, "league.participant.eligibility", { category, eligible, reason: why, ledgerLines });
    return { ledgerLines };
  }

  // ---- attempts -----------------------------------------------------------------------------------------------------------------------
  async recordAttempt(i: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }) {
    return this.recordAttemptCore(i, null);
  }
  /** The ONE attempt path. `stations` carries the per-station values of a station attempt; a plain single-value attempt on a challenge with a layout fails closed (the database refuses it at commit). */
  private async recordAttemptCore(i: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }, stations: { layout: StoredLayout; values: readonly StationValue[] } | null) {
    const ch = this.challenge(i.challengeId);
    if (!this.has(ch.seasonId, ["LEAGUE_ADMIN", "JUDGE"])) fail("LEAGUE_FORBIDDEN", "Only a league judge or administrator can record an attempt.");
    if (!i.clientRequestId) fail("LEAGUE_INVALID", "Every attempt needs its own request id.");
    const replay = this.state.attempts.find((a) => a.challengeId === ch.id && a.participantId === i.participantId && a.clientRequestId === i.clientRequestId);
    if (replay) return { ...toAdminAttempt(replay), replay: true };
    const se = this.season(ch.seasonId);
    if (se.status === "completed") fail("LEAGUE_SEASON_LOCKED", "This season is completed — its results are final.");
    const now = this.now();
    if (se.status !== "active" || ch.status !== "open" || (ch.opensAt && (now < new Date(ch.opensAt) || now > new Date(ch.closesAt as string)))) fail("LEAGUE_CHALLENGE_NOT_OPEN", "This challenge is not open for attempts.");
    const p = this.state.participants.find((x) => x.id === i.participantId && x.seasonId === ch.seasonId) ?? fail("LEAGUE_NOT_FOUND", "Participant not found.");
    if (!p.active || !p.eligible || (se.rules.eligibility === "ENTIRE_SEASON" && p.joinedOn > se.startsOn)) fail("LEAGUE_NOT_ELIGIBLE", "This participant is not eligible.");
    validateResultValue(i.value, ch.metric);
    const at = i.attemptedAt ?? now.toISOString();
    if (Date.parse(at) > now.getTime() + 5 * 60_000) fail("LEAGUE_INVALID", "The attempt time is in the future.");
    const mine = this.state.attempts.filter((a) => a.challengeId === ch.id && a.participantId === p.id);
    const live = mine.filter((a) => a.status === "pending" || a.status === "approved").length;
    const maxNo = mine.reduce((m, a) => Math.max(m, a.attemptNo), 0);
    if (live >= ch.attemptPolicy.maxAttempts || maxNo >= 10) fail("LEAGUE_ATTEMPT_LIMIT", "The attempt limit for this challenge has been reached.");
    if (!stations && this.latestLayout(ch.id)) fail("LEAGUE_INVALID", STATION_RULE);
    const a: Attempt = {
      id: this.uid("attempt"), seasonId: ch.seasonId, challengeId: ch.id, participantId: p.id, value: i.value, unit: ch.metric.unit, attemptNo: maxNo + 1, attemptedAt: at,
      recordedBy: (this.actorValue as Actor).id, reviewedBy: null, status: ch.requiresVerification ? "pending" : "approved", reason: null, correctedFrom: null, clientRequestId: i.clientRequestId,
    };
    this.state.attempts.push(a);
    if (stations) for (const v of stations.values) this.state.stationResults.push({ attemptId: a.id, layoutId: stations.layout.id, position: v.position, value: v.value });
    this.log(ch.seasonId, "league.attempt.record", { attempt: a.id });
    return { ...toAdminAttempt(a), replay: false };
  }
  async reviewAttempt(attemptId: string, decision: "approve" | "reject", reason?: string): Promise<AdminAttempt> {
    const a = this.state.attempts.find((x) => x.id === attemptId) ?? fail("LEAGUE_NOT_FOUND", "Attempt not found.");
    const actor = this.actorValue;
    if (!actor || !this.has(a.seasonId, ["LEAGUE_ADMIN", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "Only a league reviewer or administrator can decide an attempt.");
    if (a.recordedBy === actor.id) fail("LEAGUE_SELF_REVIEW", "You cannot approve or reject a result you recorded yourself.");
    const next = decision === "approve" ? "approved" : "rejected";
    if (a.status === next && a.reviewedBy === actor.id) return toAdminAttempt(a);
    if (a.status !== "pending") fail("LEAGUE_INVALID", "This attempt has already been decided.");
    if (this.challenge(a.challengeId).status !== "open") fail("LEAGUE_CHALLENGE_NOT_OPEN", "Attempts can only be reviewed while the challenge is open (use a correction afterwards).");
    if (decision === "reject" && (reason ?? "").trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    const done = this.patch(this.state.attempts, a.id, { status: next, reviewedBy: actor.id, reason: decision === "reject" ? (reason ?? "").trim() : a.reason });
    this.log(a.seasonId, `league.attempt.${decision}`, { attempt: a.id });
    return toAdminAttempt(done);
  }
  async correctAttempt(attemptId: string, newValue: number | null, reason: string): Promise<{ ledgerLines: number }> {
    const a = this.state.attempts.find((x) => x.id === attemptId) ?? fail("LEAGUE_NOT_FOUND", "Attempt not found.");
    this.requireAdmin(a.seasonId);
    return { ledgerLines: this.applyCorrection(a, newValue, requireReason(reason), null, null).ledgerLines };
  }
  /** The ONE correction path (direct admin correction and an applied judge request both end here): void + replace, permanent record, re-score, audit. */
  private applyCorrection(a: Attempt, newValue: number | null, reason: string, requestId: string | null, stations: { layout: StoredLayout; values: readonly StationValue[] } | null): { ledgerLines: number; replacementId: string | null } {
    this.lockCompleted(a.seasonId);
    if (a.status !== "pending" && a.status !== "approved") fail("LEAGUE_INVALID", "Only a pending or approved attempt can be corrected.");
    const ch = this.challenge(a.challengeId);
    if (ch.status === "draft" || ch.status === "published") fail("LEAGUE_CHALLENGE_NOT_OPEN", "The challenge has not opened.");
    if (newValue !== null) validateResultValue(newValue, ch.metric);
    if (newValue !== null && !stations && this.latestLayout(ch.id)) fail("LEAGUE_INVALID", STATION_RULE);   // checked before anything changes: nothing is left half-done
    const actor = this.actorValue as Actor;
    this.patch(this.state.attempts, a.id, { status: "void", reason });
    let replacementId: string | null = null;
    if (newValue !== null) {
      replacementId = this.uid("attempt");
      this.state.attempts.push({ ...a, id: replacementId, value: newValue, recordedBy: actor.id, reviewedBy: actor.id, status: "approved", reason, correctedFrom: a.id, clientRequestId: this.uid("corr") });
      if (stations) for (const v of stations.values) this.state.stationResults.push({ attemptId: replacementId, layoutId: stations.layout.id, position: v.position, value: v.value });
    }
    this.state.corrections.push({ id: this.uid("correction"), seasonId: a.seasonId, challengeId: a.challengeId, participantId: a.participantId, attemptId: a.id, replacementAttemptId: replacementId, previousValue: a.value, newValue, reason, actor: actor.id, at: this.now().toISOString(), requestId });
    const ledgerLines = ch.status === "closed" ? this.applyScores(ch.id) : 0;
    this.log(a.seasonId, "league.attempt.correct", { attempt: a.id, previousValue: a.value, newValue, reason, ledgerLines });
    return { ledgerLines, replacementId };
  }
  async requestCorrection(attemptId: string, proposedValue: number | null, reason: string): Promise<string> {
    const a = this.state.attempts.find((x) => x.id === attemptId) ?? fail("LEAGUE_NOT_FOUND", "Attempt not found.");
    const actor = this.actorValue;
    if (!actor || !this.has(a.seasonId, ["LEAGUE_ADMIN", "JUDGE"])) fail("LEAGUE_FORBIDDEN", "Only a league judge or administrator can request a correction.");
    const why = requireReason(reason);
    this.lockCompleted(a.seasonId);
    if (a.status !== "pending" && a.status !== "approved") fail("LEAGUE_INVALID", "Only a pending or approved attempt can be corrected.");
    const ch = this.challenge(a.challengeId);
    if (ch.status === "draft" || ch.status === "published") fail("LEAGUE_CHALLENGE_NOT_OPEN", "The challenge has not opened.");
    if (proposedValue !== null) validateResultValue(proposedValue, ch.metric);
    if (this.state.correctionRequests.some((r) => r.attemptId === a.id && r.status === "pending")) fail("LEAGUE_DUPLICATE", "A correction request for this result is already waiting.");
    const r: CorrectionRequest = { id: this.uid("corrreq"), seasonId: a.seasonId, challengeId: a.challengeId, attemptId: a.id, participantId: a.participantId, proposedValue, reason: why, requestedBy: actor.id, requestedAt: this.now().toISOString(), status: "pending", decidedBy: null, decidedAt: null, decisionReason: null };
    this.state.correctionRequests.push(r);
    this.log(a.seasonId, "league.correction.request", { request: r.id, attempt: a.id, previousValue: a.value, proposedValue, reason: why });
    return r.id;
  }
  async decideCorrectionRequest(requestId: string, decision: "apply" | "decline", reason: string): Promise<{ ledgerLines: number }> {
    const r = this.state.correctionRequests.find((x) => x.id === requestId) ?? fail("LEAGUE_NOT_FOUND", "Correction request not found.");
    this.requireAdmin(r.seasonId);
    const why = requireReason(reason);
    if (decision !== "apply" && decision !== "decline") fail("LEAGUE_INVALID", "Decision must be apply or decline.");
    this.lockCompleted(r.seasonId);
    if (r.status !== "pending") fail("LEAGUE_INVALID", "This request has already been decided.");
    const actor = this.actorValue as Actor;
    let ledgerLines = 0;
    if (decision === "apply") ledgerLines = this.applyCorrection(this.state.attempts.find((x) => x.id === r.attemptId) as Attempt, r.proposedValue, why, r.id, null).ledgerLines;
    this.patch(this.state.correctionRequests, r.id, { status: decision === "apply" ? "applied" : "declined", decidedBy: actor.id, decidedAt: this.now().toISOString(), decisionReason: why });
    this.log(r.seasonId, `league.correction.${decision}`, { request: r.id, reason: why, ledgerLines });
    return { ledgerLines };
  }

  // ---- appeals ------------------------------------------------------------------------------------------------------------------------
  async lodgeAppeal(i: { challengeId: string; participantId: string; reason: string }): Promise<string> {
    const ch = this.challenge(i.challengeId);
    const actor = this.actorValue;
    if (!actor || !this.has(ch.seasonId, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "Only league staff can lodge an appeal on a participant's behalf.");
    const why = requireReason(i.reason);
    const se = this.season(ch.seasonId);
    this.lockCompleted(ch.seasonId);
    const p = this.state.participants.find((x) => x.id === i.participantId && x.seasonId === ch.seasonId) ?? fail("LEAGUE_NOT_FOUND", "Participant not found.");
    const published = resultPublishedAt(ch, se);
    if (published === null) fail("LEAGUE_APPEAL_CLOSED", "This result has not been published, so there is nothing to appeal yet.");
    const now = this.now();
    if (now.getTime() > Date.parse(appealDeadline(published as string, se.rules.appealWindowHours))) fail("LEAGUE_APPEAL_CLOSED", `The ${se.rules.appealWindowHours}-hour appeal window for this result has ended.`);
    if (this.state.appeals.some((x) => x.challengeId === ch.id && x.participantId === p.id)) fail("LEAGUE_DUPLICATE", "This participant has already appealed this result.");
    const ap: Appeal = { id: this.uid("appeal"), seasonId: ch.seasonId, challengeId: ch.id, participantId: p.id, reason: why, lodgedBy: actor.id, lodgedAt: now.toISOString(), status: "submitted", decidedBy: null, decidedAt: null, decisionReason: null };
    this.state.appeals.push(ap);
    this.log(ch.seasonId, "league.appeal.lodge", { appeal: ap.id, week: ch.weekNumber });
    return ap.id;
  }
  async decideAppeal(appealId: string, decision: "upheld" | "dismissed", reason: string): Promise<void> {
    const ap = this.state.appeals.find((x) => x.id === appealId) ?? fail("LEAGUE_NOT_FOUND", "Appeal not found.");
    this.requireAdmin(ap.seasonId);
    const why = requireReason(reason);
    if (decision !== "upheld" && decision !== "dismissed") fail("LEAGUE_INVALID", "Decision must be upheld or dismissed.");
    this.lockCompleted(ap.seasonId);
    if (ap.status !== "submitted") fail("LEAGUE_INVALID", "This appeal has already been decided.");
    const actor = this.actorValue as Actor;
    // Independence: whoever recorded (or corrected) any attempt in this participant's result cannot review its appeal.
    if (this.state.attempts.some((a) => a.challengeId === ap.challengeId && a.participantId === ap.participantId && a.recordedBy === actor.id)
      || this.state.corrections.some((c) => c.challengeId === ap.challengeId && c.participantId === ap.participantId && c.actor === actor.id)) fail("LEAGUE_CONFLICT_OF_INTEREST", "The administrator who recorded or corrected this result cannot review its appeal.");
    this.patch(this.state.appeals, ap.id, { status: decision, decidedBy: actor.id, decidedAt: this.now().toISOString(), decisionReason: why });
    // Deliberately NO scoring call: an appeal never moves a score. An upheld appeal is followed, if warranted, by a normal audited correction.
    this.log(ap.seasonId, `league.appeal.${decision}`, { appeal: ap.id, reason: why });
  }
  // ---- station layouts -----------------------------------------------------------------------------------------------------------------
  private latestLayout(challengeId: string): StoredLayout | null {
    return this.state.layouts.filter((l) => l.challengeId === challengeId).sort((x, y) => y.version - x.version)[0] ?? null;
  }
  private layoutShape(l: StoredLayout) {
    return { resultType: l.spec.result_type, stations: l.spec.stations.map((x) => ({ position: x.position, maxValue: x.max_value })) };
  }
  private versionOf(attemptId: string): number | null {
    const r = this.state.stationResults.find((x) => x.attemptId === attemptId);
    return r ? (this.state.layouts.find((l) => l.id === r.layoutId)?.version ?? null) : null;
  }
  async getLayout(challengeId: string, version?: number): Promise<StationLayout | null> {
    const ch = this.challenge(challengeId);
    if (!this.has(ch.seasonId, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "League staff only.");
    const all = this.state.layouts.filter((l) => l.challengeId === challengeId).sort((x, y) => x.version - y.version);
    const lay = version === undefined ? all[all.length - 1] : all.find((l) => l.version === version);
    if (!lay) return null;
    return { id: lay.id, challengeId, version: lay.version, resultType: lay.spec.result_type, reason: lay.reason, createdAt: lay.createdAt, stations: wireToStations(lay.spec), versions: all.map((l) => ({ version: l.version, createdAt: l.createdAt, reason: l.reason })) };
  }
  async setLayout(challengeId: string, layout: StationLayoutInput, reason: string): Promise<{ layoutId: string; version: number }> {
    const ch = this.challenge(challengeId);
    this.requireAdmin(ch.seasonId);
    const why = requireReason(reason);
    this.lockCompleted(ch.seasonId);
    if (ch.status === "closed") fail("LEAGUE_INVALID", "A closed challenge can no longer change its layout.");
    const spec = normalizeLayout(layoutInputToWire(layout), ch.metric);
    const cur = this.latestLayout(ch.id);
    const hasAttempts = this.state.attempts.some((a) => a.challengeId === ch.id);
    if (!cur) {
      if (hasAttempts) fail("LEAGUE_INVALID", "A layout can only be introduced before the first attempt.");
    } else {
      if (sameLayout(spec, cur.spec)) fail("LEAGUE_INVALID", "This is already the current layout.");
      const changed = hasAttempts ? structureChange(cur.spec, spec) : null;
      if (changed) fail("LEAGUE_INVALID", `${changed.charAt(0).toUpperCase()}${changed.slice(1)}.`);
    }
    const row: StoredLayout = { id: this.uid("layout"), seasonId: ch.seasonId, challengeId: ch.id, version: (cur?.version ?? 0) + 1, spec, reason: why, createdBy: (this.actorValue as Actor).id, createdAt: this.now().toISOString() };
    this.state.layouts.push(row);
    this.log(ch.seasonId, cur ? "league.layout.substitute" : "league.layout.create", { version: row.version, resultType: spec.result_type, stations: spec.stations.length, reason: why, replacedExercises: cur ? replacedExercises(cur.spec, spec) : [] });
    return { layoutId: row.id, version: row.version };
  }
  async recordStationAttempt(i: { challengeId: string; participantId: string; layoutVersion: number; values: readonly StationValue[]; attemptedAt?: string; clientRequestId: string }) {
    const ch = this.challenge(i.challengeId);
    if (!this.has(ch.seasonId, ["LEAGUE_ADMIN", "JUDGE"])) fail("LEAGUE_FORBIDDEN", "Only a league judge or administrator can record an attempt.");
    if (!i.clientRequestId) fail("LEAGUE_INVALID", "Every attempt needs its own request id.");
    const replay = this.state.attempts.find((a) => a.challengeId === ch.id && a.participantId === i.participantId && a.clientRequestId === i.clientRequestId);
    if (replay) return { ...toAdminAttempt(replay), replay: true, layoutVersion: this.versionOf(replay.id) };
    const lay = this.latestLayout(ch.id);
    if (!lay) fail("LEAGUE_INVALID", "This challenge has no station layout; record a single result instead.");
    if (i.layoutVersion !== lay.version) fail("LEAGUE_LAYOUT_CHANGED", `The exercises were changed (now version ${lay.version}); reload the form and record again.`);
    const total = stationTotal(this.layoutShape(lay), i.values);
    const r = await this.recordAttemptCore({ challengeId: i.challengeId, participantId: i.participantId, value: total, ...(i.attemptedAt === undefined ? {} : { attemptedAt: i.attemptedAt }), clientRequestId: i.clientRequestId }, { layout: lay, values: i.values });
    this.log(ch.seasonId, "league.attempt.stations", { attempt: r.id, layoutVersion: lay.version, total });
    return { ...r, layoutVersion: lay.version };
  }
  async correctStationAttempt(attemptId: string, values: readonly StationValue[], reason: string) {
    const a = this.state.attempts.find((x) => x.id === attemptId) ?? fail("LEAGUE_NOT_FOUND", "Attempt not found.");
    this.requireAdmin(a.seasonId);
    const why = requireReason(reason);
    const first = this.state.stationResults.find((x) => x.attemptId === a.id);
    const lay = first ? this.state.layouts.find((l) => l.id === first.layoutId) : undefined;
    if (!lay) fail("LEAGUE_INVALID", "This result has no station breakdown; correct it as a single result.");
    const total = stationTotal(this.layoutShape(lay), values);
    const r = this.applyCorrection(a, total, why, null, { layout: lay, values });
    this.log(a.seasonId, "league.attempt.stations.correct", { attempt: a.id, layoutVersion: lay.version, total, reason: why });
    return { ledgerLines: r.ledgerLines, total, layoutVersion: lay.version };
  }
  async stationBreakdown(challengeId: string): Promise<readonly StationBreakdownRow[]> {
    const ch = this.challenge(challengeId);
    if (!this.has(ch.seasonId, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "League staff only.");
    return this.state.attempts.filter((a) => a.challengeId === challengeId).slice(-500).sort((x, y) => x.attemptedAt.localeCompare(y.attemptedAt) || x.attemptNo - y.attemptNo || (x.id < y.id ? -1 : 1)).map((a) => {
      const rows = this.state.stationResults.filter((r) => r.attemptId === a.id).sort((x, y) => x.position - y.position);
      const lay = rows[0] ? this.state.layouts.find((l) => l.id === rows[0]?.layoutId) : undefined;
      return {
        attemptId: a.id, participantId: a.participantId, displayName: this.state.participants.find((p) => p.id === a.participantId)?.displayName ?? "", attemptNo: a.attemptNo, status: a.status, value: a.value, layoutVersion: lay?.version ?? null,
        stations: rows.map((r) => ({ position: r.position, name: lay?.spec.stations.find((x) => x.position === r.position)?.name ?? "", value: r.value })),
      };
    });
  }
  async recompute(challengeId: string): Promise<number> {
    const ch = this.challenge(challengeId);
    this.requireAdmin(ch.seasonId);
    if (ch.status !== "closed") fail("LEAGUE_INVALID", "Only a closed challenge has points to reconcile.");
    return this.applyScores(ch.id);
  }
}

function toAdminAttempt(a: Attempt): AdminAttempt {
  return { id: a.id, challengeId: a.challengeId, participantId: a.participantId, value: a.value, unit: a.unit, attemptNo: a.attemptNo, attemptedAt: a.attemptedAt, status: a.status, reason: a.reason, recordedBy: a.recordedBy, reviewedBy: a.reviewedBy, correctedFrom: a.correctedFrom };
}
