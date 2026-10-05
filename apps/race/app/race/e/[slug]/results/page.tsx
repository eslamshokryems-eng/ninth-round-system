"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { placeLabel } from "@9thround/race";
import type { CategoryBoard, PublicRaceEvent } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useLeaderboard } from "../../../../../src/features/race/use-leaderboard";
import { RaceBadge, RaceHeader, RacePage, RaceSpinner } from "../../../../../src/components/race/race-ui";

export default function ResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getRaceModule().getPublicEvent.execute(slug).then((r) => {
      if (cancelled) return;
      if (r.isOk) setEvent(r.value); else setMissing(true);
    });
    return () => { cancelled = true; };
  }, [slug]);
  return (
    <>
      <RaceHeader wide />
      <RacePage wide>
        {missing ? <h1 className="race-display mt-10 text-5xl">Event not found</h1> : event ? <Board event={event} /> : <RaceSpinner />}
      </RacePage>
    </>
  );
}

function Board({ event }: { event: PublicRaceEvent }) {
  const { board, error } = useLeaderboard(event.eventId);
  const [code, setCode] = useState<string | null>(null);
  if (!board) return error ? <p className="mt-10">{error}</p> : <RaceSpinner />;
  if (!board.available) {
    return (
      <div className="mt-10" data-testid="results-unavailable">
        <h1 className="race-display text-5xl">{event.name}</h1>
        <p className="mt-3 text-lg" style={{ color: "var(--race-muted)" }}>Results appear here once the race is under way.</p>
      </div>
    );
  }
  const current = board.categories.find((c) => c.code === code) ?? board.categories.find((c) => c.rows.length > 0) ?? board.categories[0];
  return (
    <div className="mt-6 flex flex-col gap-6" data-testid="results" data-official={board.official ? "true" : "false"}>
      <div>
        <p className="race-kicker">{board.official ? "Official results" : "Live · provisional"}</p>
        <h1 className="race-display mt-2" style={{ fontSize: "clamp(2.5rem, 10vw, 4rem)" }}>{board.eventName}</h1>
        {!board.official ? <p className="mt-2" style={{ color: "var(--race-muted)" }}>Standings update as athletes finish. They become official once every result is confirmed.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category">
        {board.categories.map((c) => (
          <button key={c.code} role="tab" aria-selected={current?.code === c.code} className={`race-btn race-btn--sm ${current?.code === c.code ? "" : "race-btn--ghost"}`} onClick={() => setCode(c.code)}>
            {c.name}
          </button>
        ))}
      </div>
      {current ? <Category cat={current} /> : null}
    </div>
  );
}

function Category({ cat }: { cat: CategoryBoard }) {
  const stations = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <section data-testid="category" data-code={cat.code}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="race-display text-3xl">{cat.name}</h2>
        <RaceBadge tone={cat.state === "OFFICIAL" ? "white" : "red"}>{cat.state}</RaceBadge>
        {cat.racing > 0 ? <span className="race-label">{cat.racing} still racing</span> : null}
      </div>
      {cat.rows.length === 0 ? (
        <p className="mt-4" style={{ color: "var(--race-muted)" }}>No finishers yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="race-table" data-testid="leaderboard">
            <thead>
              <tr>
                <th>#</th><th>Athlete</th><th>Pts</th>
                {stations.map((n) => <th key={n} title={`Station ${n} placement`}>S{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {cat.rows.map((r) => (
                <tr key={r.raceNumber} data-testid="row" data-rank={r.rank}>
                  <td className="race-display text-2xl">{placeLabel(cat.rows, r)}</td>
                  <td><span className="race-display text-xl">{r.raceNumber}</span> <span style={{ color: "var(--race-muted)" }}>{r.name}</span></td>
                  <td className="race-display text-2xl">{r.totalPoints}</td>
                  {stations.map((n) => <td key={n} style={{ color: "var(--race-muted)" }}>{r.placements[n] ?? "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cat.excluded.length > 0 ? (
        <div className="mt-5" data-testid="excluded">
          <p className="race-label">Not ranked</p>
          <p className="mt-1" style={{ color: "var(--race-muted)" }}>
            {cat.excluded.map((x) => `${x.raceNumber} ${x.name} — ${x.status}`).join(" · ")}
          </p>
        </div>
      ) : null}
      <p className="mt-6 text-sm" style={{ color: "var(--race-muted)" }}>
        Points = the sum of the nine station placements (lowest wins). Ties are broken by Jab + Cross technique, then Front Kick technique; athletes still level share the place.
      </p>
    </section>
  );
}
