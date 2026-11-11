import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ChallengeRepository, CreateChallengeInput } from "../domain/challenge-repository";
import type { ChallengeBranchOption, ChallengeDetail, ChallengeListItem } from "../domain/challenge-queries";
import type { ChallengeStatus } from "../domain/challenge";
import type { ChallengeEligibilityRuleType } from "../domain/challenge-eligibility-rule";


/** The columns every challenge read selects, kept in one place so the list and the detail cannot drift apart. */
const CHALLENGE_COLUMNS =
  "id, season_id, title, description, category, program_type, scope, branch_id, status, " +
  "measurement_type, measurement_unit, scoring_direction, weight, " +
  "registration_start_at, registration_end_at, starts_at, ends_at, created_by";

interface ChallengeRow {
  id: string;
  season_id: string;
  title: string;
  description: string | null;
  category: ChallengeListItem["category"];
  program_type: ChallengeListItem["programType"];
  scope: ChallengeListItem["scope"];
  branch_id: string | null;
  status: ChallengeListItem["status"];
  measurement_type: ChallengeListItem["measurementType"];
  measurement_unit: string;
  scoring_direction: ChallengeListItem["scoringDirection"];
  weight: number;
  registration_start_at: string;
  registration_end_at: string;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
}

function toChallengeListItem(row: ChallengeRow): ChallengeListItem {
  return {
    id: row.id,
    seasonId: row.season_id,
    title: row.title,
    description: row.description,
    category: row.category,
    programType: row.program_type,
    scope: row.scope,
    branchId: row.branch_id,
    status: row.status,
    measurementType: row.measurement_type,
    measurementUnit: row.measurement_unit,
    scoringDirection: row.scoring_direction,
    weight: row.weight,
    registrationStartAt: row.registration_start_at,
    registrationEndAt: row.registration_end_at,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
  };
}

export class SupabaseChallengeRepository implements ChallengeRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async create(input: CreateChallengeInput): Promise<Result<{ challengeId: string }>> {
    const { data, error } = await this.client
      .rpc("create_challenge", {
        p_season_id: input.seasonId,
        p_title: input.title,
        p_description: input.description,
        p_category: input.category,
        p_program_type: input.programType,
        p_scope: input.scope,
        p_branch_id: input.branchId,
        p_measurement_type: input.measurementType,
        p_measurement_unit: input.measurementUnit,
        p_scoring_direction: input.scoringDirection,
        p_weight: input.weight,
        p_registration_start_at: input.registrationStartAt,
        p_registration_end_at: input.registrationEndAt,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_eligibility_rules: input.eligibilityRules.map((rule) => ({ rule_type: rule.ruleType, value: rule.value })),
        p_branch_ids: input.branchIds,
      })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_CREATE_FAILED", error.message));
    }
    const row = data as { challenge_id: string };
    return ok({ challengeId: row.challenge_id });
  }

  async setStatus(challengeId: string, status: ChallengeStatus, reason: string | null): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_challenge_status", {
      p_challenge_id: challengeId,
      p_status: status,
      ...(reason === null ? {} : { p_reason: reason }),
    });

    if (error) {
      return err(domainError("CHALLENGE_SET_STATUS_FAILED", error.message));
    }
    return ok(undefined);
  }

  async addEligibilityRule(challengeId: string, ruleType: ChallengeEligibilityRuleType, age: number): Promise<Result<{ ruleId: string }>> {
    const { data, error } = await this.client
      .rpc("add_challenge_eligibility_rule", { p_challenge_id: challengeId, p_rule_type: ruleType, p_age: age })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_RULE_ADD_FAILED", error.message));
    }
    const row = data as { rule_id: string };
    return ok({ ruleId: row.rule_id });
  }

  async removeEligibilityRule(ruleId: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("remove_challenge_eligibility_rule", { p_rule_id: ruleId });

    if (error) {
      return err(domainError("CHALLENGE_RULE_REMOVE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async list(): Promise<Result<ChallengeListItem[]>> {
    const { data, error } = await this.client
      .from("challenges")
      .select(CHALLENGE_COLUMNS)
      .order("starts_at", { ascending: false });

    if (error) {
      return err(domainError("CHALLENGE_LIST_FAILED", error.message));
    }
    return ok(((data ?? []) as unknown as ChallengeRow[]).map(toChallengeListItem));
  }

  async getDetail(challengeId: string): Promise<Result<ChallengeDetail | null>> {
    const [challengeResult, rulesResult, branchesResult] = await Promise.all([
      this.client.from("challenges").select(CHALLENGE_COLUMNS).eq("id", challengeId).maybeSingle(),
      this.client.from("challenge_eligibility_rules").select("id, rule_type, value").eq("challenge_id", challengeId),
      this.client.from("challenge_branches").select("branch_id").eq("challenge_id", challengeId),
    ]);

    if (challengeResult.error) {
      return err(domainError("CHALLENGE_DETAIL_FAILED", challengeResult.error.message));
    }
    // Not an error: RLS simply filtered the row out, which for a draft the
    // caller may not see is the correct answer rather than a failure.
    if (!challengeResult.data) return ok(null);
    if (rulesResult.error) {
      return err(domainError("CHALLENGE_DETAIL_FAILED", rulesResult.error.message));
    }
    if (branchesResult.error) {
      return err(domainError("CHALLENGE_DETAIL_FAILED", branchesResult.error.message));
    }

    const rules = (rulesResult.data ?? []) as { id: string; rule_type: ChallengeDetail["eligibilityRules"][number]["ruleType"]; value: Record<string, unknown> }[];
    const branchRows = (branchesResult.data ?? []) as { branch_id: string }[];

    return ok({
      ...toChallengeListItem(challengeResult.data as unknown as ChallengeRow),
      eligibilityRules: rules.map((rule) => ({ id: rule.id, ruleType: rule.rule_type, value: rule.value ?? {} })),
      openBranchIds: branchRows.map((row) => row.branch_id),
    });
  }

  async listBranches(): Promise<Result<ChallengeBranchOption[]>> {
    const { data, error } = await this.client.from("branches").select("id, name").order("name", { ascending: true });

    if (error) {
      return err(domainError("CHALLENGE_BRANCHES_FAILED", error.message));
    }
    return ok(((data ?? []) as { id: string; name: string }[]).map((row) => ({ id: row.id, name: row.name })));
  }
}
