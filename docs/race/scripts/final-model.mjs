// THE NINTH — FINAL END-TO-END VALIDATION: an INDEPENDENT model of the whole event.
//
// Nothing in this file uses the application's code or SQL. It re-implements, from the rulebook (docs/race/01-schema-and-timing-model.md §6/§7),
//   * the roster and the plan of judge actions for a 50-athlete event (deterministic: seeded generator),
//   * the scoring rules of all nine stations,
//   * the rowing evidence rules (OCR classification, confirmation, late confirmation, retake, correction),
//   * station placements, total points and the overall ranking (competition ranking 1,2,2,4; S04 -> S07 technique tie-break; ties kept),
//   * the timing arithmetic (heat anchors, 3:30 interval, 3:00 + 0:30 windows).
// The harness (supabase-race/tests/harness/final_validation.sh) runs the REAL RPCs with this plan, exports what the system did, and
// `node final-model.mjs compare system.json` checks the system against this model.
//
//   node docs/race/scripts/final-model.mjs plan                 > plan.json
//   node docs/race/scripts/final-model.mjs compare system.json  (exit 1 on any mismatch)

import fs from "node:fs";

export const W = 180_000; // work
export const TR = 30_000; // transition
export const I = 210_000; // athlete start interval
export const GAP = 600_000; // heat gap (from the last athlete START)
export const FIRST = 60_000; // START EVENT -> first athlete

// ------------------------------------------------------------------------------------------------------------------------------------
// deterministic randomness
// ------------------------------------------------------------------------------------------------------------------------------------
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = (key) => mulberry(fnv(key))();
const pick = (key, lo, hi) => lo + Math.floor(rnd(key) * (hi - lo + 1));
function uuid(key) {
  const r = mulberry(fnv("uuid:" + key)); const h = () => Math.floor(r() * 0x100000000).toString(16).padStart(8, "0");
  return `${h()}-${h().slice(0, 4)}-4${h().slice(0, 3)}-a${h().slice(0, 3)}-${h()}${h().slice(0, 4)}`;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// the roster
// ------------------------------------------------------------------------------------------------------------------------------------
export const CATEGORIES = ["MEN", "WOMEN", "MASTERS"];
const PAY = ["CASH", "INSTAPAY", "VODAFONE_CASH", "CARD_POS"];
const KNEE_MEN = new Set([2, 4, 12, 22, 24]);

export function buildRoster() {
  const roster = [];
  for (let n = 1; n <= 51; n++) {
    const m = n % 10;
    const category = n === 51 ? "MEN" : m >= 1 && m <= 5 ? "MEN" : m >= 6 && m <= 8 ? "WOMEN" : "MASTERS";
    const gender = category === "MEN" ? "male" : category === "WOMEN" ? "female" : n % 2 === 0 ? "female" : "male";
    const dob = category === "MEN" ? "1990-03-15" : category === "WOMEN" ? "1992-07-01" : "1980-05-20";
    const style = category === "MEN" ? (KNEE_MEN.has(n) ? "KNEE" : "STANDARD") : "KNEE";
    roster.push({
      n, race_number: "N" + String(n).padStart(3, "0"), name: "Athlete " + String(n).padStart(2, "0"), phone: "0155" + String(1000000 + n),
      gender, dob, category, style, pay: n === 51 ? "UNPAID" : n === 7 ? "WAIVED" : PAY[n % 4], heat: n <= 45 ? Math.ceil(n / 9) : n <= 50 ? 6 : null,
    });
  }
  return roster;
}

// What the SCRIPT does to the event (all times are race ms). The expected outcome is derived from these inputs, never from the system.
export const SCRIPT = {
  late_check_in: { 14: 2_970_000, 48: 9_970_000, 49: 9_975_000 },
  absent: [5],
  // WHO is skipped / withdraws is decided by the live race, not by a number: the athlete in the LAST slot of heat 3 is skipped 50 s before their start,
  // and whoever is working at Station 03 at 2:10:50 withdraws (so exactly stations 1–3 are reached). Check-ins are simultaneous, so slots are in arrival order.
  skip: { heat: 3, slot: 8, at: 6_250_000 },
  dnf: { station: 3, at: 7_850_000 },
  close_heat: { 5: 9_000_000 },
  pauses: [[1_200_000, 120_000], [3_900_000, 300_000], [5_100_000, 20_000], [5_400_000, 45_000], [8_000_000, 10_000]],
  pause_reads: [[2_500_000, 90_000], [4_000_000 + 400_000, 60_000]],   // pauses during which devices reconnect and read (reconnect during PAUSE)
};
export const BLACKOUTS = [
  { scope: "MASTER", from: 2_000_000, to: 2_250_000 },          // Master Control's device is gone; judges keep working
  { scope: "STATION:3", from: 2_300_000, to: 2_700_000 },      // the Station 03 judge loses connection
  { scope: "ALL", from: 3_000_000, to: 3_300_000 },            // EVERY device is disconnected for 5 minutes
  { scope: "ALL", from: 1_650_000, to: 1_710_300 },            // ends 0.3 s AFTER a 3:00 boundary (slot 7 of heat 1, Station 01)
  { scope: "ALL", from: 1_440_000, to: 1_499_700 },            // ends 0.3 s BEFORE a 3:00 boundary (slot 6 of heat 1, Station 01)
  { scope: "ALL", from: 5_500_000, to: 5_800_000 },
  { scope: "STATION:9", from: 7_000_000, to: 7_400_000 },      // the rowing judge's phone is offline: offline OCR capture
];
// finish of everyone who is not a DNS / DNF (the DNF/DNS sets follow from the SCRIPT above)
export function isDnsHeat(n) { return n >= 37 && n <= 45; }
/** Skipped / withdrawn athletes are resolved by the live race; compare() fills this from the system's own script log (the CHOICE is the system's, the CONSEQUENCES are checked here). */
export const DYN = { skipped: new Set(), dnf: new Set() };
export function structuralDns(n) { return SCRIPT.absent.includes(n) || n === 49 || isDnsHeat(n); }
export function expectedStatus(n) {
  if (n === 51) return "UNPAID";
  if (structuralDns(n) || DYN.skipped.has(n)) return "DNS";
  if (DYN.dnf.has(n)) return "DNF";
  return "FINISHED";
}

// ------------------------------------------------------------------------------------------------------------------------------------
// the plan of judge actions (offsets are ms from the START of the athlete's window at that station)
// ------------------------------------------------------------------------------------------------------------------------------------
const STATION_KIND = { 1: "REPS", 2: "REPS", 3: "LAPS", 4: "REPS", 5: "REPS", 6: "LAPS", 7: "REPS", 8: "REPS" };
const RANGE = { 1: [18, 26], 2: [24, 40], 3: [4, 9], 4: [25, 40], 5: [15, 30], 6: [3, 9], 7: [25, 40], 8: [8, 16] };

function spread(count, key, lo = 3_000, hi = 168_000) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(Math.round(lo + ((i + 0.5) * (hi - lo)) / count + (rnd(`${key}:${i}`) - 0.5) * 400));
  return out;
}

export function planFor(a, st) {
  if (st === 9) return null;
  if (a.n === 51 || structuralDns(a.n)) return null;       // (a future skip / DNF victim still gets a plan; the live race decides who it is)
  const key = `${a.n}:${st}`;
  const acts = []; let seq = 0;
  const add = (off, type, value = null, extra = {}) => { const cid = uuid(`${key}:${seq++}`); const x = { cid, n: a.n, st, off, type, value, ...extra }; acts.push(x); return x; };
  const masters = a.category === "MASTERS";
  if (st === 1 && masters) {
    // Masters wall-squat hold: every athlete gets a DISTINCT duration (checked below: >= 400 ms apart) so the ranking cannot be shaken by a few ms of clock jitter.
    // plan: start, [break, resume]*, with a 3rd exit for some (which ends the hold)
    const base = 60_000 + (a.n % 10) * 9_000 + a.n * 400;           // distinct per athlete
    const variant = a.n % 4;
    let t = 5_000 + a.n * 700;
    add(t, "HOLD_START");
    if (variant === 0) { /* holds to the end of the window */ }
    if (variant >= 1) { t += base; add(t, "HOLD_BREAK"); t += 3_000; add(t, "HOLD_RESUME"); }
    if (variant >= 2) { t += Math.min(base / 2, 20_000); add(t, "HOLD_BREAK"); t += 3_000; add(t, "HOLD_RESUME"); }
    if (variant === 3) { t += 8_000; add(t, "HOLD_BREAK"); t += 2_000; add(t, "HOLD_RESUME"); }   // the 3rd exit ends the hold; the later RESUME is ignored
    return acts;
  }
  const kind = STATION_KIND[st];
  const [lo, hi] = RANGE[st];
  // identical scores on purpose: a small pool of counts per category -> many ties
  const pool = hi - lo >= 6 ? 6 : hi - lo + 1;
  const count = lo + (fnv(`${a.category}:${st}:${a.n % 7}`) + (a.n % 3)) % pool;
  const offs = spread(count + (st === 6 ? 2 : 0), key);
  if (kind === "REPS") {
    const reps = [];
    for (let i = 0; i < count; i++) reps.push(add(offs[i], "REP"));
    // NO_REPs never count
    const noRep = pick(key + ":no", 0, 3);
    for (let i = 0; i < noRep; i++) add(pick(`${key}:nr:${i}`, 10_000, 160_000), "NO_REP");
    // a VOID cancels one earlier REP (exactly once)
    if (a.n % 5 === 0 && reps.length > 3) add(Math.min(reps[reps.length - 1].off + 1_000, 170_000), "VOID", null, { voids: reps[2].cid });
    if (st === 4 || st === 7) {
      const tech = [7, 7.5, 8, 8, 8.5, 9][fnv(`${a.category}:t:${st}:${a.n % 5}`) % 6];
      if (a.n % 9 === 0) add(W + 5_000, "TECHNIQUE_SCORE", tech - 1.5);        // a first score ...
      add(W + 10_000, "TECHNIQUE_SCORE", tech);                                // ... the last one counts
    }
  } else if (st === 3) {
    for (let i = 0; i < count; i++) add(offs[i], "LAP");
  } else if (st === 6) {
    // laps with F-4 penalties: a penalty cancels the last completed lap; with no lap yet it cancels nothing; laps never go negative
    const early = a.n % 4 === 0;                                           // a penalty BEFORE any lap
    if (early) add(2_000, "PENALTY");
    for (let i = 0; i < count; i++) add(offs[i], "LAP");
    if (a.n % 3 === 0) add(pick(key + ":p1", 120_000, 150_000), "PENALTY");
    if (a.n % 6 === 0) add(pick(key + ":p2", 155_000, 170_000), "PENALTY");
  }
  return acts;
}

// the 3:00 boundary athletes are chosen at run time (whoever is in slot 7/8 of heat 1 at Station 01); the driver adds these extras
export const BOUNDARY_EXTRAS = [
  { tag: "before_end", at: 1_400_000, heat: 1, slot: 6, station: 1, type: "REP", off: W - 1_000 },   // typed 1 s before the end, arrives 0.3 s BEFORE it (offline replay) -> counts
  { tag: "after_end", at: 1_600_000, heat: 1, slot: 7, station: 1, type: "REP", off: W - 1_000 },    // typed 1 s before the end, arrives 0.3 s AFTER it (offline replay) -> held for review
  { tag: "no_grace", at: 2_900_000, heat: 2, slot: 0, station: 5, type: "REP", off: W + 1_000 },     // 1 s AFTER the end, online -> WINDOW_CLOSED, never counted
  { tag: "last_ms", at: 2_900_000, heat: 2, slot: 1, station: 5, type: "REP", off: W - 1_000 },      // 1 s BEFORE the end, online -> counts
];

// ------------------------------------------------------------------------------------------------------------------------------------
// Station 09 evidence plan
// ------------------------------------------------------------------------------------------------------------------------------------
export function rowingFlow(n) {
  if (n === 51 || structuralDns(n)) return null;
  const base = 700 + (fnv(`D:${n % 8}`) % 6) * 10;                   // distances 700..750 — many identical (ties)
  const flow = { n, distance: base, kind: "normal", conf: 0.93 };
  if (n % 7 === 0) { flow.kind = "lowconf"; flow.conf = 0.72; }       // needs the judge's acknowledgement
  if (n % 11 === 0) { flow.kind = "retake"; flow.wrong = base - 500; flow.wrongConf = 0.91; }   // first reading wrong, retaken
  if (n === 18 || n === 33) { flow.kind = "manual"; flow.manual = base + 15; }                  // unreadable x2 -> Master Control correction
  if (n === 36) { flow.kind = "correct_after"; flow.manual = base + 40; }                       // confirmed, later corrected by the Event Manager
  if (n === 13) { flow.kind = "unconfirmed_then_late"; }                                        // confirmed after the transition -> review
  return flow;
}

// Event Manager corrections of ordinary results (applied after the race, with a reason) and the post-publication rowing correction
export const CORRECTIONS = [
  { n: 12, station: 5, field: "official_score", value: 3 },
  { n: 21, station: 4, field: "technique_score", value: 9.5 },
];
export const POST_PUBLICATION_ROWING = { n: 3, distance: 905 };

// ------------------------------------------------------------------------------------------------------------------------------------
// rules (independent of the database)
// ------------------------------------------------------------------------------------------------------------------------------------
export const MAX_BREAKS = 2;
export const OCR = { min: 0.6, review: 0.85, max: 1500 };
export function classifyOcr(distance, confidence) {
  if (distance === null || distance < 0 || distance > OCR.max) return "FAILED";
  if (confidence === null) return "LOW_CONFIDENCE";
  if (confidence < OCR.min) return "FAILED";
  if (confidence < OCR.review) return "LOW_CONFIDENCE";
  return "SUCCEEDED";
}

/** counted = [{id, type, value, ms}] already filtered to what counts (accepted / approved), in server-time order, VOID rows included. */
export function scoreStation({ station, category, style, events, windowEnd }) {
  const voided = new Set(events.filter((e) => e.type === "VOID").map((e) => e.voids));
  const live = events.filter((e) => e.type !== "VOID" && !voided.has(e.id));
  let score = 0, technique = null;
  const hold = station === 1 && category === "MASTERS";
  if (hold) {
    let ms = 0, holding = false, ended = false, since = 0, breaks = 0;
    for (const e of live) {
      if (e.type === "HOLD_START" || e.type === "HOLD_RESUME") { if (!holding && !ended) { holding = true; since = Math.min(e.ms, windowEnd); } }
      else if (e.type === "HOLD_BREAK" && holding) { ms += Math.max(Math.min(e.ms, windowEnd) - since, 0); holding = false; breaks++; if (breaks > MAX_BREAKS) ended = true; }
    }
    if (holding) ms += Math.max(windowEnd - since, 0);
    return { score: ms, technique: null };
  }
  if (station === 3 || station === 6) {
    let laps = 0;
    for (const e of live) {
      if (e.type === "LAP") laps += e.value ?? 1;
      else if (e.type === "PENALTY" && laps > 0) laps -= 1;
    }
    return { score: laps, technique: null };
  }
  let reps = 0;
  for (const e of live) { if (e.type === "REP") reps += e.value ?? 1; if (e.type === "TECHNIQUE_SCORE") technique = e.value; }
  score = station === 2 && style === "KNEE" ? Math.floor(reps / 3) : reps;
  return { score, technique };
}

// ------------------------------------------------------------------------------------------------------------------------------------
// ranking (competition ranking; S04 -> S07 technique; ties kept)
// ------------------------------------------------------------------------------------------------------------------------------------
/** rows: [{n, scores:{1..9}, t4, t7}] -> [{n, place:{1..9}, total, rank}] */
export function rankCategory(rows) {
  const placed = rows.map((r) => ({ n: r.n, t4: r.t4 ?? null, t7: r.t7 ?? null, place: {}, total: 0 }));
  for (let s = 1; s <= 9; s++) {
    for (const p of placed) {
      const mine = rows.find((r) => r.n === p.n).scores[s];
      p.place[s] = 1 + rows.filter((o) => o.scores[s] > mine).length;       // 1 + how many are strictly better: 1,2,2,4
      p.total += p.place[s];
    }
  }
  const better = (a, b) => {                                              // is b strictly better than a?
    if (b.total !== a.total) return b.total < a.total;
    for (const k of ["t4", "t7"]) {
      const x = a[k], y = b[k];
      if (x === y) continue;
      if (y === null) return false;        // a missing score ranks after any score
      if (x === null) return true;
      return y > x;
    }
    return false;                                                          // still level: the tie is kept
  };
  for (const p of placed) p.rank = 1 + placed.filter((o) => better(p, o)).length;
  return placed;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// plan output
// ------------------------------------------------------------------------------------------------------------------------------------
export function buildPlan() {
  const roster = buildRoster();
  const actions = [];
  for (const a of roster) for (let st = 1; st <= 8; st++) { const p = planFor(a, st); if (p) actions.push(...p); }
  const rowing = roster.map((a) => rowingFlow(a.n)).filter(Boolean);
  const expected = {};
  return { roster, script: SCRIPT, blackouts: BLACKOUTS, actions, rowing, boundary: BOUNDARY_EXTRAS, corrections: CORRECTIONS, postPublication: POST_PUBLICATION_ROWING, expected };
}

// ------------------------------------------------------------------------------------------------------------------------------------
// compare: the system's export against the model
// ------------------------------------------------------------------------------------------------------------------------------------
const fails = [];
let checks = 0;
const eq = (got, want, label) => { checks++; if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${label}: system ${JSON.stringify(got)} — model ${JSON.stringify(want)}`); };
const ok = (cond, label) => { checks++; if (!cond) fails.push(label); };
const near = (got, want, tol, label) => { checks++; if (got === null || want === null || Math.abs(got - want) > tol) fails.push(`${label}: system ${got} — model ${want} (±${tol})`); };

/** Applies the acceptance rules to one SENT action. Returns the status the system MUST have given it. */
export function expectedActionStatus(a, win) {
  const perf = ["REP", "NO_REP", "LAP", "PENALTY", "HOLD_START", "HOLD_BREAK", "HOLD_RESUME", "VOID"].includes(a.type);
  const t = a.arrival;
  if (t < win.start) return { status: "REJECTED", code: "NOT_STARTED" };
  if (t < win.end || (!perf && t < win.end + TR)) return { status: "ACCEPTED", code: null };
  if (a.origin === "OFFLINE_QUEUE" && a.device >= win.start && a.device < (perf ? win.end : win.end + TR)) return { status: "PENDING_MASTER_REVIEW", code: null };
  return { status: "REJECTED", code: "WINDOW_CLOSED" };
}

export function compare(sys) {
  const roster = buildRoster();
  for (const e of sys.script_log) { if (e.action === "skip") DYN.skipped.add(e.n); if (e.action === "dnf") DYN.dnf.add(e.n); }
  eq(DYN.skipped.size, 1, "exactly one athlete was skipped"); eq(DYN.dnf.size, 1, "exactly one athlete withdrew");
  const byN = new Map(roster.map((a) => [a.n, a]));
  const win = new Map(); for (const w of sys.windows) win.set(`${w.n}:${w.station}`, w);
  const raceMsOf = (x) => x;

  // ---- 1. who finished / DNF / DNS -------------------------------------------------------------------------------------------------
  const sysStatus = new Map(sys.athletes.map((a) => [a.n, a.status]));
  let finished = 0, dnf = 0, dns = 0;
  for (const a of roster) {
    if (a.n === 51) { eq(sysStatus.get(51) === "FINISHED" || sysStatus.get(51) === "STARTED", false, "N051 (unpaid) never races"); continue; }
    const exp = expectedStatus(a.n);
    const got = sysStatus.get(a.n);
    eq(got, exp === "DNS" ? "MISSED_START" : exp, `race status of N${String(a.n).padStart(3, "0")}`);
    if (exp === "FINISHED") finished++; else if (exp === "DNF") dnf++; else dns++;
  }

  // ---- 2. timing: heat anchors and every window, from the arithmetic ----------------------------------------------------------------
  const anchors = { 1: FIRST, 2: FIRST + 8 * I + GAP, 3: FIRST + 2 * (8 * I + GAP), 4: FIRST + 3 * (8 * I + GAP) };
  for (const h of [1, 2, 3, 4]) eq(sys.heats.find((x) => x.number === h)?.anchor, anchors[h], `heat ${h} anchor`);
  eq(sys.heats.find((x) => x.number === 5)?.status, "CANCELLED", "heat 5 was closed without start");
  eq(sys.heats.find((x) => x.number === 6)?.anchor, anchors[4] + 8 * I + GAP, "heat 6 anchor (the closed heat does not delay it)");
  const starts = new Map();
  for (const w of sys.windows) {
    const heat = sys.athletes.find((a) => a.n === w.n).heat;
    const anchor = sys.heats.find((x) => x.number === heat).anchor;
    const slotStart = anchor + w.slot * I;
    eq(w.start, slotStart + (w.station - 1) * I, `window start N${w.n} S${w.station}`);
    eq(w.end - w.start, W, `work window length N${w.n} S${w.station}`);
    if (w.station === 1) starts.set(w.n, slotStart);
    if (w.locked_ms !== null && w.status !== "NOT_REACHED") eq(w.locked_ms - w.end, TR, `transition length N${w.n} S${w.station}`);
  }
  // start interval: consecutive slots of a heat are exactly 3:30 apart; nobody starts before the plan; nobody has overlapping stations
  // the OFFICIAL start of a slot is anchor + slot * 3:30 (the engine writes it as planned_start_ms); the engine may MATERIALISE it a little later when nobody is
  // reading (that is the lag, recorded in the audit) but it can never materialise it EARLY, and the window arithmetic above is anchored on the plan, not on the lag
  for (const s of sys.slots) {
    const anchor = sys.heats.find((x) => x.number === s.heat).anchor;
    if (s.start_ms === null) { ok(s.status !== "STARTED", `slot ${s.heat}/${s.slot} is STARTED but has no start audit row`); continue; }
    eq(s.start_ms, anchor + s.slot * I, `slot ${s.heat}/${s.slot} start`);
    ok(s.started_ms >= s.start_ms, `slot ${s.heat}/${s.slot} was never started early (planned ${s.start_ms}, recorded ${s.started_ms})`);
  }
  const perStation = new Map();
  for (const w of sys.windows) { if (!perStation.has(w.station)) perStation.set(w.station, []); perStation.get(w.station).push(w); }
  for (const [st, ws] of perStation) { ws.sort((a, b) => a.start - b.start); for (let i = 1; i < ws.length; i++) ok(ws[i].start >= ws[i - 1].end + TR, `no overlap at station ${st}: N${ws[i - 1].n} / N${ws[i].n}`); }

  // ---- 3. raw results: model (from the actions actually SENT) vs system ---------------------------------------------------------------
  const sent = new Map();                                         // "n:station" -> [{...}]
  for (const a of sys.act_log) { const k = `${a.n}:${a.station}`; if (!sent.has(k)) sent.set(k, []); sent.get(k).push(a); }
  const reviewDecision = new Map(sys.review_log.map((r) => [r.cid, r.decision]));
  let statusChecked = 0;
  const modelRaw = new Map();
  for (const a of roster) {
    if (a.n === 51) continue;
    for (let st = 1; st <= 8; st++) {
      const w = win.get(`${a.n}:${st}`); if (!w || w.status === "NOT_REACHED" || w.status === "VOID_DNS") continue;
      const actions = (sent.get(`${a.n}:${st}`) ?? []).slice().sort((x, y) => x.arrival - y.arrival || x.seq - y.seq);
      const counted = [];
      for (const x of actions) {
        const exp = expectedActionStatus(x, w);
        eq(x.sys_status, exp.status, `status of ${x.type} ${x.cid.slice(0, 8)} (N${a.n} S${st}, arrival ${x.arrival - w.start} into the window)`);
        if (exp.code) eq(x.sys_code, exp.code, `rejection code of ${x.cid.slice(0, 8)}`);
        statusChecked++;
        if (exp.status === "ACCEPTED" || (exp.status === "PENDING_MASTER_REVIEW" && reviewDecision.get(x.cid) === "APPROVED")) counted.push({ id: x.cid, type: x.type, value: x.value, ms: x.arrival, voids: x.voids ?? null });
      }
      modelRaw.set(`${a.n}:${st}`, scoreStation({ station: st, category: a.category, style: a.style, events: counted, windowEnd: w.end }));
    }
  }
  // Event Manager corrections applied after the race
  for (const c of sys.corrections_log) { const m = modelRaw.get(`${c.n}:${c.station}`); if (m) { if (c.field === "official_score") m.score = c.value; else m.technique = c.value; } }
  const sysRaw = new Map(sys.results.map((r) => [`${r.n}:${r.station}`, r]));
  let rawChecked = 0;
  for (const [k, m] of modelRaw) {
    const s = sysRaw.get(k); const [n, st] = k.split(":").map(Number);
    ok(!!s, `result row N${n} S${st}`); if (!s) continue;
    const isHold = st === 1 && byN.get(n).category === "MASTERS";
    if (isHold) near(s.score, m.score, 150, `Masters hold ms N${n}`); else eq(s.score, m.score, `raw score N${n} S${st}`);
    if (st === 4 || st === 7) eq(s.technique, m.technique, `technique N${n} S${st}`);
    rawChecked++;
  }

  // ---- 4. Station 09 (evidence) ---------------------------------------------------------------------------------------------------
  const rowModel = new Map();
  for (const a of roster) {
    const flow = rowingFlow(a.n); if (!flow) continue;
    if (!win.get(`${a.n}:9`) || ["VOID_DNS", "NOT_REACHED"].includes(win.get(`${a.n}:9`).status)) continue;   // skipped / withdrawn before Station 09: nobody rows
    const ev = sys.ocr_log.filter((e) => e.n === a.n);
    const state = rowingState(ev, win.get(`${a.n}:9`), reviewDecision, sys.rowing_corrections_log.filter((c) => c.n === a.n));
    rowModel.set(a.n, state);
    // every logged call must have had the outcome the evidence rules prescribe
    for (const e of state.checked) eq(e.got, e.want, `OCR step ${e.step} N${a.n}`);
    const s = sysRaw.get(`${a.n}:9`);
    eq(s?.score ?? null, state.distance, `rowing official distance N${a.n}`);
    eq(s?.evidence_state, state.distance === null ? "PENDING_EVIDENCE" : "OFFICIAL", `rowing evidence state N${a.n}`);
  }

  // ---- 5. rankings ---------------------------------------------------------------------------------------------------------------------
  const rankSystemRaw = (cat) => rankCategory(roster.filter((a) => a.category === cat && expectedStatus(a.n) === "FINISHED").map((a) => ({
    n: a.n, t4: sysRaw.get(`${a.n}:4`)?.technique ?? null, t7: sysRaw.get(`${a.n}:7`)?.technique ?? null,
    scores: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => [s, sysRaw.get(`${a.n}:${s}`)?.score ?? -1])),
  })));
  const rankModelRaw = (cat) => rankCategory(roster.filter((a) => a.category === cat && expectedStatus(a.n) === "FINISHED").map((a) => ({
    n: a.n, t4: modelRaw.get(`${a.n}:4`)?.technique ?? null, t7: modelRaw.get(`${a.n}:7`)?.technique ?? null,
    scores: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((s) => [s, modelRaw.get(`${a.n}:${s}`)?.score ?? -1]).concat([[9, rowModel.get(a.n)?.distance ?? -1]])),
  })));
  const summary = { finished, dnf, dns, categories: {} };
  for (const cat of CATEGORIES) {
    const sysRows = sys.rankings[cat] ?? [];
    const mdl = rankModelRaw(cat);
    const fromSys = rankSystemRaw(cat);
    summary.categories[cat] = { ranked: sysRows.length, ties: new Set(sysRows.filter((r) => sysRows.filter((o) => o.rank === r.rank).length > 1).map((r) => r.rank)).size };
    eq(sysRows.map((r) => r.n).sort((a, b) => a - b), mdl.map((r) => r.n).sort((a, b) => a - b), `${cat}: the ranked athletes are exactly the finishers (DNS and DNF excluded)`);
    for (const r of sysRows) {
      const m = mdl.find((x) => x.n === r.n), s = fromSys.find((x) => x.n === r.n);
      eq(r.placements, m.place, `${cat} N${r.n}: station placements (model raw)`);
      eq(r.total, m.total, `${cat} N${r.n}: total placement points (model raw)`);
      eq(r.rank, m.rank, `${cat} N${r.n}: overall rank (model raw)`);
      eq(r.placements, s.place, `${cat} N${r.n}: station placements (system raw, independent ranking)`);
      eq(r.total, s.total, `${cat} N${r.n}: total (system raw, independent ranking)`);
      eq(r.rank, s.rank, `${cat} N${r.n}: overall rank (system raw, independent ranking)`);
    }
  }
  // dns/dnf never appear
  for (const cat of CATEGORIES) for (const r of sys.rankings[cat] ?? []) ok(expectedStatus(r.n) === "FINISHED", `${cat}: N${r.n} is ranked but is not a finisher`);

  // ---- 6. audit reconstruction: replay the LEDGER alone and rebuild every score -----------------------------------------------------------------
  let replayed = 0;
  const ledger = new Map();
  for (const e of sys.ledger) { const k = `${e.n}:${e.station}`; if (!ledger.has(k)) ledger.set(k, []); ledger.get(k).push(e); }
  for (const [k, evs] of ledger) {
    const [n, st] = k.split(":").map(Number); const a = byN.get(n); const w = win.get(k);
    const counted = evs.filter((e) => e.status === "ACCEPTED" || (e.status === "PENDING_MASTER_REVIEW" && e.review === "APPROVED"))
      .sort((x, y) => x.server_ms - y.server_ms || (x.id < y.id ? -1 : 1)).map((e) => ({ id: e.id, type: e.type, value: e.value, ms: e.server_ms, voids: e.voids }));
    const r = scoreStation({ station: st, category: a.category, style: a.style, events: counted, windowEnd: w.end });
    const s = sysRaw.get(k); const corrected = sys.corrections_log.some((c) => c.n === n && c.station === st);
    if (!corrected) {
      if (st === 1 && a.category === "MASTERS") near(r.score, s.score, 1, `ledger replay (hold) N${n}`); else eq(r.score, s.score, `ledger replay N${n} S${st}`);
      if (st === 4 || st === 7) eq(r.technique, s.technique, `ledger replay technique N${n} S${st}`);
    }
    replayed++;
  }
  return { checks, fails, summary: { ...summary, rawChecked, statusChecked, replayed, windows: sys.windows.length } };
}

/** The evidence rules, applied to the logged sequence of calls for one athlete. Returns the official distance and what every call had to return. */
function rowingState(events, w, reviewDecision, corrections) {
  const checked = []; let attempt = null; let distance = null; let attemptNo = 0; const attempts = [];
  const ordered = events.slice().sort((a, b) => a.arrival - b.arrival || a.seq - b.seq);
  for (const e of ordered) {
    const want = (v) => checked.push({ step: e.step, got: e.sys_result, want: v });
    if (e.step === "capture") {
      if (e.arrival < w.end) { want("ERR:RACE_OCR_TOO_EARLY"); continue; }
      if (distance !== null) { want("ERR:RACE_OCR_ALREADY_CONFIRMED"); continue; }
      if (attempt && ["CAPTURED", "PENDING_REVIEW"].includes(attempt.status)) { want("ERR:RACE_OCR_ATTEMPT_ACTIVE"); continue; }
      attempt = { status: "CAPTURED", ocr: "PENDING", no: ++attemptNo, cid: e.cid }; attempts.push(attempt); want("OK");
    } else if (e.step === "submit") {
      const cls = classifyOcr(e.distance, e.conf); attempt.ocr = cls; attempt.distance = e.distance; want("OK:" + cls);
    } else if (e.step === "confirm") {
      if (attempt.status === "CONFIRMED") { want("ERR:RACE_OCR_ALREADY_CONFIRMED"); continue; }
      if (attempt.ocr === "FAILED") { want("ERR:RACE_OCR_UNREADABLE"); continue; }
      if (attempt.ocr === "LOW_CONFIDENCE" && !e.ack) { want("ERR:RACE_OCR_LOW_CONFIDENCE"); continue; }
      if (e.arrival >= w.end + TR) { attempt.status = "PENDING_REVIEW"; want("OK:PENDING_REVIEW"); }
      else { attempt.status = "CONFIRMED"; distance = attempt.distance; want("OK:CONFIRMED"); }
    } else if (e.step === "retake") {
      attempt.status = "RETAKEN"; want("OK");
    } else if (e.step === "review") {
      const d = e.decision;
      if (d === "APPROVED") { attempt.status = "CONFIRMED"; distance = attempt.distance; } else attempt.status = "REJECTED";
      want("OK:" + attempt.status);
    }
  }
  for (const c of corrections) distance = c.distance;
  return { distance, checked, attempts: attempts.length };
}

// ------------------------------------------------------------------------------------------------------------------------------------
const cmd = process.argv[2];
if (cmd === "plan") {
  process.stdout.write(JSON.stringify(buildPlan()));
} else if (cmd === "compare") {
  const sys = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const r = compare(sys);
  console.log(JSON.stringify(r.summary));
  if (r.fails.length) { console.log(`MODEL MISMATCH: ${r.fails.length} of ${r.checks} checks failed`); for (const f of r.fails.slice(0, 40)) console.log("  - " + f); process.exit(1); }
  console.log(`MODEL AGREES: ${r.checks} independent checks, 0 mismatches`);
}
