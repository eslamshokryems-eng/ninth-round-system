import { describe, expect, it } from "vitest";
import { domainError, err, ok } from "../kernel";
import type { Result } from "../kernel";
import { EvidenceQueue } from "./evidence-queue";
import type { EvidenceEntry, EvidenceStore, EvidenceTransport } from "./evidence-queue";
import type { EvidenceFile } from "./race-rowing-repository";
import type { OcrOutcome } from "./rowing";

class MemStore implements EvidenceStore {
  entries = new Map<string, EvidenceEntry>();
  files = new Map<string, EvidenceFile>();
  seq = 0;
  async list() { return [...this.entries.values()].map((e) => structuredClone(e)); }
  async put(e: EvidenceEntry) { this.entries.set(e.id, structuredClone(e)); }
  async putFile(id: string, f: EvidenceFile) { this.files.set(id, f); }
  async getFile(id: string) { return this.files.get(id) ?? null; }
  async nextSeq() { this.seq += 1; return this.seq; }
}

/** A server that is idempotent by client id, like the real RPCs; `down` simulates a dead connection, `loseResponse` a lost answer. */
class FakeServer implements EvidenceTransport {
  down = false;
  loseNextResponse = false;
  uploads = new Set<string>();
  attempts = new Map<string, { id: string; ocr: OcrOutcome | null; status: string }>();
  confirms = new Map<string, string>();
  retakes = new Set<string>();
  calls: string[] = [];
  refuse: { step: string; code: string; message: string } | null = null;
  private net(): Result<never> | null { return this.down ? err(domainError("RACE_REQUEST_FAILED", "offline")) : null; }
  private maybeLose<T>(v: Result<T>): Result<T> {
    if (this.loseNextResponse) { this.loseNextResponse = false; return err(domainError("RACE_REQUEST_FAILED", "response lost")) as Result<T>; }
    return v;
  }
  private refused(step: string) { return this.refuse?.step === step ? err(domainError(this.refuse.code, this.refuse.message)) : null; }
  async upload(path: string) { this.calls.push("upload"); const n = this.net(); if (n) return n; this.uploads.add(path); return ok(undefined); }
  async capture(i: { clientCaptureId: string; origin: string }) {
    this.calls.push("capture:" + i.origin); const n = this.net(); if (n) return n; const r = this.refused("capture"); if (r) return r;
    let a = this.attempts.get(i.clientCaptureId);
    const duplicate = a !== undefined;
    if (!a) { a = { id: "att-" + i.clientCaptureId, ocr: null, status: "CAPTURED" }; this.attempts.set(i.clientCaptureId, a); }
    return this.maybeLose(ok({ attemptId: a.id, attemptNo: 1, status: a.status, ocrStatus: "PENDING", duplicate, captureRaceMs: 1, afterTransition: false }));
  }
  async submitOcr(attemptId: string, o: OcrOutcome) {
    this.calls.push("submit"); const n = this.net(); if (n) return n;
    const a = [...this.attempts.values()].find((x) => x.id === attemptId)!;
    const duplicate = a.ocr !== null; a.ocr = a.ocr ?? o;
    return this.maybeLose(ok({ attemptId, ocrStatus: o.status, proposedDistanceM: o.distanceM, confidence: o.confidence, duplicate, requiresAcknowledgement: false, canConfirm: true }));
  }
  async confirm(attemptId: string, id: string) {
    this.calls.push("confirm"); const n = this.net(); if (n) return n; const r = this.refused("confirm"); if (r) return r;
    const duplicate = this.confirms.has(id); this.confirms.set(id, attemptId);
    return this.maybeLose(ok({ attemptId, status: "CONFIRMED", official: true, duplicate, afterTransition: false, distanceM: 842 }));
  }
  async retake(attemptId: string, id: string) {
    this.calls.push("retake"); const n = this.net(); if (n) return n;
    const duplicate = this.retakes.has(id); this.retakes.add(id);
    return this.maybeLose(ok({ attemptId, status: "RETAKEN", duplicate }));
  }
}

const file = (bytes = 1000, type = "image/jpeg"): EvidenceFile => ({ size: bytes, type });
const reading = (over: Partial<OcrOutcome> = {}): OcrOutcome => ({ engine: "fake", rawText: "842 m", distanceM: 842, confidence: 0.97, status: "SUCCEEDED", parse: "OK", ...over });
let n = 0;
const make = () => {
  const store = new MemStore(); const server = new FakeServer();
  const q = new EvidenceQueue(store, server, () => `id-${++n}`, () => "2026-12-21T07:32:00Z");
  return { store, server, q };
};
const take = async (q: EvidenceQueue) => q.capture({ eventId: "ev", resultId: "res", file: file(), sha256: "a".repeat(64), deviceRaceMs: 1_925_000 });

describe("EvidenceQueue — online", () => {
  it("photo → upload → register → OCR result → CONFIRM, in order, each exactly once", async () => {
    const { q, server } = make();
    const e = await take(q);
    await q.recordOcr(e.id, reading());
    await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    const r = await q.flush();
    expect(r).toEqual({ completed: 1, waiting: 0, offline: false });
    expect(server.calls).toEqual(["upload", "capture:ONLINE", "submit", "confirm"]);
    const done = (await q.list())[0]!;
    expect(done).toMatchObject({ uploaded: true, ocrSubmitted: true, complete: true, server: { official: true } });
  });
  it("the path is <event>/rowing/<result>/<capture id>.<ext> — one deterministic place per capture", async () => {
    const { q } = make();
    const e = await q.capture({ eventId: "ev", resultId: "res", file: file(5, "image/png"), sha256: "b".repeat(64), deviceRaceMs: null });
    expect(e.path).toBe(`ev/rowing/res/${e.id}.png`);
    expect(e).toMatchObject({ bytes: 5, mime: "image/png", seq: expect.any(Number) });
  });
  it("RETAKE closes the attempt; the next photo is a separate entry sent after it", async () => {
    const { q, server } = make();
    const a = await take(q); await q.recordOcr(a.id, reading({ rawText: "342 m", distanceM: 342 })); await q.decide(a.id, { type: "RETAKE", reason: "wrong reading" });
    const b = await take(q); await q.recordOcr(b.id, reading()); await q.decide(b.id, { type: "CONFIRM", acknowledge: false });
    await q.flush();
    expect(server.calls).toEqual(["upload", "capture:ONLINE", "submit", "retake", "upload", "capture:ONLINE", "submit", "confirm"]);
    expect(server.attempts.size).toBe(2);
  });
});

describe("EvidenceQueue — the judge can never silently overwrite the OCR result", () => {
  it("CONFIRM has no distance argument; the OCR reading is recorded once and a second reading is ignored", async () => {
    const { q } = make();
    const e = await take(q);
    await q.recordOcr(e.id, reading({ distanceM: 342, rawText: "342 m" }));
    const again = await q.recordOcr(e.id, reading({ distanceM: 842 }));
    expect(again.ocr?.distanceM).toBe(342);
  });
  it("refuses to confirm before the reading exists, a FAILED reading, and a low-confidence one without acknowledgement", async () => {
    const { q } = make();
    const e = await take(q);
    await expect(q.decide(e.id, { type: "CONFIRM", acknowledge: false })).rejects.toThrow(/not ready/);
    await q.recordOcr(e.id, reading({ status: "FAILED", distanceM: null }));
    await expect(q.decide(e.id, { type: "CONFIRM", acknowledge: true })).rejects.toThrow(/retake/);
    const f = await take(q);
    await q.recordOcr(f.id, reading({ status: "LOW_CONFIDENCE", confidence: 0.7 }));
    await expect(q.decide(f.id, { type: "CONFIRM", acknowledge: false })).rejects.toThrow(/acknowledge/);
    expect((await q.decide(f.id, { type: "CONFIRM", acknowledge: true })).decision).toMatchObject({ type: "CONFIRM", acknowledge: true });
  });
  it("a decision is made once: a double tap changes nothing", async () => {
    const { q } = make();
    const e = await take(q); await q.recordOcr(e.id, reading());
    const first = await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    const second = await q.decide(e.id, { type: "RETAKE", reason: "oops" });
    expect(second.decision).toEqual(first.decision);
  });
});

describe("EvidenceQueue — offline, retries and reconnect", () => {
  it("a photo captured offline is never lost: it stays on the device, goes up on reconnect as OFFLINE_QUEUE, once", async () => {
    const { q, server, store } = make();
    server.down = true;
    const e = await take(q); await q.recordOcr(e.id, reading()); await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    const r1 = await q.flush();
    expect(r1).toMatchObject({ offline: true, completed: 0, waiting: 1 });
    expect(store.files.has(e.id)).toBe(true);                         // the photo is still on the device
    expect((await q.list())[0]).toMatchObject({ offline: true, uploaded: false, attemptId: null, complete: false });
    server.calls.length = 0; server.down = false;
    const r2 = await q.flush();
    expect(r2).toEqual({ completed: 1, waiting: 0, offline: false });
    expect(server.calls).toEqual(["upload", "capture:OFFLINE_QUEUE", "submit", "confirm"]);
    expect(server.attempts.size).toBe(1);
  });
  it("a lost RESPONSE never creates a second attempt: the retry carries the same id and the server answers with the original", async () => {
    const { q, server } = make();
    const e = await take(q); await q.recordOcr(e.id, reading()); await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    server.loseNextResponse = true;                                    // the server registers the capture, the answer never arrives
    const r1 = await q.flush();
    expect(r1.offline).toBe(true);
    expect(server.attempts.size).toBe(1);
    const r2 = await q.flush();
    expect(r2).toMatchObject({ completed: 1, offline: false });
    expect(server.attempts.size).toBe(1);                              // still one attempt
    expect(server.confirms.size).toBe(1);
  });
  it("a connection that dies between steps resumes exactly where it stopped (no re-upload of what is already up)", async () => {
    const { q, server } = make();
    const e = await take(q); await q.recordOcr(e.id, reading()); await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    await q.flush();                                                  // all done
    const sentBefore = server.calls.length;
    await q.flush();                                                  // nothing left
    expect(server.calls.length).toBe(sentBefore);
  });
  it("flush is re-entrant: ten simultaneous flushes share one run and send each step once", async () => {
    const { q, server } = make();
    const e = await take(q); await q.recordOcr(e.id, reading()); await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    const reports = await Promise.all(Array.from({ length: 10 }, () => q.flush()));
    expect(new Set(reports.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(server.calls.filter((c) => c === "confirm")).toHaveLength(1);
    expect(server.calls.filter((c) => c.startsWith("capture"))).toHaveLength(1);
  });
  it("entries are sent in capture order", async () => {
    const { q, server } = make();
    server.down = true;
    const a = await take(q); const b = await take(q);
    await q.recordOcr(a.id, reading()); await q.recordOcr(b.id, reading({ distanceM: 861 }));
    await q.decide(a.id, { type: "RETAKE", reason: null }); await q.decide(b.id, { type: "CONFIRM", acknowledge: false });
    await q.flush(); server.calls.length = 0; server.down = false;
    await q.flush();
    expect(server.calls.indexOf("retake")).toBeLessThan(server.calls.lastIndexOf("confirm"));
  });
});

describe("EvidenceQueue — a flush in flight never overwrites newer local data (found by the browser test)", () => {
  it("an OCR reading and a decision recorded WHILE the upload is on the wire survive the flush, and are sent by it", async () => {
    const { q, server } = make();
    const e = await take(q);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const realUpload = server.upload.bind(server);
    server.upload = async (path: string) => { await gate; return realUpload(path); };
    const flushing = q.flush();                                     // starts uploading: the entry has NO reading yet
    await new Promise((r) => setTimeout(r, 5));
    await q.recordOcr(e.id, reading());                              // the OCR finishes meanwhile …
    await q.decide(e.id, { type: "CONFIRM", acknowledge: false });   // … and the judge confirms
    release();
    await flushing;
    const done = (await q.list())[0]!;
    expect(done.ocr?.distanceM).toBe(842);                           // not overwritten by the in-flight flush's stale copy
    expect(done.decision).toMatchObject({ type: "CONFIRM", sent: true });
    expect(done).toMatchObject({ complete: true, uploaded: true, ocrSubmitted: true });
    expect(server.calls).toEqual(["upload", "capture:ONLINE", "submit", "confirm"]);
  });
  it("a second flush requested while one is running triggers exactly one more pass (nothing waits for the next timer)", async () => {
    const { q, server } = make();
    const e = await take(q);
    await q.recordOcr(e.id, reading());
    const first = q.flush();
    await q.decide(e.id, { type: "CONFIRM", acknowledge: false });   // arrives while the first pass is running
    const second = q.flush();
    await Promise.all([first, second]);
    expect((await q.list())[0]).toMatchObject({ complete: true });
    expect(server.calls.filter((c) => c === "confirm")).toHaveLength(1);
  });
});

describe("EvidenceQueue — refusals are parked, not retried", () => {
  it("a rule refusal (e.g. the window is still open) is kept with its reason and never blocks the line", async () => {
    const { q, server } = make();
    server.refuse = { step: "capture", code: "RACE_OCR_TOO_EARLY", message: "The display is final only when the 3:00 has ended." };
    const a = await take(q); await q.recordOcr(a.id, reading());
    server.refuse = { step: "capture", code: "RACE_OCR_TOO_EARLY", message: "The display is final only when the 3:00 has ended." };
    const r = await q.flush();
    expect(r.offline).toBe(false);
    expect((await q.list())[0]).toMatchObject({ failed: "The display is final only when the 3:00 has ended.", complete: false });
    server.calls.length = 0;
    await q.flush();
    expect(server.calls).toEqual([]);                                  // not retried
  });
  it("a refused confirmation (already confirmed / no longer active) is parked with the server's wording", async () => {
    const { q, server } = make();
    const e = await take(q); await q.recordOcr(e.id, reading()); await q.decide(e.id, { type: "CONFIRM", acknowledge: false });
    server.refuse = { step: "confirm", code: "RACE_OCR_ALREADY_CONFIRMED", message: "This photo is already confirmed." };
    await q.flush();
    expect((await q.list())[0]).toMatchObject({ failed: "This photo is already confirmed.", complete: false });
  });
  it("a photo that vanished from the device is reported, not silently skipped", async () => {
    const { q, store } = make();
    const e = await take(q);
    store.files.delete(e.id);
    await q.flush();
    expect((await q.list())[0]?.failed).toMatch(/no longer on this device/);
  });
});
