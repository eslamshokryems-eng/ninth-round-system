"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateOffset, raceMsNow } from "@9thround/race";
import type { ClockSample, ClockSnapshot, OffsetEstimate, StationView } from "@9thround/race";
import { getRaceModule } from "../../lib/composition-root";

/** A judge's / station screen's picture of one station. Polling is a UI refresh; the race itself never depends on it. */
export function useStationView(eventId: string | null, stationNumber: number) {
  const [view, setView] = useState<StationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [offset, setOffset] = useState<OffsetEstimate | null>(null);
  const [localNow, setLocalNow] = useState(() => performance.now());
  const samples = useRef<ClockSample[]>([]);
  const snapshot = useRef<ClockSnapshot | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!eventId || busy.current) return;
    busy.current = true;
    try {
      const sentAt = performance.now();
      const r = await getRaceModule().getStationView.execute({ eventId, stationNumber });
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
      setOffset(estimateOffset(samples.current));
      snapshot.current = { ...r.value.clock, raceMs: r.value.clock.raceMs, serverEpochMs };
      setView(r.value);
    } finally {
      busy.current = false;
    }
  }, [eventId, stationNumber]);

  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(t);
  }, [eventId, refresh]);
  useEffect(() => {
    const t = window.setInterval(() => setLocalNow(performance.now()), 100);
    return () => window.clearInterval(t);
  }, []);

  const raceMs = useMemo(() => (snapshot.current && offset ? raceMsNow(snapshot.current, offset, localNow) : view?.clock.raceMs ?? null), [view, offset, localNow]);
  return { view, error, offline, raceMs, refresh };
}
