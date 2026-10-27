// Tests for the timing guard (timingDrift / validateClockMarks) of the independent final-simulation model.   node --test docs/race/scripts/final-model.timing.test.mjs
// The guard never infers a clock reset from timestamps: only explicit, valid reposition markers (artifact: clock_run + clock_marks) can put an action back on an absolute check.
import test from "node:test";
import assert from "node:assert/strict";
import { timingDrift, validateClockMarks, groupMarkerProblems, DRIFT_LIMIT_MS, MARK_KINDS } from "./final-model.mjs";

const cid = (i) => `11111111-aaaa-bbbb-cccc-${String(i).padStart(12, "0")}`;
// rows: { d: drift, at?: scheduled instant, n?, st? } in the order the harness ran them; d === undefined = not in the ledger
const acts = (rows) => rows.map((r, i) => ({ cid: cid(i), n: r.n ?? 1, station: r.st ?? 1, type: "REP", arrival: r.at ?? 100_000, seq: i + 1 }));
const ledger = (rows) => rows.flatMap((r, i) => (r.d === undefined ? [] : [{ id: cid(i), server_ms: (r.at ?? 100_000) + r.d }]));
// marker for the action at index `idx` (it precedes that action: logged_before = idx). kind flush-* names the action; advance / post-flush-0 do not.
const mark = (no, kind, idx, rows, over = {}) => {
  const r = rows[idx] ?? {}, instant = r.at ?? 100_000, flush = kind.startsWith("flush");
  return { no, id: `R1:${no}`, run: "R1", kind, step: no, logged_before: idx, instant, before_ms: instant - 5, after_ms: instant + 3, n: flush ? r.n ?? 1 : null, station: flush ? r.st ?? 1 : null, cid: flush ? cid(idx) : null, ...over };
};
const sys = (rows, marks = [], run) => ({ act_log: acts(rows), ledger: ledger(rows), clock_marks: marks, clock_run: run ?? { run: "R1", markers: marks.length, travel_calls: marks.length } });
const one = (scheduled, recorded) => sys([{ at: scheduled, d: recorded - scheduled }]);
const ramp = (n, to, who = {}) => Array.from({ length: n }, (_, i) => ({ ...who, d: Math.round((to * (i + 1)) / n) }));   // smooth flush ending `to` ms behind
const up = (from, to, n) => Array.from({ length: n }, (_, i) => ({ d: Math.round(from + ((to - from) * (i + 1)) / n) }));

// the standard picture: a 60-action flush ending 1500 ms behind, then the clock is put back on the instant and the next action is at +100
const FLUSH = ramp(60, 1500);
const RESET = [...FLUSH, { d: 100 }];
const IDX = 60;

test("the limit is exactly one second", () => assert.equal(DRIFT_LIMIT_MS, 1000));

// ---- first action at an instant: absolute -------------------------------------------------------------------------------------------
test("no drift passes", () => assert.equal(timingDrift(one(36_900, 36_900)).violations.length, 0));
test("exactly +1000 ms passes", () => assert.equal(timingDrift(one(36_900, 37_900)).violations.length, 0));
test("exactly -1000 ms passes", () => assert.equal(timingDrift(one(36_900, 35_900)).violations.length, 0));
test("+1001 ms fails", () => assert.equal(timingDrift(one(36_900, 37_901)).violations.length, 1));
test("-1001 ms fails", () => assert.equal(timingDrift(one(36_900, 35_899)).violations.length, 1));

test("the observed N19 stall (-2373 ms) is reported with everything needed to find it", () => {
  const r = timingDrift(one(47_000, 44_627));
  assert.deepEqual(r.violations, [{ n: 1, station: 1, type: "REP", cid: cid(0), seq: 1, expected: 47_000, actual: 44_627, drift: -2373, rule: "absolute", marker: null }]);
  assert.equal(r.maxAbs, 2373);
});
test("a genuine +2373 ms jump is detected", () => assert.equal(timingDrift(sys([{ d: 10 }, { d: 2383 }])).violations.length, 1));
test("positive drift keeps its sign", () => assert.equal(timingDrift(one(10_000, 12_500)).violations[0].drift, 2500));

// ---- later actions of the same instant (serial flush): relative to the action before ------------------------------------------------
test("a smooth 181-action flush that ends 1.5 s behind the instant passes (and reports that drift)", () => {
  const r = timingDrift(sys(Array.from({ length: 181 }, (_, i) => ({ at: 5_500_000, d: 5 + i * 8 }))));
  assert.equal(r.violations.length, 0); assert.equal(r.maxAbs, 5 + 180 * 8); assert.ok(r.maxAbs > 1000);
});
test("inside a flush, exactly +1000 ms more than the previous action passes", () => assert.equal(timingDrift(sys([{ d: 10 }, { d: 1010 }])).violations.length, 0));
test("inside a flush, +1001 ms more than the previous action fails and says so", () => {
  const r = timingDrift(sys([{ d: 10 }, { d: 1011 }]));
  assert.deepEqual([r.violations.length, r.violations[0].rule, r.violations[0].expected, r.violations[0].actual, r.violations[0].drift], [1, "step", 100_000, 101_011, 1011]);
});
test("inside a flush, a stall of 2373 ms mid-way fails exactly once", () => {
  const r = timingDrift(sys(Array.from({ length: 30 }, (_, i) => ({ d: 10 + i * 8 + (i >= 15 ? 2373 : 0) }))));
  assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(15));
});
test("inside a flush, running behind by less than the limit is fine; being earlier than the previous one by less than the limit is fine", () => assert.equal(timingDrift(sys([{ d: 900 }, { d: 100 }])).violations.length, 0));
test("a new instant is judged absolutely (the recovery after a stall is not a second failure)", () => {
  const r = timingDrift(sys([{ at: 100_000, d: 2400 }, { at: 100_000, d: 2410 }, { at: 110_000, d: 5 }]));
  assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(0));
});
test("an unrecorded action is not matched (and not counted)", () => { const r = timingDrift(sys([{ d: undefined }])); assert.equal(r.checked, 0); assert.equal(r.violations.length, 0); });
test("a custom limit is honoured, the default is not widened", () => {
  assert.equal(timingDrift(one(0, 500), 400).violations.length, 1);
  assert.equal(timingDrift(one(0, 1500)).violations.length, 1);
});

// ---- reposition markers: a timestamp drop is NEVER a reset by itself -----------------------------------------------------------------
test("a timestamp drop WITHOUT a marker is a violation (no reset is inferred)", () => {
  const r = timingDrift(sys(RESET));
  assert.equal(r.violations.length, 1); assert.deepEqual([r.violations[0].cid, r.violations[0].rule, r.violations[0].marker], [cid(IDX), "step", null]);
});
test("a drop with a missing clock_marks / clock_run fails closed (violation + problem)", () => {
  const s = sys(RESET); delete s.clock_marks;
  const r = timingDrift(s); assert.equal(r.violations.length, 1); assert.ok(r.problems.some((p) => p.code === "marks-missing"));
  const t = sys(RESET, [mark(1, "flush-1b", IDX, RESET)]); delete t.clock_run;
  const q = timingDrift(t); assert.ok(q.problems.some((p) => p.code === "run-missing")); assert.equal(q.violations.length, 1);
});
for (const kind of MARK_KINDS) {
  test(`a valid '${kind}' marker exempts exactly the first action it precedes (judged absolutely)`, () => {
    const r = timingDrift(sys(RESET, [mark(1, kind, IDX, RESET)]));
    assert.deepEqual(r.problems, []); assert.equal(r.violations.length, 0); assert.equal(r.markersUsed, 1);
  });
}
test("a valid marker does not hide a genuine +2373 ms jump ON the marked action (absolute rule still applies)", () => {
  const rows = [...FLUSH, { d: 2373 }];
  const r = timingDrift(sys(rows, [mark(1, "flush-1b", IDX, rows)]));
  assert.equal(r.violations.length, 1); assert.deepEqual([r.violations[0].cid, r.violations[0].rule, r.violations[0].marker], [cid(IDX), "absolute", "R1:1"]);
});
test("a genuine +2373 ms jump immediately BEFORE the reposition is detected (and the marked action is still fine)", () => {
  const rows = [...ramp(59, 1500), { d: 1500 + 2373 }, { d: 100 }];       // action 59 stalls, action 60 is the repositioned one
  const r = timingDrift(sys(rows, [mark(1, "post-flush-0", 60, rows)]));
  assert.equal(r.problems.length, 0); assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(59));
});
test("a genuine +2373 ms jump immediately AFTER the reposition is detected", () => {
  const rows = [...RESET, { d: 100 + 2373 }];
  const r = timingDrift(sys(rows, [mark(1, "flush-1b", IDX, rows)]));
  assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(IDX + 1)); assert.equal(r.violations[0].rule, "step");
});
test("ONE marker cannot exempt multiple actions: a second drop right after the marked one is still a violation", () => {
  const rows = [...ramp(60, 1500), { d: 100 }, ...up(100, 1500, 60), { d: 100 }];    // two drops; one marker for the first
  const r = timingDrift(sys(rows, [mark(1, "flush-1b", 60, rows)]));
  assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(121)); assert.equal(r.markersUsed, 1);
});
test("two markers, two drops: each exempts only its own action", () => {
  const rows = [...ramp(60, 1500), { d: 100 }, ...up(100, 1500, 60), { d: 100 }];
  const r = timingDrift(sys(rows, [mark(1, "flush-1b", 60, rows), mark(2, "post-flush-0", 121, rows)]));
  assert.deepEqual([r.problems.length, r.violations.length, r.markersUsed], [0, 0, 2]);
});

// ---- a marker for the wrong action cannot exempt this one ------------------------------------------------------------------------------
test("a flush marker naming another athlete does not exempt", () => { const r = timingDrift(sys(RESET, [mark(1, "flush-1b", IDX, RESET, { n: 2 })])); assert.equal(r.violations.length, 1); assert.equal(r.markersUsed, 0); });
test("a flush marker naming another station does not exempt", () => { const r = timingDrift(sys(RESET, [mark(1, "flush-1b", IDX, RESET, { station: 5 })])); assert.equal(r.violations.length, 1); });
test("a flush marker naming another action id does not exempt", () => { const r = timingDrift(sys(RESET, [mark(1, "flush-1b", IDX, RESET, { cid: cid(7) })])); assert.equal(r.violations.length, 1); });
test("a marker for another sequence position does not exempt the drop (one too early / one too late)", () => {
  // the drop action stays a violation; a misplaced marker only puts a different action on the absolute check (stricter, never looser)
  const early = timingDrift(sys(RESET, [mark(1, "post-flush-0", IDX - 1, RESET)]));
  assert.ok(early.violations.some((v) => v.cid === cid(IDX) && v.rule === "step"));
  const rows = [...RESET, { d: 110 }];
  const late = timingDrift(sys(rows, [mark(1, "post-flush-0", IDX + 1, rows)]));
  assert.ok(late.violations.some((v) => v.cid === cid(IDX) && v.rule === "step"));
});
test("a marker for another instant does not exempt", () => { const r = timingDrift(sys(RESET, [mark(1, "post-flush-0", IDX, RESET, { instant: 99_000, after_ms: 99_003 })])); assert.equal(r.violations.length, 1); assert.equal(r.markersUsed, 0); });

// ---- invalid marker data fails closed: NO marker is trusted ----------------------------------------------------------------------------
const closed = (name, marks, run, code) => test(`fails closed: ${name}`, () => {
  const r = timingDrift(sys(RESET, marks, run));
  assert.ok(r.problems.some((p) => p.code === code), `expected problem ${code}, got ${JSON.stringify(r.problems)}`);
  assert.equal(r.violations.length, 1); assert.equal(r.markersUsed, 0);     // the otherwise valid marker is ignored, so the drop is a violation
});
{
  const m = (extra = {}) => mark(1, "flush-1b", IDX, RESET, extra);
  closed("a duplicate marker (same id twice)", [m(), { ...m(), no: 2 }].map((x, i) => ({ ...x, id: "R1:1" })), undefined, "duplicate");
  closed("a duplicate marker position (same kind/step/position/instant, different id)", [m(), { ...m(), no: 2, id: "R1:2" }], undefined, "duplicate");
  closed("reordered markers (no out of order)", [mark(2, "advance", 0, RESET), m({ no: 1, id: "R1:1" })], undefined, "reordered");
  closed("markers that go backwards in the action sequence", [m({ no: 1, id: "R1:1" }), mark(2, "advance", 3, RESET, { step: 2 })], undefined, "reordered");
  closed("a gap in the marker numbers", [m({ no: 2, id: "R1:2" })], undefined, "reordered");
  closed("a marker from another run", [m({ run: "R9", id: "R9:1" })], undefined, "other-run");
  closed("a wrong marker identity", [m({ id: "R1:77" })], undefined, "identity");
  closed("an unknown flush boundary kind", [m({ kind: "flush-9" })], undefined, "kind");
  closed("a stale marker (precedes an action that does not exist)", [m(), mark(2, "advance", 500, RESET, { step: 9 })], undefined, "stale");
  closed("a malformed marker (missing field)", [(({ instant, ...rest }) => rest)(m())], undefined, "malformed");
  closed("a malformed marker (wrong type)", [m({ logged_before: "60" })], undefined, "malformed");
  closed("a null marker", [null], undefined, "malformed");
  closed("a flush marker that does not name its action", [m({ cid: null })], undefined, "binding");
  closed("an advance marker that names an action", [mark(1, "advance", IDX, RESET, { cid: cid(IDX), n: 1, station: 1 })], undefined, "binding");
  closed("a clock that is not on the instant after the reposition", [m({ after_ms: 100_000 + 5000 })], undefined, "not-on-instant");
  closed("marker count differs from clock_run.markers", [m()], { run: "R1", markers: 2, travel_calls: 1 }, "count");
  closed("a travel_to call without a marker (independent counter)", [m()], { run: "R1", markers: 1, travel_calls: 2 }, "count");
}
test("validateClockMarks: a clean artifact has no problems and returns its markers", () => {
  const v = validateClockMarks(sys(RESET, [mark(1, "advance", 0, RESET), mark(2, "flush-1b", IDX, RESET)]));
  assert.deepEqual(v.problems, []); assert.equal(v.marks.length, 2);
});

// ---- diagnostics: a cascade of marker problems must stay short and must not hide the violations ---------------------------------------------
test("groupMarkerProblems: one entry per code with count, first and last message", () => {
  const g = groupMarkerProblems([{ code: "reordered", message: "a" }, { code: "count", message: "c" }, { code: "reordered", message: "b" }, { code: "reordered", message: "z" }]);
  assert.deepEqual(g, [{ code: "reordered", count: 3, first: "a", last: "z" }, { code: "count", count: 1, first: "c", last: "c" }]);
  assert.deepEqual(groupMarkerProblems([]), []);
});
test("a deleted marker in a long run cascades into thousands of problems, which collapse to a few lines — and the violation is still reported", () => {
  const rows = [...ramp(60, 1500), { d: 100 }];
  const marks = Array.from({ length: 3000 }, (_, i) => mark(i + 1, "advance", 0, rows, { step: 1 }));    // 3000 markers, all in front of action 0
  marks.splice(1500, 1);                                                                                       // one deleted, numbering not repaired
  const r = timingDrift(sys(rows, marks, { run: "R1", markers: marks.length, travel_calls: marks.length + 1 }));
  assert.ok(r.problems.length > 1000);
  const groups = groupMarkerProblems(r.problems);
  assert.ok(groups.length <= 3, JSON.stringify(groups.map((g) => g.code)));
  assert.ok(groups.find((g) => g.code === "reordered").first.includes("position 1501"));                      // still names where the numbering broke
  assert.equal(r.violations.length, 1); assert.equal(r.violations[0].cid, cid(60));                           // the genuine unmarked drop is still a violation
});
