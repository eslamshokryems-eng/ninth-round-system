"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ActionQueue, formatCountdown } from "@9thround/race";
import type { ActionType, PublicRaceEvent, QueuedAction, QueueStorage, SendOutcome } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { useStationView } from "../../../../../src/features/race/use-station-view";
import { RaceBadge, RaceButton, RaceHeader, RaceNotice, RacePage, RaceSpinner } from "../../../../../src/components/race/race-ui";

function browserStorage(key: string): QueueStorage {
  return {
    load() {
      try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") as QueuedAction[]; } catch { return []; }
    },
    save(items) {
      try { window.localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage full or blocked: the in-memory flow still works */ }
    },
    nextSeq() {
      try {
        const n = Number(window.localStorage.getItem(`${key}:seq`) ?? "0") + 1;
        window.localStorage.setItem(`${key}:seq`, String(n));
        return n;
      } catch { return Date.now(); }
    },
  };
}

export default function JudgePage() {
  const { slug, station } = useParams<{ slug: string; station: string }>();
  const stationNumber = Number(station);
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

  if (authStatus === "hydrating") return <Shell><RaceSpinner /></Shell>;
  if (authStatus === "signedOut") {
    return (
      <Shell>
        <div className="mt-10 flex flex-col gap-4">
          <h1 className="race-display text-5xl">Sign in required</h1>
          <a href={`/race/login?next=/race/judge/${slug}/${station}`} className="race-btn self-start">Sign in</a>
        </div>
      </Shell>
    );
  }
  if (loadError) return <Shell><RaceNotice>{loadError}</RaceNotice></Shell>;
  if (!event || !Number.isInteger(stationNumber)) return <Shell><RaceSpinner /></Shell>;
  return <Console event={event} stationNumber={stationNumber} />;
}

function Console({ event, stationNumber }: { event: PublicRaceEvent; stationNumber: number }) {
  const { view, error, offline, raceMs, refresh } = useStationView(event.eventId, stationNumber);
  const queueKey = `race-judge-queue:${event.eventId}:${stationNumber}`;
  const queue = useMemo(
    () => new ActionQueue(browserStorage(queueKey), () => crypto.randomUUID(), () => new Date().toISOString()),
    [queueKey],
  );
  const [pending, setPending] = useState(0);
  const [parked, setParked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<{ id: string; resultId: string } | null>(null);
  const [technique, setTechnique] = useState(7);
  const flushing = useRef(false);
  const raceMsRef = useRef<number | null>(null);
  raceMsRef.current = raceMs;

  const sync = useCallback(() => {
    setPending(queue.pending().length);
    setParked(queue.failed().map((f) => `${f.type}: ${f.failed}`));
  }, [queue]);

  const send = useCallback(async (a: QueuedAction): Promise<SendOutcome> => {
    const r = await getRaceModule().recordAction.execute({
      resultId: a.resultId,
      type: a.type,
      clientEventId: a.clientEventId,
      origin: a.offline ? "OFFLINE_QUEUE" : "ONLINE",
      ...(a.value !== undefined ? { value: a.value } : {}),
      ...(a.voidsEventId !== undefined ? { voidsEventId: a.voidsEventId } : {}),
      ...(a.offline ? { deviceRecordedAt: a.recordedAt, deviceSeq: a.deviceSeq, ...(a.deviceRaceMs !== null ? { deviceRaceMs: a.deviceRaceMs } : {}) } : {}),
    });
    if (r.isErr) return r.error.code === "RACE_REQUEST_FAILED" ? { kind: "network-error" } : { kind: "refused", message: r.error.message };
    if (r.value.status === "ACCEPTED" && a.type !== "VOID") setLastEvent({ id: r.value.performanceEventId, resultId: a.resultId });
    if (r.value.status === "REJECTED") setNotice(r.value.rejectionCode === "WINDOW_CLOSED" ? "Too late — the 3:00 window had already ended. That action was NOT counted." : `Not counted (${r.value.rejectionCode ?? "rejected"}).`);
    if (r.value.status === "PENDING_MASTER_REVIEW") setNotice("Sent late from the offline queue — Master Control will decide whether it counts.");
    return { kind: "recorded" };
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try { await queue.flush(send); } finally { flushing.current = false; sync(); void refresh(); }
  }, [queue, send, sync, refresh]);

  useEffect(() => {
    sync();
    void flush();
    const t = window.setInterval(() => void flush(), 3000);
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => { window.clearInterval(t); window.removeEventListener("online", online); };
  }, [flush, sync]);

  function tap(type: ActionType, value?: number, voidsEventId?: string) {
    const cur = view?.current;
    if (!cur) return;
    setNotice(null);
    queue.enqueue({ resultId: cur.resultId, type, deviceRaceMs: raceMsRef.current, ...(value !== undefined ? { value } : {}), ...(voidsEventId !== undefined ? { voidsEventId } : {}) });
    sync();
    void flush();
  }

  const cur = view?.current ?? null;
  const st = view?.station;
  const working = cur?.state === "WORK";
  const remaining = cur && raceMs !== null ? (working ? cur.windowEndMs - raceMs : cur.scoringEndMs - raceMs) : null;
  const t = cur?.tally;
  const isMasters = cur?.categoryCode === "MASTERS";
  const kind: "reps" | "laps" | "hold" = stationNumber === 3 || stationNumber === 6 ? "laps" : stationNumber === 1 && isMasters ? "hold" : "reps";
  const big = kind === "laps" ? (t?.laps ?? 0) : kind === "hold" ? Math.floor((t?.holdMs ?? 0) / 1000) : (t?.reps ?? 0);

  return (
    <Shell>
      <div className="mt-2 flex flex-col gap-4">
        {error ? <RaceNotice>{error}</RaceNotice> : null}
        {offline ? <RaceNotice>No connection — your taps are saved on this device and will be sent, once each, as soon as it is back.</RaceNotice> : null}
        {notice ? <div className="race-card race-card--flat" role="status">{notice}</div> : null}
        <div className="flex items-center justify-between">
          <p className="race-kicker">Judge · {st ? `Station ${String(st.number).padStart(2, "0")} · ${st.name}` : "…"}</p>
          <div className="flex gap-2">
            {view?.clock.paused ? <RaceBadge tone="red">RACE PAUSED</RaceBadge> : null}
            {pending > 0 ? <RaceBadge tone="red">{pending} waiting to send</RaceBadge> : <RaceBadge>All sent</RaceBadge>}
          </div>
        </div>
        {!view ? <RaceSpinner /> : !cur ? (
          <div className="race-card">
            <p className="race-display text-3xl">No athlete at this station</p>
            {view.next ? <p className="mt-2" style={{ color: "var(--race-muted)" }}>Next: {view.next.raceNumber} · {view.next.fullName} in {formatCountdown(view.next.startsInMs)}</p> : null}
          </div>
        ) : (
          <>
            <div className="race-card flex flex-col gap-2" data-testid="athlete">
              <div className="race-number-plate" style={{ fontSize: "clamp(3.5rem, 16vw, 6rem)" }}>{cur.raceNumber}</div>
              <p className="race-display text-3xl">{cur.fullName}</p>
              <p style={{ color: "var(--race-muted)" }}>{cur.movement ?? ""}</p>
              <div className="race-display text-6xl" data-testid="countdown">{remaining !== null ? formatCountdown(remaining) : ""}</div>
              <RaceBadge tone={working ? "red" : "white"}>{working ? "WORK" : "0:30 — scoring only"}</RaceBadge>
            </div>
            <div className="race-card text-center">
              <div className="race-number-plate" data-testid="tally" style={{ fontSize: "clamp(4rem, 20vw, 8rem)" }}>{big}</div>
              <p className="race-label">{kind === "laps" ? "laps" : kind === "hold" ? "seconds held" : "reps"}{t?.pendingReview ? ` · ${t.pendingReview} awaiting Master` : ""}</p>
            </div>
            {working ? (
              <div className="grid grid-cols-2 gap-3">
                {kind === "reps" ? (
                  <>
                    <RaceButton onClick={() => tap("REP")} style={{ minHeight: 120, fontSize: "2rem" }}>+ REP</RaceButton>
                    <RaceButton variant="ghost" onClick={() => tap("NO_REP")} style={{ minHeight: 120, fontSize: "1.6rem" }}>NO REP</RaceButton>
                  </>
                ) : null}
                {kind === "laps" ? (
                  <>
                    <RaceButton onClick={() => tap("LAP")} style={{ minHeight: 120, fontSize: "2rem" }}>+ LAP</RaceButton>
                    {stationNumber === 6 ? <RaceButton variant="danger" onClick={() => tap("PENALTY")} style={{ minHeight: 120, fontSize: "1.6rem" }}>PENALTY</RaceButton> : <span />}
                  </>
                ) : null}
                {kind === "hold" ? (
                  <>
                    <RaceButton onClick={() => tap("HOLD_START")} style={{ minHeight: 120 }}>HOLD START</RaceButton>
                    <RaceButton variant="danger" onClick={() => tap("HOLD_BREAK")} style={{ minHeight: 120 }}>BREAK</RaceButton>
                    <RaceButton variant="ghost" onClick={() => tap("HOLD_RESUME")} style={{ minHeight: 80 }}>RESUME</RaceButton>
                  </>
                ) : null}
                <RaceButton variant="ghost" disabled={!lastEvent || lastEvent.resultId !== cur.resultId} onClick={() => lastEvent && tap("VOID", undefined, lastEvent.id)} style={{ minHeight: 80 }}>UNDO LAST</RaceButton>
              </div>
            ) : (
              <p style={{ color: "var(--race-muted)" }}>The work window is over — counting has stopped.</p>
            )}
            {st?.hasTechnique ? (
              <div className="race-card race-card--flat flex items-center gap-3">
                <label className="race-label" htmlFor="tech">Technique {technique}/10</label>
                <input id="tech" type="range" min={0} max={10} step={0.5} value={technique} onChange={(e) => setTechnique(Number(e.target.value))} />
                <RaceButton size="sm" onClick={() => tap("TECHNIQUE_SCORE", technique)}>Save technique</RaceButton>
              </div>
            ) : null}
            {stationNumber === 9 ? <RaceNotice>Rowing distance is captured from the display photo (next phase).</RaceNotice> : null}
          </>
        )}
        {parked.length > 0 ? <RaceNotice>Refused (not retried): {parked.join(" · ")}</RaceNotice> : null}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <RaceHeader />
      <RacePage>{children}</RacePage>
    </>
  );
}
