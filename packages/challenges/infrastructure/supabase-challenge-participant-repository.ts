import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ChallengeParticipant } from "../domain/challenge-participant";
import type { ChallengeParticipantRepository } from "../domain/challenge-participant-repository";
import type { ChallengeParticipantRow } from "../domain/challenge-queries";

interface ParticipantRow {
  participant_id: string;
  challenge_id: string;
  participant_profile_id: string;
  branch_id: string | null;
  status: ChallengeParticipant["status"];
  eligibility_result: boolean;
  eligibility_reason: string | null;
  designated_coach_id: string | null;
  requested_at: string;
  created_at: string;
}

function toParticipant(row: ParticipantRow): ChallengeParticipant {
  return {
    participantId: row.participant_id,
    challengeId: row.challenge_id,
    participantProfileId: row.participant_profile_id,
    branchId: row.branch_id,
    status: row.status,
    eligibilityResult: row.eligibility_result,
    eligibilityReason: row.eligibility_reason,
    designatedCoachId: row.designated_coach_id ?? null,
    requestedAt: row.requested_at,
    createdAt: row.created_at,
  };
}


const PARTICIPANT_COLUMNS =
  "id, challenge_id, participant_profile_id, branch_id, status, eligibility_result, " +
  "eligibility_reason, designated_coach_id, requested_at";

interface ParticipantReadRow {
  id: string;
  challenge_id: string;
  participant_profile_id: string;
  branch_id: string | null;
  status: ChallengeParticipantRow["status"];
  eligibility_result: boolean | null;
  eligibility_reason: string | null;
  designated_coach_id: string | null;
  requested_at: string;
}

export class SupabaseChallengeParticipantRepository implements ChallengeParticipantRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async requestParticipation(challengeId: string, branchId: string | null): Promise<Result<ChallengeParticipant>> {
    const { data, error } = await this.client
      .rpc("request_challenge_participation", { p_challenge_id: challengeId, p_branch_id: branchId })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_PARTICIPATION_REQUEST_FAILED", error.message));
    }
    return ok(toParticipant(data as ParticipantRow));
  }

  async designateCoach(participantId: string, coachId: string, reason: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("designate_challenge_coach", {
      p_participant_id: participantId,
      p_coach_id: coachId,
      p_reason: reason,
    });

    if (error) {
      return err(domainError("CHALLENGE_COACH_DESIGNATION_FAILED", error.message));
    }
    return ok(undefined);
  }

  /**
   * Display names live in their own table with no FK from
   * challenge_participants, so PostgREST cannot embed them. They are
   * fetched in a second query and joined in memory — the same two-query
   * shape the Reception trainers repository uses for coach assignments.
   */
  private async attachDisplayNames(rows: ParticipantReadRow[]): Promise<ChallengeParticipantRow[]> {
    const profileIds = [...new Set(rows.map((row) => row.participant_profile_id))];
    const names = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data } = await this.client
        .from("challenge_display_names")
        .select("profile_id, display_name")
        .in("profile_id", profileIds);
      for (const row of (data ?? []) as { profile_id: string; display_name: string }[]) {
        names.set(row.profile_id, row.display_name);
      }
    }

    return rows.map((row) => ({
      id: row.id,
      challengeId: row.challenge_id,
      participantProfileId: row.participant_profile_id,
      branchId: row.branch_id,
      status: row.status,
      eligibilityResult: row.eligibility_result,
      eligibilityReason: row.eligibility_reason,
      designatedCoachId: row.designated_coach_id,
      displayName: names.get(row.participant_profile_id) ?? null,
      requestedAt: row.requested_at,
    }));
  }

  async listForChallenge(challengeId: string): Promise<Result<ChallengeParticipantRow[]>> {
    const { data, error } = await this.client
      .from("challenge_participants")
      .select(PARTICIPANT_COLUMNS)
      .eq("challenge_id", challengeId)
      .order("requested_at", { ascending: true });

    if (error) {
      return err(domainError("CHALLENGE_PARTICIPANTS_LIST_FAILED", error.message));
    }
    return ok(await this.attachDisplayNames((data ?? []) as unknown as ParticipantReadRow[]));
  }

  async listOwn(): Promise<Result<ChallengeParticipantRow[]>> {
    // No filter on the caller's own id: the "participant reads own
    // participation" policy already restricts this to auth.uid(), and
    // adding a client-supplied id here would invite trusting one.
    const { data, error } = await this.client
      .from("challenge_participants")
      .select(PARTICIPANT_COLUMNS)
      .order("requested_at", { ascending: false });

    if (error) {
      return err(domainError("CHALLENGE_PARTICIPANTS_LIST_FAILED", error.message));
    }
    return ok(await this.attachDisplayNames((data ?? []) as unknown as ParticipantReadRow[]));
  }
}
