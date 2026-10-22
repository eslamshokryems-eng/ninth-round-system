// Boundary tests for the timing guard (timingDrift) of the independent final-simulation model.   node --test docs/race/scripts/final-model.timing.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { timingDrift, DRIFT_LIMIT_MS } from "./final-model.mjs";

const cid = (i) => `11111111-aaaa-bbbb-cccc-${String(i).padStart(12, "0")}`;
// rows: [scheduled, recorded] in the order the harness ran them (an omitted recorded = not in the ledger)
const sysOf = (rows) => ({
  act_log: rows.map(([arrival], i) => ({ cid: cid(i), n: 19, station: 1, type: "HOLD_START", arrival })),
  ledger: rows.flatMap(([, rec], i) => (rec === undefined ? [] : [{ id: cid(i), server_ms: rec }])),
});
const one = (scheduled, recorded) => sysOf([[scheduled, recorded]]);

test("the limit is exactly one second", () => assert.equal(DRIFT_LIMIT_MS, 1000));

// ---- first action at an instant: absolute ----------------------------------------------------------------------------------------------
test("no drift passes", () => assert.equal(timingDrift(one(36_900, 36_900)).violations.length, 0));
test("exactly +1000 ms passes", () => assert.equal(timingDrift(one(36_900, 37_900)).violations.length, 0));
test("exactly -1000 ms passes", () => assert.equal(timingDrift(one(36_900, 35_900)).violations.length, 0));
test("+1001 ms fails", () => assert.equal(timingDrift(one(36_900, 37_901)).violations.length, 1));
test("-1001 ms fails", () => assert.equal(timingDrift(one(36_900, 35_899)).violations.length, 1));

test("the observed N19 stall (-2373 ms) is reported with everything needed to find it", () => {
  const r = timingDrift(one(47_000, 44_627));
  assert.deepEqual(r.violations, [{ n: 19, station: 1, type: "HOLD_START", cid: cid(0), expected: 47_000, actual: 44_627, drift: -2373, rule: "absolute" }]);
  assert.equal(r.maxAbs, 2373);
});
test("positive drift keeps its sign", () => assert.equal(timingDrift(one(10_000, 12_500)).violations[0].drift, 2500));

// ---- later actions of the same instant (serial flush): relative to the action before ---------------------------------------------------
test("a smooth 181-action flush that ends 1.5 s behind the instant passes (and reports that drift)", () => {
  const r = timingDrift(sysOf(Array.from({ length: 181 }, (_, i) => [5_500_000, 5_500_000 + 5 + i * 8])));
  assert.equal(r.violations.length, 0);
  assert.equal(r.maxAbs, 5 + 180 * 8);
  assert.ok(r.maxAbs > 1000);
});
test("inside a flush, exactly +1000 ms more than the previous action passes", () => assert.equal(timingDrift(sysOf([[100_000, 100_010], [100_000, 101_010]])).violations.length, 0));
test("inside a flush, +1001 ms more than the previous action fails and says so", () => {
  const r = timingDrift(sysOf([[100_000, 100_010], [100_000, 101_011]]));
  assert.equal(r.violations.length, 1);
  assert.deepEqual([r.violations[0].rule, r.violations[0].expected, r.violations[0].actual, r.violations[0].drift], ["step", 100_000, 101_011, 1011]);
});
test("inside a flush, a stall of 2373 ms mid-way fails once", () => {
  const rows = Array.from({ length: 30 }, (_, i) => [200_000, 200_000 + 10 + i * 8 + (i >= 15 ? 2373 : 0)]);
  const r = timingDrift(sysOf(rows));
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].cid, cid(15));
});
test("inside a flush, running behind by less than the limit is fine, and ahead of the previous one is not a failure by itself", () => assert.equal(timingDrift(sysOf([[100_000, 100_900], [100_000, 100_100]])).violations.length, 0));
test("a clock repositioned at the same instant starts a new run: judged absolutely (+104 passes, -1001 fails)", () => {
  const ramp = Array.from({ length: 181 }, (_, i) => [5_500_000, 5_500_000 + 5 + i * 8]);   // ends ~1.4 s behind
  assert.equal(timingDrift(sysOf([...ramp, [5_500_000, 5_500_104]])).violations.length, 0);
  const r = timingDrift(sysOf([...ramp, [5_500_000, 5_498_999]]));
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].rule, "absolute");
});
test("a new instant is judged absolutely again (the recovery after a stall is not a second failure)", () => {
  const r = timingDrift(sysOf([[100_000, 102_400], [100_000, 102_410], [110_000, 110_005]]));
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].cid, cid(0));
});

test("an unrecorded action is not matched (and not counted)", () => { const r = timingDrift(one(10_000, undefined)); assert.equal(r.checked, 0); assert.equal(r.violations.length, 0); });
test("a custom limit is honoured, the default is not widened", () => {
  assert.equal(timingDrift(one(0, 500), 400).violations.length, 1);
  assert.equal(timingDrift(one(0, 1500)).violations.length, 1);
});
