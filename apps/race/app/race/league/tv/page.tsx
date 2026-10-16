"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicChallengeResults, PublicLeague } from "@9thround/league";
import { useLeagueSource, usePublicLeague, useSeasonSlug } from "../../../../src/features/league/hooks";
import { Movement, fmtPoints, fmtRank } from "../../../../src/components/league/league-ui";
import { QrCodeImage } from "../../../../src/components/qr-code";

type Mode = "standings" | "week" | "podium" | "progress";
const MODES: readonly Mode[] = ["standings", "week", "podium", "progress"];

export default function TvPage() {
  return <Suspense fallback={null}><Tv /></Suspense>;
}

function useQuery() {
  const p = useSearchParams();
  const interval = Math.min(120, Math.max(5, Number(p.get("interval") ?? 15) || 15));
  return { interval, rotate: p.get("rotate") !== "off", reducedParam: p.get("motion") === "reduced", only: (p.get("mode") ?? "") as Mode | "" };
}

function useReducedMotion(forced: boolean): boolean {
  const [reduced, setReduced] = useState(forced);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(forced || m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, [forced]);
  return reduced;
}

function Tv() {
  const source = useLeagueSource();
  const slug = useSeasonSlug(source);
  const q = useQuery();
  const { league, state, offline, updatedAt } = usePublicLeague(source, slug, 15000);
  const reduced = useReducedMotion(q.reducedParam);
  const [i, setI] = useState(0);
  const modes = useMemo<Mode[]>(() => (q.only && MODES.includes(q.only) ? [q.only] : MODES.filter((m) => m !== "week" || (league?.season.throughWeek ?? 0) > 0)), [q.only, league?.season.throughWeek]);
  useEffect(() => {
    if (!q.rotate || modes.length < 2) return;
    const t = window.setInterval(() => setI((n) => n + 1), q.interval * 1000);
    return () => window.clearInterval(t);
  }, [q.rotate, q.interval, modes.length]);
  const mode = modes[i % modes.length] ?? "standings";
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!source || (state === "loading" && slug)) return <Frame><Center title="THE NINTH LEAGUE" sub="Loading…" /></Frame>;
  if (!slug) return <Frame><Center title="THE NINTH LEAGUE" sub="No season selected — open this screen with ?season=<season address>" /></Frame>;
  if (state === "unavailable") return <Frame><Center title="THE NINTH LEAGUE" sub="Results will appear here once the season is published." testid="tv-unavailable" /></Frame>;
  if (!league) return <Frame offline><Center title="THE NINTH LEAGUE" sub="Cannot reach the results. Retrying…" testid="tv-error" /></Frame>;
  const open = league.challenges.find((c) => c.status === "open") ?? league.challenges.filter((c) => c.status === "closed").at(-1) ?? null;
  const week = league.season.currentWeek ?? (league.season.status === "completed" ? 8 : null);
  const qrUrl = `${origin}/race/league?season=${encodeURIComponent(league.season.slug)}`;

  return (
    <Frame reduced={reduced} offline={offline} demo={source.demo}>
      <div className="lg-tv-head">
        <div>
          <div className="lg-tv-brand">THE <span>NINTH</span> LEAGUE</div>
          <div className="lg-tv-season" data-testid="tv-season">{league.season.name}</div>
        </div>
        <div className="lg-tv-week" data-testid="tv-week">
          <small>{league.season.status === "completed" ? "FINAL" : "SEASON"}</small>
          {week ? `WEEK ${String(week).padStart(2, "0")} / 08` : "STARTS " + league.season.startsOn}
        </div>
      </div>
      <div className="lg-tv-body" key={mode}>
        {mode === "standings" ? <Standings league={league} reduced={reduced} /> : null}
        {mode === "week" ? <WeekResults league={league} source={source} reduced={reduced} /> : null}
        {mode === "podium" ? <Podium league={league} reduced={reduced} /> : null}
        {mode === "progress" ? <Progress league={league} reduced={reduced} /> : null}
      </div>
      <div className="lg-tv-foot">
        <div>
          {open ? <>{open.status === "open" ? "THIS WEEK" : "LAST CHALLENGE"}: <strong data-testid="tv-challenge">{open.name}</strong> · {open.direction === "LOWER_WINS" ? "lowest" : "highest"} {open.unit} wins</> : "First challenge to be announced"}
          <div data-testid="tv-updated">Updated {updatedAt ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}{offline ? " · OFFLINE" : ""}</div>
        </div>
        {origin ? <div style={{ display: "flex", alignItems: "center", gap: "1.2vw" }}><span style={{ textAlign: "right" }}>Scan for your<br />results on your phone</span><QrCodeImage value={qrUrl} size={Math.round((typeof window === "undefined" ? 1080 : window.innerHeight) * 0.1)} alt="QR code: league results on your phone" /></div> : null}
      </div>
    </Frame>
  );
}

function Frame({ children, reduced = false, offline = false, demo = false }: { children: React.ReactNode; reduced?: boolean; offline?: boolean; demo?: boolean }) {
  return (
    <div className={`lg-tv${reduced ? " lg-reduce" : ""}`} data-testid="tv" data-reduced={reduced ? "1" : "0"}>
      <div className="screen-stripe" style={{ height: "1.6vh" }} />
      {demo ? <div className="lg-demo" style={{ fontSize: "1.8vh" }} data-testid="demo-banner">Local test data — synthetic “Demo Athlete” fixtures · not real members</div> : null}
      {offline ? <div className="lg-tv-offline" data-testid="tv-offline">Offline — showing the last results received</div> : null}
      {children}
    </div>
  );
}
function Center({ title, sub, testid }: { title: string; sub: string; testid?: string }) {
  return <div className="lg-tv-center" data-testid={testid}><div className="lg-tv-brand" style={{ fontSize: "9vh" }}>{title}</div><div style={{ fontSize: "3.4vh", color: "var(--race-muted)" }}>{sub}</div></div>;
}

function Standings({ league, reduced }: { league: PublicLeague; reduced: boolean }) {
  const top = league.standings.slice(0, 10);
  if (top.length === 0) return <Center title="NO ATHLETES YET" sub="The standings will appear here." />;
  return (
    <>
      <div className="lg-tv-title">Season standings{league.season.throughWeek ? ` · after week ${league.season.throughWeek}` : ""}</div>
      <div className={`lg-tv-list${reduced ? "" : " lg-fade"}`} style={{ ["--rows" as string]: Math.max(6, top.length) }} data-testid="tv-standings">
        {top.map((r) => (
          <div className="lg-tv-row" key={r.publicId} data-top={r.rank <= 3 ? "1" : "0"} data-testid="tv-row">
            <div className="lg-tv-rank" data-tied={r.tied ? "1" : "0"}>{fmtRank(r.rank, r.tied)}</div>
            <div className="lg-tv-name">{r.displayName}</div>
            <div className="lg-tv-move"><Movement value={r.movement} /></div>
            <div className="lg-tv-pts">{fmtPoints(r.totalPoints)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function WeekResults({ league, source, reduced }: { league: PublicLeague; source: NonNullable<ReturnType<typeof useLeagueSource>>; reduced: boolean }) {
  const week = league.season.throughWeek;
  const [res, setRes] = useState<PublicChallengeResults | null>(null);
  useEffect(() => {
    let cancelled = false;
    source.gateway.publicChallengeResults(league.season.slug, week).then((r) => { if (!cancelled) setRes(r); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [source, league.season.slug, week, league.generatedAt]);
  if (!res) return <Center title={`WEEK ${String(week).padStart(2, "0")}`} sub="Results loading…" />;
  const top = res.results.slice(0, 10);
  return (
    <>
      <div className="lg-tv-title">Week {week} · {res.name} · {res.direction === "LOWER_WINS" ? "lowest" : "highest"} {res.unit} wins</div>
      <div className={`lg-tv-list${reduced ? "" : " lg-fade"}`} style={{ ["--rows" as string]: Math.max(6, top.length) }} data-testid="tv-week-results">
        {top.map((r) => (
          <div className="lg-tv-row" key={r.publicId} data-top={r.rank <= 3 ? "1" : "0"}>
            <div className="lg-tv-rank">{r.rank}</div>
            <div className="lg-tv-name">{r.displayName}</div>
            <div className="lg-tv-move">{r.value} {res.unit}</div>
            <div className="lg-tv-pts">+{fmtPoints(r.points)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Podium({ league, reduced }: { league: PublicLeague; reduced: boolean }) {
  const top = league.standings.slice(0, 3);
  if (top.length === 0) return <Center title="NO ATHLETES YET" sub="The podium will appear here." />;
  const order = [top[1], top[0], top[2]];
  return (
    <>
      <div className="lg-tv-title">The podium{league.season.status === "completed" ? " · final" : ""}</div>
      <div className={`lg-tv-podium${reduced ? "" : " lg-fade"}`} data-testid="tv-podium">
        {order.map((r, k) => r ? (
          <div className="lg-tv-pod" key={r.publicId} data-place={[2, 1, 3][k]}>
            <div className="place">{fmtRank(r.rank, r.tied)}</div>
            <div className="who">{r.displayName}</div>
            <div className="pts">{fmtPoints(r.totalPoints)}</div>
            <div style={{ color: "var(--race-muted)", fontSize: "2.2vh" }}>POINTS</div>
          </div>
        ) : <div key={k} />)}
      </div>
    </>
  );
}

function Progress({ league, reduced }: { league: PublicLeague; reduced: boolean }) {
  const byWeek = new Map(league.challenges.map((c) => [c.weekNumber, c]));
  return (
    <>
      <div className="lg-tv-title">Season progress</div>
      <div className={`lg-tv-weeks${reduced ? "" : " lg-fade"}`} data-testid="tv-progress">
        {Array.from({ length: 8 }, (_, k) => k + 1).map((w) => {
          const c = byWeek.get(w);
          return (
            <div className="lg-tv-weektile" key={w} data-s={c?.status ?? "none"}>
              <div className="n">{String(w).padStart(2, "0")}</div>
              <div className="t">{c ? c.name : "To be announced"}</div>
              <div className="s">{c?.status === "closed" ? "Results in" : c?.status === "open" ? "Open now" : c ? "Coming up" : "—"}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
