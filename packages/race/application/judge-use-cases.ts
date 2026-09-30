import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RecordActionInput, RecordActionResult, ReviewDecision, ScoreTally, StationView } from "../domain/judge";
import type { RaceJudgeRepository } from "../domain/race-judge-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One tap = one call. The device supplies WHICH result and WHAT happened, plus an id it generated once; it never supplies a time
 * (the server stamps it) and never a score (the server derives it).
 */
export class RecordActionUseCase implements UseCase<RecordActionInput, RecordActionResult> {
  constructor(private readonly judge: RaceJudgeRepository) {}
  async execute(input: RecordActionInput): Promise<Result<RecordActionResult>> {
    if (!UUID.test(input.clientEventId)) return err(domainError("RACE_CLIENT_EVENT_REQUIRED", "Every action needs its own id."));
    if (input.resultId.trim() === "") return err(domainError("RACE_NOT_FOUND", "There is no athlete at this station right now."));
    if (input.type === "TECHNIQUE_SCORE" && (input.value === undefined || input.value < 0 || input.value > 10)) {
      return err(domainError("RACE_INVALID_VALUE", "A technique score is between 0 and 10."));
    }
    if (input.type === "VOID" && !input.voidsEventId) return err(domainError("RACE_VOID_TARGET_INVALID", "Choose the action to undo."));
    if (input.origin === "OFFLINE_QUEUE" && (input.deviceRecordedAt === undefined || input.deviceSeq === undefined)) {
      return err(domainError("RACE_OFFLINE_METADATA_REQUIRED", "A replayed action must carry its device time and sequence number."));
    }
    return this.judge.recordAction(input);
  }
}

export interface ReviewActionInput {
  performanceEventId: string;
  decision: ReviewDecision;
  reason: string;
}
export class ReviewActionUseCase implements UseCase<ReviewActionInput, ScoreTally> {
  constructor(private readonly judge: RaceJudgeRepository) {}
  async execute(input: ReviewActionInput): Promise<Result<ScoreTally>> {
    if (input.reason.trim() === "") return err(domainError("RACE_REASON_REQUIRED", "Write a reason — it goes in the audit log."));
    return this.judge.reviewAction(input.performanceEventId, input.decision, input.reason.trim());
  }
}

export interface StationViewInput {
  eventId: string;
  stationNumber: number;
}
export class GetStationViewUseCase implements UseCase<StationViewInput, StationView> {
  constructor(private readonly judge: RaceJudgeRepository) {}
  async execute(input: StationViewInput): Promise<Result<StationView>> {
    if (!Number.isInteger(input.stationNumber) || input.stationNumber < 1 || input.stationNumber > 9) {
      return err(domainError("RACE_NOT_FOUND", "Choose a station from 1 to 9."));
    }
    return this.judge.stationView(input.eventId, input.stationNumber);
  }
}
