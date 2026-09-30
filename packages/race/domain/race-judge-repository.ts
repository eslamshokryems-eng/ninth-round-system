import type { Result } from "../kernel";
import type { RecordActionInput, RecordActionResult, ReviewDecision, ScoreTally, StationView } from "./judge";

export interface RaceJudgeRepository {
  recordAction(input: RecordActionInput): Promise<Result<RecordActionResult>>;
  reviewAction(performanceEventId: string, decision: ReviewDecision, reason: string): Promise<Result<ScoreTally>>;
  stationView(eventId: string, stationNumber: number): Promise<Result<StationView>>;
}
