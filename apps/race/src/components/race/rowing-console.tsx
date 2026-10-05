"use client";

import { useEffect, useState, type ReactNode } from "react";
import { activeAttempt, describeEvidenceState, formatConfidence, formatCountdown, judgeStep } from "@9thround/race";
import type { EvidenceEntry, OcrAttempt, RowingItem } from "@9thround/race";
import { useRowingJudge } from "../../features/race/use-rowing-judge";
import { RaceBadge, RaceButton, RaceNotice } from "./race-ui";

/** Station 09 — Rowing. CAPTURE the display → OCR reads it → the judge CONFIRMS the reading or RETAKES the photo → OFFICIAL. No typing of a distance, ever. */
export function RowingConsole({ eventId }: { eventId: string }) {
  const j = useRowingJudge(eventId);
  const items = (j.view?.items ?? []).filter((i) => i.evidenceState !== "OFFICIAL" || i.phase !== "AFTER" || j.entries.some((e) => e.resultId === i.resultId && !e.complete));
  const queued = j.entries.filter((e) => !e.complete && e.failed === undefined).length;
  return (
    <div className="mt-2 flex flex-col gap-4" data-testid="rowing-console">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="race-kicker">Station 09</p>
          <h1 className="race-display text-4xl">Rowing</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {j.offline ? <RaceBadge tone="red">OFFLINE</RaceBadge> : <RaceBadge>ONLINE</RaceBadge>}
          {queued > 0 ? <RaceBadge tone="white"><span data-testid="outbox-count">{queued}</span> SAVED ON THIS DEVICE</RaceBadge> : null}
        </div>
      </div>
      {j.error ? <RaceNotice>{j.error}</RaceNotice> : null}
      {j.offline ? <RaceNotice>No connection — photos, OCR readings and your decisions are saved on this device and will be sent, once each, when it is back.</RaceNotice> : null}
      {!j.view ? <p style={{ color: "var(--race-muted)" }}>Loading…</p> : items.length === 0 ? (
        <div className="race-card race-card--flat" data-testid="rowing-empty">No athlete is on the rowing machine and nothing is waiting for evidence.</div>
      ) : items.map((i) => <Card key={i.resultId} item={i} j={j} />)}
    </div>
  );
}

type Judge = ReturnType<typeof useRowingJudge>;

function Card({ item, j }: { item: RowingItem; j: Judge }) {
  const mine = j.entries.filter((e) => e.resultId === item.resultId).sort((a, b) => a.seq - b.seq);
  const local = [...mine].reverse().find((e) => !e.complete) ?? null;
  const parked = local?.failed !== undefined ? local : null;
  const live = local && local.failed === undefined ? local : null;
  const server = activeAttempt(item);
  const step = judgeStep(item);
  const left = j.raceMs !== null ? (item.phase === "WORK" ? item.windowEndMs - j.raceMs : item.scoringEndMs - j.raceMs) : null;
  const phase = j.raceMs === null ? item.phase : j.raceMs < item.windowEndMs ? "WORK" : j.raceMs < item.scoringEndMs ? "TRANSITION" : "AFTER";

  return (
    <section className="race-card" data-testid="rowing-card" data-race-number={item.raceNumber} data-phase={phase} data-evidence={item.evidenceState}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="race-display text-5xl" data-testid="athlete">{item.raceNumber}</div>
          <div style={{ color: "var(--race-muted)" }}>{item.name} · {item.categoryCode}</div>
        </div>
        <div className="text-right">
          <RaceBadge tone={item.evidenceState === "OFFICIAL" ? "white" : "red"}><span data-testid="evidence-state">{describeEvidenceState(item.evidenceState)}</span></RaceBadge>
          {left !== null && phase !== "AFTER" ? (
            <div className="race-display mt-1 text-3xl" data-testid="phase-clock">{phase === "WORK" ? "WORK " : "TRANSITION "}{formatCountdown(Math.max(left, 0))}</div>
          ) : phase === "AFTER" && item.evidenceState !== "OFFICIAL" ? <div className="race-label mt-1">TRANSITION OVER — A CONFIRMATION NOW NEEDS MASTER REVIEW</div> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {item.evidenceState === "OFFICIAL" ? (
          <Result label="OFFICIAL RESULT" distance={item.officialDistanceM} testid="official-distance" />
        ) : item.evidenceState === "PENDING_MASTER_REVIEW" ? (
          <>
            <Result label="WAITING FOR MASTER CONTROL" distance={server?.proposedDistanceM ?? null} testid="pending-distance" />
            <p style={{ color: "var(--race-muted)" }}>Your confirmation arrived after the 30-second transition, so Master Control decides whether it counts.</p>
          </>
        ) : parked ? (
          <>
            <RaceNotice><span data-testid="parked">Refused: {parked.failed}</span></RaceNotice>
            {phase !== "WORK" ? <CaptureButton item={item} j={j} label="TAKE A NEW PHOTO" /> : null}
          </>
        ) : live ? (
          <LocalAttempt entry={live} item={item} j={j} />
        ) : server && step !== "CAPTURE" ? (
          <ServerAttempt attempt={server} item={item} j={j} />
        ) : step === "WAIT" || phase === "WORK" ? (
          <p className="race-display text-2xl" data-testid="wait" style={{ color: "var(--race-muted)" }}>3:00 WORK WINDOW IS OPEN — THE PHOTO OPENS AT 0:00</p>
        ) : (
          <CaptureButton item={item} j={j} label="CAPTURE DISPLAY PHOTO" />
        )}
        <History item={item} />
      </div>
    </section>
  );
}

function Result({ label, distance, testid }: { label: string; distance: number | null; testid: string }) {
  return (
    <div>
      <div className="race-label">{label}</div>
      <div className="race-display" style={{ fontSize: "clamp(4rem, 22vw, 8rem)", lineHeight: 1 }} data-testid={testid}>{distance === null ? "—" : `${distance} m`}</div>
    </div>
  );
}

function CaptureButton({ item, j, label }: { item: RowingItem; j: Judge; label: string }) {
  return (
    <label className="race-btn" style={{ cursor: "pointer", justifyContent: "center", fontSize: "1.4rem", padding: "1.3rem" }}>
      {label}
      <input
        type="file" accept="image/*" capture="environment" data-testid="capture-input" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void j.capture(item.resultId, f); }}
      />
    </label>
  );
}

function Thumb({ entryId, j }: { entryId: string; j: Judge }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null; let cancelled = false;
    void j.thumb(entryId).then((x) => { if (cancelled) { if (x) URL.revokeObjectURL(x); } else { u = x; setUrl(x); } });
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u); };
  }, [entryId]);
  return url ? <img src={url} alt="Captured rowing display" data-testid="thumb" style={{ maxHeight: 160, borderRadius: 4, border: "1px solid var(--race-line)" }} /> : null;
}

function Reading({ text, distance, confidence, status, testid = "ocr-distance" }: { text: string; distance: number | null; confidence: number | null; status: string; testid?: string }) {
  const tone = status === "SUCCEEDED" ? "white" : status === "LOW_CONFIDENCE" ? "red" : "red";
  return (
    <div>
      <div className="race-label">OCR RESULT</div>
      <div className="race-display" style={{ fontSize: "clamp(4rem, 22vw, 8rem)", lineHeight: 1 }} data-testid={testid}>{distance === null ? "UNREADABLE" : `${distance} m`}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <RaceBadge tone={tone}><span data-testid="ocr-status">{status === "SUCCEEDED" ? "CLEAR READING" : status === "LOW_CONFIDENCE" ? "LOW CONFIDENCE" : "COULD NOT READ"}</span></RaceBadge>
        <span className="race-label" data-testid="ocr-confidence">Confidence {formatConfidence(confidence)}</span>
        {text ? <span className="race-label" style={{ textTransform: "none" }}>raw: “{text.trim()}”</span> : null}
      </div>
    </div>
  );
}

function Decision({ status, onConfirm, onRetake, disabled }: { status: string; onConfirm: (ack: boolean) => void; onRetake: () => void; disabled?: boolean }) {
  const [ack, setAck] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {status === "LOW_CONFIDENCE" ? (
        <label className="flex items-center gap-3 text-lg" data-testid="ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 26, height: 26 }} />
          I checked the machine display myself — the number is right
        </label>
      ) : null}
      {status === "FAILED" ? <p style={{ color: "var(--race-red-hot)" }} data-testid="unreadable">The display could not be read. Retake the photo (or ask Master Control to correct it).</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <RaceButton data-testid="confirm" disabled={disabled || status === "FAILED" || (status === "LOW_CONFIDENCE" && !ack)} onClick={() => onConfirm(ack)}>CONFIRM</RaceButton>
        <RaceButton data-testid="retake" variant="ghost" disabled={disabled} onClick={onRetake}>RETAKE PHOTO</RaceButton>
      </div>
    </div>
  );
}

function LocalAttempt({ entry, item, j }: { entry: EvidenceEntry; item: RowingItem; j: Judge }) {
  const reading = j.reading[entry.id] === true || entry.ocr === null;
  const late = j.raceMs !== null && j.raceMs >= item.scoringEndMs;
  return (
    <div className="flex flex-col gap-3" data-testid="local-attempt">
      <Thumb entryId={entry.id} j={j} />
      {reading ? (
        <div className="race-display text-3xl" data-testid="reading">READING THE DISPLAY…</div>
      ) : (
        <Reading text={entry.ocr!.rawText} distance={entry.ocr!.distanceM} confidence={entry.ocr!.confidence} status={entry.ocr!.status} />
      )}
      {entry.decision ? (
        <p className="race-label" data-testid="decision-sent">
          {entry.decision.type === "CONFIRM" ? "CONFIRMED ON THIS DEVICE" : "RETAKE REQUESTED"} — {entry.offline ? "waiting for the connection; it will be sent once" : "sending…"}
        </p>
      ) : !reading ? (
        <Decision status={entry.ocr!.status} onConfirm={(ack) => void j.confirm(entry.id, ack)} onRetake={() => void j.retake(entry.id, "Judge pressed RETAKE PHOTO")} />
      ) : null}
      {late && !entry.decision ? <p className="race-label">The 30-second transition is over — a confirmation now goes to Master Control for review.</p> : null}
      {!entry.uploaded ? <p className="race-label" data-testid="not-uploaded">Photo saved on this device — {entry.offline ? "waiting for the connection" : "uploading"}</p> : null}
    </div>
  );
}

function ServerAttempt({ attempt, item, j }: { attempt: OcrAttempt; item: RowingItem; j: Judge }) {
  return (
    <div className="flex flex-col gap-3" data-testid="server-attempt">
      {attempt.ocrStatus === "PENDING" ? (
        <div className="race-display text-3xl" data-testid="reading">READING THE DISPLAY…</div>
      ) : (
        <Reading text={attempt.ocrText ?? ""} distance={attempt.proposedDistanceM} confidence={attempt.confidence} status={attempt.ocrStatus} />
      )}
      {attempt.ocrStatus !== "PENDING" ? (
        <Decision status={attempt.ocrStatus} onConfirm={(ack) => void j.confirmServer(attempt.attemptId, ack)} onRetake={() => void j.retakeServer(attempt.attemptId, "Judge pressed RETAKE PHOTO")} />
      ) : null}
      <span className="sr-only">{item.raceNumber}</span>
    </div>
  );
}

function History({ item }: { item: RowingItem }) {
  const past = item.attempts.filter((a) => a.status === "RETAKEN" || a.status === "REJECTED");
  if (past.length === 0) return null;
  return (
    <details data-testid="history">
      <summary className="race-label" style={{ cursor: "pointer" }}>{past.length} earlier attempt{past.length === 1 ? "" : "s"} (kept)</summary>
      <ul className="mt-2 flex flex-col gap-1" style={{ color: "var(--race-muted)" }}>
        {past.map((a): ReactNode => (
          <li key={a.attemptId}>#{a.attemptNo} · {a.status} · OCR {a.proposedDistanceM === null ? "unreadable" : `${a.proposedDistanceM} m`} ({formatConfidence(a.confidence)}){a.retakeReason ? ` · ${a.retakeReason}` : ""}{a.reviewReason ? ` · ${a.reviewReason}` : ""}</li>
        ))}
      </ul>
    </details>
  );
}
