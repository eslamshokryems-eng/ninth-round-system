"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { activeAttempt, describeEvidenceState, formatConfidence } from "@9thround/race";
import type { EvidenceHistory, OcrAttempt, PublicRaceEvent, RowingItem, RowingView } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { RaceBadge, RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSpinner, StaffNav } from "../../../../../src/components/race/race-ui";

/** Master Control / Event Manager: the rowing evidence — every photo and OCR reading, late confirmations to decide, manual corrections. */
export default function EvidencePage() {
  const { slug } = useParams<{ slug: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let cancelled = false;
    void getRaceModule().getPublicEvent.execute(slug).then((r) => {
      if (cancelled) return;
      if (r.isOk) setEvent(r.value); else setLoadError(r.error.message);
    });
    return () => { cancelled = true; };
  }, [authStatus, slug]);
  const shell = (c: ReactNode) => (
    <>
      <RaceHeader wide right={<StaffNav slug={slug} current="evidence" />} />
      <RacePage wide>{c}</RacePage>
    </>
  );
  if (authStatus === "hydrating") return shell(<RaceSpinner />);
  if (authStatus === "signedOut") {
    return shell(
      <div className="mt-10 flex flex-col gap-4">
        <h1 className="race-display text-5xl">Sign in required</h1>
        <a href={`/race/login?next=/race/control/${slug}/evidence`} className="race-btn self-start">Sign in</a>
      </div>,
    );
  }
  if (loadError) return shell(<RaceNotice>{loadError}</RaceNotice>);
  if (!event) return shell(<RaceSpinner />);
  return shell(<Evidence eventId={event.eventId} />);
}

function Evidence({ eventId }: { eventId: string }) {
  const [view, setView] = useState<RowingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await getRaceModule().getRowingView.execute({ eventId, all: true });
    if (r.isErr) setError(r.error.message); else { setError(null); setView(r.value); }
  }, [eventId]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [load]);
  const items = (view?.items ?? []).filter((i) => all || i.evidenceState !== "OFFICIAL");
  const waiting = (view?.items ?? []).filter((i) => i.evidenceState !== "OFFICIAL").length;
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="race-kicker">Station 09 · Rowing</p>
          <h1 className="race-display text-5xl">Evidence</h1>
        </div>
        <div className="flex gap-2">
          <RaceButton size="sm" variant={all ? "ghost" : "primary"} onClick={() => setAll(false)} data-testid="filter-attention">Needs attention ({waiting})</RaceButton>
          <RaceButton size="sm" variant={all ? "primary" : "ghost"} onClick={() => setAll(true)} data-testid="filter-all">All</RaceButton>
        </div>
      </div>
      {error ? <RaceNotice>{error}</RaceNotice> : null}
      {notice ? <div className="race-card race-card--flat" role="status" data-testid="evidence-msg">{notice}</div> : null}
      {!view ? <RaceSpinner /> : items.length === 0 ? <div className="race-card race-card--flat" data-testid="evidence-empty">Nothing needs attention — every rowing result is official.</div> : items.map((i) => <ResultCard key={i.resultId} item={i} onChanged={(m) => { setNotice(m); void load(); }} />)}
    </div>
  );
}

function ResultCard({ item, onChanged }: { item: RowingItem; onChanged: (message: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<EvidenceHistory | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [distance, setDistance] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = item.attempts.at(-1) ?? null;
  const active = activeAttempt(item);

  const review = async (a: OcrAttempt, decision: "APPROVED" | "REJECTED", why: string) => {
    setBusy(true); setErr(null);
    const r = await getRaceModule().reviewEvidence.execute({ attemptId: a.attemptId, decision, reason: why });
    setBusy(false);
    if (r.isErr) { setErr(r.error.message); return; }
    onChanged(decision === "APPROVED" ? `${item.raceNumber}: approved — Station 09 is official.` : `${item.raceNumber}: rejected — the judge can capture a new photo.`);
  };
  const correct = async () => {
    setBusy(true); setErr(null);
    const r = await getRaceModule().correctRowing.execute({ resultId: item.resultId, distanceM: Number(distance), reason, evidenceAttemptId: latest?.attemptId ?? null, maxDistanceM: item.limits.maxDistanceM });
    setBusy(false);
    if (r.isErr) { setErr(r.error.message); return; }
    setCorrecting(false); setDistance(""); setReason("");
    onChanged(`${item.raceNumber}: corrected ${r.value.old ?? "–"} → ${r.value.new} m (cites the photo, logged).`);
  };
  const showHistory = async () => {
    const r = await getRaceModule().getEvidenceHistory.execute({ resultId: item.resultId });
    if (r.isErr) setErr(r.error.message); else setHistory(r.value);
  };

  return (
    <section className="race-card" data-testid="evidence-card" data-race-number={item.raceNumber} data-evidence={item.evidenceState}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="race-display text-4xl">{item.raceNumber} <span style={{ color: "var(--race-muted)", fontSize: "1.25rem" }}>{item.name} · {item.categoryCode}</span></div>
        </div>
        <div className="flex items-center gap-3">
          {item.officialDistanceM !== null ? <span className="race-display text-3xl" data-testid="official-distance">{item.officialDistanceM} m</span> : null}
          <RaceBadge tone={item.evidenceState === "OFFICIAL" ? "white" : "red"}><span data-testid="evidence-state">{describeEvidenceState(item.evidenceState)}</span></RaceBadge>
        </div>
      </div>
      {err ? <div className="mt-3"><RaceNotice>{err}</RaceNotice></div> : null}

      <div className="mt-4 overflow-x-auto">
        {item.attempts.length === 0 ? <p style={{ color: "var(--race-muted)" }}>No photo yet.</p> : (
          <table className="race-table" data-testid="attempts">
            <thead><tr><th>#</th><th>Photo</th><th>OCR reading</th><th>Status</th><th>Notes</th><th /></tr></thead>
            <tbody>
              {item.attempts.map((a) => (
                <tr key={a.attemptId} data-testid="attempt" data-status={a.status}>
                  <td>{a.attemptNo}</td>
                  <td><Photo path={a.imagePath} /></td>
                  <td>
                    <div className="race-display text-2xl">{a.proposedDistanceM === null ? "unreadable" : `${a.proposedDistanceM} m`}</div>
                    <div style={{ color: "var(--race-muted)" }}>{a.ocrStatus} · {formatConfidence(a.confidence)}{a.ocrText ? ` · “${a.ocrText.trim()}”` : ""}</div>
                  </td>
                  <td>{a.status}{a.confirmedAfterTransition ? " · late" : ""}{a.origin === "OFFLINE_QUEUE" ? " · offline" : ""}</td>
                  <td style={{ color: "var(--race-muted)" }}>{a.retakeReason ?? a.reviewReason ?? ""}</td>
                  <td>{a.status === "PENDING_REVIEW" ? <ReviewForm attempt={a} busy={busy} onDecide={review} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <RaceButton size="sm" variant="ghost" onClick={() => void showHistory()} data-testid="show-history">Audit trail</RaceButton>
        {item.resultStatus === "LOCKED" || item.resultStatus === "CORRECTED" ? (
          <RaceButton size="sm" variant="ghost" onClick={() => setCorrecting((c) => !c)} data-testid="start-correction">Manual correction…</RaceButton>
        ) : <span className="race-label">Manual correction opens when the 0:30 transition is over</span>}
      </div>

      {correcting ? (
        <form className="mt-4 flex flex-col gap-3" data-testid="correction-form" onSubmit={(e) => { e.preventDefault(); void correct(); }}>
          <p style={{ color: "var(--race-muted)" }}>
            The OCR record is never changed. This adds a correction that cites {active ? `photo #${active.attemptNo}` : latest ? `photo #${latest.attemptNo}` : "no photo (none was captured)"}, your name, the time and your reason.
          </p>
          <RaceInput id={`d-${item.resultId}`} label="Corrected distance (m)" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)} hint={`Whole metres, 0–${item.limits.maxDistanceM}`} />
          <RaceInput id={`r-${item.resultId}`} label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-3">
            <RaceButton type="submit" isLoading={busy} disabled={reason.trim() === "" || distance.trim() === ""}>SAVE CORRECTION</RaceButton>
            <RaceButton type="button" variant="ghost" onClick={() => setCorrecting(false)}>Cancel</RaceButton>
          </div>
        </form>
      ) : null}

      {history ? (
        <div className="mt-4" data-testid="history-panel">
          <p className="race-label">Audit trail · {history.audit.length} entries · {history.corrections.length} correction{history.corrections.length === 1 ? "" : "s"}</p>
          <ol className="mt-2 flex flex-col gap-1" style={{ color: "var(--race-muted)" }}>
            {history.audit.map((a, i) => <li key={i}>{new Date(a.at).toLocaleTimeString("en-GB")} · {a.action.replace("race.ocr.", "")} · {a.actor ?? "system"}</li>)}
          </ol>
          {history.corrections.map((c) => <p key={c.id} className="mt-1">Correction {c.old ?? "–"} → {c.new} m — “{c.reason}”</p>)}
        </div>
      ) : null}
    </section>
  );
}

function ReviewForm({ attempt, busy, onDecide }: { attempt: OcrAttempt; busy: boolean; onDecide: (a: OcrAttempt, d: "APPROVED" | "REJECTED", reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex min-w-[16rem] flex-col gap-2" data-testid="review-form">
      <input className="race-input" aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <RaceButton size="sm" disabled={busy || reason.trim() === ""} onClick={() => onDecide(attempt, "APPROVED", reason)} data-testid="approve">APPROVE</RaceButton>
        <RaceButton size="sm" variant="ghost" disabled={busy || reason.trim() === ""} onClick={() => onDecide(attempt, "REJECTED", reason)} data-testid="reject">REJECT</RaceButton>
      </div>
    </div>
  );
}

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getRaceModule().getEvidenceImage.execute({ path }).then((r) => {
      if (cancelled) return;
      if (r.isOk) setUrl(r.value); else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (failed) return <span style={{ color: "var(--race-muted)" }}>unavailable</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Rowing display" data-testid="evidence-photo" style={{ width: 120, borderRadius: 4, border: "1px solid var(--race-line)" }} /></a>
  ) : <span style={{ color: "var(--race-muted)" }}>…</span>;
}
