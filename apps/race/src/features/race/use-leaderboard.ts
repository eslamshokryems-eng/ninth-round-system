"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Leaderboard } from "@9thround/race";
import { getRaceModule } from "../../lib/composition-root";

/** The public leaderboard. Read-only; polling only decides how soon a viewer sees a change (the ranking is computed in the database). */
export function useLeaderboard(eventId: string | null, everyMs = 5000) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (!eventId || busy.current) return;
    busy.current = true;
    try {
      const r = await getRaceModule().getLeaderboard.execute({ eventId });
      if (r.isErr) setError(r.error.message);
      else { setError(null); setBoard(r.value); }
    } finally {
      busy.current = false;
    }
  }, [eventId]);
  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), everyMs);
    const wake = () => void refresh();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [eventId, everyMs, refresh]);
  return { board, error, refresh };
}
