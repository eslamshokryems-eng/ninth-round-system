"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { StationCategoryCode, StationConfig, StationConfigView, StationPatch, StationPreview } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { AdminShell, plainError, useAdminAccess } from "../../../../../src/components/race/admin-shell";
import { RaceBadge, RaceButton, RaceInput, RaceNotice, RaceSelect, RaceTextArea } from "../../../../../src/components/race/race-ui";

const CATS: StationCategoryCode[] = ["MEN", "WOMEN", "MASTERS"];

interface Draft {
  name: string;
  exercise_name: string;
  instructions: string;
  equipment_note: string;
  template_code: string;
  cats: Record<StationCategoryCode, { movement: string; equipment: string; kneeRatio: string; maxBreaks: string; validRep: string }>;
}

function toDraft(s: StationConfig): Draft {
  const cats = {} as Draft["cats"];
  for (const c of CATS) {
    const k = s.categories[c];
    cats[c] = {
      movement: k.movement,
      equipment: JSON.stringify(k.equipment ?? {}),
      kneeRatio: String((k.rule as Record<string, unknown>).knee_ratio ?? ""),
      maxBreaks: String((k.rule as Record<string, unknown>).max_breaks ?? ""),
      validRep: String((k.rule as Record<string, unknown>).valid_rep ?? ""),
    };
  }
  return { name: s.name, exercise_name: s.exercise_name ?? s.name, instructions: s.instructions ?? "", equipment_note: s.equipment_note ?? "", template_code: s.template_code ?? "", cats };
}

/** Only what changed — the database also rejects anything it does not recognise. */
function toPatch(orig: StationConfig, d: Draft, confirm: boolean): { patch: StationPatch; parseError: string | null } {
  const patch: StationPatch = {};
  const o = toDraft(orig);
  if (d.name !== o.name) patch.name = d.name;
  if (d.exercise_name !== o.exercise_name) patch.exercise_name = d.exercise_name;
  if (d.instructions !== o.instructions) patch.instructions = d.instructions;
  if (d.equipment_note !== o.equipment_note) patch.equipment_note = d.equipment_note;
  if (d.template_code && d.template_code !== o.template_code) patch.template_code = d.template_code;
  const templateChanging = patch.template_code !== undefined;
  const cats: NonNullable<StationPatch["categories"]> = {};
  for (const c of CATS) {
    const a = d.cats[c], b = o.cats[c];
    const entry: { movement?: string; equipment?: Record<string, unknown>; rule?: Record<string, unknown> } = {};
    if (a.movement !== b.movement && !templateChanging) entry.movement = a.movement;
    if (a.equipment !== b.equipment && !templateChanging) {
      try { entry.equipment = JSON.parse(a.equipment) as Record<string, unknown>; } catch { return { patch, parseError: `${c}: equipment must be valid JSON like {"load_kg": 20}` }; }
    }
    const rule: Record<string, unknown> = {};
    if (a.kneeRatio !== b.kneeRatio && a.kneeRatio !== "" && !templateChanging) rule.knee_ratio = Number(a.kneeRatio);
    if (a.maxBreaks !== b.maxBreaks && a.maxBreaks !== "" && !templateChanging) rule.max_breaks = Number(a.maxBreaks);
    if (a.validRep !== b.validRep && a.validRep !== "" && !templateChanging) rule.valid_rep = a.validRep;
    if (Object.keys(rule).length) entry.rule = rule;
    if (Object.keys(entry).length) cats[c] = entry;
  }
  if (Object.keys(cats).length) patch.categories = cats;
  if (confirm) patch.confirm_scoring_change = true;
  return { patch, parseError: null };
}

export default function StationSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status, access, event, error } = useAdminAccess(slug);
  const eventId = event?.id;
  const [view, setView] = useState<StationConfigView | null>(null);
  const [selected, setSelected] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<StationPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const r = await getRaceModule().stationConfig.get(eventId);
    if (r.isOk) setView(r.value); else setProblem(plainError(r.error.message));
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  const station = useMemo(() => view?.stations.find((s) => s.number === selected) ?? null, [view, selected]);
  useEffect(() => {
    if (station) { setDraft(toDraft(station)); setPreview(null); setConfirm(false); setReason(""); setProblem(null); }
  }, [station]);

  const mod = getRaceModule();
  const built = station && draft ? toPatch(station, draft, confirm) : null;
  const dirty = !!built && (Object.keys(built.patch).filter((k) => k !== "confirm_scoring_change").length > 0 || built.parseError !== null);
  const readOnly = !view || !view.can_edit;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setCat = (c: StationCategoryCode, patch: Partial<Draft["cats"][StationCategoryCode]>) => setDraft((d) => (d ? { ...d, cats: { ...d.cats, [c]: { ...d.cats[c], ...patch } } } : d));

  async function doPreview() {
    if (!eventId || !built) return;
    setProblem(null); setSaved(null);
    if (built.parseError) { setProblem(built.parseError); return; }
    setBusy("preview");
    const r = await mod.stationConfig.preview(eventId, selected, built.patch);
    setBusy(null);
    if (r.isErr) setProblem(plainError(r.error.message)); else setPreview(r.value);
  }
  async function doSave() {
    if (!eventId || !built || built.parseError) { setProblem(built?.parseError ?? null); return; }
    setBusy("save"); setProblem(null); setSaved(null);
    const r = await mod.stationConfig.update(eventId, selected, built.patch, reason);
    setBusy(null);
    if (r.isErr) { setProblem(plainError(r.error.message)); return; }
    setSaved(`Saved — configuration version ${r.value.version}.`);
    await load();
  }
  async function doReset() {
    if (!eventId) return;
    setBusy("reset"); setProblem(null); setSaved(null);
    const r = await mod.stationConfig.reset(eventId, selected, reason || "reset to the rulebook default");
    setBusy(null);
    if (r.isErr) { setProblem(plainError(r.error.message)); return; }
    setSaved(`Station ${selected} is back to the rulebook default — version ${r.value.version}.`);
    await load();
  }

  const tplFor = (code: string) => view?.templates.find((t) => t.code === code);
  const currentScoring = station ? station.categories.MEN.scoring_type : "";

  return (
    <AdminShell slug={slug} current="stations" title="Station & Exercise Settings" gate={{ status, error, ready: access !== null, notFound: access !== null && !event }}>
      {event && view && station && draft ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="race-display text-3xl">{event.name}</h1>
            <RaceBadge>{view.event.status}</RaceBadge>
            <RaceBadge tone={view.locked ? "red" : "white"}>{view.locked ? "FROZEN" : `Config v${view.version ?? 1}`}</RaceBadge>
          </div>
          {view.locked ? <RaceNotice>{view.lock_reason} Version {view.frozen_version} is the configuration this race runs with; it cannot be changed.</RaceNotice> : null}
          {!view.locked && !view.can_edit ? <RaceNotice>Only the Event Manager can change station settings. You can read them.</RaceNotice> : null}

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stations">
            {view.stations.map((s) => (
              <button key={s.number} role="tab" aria-selected={s.number === selected} data-testid={`pick-${s.number}`} className={`race-btn race-btn--sm ${s.number === selected ? "" : "race-btn--ghost"}`} onClick={() => setSelected(s.number)}>
                {String(s.number).padStart(2, "0")} · {s.name}
              </button>
            ))}
          </div>

          <div className="race-card flex flex-col gap-4" data-testid="station-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <RaceInput id="num" label="Station number" value={String(station.number).padStart(2, "0")} readOnly hint="Fixed: the race route order (3:00 work + 0:30 transition per station)." />
              <RaceInput id="name" label="Station display name" value={draft.name} maxLength={60} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
              <RaceInput id="ex" label="Exercise name" value={draft.exercise_name} maxLength={80} disabled={readOnly} onChange={(e) => set({ exercise_name: e.target.value })} hint="A name change never changes scoring." />
              <RaceSelect id="tpl" label="Exercise type / movement template" value={draft.template_code} disabled={readOnly || !!station.locked_rule} onChange={(e) => set({ template_code: e.target.value })}
                hint={station.locked_rule ?? `Current scoring: ${currentScoring}. Changing the type replaces the scoring configuration of all three categories.`}>
                <option value="">{station.template_code ? "(rulebook default)" : "Rulebook default"}</option>
                {view.templates.map((t) => (
                  <option key={t.code} value={t.code} disabled={!t.supported || !station.template_options.includes(t.code)}>
                    {t.label}{!t.supported ? " — UNSUPPORTED" : !station.template_options.includes(t.code) ? " — not for this station" : ""}
                  </option>
                ))}
              </RaceSelect>
            </div>
            {draft.template_code && tplFor(draft.template_code) ? <p className="text-sm" style={{ color: "var(--race-muted)" }}>{tplFor(draft.template_code)!.description} Judge actions: {tplFor(draft.template_code)!.judge_actions.join(", ")}.</p> : null}
            <RaceTextArea id="ins" label="Short instructions (judge + screen)" value={draft.instructions} maxLength={600} disabled={readOnly} onChange={(e) => set({ instructions: e.target.value })} />
            <RaceInput id="eq" label="Equipment required" value={draft.equipment_note} maxLength={200} disabled={readOnly} onChange={(e) => set({ equipment_note: e.target.value })} />

            <div className="flex flex-col gap-3">
              <p className="race-label">Per category (scoring configuration)</p>
              {CATS.map((c) => {
                const k = station.categories[c];
                const rule = k.rule as Record<string, unknown>;
                return (
                  <div key={c} className="race-card race-card--flat grid gap-3 sm:grid-cols-2" data-testid={`cat-${c}`}>
                    <div className="flex items-center gap-2 sm:col-span-2"><strong>{c}</strong><RaceBadge>{k.scoring_type}</RaceBadge></div>
                    <RaceInput id={`mv-${c}`} label="Movement" value={draft.cats[c].movement} disabled={readOnly || !!draft.template_code && draft.template_code !== (station.template_code ?? "")} onChange={(e) => setCat(c, { movement: e.target.value })} />
                    <RaceInput id={`eqj-${c}`} label="Equipment (JSON)" value={draft.cats[c].equipment} disabled={readOnly || !!draft.template_code && draft.template_code !== (station.template_code ?? "")} onChange={(e) => setCat(c, { equipment: e.target.value })} />
                    {k.scoring_type === "CONVERTED_REPS" && "knee_ratio" in rule ? <RaceInput id={`kr-${c}`} type="number" min={2} max={6} label="Knee push-ups per 1 score" value={draft.cats[c].kneeRatio} disabled={readOnly} onChange={(e) => setCat(c, { kneeRatio: e.target.value })} hint="Changes scoring — needs confirmation." /> : null}
                    {k.scoring_type === "HOLD_MS" ? <RaceInput id={`mb-${c}`} type="number" min={0} max={10} label="Breaks allowed" value={draft.cats[c].maxBreaks} disabled={readOnly} onChange={(e) => setCat(c, { maxBreaks: e.target.value })} hint="Changes scoring — needs confirmation." /> : null}
                    {k.scoring_type === "REPS" && "valid_rep" in rule ? <RaceInput id={`vr-${c}`} label="What counts as a valid rep" value={draft.cats[c].validRep} disabled={readOnly} onChange={(e) => setCat(c, { validRep: e.target.value })} /> : null}
                  </div>
                );
              })}
            </div>
            <p className="text-sm" style={{ color: "var(--race-muted)" }}>Not editable here, by design: the station number, enabling/disabling a station (every athlete passes all nine), the 3:00 / 0:30 timing, and rank-based scoring.</p>

            {!readOnly ? (
              <>
                <RaceInput id="reason" label="Reason for the change (required to save)" value={reason} onChange={(e) => setReason(e.target.value)} />
                {preview?.scoring_changed || preview?.template_changed || problem?.includes("calculated") ? (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="confirm-scoring" /> I understand this changes how scores are calculated for this event.</label>
                ) : null}
                {problem ? <RaceNotice>{problem}</RaceNotice> : null}
                {saved ? <div className="race-card race-card--flat" role="status" data-testid="saved">{saved}</div> : null}
                <div className="flex flex-wrap gap-3">
                  <RaceButton variant="ghost" disabled={!dirty} isLoading={busy === "preview"} onClick={doPreview} data-testid="preview">Preview</RaceButton>
                  <RaceButton disabled={!dirty || reason.trim() === ""} isLoading={busy === "save"} onClick={doSave} data-testid="save">Save</RaceButton>
                  <RaceButton variant="ghost" disabled={!dirty} onClick={() => { setDraft(toDraft(station)); setPreview(null); setProblem(null); setConfirm(false); }} data-testid="cancel">Cancel</RaceButton>
                  <RaceButton variant="danger" isLoading={busy === "reset"} onClick={doReset} data-testid="reset">Reset to rulebook default</RaceButton>
                </div>
              </>
            ) : null}

            {preview ? (
              <div className="race-card race-card--flat flex flex-col gap-2" data-testid="preview-panel">
                <p className="race-label">Preview — nothing is saved yet</p>
                {preview.errors.map((m) => <RaceNotice key={m}>{m}</RaceNotice>)}
                {preview.conflicts.map((m) => <RaceNotice key={m}>{m}</RaceNotice>)}
                {preview.warnings.map((m) => <p key={m} className="text-sm">⚠ {m}</p>)}
                <p><strong>Judge:</strong> {preview.preview.judge.header}</p>
                <p><strong>Exercise:</strong> {preview.preview.judge.exercise_name}</p>
                {preview.preview.judge.instructions ? <p>{preview.preview.judge.instructions}</p> : null}
                {Object.entries(preview.preview.judge.categories).map(([c, v]) => (
                  <p key={c} className="text-sm">{c}: {v.movement} · {v.scoring_type} · buttons {v.buttons.join(" / ") || "—"}</p>
                ))}
                <p><strong>Station screen:</strong> {preview.preview.screen.station_label} · {preview.preview.screen.station_name}</p>
                <p>{preview.valid ? "Valid — ready to save." : "Not valid — fix the points above."}</p>
              </div>
            ) : null}
          </div>

          <div className="race-card race-card--flat" data-testid="versions">
            <p className="race-label">Version history</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {view.versions.map((v) => (
                <li key={v.version}>v{v.version}{v.frozen ? " · FROZEN at race start" : ""} · {new Date(v.created_at).toLocaleString()} · {v.created_by ?? "system"} · {v.reason ?? ""}</li>
              ))}
            </ul>
          </div>
          <details className="text-sm" style={{ color: "var(--race-muted)" }}>
            <summary>Exercise types</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {view.templates.map((t) => <li key={t.code}><strong>{t.label}</strong> — {t.supported ? `supported (${t.scoring_type})` : `UNSUPPORTED: ${t.unsupported_reason}`}</li>)}
            </ul>
          </details>
        </>
      ) : null}
    </AdminShell>
  );
}
