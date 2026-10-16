"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PublicParticipantPage } from "@9thround/league";
import { useLeagueSource, useSeasonSlug } from "../../../../../src/features/league/hooks";
import { DemoBanner, Movement, fmtPoints } from "../../../../../src/components/league/league-ui";
import { RaceBadge, RaceHeader, RaceNotice, RacePage, RaceSpinner } from "../../../../../src/components/race/race-ui";

export default function ParticipantPage() {
  return <Suspense fallback={<RaceSpinner />}><Inner /></Suspense>;
}

function Inner() {
  const { publicId } = useParams<{ publicId: string }>();
  const source = useLeagueSource();
  const slug = useSeasonSlug(source);
  const [page, setPage] = useState<PublicParticipantPage | null | "missing">(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!source || !slug) return;
    let cancelled = false;
    source.gateway.publicParticipant(slug, publicId).then((p) => { if (!cancelled) setPage(p ?? "missing"); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [source, slug, publicId]);
  const back = `/race/league${slug ? `?season=${encodeURIComponent(slug)}` : ""}`;
  return (
    <>
      {source?.demo ? <DemoBanner /> : null}
      <RaceHeader right={<a className="race-label" href={back}>← Standings</a>} />
      <RacePage>
        {failed ? <RaceNotice>We could not load this athlete. Check your connection.</RaceNotice> : page === null ? <RaceSpinner /> : page === "missing" || !page.standing ? <p className="mt-8" data-testid="athlete-missing">Athlete not found.</p> : (
          <div className="mt-4 flex flex-col gap-4" data-testid="athlete">
            <p className="race-kicker">League athlete</p>
            <h1 className="race-display" style={{ fontSize: "clamp(2.2rem, 10vw, 3.6rem)" }}>{page.standing.displayName}</h1>
            <div className="flex items-center gap-3"><RaceBadge tone="red">RANK {page.standing.rank}</RaceBadge><span className="race-display text-3xl">{fmtPoints(page.standing.totalPoints)} pts</span><Movement value={page.standing.movement} /></div>
            <div className="flex flex-col gap-2">
              {page.results.length === 0 ? <p className="lg-sub">No scored challenge yet.</p> : null}
              {page.results.map((r) => (
                <div key={r.weekNumber} className="race-card race-card--flat flex items-center justify-between gap-3" data-testid="athlete-result">
                  <span><span className="race-label">Week {r.weekNumber}</span><span className="block font-semibold">{r.challenge}</span></span>
                  <span className="text-right">{r.value !== null ? <span className="block">{r.value} {r.unit}</span> : <span className="lg-sub">no result</span>}<span className="lg-sub">{r.rank ? `rank ${r.rank} · ` : ""}{fmtPoints(r.points)} pts</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </RacePage>
    </>
  );
}
