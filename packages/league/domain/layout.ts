import { LeagueError } from "./errors";

/**
 * THE NINTH League — station layouts: the pure rules. A weekly challenge may have its OWN workout: 1–20 League stations, each with 1–5 exercises and one typed result.
 * A judge records one value per station; their SUM is the attempt's value and everything after that (review, correction, points, standings) is the existing League.
 *
 * This file is the TypeScript twin of race_league_validate_layout / race_league_station_total in
 * supabase-race/proposed/league/20261101000002_race_league_stations.sql. The ORDER of the checks and every message are identical; layout-cases.json pins the two
 * together (this package's tests and harness suite 41 run the same cases). The database is the authority — this exists for fast feedback and for the in-memory gateway.
 *
 * Nothing here imports the race engine: a League station is not a race station.
 */

/** Result types that can be validated AND ranked unambiguously as a SUM. LOAD (total or heaviest lift?) and mixed types (a composite score) are refused, not guessed. */
export type LayoutResultType = "REPS" | "TIME" | "DISTANCE" | "COMPLETION";
export const LAYOUT_RESULT_TYPES: readonly LayoutResultType[] = ["REPS", "TIME", "DISTANCE", "COMPLETION"];
export const MAX_LAYOUT_STATIONS = 20;
export const MAX_STATION_EXERCISES = 5;
export const MAX_STATION_VALUE = 1_000_000;

/** What the challenge's metric must be for a layout of this result type (a COMPLETION layout ranks the NUMBER of stations done: NUMERIC / count). */
export function layoutMetricOk(type: string, kind: string, unit: string): boolean {
  switch (type) {
    case "REPS": return kind === "REPS" && unit === "reps";
    case "TIME": return kind === "TIME" && (unit === "s" || unit === "ms");
    case "DISTANCE": return kind === "DISTANCE" && (unit === "m" || unit === "km");
    case "COMPLETION": return kind === "NUMERIC" && unit === "count";
    default: return false;
  }
}

/** The wire/storage form (what the database accepts and stores): snake_case keys, positions assigned. */
export interface WireExercise {
  readonly position: number;
  readonly name: string;
  readonly standard: string;
  readonly equipment: string;
  readonly target: string;
}
export interface WireStation {
  readonly position: number;
  readonly name: string;
  readonly max_value: number | null;
  readonly exercises: readonly WireExercise[];
}
export interface WireLayout {
  readonly result_type: LayoutResultType;
  readonly stations: readonly WireStation[];
}

/** The screens' form (camelCase), as read from getLayout. */
export interface LayoutExercise {
  readonly position: number;
  readonly name: string;
  readonly standard: string;
  readonly equipment: string;
  readonly target: string;
}
export interface LayoutStation {
  readonly position: number;
  readonly name: string;
  /** Per-station cap, or null for none. */
  readonly maxValue: number | null;
  readonly exercises: readonly LayoutExercise[];
}
export interface LayoutVersionInfo {
  readonly version: number;
  readonly createdAt: string;
  readonly reason: string;
}
export interface StationLayout {
  readonly id: string;
  readonly challengeId: string;
  readonly version: number;
  readonly resultType: LayoutResultType;
  readonly reason: string;
  readonly createdAt: string;
  readonly stations: readonly LayoutStation[];
  readonly versions: readonly LayoutVersionInfo[];
}
/** What an administrator submits (the screens' draft). Absent optional text = ''. */
export interface StationLayoutInput {
  readonly resultType: LayoutResultType;
  readonly stations: readonly {
    readonly name: string;
    readonly maxValue?: number | null;
    readonly exercises: readonly { readonly name: string; readonly standard?: string; readonly equipment?: string; readonly target?: string }[];
  }[];
}
/** One recorded value per station. */
export interface StationValue {
  readonly position: number;
  readonly value: number;
}
export interface StationBreakdownRow {
  readonly attemptId: string;
  readonly participantId: string;
  readonly displayName: string;
  readonly attemptNo: number;
  readonly status: string;
  readonly value: number;
  readonly layoutVersion: number | null;
  readonly stations: readonly { readonly position: number; readonly name: string; readonly value: number }[];
}

function bad(message: string): never {
  throw new LeagueError("LEAGUE_INVALID", message);
}

const SPACES = /[ \t\n\v\f\r]+/g;
const squash = (s: string): string => s.replace(SPACES, " ").replace(/^ +| +$/g, "");
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** A control character: below U+0020 or DEL (the SQL twin uses [[:cntrl:]]). */
function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}
const textBad = (s: string): boolean => hasControl(s) || /[<>]/.test(s);
const nameBad = (s: string | null, max: number): boolean => s === null || s.length < 1 || s.length > max || textBad(s) || /^[=+@-]/.test(s);
const threeDecimals = (v: number): boolean => Math.round(v * 1000) / 1000 === v;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Validate a proposed layout against the challenge's metric and return it NORMALIZED (positions assigned, text trimmed and single-spaced, absent text = ''). Throws LEAGUE_INVALID. */
export function normalizeLayout(raw: unknown, metric: { readonly kind: string; readonly unit: string }): WireLayout {
  if (!isObject(raw)) bad("the layout must be an object");
  for (const k of Object.keys(raw)) if (k !== "result_type" && k !== "stations") bad(`unknown layout field ${k}`);
  const type = raw.result_type;
  if (typeof type !== "string" || !(LAYOUT_RESULT_TYPES as readonly string[]).includes(type)) bad("the result type must be REPS, TIME, DISTANCE or COMPLETION");
  if (!layoutMetricOk(type as string, metric.kind, metric.unit)) bad(`a ${type} layout does not match this challenge (${metric.kind} in ${metric.unit})`);
  const stations = raw.stations;
  if (!Array.isArray(stations) || stations.length < 1 || stations.length > MAX_LAYOUT_STATIONS) bad("a layout needs 1 to 20 stations");
  const out: WireStation[] = [];
  (stations as unknown[]).forEach((st, idx) => {
    const i = idx + 1;
    if (!isObject(st)) bad(`station ${i} must be an object`);
    for (const k of Object.keys(st)) if (k !== "name" && k !== "max_value" && k !== "exercises") bad(`unknown field ${k} in station ${i}`);
    const name = typeof st.name === "string" ? squash(st.name) : null;
    if (nameBad(name, 60)) bad(`station ${i}: the name must be 1 to 60 characters, without < > or control characters, and cannot start with = + - @`);
    let cap: number | null = null;
    if ("max_value" in st && st.max_value !== null) {
      if (!num(st.max_value)) bad(`station ${i}: the cap must be a number above 0 and up to 1000000, with at most three decimals`);
      if (type === "COMPLETION") bad(`station ${i}: a completion station has no cap`);
      cap = st.max_value;
      if (cap <= 0 || cap > MAX_STATION_VALUE || !threeDecimals(cap)) bad(`station ${i}: the cap must be a number above 0 and up to 1000000, with at most three decimals`);
      if (type === "REPS" && !Number.isInteger(cap)) bad(`station ${i}: a repetition cap must be a whole number`);
    }
    const exercises = st.exercises;
    if (!Array.isArray(exercises) || exercises.length < 1 || exercises.length > MAX_STATION_EXERCISES) bad(`station ${i} needs 1 to 5 exercises`);
    const exs: WireExercise[] = [];
    (exercises as unknown[]).forEach((ex, jdx) => {
      const j = jdx + 1;
      if (!isObject(ex)) bad(`exercise ${j} of station ${i} must be an object`);
      for (const k of Object.keys(ex)) if (k !== "name" && k !== "standard" && k !== "equipment" && k !== "target") bad(`unknown field ${k} in exercise ${j} of station ${i}`);
      const exName = typeof ex.name === "string" ? squash(ex.name) : null;
      if (nameBad(exName, 80)) bad(`exercise ${j} of station ${i}: the name must be 1 to 80 characters, without < > or control characters, and cannot start with = + - @`);
      const text: Record<"standard" | "equipment" | "target", string> = { standard: "", equipment: "", target: "" };
      for (const [field, limit] of [["standard", 500], ["equipment", 120], ["target", 120]] as const) {
        const v = ex[field];
        let t = "";
        let wrongType = false;
        if (v !== undefined && v !== null) {
          if (typeof v !== "string") wrongType = true;
          else t = squash(v);
        }
        if (wrongType || t.length > limit || textBad(t)) bad(`exercise ${j} of station ${i}: the ${field} may be up to ${limit} characters, without < > or control characters`);
        text[field] = t;
      }
      exs.push({ position: j, name: exName as string, standard: text.standard, equipment: text.equipment, target: text.target });
    });
    out.push({ position: i, name: name as string, max_value: cap, exercises: exs });
  });
  return { result_type: type as LayoutResultType, stations: out };
}

/**
 * Validate one value per station against a layout and return the SUM (the attempt's value). Same checks, same order, same messages as race_league_station_total.
 * `layout` is anything with the result type and the stations' positions and caps (a WireLayout or a StationLayout read from the gateway).
 */
export function stationTotal(
  layout: { readonly resultType: LayoutResultType; readonly stations: readonly { readonly position: number; readonly maxValue: number | null }[] },
  values: unknown,
): number {
  const n = layout.stations.length;
  if (!Array.isArray(values) || values.length !== n) bad(`this layout has ${n} stations; send exactly one result for each`);
  const seen = new Set<number>();
  let thousandths = 0;
  for (const el of values as unknown[]) {
    if (!isObject(el)) bad("each station result must be an object with a position and a value");
    for (const k of Object.keys(el)) if (k !== "position" && k !== "value") bad(`unknown field ${k} in a station result`);
    const pos = el.position;
    if (!num(pos)) bad(`each station result needs a position from 1 to ${n}`);
    if (!Number.isInteger(pos) || pos < 1 || pos > n) bad(`each station result needs a position from 1 to ${n}`);
    if (seen.has(pos as number)) bad(`station ${pos} appears more than once`);
    seen.add(pos as number);
    const v = el.value;
    if (!num(v)) bad(`station ${pos}: the result must be a number`);
    if (v < 0 || v > MAX_STATION_VALUE) bad(`station ${pos}: the result must be from 0 to 1000000`);
    if (!threeDecimals(v)) bad(`station ${pos}: a result can have at most three decimals`);
    if (layout.resultType === "REPS" && !Number.isInteger(v)) bad(`station ${pos}: repetitions must be a whole number`);
    if (layout.resultType === "COMPLETION" && v !== 0 && v !== 1) bad(`station ${pos}: a completion is 0 (not done) or 1 (done)`);
    const cap = layout.stations.find((s) => s.position === pos)?.maxValue ?? null;
    if (cap !== null && v > cap) bad(`station ${pos}: the result cannot exceed the station cap of ${cap}`);
    thousandths += Math.round(v * 1000);
  }
  const total = thousandths / 1000;
  if (total > MAX_STATION_VALUE) bad("the total cannot exceed 1000000");
  return total;
}

/** The wire form of a draft from the screens. */
export function layoutInputToWire(input: StationLayoutInput): unknown {
  return {
    result_type: input.resultType,
    stations: input.stations.map((s) => ({
      name: s.name,
      ...(s.maxValue === undefined ? {} : { max_value: s.maxValue }),
      exercises: s.exercises.map((e) => ({ name: e.name, ...(e.standard === undefined ? {} : { standard: e.standard }), ...(e.equipment === undefined ? {} : { equipment: e.equipment }), ...(e.target === undefined ? {} : { target: e.target }) })),
    })),
  };
}

/** A normalized wire layout as the screens' layout shape (for the in-memory gateway and for drafting from a stored layout). */
export function wireToStations(w: WireLayout): readonly LayoutStation[] {
  return w.stations.map((s) => ({ position: s.position, name: s.name, maxValue: s.max_value, exercises: s.exercises.map((e) => ({ ...e })) }));
}

/** A stored layout as an editable draft. */
export function layoutToInput(l: Pick<StationLayout, "resultType" | "stations">): StationLayoutInput {
  return {
    resultType: l.resultType,
    stations: l.stations.map((s) => ({ name: s.name, maxValue: s.maxValue, exercises: s.exercises.map((e) => ({ name: e.name, standard: e.standard, equipment: e.equipment, target: e.target })) })),
  };
}

/**
 * After the first attempt the structure is frozen: the number of stations, the result type and each station's cap. Only the exercises (and station names) can be substituted.
 * Returns null when `next` keeps the structure, else the refusal message (identical to the database's).
 */
export function structureChange(current: WireLayout, next: WireLayout): string | null {
  const caps = (l: WireLayout) => JSON.stringify(l.stations.map((s) => s.max_value));
  if (current.result_type !== next.result_type || current.stations.length !== next.stations.length || caps(current) !== caps(next)) {
    return "after the first attempt the number of stations, the result type and the station caps are fixed; only the exercises can be substituted";
  }
  return null;
}

/** Two normalized layouts with identical content. */
export function sameLayout(a: WireLayout, b: WireLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Which exercises were replaced between two normalized layouts, per station (the audit's "replaced_exercises"). */
export function replacedExercises(from: WireLayout, to: WireLayout): { station: number; from: string[]; to: string[] }[] {
  return to.stations.flatMap((s) => {
    const before = from.stations.find((x) => x.position === s.position)?.exercises.map((e) => e.name) ?? null;
    const after = s.exercises.map((e) => e.name);
    return before !== null && JSON.stringify(before) === JSON.stringify(after) ? [] : [{ station: s.position, from: before ?? [], to: after }];
  });
}
