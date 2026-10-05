import type { Result } from "../kernel";
import type { CaptureAnswer, CaptureInput, ConfirmAnswer, EvidenceFile, RetakeAnswer, SubmitAnswer } from "./race-rowing-repository";
import type { OcrOutcome } from "./rowing";

/**
 * The rowing judge's evidence outbox.
 *
 * A photo is the most expensive thing a judge produces: the athlete is already walking to the next station. So the photo, its OCR reading and
 * the judge's decision are written to the device FIRST, each with its own client-generated id, and then sent in order — upload, register,
 * OCR result, decision — each step idempotent on the server. A lost connection, a lost response, a reload or a double flush can therefore
 * only ever re-send the same ids; the server answers a known id with the original record. Nothing here decides anything official.
 */

export type EvidenceDecision =
  | { type: "CONFIRM"; clientEventId: string; acknowledge: boolean; sent: boolean }
  | { type: "RETAKE"; clientEventId: string; reason: string | null; sent: boolean };

export interface EvidenceEntry {
  /** = client_capture_id. */
  id: string;
  eventId: string;
  resultId: string;
  path: string;
  mime: string;
  bytes: number;
  sha256: string;
  seq: number;
  capturedAt: string;
  deviceRaceMs: number | null;
  /** A network error happened at least once for this entry: from then on it is sent as OFFLINE_QUEUE. */
  offline: boolean;
  uploaded: boolean;
  attemptId: string | null;
  ocr: OcrOutcome | null;
  ocrSubmitted: boolean;
  decision: EvidenceDecision | null;
  /** What the server last said (for the judge's screen). */
  server: { ocrStatus?: string; official?: boolean; pendingReview?: boolean; afterTransition?: boolean | null; retaken?: boolean };
  /** Permanently refused (permission / rule): kept for the judge to see, never retried. */
  failed?: string;
  complete: boolean;
}

export interface EvidenceStore {
  list(): Promise<EvidenceEntry[]>;
  put(entry: EvidenceEntry): Promise<void>;
  putFile(id: string, file: EvidenceFile): Promise<void>;
  getFile(id: string): Promise<EvidenceFile | null>;
  nextSeq(): Promise<number>;
}

export interface EvidenceTransport {
  upload(path: string, file: EvidenceFile, mime: string): Promise<Result<void>>;
  capture(input: CaptureInput): Promise<Result<CaptureAnswer>>;
  submitOcr(attemptId: string, outcome: OcrOutcome): Promise<Result<SubmitAnswer>>;
  confirm(attemptId: string, clientEventId: string, acknowledge: boolean): Promise<Result<ConfirmAnswer>>;
  retake(attemptId: string, clientEventId: string, reason: string | null): Promise<Result<RetakeAnswer>>;
}

export interface FlushReport {
  /** Entries fully delivered in this flush. */
  completed: number;
  /** Entries still waiting (offline or not decided yet). */
  waiting: number;
  /** True when the flush stopped because the network failed. */
  offline: boolean;
}

const isNetwork = (code: string) => code === "RACE_REQUEST_FAILED";

function extension(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

export class EvidenceQueue {
  private flushing: Promise<FlushReport> | null = null;
  private again = false;
  /** Every change to an entry is a read-modify-write on the LATEST stored copy, one at a time: a flush that is in the middle of the network can never overwrite an OCR reading or a decision recorded meanwhile. */
  private mutex: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: EvidenceStore,
    private readonly transport: EvidenceTransport,
    private readonly newId: () => string,
    private readonly now: () => string,
  ) {}

  list(): Promise<EvidenceEntry[]> {
    return this.store.list();
  }

  /** The photo is on the device before anything else happens. */
  async capture(input: { eventId: string; resultId: string; file: EvidenceFile; sha256: string; deviceRaceMs: number | null }): Promise<EvidenceEntry> {
    const id = this.newId();
    const entry: EvidenceEntry = {
      id, eventId: input.eventId, resultId: input.resultId, mime: input.file.type, bytes: input.file.size, sha256: input.sha256,
      path: `${input.eventId}/rowing/${input.resultId}/${id}.${extension(input.file.type)}`,
      seq: await this.store.nextSeq(), capturedAt: this.now(), deviceRaceMs: input.deviceRaceMs,
      offline: false, uploaded: false, attemptId: null, ocr: null, ocrSubmitted: false, decision: null, server: {}, complete: false,
    };
    await this.store.putFile(id, input.file);
    await this.store.put(entry);
    return entry;
  }

  /** The device's own OCR reading (works offline). */
  recordOcr(id: string, outcome: OcrOutcome): Promise<EvidenceEntry> {
    // one reading per photo: a second one can never replace the first
    return this.update(id, (e) => (e.ocr !== null ? {} : { ocr: outcome }));
  }

  /** The judge's decision. CONFIRM takes no distance: it can only confirm what the OCR read. */
  decide(id: string, d: { type: "CONFIRM"; acknowledge: boolean } | { type: "RETAKE"; reason: string | null }): Promise<EvidenceEntry> {
    return this.update(id, (e) => {
      if (e.decision !== null) return {};                // decided once; a double tap changes nothing
      if (e.failed !== undefined) throw new Error("This photo was refused by the server.");
      if (d.type === "CONFIRM") {
        if (e.ocr === null) throw new Error("The OCR reading is not ready yet.");
        if (e.ocr.status === "FAILED") throw new Error("The display could not be read — retake the photo.");
        if (e.ocr.status === "LOW_CONFIDENCE" && !d.acknowledge) throw new Error("The reading is uncertain — check the display and acknowledge, or retake.");
      }
      const decision: EvidenceDecision = d.type === "CONFIRM"
        ? { type: "CONFIRM", clientEventId: this.newId(), acknowledge: d.acknowledge, sent: false }
        : { type: "RETAKE", clientEventId: this.newId(), reason: d.reason, sent: false };
      return { decision };
    });
  }

  /** Sends everything in order. Safe to call from several places at once: concurrent calls share one run. */
  flush(): Promise<FlushReport> {
    if (this.flushing) { this.again = true; return this.flushing; }       // something new may have arrived: one more pass after this one
    this.flushing = (async () => {
      let report: FlushReport;
      do {
        this.again = false;
        report = await this.run();
      } while (this.again && !report.offline);
      return report;
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private update(id: string, patch: (cur: EvidenceEntry) => Partial<EvidenceEntry>): Promise<EvidenceEntry> {
    const run = this.mutex.then(async () => {
      const cur = await this.get(id);
      const next = { ...cur, ...patch(cur) };
      await this.store.put(next);
      return next;
    });
    this.mutex = run.catch(() => undefined);
    return run;
  }

  private async get(id: string): Promise<EvidenceEntry> {
    const e = (await this.store.list()).find((x) => x.id === id);
    if (!e) throw new Error("Unknown capture.");
    return e;
  }

  private async run(): Promise<FlushReport> {
    let completed = 0;
    const entries = (await this.store.list()).filter((e) => !e.complete && e.failed === undefined).sort((a, b) => a.seq - b.seq);
    for (const original of entries) {
      let e = (await this.store.list()).find((x) => x.id === original.id) ?? original;
      const save = async (patch: Partial<EvidenceEntry>) => {
        e = await this.update(e.id, (cur) => ({ ...patch, ...(patch.server ? { server: { ...cur.server, ...patch.server } } : {}) }));
      };
      const stop = async (code: string, message: string): Promise<"offline" | "parked"> => {
        if (isNetwork(code)) { await save({ offline: true }); return "offline"; }
        await save({ failed: message }); return "parked";
      };

      if (!e.uploaded) {
        const file = await this.store.getFile(e.id);
        if (!file) { await save({ failed: "The photo is no longer on this device." }); continue; }
        const r = await this.transport.upload(e.path, file, e.mime);
        if (r.isErr) { const s = await stop(r.error.code, r.error.message); if (s === "offline") return this.report(completed, true); continue; }
        await save({ uploaded: true });
      }
      if (e.attemptId === null) {
        const r = await this.transport.capture({
          resultId: e.resultId, clientCaptureId: e.id, path: e.path, mime: e.mime, bytes: e.bytes, sha256: e.sha256,
          origin: e.offline ? "OFFLINE_QUEUE" : "ONLINE", deviceRecordedAt: e.capturedAt, deviceRaceMs: e.deviceRaceMs, deviceSeq: e.seq,
        });
        if (r.isErr) { const s = await stop(r.error.code, r.error.message); if (s === "offline") return this.report(completed, true); continue; }
        await save({ attemptId: r.value.attemptId, server: { ocrStatus: r.value.ocrStatus } });
      }
      if (e.ocr !== null && !e.ocrSubmitted) {
        const r = await this.transport.submitOcr(e.attemptId!, e.ocr);
        if (r.isErr) { const s = await stop(r.error.code, r.error.message); if (s === "offline") return this.report(completed, true); continue; }
        await save({ ocrSubmitted: true, server: { ocrStatus: r.value.ocrStatus } });
      }
      if (e.decision !== null && !e.decision.sent && (e.ocr === null || e.ocrSubmitted)) {
        const d = e.decision;
        if (d.type === "CONFIRM") {
          const r = await this.transport.confirm(e.attemptId!, d.clientEventId, d.acknowledge);
          if (r.isErr) { const s = await stop(r.error.code, r.error.message); if (s === "offline") return this.report(completed, true); continue; }
          await save({ decision: { ...d, sent: true }, server: { official: r.value.official, pendingReview: r.value.status === "PENDING_REVIEW", afterTransition: r.value.afterTransition }, complete: true });
        } else {
          const r = await this.transport.retake(e.attemptId!, d.clientEventId, d.reason);
          if (r.isErr) { const s = await stop(r.error.code, r.error.message); if (s === "offline") return this.report(completed, true); continue; }
          await save({ decision: { ...d, sent: true }, server: { retaken: true }, complete: true });
        }
        completed += 1;
      }
    }
    return this.report(completed, false);
  }

  private async report(completed: number, offline: boolean): Promise<FlushReport> {
    const waiting = (await this.store.list()).filter((e) => !e.complete && e.failed === undefined).length;
    return { completed, waiting, offline };
  }
}
