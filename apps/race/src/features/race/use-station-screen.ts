"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveScreenState, estimateOffset, raceMsNow } from "@9thround/race";
import type { ClockSample, ClockSnapshot, OffsetEstimate, ScreenState, StationScreenData } from "@9thround/race";
import { getRaceClient, getRaceModule } from "../../lib/composition-root";

/** After this long without an answer the screen says so. It keeps showing the locally extrapolated state meanwhile (display-only). */
const LOST_AFTER_MS = 10_000;

/**
 * The station screen's picture of one station.
 *
 * It owns NO race state: the last authoritative answer + an estimate of race time go through the pure `deriveScreenState`.
 * Polling and the realtime nudge only decide how soon a fresh answer arrives; neither can change the race. The screen calls
 * one read RPC (`race_station_screen`) and nothing else — no score, pause, skip or other write exists in this file.
 */
export function useStationScreen(eventId: string | null, stationNumber: number) {
  const [data, setData] = useState<StationScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<OffsetEstimate | null>(null);
  const [localNow, setLocalNow] = useState(() => performance.now());
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const samples = useRef<ClockSample[]>([]);
  const snapshot = useRef<ClockSnapshot | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!eventId || busy.current) return;
    busy.current = true;
    try {
      const sentAt = performance.now();
      const r = await getRaceModule().getStationScreen.execute({ eventId, stationNumber });
      const receivedAt = performance.now();
      if (r.isErr) {
        setError(r.error.code === "RACE_REQUEST_FAILED" ? null : r.error.message);
        return;
      }
      setError(null);
      const serverEpochMs = Date.parse(r.value.serverTime);
      samples.current = [...samples.current.slice(-19), { sentAt, receivedAt, serverEpochMs }];
      setOffset(estimateOffset(samples.current));
      snapshot.current = { ...r.value.clock, raceMs: r.value.clock.raceMs, serverEpochMs };
      setLastOkAt(receivedAt);
      setData(r.value);
    } finally {
      busy.current = false;
    }
  }, [eventId, stationNumber]);

  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), 1000);
    const wake = () => void refresh();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    // realtime = a nudge only ("something changed, ask again"). A missed message costs at most one poll interval.
    let unsubscribe = () => {};
    try {
      const client = getRaceClient();
      const channel = client
        .channel(`race-screen:${eventId}:${stationNumber}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "race_clock", filter: `event_id=eq.${eventId}` }, wake)
        .subscribe();
      unsubscribe = () => void client.removeChannel(channel);
    } catch { /* no realtime: polling alone keeps the screen right */ }
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      unsubscribe();
    };
  }, [eventId, stationNumber, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setLocalNow(performance.now()), 100);
    return () => window.clearInterval(t);
  }, []);

  const raceMs = useMemo(
    () => (snapshot.current && offset ? raceMsNow(snapshot.current, offset, localNow) : data?.clock.raceMs ?? null),
    [data, offset, localNow],
  );
  const state: ScreenState | null = useMemo(() => (data ? deriveScreenState(data, raceMs) : null), [data, raceMs]);
  const connectionLost = lastOkAt !== null && localNow - lastOkAt > LOST_AFTER_MS;
  return { data, state, error, connectionLost, refresh };
}
