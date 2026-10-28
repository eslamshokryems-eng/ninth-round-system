"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LeagueError,
  layoutInputToWire,
  layoutMetricOk,
  layoutToInput,
  normalizeLayout,
  stationTotal,
  type AdminOverview,
  type Challenge,
  type LayoutResultType,
  type StationBreakdownRow,
  type StationLayout,
  type StationLayoutInput,
  type StationValue,
} from "@9thround/league";
import type { useAction } from "../../features/league/admin";
import { describeError } from "../../features/league/admin";
import { RaceBadge, RaceButton, RaceInput, RaceNotice, RaceSpinner } from "../race/race-ui";

/**
 * THE NINTH League — station layouts. A weekly challenge may have its OWN workout: League stations (not race stations) with their exercises, and a judge records one value per
 * station. Everything here is a convenience: the same rules run in the database, which is the authority. Nothing in this file reads or writes the race engine.
 */
type Act = ReturnType<typeof useAction>;
const gw = () => import("../../features/league/source").then((m) => m.getLeagueSource()).then((s) => s.gateway);

const TYPE_LABEL: Record<LayoutResultType, string> = { REPS: "Repetitions", TIME: "Time", DISTANCE: "Distance", COMPLETION: "Done / not done (counts the stations completed)" };

// ---- loading ----------------------------------------------------------------------------------------------------------------------------------
export type LayoutLoad =
  | { status: "idle" | "loading" | "none" | "unavailable"; layout: null; error: null }
  | { status: "ready"; layout: StationLayout; error: null }
  | { status: "error"; layout: null; error: string };

/** The layout of one challenge. `unavailable` = the stations migration is not applied (the screens then fall back to the ordinary single-value form). */
export function useChallengeLayout(challengeId: string, tick = 0): LayoutLoad & { reload: () => void } {
  const [state, setState] = useState<LayoutLoad>({ status: "idle", layout: null, error: null });
  const [local, setLocal] = useState(0);
  useEffect(() => {
    if (!challengeId) { setState({ status: "idle", layout: null, error: null }); return; }
    let cancelled = false;
    setState((s) => (s.status === "ready" ? s : { status: "loading", layout: null, error: null }));
    gw().then((g) => g.getLayout(challengeId)).then((l) => { if (!cancelled) setState(l ? { status: "ready", layout: l, error: null } : { status: "none", layout: null, error: null }); }).catch((e: unknown) => {
      if (cancelled) return;
      if (e instanceof LeagueError && e.code === "LEAGUE_UNAVAILABLE") setState({ status: "unavailable", layout: null, error: null });
      else setState({ status: "error", layout: null, error: describeError(e) });
    });
    return () => { cancelled = true; };
  }, [challengeId, tick, local]);
  const reload = useCallback(() => setLocal((n) => n + 1), []);
  return { ...state, reload };
}

/** Which attempts are station attempts (and their per-station values). Only challenges that have attempts AND a layout are asked; a missing migration or a refusal reads as "none". */
export function useStationIndex(d: AdminOverview): ReadonlyMap<string, StationBreakdownRow> {
  const [index, setIndex] = useState<ReadonlyMap<string, StationBreakdownRow>>(new Map());
  const key = `${d.attempts.map((a) => `${a.id}:${a.status}`).join("|")}#${[...new Set(d.attempts.map((a) => a.challengeId))].join(",")}`;
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(d.attempts.map((a) => a.challengeId))];
    void (async () => {
      const map = new Map<string, StationBreakdownRow>();
      try {
        const g = await gw();
        for (const id of ids) {
          try {
            if (!(await g.getLayout(id))) continue;
            for (const r of await g.stationBreakdown(id)) map.set(r.attemptId, r);
          } catch { /* the stations migration is not applied, or this account cannot read it: there are no station attempts to show */ }
        }
      } catch { /* no source yet */ }
      if (!cancelled) setIndex(map);
    })();
    return () => { cancelled = true; };
  }, [key]);
  return index;
}

const fmt = (n: number) => String(n);
const stationLine = (r: Pick<StationBreakdownRow, "stations">) => r.stations.map((s) => fmt(s.value)).join(" · ");

/** "10 · 12 · 8 (version 1)" next to a station attempt in a list. */
export function StationValues({ row }: { row: StationBreakdownRow | undefined }) {
  if (!row) return null;
  return <span className="lg-sub" data-testid="station-values"> · stations {stationLine(row)}{row.layoutVersion ? ` (version ${row.layoutVersion})` : ""}</span>;
}

// ---- the editor (administrators) ------------------------------------------------------------------------------------------------------------------
interface DraftExercise { name: string; standard: string; equipment: string; target: string }
interface DraftStation { name: string; cap: string; exercises: DraftExercise[] }
const emptyExercise = (): DraftExercise => ({ name: "", standard: "", equipment: "", target: "" });
const emptyStation = (): DraftStation => ({ name: "", cap: "", exercises: [emptyExercise()] });
function draftFrom(l: StationLayout | null): DraftStation[] {
  if (!l) return [emptyStation()];
  const i = layoutToInput(l);
  return i.stations.map((s) => ({ name: s.name, cap: s.maxValue === null || s.maxValue === undefined ? "" : String(s.maxValue), exercises: s.exercises.map((e) => ({ name: e.name, standard: e.standard ?? "", equipment: e.equipment ?? "", target: e.target ?? "" })) }));
}
function inputFrom(type: LayoutResultType, stations: DraftStation[]): StationLayoutInput {
  return {
    resultType: type,
    stations: stations.map((s) => ({ name: s.name, maxValue: type === "COMPLETION" || s.cap.trim() === "" ? null : Number(s.cap), exercises: s.exercises.map((e) => ({ name: e.name, standard: e.standard, equipment: e.equipment, target: e.target })) })),
  };
}

export function LayoutEditor({ d, act, challenge }: { d: AdminOverview; act: Act; challenge: Challenge }) {
  const L = useChallengeLayout(challenge.id);
  const type = (["REPS", "TIME", "DISTANCE", "COMPLETION"] as const).find((t) => layoutMetricOk(t, challenge.metric.kind, challenge.metric.unit));
  return (
    <div className="race-card flex flex-col gap-3" data-testid="layout-editor">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="race-display text-xl">Workout layout — League stations</h3>
        {L.layout ? <RaceBadge tone="white">VERSION {L.layout.version}</RaceBadge> : null}
        <span className="lg-sub">These are League stations for this weekly workout. They have nothing to do with the race stations.</span>
      </div>
      {L.status === "loading" || L.status === "idle" ? <RaceSpinner /> : null}
      {L.status === "unavailable" ? <RaceNotice>Station layouts are not available yet in this environment. Results are recorded as a single number, exactly as before.</RaceNotice> : null}
      {L.status === "error" ? <RaceNotice>{L.error}</RaceNotice> : null}
      {!type && L.status !== "unavailable" ? <RaceNotice>A {challenge.metric.kind === "LOAD" ? "load" : "this"} challenge cannot have a station layout: only repetitions, time, distance and done / not done can be added up unambiguously. It stays a single result.</RaceNotice> : null}
      {type && (L.status === "none" || L.status === "ready") ? <LayoutEditorForm key={`${challenge.id}-${L.layout?.version ?? 0}`} d={d} act={act} challenge={challenge} type={type} layout={L.layout} reload={L.reload} /> : null}
    </div>
  );
}

function LayoutEditorForm({ d, act, challenge, type, layout, reload }: { d: AdminOverview; act: Act; challenge: Challenge; type: LayoutResultType; layout: StationLayout | null; reload: () => void }) {
  const [stations, setStations] = useState<DraftStation[]>(() => draftFrom(layout));
  const [reason, setReason] = useState("");
  const hasAttempts = d.attempts.some((a) => a.challengeId === challenge.id);
  const locked = d.season.status === "completed" || challenge.status === "closed";
  const frozen = layout !== null && hasAttempts;       // after the first attempt: the number of stations and the caps are fixed (the database enforces it)
  const input = useMemo(() => inputFrom(type, stations), [type, stations]);
  const problem = useMemo(() => {
    try { normalizeLayout(layoutInputToWire(input), challenge.metric); return null; } catch (e) { return e instanceof LeagueError ? e.message : "This layout is not valid."; }
  }, [input, challenge.metric]);
  const dirty = JSON.stringify(inputFrom(type, draftFrom(layout))) !== JSON.stringify(input);
  const setStation = (i: number, p: Partial<DraftStation>) => setStations((all) => all.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const setExercise = (i: number, j: number, p: Partial<DraftExercise>) => setStations((all) => all.map((s, k) => (k === i ? { ...s, exercises: s.exercises.map((e, m) => (m === j ? { ...e, ...p } : e)) } : s)));
  const next = (layout?.version ?? 0) + 1;
  return (
    <>
      <p className="lg-sub">Result type: <strong>{TYPE_LABEL[type]}</strong> — fixed by the challenge ({challenge.metric.kind} in {challenge.metric.unit}). Each station has its own result; the total is what is ranked.</p>
      {locked ? <RaceNotice>{d.season.status === "completed" ? "The season is completed — nothing can change." : "A closed challenge can no longer change its layout."}</RaceNotice> : null}
      {frozen ? <RaceNotice>Attempts exist: the number of stations and the caps are fixed. You can still substitute exercises (a new version, with a reason).</RaceNotice> : null}
      {layout === null && hasAttempts ? <RaceNotice>Attempts were already recorded as single results, so a layout can no longer be introduced for this challenge.</RaceNotice> : null}
      {stations.map((s, i) => (
        <div key={i} className="race-card race-card--flat flex flex-col gap-2" data-testid="layout-station" style={{ padding: "0.7rem 0.9rem" }}>
          <div className="grid gap-2 md:grid-cols-[1fr_10rem_auto]">
            <RaceInput id={`ls-name-${i}`} label={`Station ${i + 1} name`} value={s.name} disabled={locked} onChange={(e) => setStation(i, { name: e.target.value })} />
            {type === "COMPLETION" ? <span /> : <RaceInput id={`ls-cap-${i}`} inputMode="decimal" label="Cap (optional)" value={s.cap} disabled={locked || frozen} onChange={(e) => setStation(i, { cap: e.target.value })} hint="Highest value a judge can enter" />}
            <RaceButton size="sm" variant="ghost" disabled={locked || frozen || stations.length <= 1} onClick={() => setStations((all) => all.filter((_, k) => k !== i))}>Remove station</RaceButton>
          </div>
          {s.exercises.map((e, j) => (
            <div key={j} className="grid gap-2 md:grid-cols-[1.2fr_1.5fr_1fr_1fr_auto]" data-testid="layout-exercise">
              <RaceInput id={`le-name-${i}-${j}`} label={`Exercise ${j + 1}`} value={e.name} disabled={locked} onChange={(ev) => setExercise(i, j, { name: ev.target.value })} />
              <RaceInput id={`le-std-${i}-${j}`} label="Movement standard" value={e.standard} disabled={locked} onChange={(ev) => setExercise(i, j, { standard: ev.target.value })} />
              <RaceInput id={`le-eq-${i}-${j}`} label="Equipment" value={e.equipment} disabled={locked} onChange={(ev) => setExercise(i, j, { equipment: ev.target.value })} />
              <RaceInput id={`le-tg-${i}-${j}`} label="Target" value={e.target} disabled={locked} onChange={(ev) => setExercise(i, j, { target: ev.target.value })} />
              <RaceButton size="sm" variant="ghost" disabled={locked || s.exercises.length <= 1} onClick={() => setStation(i, { exercises: s.exercises.filter((_, m) => m !== j) })}>Remove</RaceButton>
            </div>
          ))}
          <div><RaceButton size="sm" variant="ghost" disabled={locked || s.exercises.length >= 5} onClick={() => setStation(i, { exercises: [...s.exercises, emptyExercise()] })}>Add an exercise</RaceButton></div>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <RaceButton size="sm" variant="ghost" disabled={locked || frozen || stations.length >= 20 || (layout === null && hasAttempts)} data-testid="add-station" onClick={() => setStations((all) => [...all, emptyStation()])}>Add a station</RaceButton>
        <div className="min-w-[16rem] flex-1"><RaceInput id="layout-reason" label={layout ? "Why are the exercises changing? (required)" : "Reason (required)"} value={reason} disabled={locked} onChange={(e) => setReason(e.target.value)} data-testid="layout-reason" /></div>
        <RaceButton disabled={act.busy || locked || problem !== null || reason.trim() === "" || (layout !== null && !dirty) || (layout === null && hasAttempts)} data-testid="layout-save"
          onClick={() => void act.run(layout ? `Version ${next} saved` : "Layout saved", async () => { await (await gw()).setLayout(challenge.id, input, reason); setReason(""); reload(); })}>{layout ? `Save as version ${next}` : "Create the layout"}</RaceButton>
      </div>
      {problem && dirty ? <p className="lg-sub" data-testid="layout-problem">{problem}</p> : null}
      {layout && layout.versions.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="layout-versions">
          <p className="race-label">Versions</p>
          {[...layout.versions].reverse().map((v) => <p key={v.version} className="lg-sub">Version {v.version} · {new Date(v.createdAt).toLocaleString()} · {v.reason}</p>)}
        </div>
      ) : null}
    </>
  );
}

// ---- the judge form -------------------------------------------------------------------------------------------------------------------------------
/** One value per station. The total is shown live; the database validates and adds it up again. A form built from an older version is refused, then reloaded. */
export function StationRecordForm({ act, challenge, participantId, layout, reload }: { act: Act; challenge: Challenge; participantId: string; layout: StationLayout; reload: () => void }) {
  const [values, setValues] = useState<string[]>(() => layout.stations.map(() => ""));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const complete = layout.resultType === "COMPLETION";
  const entries: StationValue[] = layout.stations.map((s, i) => ({ position: s.position, value: values[i] === undefined || values[i] === "" ? Number.NaN : Number(values[i]) }));
  const check = useMemo(() => {
    try { return { total: stationTotal(layout, entries), error: null as string | null }; } catch (e) { return { total: null as number | null, error: e instanceof LeagueError ? e.message : "Check the values." }; }
  }, [layout, values]);
  return (
    <div className="flex flex-col gap-2" data-testid="station-form">
      <p className="lg-sub">Layout version {layout.version}. Enter one result per station ({challenge.metric.unit}).</p>
      {layout.stations.map((s, i) => (
        <div key={s.position} className="race-card race-card--flat flex flex-col gap-1" style={{ padding: "0.5rem 0.8rem" }}>
          {complete ? (
            <label className="flex items-center gap-2"><input type="checkbox" data-testid={`station-input-${s.position}`} checked={values[i] === "1"} onChange={(e) => setValues((all) => all.map((v, k) => (k === i ? (e.target.checked ? "1" : "0") : v)))} /> <strong>{s.name}</strong> done</label>
          ) : (
            <RaceInput id={`sv-${s.position}`} data-testid={`station-input-${s.position}`} inputMode="decimal" label={`${s.position}. ${s.name}${s.maxValue !== null ? ` (max ${s.maxValue})` : ""}`} value={values[i] ?? ""} onChange={(e) => setValues((all) => all.map((v, k) => (k === i ? e.target.value : v)))} />
          )}
          <ul className="lg-sub" style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {s.exercises.map((e) => <li key={e.position}>{e.name}{e.standard ? ` — ${e.standard}` : ""}{e.equipment ? ` · ${e.equipment}` : ""}{e.target ? ` · target: ${e.target}` : ""}</li>)}
          </ul>
        </div>
      ))}
      <p data-testid="station-total"><strong>Total: {check.total === null ? "—" : `${check.total} ${challenge.metric.unit}`}</strong>{check.error && values.some((v) => v !== "") ? <span className="lg-sub"> · {check.error}</span> : null}</p>
      <RaceButton disabled={act.busy || !participantId || check.total === null} data-testid="station-record"
        onClick={() => void act.run("Attempt recorded", async () => {
          try {
            await (await gw()).recordStationAttempt({ challengeId: challenge.id, participantId, layoutVersion: layout.version, values: entries, clientRequestId: requestId });
          } catch (e) {
            if (e instanceof LeagueError && e.code === "LEAGUE_LAYOUT_CHANGED") reload();   // the exercises changed under this form: show the new version
            throw e;
          }
          setValues(layout.stations.map(() => "")); setRequestId(crypto.randomUUID()); reload();
        })}>Record</RaceButton>
      <p className="lg-sub">A retry of the same press is safe: it is recorded once.</p>
    </div>
  );
}

// ---- the reviewer's breakdown ---------------------------------------------------------------------------------------------------------------------
export function StationBreakdownPanel({ challengeId, tick, admin }: { challengeId: string; tick: string; admin?: { act: Act; reason: string } | undefined }) {
  const [rows, setRows] = useState<readonly StationBreakdownRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    gw().then((g) => g.stationBreakdown(challengeId)).then((r) => { if (!cancelled) { setRows(r); setError(null); } }).catch((e: unknown) => { if (!cancelled) setError(describeError(e)); });
    return () => { cancelled = true; };
  }, [challengeId, tick]);
  if (error) return <RaceNotice>{error}</RaceNotice>;
  if (!rows) return <RaceSpinner />;
  return (
    <div className="flex flex-col gap-1" data-testid="breakdown">
      <h3 className="race-display text-lg">Station breakdown ({rows.length})</h3>
      {rows.length === 0 ? <p className="lg-sub">No attempts yet.</p> : null}
      {rows.map((r) => (
        <div key={r.attemptId} className="race-card race-card--flat" data-testid="breakdown-row" style={{ padding: "0.4rem 0.8rem" }}>
          <strong>{r.displayName}</strong> <span className="lg-sub">· attempt {r.attemptNo} · {r.status}{r.layoutVersion ? ` · version ${r.layoutVersion}` : ""}</span> <strong>{r.value}</strong>
          <div className="lg-sub">{r.stations.map((s) => `${s.name}: ${s.value}`).join(" · ") || "no station values"}</div>
          {admin && r.status === "approved" && r.layoutVersion ? <div className="mt-1"><StationCorrection act={admin.act} row={r} challengeId={challengeId} reason={admin.reason} testPrefix="bd-correct" /></div> : null}
        </div>
      ))}
    </div>
  );
}

// ---- per-station correction (administrators) -------------------------------------------------------------------------------------------------------
export function StationCorrection({ act, row, challengeId, reason, testPrefix = "station-correct" }: { act: Act; row: StationBreakdownRow | undefined; challengeId: string; reason: string; testPrefix?: string }) {
  const [open, setOpen] = useState(false);
  const L = useChallengeLayout(open ? challengeId : "");
  const [values, setValues] = useState<string[]>(() => (row?.stations ?? []).map((s) => String(s.value)));
  if (!row) return null;
  if (!open) return <RaceButton size="sm" variant="ghost" data-testid={`${testPrefix}-open`} onClick={() => setOpen(true)}>Correct stations…</RaceButton>;
  const entries: StationValue[] = row.stations.map((s, i) => ({ position: s.position, value: values[i] === undefined || values[i] === "" ? Number.NaN : Number(values[i]) }));
  let total: number | null = null;
  let problem: string | null = null;
  if (L.status === "ready") { try { total = stationTotal(L.layout, entries); } catch (e) { problem = e instanceof LeagueError ? e.message : "Check the values."; } }
  return (
    <span className="flex flex-wrap items-center gap-2" data-testid={testPrefix}>
      {row.stations.map((s, i) => <input key={s.position} aria-label={`Corrected ${s.name}`} className="race-input" style={{ width: "5rem", minHeight: 0, padding: "0.3rem" }} value={values[i] ?? ""} onChange={(e) => setValues((all) => all.map((v, k) => (k === i ? e.target.value : v)))} />)}
      <span className="lg-sub">{total === null ? problem ?? "" : `total ${total}`}</span>
      <RaceButton size="sm" disabled={act.busy || reason.trim() === "" || total === null} data-testid={`${testPrefix}-apply`} onClick={() => void act.run("Corrected", async () => { await (await gw()).correctStationAttempt(row.attemptId, entries, reason); setOpen(false); })}>Correct</RaceButton>
      <RaceButton size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</RaceButton>
    </span>
  );
}
