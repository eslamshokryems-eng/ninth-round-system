import { describe, expect, it } from "vitest";
import cases from "./layout-cases.json";
import { LeagueError } from "./errors";
import {
  layoutInputToWire,
  layoutMetricOk,
  layoutToInput,
  normalizeLayout,
  replacedExercises,
  sameLayout,
  stationTotal,
  structureChange,
  wireToStations,
  type LayoutResultType,
  type WireLayout,
} from "./layout";

/**
 * The SAME file (layout-cases.json) is loaded by the SQL harness (tests/harness/league/41_league_layout_parity.sql), which runs race_league_validate_layout and
 * race_league_station_total on every case. TypeScript and SQL must give the same verdict, the same normalized layout and the same message.
 */
interface LayoutCase { name: string; metric: { kind: string; unit: string }; layout: unknown; ok: boolean; normalized?: unknown; error?: string }
interface ValueCase { name: string; group: string; values: unknown; ok: boolean; total?: number; error?: string }
const file = cases as unknown as { layout_cases: LayoutCase[]; groups: Record<string, { metric: { kind: string; unit: string }; layout: WireLayout }>; value_cases: ValueCase[] };

function failure(fn: () => unknown): LeagueError {
  try {
    fn();
  } catch (e) {
    if (e instanceof LeagueError) return e;
    throw e;
  }
  throw new Error("expected a LeagueError");
}
/** A normalized layout back to what a client submits (positions are assigned by the rules, never accepted). */
const submitted = (w: WireLayout) => ({ result_type: w.result_type, stations: w.stations.map((s) => ({ name: s.name, max_value: s.max_value, exercises: s.exercises.map((e) => ({ name: e.name, standard: e.standard, equipment: e.equipment, target: e.target })) })) });
const asLayout = (w: WireLayout) => ({ resultType: w.result_type as LayoutResultType, stations: w.stations.map((s) => ({ position: s.position, maxValue: s.max_value })) });

describe("layout rules: the shared TS/SQL cases (layout validation)", () => {
  it("the shared file is big enough to mean something", () => {
    expect(file.layout_cases.length).toBeGreaterThanOrEqual(60);
    expect(file.value_cases.length).toBeGreaterThanOrEqual(30);
    expect(file.layout_cases.filter((c) => c.ok).length).toBeGreaterThan(8);
    expect(file.layout_cases.filter((c) => !c.ok).length).toBeGreaterThan(40);
  });
  for (const c of file.layout_cases) {
    it(c.name, () => {
      if (c.ok) {
        expect(normalizeLayout(c.layout, c.metric)).toEqual(c.normalized);
      } else {
        const e = failure(() => normalizeLayout(c.layout, c.metric));
        expect(e.code).toBe("LEAGUE_INVALID");
        expect(e.message).toBe(c.error);
      }
    });
  }
  it("a client cannot choose positions: a submitted position is an unknown field", () => {
    const e = failure(() => normalizeLayout({ result_type: "REPS", stations: [{ name: "A", position: 7, exercises: [{ name: "x" }] }] }, { kind: "REPS", unit: "reps" }));
    expect(e.message).toBe("unknown field position in station 1");
  });
  it("normalizing twice changes nothing (idempotent)", () => {
    for (const c of file.layout_cases.filter((x) => x.ok)) {
      const once = normalizeLayout(c.layout, c.metric);
      expect(normalizeLayout(submitted(once), c.metric)).toEqual(once);
    }
  });
});

describe("layout rules: the shared TS/SQL cases (station totals)", () => {
  for (const c of file.value_cases) {
    it(c.name, () => {
      const g = file.groups[c.group];
      if (!g) throw new Error(`unknown group ${c.group}`);
      if (c.ok) expect(stationTotal(asLayout(g.layout), c.values)).toBe(c.total);
      else {
        const e = failure(() => stationTotal(asLayout(g.layout), c.values));
        expect(e.code).toBe("LEAGUE_INVALID");
        expect(e.message).toBe(c.error);
      }
    });
  }
  it("every group layout is itself valid for its metric", () => {
    for (const g of Object.values(file.groups)) expect(normalizeLayout(submitted(g.layout), g.metric)).toEqual(g.layout);
  });
});

describe("layout rules: metric compatibility", () => {
  it("each result type feeds exactly the metric it can be ranked as", () => {
    expect(layoutMetricOk("REPS", "REPS", "reps")).toBe(true);
    expect(layoutMetricOk("TIME", "TIME", "s")).toBe(true);
    expect(layoutMetricOk("TIME", "TIME", "ms")).toBe(true);
    expect(layoutMetricOk("DISTANCE", "DISTANCE", "km")).toBe(true);
    expect(layoutMetricOk("COMPLETION", "NUMERIC", "count")).toBe(true);
  });
  it("LOAD, mixed and everything else is refused", () => {
    expect(layoutMetricOk("LOAD", "LOAD", "kg")).toBe(false);
    expect(layoutMetricOk("MIXED", "NUMERIC", "points")).toBe(false);
    expect(layoutMetricOk("REPS", "TIME", "s")).toBe(false);
    expect(layoutMetricOk("COMPLETION", "NUMERIC", "points")).toBe(false);
    expect(layoutMetricOk("TIME", "TIME", "kg")).toBe(false);
  });
});

describe("layout rules: totals", () => {
  const reps = file.groups.reps3;
  it("the total never depends on the order the results arrive in", () => {
    if (!reps) throw new Error("group missing");
    const base = [{ position: 1, value: 7 }, { position: 2, value: 11 }, { position: 3, value: 13 }];
    const want = stationTotal(asLayout(reps.layout), base);
    for (const perm of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0]]) expect(stationTotal(asLayout(reps.layout), perm.map((i) => base[i]))).toBe(want);
    expect(want).toBe(31);
  });
  it("sums of thousandths are exact (no floating-point drift)", () => {
    const dist = file.groups.dist2;
    if (!dist) throw new Error("group missing");
    let sum = 0;
    for (let n = 1; n <= 200; n++) {
      const a = n / 1000;
      sum = stationTotal(asLayout(dist.layout), [{ position: 1, value: a }, { position: 2, value: 0.007 }]);
      expect(sum).toBe((n + 7) / 1000);
    }
  });
});

describe("layout rules: structure, substitution and the audit helper", () => {
  const metric = { kind: "REPS", unit: "reps" };
  const base = normalizeLayout({ result_type: "REPS", stations: [{ name: "A", max_value: 50, exercises: [{ name: "Pull-up" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, metric);
  it("substituting an exercise keeps the structure", () => {
    const next = normalizeLayout({ result_type: "REPS", stations: [{ name: "A", max_value: 50, exercises: [{ name: "Ring row" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, metric);
    expect(structureChange(base, next)).toBeNull();
    expect(sameLayout(base, next)).toBe(false);
    expect(replacedExercises(base, next)).toEqual([{ station: 1, from: ["Pull-up"], to: ["Ring row"] }]);
  });
  it("renaming a station is content, not structure", () => {
    const next = normalizeLayout({ result_type: "REPS", stations: [{ name: "A2", max_value: 50, exercises: [{ name: "Pull-up" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, metric);
    expect(structureChange(base, next)).toBeNull();
  });
  it("changing the number of stations, the result type or a cap is refused", () => {
    const fewer = normalizeLayout({ result_type: "REPS", stations: [{ name: "A", max_value: 50, exercises: [{ name: "Pull-up" }] }] }, metric);
    const recap = normalizeLayout({ result_type: "REPS", stations: [{ name: "A", max_value: 60, exercises: [{ name: "Pull-up" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, metric);
    const uncap = normalizeLayout({ result_type: "REPS", stations: [{ name: "A", exercises: [{ name: "Pull-up" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, metric);
    const timed = normalizeLayout({ result_type: "TIME", stations: [{ name: "A", max_value: 50, exercises: [{ name: "Pull-up" }] }, { name: "B", exercises: [{ name: "Squat" }] }] }, { kind: "TIME", unit: "s" });
    for (const next of [fewer, recap, uncap, timed]) expect(structureChange(base, next)).toMatch(/fixed; only the exercises can be substituted/);
  });
  it("an identical layout is recognised, an unchanged station is not reported as replaced", () => {
    expect(sameLayout(base, JSON.parse(JSON.stringify(base)) as WireLayout)).toBe(true);
    expect(replacedExercises(base, base)).toEqual([]);
  });
  it("a draft from the screens becomes the wire form without inventing keys", () => {
    const wire = layoutInputToWire({ resultType: "REPS", stations: [{ name: "A", exercises: [{ name: "x" }] }, { name: "B", maxValue: 9, exercises: [{ name: "y", standard: "s" }] }] });
    expect(wire).toEqual({ result_type: "REPS", stations: [{ name: "A", exercises: [{ name: "x" }] }, { name: "B", max_value: 9, exercises: [{ name: "y", standard: "s" }] }] });
  });
  it("a stored layout round-trips to an editable draft and back to the same normalized layout", () => {
    const stations = wireToStations(base);
    const draft = layoutToInput({ resultType: "REPS", stations });
    expect(normalizeLayout(layoutInputToWire(draft), metric)).toEqual(base);
  });
});
