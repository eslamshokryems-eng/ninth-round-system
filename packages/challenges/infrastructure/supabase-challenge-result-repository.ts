import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type {
  ChallengeResultRepository,
  RequestChallengeResultCorrectionInput,
  ReviewChallengeResultInput,
  SubmitChallengeResultInput,
} from "../domain/challenge-result-repository";
import type { ChallengeResultReviewRow, ChallengeResultRow } from "../domain/challenge-queries";


const RESULT_COLUMNS =
  "id, challenge_id, participant_profile_id, entered_by_profile_id, result_value, " +
  "measurement_unit, performed_at, status, corrects_result_id, superseded_by_result_id, created_at, " +
  "challenges(title)";

interface ResultRow {
  id: string;
  challenge_id: string;
  participant_profile_id: string;
  entered_by_profile_id: string;
  result_value: number;
  measurement_unit: string;
  performed_at: string;
  status: ChallengeResultRow["status"];
  corrects_result_id: string | null;
  superseded_by_result_id: string | null;
  created_at: string;
  // to-one embed: challenge_results.challenge_id -> challenges.id is a FK
  // *on* challenge_results, so PostgREST returns one object, not an array.
  challenges: { title: string } | null;
}

export class SupabaseChallengeResultRepository implements ChallengeResultRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async submit(input: SubmitChallengeResultInput): Promise<Result<{ resultId: string }>> {
    const { data, error } = await this.client
      .rpc("submit_challenge_result", {
        p_challenge_id: input.challengeId,
        p_participant_profile_id: input.participantProfileId,
        p_result_value: input.resultValue,
        p_measurement_unit: input.measurementUnit,
        p_performed_at: input.performedAt,
      })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_RESULT_SUBMIT_FAILED", error.message));
    }
    const row = data as { result_id: string };
    return ok({ resultId: row.result_id });
  }

  async approve(input: ReviewChallengeResultInput): Promise<Result<void>> {
    const { error } = await this.client.rpc("approve_challenge_result", {
      p_result_id: input.resultId,
      p_notes: input.notes,
    });

    if (error) {
      return err(domainError("CHALLENGE_RESULT_APPROVE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async reject(input: ReviewChallengeResultInput): Promise<Result<void>> {
    const { error } = await this.client.rpc("reject_challenge_result", {
      p_result_id: input.resultId,
      p_notes: input.notes,
    });

    if (error) {
      return err(domainError("CHALLENGE_RESULT_REJECT_FAILED", error.message));
    }
    return ok(undefined);
  }

  async requestCorrection(input: RequestChallengeResultCorrectionInput): Promise<Result<{ resultId: string }>> {
    const { data, error } = await this.client
      .rpc("request_challenge_result_correction", {
        p_corrects_result_id: input.correctsResultId,
        p_result_value: input.resultValue,
        p_measurement_unit: input.measurementUnit,
        p_performed_at: input.performedAt,
      })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_RESULT_CORRECTION_REQUEST_FAILED", error.message));
    }
    const row = data as { result_id: string };
    return ok({ resultId: row.result_id });
  }

  async approveCorrection(input: ReviewChallengeResultInput): Promise<Result<void>> {
    const { error } = await this.client.rpc("approve_challenge_result_correction", {
      p_result_id: input.resultId,
      p_notes: input.notes,
    });

    if (error) {
      return err(domainError("CHALLENGE_RESULT_CORRECTION_APPROVE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async rejectCorrection(input: ReviewChallengeResultInput): Promise<Result<void>> {
    const { error } = await this.client.rpc("reject_challenge_result_correction", {
      p_result_id: input.resultId,
      p_notes: input.notes,
    });

    if (error) {
      return err(domainError("CHALLENGE_RESULT_CORRECTION_REJECT_FAILED", error.message));
    }
    return ok(undefined);
  }

  private async attachDisplayNames(rows: ResultRow[]): Promise<ChallengeResultRow[]> {
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
      challengeTitle: row.challenges?.title ?? null,
      participantProfileId: row.participant_profile_id,
      displayName: names.get(row.participant_profile_id) ?? null,
      enteredByProfileId: row.entered_by_profile_id,
      resultValue: Number(row.result_value),
      measurementUnit: row.measurement_unit,
      performedAt: row.performed_at,
      status: row.status,
      correctsResultId: row.corrects_result_id,
      supersededByResultId: row.superseded_by_result_id,
      createdAt: row.created_at,
    }));
  }

  async listForChallenge(challengeId: string): Promise<Result<ChallengeResultRow[]>> {
    const { data, error } = await this.client
      .from("challenge_results")
      .select(RESULT_COLUMNS)
      .eq("challenge_id", challengeId)
      .order("created_at", { ascending: false });

    if (error) {
      return err(domainError("CHALLENGE_RESULTS_LIST_FAILED", error.message));
    }
    return ok(await this.attachDisplayNames((data ?? []) as unknown as ResultRow[]));
  }

  async listReviewsForChallenge(challengeId: string): Promise<Result<ChallengeResultReviewRow[]>> {
    // Two plain reads rather than an embedded filter: first the competition's
    // result ids (already limited by the row-level policies), then the reviews
    // of exactly those results.
    const { data: results, error: resultsError } = await this.client
      .from("challenge_results")
      .select("id")
      .eq("challenge_id", challengeId);
    if (resultsError) {
      return err(domainError("CHALLENGE_REVIEWS_LIST_FAILED", resultsError.message));
    }
    const ids = ((results ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) return ok([]);

    const { data, error } = await this.client
      .from("challenge_result_reviews")
      .select("id, result_id, reviewer_profile_id, decision, notes, created_at")
      .in("result_id", ids)
      .order("created_at", { ascending: true });
    if (error) {
      return err(domainError("CHALLENGE_REVIEWS_LIST_FAILED", error.message));
    }
    return ok(
      ((data ?? []) as {
        id: string;
        result_id: string;
        reviewer_profile_id: string;
        decision: "approved" | "rejected";
        notes: string | null;
        created_at: string;
      }[]).map((row) => ({
        id: row.id,
        resultId: row.result_id,
        reviewerProfileId: row.reviewer_profile_id,
        decision: row.decision,
        notes: row.notes,
        createdAt: row.created_at,
      })),
    );
  }

  async listOwn(): Promise<Result<ChallengeResultRow[]>> {
    // Deliberately unfiltered by participant: "participant reads own
    // results" plus "authenticated read current approved results" are what
    // decide the rows. Filtering here would be a second, weaker copy of a
    // rule the database already owns.
    const { data, error } = await this.client
      .from("challenge_results")
      .select(RESULT_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      return err(domainError("CHALLENGE_RESULTS_LIST_FAILED", error.message));
    }
    return ok(await this.attachDisplayNames((data ?? []) as unknown as ResultRow[]));
  }
}
