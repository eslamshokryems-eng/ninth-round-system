"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceQueue, estimateOffset, raceMsNow, readRowingDisplay } from "@9thround/race";
import type { ClockSample, ClockSnapshot, EvidenceEntry, EvidenceStore, EvidenceTransport, OcrOutcome, OffsetEstimate, RowingView } from "@9thround/race";
import { getRaceModule } from "../../lib/composition-root";
import { openEvidenceStore } from "./evidence-store";
import { getOcrEngine, warmOcrEngine } from "./ocr/tesseract-engine";

async function sha256Hex(blob: Blob): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "0".repeat(64);                                  // no crypto.subtle (insecure origin): the server still stores the file's own size
  }
}

/** The rowing judge's whole workflow on one device: view of the station, the on-device outbox, the OCR run, CONFIRM / RETAKE. */
export function useRowingJudge(eventId: string) {
  const [view, setView] = useState<RowingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [entries, setEntries] = useState<EvidenceEntry[]>([]);
  const [reading, setReading] = useState<Record<string, boolean>>({});
  const [offset, setOffset] = useState<OffsetEstimate | null>(null);
  const [localNow, setLocalNow] = useState(() => performance.now());
  const samples = useRef<ClockSample[]>([]);
  const snapshot = useRef<ClockSnapshot | null>(null);
  const queueRef = useRef<EvidenceQueue | null>(null);
  const storeRef = useRef<EvidenceStore | null>(null);
  const busy = useRef(false);
  const raceMsRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const sentAt = performance.now();
      const r = await getRaceModule().getRowingView.execute({ eventId });
      const receivedAt = performance.now();
      if (r.isErr) { setError(r.error.code === "RACE_REQUEST_FAILED" ? null : r.error.message); setOffline(r.error.code === "RACE_REQUEST_FAILED"); return; }
      setError(null); setOffline(false);
      const serverEpochMs = Date.parse(r.value.serverTime);
      samples.current = [...samples.current.slice(-19), { sentAt, receivedAt, serverEpochMs }];
      setOffset(estimateOffset(samples.current));
      snapshot.current = { ...r.value.clock, serverEpochMs };
      setView(r.value);
    } finally { busy.current = false; }
  }, [eventId]);

  const syncEntries = useCallback(async () => {
    const q = queueRef.current;
    if (q) setEntries(await q.list());
  }, []);

  const flush = useCallback(async () => {
    const q = queueRef.current;
    if (!q) return;
    try { await q.flush(); } finally { await syncEntries(); void refresh(); }
  }, [syncEntries, refresh]);

  // the outbox lives on this device, per event
  useEffect(() => {
    let cancelled = false;
    void openEvidenceStore(eventId).then(async (store) => {
      if (cancelled) return;
      storeRef.current = store;
      const rowing = getRaceModule().rowingRepository;
      const transport: EvidenceTransport = {
        upload: (path, file, mime) => rowing.upload(path, file, mime),
        capture: (i) => rowing.capture(i),
        submitOcr: (id, o) => rowing.submitOcr(id, o, "device-ocr"),
        confirm: (id, cid, ack) => rowing.confirm(id, cid, ack),
        retake: (id, cid, reason) => rowing.retake(id, cid, reason),
      };
      queueRef.current = new EvidenceQueue(store, transport, () => crypto.randomUUID(), () => new Date().toISOString());
      await syncEntries();
      void flush();
    });
    warmOcrEngine();
    return () => { cancelled = true; };
  }, [eventId, syncEntries, flush]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 1000);
    const f = window.setInterval(() => void flush(), 3000);
    const online = () => { void flush(); void refresh(); };
    window.addEventListener("online", online);
    return () => { window.clearInterval(t); window.clearInterval(f); window.removeEventListener("online", online); };
  }, [refresh, flush]);
  useEffect(() => {
    const t = window.setInterval(() => setLocalNow(performance.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  const raceMs = useMemo(() => (snapshot.current && offset ? raceMsNow(snapshot.current, offset, localNow) : view?.clock.raceMs ?? null), [view, offset, localNow]);
  raceMsRef.current = raceMs;

  /** Photo taken: on the device first, then read by the OCR engine (works offline), then sent. */
  const capture = useCallback(async (resultId: string, file: File) => {
    const q = queueRef.current;
    if (!q) return;
    const entry = await q.capture({ eventId, resultId, file, sha256: await sha256Hex(file), deviceRaceMs: raceMsRef.current });
    await syncEntries();
    void flush();                                           // the upload does not wait for the OCR
    setReading((r) => ({ ...r, [entry.id]: true }));
    let outcome: OcrOutcome;
    try { outcome = await readRowingDisplay(getOcrEngine(), file); }
    catch (e) { outcome = { engine: "tesseract.js@7", rawText: "", distanceM: null, confidence: null, status: "FAILED", parse: "NO_NUMBER", engineError: e instanceof Error ? e.message : String(e) }; }
    await q.recordOcr(entry.id, outcome);
    setReading((r) => ({ ...r, [entry.id]: false }));
    await syncEntries();
    void flush();
  }, [eventId, syncEntries, flush]);

  const confirm = useCallback(async (id: string, acknowledge: boolean) => {
    const q = queueRef.current; if (!q) return;
    await q.decide(id, { type: "CONFIRM", acknowledge }); await syncEntries(); void flush();
  }, [syncEntries, flush]);
  const retake = useCallback(async (id: string, reason: string | null) => {
    const q = queueRef.current; if (!q) return;
    await q.decide(id, { type: "RETAKE", reason }); await syncEntries(); void flush();
  }, [syncEntries, flush]);

  /** A photo that is only on the server (taken on another device / before a reload): decide directly (needs a connection). */
  const confirmServer = useCallback(async (attemptId: string, acknowledge: boolean) => {
    const r = await getRaceModule().rowingRepository.confirm(attemptId, crypto.randomUUID(), acknowledge);
    if (r.isErr) setError(r.error.message);
    void refresh();
  }, [refresh]);
  const retakeServer = useCallback(async (attemptId: string, reason: string | null) => {
    const r = await getRaceModule().rowingRepository.retake(attemptId, crypto.randomUUID(), reason);
    if (r.isErr) setError(r.error.message);
    void refresh();
  }, [refresh]);

  /** An object URL for the photo that is on this device (revoked by the caller). */
  const thumb = useCallback(async (id: string): Promise<string | null> => {
    const f = await storeRef.current?.getFile(id);
    return f ? URL.createObjectURL(f as Blob) : null;
  }, []);

  return { view, error, offline, entries, reading, raceMs, capture, confirm, retake, confirmServer, retakeServer, thumb, refresh, flush };
}
