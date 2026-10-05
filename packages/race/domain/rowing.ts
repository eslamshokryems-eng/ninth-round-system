/**
 * Rowing (Station 09) evidence — the vocabulary shared by the judge device, Master Control and the database.
 * The distance of a rowing result is NEVER typed: a photo of the display is read by OCR, the judge CONFIRMS that reading (or retakes the
 * photo), and only a confirmed reading becomes official. Master Control / the Event Manager can correct it with a reason, citing the photo.
 */

export type EvidenceState = "PENDING_EVIDENCE" | "PENDING_MASTER_REVIEW" | "OFFICIAL";
export type OcrAttemptStatus = "CAPTURED" | "CONFIRMED" | "RETAKEN" | "MANUAL" | "PENDING_REVIEW" | "REJECTED";
export type OcrProcessing = "PENDING" | "SUCCEEDED" | "LOW_CONFIDENCE" | "FAILED";
export type RowingPhase = "WORK" | "TRANSITION" | "AFTER";

export interface OcrLimits {
  /** Below this a reading is unusable (FAILED). */
  minConfidence: number;
  /** From this up a reading needs no acknowledgement (SUCCEEDED). */
  reviewConfidence: number;
  /** A rowing distance above this is not plausible in 3:00 (FAILED). */
  maxDistanceM: number;
}

export const DEFAULT_OCR_LIMITS: OcrLimits = { minConfidence: 0.6, reviewConfidence: 0.85, maxDistanceM: 1500 };

/** Mirrors race_ocr_classify() in the database (the database is the authority; this lets the device show the same answer offline). */
export function classifyOcr(distanceM: number | null, confidence: number | null, limits: OcrLimits = DEFAULT_OCR_LIMITS): OcrProcessing {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM < 0 || distanceM > limits.maxDistanceM) return "FAILED";
  if (confidence === null) return "LOW_CONFIDENCE";
  if (confidence < limits.minConfidence) return "FAILED";
  if (confidence < limits.reviewConfidence) return "LOW_CONFIDENCE";
  return "SUCCEEDED";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Reading the distance out of OCR text
// ---------------------------------------------------------------------------------------------------------------------------------------------

export interface OcrWord {
  text: string;
  /** 0..1, or null when the engine does not report it. */
  confidence: number | null;
}

export type ParseReason = "OK" | "NO_NUMBER" | "AMBIGUOUS" | "OUT_OF_RANGE";

export interface ParsedDistance {
  distanceM: number | null;
  reason: ParseReason;
  /** The piece of text the number came from. */
  matched: string | null;
}

/** Characters OCR engines routinely mistake for digits INSIDE a number. */
const LOOKALIKE: Record<string, string> = { O: "0", o: "0", D: "0", I: "1", l: "1", "|": "1", S: "5", B: "8", Z: "2" };

function fixDigits(token: string): string {
  if (!/\d/.test(token)) return token;
  return token.replace(/[OoDIl|SBZ]/g, (c) => LOOKALIKE[c] ?? c);
}

function toNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d{1,2}[,\s.']\d{3}$/.test(s)) return Number(s.replace(/[,\s.']/g, ""));       // thousands separator: 1,012 / 1 012 / 1.012
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Math.floor(Number(s.replace(",", ".")));        // a fraction of a metre: whole metres only, rounded DOWN
  return null;
}

/**
 * Extracts the final rowing distance, in whole metres, from OCR text: "842 m", "842m", "0842 M", "8 4 2 m", "1,012 m".
 * A number with the metre unit wins; without a unit a SINGLE number is accepted; several candidates are AMBIGUOUS — the engine never guesses.
 */
export function parseRowingDistance(text: string, maxDistanceM = DEFAULT_OCR_LIMITS.maxDistanceM): ParsedDistance {
  const tokens = text.split(/\s+/).filter((t) => t !== "");
  const UNIT = /^(m|mt|mts|meter|meters|metre|metres)$/i;
  const GLYPH = /^[0-9OoDIl|SBZ]$/;
  const candidates: { value: number; unit: boolean; text: string }[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let t = tokens[i]!;
    if (t.startsWith("/") || t.includes(":")) continue;                    // "/500m" is a split pace, "2:08" a time — not the distance
    let unit = false;
    const attached = /^(.*?[0-9OoDIl|SBZ.,'])(m|mt|mts|meters?|metres?)$/i.exec(t);
    if (attached) { t = attached[1]!; unit = true; }
    if (!/\d/.test(t) && !(GLYPH.test(t) && /\d/.test(tokens[i + 1] ?? ""))) {
      // a glyph run like "8 4 2" starts with a digit; a token with no digit at all ("SO", "m") is not a number
      if (!/\d/.test(t)) continue;
    }
    let raw = t;
    let end = i;
    // a display font read glyph by glyph: "8 4 2" -> 842
    if (GLYPH.test(t)) {
      let run = t;
      let j = i + 1;
      while (j < tokens.length && GLYPH.test(tokens[j]!)) { run += tokens[j]!; j += 1; }
      if (run.length > 1 && /\d/.test(run)) { raw = run; end = j - 1; }
    }
    // a thousands separator written as a space: "1 012"
    if (/^\d{1,2}$/.test(raw) && /^\d{3}$/.test(tokens[end + 1] ?? "")) { raw += tokens[end + 1]!; end += 1; }
    if (!unit && UNIT.test(tokens[end + 1] ?? "")) { unit = true; end += 1; }
    const value = toNumber(fixDigits(raw));
    if (value === null || !/\d/.test(raw)) { i = end; continue; }
    candidates.push({ value, unit, text: tokens.slice(i, end + 1).join(" ") });
    i = end;
  }
  if (candidates.length === 0) return { distanceM: null, reason: "NO_NUMBER", matched: null };
  const withUnit = candidates.filter((c) => c.unit);
  const pool = withUnit.length > 0 ? withUnit : candidates;
  const distinct = [...new Set(pool.map((c) => c.value))];
  if (distinct.length > 1) return { distanceM: null, reason: "AMBIGUOUS", matched: null };
  const pick = pool[0]!;
  if (pick.value < 0 || pick.value > maxDistanceM) return { distanceM: null, reason: "OUT_OF_RANGE", matched: pick.text };
  return { distanceM: pick.value, reason: "OK", matched: pick.text };
}

/** What an OCR engine returns for one photo. */
export interface OcrEngineResult {
  text: string;
  words: OcrWord[];
  /** Overall confidence 0..1 when the engine has no per-word values. */
  confidence: number | null;
  engine: string;
}

export interface OcrEngine {
  readonly name: string;
  recognize(image: unknown): Promise<OcrEngineResult>;
}

/** The outcome stored with an attempt: what was read, how sure the engine was, and what the device classified it as. */
export interface OcrOutcome {
  engine: string;
  rawText: string;
  distanceM: number | null;
  confidence: number | null;
  status: OcrProcessing;
  parse: ParseReason;
  /** The engine itself failed to run (nothing to read). */
  engineError?: string;
}

/**
 * Photo -> proposed distance. The confidence of a reading is that of the WEAKEST word that carries digits (one bad digit makes the whole
 * number unreliable); a missing per-word confidence falls back to the engine's overall figure.
 */
export async function readRowingDisplay(engine: OcrEngine, image: unknown, limits: OcrLimits = DEFAULT_OCR_LIMITS): Promise<OcrOutcome> {
  let r: OcrEngineResult;
  try {
    r = await engine.recognize(image);
  } catch (e) {
    return { engine: engine.name, rawText: "", distanceM: null, confidence: null, status: "FAILED", parse: "NO_NUMBER", engineError: e instanceof Error ? e.message : String(e) };
  }
  const parsed = parseRowingDistance(r.text, limits.maxDistanceM);
  const digitWords = r.words.filter((w) => /[0-9]/.test(w.text) && w.confidence !== null);
  const confidence = parsed.distanceM === null ? r.confidence : digitWords.length > 0 ? Math.min(...digitWords.map((w) => w.confidence!)) : r.confidence;
  return {
    engine: r.engine,
    rawText: r.text,
    distanceM: parsed.distanceM,
    confidence,
    status: classifyOcr(parsed.distanceM, confidence, limits),
    parse: parsed.reason,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// What the judge and Master Control see
// ---------------------------------------------------------------------------------------------------------------------------------------------

export interface OcrAttempt {
  attemptId: string;
  attemptNo: number;
  status: OcrAttemptStatus;
  ocrStatus: OcrProcessing;
  proposedDistanceM: number | null;
  confidence: number | null;
  ocrText: string | null;
  ocrEngine: string | null;
  capturedAt: string;
  captureRaceMs: number | null;
  imagePath: string;
  confirmedDistanceM: number | null;
  retakeReason: string | null;
  confirmedAfterTransition: boolean;
  reviewReason: string | null;
  origin: "ONLINE" | "OFFLINE_QUEUE";
}

export interface RowingItem {
  resultId: string;
  raceNumber: string;
  name: string;
  categoryCode: string;
  windowStartMs: number;
  windowEndMs: number;
  scoringEndMs: number;
  phase: RowingPhase;
  resultStatus: string;
  evidenceState: EvidenceState;
  officialDistanceM: number | null;
  limits: OcrLimits;
  attempts: OcrAttempt[];
}

export interface RowingView {
  serverTime: string;
  station: { number: number; name: string };
  clock: { started: boolean; paused: boolean; finished: boolean; raceMs: number | null; version: number };
  transitionMs: number;
  items: RowingItem[];
}

/** The attempt a judge is working with: the latest one that is not RETAKEN or REJECTED. */
export function activeAttempt(item: RowingItem): OcrAttempt | null {
  const live = item.attempts.filter((a) => a.status !== "RETAKEN" && a.status !== "REJECTED");
  return live.length > 0 ? live[live.length - 1]! : null;
}

/** What the judge may do right now with this result, from the data the server sent. */
export type JudgeStep = "WAIT" | "CAPTURE" | "READ" | "CONFIRM" | "ACKNOWLEDGE" | "RETAKE_ONLY" | "REVIEW" | "DONE";

export function judgeStep(item: RowingItem): JudgeStep {
  if (item.evidenceState === "OFFICIAL") return "DONE";
  if (item.evidenceState === "PENDING_MASTER_REVIEW") return "REVIEW";
  if (item.phase === "WORK") return "WAIT";
  const a = activeAttempt(item);
  if (!a) return "CAPTURE";
  if (a.ocrStatus === "PENDING") return "READ";
  if (a.ocrStatus === "FAILED") return "RETAKE_ONLY";
  if (a.ocrStatus === "LOW_CONFIDENCE") return "ACKNOWLEDGE";
  return "CONFIRM";
}

export function describeEvidenceState(s: EvidenceState): string {
  switch (s) {
    case "PENDING_EVIDENCE": return "PENDING EVIDENCE";
    case "PENDING_MASTER_REVIEW": return "PENDING MASTER REVIEW";
    case "OFFICIAL": return "OFFICIAL";
  }
}

/** Confidence for people: "97%" or "unknown". */
export function formatConfidence(c: number | null): string {
  return c === null ? "unknown" : `${Math.round(c * 100)}%`;
}
