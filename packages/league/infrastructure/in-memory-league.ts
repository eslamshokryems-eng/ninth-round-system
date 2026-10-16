import { LeagueError } from "../domain/errors";
import type { AdminAttempt, AdminOverview, AdminStanding, AuditLine, ChallengeInput, LeagueGateway, MySeason, PublicChallengeResults, PublicParticipantPage } from "../domain/gateway";
import { participantIdentityKey, validateParticipantCsv } from "../domain/import";
import { toPublicLeague, type PublicLeague } from "../domain/public";
import { reconcileChallenge, scoreChallenge, selectCountedAttempt } from "../domain/scoring";
import { buildStandings, centsToPoints } from "../domain/standings";
import {
  PROVISIONAL_SEASON_RULES,
  type Actor,
  type Attempt,
  type Challenge,
  type ChallengeStatus,
  type LedgerEntry,
  type LeagueRole,
  type Metric,
  type Participant,
  type Season,
  type SeasonRules,
  type SeasonStatus,
} from "../domain/types";
import {
  requireChallengeTransition,
  requireSeasonTransition,
  validateChallenge,
  validateDisplayName,
  validateResultValue,
  validateRules,
  validateSeasonDates,
} from "../domain/validation";

interface State {
  seasons: Season[];
  challenges: Challenge[];
  participants: Participant[];
  attempts: Attempt[];
  ledger: LedgerEntry[]; // append-only
  audit: (AuditLine & { seasonId: string })[];
  staff: { seasonId: string; profileId: string; role: LeagueRole }[];
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
  readonly state: State = { seasons: [], challenges: [], participants: [], attempts: [], ledger: [], audit: [], staff: [] };
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
    return this.state.staff.some((s) => s.seasonId === seasonId && s.profileId === a.id && roles.includes(s.role));
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
      roles: [...new Set(this.state.staff.filter((f) => f.seasonId === s.id && f.profileId === a.id).map((f) => f.role))], isSuperAdmin: a.isSuperAdmin,
    }));
  }
  async overview(seasonId: string): Promise<AdminOverview> {
    if (!this.has(seasonId, ["LEAGUE_ADMIN", "JUDGE", "REVIEWER"])) fail("LEAGUE_FORBIDDEN", "League staff only.");
    const se = this.season(seasonId);
    const admin = this.has(seasonId, ["LEAGUE_ADMIN"]);
    const st = this.standings(seasonId);
    const standings: AdminStanding[] = st.rows.map((r) => ({
      id: r.participantId, publicId: r.publicId, displayName: r.displayName, rank: r.rank, totalPoints: centsToPoints(r.totalCents),
      weeklyPoints: Object.fromEntries(Object.entries(r.weeklyCents).map(([w, c]) => [Number(w), centsToPoints(c)])), challengesCompleted: r.challengesCompleted, firstPlaces: r.firstPlaces,
      movement: r.movement, gapToNext: r.gapToNextCents === null ? null : centsToPoints(r.gapToNextCents),
    }));
    const attempts: AdminAttempt[] = this.state.attempts.filter((a) => a.seasonId === seasonId).slice(-500).map((a) => ({
      id: a.id, challengeId: a.challengeId, participantId: a.participantId, value: a.value, unit: a.unit, attemptNo: a.attemptNo, attemptedAt: a.attemptedAt, status: a.status, reason: a.reason,
      recordedBy: a.recordedBy, reviewedBy: a.reviewedBy, correctedFrom: a.correctedFrom,
    }));
    return {
      season: se, isAdmin: admin,
      challenges: this.state.challenges.filter((c) => c.seasonId === seasonId).sort((a, b) => a.weekNumber - b.weekNumber),
      participants: this.state.participants.filter((p) => p.seasonId === seasonId).map((p) => ({ id: p.id, publicId: p.publicId, displayName: p.displayName, active: p.active, eligible: p.eligible, externalRef: admin ? p.externalRef : null })),
      attempts, standings,
      staff: admin ? this.state.staff.filter((f) => f.seasonId === seasonId).map((f) => ({ profileId: f.profileId, role: f.role, active: true })) : null,
    };
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
    const s: Season = { id: this.uid("season"), publicSlug: slug, name, status: "draft", startsOn: i.startsOn, endsOn: i.endsOn, rules, published: false };
    this.state.seasons.push(s);
    this.state.staff.push({ seasonId: s.id, profileId: a.id, role: "LEAGUE_ADMIN" });
    this.log(s.id, "league.season.create", { slug });
    return s.id;
  }
  async setSeasonStatus(seasonId: string, status: SeasonStatus, reason?: string): Promise<void> {
    this.requireAdmin(seasonId);
    const se = this.season(seasonId);
    requireSeasonTransition(se.status, status);
    if (status === "completed") {
      if (this.state.challenges.some((c) => c.seasonId === seasonId && c.status === "open")) fail("LEAGUE_INVALID", "Close the open challenge first.");
      if (this.state.attempts.some((a) => a.seasonId === seasonId && a.status === "pending")) fail("LEAGUE_INVALID", "Some attempts are still waiting for review.");
    }
    this.patch(this.state.seasons, seasonId, { status });
    this.log(seasonId, "league.season.status", { from: se.status, to: status, reason: reason ?? null });
  }
  async setPublished(seasonId: string, published: boolean, reason: string): Promise<void> {
    this.requireAdmin(seasonId);
    if (reason.trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    const se = this.season(seasonId);
    if (published && se.status === "draft") fail("LEAGUE_INVALID", "Schedule the season before publishing it.");
    this.patch(this.state.seasons, seasonId, { published });
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
      attemptPolicy: { maxAttempts: input.maxAttempts ?? ex?.attemptPolicy.maxAttempts ?? 1, counting: (input.counting ?? ex?.attemptPolicy.counting ?? "BEST") as Challenge["attemptPolicy"]["counting"] },
      opensAt: input.opensAt !== undefined ? input.opensAt : (ex?.opensAt ?? null), closesAt: input.closesAt !== undefined ? input.closesAt : (ex?.closesAt ?? null),
      referenceUrl: input.referenceUrl !== undefined ? input.referenceUrl : (ex?.referenceUrl ?? null), requiresVerification: input.requiresVerification ?? ex?.requiresVerification ?? true,
    };
    validateChallenge(next, se);
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
    this.patch(this.state.challenges, ch.id, { status });
    const ledgerLines = status === "closed" ? this.applyScores(ch.id) : 0;
    this.log(ch.seasonId, "league.challenge.status", { week: ch.weekNumber, from: ch.status, to: status, ledgerLines });
    return { ledgerLines };
  }

  // ---- participants -------------------------------------------------------------------------------------------------------------------
  async addParticipant(seasonId: string, displayName: string, externalRef: string | null, eligible: boolean): Promise<string> {
    this.requireAdmin(seasonId);
    this.lockCompleted(seasonId);
    const name = validateDisplayName(displayName);
    const ref = externalRef && externalRef.trim() !== "" ? externalRef.trim() : null;
    if (ref !== null && !/^[A-Za-z0-9._:/#-]{1,60}$/.test(ref)) fail("LEAGUE_INVALID", "The member reference may only contain letters, numbers and . _ : / # -");
    const key = participantIdentityKey(name, ref);
    if (this.state.participants.some((p) => p.seasonId === seasonId && participantIdentityKey(p.displayName, p.externalRef) === key)) fail("LEAGUE_DUPLICATE", "Already a participant in this season.");
    const p: Participant = { id: this.uid("participant"), seasonId, publicId: this.newPublicId(), displayName: name, externalRef: ref, active: true, eligible, joinedOn: this.now().toISOString().slice(0, 10) };
    this.state.participants.push(p);
    this.log(seasonId, "league.participant.add", { eligible });
    return p.publicId;
  }
  async importParticipants(seasonId: string, csv: string) {
    this.requireAdmin(seasonId);
    const existing = new Set(this.state.participants.filter((p) => p.seasonId === seasonId).map((p) => participantIdentityKey(p.displayName, p.externalRef)));
    const preview = validateParticipantCsv(csv, existing);
    let added = 0;
    const issues: { row: number; message: string }[] = preview.issues.map((i) => ({ row: i.line, message: i.message }));
    for (const r of preview.rows) {
      try { await this.addParticipant(seasonId, r.displayName, r.externalRef, r.eligible); added++; } catch (e) { issues.push({ row: r.line, message: e instanceof LeagueError ? e.message : "Invalid row." }); }
    }
    this.log(seasonId, "league.participant.import", { added, issues: issues.length });
    return { preview, added, issues };
  }
  async setParticipant(participantId: string, patch: { displayName?: string; active?: boolean; eligible?: boolean }, reason: string): Promise<void> {
    const p = this.state.participants.find((x) => x.id === participantId) ?? fail("LEAGUE_NOT_FOUND", "Participant not found.");
    this.requireAdmin(p.seasonId);
    if (reason.trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    this.lockCompleted(p.seasonId);
    const name = patch.displayName ? validateDisplayName(patch.displayName) : p.displayName;
    this.patch(this.state.participants, p.id, { displayName: name, active: patch.active ?? p.active, eligible: patch.eligible ?? p.eligible });
    let lines = 0;
    if (patch.eligible !== undefined && patch.eligible !== p.eligible) for (const c of this.state.challenges.filter((x) => x.seasonId === p.seasonId && x.status === "closed")) lines += this.applyScores(c.id);
    this.log(p.seasonId, "league.participant.update", { reason, ledgerLines: lines });
  }

  // ---- attempts -----------------------------------------------------------------------------------------------------------------------
  async recordAttempt(i: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }) {
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
    const a: Attempt = {
      id: this.uid("attempt"), seasonId: ch.seasonId, challengeId: ch.id, participantId: p.id, value: i.value, unit: ch.metric.unit, attemptNo: maxNo + 1, attemptedAt: at,
      recordedBy: (this.actorValue as Actor).id, reviewedBy: null, status: ch.requiresVerification ? "pending" : "approved", reason: null, correctedFrom: null, clientRequestId: i.clientRequestId,
    };
    this.state.attempts.push(a);
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
    if (reason.trim() === "") fail("LEAGUE_REASON_REQUIRED", "A reason is required.");
    this.lockCompleted(a.seasonId);
    if (a.status !== "pending" && a.status !== "approved") fail("LEAGUE_INVALID", "Only a pending or approved attempt can be corrected.");
    const ch = this.challenge(a.challengeId);
    if (ch.status === "draft" || ch.status === "published") fail("LEAGUE_CHALLENGE_NOT_OPEN", "The challenge has not opened.");
    if (newValue !== null) validateResultValue(newValue, ch.metric);
    this.patch(this.state.attempts, a.id, { status: "void", reason: reason.trim() });
    if (newValue !== null) {
      const actor = this.actorValue as Actor;
      this.state.attempts.push({ ...a, id: this.uid("attempt"), value: newValue, recordedBy: actor.id, reviewedBy: actor.id, status: "approved", reason: reason.trim(), correctedFrom: a.id, clientRequestId: this.uid("corr") });
    }
    const ledgerLines = ch.status === "closed" ? this.applyScores(ch.id) : 0;
    this.log(a.seasonId, "league.attempt.correct", { attempt: a.id, reason, ledgerLines });
    return { ledgerLines };
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
