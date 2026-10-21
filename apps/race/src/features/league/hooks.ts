"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LeagueRetryError, type PublicLeague } from "@9thround/league";
import { getLeagueSource, type LeagueSource } from "./source";

export function useLeagueSource(): LeagueSource | null {
  const [source, setSource] = useState<LeagueSource | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getLeagueSource().then((s) => { if (!cancelled) setSource(s); });
    return () => { cancelled = true; };
  }, []);
  return source;
}

/** ?season=<slug>, else the configured default. Must be rendered inside <Suspense>. */
export function useSeasonSlug(source: LeagueSource | null): string | null {
  const params = useSearchParams();
  const fromUrl = params.get("season");
  if (fromUrl && /^[a-z0-9]+(-[a-z0-9]+)*$/i.test(fromUrl)) return fromUrl.toLowerCase();
  return source?.defaultSlug ?? null;
}

export type LoadState = "loading" | "ready" | "unavailable" | "error";

/**
 * The published league, refreshed on an interval. Read-only. The standings are computed by the database (or the fixtures' same rules);
 * polling only decides how soon a viewer sees a change. On a failed refresh the last good data stays on screen and `offline` is set.
 */
export function usePublicLeague(source: LeagueSource | null, slug: string | null, everyMs = 15000) {
  const [league, setLeague] = useState<PublicLeague | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const busy = useRef(false);
  const failures = useRef(0);
  const retryAfterMs = useRef(0);
  const refresh = useCallback(async () => {
    if (!source || !slug || busy.current) return;
    busy.current = true;
    try {
      const l = await source.gateway.publicLeague(slug);
      failures.current = 0; retryAfterMs.current = 0;
      setOffline(false);
      setUpdatedAt(new Date());
      if (l) { setLeague(l); setState("ready"); } else { setLeague(null); setState("unavailable"); }
    } catch (e) {
      failures.current += 1;
      retryAfterMs.current = e instanceof LeagueRetryError ? e.retryAfterSeconds * 1000 : 0;
      setOffline(true);
      setState((s) => (s === "ready" ? "ready" : "error"));
    } finally {
      busy.current = false;
    }
  }, [source, slug]);
  useEffect(() => {
    if (!source || !slug) return;
    let stopped = false;
    let timer: number | undefined;
    // Self-scheduling poll: after failures wait longer (x2 each time, up to x8) plus jitter, and never sooner than the server's Retry-After — a struggling
    // server is not hammered by every open phone and TV at once.
    const loop = async () => {
      await refresh();
      if (stopped) return;
      const backoff = everyMs * 2 ** Math.min(failures.current, 3);
      const wait = Math.max(backoff, retryAfterMs.current) * (1 + Math.random() * 0.2);
      timer = window.setTimeout(() => void loop(), wait);
    };
    void loop();
    const wake = () => { if (failures.current === 0) void refresh(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [source, slug, everyMs, refresh]);
  return { league, state, offline, updatedAt, refresh };
}
