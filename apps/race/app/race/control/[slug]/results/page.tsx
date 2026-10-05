"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { blockersClear, describeBlockers } from "@9thround/race";
import type { AthleteResults, PublicRaceEvent, SnapshotInfo } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { RaceBadge, RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSpinner, StaffNav } from "../../../../../src/components/race/race-ui";

export default function ResultsDeskPage() {
  const { slug } = useParams<{ slug: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let cancelled = false;
    void getRaceModule().getPublicEvent.execute(slug).then((r) => {
      if (cancelled) return;
      if (r.isOk) setEvent(r.value); else setLoadError(r.error.message);
    });
    return () => { cancelled = true; };
  }, [authStatus, slug]);
  const shell = (c: ReactNode) => (
    <>
      <RaceHeader wide right={<StaffNav slug={slug} current="results" />} />
      <RacePage wide>{c}</RacePage>
    </>
  );
  if (authStatus === "hydrating") return shell(<RaceSpinner />);
  if (authStatus === "signedOut") {
    return shell(
      <div className="mt-10 flex flex-col gap-4">
        <h1 className="race-display text-5xl">Sign in required</h1>
        <a href={`/race/login?next=/race/control/${slug}/results`} className="race-btn self-start">Sign in</a>
      </div>,
    );
  }
  if (loadError) return shell(<RaceNotice>{loadError}</RaceNotice>);
  if (!event) return shell(<RaceSpinner />);
  return shell(<Desk event={event} slug={slug} />);
}

function Desk({ event, slug }: { event: PublicRaceEvent; slug: string }) {
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null);
  const [status, setStatus] = useState(event.status);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const official = status === "RESULTS_OFFICIAL" || status === "ARCHIVED";

  const compute = useCallback(async () => {
    setBusy(true);
    const r = await getRaceModule().computeRankings.execute({ eventId: event.eventId });
    setBusy(false);
    if (r.isErr) { setMsg({ tone: "err", text: r.error.message }); return; }
    setSnaps(r.value); setMsg(null);
  }, [event.eventId]);
  useEffect(() => { void compute(); }, [compute]);

  const publish = async () => {
    setBusy(true);
    const r = await getRaceModule().publishResults.execute({ eventId: event.eventId });
    setBusy(false); setConfirm(false);
    if (r.isErr) { setMsg({ tone: "err", text: r.error.message }); void compute(); return; }
    setStatus(r.value.status as typeof status); setMsg({ tone: "ok", text: "Results are official and public." });
  };
  const blockers = (snaps ?? []).flatMap((s) => describeBlockers(s.blockers));
  const ready = snaps !== null && snaps.every((s) => blockersClear(s.blockers));

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <p className="race-kicker">{event.name}</p>
        <h1 className="race-display mt-1 text-5xl">Results</h1>
      </div>
      {msg ? (msg.tone === "err" ? <RaceNotice>{msg.text}</RaceNotice> : <p role="status" data-testid="results-msg">{msg.text}</p>) : null}

      <section className="race-card" data-testid="publish-card">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="race-display text-3xl">Official results</h2>
          <RaceBadge tone={official ? "white" : "red"}>{official ? "OFFICIAL" : "NOT PUBLISHED"}</RaceBadge>
          <a className="race-label" href={`/race/e/${slug}/results`}>Public leaderboard →</a>
        </div>
        {snaps === null ? <RaceSpinner /> : (
          <ul className="mt-3 flex flex-col gap-1" data-testid="blockers">
            {official ? <li>Results are official. Corrections below create a new official version.</li>
              : blockers.length === 0 ? <li>Everything is confirmed — ready to publish.</li>
              : blockers.map((b) => <li key={b}>• {b}</li>)}
          </ul>
        )}
        {!official ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <RaceButton variant="ghost" isLoading={busy} onClick={() => void compute()}>Refresh</RaceButton>
            {confirm ? (
              <>
                <RaceButton isLoading={busy} onClick={() => void publish()}>YES — PUBLISH OFFICIAL RESULTS</RaceButton>
                <RaceButton variant="ghost" onClick={() => setConfirm(false)}>Cancel</RaceButton>
              </>
            ) : (
              <RaceButton disabled={!ready || busy || status !== "FINISHED"} onClick={() => setConfirm(true)}>PUBLISH OFFICIAL RESULTS</RaceButton>
            )}
          </div>
        ) : null}
        {!official && status !== "FINISHED" ? <p className="mt-3 text-sm" style={{ color: "var(--race-muted)" }}>Publishing opens when the race has finished.</p> : null}
      </section>

      <Corrections eventId={event.eventId} onCorrected={() => void compute()} />
    </div>
  );
}

function Corrections({ eventId, onCorrected }: { eventId: string; onCorrected: () => void }) {
  const [query, setQuery] = useState("");
  const [athlete, setAthlete] = useState<AthleteResults | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: "official_score" | "technique_score" } | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (q: string) => {
    const r = await getRaceModule().getAthleteResults.execute({ eventId, raceNumber: q });
    if (r.isErr) { setErr(r.error.message); setAthlete(null); return; }
    setErr(null); setAthlete(r.value);
  };
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const r = await getRaceModule().correctResult.execute({ resultId: editing.id, field: editing.field, value: Number(value), reason });
    setBusy(false);
    if (r.isErr) { setErr(r.error.message); return; }
    setErr(null); setDone(`Corrected ${r.value.old ?? "–"} → ${r.value.new}`); setEditing(null); setValue(""); setReason("");
    await load(athlete!.raceNumber); onCorrected();
  };
  return (
    <section className="race-card" data-testid="corrections">
      <h2 className="race-display text-3xl">Corrections</h2>
      <p className="mt-1" style={{ color: "var(--race-muted)" }}>Event Manager only. Every correction needs a reason and is kept in the audit log.</p>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setDone(null); void load(query); }}>
        <RaceInput id="rn" label="Race number" placeholder="N012" value={query} onChange={(e) => setQuery(e.target.value)} />
        <RaceButton type="submit">Find athlete</RaceButton>
      </form>
      {err ? <div className="mt-3"><RaceNotice>{err}</RaceNotice></div> : null}
      {done ? <p className="mt-3" role="status" data-testid="correction-done">{done}</p> : null}
      {athlete ? (
        <div className="mt-4 overflow-x-auto" data-testid="athlete-results">
          <p className="race-display text-2xl">{athlete.raceNumber} · {athlete.name} · {athlete.categoryCode} · {athlete.raceStatus}</p>
          <table className="race-table mt-2">
            <thead><tr><th>Station</th><th>Status</th><th>Score</th><th>Technique</th><th /></tr></thead>
            <tbody>
              {athlete.results.map((r) => (
                <tr key={r.resultId}>
                  <td>{r.station} · {r.stationName}</td><td>{r.status}</td>
                  <td>{r.officialScore ?? "–"}</td><td>{r.hasTechnique ? (r.techniqueScore ?? "–") : ""}</td>
                  <td className="flex gap-2">
                    {(r.status === "LOCKED" || r.status === "CORRECTED") ? (
                      <>
                        <RaceButton size="sm" variant="ghost" onClick={() => { setEditing({ id: r.resultId, field: "official_score" }); setValue(String(r.officialScore ?? "")); }}>Edit score</RaceButton>
                        {r.hasTechnique ? <RaceButton size="sm" variant="ghost" onClick={() => { setEditing({ id: r.resultId, field: "technique_score" }); setValue(String(r.techniqueScore ?? "")); }}>Edit technique</RaceButton> : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editing ? (
            <form className="mt-4 flex flex-col gap-3" data-testid="correction-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <RaceInput id="val" label={editing.field === "official_score" ? "New score" : "New technique score (0–10)"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
              <RaceInput id="why" label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-3">
                <RaceButton type="submit" isLoading={busy} disabled={reason.trim() === "" || value.trim() === ""}>SAVE CORRECTION</RaceButton>
                <RaceButton type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</RaceButton>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
