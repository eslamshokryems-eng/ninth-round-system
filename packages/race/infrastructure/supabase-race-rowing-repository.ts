import { domainError, err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceEvidenceHistoryJson, RaceOcrAttemptJson, RaceRowingViewJson } from "./race-database";
import type { RaceSupabaseClient } from "./race-client";
import type { EvidenceState, OcrAttempt, OcrAttemptStatus, OcrOutcome, OcrProcessing, RowingPhase, RowingView } from "../domain/rowing";
import type { CaptureAnswer, CaptureInput, ConfirmAnswer, EvidenceHistory, RaceRowingRepository, RetakeAnswer, ReviewAnswer, RowingCorrection, SubmitAnswer } from "../domain/race-rowing-repository";
import { toRaceError } from "./supabase-race-registration-repository";

export function toAttempt(a: RaceOcrAttemptJson): OcrAttempt {
  return {
    attemptId: a.attempt_id,
    attemptNo: a.attempt_no,
    status: a.status as OcrAttemptStatus,
    ocrStatus: a.ocr_status as OcrProcessing,
    proposedDistanceM: a.proposed_distance_m,
    confidence: a.confidence === null ? null : Number(a.confidence),
    ocrText: a.ocr_text,
    ocrEngine: a.ocr_engine,
    capturedAt: a.captured_at,
    captureRaceMs: a.capture_race_ms,
    imagePath: a.image_path,
    confirmedDistanceM: a.confirmed_distance_m,
    retakeReason: a.retake_reason,
    confirmedAfterTransition: a.confirmed_after_transition,
    reviewReason: a.review_reason,
    origin: a.origin === "OFFLINE_QUEUE" ? "OFFLINE_QUEUE" : "ONLINE",
  };
}

export function toRowingView(j: RaceRowingViewJson): RowingView {
  return {
    serverTime: j.server_time,
    station: j.station,
    clock: { started: j.clock.started, paused: j.clock.paused, finished: j.clock.finished, raceMs: j.clock.race_ms, version: j.clock.version },
    transitionMs: j.transition_ms,
    items: j.items.map((i) => ({
      resultId: i.result_id,
      raceNumber: i.race_number,
      name: i.name,
      categoryCode: i.category_code,
      windowStartMs: i.window_start_ms,
      windowEndMs: i.window_end_ms,
      scoringEndMs: i.scoring_end_ms,
      phase: i.phase as RowingPhase,
      resultStatus: i.result_status,
      evidenceState: i.evidence_state as EvidenceState,
      officialDistanceM: i.official_distance_m === null ? null : Number(i.official_distance_m),
      limits: { minConfidence: Number(i.limits.min_confidence), reviewConfidence: Number(i.limits.review_confidence), maxDistanceM: i.limits.max_distance_m },
      attempts: i.attempts.map(toAttempt),
    })),
  };
}

export function toHistory(j: RaceEvidenceHistoryJson): EvidenceHistory {
  return {
    resultId: j.result_id,
    evidenceState: j.evidence_state,
    officialDistanceM: j.official_distance_m,
    resultStatus: j.result_status,
    attempts: (j.attempts as Record<string, unknown>[]).map((a) =>
      toAttempt({
        attempt_id: String(a.id), attempt_no: Number(a.attempt_no), status: String(a.status), ocr_status: String(a.ocr_status),
        proposed_distance_m: (a.proposed_distance_m as number | null) ?? null, confidence: (a.confidence as number | null) ?? null,
        ocr_text: (a.ocr_text as string | null) ?? null, ocr_engine: (a.ocr_engine as string | null) ?? null, captured_at: String(a.captured_at),
        capture_race_ms: (a.capture_race_ms as number | null) ?? null, image_path: String(a.storage_path),
        confirmed_distance_m: (a.confirmed_distance_m as number | null) ?? null, retake_reason: (a.retake_reason as string | null) ?? null,
        confirmed_after_transition: a.confirmed_after_transition === true, review_reason: (a.review_reason as string | null) ?? null, origin: String(a.origin),
      }),
    ),
    corrections: j.corrections.map((c) => ({ id: c.id, old: c.old, new: c.new, reason: c.reason, by: c.by, at: c.at, evidenceAttemptId: c.evidence_attempt_id })),
    audit: j.audit.map((a) => ({ at: a.at, action: a.action, actor: a.actor, metadata: a.metadata })),
  };
}

export class SupabaseRaceRowingRepository implements RaceRowingRepository {
  constructor(private readonly client: RaceSupabaseClient) {}

  async view(eventId: string, all = false): Promise<Result<RowingView>> {
    const { data, error } = await this.client.rpc("race_rowing_view", { p_event_id: eventId, p_all: all });
    if (error) return err(toRaceError(error));
    return ok(toRowingView(data as RaceRowingViewJson));
  }

  /** Immutable evidence: never overwritten. A retry of the same upload finds the object already there, which is success. */
  async upload(path: string, file: unknown, mime: string): Promise<Result<void>> {
    try {
      const { error } = await this.client.storage.from("race-evidence").upload(path, file as Blob, { contentType: mime, upsert: false });
      if (!error) return ok(undefined);
      const e = error as { statusCode?: string; message?: string };
      if (e.statusCode === "409" || /already exists|duplicate/i.test(e.message ?? "")) return ok(undefined);
      if (/Failed to fetch|NetworkError|network/i.test(e.message ?? "")) return err(domainError("RACE_REQUEST_FAILED", "Something went wrong. Check your connection and try again."));
      return err(domainError("RACE_UPLOAD_REFUSED", e.message ?? "The photo could not be uploaded."));
    } catch {
      return err(domainError("RACE_REQUEST_FAILED", "Something went wrong. Check your connection and try again."));
    }
  }

  async capture(i: CaptureInput): Promise<Result<CaptureAnswer>> {
    const { data, error } = await this.client.rpc("race_ocr_capture", {
      p_station_result_id: i.resultId, p_client_capture_id: i.clientCaptureId, p_storage_path: i.path, p_image_mime: i.mime, p_image_bytes: i.bytes, p_image_sha256: i.sha256,
      p_origin: i.origin, p_device_recorded_at: i.deviceRecordedAt, p_device_race_ms: i.deviceRaceMs, p_device_seq: i.deviceSeq,
    });
    if (error) return err(toRaceError(error));
    return ok({ attemptId: data.attempt_id, attemptNo: data.attempt_no, status: data.status, ocrStatus: data.ocr_status, duplicate: data.duplicate, captureRaceMs: data.capture_race_ms, afterTransition: data.after_transition });
  }

  async submitOcr(attemptId: string, o: OcrOutcome, provider: string): Promise<Result<SubmitAnswer>> {
    const { data, error } = await this.client.rpc("race_ocr_submit", {
      p_attempt_id: attemptId, p_provider: provider, p_engine: o.engine, p_raw_text: o.rawText,
      p_raw_response: { text: o.rawText, parse: o.parse, ...(o.engineError ? { engine_error: o.engineError } : {}) },
      p_distance_m: o.distanceM, p_confidence: o.confidence,
    });
    if (error) return err(toRaceError(error));
    return ok({ attemptId: data.attempt_id, ocrStatus: data.ocr_status, proposedDistanceM: data.proposed_distance_m, confidence: data.confidence, duplicate: data.duplicate,
                requiresAcknowledgement: data.requires_acknowledgement === true, canConfirm: data.can_confirm !== false });
  }

  async confirm(attemptId: string, clientEventId: string, acknowledge: boolean): Promise<Result<ConfirmAnswer>> {
    const { data, error } = await this.client.rpc("race_ocr_confirm", { p_attempt_id: attemptId, p_client_event_id: clientEventId, p_acknowledge_low_confidence: acknowledge });
    if (error) return err(toRaceError(error));
    return ok({ attemptId: data.attempt_id, status: data.status, official: data.official, duplicate: data.duplicate, afterTransition: data.after_transition, distanceM: data.distance_m });
  }

  async retake(attemptId: string, clientEventId: string, reason: string | null): Promise<Result<RetakeAnswer>> {
    const { data, error } = await this.client.rpc("race_ocr_retake", { p_attempt_id: attemptId, p_client_event_id: clientEventId, p_reason: reason });
    if (error) return err(toRaceError(error));
    return ok({ attemptId: data.attempt_id, status: data.status, duplicate: data.duplicate });
  }

  async review(attemptId: string, decision: "APPROVED" | "REJECTED", reason: string): Promise<Result<ReviewAnswer>> {
    const { data, error } = await this.client.rpc("race_ocr_review", { p_attempt_id: attemptId, p_decision: decision, p_reason: reason });
    if (error) return err(toRaceError(error));
    return ok({ attemptId: data.attempt_id, status: data.status, official: data.official, score: data.score });
  }

  async correct(resultId: string, distanceM: number, reason: string, evidenceAttemptId: string | null): Promise<Result<RowingCorrection>> {
    const { data, error } = await this.client.rpc("race_correct_rowing_result", { p_result_id: resultId, p_distance_m: distanceM, p_reason: reason, p_evidence_attempt_id: evidenceAttemptId });
    if (error) return err(toRaceError(error));
    return ok({ resultId: data.result_id, old: data.old, new: data.new, evidenceAttemptId: data.evidence_attempt_id, score: data.score });
  }

  async history(resultId: string): Promise<Result<EvidenceHistory>> {
    const { data, error } = await this.client.rpc("race_evidence_history", { p_result_id: resultId });
    if (error) return err(toRaceError(error));
    return ok(toHistory(data as RaceEvidenceHistoryJson));
  }

  async imageUrl(path: string): Promise<Result<string>> {
    try {
      const { data, error } = await this.client.storage.from("race-evidence").createSignedUrl(path, 120);
      if (error || !data) return err(domainError("RACE_FORBIDDEN", "This photo cannot be opened with your account."));
      return ok(data.signedUrl);
    } catch {
      return err(domainError("RACE_REQUEST_FAILED", "Something went wrong. Check your connection and try again."));
    }
  }
}
