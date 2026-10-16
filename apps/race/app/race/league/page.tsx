"use client";

import { Suspense, useMemo, useState } from "react";
import type { PublicChallenge, PublicChallengeResults } from "@9thround/league";
import { useLeagueSource, usePublicLeague, useSeasonSlug } from "../../../src/features/league/hooks";
import { DemoBanner, StandingRow, WeekBar, fmtPoints, weekStatuses } from "../../../src/components/league/league-ui";
import { RaceBadge, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSpinner } from "../../../src/components/race/race-ui";

export default function LeaguePage() {
  return <Suspense fallback={<RaceSpinner />}><LeagueMobile /></Suspense>;
}

function LeagueMobile() {
  const source = useLeagueSource();
  const slug = useSeasonSlug(source);
  const { league, state, offline } = usePublicLeague(source, slug, 20000);
  const [tab, setTab] = useState<"standings" | "challenges">("standings");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (league ? league.standings.filter((r) => q === "" || r.displayName.toLowerCase().includes(q)) : []), [league, q]);
  const suffix = slug ? `?season=${encodeURIComponent(slug)}` : "";

  return (
    <>
      {source?.demo ? <DemoBanner /> : null}
      <RaceHeader right={<a className="race-label" href={`/race/league/tv${suffix}`}>TV view</a>} />
      <RacePage>
        {!source || (state === "loading" && slug) ? <RaceSpinner /> : null}
        {source && !slug ? <RaceNotice>No season selected. Open the league link you were given.</RaceNotice> : null}
        {state === "unavailable" ? (
          <div data-testid="league-unavailable" className="mt-8"><h1 className="race-display text-4xl">League</h1><p className="mt-3" style={{ color: "var(--race-muted)" }}>The league results are not published yet.</p></div>
        ) : null}
        {state === "error" ? <RaceNotice>We could not load the standings. Check your connection and try again.</RaceNotice> : null}
        {league ? (
          <div className="mt-4 flex flex-col gap-5" data-testid="league">
            {offline ? <RaceNotice>Offline — showing the last results we loaded.</RaceNotice> : null}
            <div>
              <p className="race-kicker">{league.season.status === "completed" ? "Final standings" : "Season standings"}</p>
              <h1 className="race-display mt-2" style={{ fontSize: "clamp(2rem, 9vw, 3.4rem)" }}>{league.season.name}</h1>
              <div className="mt-3 flex items-center gap-3">
                <RaceBadge tone="red">{league.season.currentWeek ? `WEEK ${String(league.season.currentWeek).padStart(2, "0")} / 08` : league.season.status === "completed" ? "COMPLETED" : "NOT STARTED"}</RaceBadge>
                <span className="lg-sub">{league.season.throughWeek} of 8 challenges scored</span>
              </div>
              <div className="mt-3"><WeekBar statuses={weekStatuses(league.challenges)} /></div>
            </div>
            <div className="flex gap-2" role="tablist">
              {(["standings", "challenges"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`race-btn race-btn--sm ${tab === t ? "" : "race-btn--ghost"}`}>{t === "standings" ? "Standings" : "Challenges"}</button>
              ))}
            </div>
            {tab === "standings" ? (
              <>
                <RaceInput id="lg-search" label="Find an athlete" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing a name" autoComplete="off" />
                {league.season.truncated ? <p className="lg-sub" data-testid="truncated">Showing the top {league.standings.length} of {league.season.participantCount} athletes.</p> : null}
                {league.standings.length === 0 ? <p style={{ color: "var(--race-muted)" }}>No athletes yet.</p> : rows.length === 0 ? <p style={{ color: "var(--race-muted)" }} data-testid="no-match">No athlete matches “{query}”.</p> : null}
                <div className="flex flex-col gap-2" data-testid="standings">
                  {rows.map((r) => <StandingRow key={r.publicId} row={r} href={`/race/league/p/${r.publicId}${suffix}`} />)}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3" data-testid="challenges">
                {league.challenges.length === 0 ? <p style={{ color: "var(--race-muted)" }}>The first challenge has not been announced yet.</p> : null}
                {league.challenges.map((c) => <ChallengeCard key={c.weekNumber} c={c} slug={league.season.slug} source={source} />)}
              </div>
            )}
            <p className="lg-sub">Points are cumulative across the eight weekly challenges. Standings update when each challenge is closed and verified.</p>
          </div>
        ) : null}
      </RacePage>
    </>
  );
}

function ChallengeCard({ c, slug, source }: { c: PublicChallenge; slug: string; source: ReturnType<typeof useLeagueSource> }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<PublicChallengeResults | null | "none">(null);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && res === null && source) setRes((await source.gateway.publicChallengeResults(slug, c.weekNumber).catch(() => null)) ?? "none");
  }
  return (
    <div className="race-card race-card--flat" data-testid="challenge-card">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void toggle()} aria-expanded={open}>
        <span><span className="race-label">Week {c.weekNumber}</span><span className="race-display block text-2xl">{c.name}</span></span>
        <RaceBadge tone={c.status === "closed" ? "white" : "red"}>{c.status === "closed" ? "RESULTS" : c.status === "open" ? "OPEN" : "SOON"}</RaceBadge>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          {c.description ? <p>{c.description}</p> : null}
          {c.instructions ? <p className="lg-sub">{c.instructions}</p> : null}
          {c.safetyNotes ? <p className="lg-sub">⚠ {c.safetyNotes}</p> : null}
          <p className="lg-sub">{c.direction === "LOWER_WINS" ? "Lowest" : "Highest"} {c.unit} wins.</p>
          {c.referenceUrl ? <a href={c.referenceUrl} rel="noopener noreferrer" target="_blank" className="race-label">Watch the demo ↗</a> : null}
          {c.status === "closed" ? (
            res === null ? <RaceSpinner /> : res === "none" ? <p className="lg-sub">Results are not available.</p> : (
              <ol className="flex flex-col gap-1" data-testid="week-results">
                {res.results.slice(0, 25).map((r) => (
                  <li key={r.publicId} className="flex justify-between gap-3"><span>{r.rank}. {r.displayName}</span><span>{r.value} {res.unit} · {fmtPoints(r.points)} pts</span></li>
                ))}
              </ol>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
