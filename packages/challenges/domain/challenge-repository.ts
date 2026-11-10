import type { Result } from "@9thround/shared-kernel";
import type {
  ChallengeCategory,
  ChallengeStatus,
  ChallengeMeasurementType,
  ChallengeProgramType,
  ChallengeScope,
  ChallengeScoringDirection,
} from "./challenge";
import type { ChallengeEligibilityRuleType } from "./challenge-eligibility-rule";
import type { ChallengeBranchOption, ChallengeDetail, ChallengeListItem } from "./challenge-queries";

export interface CreateChallengeEligibilityRuleInput {
  ruleType: ChallengeEligibilityRuleType;
  value: Record<string, unknown>;
}

export interface CreateChallengeInput {
  seasonId: string;
  title: string;
  description: string | null;
  category: ChallengeCategory;
  programType: ChallengeProgramType | null;
  scope: ChallengeScope;
  branchId: string | null;
  /** MULTI_BRANCH only — the list of branches this competition is open to. Null/empty for BRANCH/GLOBAL. */
  branchIds: string[] | null;
  measurementType: ChallengeMeasurementType;
  measurementUnit: string;
  scoringDirection: ChallengeScoringDirection;
  weight: number;
  registrationStartAt: string;
  registrationEndAt: string;
  startsAt: string;
  endsAt: string;
  /** Created atomically with the challenge — the create_challenge() RPC inserts both in one transaction. */
  eligibilityRules: CreateChallengeEligibilityRuleInput[];
}

export interface ChallengeRepository {
  /** Branch Manager creates within their own branch; Super Admin can create any scope, including GLOBAL/MULTI_BRANCH — enforced server-side in create_challenge(), not just by this interface's caller. */
  create(input: CreateChallengeInput): Promise<Result<{ challengeId: string }>>;
  /**
   * Every competition the signed-in caller may see. This is a plain
   * `select`, so the row-level policies decide the answer: any active
   * profile sees non-draft competitions, while a draft stays visible only
   * to its creator, to branch staff of the branch it is being built for,
   * and to super_admin. Customers and staff therefore call exactly the
   * same method and get different lists.
   */
  list(): Promise<Result<ChallengeListItem[]>>;
  /** One competition with its eligibility rules and (for MULTI_BRANCH) the branches it is open to. Null when the caller may not see it. */
  getDetail(challengeId: string): Promise<Result<ChallengeDetail | null>>;
  /** Branch options for the create form's scope pickers. */
  listBranches(): Promise<Result<ChallengeBranchOption[]>>;
  /**
   * Moves a competition ONE step along draft -> published -> registration_open
   * -> active -> completed -> archived. The database enforces both who may do
   * it (a branch manager for their own branch's BRANCH competitions, a super
   * admin for any) and the transition rule itself, so this interface's caller
   * is not trusted for either.
   */
  setStatus(challengeId: string, status: ChallengeStatus, reason: string | null): Promise<Result<void>>;
  /**
   * Adds a min_age / max_age rule to a competition that has not yet opened
   * registration. Authorization, the "one rule per type" rule, min <= max and
   * the before-registration window are all enforced by the database.
   */
  addEligibilityRule(challengeId: string, ruleType: ChallengeEligibilityRuleType, age: number): Promise<Result<{ ruleId: string }>>;
  removeEligibilityRule(ruleId: string): Promise<Result<void>>;
}
