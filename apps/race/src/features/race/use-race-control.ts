"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateOffset, needsResync, raceMsNow } from "@9thround/race";
import type { ClockSample, ClockSnapshot, ControlState, OffsetEstimate } from "@9thround/race";
import { getRaceModule } from "../../lib/composition-root";

const TICK_MS = 1000;
const DISPLAY_MS = 100;

export interface RaceControl {
  state: ControlState | null;
  error: string | null;
  /** Race time extrapolated on this device (null before START EVENT). Never runs backwards, freezes on pause. */
  raceMs: number | null;
  /** ± ms of the extrapolation (half the best round trip). */
  uncertaintyMs: number | null;
  /** True when the last server round trip failed — the clock shown is an estimate, not confirmed. */
  offline: boolean;
  refresh: () => Promise<void>;
}

/**
 * Drives Master Control: every second it re-reads the dashboard snapshot. That is a UI refresh, NOT what keeps the race going — the
 * authoritative race state is derived on the server from the START EVENT time, the pauses and the configured durations, so a device
 * that reconnects after any outage simply asks and gets the correct state. Between snapshots the race clock is extrapolated locally from the measured clock offset, so the display
 * is smooth without ever being the authority.
 */
export function useRaceControl(eventId: string | null): RaceControl {
  const [state, setState] = useState<ControlState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [offset, setOffset] = useState<OffsetEstimate | null>(null);
  const [localNow, setLocalNow] = useState(() => performance.now());
  const samples = useRef<ClockSample[]>([]);
  const snapshotRef = useRef<ClockSnapshot | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!eventId || inFlight.current) return;
    inFlight.current = true;
    const module = getRaceModule();
    try {
      // No "tick" is sent: the dashboard read itself settles the race on the server (official times are arithmetic). This poll only refreshes the picture.
      const sentAt = performance.now();
      const r = await module.getControlState.execute(eventId);
      const receivedAt = performance.now();
      if (r.isErr) {
        setError(r.error.message);
        setOffline(r.error.code === "RACE_REQUEST_FAILED");
        return;
      }
      setError(null);
      setOffline(false);
      const serverEpochMs = Date.parse(r.value.serverTime);
      samples.current = [...samples.current.slice(-19), { sentAt, receivedAt, serverEpochMs }];
      const nextOffset = estimateOffset(samples.current);
      const incoming: ClockSnapshot = {
        started: r.value.clock.started,
        paused: r.value.clock.paused,
        finished: r.value.clock.finished,
        raceMs: r.value.clock.raceMs,
        version: r.value.clock.version,
        serverEpochMs,
      };
      if (needsResync(snapshotRef.current, incoming, nextOffset)) samples.current = samples.current.slice(-1);
      snapshotRef.current = incoming;
      setOffset(nextOffset);
      setState(r.value);
    } finally {
      inFlight.current = false;
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), TICK_MS);
    return () => window.clearInterval(timer);
  }, [eventId, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(performance.now()), DISPLAY_MS);
    return () => window.clearInterval(timer);
  }, []);

  const raceMs = useMemo(() => {
    const snap = snapshotRef.current;
    if (!snap || !offset) return state?.clock.raceMs ?? null;
    return raceMsNow(snap, offset, localNow);
    // state is the trigger for a fresh snapshotRef; localNow drives the smooth ticking
  }, [state, offset, localNow]);

  return { state, error, raceMs, uncertaintyMs: offset?.uncertaintyMs ?? null, offline, refresh };
}
