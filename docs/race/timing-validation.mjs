// THE NINTH — timing model validation (docs/race/02-final-schema-and-timing.md §2).
// Run: node docs/race/timing-validation.mjs [--md]
// Pure arithmetic, no dependencies. Every assertion below must pass before migrations.

const W = 180_000;          // work
const T = 30_000;           // transition
const I = 210_000;          // start interval (LOCKED = W + T)
const G = 600_000;          // heat gap, measured from the last athlete's START
const F = 60_000;           // START EVENT -> first athlete start
const B = 60_000;           // slot binding lead
const A = 10_000;           // voice announcement lead
const CHECKIN_CLOSE = 900_000; // check-in closes before heat start
const STATIONS = 9;
const HEAT_SIZE = 9;
const ATHLETES = 50;

// ---- model -------------------------------------------------------------
const heatSizes = [];
for (let left = ATHLETES; left > 0; left -= HEAT_SIZE) heatSizes.push(Math.min(HEAT_SIZE, left));

const heats = [];
let anchor = F;
for (let h = 0; h < heatSizes.length; h++) {
  const n = heatSizes[h];
  const slots = Array.from({ length: n }, (_, k) => {
    const start = anchor + k * I;
    const stations = Array.from({ length: STATIONS }, (_, s) => {
      const ws = start + s * I;
      return { n: s + 1, start: ws, end: ws + W, transitionEnd: s < STATIONS - 1 ? ws + W + T : null };
    });
    return { k, start, finish: stations[STATIONS - 1].end, bindAt: start - B, announceAt: start - A, stations };
  });
  const lastStart = slots[n - 1].start;
  const next = h < heatSizes.length - 1 ? lastStart + G : null; // gap from last athlete START
  heats.push({ h: h + 1, n, anchor, checkinClose: anchor - CHECKIN_CLOSE, slots, lastStart, lastFinish: slots[n - 1].finish, next });
  anchor = next;
}
const eventFinish = Math.max(...heats.map((h) => h.lastFinish));

// ---- assertions ---------------------------------------------------------
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

check(I === W + T, "interval must equal work + transition");
check(G >= I, "heat gap must be >= interval so every station keeps >= 30s changeover");
check(A <= B && B <= F, "announce <= bind <= first-start offset");

let athleteNo = 0;
for (const heat of heats) {
  check(heat.n >= 1 && heat.n <= HEAT_SIZE, `heat ${heat.h} size`);
  for (const s of heat.slots) {
    athleteNo++;
    check(s.finish - s.start === 31 * 60_000, `athlete ${athleteNo} duration != 31:00`);
    s.stations.forEach((st, i) => {
      check(st.end - st.start === W, `athlete ${athleteNo} S${st.n} work != 3:00`);
      if (i > 0) check(st.start - s.stations[i - 1].end === T, `athlete ${athleteNo} transition before S${st.n} != 0:30`);
    });
    if (s.k > 0) check(s.start - heat.slots[s.k - 1].start === I, `heat ${heat.h} slot ${s.k} interval != 3:30`);
    check(s.bindAt >= 0, `athlete ${athleteNo} binds before START EVENT`);
  }
  if (heat.next !== null) {
    check(heat.next - heat.lastStart === G, `heat ${heat.h} gap != 10:00 from last start`);
    check(heats[heat.h].anchor === heat.next, `heat ${heat.h + 1} anchor mismatch`);
  }
  if (heat.n === HEAT_SIZE) check(heat.lastStart - heat.anchor === 28 * 60_000, `heat ${heat.h} last start != heat start + 28:00`);
}
check(athleteNo === ATHLETES, "athlete count");

// Station occupancy: no two athletes ever overlap on any station; min changeover >= T.
let minChangeover = Infinity;
for (let n = 1; n <= STATIONS; n++) {
  const windows = heats.flatMap((h) => h.slots.map((s) => s.stations[n - 1])).sort((a, b) => a.start - b.start);
  for (let i = 1; i < windows.length; i++) {
    const gap = windows[i].start - windows[i - 1].end;
    minChangeover = Math.min(minChangeover, gap);
    check(gap >= T, `station ${n} overlap/changeover ${gap}ms < 30s`);
  }
}

// Peak number of athletes on course at once (heats overlap on the course, never on a station).
const all = heats.flatMap((h) => h.slots);
let peakOnCourse = 0;
for (const t of all.map((s) => s.start)) peakOnCourse = Math.max(peakOnCourse, all.filter((s) => s.start <= t && t < s.finish).length);
check(peakOnCourse <= STATIONS, "more athletes on course than stations");

// Overflow capacity inside the gap while keeping >= T changeover: (k+1)*I <= (N-1)*I + G
const overflowSlots = Math.floor(G / I) - 1;

// ---- output -------------------------------------------------------------
const fmt = (ms) => {
  if (ms < 0) return `−${fmt(-ms)}`;
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const wall = (ms, base = 9 * 3600_000) => fmt(base + ms);

console.log("## Heat summary (race time; wall clock if START EVENT = 09:00:00)\n");
console.log("| Heat | Athletes | Check-in closes | Heat start | Last athlete start | Last athlete finish | Next heat start |");
console.log("|---|---|---|---|---|---|---|");
for (const h of heats)
  console.log(`| ${h.h} | ${h.n} | ${fmt(h.checkinClose)} (${wall(h.checkinClose)})${h.checkinClose < 0 ? " — before START EVENT" : ""} | ${fmt(h.anchor)} (${wall(h.anchor)}) | ${fmt(h.lastStart)} (${wall(h.lastStart)}) | ${fmt(h.lastFinish)} (${wall(h.lastFinish)}) | ${h.next === null ? "—" : `${fmt(h.next)} (${wall(h.next)})`} |`);
console.log(`\n**Full event finish:** ${fmt(eventFinish)} race time (${wall(eventFinish)} wall).\n`);

console.log("## Every athlete start slot\n");
console.log("| # | Heat | Slot | Bound at | Voice at | Start (S01) | S09 start | Finish | Wall start | Wall finish |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
let no = 0;
for (const h of heats) for (const s of h.slots)
  console.log(`| ${++no} | ${h.h} | ${s.k + 1} | ${fmt(s.bindAt)} | ${fmt(s.announceAt)} | ${fmt(s.start)} | ${fmt(s.stations[8].start)} | ${fmt(s.finish)} | ${wall(s.start)} | ${wall(s.finish)} |`);

console.log("\n## Validation\n");
console.log(`- Athletes: ${athleteNo} in ${heats.length} heats (${heatSizes.join(" + ")})`);
console.log(`- Minimum station changeover anywhere in the event: ${minChangeover / 1000}s`);
console.log(`- Peak athletes on course simultaneously: ${peakOnCourse}`);
console.log(`- Changeover at a heat boundary: ${(G - W) / 1000}s`);
console.log(`- Overflow (late) slots per heat that fit in the gap without moving anyone: ${overflowSlots}`);
console.log(`- Assertions: ${failures.length === 0 ? "ALL PASS" : "FAILED"}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
