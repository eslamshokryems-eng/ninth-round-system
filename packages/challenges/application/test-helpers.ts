import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { ChallengeDisplayName } from "../domain/challenge-display-name";
import type { ChallengeDisplayNameRepository } from "../domain/challenge-display-name-repository";
import type { CreateChallengeInput, ChallengeRepository } from "../domain/challenge-repository";
import type { ChallengeParticipant } from "../domain/challenge-participant";
import type { ChallengeParticipantRepository } from "../domain/challenge-participant-repository";
import type {
  ChallengeResultRepository,
  RequestChallengeResultCorrectionInput,
  ReviewChallengeResultInput,
  SubmitChallengeResultInput,
} from "../domain/challenge-result-repository";
import type { CreateChallengeSeasonInput } from "../domain/challenge-season";
import type { ChallengeSeasonRepository } from "../domain/challenge-season-repository";
import type { ChallengeSettingsRepository } from "../domain/challenge-settings-repository";
import type { ChallengeSeason } from "../domain/challenge-season";
import type {
  ChallengeBranchOption,
  ChallengeDetail,
  ChallengeListItem,
  ChallengeParticipantRow,
  ChallengeResultRow, ChallengeResultReviewRow } from "../domain/challenge-queries";

export function buildCreateChallengeSeasonInput(overrides: Partial<CreateChallengeSeasonInput> = {}): CreateChallengeSeasonInput {
  return {
    name: "Winter 2026",
    description: null,
    startsAt: "2026-12-01",
    endsAt: "2027-02-28",
    ...overrides,
  };
}

export class FakeChallengeSeasonRepository implements ChallengeSeasonRepository {
  public lastCreateInput: CreateChallengeSeasonInput | null = null;

  constructor(private results: { create?: Result<{ seasonId: string }>; list?: Result<ChallengeSeason[]> } = {}) {}

  async create(input: CreateChallengeSeasonInput): Promise<Result<{ seasonId: string }>> {
    this.lastCreateInput = input;
    return this.results.create ?? ok({ seasonId: "season-1" });
  }

  async list(): Promise<Result<ChallengeSeason[]>> {
    return this.results.list ?? ok([]);
  }
}

export function fakeChallengeSeasonRepository(): FakeChallengeSeasonRepository {
  return new FakeChallengeSeasonRepository();
}

export class FakeChallengeSettingsRepository implements ChallengeSettingsRepository {
  public lastSetWeightRange: { min: number; max: number } | null = null;

  constructor(private results: { setWeightRange?: Result<void>; getWeightRange?: Result<{ min: number; max: number }> } = {}) {}

  async setWeightRange(min: number, max: number): Promise<Result<void>> {
    this.lastSetWeightRange = { min, max };
    return this.results.setWeightRange ?? ok(undefined);
  }

  async getWeightRange(): Promise<Result<{ min: number; max: number }>> {
    return this.results.getWeightRange ?? ok({ min: 1, max: 15 });
  }
}

export function fakeChallengeSettingsRepository(): FakeChallengeSettingsRepository {
  return new FakeChallengeSettingsRepository();
}

export function buildCreateChallengeInput(overrides: Partial<CreateChallengeInput> = {}): CreateChallengeInput {
  return {
    seasonId: "season-1",
    title: "Push-Up Challenge",
    description: null,
    category: "strength",
    programType: "boxing",
    scope: "BRANCH",
    branchId: "branch-1",
    branchIds: null,
    measurementType: "COUNT",
    measurementUnit: "reps",
    scoringDirection: "HIGHER_IS_BETTER",
    weight: 3,
    registrationStartAt: "2026-12-01T00:00:00.000Z",
    registrationEndAt: "2026-12-07T00:00:00.000Z",
    startsAt: "2026-12-08T00:00:00.000Z",
    endsAt: "2026-12-15T00:00:00.000Z",
    eligibilityRules: [],
    ...overrides,
  };
}

export class FakeChallengeRepository implements ChallengeRepository {
  public lastCreateInput: CreateChallengeInput | null = null;
  public lastSetStatus: { challengeId: string; status: string; reason: string | null } | null = null;

  constructor(private results: { create?: Result<{ challengeId: string }> } = {}) {}

  async create(input: CreateChallengeInput): Promise<Result<{ challengeId: string }>> {
    this.lastCreateInput = input;
    return this.results.create ?? ok({ challengeId: "challenge-1" });
  }

  async list(): Promise<Result<ChallengeListItem[]>> {
    return ok([]);
  }

  async getDetail(): Promise<Result<ChallengeDetail | null>> {
    return ok(null);
  }

  async listBranches(): Promise<Result<ChallengeBranchOption[]>> {
    return ok([]);
  }

  async setStatus(challengeId: string, status: string, reason: string | null): Promise<Result<void>> {
    this.lastSetStatus = { challengeId, status, reason };
    return ok(undefined);
  }

  public lastAddRule: { challengeId: string; ruleType: string; age: number } | null = null;
  public lastRemoveRule: string | null = null;

  async addEligibilityRule(challengeId: string, ruleType: string, age: number): Promise<Result<{ ruleId: string }>> {
    this.lastAddRule = { challengeId, ruleType, age };
    return ok({ ruleId: "rule-1" });
  }

  async removeEligibilityRule(ruleId: string): Promise<Result<void>> {
    this.lastRemoveRule = ruleId;
    return ok(undefined);
  }
}

export function fakeChallengeRepository(): FakeChallengeRepository {
  return new FakeChallengeRepository();
}

export function buildChallengeParticipant(overrides: Partial<ChallengeParticipant> = {}): ChallengeParticipant {
  return {
    participantId: "participant-1",
    challengeId: "challenge-1",
    participantProfileId: "profile-1",
    branchId: "branch-1",
    status: "approved",
    eligibilityResult: true,
    eligibilityReason: null,
    designatedCoachId: null,
    requestedAt: "2026-12-01T10:00:00.000Z",
    createdAt: "2026-12-01T10:00:00.000Z",
    ...overrides,
  };
}

export class FakeChallengeParticipantRepository implements ChallengeParticipantRepository {
  public lastRequestParticipation: { challengeId: string; branchId: string | null } | null = null;
  public lastDesignateCoach: { participantId: string; coachId: string; reason: string } | null = null;

  constructor(
    private results: {
      requestParticipation?: Result<ChallengeParticipant>;
      designateCoach?: Result<void>;
    } = {},
  ) {}

  async requestParticipation(challengeId: string, branchId: string | null): Promise<Result<ChallengeParticipant>> {
    this.lastRequestParticipation = { challengeId, branchId };
    return this.results.requestParticipation ?? ok(buildChallengeParticipant({ challengeId, branchId }));
  }

  async designateCoach(participantId: string, coachId: string, reason: string): Promise<Result<void>> {
    this.lastDesignateCoach = { participantId, coachId, reason };
    return this.results.designateCoach ?? ok(undefined);
  }

  async listForChallenge(): Promise<Result<ChallengeParticipantRow[]>> {
    return ok([]);
  }

  async listOwn(): Promise<Result<ChallengeParticipantRow[]>> {
    return ok([]);
  }
}

export function fakeChallengeParticipantRepository(): FakeChallengeParticipantRepository {
  return new FakeChallengeParticipantRepository();
}

export function buildSubmitChallengeResultInput(overrides: Partial<SubmitChallengeResultInput> = {}): SubmitChallengeResultInput {
  return {
    challengeId: "challenge-1",
    participantProfileId: "profile-1",
    resultValue: 42,
    measurementUnit: "reps",
    performedAt: "2026-12-10T10:00:00.000Z",
    ...overrides,
  };
}

export function buildRequestChallengeResultCorrectionInput(
  overrides: Partial<RequestChallengeResultCorrectionInput> = {},
): RequestChallengeResultCorrectionInput {
  return {
    correctsResultId: "result-1",
    resultValue: 45,
    measurementUnit: "reps",
    performedAt: "2026-12-10T10:00:00.000Z",
    ...overrides,
  };
}

export class FakeChallengeResultRepository implements ChallengeResultRepository {
  public lastSubmitInput: SubmitChallengeResultInput | null = null;
  public lastApproveInput: ReviewChallengeResultInput | null = null;
  public lastRejectInput: ReviewChallengeResultInput | null = null;
  public lastRequestCorrectionInput: RequestChallengeResultCorrectionInput | null = null;
  public lastApproveCorrectionInput: ReviewChallengeResultInput | null = null;
  public lastRejectCorrectionInput: ReviewChallengeResultInput | null = null;

  constructor(
    private results: {
      submit?: Result<{ resultId: string }>;
      approve?: Result<void>;
      reject?: Result<void>;
      requestCorrection?: Result<{ resultId: string }>;
      approveCorrection?: Result<void>;
      rejectCorrection?: Result<void>;
    } = {},
  ) {}

  async submit(input: SubmitChallengeResultInput): Promise<Result<{ resultId: string }>> {
    this.lastSubmitInput = input;
    return this.results.submit ?? ok({ resultId: "result-1" });
  }

  async approve(input: ReviewChallengeResultInput): Promise<Result<void>> {
    this.lastApproveInput = input;
    return this.results.approve ?? ok(undefined);
  }

  async reject(input: ReviewChallengeResultInput): Promise<Result<void>> {
    this.lastRejectInput = input;
    return this.results.reject ?? ok(undefined);
  }

  async requestCorrection(input: RequestChallengeResultCorrectionInput): Promise<Result<{ resultId: string }>> {
    this.lastRequestCorrectionInput = input;
    return this.results.requestCorrection ?? ok({ resultId: "result-2" });
  }

  async approveCorrection(input: ReviewChallengeResultInput): Promise<Result<void>> {
    this.lastApproveCorrectionInput = input;
    return this.results.approveCorrection ?? ok(undefined);
  }

  async rejectCorrection(input: ReviewChallengeResultInput): Promise<Result<void>> {
    this.lastRejectCorrectionInput = input;
    return this.results.rejectCorrection ?? ok(undefined);
  }

  async listForChallenge(): Promise<Result<ChallengeResultRow[]>> {
    return ok([]);
  }

  async listReviewsForChallenge(): Promise<Result<ChallengeResultReviewRow[]>> {
    return ok([]);
  }

  async listOwn(): Promise<Result<ChallengeResultRow[]>> {
    return ok([]);
  }
}

export function fakeChallengeResultRepository(
  results: ConstructorParameters<typeof FakeChallengeResultRepository>[0] = {},
): FakeChallengeResultRepository {
  return new FakeChallengeResultRepository(results);
}

export function buildChallengeDisplayName(overrides: Partial<ChallengeDisplayName> = {}): ChallengeDisplayName {
  return {
    profileId: "profile-1",
    displayName: "Iron Fist",
    createdAt: "2026-12-01T10:00:00.000Z",
    updatedAt: "2026-12-01T10:00:00.000Z",
    ...overrides,
  };
}

export class FakeChallengeDisplayNameRepository implements ChallengeDisplayNameRepository {
  public lastSetOwn: string | null = null;

  constructor(
    private results: {
      getOwn?: Result<ChallengeDisplayName | null>;
      setOwn?: Result<void>;
    } = {},
  ) {}

  async getOwn(): Promise<Result<ChallengeDisplayName | null>> {
    return this.results.getOwn ?? ok(null);
  }

  async setOwn(displayName: string): Promise<Result<void>> {
    this.lastSetOwn = displayName;
    return this.results.setOwn ?? ok(undefined);
  }
}

export function fakeChallengeDisplayNameRepository(
  results: ConstructorParameters<typeof FakeChallengeDisplayNameRepository>[0] = {},
): FakeChallengeDisplayNameRepository {
  return new FakeChallengeDisplayNameRepository(results);
}
