"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { formatCountdown } from "@9thround/race";
import type { NextAthlete, PublicRaceEvent, ScreenState, StationScreenData } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { useStationScreen } from "../../../../../src/features/race/use-station-screen";

const STAGE_W = 1080;
const STAGE_H = 1920;

/** Whole seconds under a minute (big, single number), M:SS above. */
const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
const clock = (ms: number) => (ms < 60_000 ? String(secs(ms)) : formatCountdown(ms));

/** The fixed 1080 × 1920 portrait stage, scaled to whatever screen it is on (a TV mounted vertically). No controls live here. */
function Stage({ state, children }: { state: string; children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="screen-viewport">
      <div
        className="screen-stage"
        data-testid="screen-stage"
        data-state={state}
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <div className="screen-stripe" />
        {children}
      </div>
    </div>
  );
}

export default function StationScreenPage() {
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

  if (authStatus === "signedOut") {
    return (
      <Stage state="SIGNED_OUT">
        <div className="screen-center">
          <div className="screen-brand">THE <span>NINTH</span></div>
          <div className="screen-huge" style={{ fontSize: 150 }}>STATION {String(stationNumber).padStart(2, "0")}</div>
          <a href={`/race/login?next=/race/station/${slug}/${station}`} className="screen-signin">SIGN IN THIS SCREEN</a>
        </div>
      </Stage>
    );
  }
  if (loadError || !Number.isInteger(stationNumber)) {
    return <Stage state="ERROR"><div className="screen-center"><div className="screen-huge" style={{ fontSize: 120 }}>{loadError ?? "UNKNOWN STATION"}</div></div></Stage>;
  }
  if (!event) return <Stage state="LOADING"><div className="screen-center"><div className="screen-brand">THE <span>NINTH</span></div></div></Stage>;
  return <Screen eventId={event.eventId} stationNumber={stationNumber} />;
}

function Screen({ eventId, stationNumber }: { eventId: string; stationNumber: number }) {
  const { data, state, connectionLost, error } = useStationScreen(eventId, stationNumber);
  if (!data || !state) {
    return (
      <Stage state="LOADING">
        <div className="screen-center">
          <div className="screen-brand">THE <span>NINTH</span></div>
          <div className="screen-sub">{error ?? `STATION ${String(stationNumber).padStart(2, "0")}`}</div>
        </div>
      </Stage>
    );
  }
  return (
    <Stage state={state.kind}>
      <Head data={data} />
      <div className="screen-body" data-testid="screen-state" data-state={state.kind}>
        <Body state={state} data={data} />
      </div>
      {connectionLost && <div className="screen-lost" data-testid="screen-lost">RECONNECTING…</div>}
    </Stage>
  );
}

function Head({ data }: { data: StationScreenData }) {
  return (
    <div className="screen-head">
      <div className="screen-brand">THE <span>NINTH</span></div>
      <div className="screen-station-no">STATION {String(data.station.number).padStart(2, "0")}</div>
      <div className="screen-station-name" data-testid="screen-station-name">{data.station.name}</div>
    </div>
  );
}

function Code({ code, category }: { code: string; category?: string }) {
  return (
    <div className="screen-code-wrap">
      <div className="screen-code" data-testid="screen-code">{code}</div>
      {category && <div className="screen-cat">{category}</div>}
    </div>
  );
}

function Strip({ next }: { next: NextAthlete | null }) {
  if (!next) return <div className="screen-strip screen-strip-empty" />;
  return (
    <div className="screen-strip" data-testid="screen-strip">
      <span>NEXT</span> <b>{next.raceNumber}</b> <span>IN</span> <b>{clock(next.startsInMs)}</b>
    </div>
  );
}

function Body({ state, data }: { state: ScreenState; data: StationScreenData }) {
  switch (state.kind) {
    case "WAITING":
      return (
        <>
          <div className="screen-tag">{state.raceStarted ? "WAITING" : "RACE NOT STARTED"}</div>
          {state.next ? (
            <>
              <div className="screen-label">NEXT ATHLETE</div>
              <Code code={state.next.raceNumber} category={state.next.categoryCode} />
              <div className="screen-label">STARTS IN</div>
              <div className="screen-count" data-testid="screen-countdown">{clock(state.next.startsInMs)}</div>
            </>
          ) : state.plannedInMs !== null ? (
            <>
              <div className="screen-label">NEXT ATHLETE STARTS IN</div>
              <div className="screen-count" data-testid="screen-countdown">{clock(state.plannedInMs)}</div>
            </>
          ) : (
            <div className="screen-label">{data.eventName}</div>
          )}
        </>
      );
    case "GET_READY":
      return (
        <>
          <Code code={state.raceNumber} category={state.categoryCode} />
          <div className="screen-tag screen-tag-red">GET READY</div>
          <div className="screen-count screen-count-xl" data-testid="screen-countdown">{secs(state.startsInMs)}</div>
        </>
      );
    case "WORK":
      return (
        <>
          <div className="screen-tag screen-tag-red">WORK</div>
          <Code code={state.raceNumber} category={state.categoryCode} />
          <div className="screen-count screen-count-xl" data-testid="screen-countdown">{formatCountdown(state.remainingMs)}</div>
          {state.score === null ? (
            <div className="screen-label" data-testid="screen-rowing-note">ROW — YOUR DISTANCE IS READ AT THE END</div>
          ) : (
            <>
              <div className="screen-label">{state.unit}</div>
              <div className="screen-score" data-testid="screen-score">{state.score}</div>
            </>
          )}
          <Strip next={state.then} />
        </>
      );
    case "TRANSITION":
      return (
        <>
          <div className="screen-time-up">TIME</div>
          <Code code={state.raceNumber} />
          {state.finalScore === null ? (
            <>
              <div className="screen-label">FINAL DISTANCE</div>
              <div className="screen-pending" data-testid="screen-pending">CONFIRMING…</div>
            </>
          ) : (
            <>
              <div className="screen-label">FINAL SCORE · {state.unit}</div>
              <div className="screen-score" data-testid="screen-score">{state.finalScore}</div>
            </>
          )}
          <div className="screen-move" data-testid="screen-move">
            {state.moveTo === null ? "FINISHED — WELL DONE" : `MOVE TO STATION ${String(state.moveTo).padStart(2, "0")}`}
          </div>
          <div className="screen-count" data-testid="screen-countdown">{secs(state.remainingMs)}</div>
          <Strip next={state.then} />
        </>
      );
    case "NEXT_ATHLETE":
      return state.next ? (
        <>
          <div className="screen-tag">NEXT ATHLETE</div>
          <Code code={state.next.raceNumber} category={state.next.categoryCode} />
          <div className="screen-label">STARTS IN</div>
          <div className="screen-count" data-testid="screen-countdown">{clock(state.next.startsInMs)}</div>
        </>
      ) : state.plannedInMs !== null ? (
        <>
          <div className="screen-tag">NEXT ATHLETE</div>
          <div className="screen-label">STARTS IN</div>
          <div className="screen-count" data-testid="screen-countdown">{clock(state.plannedInMs)}</div>
        </>
      ) : (
        <>
          <div className="screen-tag">STATION FREE</div>
          <div className="screen-label">NO ATHLETE SCHEDULED</div>
        </>
      );
    case "PAUSED":
      return (
        <div className="screen-paused">
          <div className="screen-huge">RACE<br />PAUSED</div>
          <div className="screen-sub">PLEASE WAIT FOR OFFICIAL</div>
        </div>
      );
    case "FINISHED":
      return (
        <div className="screen-paused">
          <div className="screen-huge">RACE<br />FINISHED</div>
          <div className="screen-sub">{data.eventName}</div>
        </div>
      );
  }
}
