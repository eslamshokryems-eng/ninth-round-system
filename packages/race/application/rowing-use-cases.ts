import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { EvidenceHistory, RaceRowingRepository, ReviewAnswer, RowingCorrection } from "../domain/race-rowing-repository";
import type { RowingView } from "../domain/rowing";

export class GetRowingViewUseCase implements UseCase<{ eventId: string; all?: boolean }, RowingView> {
  constructor(private readonly rowing: RaceRowingRepository) {}
  execute(i: { eventId: string; all?: boolean }): Promise<Result<RowingView>> {
    return this.rowing.view(i.eventId, i.all ?? false);
  }
}

export class GetEvidenceHistoryUseCase implements UseCase<{ resultId: string }, EvidenceHistory> {
  constructor(private readonly rowing: RaceRowingRepository) {}
  execute(i: { resultId: string }) {
    return this.rowing.history(i.resultId);
  }
}

export class GetEvidenceImageUseCase implements UseCase<{ path: string }, string> {
  constructor(private readonly rowing: RaceRowingRepository) {}
  execute(i: { path: string }) {
    return this.rowing.imageUrl(i.path);
  }
}

/** Master Control decides a late confirmation. A reason is mandatory and goes to the audit log. */
export class ReviewEvidenceUseCase implements UseCase<{ attemptId: string; decision: "APPROVED" | "REJECTED"; reason: string }, ReviewAnswer> {
  constructor(private readonly rowing: RaceRowingRepository) {}
  async execute(i: { attemptId: string; decision: "APPROVED" | "REJECTED"; reason: string }): Promise<Result<ReviewAnswer>> {
    if (i.reason.trim() === "") return err(domainError("RACE_REASON_REQUIRED", "Write a reason — it goes in the audit log."));
    return this.rowing.review(i.attemptId, i.decision, i.reason.trim());
  }
}

export interface CorrectRowingInput { resultId: string; distanceM: number; reason: string; evidenceAttemptId: string | null; maxDistanceM?: number }

/** A manual rowing correction: corrected distance + reason + a reference to the original evidence. Never a silent replacement of the OCR result. */
export class CorrectRowingUseCase implements UseCase<CorrectRowingInput, RowingCorrection> {
  constructor(private readonly rowing: RaceRowingRepository) {}
  async execute(i: CorrectRowingInput): Promise<Result<RowingCorrection>> {
    if (i.reason.trim() === "") return err(domainError("RACE_REASON_REQUIRED", "Write why the distance is being corrected — it goes in the audit log."));
    const max = i.maxDistanceM ?? 1500;
    if (!Number.isInteger(i.distanceM) || i.distanceM < 0 || i.distanceM > max) return err(domainError("RACE_INVALID_VALUE", `A rowing distance is a whole number of metres from 0 to ${max}.`));
    return this.rowing.correct(i.resultId, i.distanceM, i.reason.trim(), i.evidenceAttemptId);
  }
}
