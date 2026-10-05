import { describe, expect, it } from "vitest";
import { activeAttempt, classifyOcr, DEFAULT_OCR_LIMITS, judgeStep, parseRowingDistance, readRowingDisplay } from "./rowing";
import type { OcrAttempt, OcrEngine, RowingItem } from "./rowing";

describe("parseRowingDistance", () => {
  it.each([
    ["842 m", 842], ["842m", 842], ["842 M", 842], ["0842 m", 842], ["8 4 2 m", 842], ["1,012 m", 1012], ["1 012 m", 1012], ["842.7 m", 842],
    ["8Z2 m", 822], ["B42m", 842], ["Dist: 842 m", 842], ["842\n", 842], ["  842  ", 842], ["5O3 m", 503], ["0 m", 0],
  ])("reads %j as %i m", (text, want) => {
    expect(parseRowingDistance(text)).toMatchObject({ distanceM: want, reason: "OK" });
  });
  it("ignores times and the /500m split pace, and prefers the number carrying the metre unit", () => {
    expect(parseRowingDistance("3:00.0 842 m 2:08 /500m")).toMatchObject({ distanceM: 842, reason: "OK" });
    expect(parseRowingDistance("22 spm 842 m")).toMatchObject({ distanceM: 842, reason: "OK" });
  });
  it("two different distances with the unit are ambiguous", () => {
    expect(parseRowingDistance("842 m 931 m")).toMatchObject({ distanceM: null, reason: "AMBIGUOUS" });
  });
  it("never guesses: several different numbers without a unit are ambiguous", () => {
    expect(parseRowingDistance("842 and 931")).toMatchObject({ distanceM: null, reason: "AMBIGUOUS" });
  });
  it("accepts a lone number without the unit", () => {
    expect(parseRowingDistance("842")).toMatchObject({ distanceM: 842, reason: "OK" });
  });
  it("reports unreadable text and implausible distances", () => {
    expect(parseRowingDistance("")).toMatchObject({ distanceM: null, reason: "NO_NUMBER" });
    expect(parseRowingDistance("#@ ~ ?")).toMatchObject({ distanceM: null, reason: "NO_NUMBER" });
    expect(parseRowingDistance("SO OD")).toMatchObject({ distanceM: null, reason: "NO_NUMBER" });
    expect(parseRowingDistance("2842 m")).toMatchObject({ distanceM: null, reason: "OUT_OF_RANGE" });
    expect(parseRowingDistance("1500 m")).toMatchObject({ distanceM: 1500, reason: "OK" });
    expect(parseRowingDistance("1501 m")).toMatchObject({ distanceM: null, reason: "OUT_OF_RANGE" });
  });
});

describe("classifyOcr — the same boundaries as race_ocr_classify() in the database", () => {
  it.each([
    [842, 0.85, "SUCCEEDED"], [842, 0.8499, "LOW_CONFIDENCE"], [842, 0.6, "LOW_CONFIDENCE"], [842, 0.5999, "FAILED"], [842, null, "LOW_CONFIDENCE"],
    [1501, 0.99, "FAILED"], [null, 0.99, "FAILED"], [0, 0.99, "SUCCEEDED"], [-1, 0.99, "FAILED"], [1500, 1, "SUCCEEDED"],
  ] as const)("%j at %j -> %s", (d, c, want) => {
    expect(classifyOcr(d, c, DEFAULT_OCR_LIMITS)).toBe(want);
  });
});

const engine = (text: string, words: { text: string; confidence: number | null }[], confidence: number | null = null): OcrEngine => ({
  name: "fake", async recognize() { return { text, words, confidence, engine: "fake@1" }; },
});

describe("readRowingDisplay", () => {
  it("clear display: distance and the confidence of the digits", async () => {
    const o = await readRowingDisplay(engine("842 m", [{ text: "842", confidence: 0.97 }, { text: "m", confidence: 0.4 }]), {});
    expect(o).toMatchObject({ distanceM: 842, confidence: 0.97, status: "SUCCEEDED", parse: "OK", engine: "fake@1", rawText: "842 m" });
  });
  it("one weak digit makes the whole reading low confidence", async () => {
    const o = await readRowingDisplay(engine("842 m", [{ text: "8", confidence: 0.99 }, { text: "4", confidence: 0.7 }, { text: "2", confidence: 0.98 }]), {});
    expect(o).toMatchObject({ distanceM: 842, confidence: 0.7, status: "LOW_CONFIDENCE" });
  });
  it("without per-word confidence the overall figure is used; without any it is unknown (needs acknowledgement)", async () => {
    expect(await readRowingDisplay(engine("842 m", [], 0.9), {})).toMatchObject({ confidence: 0.9, status: "SUCCEEDED" });
    expect(await readRowingDisplay(engine("842 m", [], null), {})).toMatchObject({ confidence: null, status: "LOW_CONFIDENCE" });
  });
  it("nothing readable -> FAILED with the raw text kept", async () => {
    expect(await readRowingDisplay(engine("#@ ~", [], 0.3), {})).toMatchObject({ distanceM: null, status: "FAILED", parse: "NO_NUMBER", rawText: "#@ ~" });
  });
  it("an engine that throws is a FAILED outcome, not a crash", async () => {
    const boom: OcrEngine = { name: "boom", async recognize() { throw new Error("wasm failed to load"); } };
    expect(await readRowingDisplay(boom, {})).toMatchObject({ distanceM: null, status: "FAILED", engineError: "wasm failed to load" });
  });
});

const attempt = (over: Partial<OcrAttempt>): OcrAttempt => ({
  attemptId: "a", attemptNo: 1, status: "CAPTURED", ocrStatus: "SUCCEEDED", proposedDistanceM: 842, confidence: 0.97, ocrText: "842 m", ocrEngine: "x", capturedAt: "t", captureRaceMs: 1, imagePath: "p",
  confirmedDistanceM: null, retakeReason: null, confirmedAfterTransition: false, reviewReason: null, origin: "ONLINE", ...over,
});
const item = (over: Partial<RowingItem>): RowingItem => ({
  resultId: "r", raceNumber: "N001", name: "A", categoryCode: "MEN", windowStartMs: 0, windowEndMs: 180000, scoringEndMs: 210000, phase: "TRANSITION", resultStatus: "SCORING",
  evidenceState: "PENDING_EVIDENCE", officialDistanceM: null, limits: DEFAULT_OCR_LIMITS, attempts: [], ...over,
});

describe("judgeStep — what the judge may do", () => {
  it("while the 3:00 work window is open there is nothing to do", () => expect(judgeStep(item({ phase: "WORK" }))).toBe("WAIT"));
  it("after 3:00 with no photo: capture", () => expect(judgeStep(item({}))).toBe("CAPTURE"));
  it("OCR not in yet", () => expect(judgeStep(item({ attempts: [attempt({ ocrStatus: "PENDING" })] }))).toBe("READ"));
  it("a confident reading: confirm", () => expect(judgeStep(item({ attempts: [attempt({})] }))).toBe("CONFIRM"));
  it("a low-confidence reading: acknowledge", () => expect(judgeStep(item({ attempts: [attempt({ ocrStatus: "LOW_CONFIDENCE" })] }))).toBe("ACKNOWLEDGE"));
  it("an unreadable photo: only retake", () => expect(judgeStep(item({ attempts: [attempt({ ocrStatus: "FAILED" })] }))).toBe("RETAKE_ONLY"));
  it("a retaken attempt is not the active one -> capture again", () => {
    const it1 = item({ attempts: [attempt({ status: "RETAKEN" })] });
    expect(activeAttempt(it1)).toBeNull();
    expect(judgeStep(it1)).toBe("CAPTURE");
  });
  it("official and pending-review states win", () => {
    expect(judgeStep(item({ evidenceState: "OFFICIAL" }))).toBe("DONE");
    expect(judgeStep(item({ evidenceState: "PENDING_MASTER_REVIEW" }))).toBe("REVIEW");
  });
});
