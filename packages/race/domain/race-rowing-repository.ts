import type { Result } from "../kernel";
import type { OcrAttempt, OcrOutcome, RowingView } from "./rowing";

export interface EvidenceFile {
  readonly size: number;
  readonly type: string;
}

export interface CaptureInput {
  resultId: string;
  clientCaptureId: string;
  path: string;
  mime: string;
  bytes: number;
  sha256: string;
  origin: "ONLINE" | "OFFLINE_QUEUE";
  deviceRecordedAt: string | null;
  deviceRaceMs: number | null;
  deviceSeq: number | null;
}
export interface CaptureAnswer { attemptId: string; attemptNo: number; status: string; ocrStatus: string; duplicate: boolean; captureRaceMs: number | null; afterTransition: boolean | null }
export interface SubmitAnswer { attemptId: string; ocrStatus: string; proposedDistanceM: number | null; confidence: number | null; duplicate: boolean; requiresAcknowledgement: boolean; canConfirm: boolean }
export interface ConfirmAnswer { attemptId: string; status: string; official: boolean; duplicate: boolean; afterTransition: boolean | null; distanceM: number | null }
export interface RetakeAnswer { attemptId: string; status: string; duplicate: boolean }
export interface ReviewAnswer { attemptId: string; status: string; official: boolean; score: number | null }
export interface RowingCorrection { resultId: string; old: number | null; new: number; evidenceAttemptId: string | null; score: number | null }

export interface EvidenceHistory {
  resultId: string;
  evidenceState: string;
  officialDistanceM: number | null;
  resultStatus: string;
  attempts: OcrAttempt[];
  corrections: { id: string; old: number | null; new: number; reason: string; by: string; at: string; evidenceAttemptId: string | null }[];
  audit: { at: string; action: string; actor: string | null; metadata: Record<string, unknown> }[];
}

/** Everything the rowing evidence workflow needs from the backend. Each write is idempotent by a client-generated id. */
export interface RaceRowingRepository {
  view(eventId: string, all?: boolean): Promise<Result<RowingView>>;
  upload(path: string, file: unknown, mime: string): Promise<Result<void>>;
  capture(input: CaptureInput): Promise<Result<CaptureAnswer>>;
  submitOcr(attemptId: string, outcome: OcrOutcome, provider: string): Promise<Result<SubmitAnswer>>;
  confirm(attemptId: string, clientEventId: string, acknowledgeLowConfidence: boolean): Promise<Result<ConfirmAnswer>>;
  retake(attemptId: string, clientEventId: string, reason: string | null): Promise<Result<RetakeAnswer>>;
  review(attemptId: string, decision: "APPROVED" | "REJECTED", reason: string): Promise<Result<ReviewAnswer>>;
  correct(resultId: string, distanceM: number, reason: string, evidenceAttemptId: string | null): Promise<Result<RowingCorrection>>;
  history(resultId: string): Promise<Result<EvidenceHistory>>;
  imageUrl(path: string): Promise<Result<string>>;
}
