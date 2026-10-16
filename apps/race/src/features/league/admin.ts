"use client";

import { useCallback, useEffect, useState } from "react";
import { LeagueError, type AdminOverview } from "@9thround/league";
import { useAuthStore } from "../auth/store";
import { useLeagueSource } from "./hooks";
import type { LeagueSource } from "./source";

export function describeError(e: unknown): string {
  if (e instanceof LeagueError) return e.message;
  return "Something went wrong. Check your connection and try again.";
}

/** Who is signed in, for HINTS on screen only (e.g. "you recorded this"). Authorization is decided by the database. */
export function useCurrentUserId(source: LeagueSource | null): string | null {
  const auth = useAuthStore((s) => s.userId);
  if (source?.fixtures) return source.fixtures.league.actor?.id ?? null;
  return auth;
}

export function useSignedIn(source: LeagueSource | null): "hydrating" | "signedOut" | "signedIn" {
  const status = useAuthStore((s) => s.status);
  if (source?.fixtures) return source.fixtures.league.actor ? "signedIn" : "signedOut";
  return status;
}

export function useOverview(seasonId: string) {
  const source = useLeagueSource();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const status = useSignedIn(source);
  useEffect(() => {
    if (!source || status !== "signedIn") return;
    let cancelled = false;
    source.gateway.overview(seasonId).then((d) => { if (!cancelled) { setData(d); setError(null); } }).catch((e: unknown) => { if (!cancelled) setError(describeError(e)); });
    return () => { cancelled = true; };
  }, [source, seasonId, status, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { source, status, data, error, reload };
}

/** Runs a mutation, shows a confirmation or the database's refusal, then reloads. */
export function useAction(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: `${label}: done` });
      reload();
    } catch (e) {
      setMessage({ kind: "error", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  }, [reload]);
  return { busy, message, run, clear: () => setMessage(null) };
}
