"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DEMO_USERS, type MySeason } from "@9thround/league";
import { describeError, useSignedIn } from "../../../../src/features/league/admin";
import { useLeagueSource } from "../../../../src/features/league/hooks";
import { ACTOR_KEY } from "../../../../src/features/league/source";
import { DemoBanner } from "../../../../src/components/league/league-ui";
import { SignOutButton } from "../../../../src/components/race/admin-shell";
import { RaceBadge, RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSpinner } from "../../../../src/components/race/race-ui";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default function LeagueAdminHub() {
  const source = useLeagueSource();
  const status = useSignedIn(source);
  const [seasons, setSeasons] = useState<readonly MySeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [name, setName] = useState("THE NINTH League — Season 1");
  const [slug, setSlug] = useState("season-1");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState("admin");

  useEffect(() => {
    if (!source || status !== "signedIn") return;
    let cancelled = false;
    source.gateway.mySeasons().then((s) => { if (!cancelled) setSeasons(s); }).catch((e: unknown) => { if (!cancelled) setError(describeError(e)); });
    return () => { cancelled = true; };
  }, [source, status, tick]);
  useEffect(() => {
    if (!source?.fixtures) return;
    const k = (() => { try { return window.sessionStorage.getItem(ACTOR_KEY); } catch { return null; } })();
    if (k === "admin" || k === "judge" || k === "reviewer" || k === "outsider" || k === "anonymous") setWho(k);
    setTick((n) => n + 1);
  }, [source]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!source) return;
    setBusy(true); setError(null);
    try {
      const id = await source.gateway.createSeason({ slug, name, startsOn: start, endsOn: addDays(start, 55) });
      window.location.assign(`/race/league/admin/${id}`);
    } catch (err) { setError(describeError(err)); } finally { setBusy(false); }
  }

  return (
    <>
      {source?.demo ? <DemoBanner /> : null}
      <RaceHeader wide right={source?.demo ? null : status === "signedIn" ? <SignOutButton /> : undefined} />
      <RacePage wide>
        <p className="race-kicker mt-4">League administration</p>
        <h1 className="race-display mt-2 text-4xl">Seasons</h1>
        {!source ? <RaceSpinner /> : null}
        {source?.fixtures ? (
          <div className="race-card race-card--flat mt-4 flex flex-wrap items-center gap-3" data-testid="act-as">
            <span className="race-label">Acting as (local fixtures only)</span>
            {(["admin", "judge", "reviewer", "outsider", "anonymous"] as const).map((k) => (
              <button key={k} className={`race-btn race-btn--sm ${who === k ? "" : "race-btn--ghost"}`} data-testid={`as-${k}`}
                onClick={() => { source.fixtures?.league.as(k === "anonymous" ? null : DEMO_USERS[k]); try { window.sessionStorage.setItem(ACTOR_KEY, k); } catch { /* ignore */ } setWho(k); setSeasons(null); setError(null); setTick((n) => n + 1); }}>{k}</button>
            ))}
          </div>
        ) : null}
        {source && status === "signedOut" ? (
          <div className="mt-6 flex flex-col gap-3"><p>Sign in with your league staff account.</p><a className="race-btn self-start" href="/race/login?next=/race/league/admin">Sign in</a></div>
        ) : null}
        {error ? <div className="mt-4"><RaceNotice>{error}</RaceNotice></div> : null}
        {status === "signedIn" ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2" data-testid="season-list">
              {seasons === null && !error ? <RaceSpinner /> : null}
              {seasons?.length === 0 ? <p style={{ color: "var(--race-muted)" }}>You have no league role on any season yet.</p> : null}
              {seasons?.map((s) => (
                <a key={s.id} href={`/race/league/admin/${s.id}`} className="race-card race-card--flat flex items-center justify-between gap-3" style={{ textDecoration: "none", color: "inherit" }}>
                  <span><span className="race-display block text-2xl">{s.name}</span><span className="lg-sub">{s.startsOn} → {s.endsOn} · {s.roles.join(", ") || (s.isSuperAdmin ? "SUPER ADMIN" : "")}</span></span>
                  <span className="flex gap-2"><RaceBadge>{s.status}</RaceBadge>{s.published ? <RaceBadge tone="red">PUBLISHED</RaceBadge> : null}</span>
                </a>
              ))}
            </div>
            <form onSubmit={create} className="race-card flex flex-col gap-3" data-testid="create-season">
              <h2 className="race-display text-2xl">New season</h2>
              <p style={{ color: "var(--race-muted)" }}>A season is exactly eight weeks. Pick the first day; the last day is set for you. It starts as a draft and is not public.</p>
              <RaceInput id="s-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <RaceInput id="s-slug" label="Address (lowercase letters, numbers, dashes)" value={slug} onChange={(e) => setSlug(e.target.value)} />
              <RaceInput id="s-start" type="date" label="First day" value={start} onChange={(e) => setStart(e.target.value)} {...(start ? { hint: `Last day: ${addDays(start, 55)}` } : {})} />
              <RaceButton type="submit" isLoading={busy} disabled={!start}>Create season</RaceButton>
            </form>
          </div>
        ) : null}
      </RacePage>
    </>
  );
}
