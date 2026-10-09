"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { DemoStatus } from "@9thround/race";
import { getRaceModule } from "../../../../src/lib/composition-root";
import { AdminShell, plainError, useAdminAccess } from "../../../../src/components/race/admin-shell";
import { RaceBadge, RaceButton, RaceInput, RaceNotice } from "../../../../src/components/race/race-ui";

const STATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function GuidedDemoPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status, access, event, error } = useAdminAccess(slug);
  const [st, setSt] = useState<DemoStatus | null>(null);
  const [count, setCount] = useState(6);
  const [heatSize, setHeatSize] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const eventId = event?.id;

  const load = useCallback(async () => {
    if (!eventId) return;
    const r = await getRaceModule().demo.status(eventId);
    if (r.isOk) setSt(r.value); else setProblem(plainError(r.error.message));
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, fn: () => Promise<{ isErr: boolean; error?: { message: string } }>) {
    setBusy(label); setProblem(null); setDone(null);
    const r = await fn();
    setBusy(null);
    if (r.isErr) setProblem(plainError(r.error?.message ?? "Something went wrong.")); else setDone(`${label}: done`);
    await load();
  }

  const mod = getRaceModule();
  const isDemo = event?.is_demo ?? false;
  const draft = st?.status === "DRAFT";
  const locked = !!st && !draft;
  const step = (n: number, title: string, ok: boolean, children: React.ReactNode) => (
    <div className="race-card flex flex-col gap-3" data-testid={`step-${n}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="race-display text-2xl">{n}. {title}</h2>
        {ok ? <RaceBadge tone="white">DONE</RaceBadge> : <RaceBadge>TO DO</RaceBadge>}
      </div>
      {children}
    </div>
  );

  return (
    <AdminShell slug={slug} current="overview" title="Guided demo" gate={{ status, error, ready: access !== null, notFound: access !== null && !event }}>
      {event ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="race-display text-4xl">{event.name}</h1>
            {isDemo ? <RaceBadge tone="red">DEMO</RaceBadge> : null}
            <RaceBadge>{st?.status ?? event.status}</RaceBadge>
          </div>
          {!isDemo ? <RaceNotice>This is not a demo event. The demo shortcuts below are disabled for it; use the normal screens.</RaceNotice> : null}
          {problem ? <RaceNotice>{problem}</RaceNotice> : null}
          {done ? <div className="race-card race-card--flat" role="status">{done}</div> : null}

          {step(1, "Customize the stations", !!st?.config_version && st.config_version > 1, (
            <>
              <p style={{ color: "var(--race-muted)" }}>Rename stations or exercises, pick a supported exercise type, set instructions and equipment. Changes are versioned and audited, and freeze when the race starts.</p>
              <a className="race-btn self-start" href={`/race/admin/${slug}/stations`}>Open Station &amp; Exercise Settings</a>
            </>
          ))}

          {step(2, "Add test athletes and build heats", (st?.athletes ?? 0) > 0, (
            <>
              <p style={{ color: "var(--race-muted)" }}>Clearly labelled “DEMO Athlete NN”, spread across Men / Women / Masters. {st ? `${st.athletes} athlete(s) in ${st.heats} heat(s).` : ""}</p>
              {draft && isDemo ? (
                <div className="flex flex-wrap items-end gap-3">
                  <RaceInput id="n" type="number" min={1} max={27} label="Athletes to add" value={count} onChange={(e) => setCount(Number(e.target.value))} />
                  <RaceInput id="hs" type="number" min={1} max={9} label="Heat size" hint="3 = small test heats; 9 = full heats" value={heatSize} onChange={(e) => setHeatSize(Number(e.target.value))} />
                  <RaceButton isLoading={busy === "Add athletes"} onClick={() => run("Add athletes", () => mod.demo.addAthletes(eventId!, count, heatSize))}>Add athletes</RaceButton>
                </div>
              ) : null}
            </>
          ))}

          {step(3, "Lock heats (opens check-in)", locked, (
            isDemo && draft ? <RaceButton className="self-start" isLoading={busy === "Lock heats"} disabled={!st || st.athletes === 0} onClick={() => run("Lock heats", () => mod.demo.lockHeats(eventId!))}>Lock heats</RaceButton> : <p style={{ color: "var(--race-muted)" }}>Locked.</p>
          ))}

          {step(4, "Check the athletes in", !!st && st.athletes > 0 && st.checked_in >= st.athletes, (
            <>
              <p style={{ color: "var(--race-muted)" }}>{st ? `${st.checked_in} of ${st.athletes} checked in.` : ""} Or use the reception screen for the real flow.</p>
              <div className="flex flex-wrap gap-3">
                {isDemo && locked ? <RaceButton isLoading={busy === "Check in all"} onClick={() => run("Check in all", () => mod.demo.checkInAll(eventId!))}>Check in all demo athletes</RaceButton> : null}
                <a className="race-btn race-btn--ghost" href={`/race/reception/${slug}`}>Reception screen</a>
              </div>
            </>
          ))}

          {step(5, "Open the Master dashboard and run the race", !!st?.started, (
            <>
              <p style={{ color: "var(--race-muted)" }}>START EVENT, pause / resume (emergency pause), skip, DNF and the heat controls are on the Master dashboard. The station configuration is {st?.config_frozen ? "FROZEN for this run." : "frozen the moment you press START EVENT."}</p>
              <a className="race-btn self-start" href={`/race/control/${slug}`}>Master dashboard</a>
            </>
          ))}

          {step(6, "Judge devices and station screens", false, (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {STATIONS.map((n) => (
                <div key={n} className="flex flex-col gap-1">
                  <a className="race-label" href={`/race/judge/${slug}/${n}`}>Judge {String(n).padStart(2, "0")}</a>
                  <a className="race-label" href={`/race/station/${slug}/${n}`}>Screen {String(n).padStart(2, "0")}</a>
                </div>
              ))}
            </div>
          ))}

          {step(7, "Results and rankings", false, (
            <a className="race-btn self-start" href={`/race/control/${slug}/results`}>Results</a>
          ))}

          {isDemo ? (
            <div className="race-card race-card--flat flex flex-col gap-2">
              <h2 className="race-display text-xl">Run it again</h2>
              <p style={{ color: "var(--race-muted)" }}>Starts a fresh demo event with this configuration. This run — its athletes, results, versions and audit trail — is kept untouched.</p>
              <RaceButton className="self-start" variant="ghost" isLoading={busy === "New run"} onClick={async () => {
                setBusy("New run"); setProblem(null);
                const r = await mod.demo.create(`${event.name} (new run)`, eventId);
                setBusy(null);
                if (r.isErr) setProblem(plainError(r.error.message)); else window.location.assign(`/race/admin/${r.value.slug}`);
              }}>New run with this configuration</RaceButton>
            </div>
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
}
