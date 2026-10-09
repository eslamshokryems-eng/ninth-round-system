/*
 * THE NINTH — Phase 4 browser check (manual; not part of CI).
 *
 * Drives the BUILT web app in Chromium with Supabase mocked at the network
 * layer (no backend needed): registration form rules, exact RPC arguments,
 * token handling, staff console, double-click protection, phone-width
 * overflow, and independence from the gym system.
 *
 *   pnpm --filter @9thround/race-web build     # with NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon
 *   pnpm --filter @9thround/race-web start     # port 3100
 *   node apps/race/scripts/race-e2e.mjs        # needs `playwright` resolvable (e.g. NODE_PATH=$(npm root -g))
 *
 * Env: RACE_E2E_BASE (default http://localhost:3100), CHROMIUM_PATH (optional), RACE_E2E_SHOTS (screenshot dir).
 */
/* global document, window, localStorage, getComputedStyle, URL, setTimeout, Buffer */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.RACE_E2E_BASE ?? "http://localhost:3100";
const SB = "https://example.supabase.co";
const shots = process.env.RACE_E2E_SHOTS ?? "race-e2e-shots";
fs.mkdirSync(shots, { recursive: true });

const EVENT = { event_id: "11111111-1111-1111-1111-111111111111", slug: "the-ninth-2026", name: "THE NINTH", event_date: "2026-11-20", venue: "9th Round Arena, Cairo",
  timezone: "Africa/Cairo", status: "REGISTRATION_OPEN", registration_open: true, registration_fee: 750, currency: "EGP",
  instructions: "Arrive 30 minutes before your heat.\nBring water and a towel.", planned_start_at: "2026-11-20T07:00:00+00:00", heats_locked: false };
const LOCKED_ID = "33333333-3333-3333-3333-333333333333";
const LOCKED = { ...EVENT, event_id: LOCKED_ID, slug: "locked-2026", status: "HEATS_LOCKED", registration_open: false, heats_locked: true };
const mkRow = (id, no, name, phone, over) => ({ registration_id: id, race_number: no, full_name: name, phone, email: null, gender: "male", category_code: "MEN", heat_id: "h2", heat_number: 2, status: "CONFIRMED",
  race_status: "REGISTERED", pushup_style: "STANDARD", payment_id: null, payment_status: null, payment_amount: null, payment_method: null, paid_at: null, created_at: "2026-09-29T10:00:00Z", ...over });
const RROWS = [
  mkRow("r27", "N027", "Omar Fathy", "01001112233", {}),
  mkRow("r28", "N028", "Nada Sami", "01001112244", { status: "PENDING_PAYMENT", payment_status: "PENDING", payment_amount: 750, payment_id: "pp" }),
  mkRow("r29", "N029", "No Heat Guy", "01001112255", { heat_id: null, heat_number: null }),
  mkRow("r30", "N030", "Already In", "01001112266", { race_status: "CHECKED_IN", heat_number: 1 }),
  mkRow("late1", "N031", "Late Larry", "01001112277", {}),
];
const QUEUE = [
  { heat_number: 1, queue_position: 1, registration_id: "q1", race_number: "N001", full_name: "First Athlete", category_code: "MEN", race_status: "CHECKED_IN", checked_in_at: "2026-11-20T05:00:00Z", kind: "ON_TIME", slot_index: 0, slot_status: "BOUND", is_overflow: false, projected_slot_index: 0, projected_start_ms: 60000, projected_start_at: "2026-11-20T07:01:00+00:00", no_slot_available: false },
  { heat_number: 1, queue_position: 2, registration_id: "q2", race_number: "N009", full_name: "Late Athlete", category_code: "MEN", race_status: "LATE_CHECK_IN", checked_in_at: "2026-11-20T06:59:00Z", kind: "LATE", slot_index: null, slot_status: null, is_overflow: null, projected_slot_index: 9, projected_start_ms: 1950000, projected_start_at: "2026-11-20T07:32:30+00:00", no_slot_available: false },
  { heat_number: 2, queue_position: 1, registration_id: "q3", race_number: "N020", full_name: "Stranded Athlete", category_code: "WOMEN", race_status: "LATE_CHECK_IN", checked_in_at: "2026-11-20T07:59:00Z", kind: "LATE", slot_index: null, slot_status: null, is_overflow: null, projected_slot_index: null, projected_start_ms: null, projected_start_at: null, no_slot_available: true },
];
const ME = { registration_id: "r1", race_number: "N007", full_name: "Ahmed Mohamed", category_code: "MEN", category_name: "Men", status: "PENDING_PAYMENT",
  race_status: "REGISTERED", pushup_style: "STANDARD", pushup_style_locked: false, heat_number: 1, heat_start_at: "2026-11-20T07:01:00+00:00",
  checkin_closes_at: "2026-11-20T06:46:00+00:00", event_name: "THE NINTH", event_slug: "the-ninth-2026", event_date: "2026-11-20", venue: "9th Round Arena, Cairo",
  timezone: "Africa/Cairo", instructions: "Arrive 30 minutes before your heat.", payment_status: "PENDING", payment_amount: 750, currency: "EGP" };
const ROWS = [
  { registration_id: "a1", race_number: "N001", full_name: "Ahmed Mohamed", phone: "01001234567", email: null, gender: "male", category_code: "MEN", heat_id: null, heat_number: null, status: "PENDING_PAYMENT", race_status: "REGISTERED", pushup_style: "STANDARD", payment_id: "p1", payment_status: "PENDING", payment_amount: 750, payment_method: null, paid_at: null, created_at: "2026-09-29T10:00:00Z" },
  { registration_id: "a2", race_number: "N002", full_name: "Sara Ali", phone: "01111234567", email: null, gender: "female", category_code: "WOMEN", heat_id: "h1", heat_number: 1, status: "CONFIRMED", race_status: "REGISTERED", pushup_style: "KNEE", payment_id: "p2", payment_status: "PAID", payment_amount: 750, payment_method: "CASH", paid_at: "2026-09-29T11:00:00Z", created_at: "2026-09-29T10:05:00Z" },
  { registration_id: "a3", race_number: "N003", full_name: "Hassan Kamel", phone: "01221234567", email: null, gender: "male", category_code: "MASTERS", heat_id: null, heat_number: null, status: "CANCELLED", race_status: "REGISTERED", pushup_style: "KNEE", payment_id: "p3", payment_status: "CANCELLED", payment_amount: 750, payment_method: null, paid_at: null, created_at: "2026-09-29T10:10:00Z" },
];

// private admin / station settings mock state
const adm = { locked: false, signedOutCalls: 0, updates: [], previews: [], displayName: "Barbell Squat" };
const ADM_EVENT = { id: "demo-ev-1", slug: "demo-abc123def456", name: "Private demo run", status: "DRAFT", is_demo: true, event_date: "2026-11-20", manager: true };
function admStations() {
  const cat = (scoring, movement, rule = {}) => ({ scoring_type: scoring, higher_is_better: true, movement, equipment: {}, rule });
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    number: n, code: "S" + n, name: n === 2 ? "Push-Up" : "Station " + n, exercise_name: n === 2 ? "Push-up" : "Exercise " + n, instructions: "Do it well.", equipment_note: "None", template_code: null,
    has_technique: n === 4 || n === 7, requires_ocr: n === 9,
    categories: { MEN: cat(n === 2 ? "CONVERTED_REPS" : "REPS", "Move", n === 2 ? { knee_ratio: 3 } : {}), WOMEN: cat(n === 2 ? "CONVERTED_REPS" : "REPS", "Move", n === 2 ? { knee_ratio: 3 } : {}), MASTERS: cat(n === 2 ? "CONVERTED_REPS" : "REPS", "Move", n === 2 ? { knee_ratio: 3 } : {}) },
    template_options: n === 4 || n === 7 ? ["REPS_TECHNIQUE"] : n === 9 ? ["DISTANCE_OCR"] : ["REPS", "PUSHUP_STYLE", "LAPS", "HOLD"],
    locked_rule: n === 4 || n === 7 || n === 9 ? "locked" : null,
  }));
}
function admConfig() {
  return { event: { id: ADM_EVENT.id, slug: ADM_EVENT.slug, name: ADM_EVENT.name, status: adm.locked ? "LIVE" : "DRAFT", is_demo: true }, locked: adm.locked,
    lock_reason: adm.locked ? "The race has started: the station configuration is frozen for this event." : null, can_edit: !adm.locked, version: 1, frozen_version: adm.locked ? 2 : null,
    stations: admStations(),
    templates: [
      { code: "REPS", label: "Counted repetitions", description: "d", supported: true, unsupported_reason: null, scoring_type: "REPS", judge_actions: ["REP", "NO_REP"], has_technique: false, requires_ocr: false, allowed_stations: [1, 2, 3, 5, 6, 8] },
      { code: "TIME_FOR_DISTANCE", label: "Fastest time over a fixed distance", description: "d", supported: false, unsupported_reason: "Not implemented", scoring_type: null, judge_actions: [], has_technique: false, requires_ocr: false, allowed_stations: null },
    ],
    versions: [{ version: 1, created_at: "2026-11-01T10:00:00Z", reason: "baseline", frozen: false, created_by: "Owner" }] };
}
const calls = []; // every RPC the browser makes: {fn, body}
const seenUrls = []; // every URL any page requested
let registerMode = "ok"; // "ok" | "dup"
let confirmDelay = 400;


// ---- Master Control mock: a tiny stateful race clock -------------------------------------------------------------------
const ctl = { started: false, paused: false, baseMs: 0, baseAt: 0, version: 1, forbidden: false };
const ctlRaceMs = () => (!ctl.started ? null : ctl.paused ? ctl.baseMs : ctl.baseMs + (Date.now() - ctl.baseAt));
const controlState = () => {
  const t = ctlRaceMs();
  const startsIn = t === null ? null : 60000 - t;
  return {
    server_time: new Date().toISOString(),
    event: { id: LOCKED_ID, name: "THE NINTH", status: ctl.started ? "LIVE" : "HEATS_LOCKED", timezone: "Africa/Cairo", first_start_offset_ms: 60000, start_interval_ms: 210000, work_ms: 180000, transition_ms: 30000, announce_lead_ms: 10000 },
    clock: { started: ctl.started, paused: ctl.paused, finished: false, race_ms: t, version: ctl.version, started_at: ctl.started ? new Date(ctl.baseAt).toISOString() : null, paused_at: null, pre_race: t !== null && t < 60000 },
    next_athlete: ctl.started && startsIn > 0 ? { registration_id: "q1", race_number: "N001", full_name: "First Athlete", category_code: "MEN", heat: 1, slot_index: 0, start_ms: 60000, starts_in_ms: startsIn, announce_in_ms: startsIn - 10000 } : null,
    skippable: [{ slot_id: "slot-n002", registration_id: "q9", race_number: "N002", full_name: "Second Athlete", category_code: "MEN", heat: 1, slot_index: 1, is_overflow: false, status: "BOUND", start_ms: 270000, starts_in_ms: 270000 - (t ?? 0) }],
    stations: Array.from({ length: 9 }, (_, i) => i === 0
      ? { number: 1, name: "Station 01", state: "WORK", athlete: { race_number: "N003", full_name: "Third Athlete", category_code: "MEN" }, window_start_ms: 0, window_end_ms: 180000, scoring_end_ms: 210000, remaining_ms: 100000, score: null }
      : { number: i + 1, name: "Station 0" + (i + 1), state: "IDLE", athlete: null, window_start_ms: null, window_end_ms: null, scoring_end_ms: null, remaining_ms: null, score: null }),
    heats: [1, 2, 3].map((n) => ({ number: n, status: n === 3 ? "AWAITING_START" : "LOCKED", anchor_ms: n === 3 ? null : n === 1 ? 60000 : 2340000, planned_slots: 9, start_mode: n === 3 ? "MANUAL" : "AUTO", roster: 9, started: 0, bound: 0, empty: 0, skipped: 0, open: 9 })),
    counts: { registered: 27, checked_in: 20, racing: 0, finished: 0, dns: 1, dnf: 0 },
    attention: { dns: [{ registration_id: "d4", race_number: "N004", full_name: "Missed Mo", heat: 1, was_skipped: true }], no_slot: [{ registration_id: "q3", race_number: "N020", full_name: "Stranded Athlete", heat: 1 }] },
  };
};

// ---- Judge mock: a station with one athlete; the server side is idempotent by client id, like the real RPC ---------------------------------------------
const jd = { events: new Map(), mode: "ok", late: false, refuse: false };
const jdTally = () => ({ reps: [...jd.events.values()].filter((e) => e.type === "REP" && e.status === "ACCEPTED" && !e.voided).length, no_reps: 0, scoring_type: "REPS", score: 0, technique: null, pending_review: 0 });
const stationView = () => ({
  server_time: new Date().toISOString(), station: { number: 1, name: "Squat", has_technique: false },
  clock: { started: true, paused: false, finished: false, race_ms: 100000, version: 1 },
  current: { result_id: "res-1", race_number: "N001", full_name: "Judge Test Athlete", category_code: "MEN", movement: "Barbell Squat", state: "WORK", window_start_ms: 60000, window_end_ms: 240000, scoring_end_ms: 270000, remaining_ms: 140000, tally: jdTally() },
  next: null,
});


// ---- Station screen mock: the SAME world as the unit tests, computed from a controllable race clock ----------------------------------
//   N001 starts 1:00, N002 4:30, (N003 skipped), N004 11:30 and withdraws (DNF) at 12:30, slot 5 empty.  3:00 work + 0:30 transition.
const sc = { started: true, paused: false, finished: false, baseMs: 0, baseAt: Date.now(), mode: "ok", score: (sinceStart) => Math.floor(sinceStart / 10000) };
const scRace = () => (sc.paused ? sc.baseMs : sc.baseMs + (Date.now() - sc.baseAt));
const scSet = (ms) => { sc.baseMs = ms; sc.baseAt = Date.now(); sc.paused = false; };
const scSlots = [["N001", 60000, null], ["N002", 270000, null], ["N004", 690000, 750000]];
const screenData = (n) => {
  if (n === 9) {            // the rowing screen: the SAME payload shape — a distance only once the judge has confirmed it, and never any evidence
    const t = rwRace(); const r = rw.results.N005;
    return { server_time: new Date().toISOString(), event: { name: "THE NINTH" }, station: { number: 9, name: "Rowing", is_last: true }, clock: { started: true, paused: false, finished: false, race_ms: t, version: 1 },
      timing: { work_ms: 180000, transition_ms: 30000, get_ready_ms: 10000 },
      current: t >= r.end - 180000 && t < r.scoringEnd ? { race_number: "N005", category_code: "MEN", window_start_ms: r.end - 180000, window_end_ms: r.end, scoring_end_ms: r.scoringEnd, scoring_type: "DISTANCE_M", score: r.official } : null,
      upcoming: null, planned_next_ms: null, served_any: true };
  }
  const t = scRace();
  const live = scSlots.filter(([, , dnf]) => !(dnf !== null && t >= dnf));
  const cur = live.find(([, st]) => st <= t && t < st + 210000);
  const up = scSlots.find(([, st]) => st > t && st - 60000 <= t);
  const planned = [60000, 270000, 480000, 690000, 900000].find((st) => st > t && !(up && up[1] === st)) ?? null;
  return {
    server_time: new Date().toISOString(), event: { name: "THE NINTH" }, station: { number: n, name: n === 1 ? "Squat" : "Station 0" + n, is_last: n === 9 },
    clock: { started: sc.started, paused: sc.paused, finished: sc.finished, race_ms: sc.started ? t : null, version: 1 },
    timing: { work_ms: 180000, transition_ms: 30000, get_ready_ms: 10000 },
    current: cur ? { race_number: cur[0], category_code: "MEN", window_start_ms: cur[1], window_end_ms: cur[1] + 180000, scoring_end_ms: cur[1] + 210000, scoring_type: "REPS", score: sc.score(Math.min(t, cur[1] + 180000) - cur[1]) } : null,
    upcoming: up ? { race_number: up[0], category_code: "MEN", window_start_ms: up[1] } : null,
    planned_next_ms: planned, served_any: scSlots.some(([, st]) => st + 210000 <= t),
  };
};

// ---- Results mock: four finished MEN athletes, one DNF, one DNS; ranking computed like the database (sum of placements, ties share a place) ----------------------
const rk = { official: false, racing: 2, unscored: 0, pending: 0, corrected: false, published: 0, corrections: [] };
const rkAthletes = [["N001", "Ahmed A.", 15], ["N007", "Mona K.", 15], ["N004", "Omar F.", 12], ["N011", "Sara M.", 21]];
const leaderboard = (eventId) => {
  if (eventId !== LOCKED_ID) return { available: false };
  const tot = rkAthletes.map(([n, name, t]) => ({ n, name, t: n === "N004" && rk.corrected ? 22 : t }));
  const rows = tot.map((a) => ({ rank: 1 + tot.filter((b) => b.t < a.t).length, race_number: a.n, name: a.name, total_points: a.t,
    placements: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [String(i), Math.max(1, Math.round(a.t / 9) + (i % 3) - 1)])), tb_s04: null, tb_s07: null }))
    .sort((a, b) => a.rank - b.rank || a.race_number.localeCompare(b.race_number));
  return { available: true, server_time: new Date().toISOString(), event: { name: "THE NINTH" }, official: rk.official,
    categories: [{ code: "MEN", name: "Men", state: rk.official ? "OFFICIAL" : "PROVISIONAL", version: rk.official ? 2 : null, rows, racing: rk.official ? 0 : rk.racing,
      excluded: [{ race_number: "N005", name: "Hany S.", status: "DNS" }, { race_number: "N030", name: "Omar Z.", status: "DNF" }] },
      { code: "WOMEN", name: "Women", state: rk.official ? "OFFICIAL" : "PROVISIONAL", version: null, rows: [], racing: 0, excluded: [] }] };
};
const rkBlockers = () => ({ ranked: 4, racing: rk.racing, pending_review: rk.pending, not_locked: 0, unscored: rk.unscored });
const rkReady = () => rk.racing === 0 && rk.pending === 0 && rk.unscored === 0;

// ---- Rowing (Station 09) mock: a stateful evidence backend. Idempotent by client ids, like the real RPCs; refuses what the real ones refuse. -----------------------
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const RW_LIMITS = { min_confidence: 0.6, review_confidence: 0.85, max_distance_m: 1500 };
const rwClassify = (d, c) => d === null || d < 0 || d > 1500 ? "FAILED" : c === null ? "LOW_CONFIDENCE" : c < 0.6 ? "FAILED" : c < 0.85 ? "LOW_CONFIDENCE" : "SUCCEEDED";
const rw = { baseMs: 1800000, baseAt: Date.now(), mode: "ok", loseNext: false, uploads: new Map(), uploadCalls: [], captureCalls: 0, submitCalls: 0, confirmCalls: [], retakeCalls: [], reviews: [], corrections: [], audit: [], forbidden: false,
  results: { N001: mkRw("row-1", "N001", "Ahmed A.", 1920000), N002: mkRw("row-2", "N002", "Omar F.", 2130000), N003: mkRw("row-3", "N003", "Sara M.", 2340000), N004: mkRw("row-4", "N004", "Hany S.", 2550000), N005: mkRw("row-5", "N005", "Nour E.", 2760000) } };
function mkRw(id, race, name, end) { return { id, race, name, end, scoringEnd: end + 30000, attempts: [], official: null, corrected: false }; }
const rwRace = () => rw.baseMs + (Date.now() - rw.baseAt);
const rwSet = (ms) => { rw.baseMs = ms; rw.baseAt = Date.now(); };
const rwByResult = (id) => Object.values(rw.results).find((r) => r.id === id);
const rwByAttempt = (id) => Object.values(rw.results).find((r) => r.attempts.some((a) => a.id === id));
const rwState = (r) => r.official !== null ? "OFFICIAL" : r.attempts.some((a) => a.status === "PENDING_REVIEW") ? "PENDING_MASTER_REVIEW" : "PENDING_EVIDENCE";
const rwAttemptJson = (a) => ({ attempt_id: a.id, attempt_no: a.no, status: a.status, ocr_status: a.ocr_status, proposed_distance_m: a.distance, confidence: a.confidence, ocr_text: a.text, ocr_engine: a.engine,
  captured_at: a.capturedAt, capture_race_ms: a.captureMs, image_path: a.path, confirmed_distance_m: a.confirmed ?? null, retake_reason: a.retakeReason ?? null, confirmed_after_transition: a.late === true,
  review_reason: a.reviewReason ?? null, origin: a.origin });
const rwView = () => {
  const t = rwRace();
  return { server_time: new Date().toISOString(), station: { number: 9, name: "Rowing" }, clock: { started: true, paused: false, finished: false, race_ms: t, version: 1 }, transition_ms: 30000,
    items: Object.values(rw.results).filter((r) => t >= r.end - 180000).map((r) => ({ result_id: r.id, race_number: r.race, name: r.name, category_code: "MEN", window_start_ms: r.end - 180000, window_end_ms: r.end, scoring_end_ms: r.scoringEnd,
      phase: t < r.end ? "WORK" : t < r.scoringEnd ? "TRANSITION" : "AFTER", result_status: t < r.scoringEnd ? "SCORING" : r.corrected ? "CORRECTED" : "LOCKED", evidence_state: rwState(r), official_distance_m: r.official,
      limits: RW_LIMITS, attempts: r.attempts.map(rwAttemptJson) })) };
};
const rwErr = (route, message, code = "P0001") => route.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code, message, details: null, hint: null }) });
function rwRpc(fn, body, json, route) {
  const t = rwRace();
  const log = (action, extra = {}) => rw.audit.push({ at: new Date().toISOString(), action: "race.ocr." + action, actor: "Judge", target_id: extra.id ?? "", after: null, metadata: extra });
  switch (fn) {
    case "race_rowing_view":
      if (rw.forbidden) return rwErr(route, "RACE_FORBIDDEN: only the rowing judge (or race control) can open the evidence view", "42501");
      return json(200, rwView());
    case "race_ocr_capture": {
      rw.captureCalls += 1;
      const r = rwByResult(body.p_station_result_id);
      const known = Object.values(rw.results).flatMap((x) => x.attempts).find((a) => a.cid === body.p_client_capture_id);
      if (known) return json(200, { attempt_id: known.id, attempt_no: known.no, status: known.status, ocr_status: known.ocr_status, duplicate: true, capture_race_ms: known.captureMs, after_transition: null });
      if (!r) return rwErr(route, "RACE_NOT_FOUND");
      if (t < r.end) return rwErr(route, "RACE_OCR_TOO_EARLY: the rowing display is final only when the 3:00 work window has ended");
      if (rwState(r) === "OFFICIAL") return rwErr(route, "RACE_OCR_ALREADY_CONFIRMED: this rowing distance is already official");
      if (r.attempts.some((a) => ["CAPTURED", "PENDING_REVIEW"].includes(a.status))) return rwErr(route, "RACE_OCR_ATTEMPT_ACTIVE: confirm or retake the current photo first");
      if (!rw.uploads.has(body.p_storage_path)) return rwErr(route, "RACE_OCR_IMAGE_MISSING: upload the photo before registering it");
      const a = { id: "att-" + r.race + "-" + (r.attempts.length + 1), no: r.attempts.length + 1, cid: body.p_client_capture_id, status: "CAPTURED", ocr_status: "PENDING", distance: null, confidence: null, text: null, engine: null,
        capturedAt: new Date().toISOString(), captureMs: t, path: body.p_storage_path, origin: body.p_origin, offlineMeta: { at: body.p_device_recorded_at, seq: body.p_device_seq, ms: body.p_device_race_ms } };
      r.attempts.push(a); log("capture", { id: a.id });
      const resp = { attempt_id: a.id, attempt_no: a.no, status: a.status, ocr_status: a.ocr_status, duplicate: false, capture_race_ms: t, after_transition: t >= r.scoringEnd };
      if (rw.loseNext) { rw.loseNext = false; return route.abort("connectionreset"); }
      return json(200, resp);
    }
    case "race_ocr_submit": {
      rw.submitCalls += 1;
      const r = rwByAttempt(body.p_attempt_id); const a = r?.attempts.find((x) => x.id === body.p_attempt_id);
      if (!a) return rwErr(route, "RACE_NOT_FOUND");
      if (a.ocr_status !== "PENDING") return json(200, { attempt_id: a.id, ocr_status: a.ocr_status, proposed_distance_m: a.distance, confidence: a.confidence, duplicate: true });
      a.distance = body.p_distance_m; a.confidence = body.p_confidence; a.text = body.p_raw_text; a.engine = body.p_engine; a.ocr_status = rwClassify(a.distance, a.confidence); a.submitted = body; log("result", { id: a.id });
      return json(200, { attempt_id: a.id, ocr_status: a.ocr_status, proposed_distance_m: a.distance, confidence: a.confidence, duplicate: false, requires_acknowledgement: a.ocr_status === "LOW_CONFIDENCE", can_confirm: a.ocr_status !== "FAILED" });
    }
    case "race_ocr_confirm": {
      rw.confirmCalls.push(body);
      const r = rwByAttempt(body.p_attempt_id); const a = r?.attempts.find((x) => x.id === body.p_attempt_id);
      if (!a) return rwErr(route, "RACE_NOT_FOUND");
      if (a.confirmId === body.p_client_event_id) return json(200, { attempt_id: a.id, status: a.status, official: a.status === "CONFIRMED", duplicate: true, after_transition: a.late === true, distance_m: a.distance });
      if (a.status === "CONFIRMED") return rwErr(route, "RACE_OCR_ALREADY_CONFIRMED: this photo is already confirmed");
      if (a.status !== "CAPTURED") return rwErr(route, "RACE_OCR_NOT_ACTIVE: this photo can no longer be confirmed");
      if (a.ocr_status === "PENDING") return rwErr(route, "RACE_OCR_NOT_PROCESSED: the OCR result is not in yet");
      if (a.ocr_status === "FAILED") return rwErr(route, "RACE_OCR_UNREADABLE: the display could not be read");
      if (a.ocr_status === "LOW_CONFIDENCE" && body.p_acknowledge_low_confidence !== true) return rwErr(route, "RACE_OCR_LOW_CONFIDENCE: the reading is uncertain");
      a.confirmId = body.p_client_event_id;
      if (t >= r.scoringEnd) { a.status = "PENDING_REVIEW"; a.late = true; log("confirm_late", { id: a.id }); return json(200, { attempt_id: a.id, status: a.status, official: false, duplicate: false, after_transition: true, distance_m: a.distance }); }
      a.status = "CONFIRMED"; a.confirmed = a.distance; r.official = a.distance; log("confirm", { id: a.id });
      return json(200, { attempt_id: a.id, status: a.status, official: true, duplicate: false, after_transition: false, distance_m: a.distance });
    }
    case "race_ocr_retake": {
      rw.retakeCalls.push(body);
      const r = rwByAttempt(body.p_attempt_id); const a = r?.attempts.find((x) => x.id === body.p_attempt_id);
      if (!a) return rwErr(route, "RACE_NOT_FOUND");
      if (a.retakeId === body.p_client_event_id) return json(200, { attempt_id: a.id, status: a.status, duplicate: true });
      if (a.status !== "CAPTURED") return rwErr(route, "RACE_OCR_NOT_ACTIVE: this photo can no longer be retaken");
      a.status = "RETAKEN"; a.retakeId = body.p_client_event_id; a.retakeReason = body.p_reason; log("retake", { id: a.id });
      return json(200, { attempt_id: a.id, status: a.status, duplicate: false });
    }
    case "race_ocr_review": {
      rw.reviews.push(body);
      const r = rwByAttempt(body.p_attempt_id); const a = r?.attempts.find((x) => x.id === body.p_attempt_id);
      if (!a || a.status !== "PENDING_REVIEW") return rwErr(route, "RACE_OCR_NOT_PENDING: this confirmation is not waiting for review");
      if (!body.p_reason || !body.p_reason.trim()) return rwErr(route, "RACE_REASON_REQUIRED");
      a.reviewReason = body.p_reason;
      if (body.p_decision === "APPROVED") { a.status = "CONFIRMED"; a.confirmed = a.distance; r.official = a.distance; } else a.status = "REJECTED";
      log("review", { id: a.id });
      return json(200, { attempt_id: a.id, status: a.status, official: a.status === "CONFIRMED", score: r.official });
    }
    case "race_correct_rowing_result": {
      rw.corrections.push(body);
      const r = rwByResult(body.p_result_id); if (!r) return rwErr(route, "RACE_NOT_FOUND");
      const old = r.official; r.official = body.p_distance_m; r.corrected = true; log("manual_correction", { id: r.id });
      return json(200, { result_id: r.id, old, new: body.p_distance_m, status: "CORRECTED", evidence_attempt_id: body.p_evidence_attempt_id, score: body.p_distance_m, snapshot: null });
    }
    case "race_evidence_history": {
      const r = rwByResult(body.p_result_id);
      return json(200, { result_id: r.id, evidence_state: rwState(r), official_distance_m: r.official, result_status: "LOCKED",
        attempts: r.attempts.map((a) => ({ id: a.id, attempt_no: a.no, status: a.status, ocr_status: a.ocr_status, proposed_distance_m: a.distance, confidence: a.confidence, ocr_text: a.text, ocr_engine: a.engine, captured_at: a.capturedAt,
          capture_race_ms: a.captureMs, storage_path: a.path, confirmed_distance_m: a.confirmed ?? null, retake_reason: a.retakeReason ?? null, confirmed_after_transition: a.late === true, review_reason: a.reviewReason ?? null, origin: a.origin })),
        corrections: rw.corrections.filter((c) => c.p_result_id === r.id).map((c, i) => ({ id: "c" + i, old: null, new: c.p_distance_m, reason: c.p_reason, by: "u", at: new Date().toISOString(), evidence_attempt_id: c.p_evidence_attempt_id })),
        audit: rw.audit.filter((x) => r.attempts.some((a) => a.id === x.target_id) || x.target_id === r.id) });
    }
  }
  return null;
}

async function installMock(context) {
  context.on("request", (r) => seenUrls.push(r.url()));
  await context.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    // evidence storage (private bucket): upload is immutable (a second upload of the same path is a 409), reads go through signed URLs
    const stg = /\/storage\/v1\/object\/(sign\/)?race-evidence\/(.+)$/.exec(url.pathname);
    if (stg) {
      const path = decodeURIComponent(stg[2]);
      if (rw.mode === "drop") return route.abort("connectionfailed");
      if (stg[1] && req.method() === "POST") return json(200, { signedURL: `/object/sign/race-evidence/${stg[2]}?token=t` });
      if (stg[1] && req.method() === "GET") return route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: TINY_PNG });
      if (req.method() === "POST") {
        rw.uploadCalls.push(path);
        if (rw.uploads.has(path)) return json(409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        rw.uploads.set(path, true);
        return json(200, { Key: "race-evidence/" + path, Id: "obj" });
      }
    }
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url.pathname);
    if (rpc) {
      const fn = rpc[1];
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      calls.push({ fn, body });
      if (fn.startsWith("race_ocr_") || fn === "race_rowing_view" || fn === "race_correct_rowing_result" || fn === "race_evidence_history") {
        if (rw.mode === "drop") return route.abort("connectionfailed");
        const handled = rwRpc(fn, body, json, route);
        if (handled !== null) return handled;
      }
      switch (fn) {
        case "race_get_public_event": return body.p_slug === "locked-2026" ? json(200, LOCKED) : body.p_slug === "the-ninth-2026" ? json(200, EVENT) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null });
        case "race_register_athlete":
        case "race_staff_register_athlete":
          if (registerMode === "dup") return json(400, { code: "P0001", message: "RACE_ALREADY_REGISTERED: this athlete is already registered for the event", details: null, hint: null });
          return json(200, { registration_id: "r1", race_number: "N007", access_token: "a1b2c3d4".repeat(8), status: "PENDING_PAYMENT", amount_due: 750, currency: "EGP" });
        case "race_get_registration": return body.p_token === "a1b2c3d4".repeat(8) ? json(200, ME) : json(406, { code: "PGRST116", message: "0 rows", details: "The result contains 0 rows", hint: null });
        case "race_update_pushup_style": return json(200, body.p_style);
        case "race_list_registrations": {
          const q = (body.p_query || "").toLowerCase();
          if (body.p_event_id === LOCKED_ID) {
            const num = /^n?(\d{1,4})$/.exec(q);
            const wanted = num ? "n" + num[1].padStart(3, "0") : null;
            return json(200, q === "" ? RROWS : RROWS.filter((r) => (wanted ? r.race_number.toLowerCase() === wanted : r.full_name.toLowerCase().includes(q))));
          }
          const list = q === "" ? ROWS : ROWS.filter((r) => r.full_name.toLowerCase().includes(q) || r.race_number.toLowerCase() === q.toLowerCase());
          return json(200, list);
        }
        case "race_check_in": {
          await new Promise((r) => setTimeout(r, 350));
          if (body.p_registration_id === "r28") return json(400, { code: "P0001", message: "RACE_NOT_CONFIRMED: payment must be confirmed before check-in", details: null, hint: null });
          return json(200, { check_in_id: "c1", checked_in_at: "2026-11-20T06:00:00Z", kind: body.p_registration_id === "late1" ? "LATE" : "ON_TIME", queue_position: 4, heat_number: 2, already_checked_in: body.p_registration_id === "r30" });
        }
        case "race_my_access": return json(200, { signed_in: true, is_super_admin: true, can_create_events: true, events: [ADM_EVENT] });
        case "race_get_station_config": return json(200, admConfig());
        case "race_preview_station_config": {
          adm.previews.push(body);
          const name = body.p_patch.name ?? "Push-Up";
          return json(200, { valid: true, errors: [], conflicts: [], warnings: [], template_changed: false, scoring_changed: false, station: {}, preview: { judge: { header: `Judge · Station 02 · ${name}`, exercise_name: body.p_patch.exercise_name ?? "Push-up", instructions: "Do it well.", equipment_note: "None", has_technique: false, categories: { MEN: { movement: "Move", scoring_type: "CONVERTED_REPS", buttons: ["REP", "NO_REP", "UNDO"] } } }, screen: { station_label: "STATION 02", station_name: name, exercise_name: body.p_patch.exercise_name ?? "Push-up" } } });
        }
        case "race_update_station_config":
          adm.updates.push(body);
          if (adm.locked) return json(400, { code: "23514", message: "RACE_CONFIG_LOCKED: the race has started", details: null, hint: null });
          return json(200, { version: 2, station: {}, changes: {} });
        case "race_station_display": return json(200, { number: body.p_station_number, name: "Press-Up Wall", exercise_name: adm.displayName, instructions: "Hands on the bench.", equipment_note: "Bench", template_code: null, has_technique: false, requires_ocr: false, config_version: 2, categories: { MEN: { scoring_type: "REPS", movement: "Repetitions", equipment: {}, rule: {}, buttons: ["REP", "NO_REP", "UNDO"] }, WOMEN: { scoring_type: "REPS", movement: "Repetitions", equipment: {}, rule: {}, buttons: ["REP", "NO_REP", "UNDO"] }, MASTERS: { scoring_type: "REPS", movement: "Repetitions", equipment: {}, rule: {}, buttons: ["REP", "NO_REP", "UNDO"] } } });
        case "race_demo_status": return json(200, { status: "DRAFT", is_demo: true, started: false, athletes: 0, heats: 0, checked_in: 0, config_version: 1, config_frozen: false });
        case "race_create_demo_event": return json(200, { id: "demo-ev-2", slug: "demo-new000000000" });
        case "race_station_view": return json(200, stationView());
        case "race_leaderboard": return json(200, leaderboard(body.p_event_id));
        case "race_compute_rankings": return json(200, { official: rk.official, categories: [{ category_id: "cat-men", version: 1, official: rk.official, unchanged: true, ranked: 4, blockers: rkBlockers() }] });
        case "race_publish_results":
          if (rk.official) return json(200, { status: "RESULTS_OFFICIAL", already: true });
          if (!rkReady()) return json(400, { code: "P0001", message: "RACE_RESULTS_NOT_READY: " + JSON.stringify(rkBlockers()), details: null, hint: null });
          rk.official = true; rk.published += 1; return json(200, { status: "RESULTS_OFFICIAL", already: false });
        case "race_athlete_results":
          if (body.p_race_number !== "N004") return json(400, { code: "P0002", message: "RACE_NOT_FOUND: no athlete with that race number", details: null, hint: null });
          return json(200, { race_number: "N004", name: "Omar Fathy", category_code: "MEN", race_status: "FINISHED", results: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ result_id: "res-4-" + n, station: n, station_name: "Station 0" + n, status: "LOCKED", official_score: 20 + n, technique_score: n === 4 || n === 7 ? 8 : null, has_technique: n === 4 || n === 7 })) });
        case "race_correct_station_result":
          rk.corrections.push(body); rk.corrected = true;
          return json(200, { result_id: body.p_result_id, field: body.p_field, old: 22, new: body.p_value, status: "CORRECTED", snapshot: null });
        case "race_station_screen":
          if (sc.mode === "drop") return route.abort("connectionfailed");
          return json(200, screenData(body.p_station_number));
        case "race_record_action": {
          if (jd.refuse) return json(403, { code: "42501", message: "RACE_FORBIDDEN: only the judge of this station can score it", details: null, hint: null });
          const known = jd.events.get(body.p_client_event_id);
          if (jd.mode === "drop") return route.abort("connectionfailed");            // the request never reached the server
          let row;
          if (known) row = { ...known, duplicate: true };
          else {
            const rejected = jd.late;
            row = { performance_event_id: "pe-" + (jd.events.size + 1), status: rejected ? "REJECTED" : "ACCEPTED", rejection_code: rejected ? "WINDOW_CLOSED" : null, server_race_ms: 100000, duplicate: false, type: body.p_type, client: body.p_client_event_id, origin: body.p_origin };
            jd.events.set(body.p_client_event_id, row);
          }
          if (jd.mode === "lose-response") return route.abort("connectionreset");     // the server recorded it, the answer was lost
          return json(200, { ...row, tally: jdTally() });
        }
        case "race_control_state":
          if (ctl.forbidden) return json(403, { code: "42501", message: "RACE_FORBIDDEN", details: null, hint: null });
          return json(200, controlState());
        case "race_advance": return json(200, { advanced: ctl.started, race_ms: ctlRaceMs(), athletes_started: 0 });
        case "race_start_event":
          await new Promise((r) => setTimeout(r, 300));
          if (ctl.started) return json(400, { code: "23514", message: "RACE_ALREADY_STARTED: START EVENT can only be pressed once", details: null, hint: null });
          ctl.started = true; ctl.baseMs = 0; ctl.baseAt = Date.now(); ctl.version++;
          return json(200, { started_at: new Date(ctl.baseAt).toISOString(), first_start_ms: 60000, heats_anchored: 1 });
        case "race_pause":
          if (ctl.paused) return json(400, { code: "23514", message: "RACE_ALREADY_PAUSED", details: null, hint: null });
          ctl.baseMs = ctlRaceMs(); ctl.paused = true; ctl.version++;
          return json(200, { paused_at: new Date().toISOString(), paused_race_ms: ctl.baseMs });
        case "race_resume":
          ctl.baseAt = Date.now(); ctl.paused = false; ctl.version++;
          return json(200, { resumed_at: new Date().toISOString(), paused_ms: 90000, race_ms: ctl.baseMs });
        case "race_close_heat_without_start": return json(200, { heat_number: body.p_heat_number, athletes_dns: 9, slots_emptied: 0, next_heat_anchored: null });
        case "race_skip_athlete": return json(200, { heat_number: 1, slot_index: 1, race_number: "N002" });
        case "race_override_dns": return json(200, { outcome: "NO_SLOT_AVAILABLE", queue_position: null, heat_number: 1, slot_index: null });
        case "race_move_athlete_later_heat": return json(200, { heat_number: body.p_target_heat_number, queue_position: 4, slot_index: null });
        case "race_correct_check_in": return json(200, { correction_id: "corr-1", new_check_in_id: "ci-9", queue_position: 1, heat_number: 1, slot_rebound: true });
        case "race_queue": return json(200, QUEUE);
        case "race_confirm_payment": await new Promise((r) => setTimeout(r, confirmDelay)); return json(200, "22222222-2222-2222-2222-222222222222");
        default: return json(200, null);
      }
    }
    if (url.pathname.includes("/rest/v1/profiles")) {
      return json(200, { id: "u-staff", full_name: "Reception Rania", avatar_url: null, role: "reception", preferred_locale: "en", gender: null, date_of_birth: null, height_cm: null, weight_kg: null,
        goal: null, experience_level: null, onboarding_completed_at: null, referral_code: "X", referred_by: null, branch_id: "b1", last_seen_at: null, phone: null, address: null, employee_code: "2", is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
    }
    return json(200, []);
  });
}

async function seedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "x.y.z", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer",
      user: { id: "u-staff", aud: "authenticated", role: "authenticated", email: "staff@x.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }));
  });
}

const results = [];
const step = async (name, fn) => { try { await fn(); results.push(["PASS", name]); console.log("PASS ", name); } catch (e) { results.push(["FAIL", name]); console.log("FAIL ", name, "\n     ", e.message.split("\n").slice(0, 6).join("\n      ")); } };
const callsOf = (fn) => calls.filter((c) => c.fn === fn);

const main = async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];

  // ---------- public, mobile ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await installMock(mobile);
  const page = await mobile.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Content Security/.test(m.text())) errors.push(`console: ${m.text()}`); });

  await step("/race brand landing renders in the race theme", async () => {
    await page.goto(`${BASE}/race`); await page.waitForSelector(".race-root");
    assert.match(await page.locator("h1").innerText(), /NINE STATIONS/i);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".race-root")).backgroundColor), "rgb(5, 5, 5)");
    await page.screenshot({ path: `${shots}/01-landing-mobile.png` });
  });

  await step("event page shows date, venue, fee, instructions and a Register button", async () => {
    await page.goto(`${BASE}/race/e/the-ninth-2026`); await page.waitForSelector("text=9th Round Arena");
    const text = await page.locator("main").innerText();
    assert.match(text, /Friday,? 20 November 2026/i); assert.match(text, /750 EGP/); assert.match(text, /Bring water/);
    assert.equal(await page.locator("a", { hasText: /^Register/ }).getAttribute("href"), "/race/e/the-ninth-2026/register");
    await page.screenshot({ path: `${shots}/02-event-mobile.png`, fullPage: true });
  });

  await step("no horizontal overflow at phone width on any public page; stat cards contain their text", async () => {
    for (const path of ["/race", "/race/e/the-ninth-2026", "/race/e/the-ninth-2026/register"]) {
      await page.goto(`${BASE}${path}`); await page.waitForSelector(".race-root main");
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - window.innerWidth,
        cards: [...document.querySelectorAll(".race-card")].filter((c) => c.scrollWidth > c.clientWidth + 1).length,
        clipped: [...document.querySelectorAll(".race-display")].filter((e) => { const p = e.closest(".race-card"); if (!p) return false; const a = e.getBoundingClientRect(), b = p.getBoundingClientRect(); return a.right > b.right + 0.5 || a.left < b.left - 0.5; }).length,
      }));
      assert.deepEqual(overflow, { page: 0, cards: 0, clipped: 0 }, `${path}: ${JSON.stringify(overflow)}`);
    }
  });

  await step("unknown event slug shows 'Event not found'", async () => {
    await page.goto(`${BASE}/race/e/nope`); await page.waitForSelector("text=Event not found");
  });

  await step("registration: categories disable live from gender and date of birth", async () => {
    await page.goto(`${BASE}/race/e/the-ninth-2026/register`); await page.waitForSelector("#race-name");
    const disabled = (name) => page.locator(`input[name=category][value=${name}]`).isDisabled();
    assert.equal(await disabled("MEN"), false);
    await page.locator("input[name=gender][value=female]").check();
    assert.equal(await disabled("MEN"), true, "Men disabled for a female athlete");
    assert.equal(await disabled("WOMEN"), false);
    await page.locator("#race-dob").fill("1990-01-01"); // age 36 on race day
    assert.equal(await disabled("MASTERS"), true, "Masters disabled under 40");
    await page.locator("#race-dob").fill("1980-01-01");
    assert.equal(await disabled("MASTERS"), false, "Masters enabled at 46");
    await page.locator("#race-dob").fill("1986-11-20");
    assert.equal(await disabled("MASTERS"), false, "Masters enabled on the 40th birthday");
    await page.locator("#race-dob").fill("1986-11-21");
    assert.equal(await disabled("MASTERS"), true, "Masters disabled the day before the 40th birthday");
  });

  await step("registration: client-side validation blocks submit (no request sent)", async () => {
    await page.reload(); await page.waitForSelector("#race-name");
    const before = callsOf("race_register_athlete").length;
    await page.locator("#race-name").fill("Ahmed Mohamed"); await page.locator("#race-phone").fill("0100 123 4567");
    await page.locator("input[name=gender][value=male]").check(); await page.locator("#race-dob").fill("1995-05-05");
    await page.locator("input[name=category][value=MEN]").check();
    await page.locator("#race-em-name").fill("Mother"); await page.locator("#race-em-phone").fill("01011112222");
    await page.getByRole("button", { name: /^Register/ }).click(); // waiver unchecked
    await page.waitForSelector("text=The waiver must be accepted");
    assert.equal(callsOf("race_register_athlete").length, before, "no RPC for an invalid form");
    await page.screenshot({ path: `${shots}/03-register-error-mobile.png`, fullPage: true });
  });

  await step("registration: server refusal (already registered) is shown under the phone field", async () => {
    registerMode = "dup";
    await page.locator("label:has-text('I confirm that I am medically fit') input").check();
    await page.getByRole("button", { name: /^Register/ }).click();
    await page.waitForSelector("text=already registered");
    assert.ok(await page.locator("#race-phone").getAttribute("aria-invalid"), "phone field flagged invalid");
    registerMode = "ok";
  });

  await step("registration: success sends the exact RPC args, stores the token, lands on /me#t=…", async () => {
    await page.getByRole("button", { name: /^Register/ }).click();
    await page.waitForURL(/\/race\/e\/the-ninth-2026\/me#t=/);
    const last = callsOf("race_register_athlete").at(-1).body;
    assert.deepEqual(last, { p_event_id: EVENT.event_id, p_full_name: "Ahmed Mohamed", p_phone: "0100 123 4567", p_email: null, p_gender: "male", p_date_of_birth: "1995-05-05",
      p_category: "MEN", p_pushup_style: "STANDARD", p_waiver_accepted: true, p_emergency_contact: { name: "Mother", phone: "01011112222" } });
    assert.equal(await page.evaluate(() => localStorage.getItem("race:token:the-ninth-2026")), "a1b2c3d4".repeat(8));
  });

  await step("/me shows the race number plate, heat, times in EVENT time, QR, payment notice", async () => {
    await page.waitForSelector(".race-number-plate");
    assert.equal((await page.locator(".race-number-plate").innerText()).trim(), "N007");
    const text = await page.locator("main").innerText();
    assert.match(text, /Ahmed Mohamed/i); assert.match(text, /HEAT 01/i); assert.match(text, /PAYMENT PENDING/i); assert.match(text, /750 EGP/);
    assert.match(text, /09:01/, "07:01 UTC shown as 09:01 Cairo time (event timezone)");
    assert.match(text, /08:46/, "check-in closes 08:46 Cairo");
    await page.waitForSelector("img[alt*='QR code for race number N007']");
    await page.screenshot({ path: `${shots}/04-me-mobile.png`, fullPage: true });
  });

  await step("/me: Men can switch push-up style; the RPC gets the token and style", async () => {
    await page.getByRole("button", { name: /^Knee/ }).click();
    await page.waitForTimeout(300);
    const c = callsOf("race_update_pushup_style").at(-1).body;
    assert.deepEqual(c, { p_token: "a1b2c3d4".repeat(8), p_style: "KNEE" });
  });

  await step("/me with a wrong token shows 'Link not valid' and no athlete data", async () => {
    const p2 = await mobile.newPage();
    await p2.goto(`${BASE}/race/e/the-ninth-2026/me#t=${"z".repeat(64)}`);
    await p2.waitForSelector("text=Link not valid");
    assert.doesNotMatch(await p2.locator("body").innerText(), /N007|Ahmed/);
    await p2.close();
  });

  await step("/me is not indexable and sends no referrer", async () => {
    const meta = await page.evaluate(() => ({ robots: document.querySelector('meta[name=robots]')?.content, ref: document.querySelector('meta[name=referrer]')?.content }));
    assert.match(meta.robots, /noindex/); assert.equal(meta.ref, "no-referrer");
  });

  // ---------- staff, desktop ----------
  const desk = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await installMock(desk);
  const staff = await desk.newPage();
  staff.on("pageerror", (e) => errors.push(`pageerror(staff): ${e.message}`));

  await step("admin console asks a signed-out visitor to sign in (with a safe next link)", async () => {
    await staff.goto(`${BASE}/race/admin/the-ninth-2026/registrations`); await staff.waitForSelector("text=Sign in required");
    assert.equal(await staff.locator("a", { hasText: "Sign in" }).getAttribute("href"), "/race/login?next=/race/admin/the-ninth-2026/registrations");
    await staff.screenshot({ path: `${shots}/05-admin-signedout.png` });
  });

  const staffCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await installMock(staffCtx);
  const s2 = await staffCtx.newPage();
  await seedSession(s2);
  s2.on("pageerror", (e) => errors.push(`pageerror(staff2): ${e.message}`));

  await step("admin console (signed in) lists registrations with counts", async () => {
    await s2.goto(`${BASE}/race/admin/the-ninth-2026/registrations`); await s2.waitForSelector("text=N002");
    const text = await s2.locator("main").innerText();
    assert.match(text, /Sara Ali/); assert.match(text, /Masters 40\+/); assert.match(text, /PAID/); assert.match(text, /CANCELLED/);
    assert.match((await s2.locator(".race-card", { hasText: "Payment pending" }).first().innerText()), /1/);
    assert.match((await s2.locator(".race-card", { hasText: "Collected" }).first().innerText()), /750 EGP/);
    await s2.screenshot({ path: `${shots}/06-admin-desktop.png`, fullPage: true });
  });

  await step("admin search is debounced and sent as one RPC with the typed query", async () => {
    const before = callsOf("race_list_registrations").length;
    await s2.locator("#race-search").pressSequentially("sara", { delay: 40 });
    await s2.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
    const list = callsOf("race_list_registrations").slice(before);
    assert.equal(list.length, 1, `expected 1 debounced search RPC, got ${list.length}`);
    assert.equal(list[0].body.p_query, "sara");
    await s2.locator("#race-search").fill("");
    await s2.waitForSelector("text=N001");
  });

  await step("confirm payment: double-click sends ONE request, with an idempotency key and the method", async () => {
    await s2.locator("tr", { hasText: "N001" }).getByRole("button", { name: "Confirm payment" }).click();
    await s2.waitForSelector("#race-method");
    await s2.locator("#race-method").selectOption("INSTAPAY");
    await s2.locator("#race-notes").fill("receipt 8841");
    const before = callsOf("race_confirm_payment").length;
    const submit = s2.locator("form button[type=submit]", { hasText: "Confirm payment" });
    await submit.dblclick();
    await s2.waitForTimeout(900);
    const sent = callsOf("race_confirm_payment").slice(before);
    assert.equal(sent.length, 1, `double-click must send 1 request, sent ${sent.length}`);
    assert.equal(sent[0].body.p_registration_id, "a1"); assert.equal(sent[0].body.p_method, "INSTAPAY");
    assert.equal(sent[0].body.p_amount, null); assert.equal(sent[0].body.p_notes, "receipt 8841");
    assert.match(sent[0].body.p_idempotency_key, /^[0-9a-f-]{36}$/);
    assert.equal(await s2.locator("#race-method").count(), 0, "panel closes on success");
  });

  await step("refund/cancel need a reason (button flow), and only sensible actions are offered per row", async () => {
    const paid = s2.locator("tr", { hasText: "N002" });
    assert.equal(await paid.getByRole("button", { name: "Refund" }).count(), 1);
    assert.equal(await paid.getByRole("button", { name: "Confirm payment" }).count(), 0);
    const cancelled = s2.locator("tr", { hasText: "N003" });
    assert.equal(await cancelled.getByRole("button").count(), 0, "a cancelled registration offers no actions");
    await paid.getByRole("button", { name: "Refund" }).click();
    await s2.waitForSelector("#race-reason");
    const n = callsOf("race_refund_payment").length;
    await s2.getByRole("button", { name: "Refund payment" }).click(); // empty reason → browser validation blocks it
    await s2.waitForTimeout(200);
    assert.equal(callsOf("race_refund_payment").length, n, "no refund without a reason");
  });

  await step("register-an-athlete panel (staff mode) opens and calls the staff RPC", async () => {
    await s2.getByRole("button", { name: "Close" }).first().click().catch(() => {});
    await s2.getByRole("button", { name: "Register an athlete" }).click();
    await s2.waitForSelector("#race-name");
    await s2.locator("#race-name").fill("Walk In Athlete"); await s2.locator("#race-phone").fill("01881234567");
    await s2.locator("input[name=gender][value=male]").check(); await s2.locator("input[name=category][value=MEN]").check();
    await s2.locator("#race-em-name").fill("Wife"); await s2.locator("#race-em-phone").fill("01011112222");
    await s2.locator("label:has-text('I confirm that I am medically fit') input").check();
    await s2.getByRole("button", { name: "Register athlete" }).click();
    await s2.waitForSelector("text=Give the athlete this private link");
    assert.equal(callsOf("race_staff_register_athlete").length, 1);
    assert.equal(callsOf("race_register_athlete").length, 2, "public path untouched by staff registration"); // earlier: dup + success
    assert.match(await s2.locator("input[aria-label=\"Athlete's private link\"]").inputValue(), /\/race\/e\/the-ninth-2026\/me#t=/);
    await s2.screenshot({ path: `${shots}/07-admin-registered.png` });
  });

  // ---------- reception check-in ----------
  const recCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await installMock(recCtx);
  const rec = await recCtx.newPage();
  await seedSession(rec);
  rec.on("pageerror", (e) => errors.push(`pageerror(reception): ${e.message}`));

  await step("reception asks a signed-out visitor to sign in (safe next link)", async () => {
    const anon = await desk.newPage();
    await anon.goto(`${BASE}/race/reception/locked-2026`); await anon.waitForSelector("text=Sign in required");
    assert.equal(await anon.locator("a", { hasText: "Sign in" }).getAttribute("href"), "/race/login?next=/race/reception/locked-2026");
    await anon.close();
  });

  await step("reception: the start queue shows order, LATE badges, slot times in event time, and 'no slot' athletes", async () => {
    await rec.goto(`${BASE}/race/reception/locked-2026`); await rec.waitForSelector("text=First Athlete");
    const text = await rec.locator("main").innerText();
    assert.match(text, /3 checked in/i); assert.match(text, /Late Athlete/); assert.match(text, /LATE/); assert.match(text, /No slot — Event Manager/i);
    assert.match(text, /09:01:00/, "07:01 UTC = 09:01 Cairo");
    assert.match(text, /≈ slot 10/, "the late athlete's projected slot (index 9) is shown as slot 10, not yet bound");
    assert.match(text, /SLOT 01/i, "a bound athlete shows a firm slot");
    await rec.getByRole("button", { name: "Heat 02" }).click();
    assert.equal(await rec.locator("tbody tr").count(), 1, "heat filter");
    await rec.getByRole("button", { name: "All" }).click();
    await rec.screenshot({ path: `${shots}/09-reception-queue.png`, fullPage: true });
  });

  await step("reception: typing a race number selects the athlete; a double-click checks in ONCE with only the registration id", async () => {
    await rec.locator("#race-checkin-search").fill("27");
    await rec.waitForSelector("text=Omar Fathy");
    await rec.screenshot({ path: `${shots}/10-reception-athlete.png` });
    const before = callsOf("race_check_in").length;
    await rec.getByRole("button", { name: "Check in", exact: true }).dblclick();
    // wait for the RESULT banner itself — the queue heading also says "checked in", so a bare text match would return before the request finished
    await rec.locator("[role=status]").filter({ hasText: /Checked in/i }).first().waitFor();
    const sent = callsOf("race_check_in").slice(before);
    assert.equal(sent.length, 1, `expected 1 request, sent ${sent.length}`);
    assert.deepEqual(sent[0].body, { p_registration_id: "r27" }, "only the athlete is sent — never a position, time or order");
    const banner = await rec.locator("[role=status]").innerText();
    assert.match(banner, /N027/); assert.match(banner, /Omar Fathy/i); assert.match(banner, /Heat 02/i); assert.match(banner, /position 4/i);
    assert.equal(await rec.locator("#race-checkin-search").inputValue(), "", "search cleared for the next athlete");
    assert.ok(await rec.evaluate(() => document.activeElement && document.activeElement.id === "race-checkin-search"), "focus returns to the search box");
    await rec.screenshot({ path: `${shots}/11-reception-checked-in.png` });
  });

  await step("reception: a late check-in is announced as LATE with 'next available start slot'", async () => {
    await rec.locator("#race-checkin-search").fill("31");
    await rec.waitForSelector("text=Late Larry");
    await rec.getByRole("button", { name: "Check in", exact: true }).click();
    await rec.locator("[role=status]").filter({ hasText: /Late check-in/i }).first().waitFor();
    assert.match(await rec.locator("[role=status]").innerText(), /next available start slot/i);
  });

  await step("reception: unpaid athlete is blocked with a clear reason and the button is disabled (no request)", async () => {
    const before = callsOf("race_check_in").length;
    await rec.locator("#race-checkin-search").fill("28");
    await rec.waitForSelector("text=Nada Sami");
    assert.match(await rec.locator("main").innerText(), /Payment not confirmed/i);
    assert.equal(await rec.getByRole("button", { name: "Check in", exact: true }).isDisabled(), true);
    assert.equal(callsOf("race_check_in").length, before);
  });

  await step("reception: no heat → blocked; already checked in → 'Show check-in' reports the original", async () => {
    await rec.locator("#race-checkin-search").fill("29");
    await rec.waitForSelector("text=No Heat Guy");
    assert.match(await rec.locator("main").innerText(), /No heat assigned/i);
    assert.equal(await rec.getByRole("button", { name: "Check in", exact: true }).isDisabled(), true);
    await rec.locator("#race-checkin-search").fill("30");
    await rec.waitForSelector("text=Already In");
    await rec.getByRole("button", { name: "Show check-in" }).click();
    await rec.waitForSelector("text=Already checked in");
  });

  await step("reception: several matches show a pick list; choosing one opens their card", async () => {
    await rec.locator("#race-checkin-search").fill("a");
    await rec.waitForSelector("ul[aria-label=Matches]");
    assert.ok((await rec.locator("ul[aria-label=Matches] li").count()) >= 2);
    await rec.locator("ul[aria-label=Matches] button", { hasText: "Nada Sami" }).click();
    await rec.waitForSelector("text=Payment not confirmed");
  });

  await step("reception: before heats are locked check-in is closed, with a notice", async () => {
    const p = await recCtx.newPage();
    await p.goto(`${BASE}/race/reception/the-ninth-2026`); await p.waitForSelector("text=Check-in opens when the Event Manager locks the heats");
    await p.close();
  });


  // ---------- Master Control ----------
  const ctlPage = await recCtx.newPage();
  await seedSession(ctlPage);
  ctlPage.on("pageerror", (e) => errors.push(`pageerror(control): ${e.message}`));
  const clockText = () => ctlPage.locator("[data-testid=race-clock]").innerText();

  await step("control: a signed-out visitor is asked to sign in", async () => {
    const anon = await desk.newPage();
    await anon.goto(`${BASE}/race/control/locked-2026`); await anon.waitForSelector("text=Sign in required");
    assert.equal(await anon.locator("a", { hasText: "Sign in" }).getAttribute("href"), "/race/login?next=/race/control/locked-2026");
    await anon.close();
  });

  await step("control: before the start — START EVENT needs a second, explicit confirmation", async () => {
    await ctlPage.goto(`${BASE}/race/control/locked-2026`); await ctlPage.waitForSelector("text=START EVENT");
    assert.equal(await clockText(), "0:00");
    assert.equal(callsOf("race_start_event").length, 0);
    await ctlPage.getByRole("button", { name: "START EVENT", exact: true }).click();
    await ctlPage.waitForSelector("text=Confirm — START EVENT");
    assert.equal(callsOf("race_start_event").length, 0, "one tap must not start the race");
    await ctlPage.screenshot({ path: `${shots}/12-control-before.png`, fullPage: true });
  });

  await step("control: a double-click on confirm starts the race ONCE, with only the event id", async () => {
    await ctlPage.getByRole("button", { name: "Confirm — START EVENT" }).dblclick();
    await ctlPage.waitForSelector("text=Race started");
    assert.equal(callsOf("race_start_event").length, 1);
    assert.deepEqual(callsOf("race_start_event")[0].body, { p_event_id: LOCKED_ID });
  });

  await step("control: PRE-RACE countdown to the first athlete, then the race clock runs from 0:00", async () => {
    await ctlPage.waitForSelector("[data-testid=pre-race]");
    assert.match(await ctlPage.locator("[data-testid=pre-race]").innerText(), /first athlete in (0:5\d|1:00)/i);
    assert.match(await ctlPage.locator("main").innerText(), /PRE-RACE/);
    const a = await clockText(); await ctlPage.waitForTimeout(1300); const b = await clockText();
    assert.notEqual(a, b, "the clock ticks");
    assert.match(await ctlPage.locator("[data-testid=next-countdown]").innerText(), /0:5\d|1:00/);
    assert.match(await ctlPage.locator("main").innerText(), /N001/);
    await ctlPage.screenshot({ path: `${shots}/13-control-prerace.png`, fullPage: true });
  });

  await step("control: the dashboard refreshes about once a second — and sends NO engine tick (the race does not depend on devices)", async () => {
    const before = callsOf("race_control_state").length;
    await ctlPage.waitForTimeout(2500);
    assert.ok(callsOf("race_control_state").length - before >= 2, "the picture refreshes every second");
    assert.equal(callsOf("race_advance").length, 0, "the Master Control screen never drives the race");
  });

  await step("control: EMERGENCY PAUSE freezes the clock on screen; RESUME continues it", async () => {
    await ctlPage.getByRole("button", { name: "EMERGENCY PAUSE" }).click();
    await ctlPage.waitForSelector("text=RESUME RACE");
    assert.equal(callsOf("race_pause").length, 1);
    assert.deepEqual(callsOf("race_pause")[0].body, { p_event_id: LOCKED_ID, p_reason: null });
    assert.match(await ctlPage.locator("main").innerText(), /PAUSED/);
    const a = await clockText(); await ctlPage.waitForTimeout(1500); const b = await clockText();
    assert.equal(a, b, "a paused clock does not move");
    await ctlPage.screenshot({ path: `${shots}/14-control-paused.png`, fullPage: true });
    await ctlPage.getByRole("button", { name: "RESUME RACE" }).click();
    await ctlPage.waitForSelector("text=EMERGENCY PAUSE");
    assert.equal(callsOf("race_resume").length, 1);
    const c = await clockText(); await ctlPage.waitForTimeout(1300); const d = await clockText();
    assert.notEqual(c, d, "the clock runs again after resume");
  });

  await step("control: nine station cards; Station 01 shows the athlete and a live countdown", async () => {
    assert.equal(await ctlPage.locator("[data-testid^=station-]").count(), 9);
    const t = await ctlPage.locator("[data-testid=station-1]").innerText();
    assert.match(t, /N003/); assert.match(t, /WORK/);
  });

  await step("control: SKIP needs a reason, then sends only the slot id and the reason", async () => {
    await ctlPage.getByRole("button", { name: "SKIP", exact: true }).click();
    const confirm = ctlPage.getByRole("button", { name: /Confirm skip N002/ });
    assert.equal(await confirm.isDisabled(), true);
    await ctlPage.locator("#skip-reason-slot-n002").fill("Not at the start line");
    assert.equal(await confirm.isDisabled(), false);
    await confirm.click();
    await ctlPage.waitForSelector("text=slot 02 stays empty");
    assert.deepEqual(callsOf("race_skip_athlete")[0].body, { p_slot_id: "slot-n002", p_reason: "Not at the start line" });
  });

  await step("control: DNS override reports NO SLOT AVAILABLE plainly and nobody is displaced", async () => {
    await ctlPage.getByRole("button", { name: "Override DNS" }).click();
    const confirm = ctlPage.getByRole("button", { name: "Confirm", exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await ctlPage.locator("[id^=ex-reason-dns]").fill("Arrived 20 minutes late");
    await confirm.click();
    await ctlPage.waitForSelector("text=nobody was displaced");
    assert.deepEqual(callsOf("race_override_dns")[0].body, { p_registration_id: "d4", p_reason: "Arrived 20 minutes late" });
  });

  await step("control: a late athlete with no slot can be moved — only to a LATER heat, with a reason", async () => {
    await ctlPage.getByRole("button", { name: "Move to later heat" }).click();
    const options = await ctlPage.locator("select option").allInnerTexts();
    assert.ok(options.includes("Heat 02") && !options.includes("Heat 01") && !options.includes("Heat 03"), `only later heats that already have a schedule are offered: ${options}`);
    await ctlPage.locator("select").last().selectOption("2");
    await ctlPage.locator("[id^=ex-reason-move]").fill("Arrived after heat 1 closed");
    await ctlPage.getByRole("button", { name: "Confirm", exact: true }).click();
    await ctlPage.waitForSelector("text=moved to heat 02");
    assert.deepEqual(callsOf("race_move_athlete_later_heat")[0].body, { p_registration_id: "q3", p_target_heat_number: 2, p_reason: "Arrived after heat 1 closed" });
  });

  await step("control: correcting a wrong check-in sends both athletes and the reason; the screen says the original is kept", async () => {
    await ctlPage.locator("section[aria-label='Correct check-in'] button", { hasText: "Open" }).click();
    assert.match(await ctlPage.locator("section[aria-label='Correct check-in']").innerText(), /original check-in is kept/i);
    await ctlPage.locator("section[aria-label='Correct check-in'] select").selectOption("q1");
    await ctlPage.locator("#correct-right-search").fill("31");
    await ctlPage.waitForSelector("text=Late Larry");
    await ctlPage.locator("#correct-reason").fill("Wrong wristband scanned");
    await ctlPage.getByRole("button", { name: "Apply correction" }).click();
    await ctlPage.waitForSelector("text=start slot handed over");
    assert.deepEqual(callsOf("race_correct_check_in")[0].body, { p_old_registration_id: "q1", p_new_registration_id: "late1", p_reason: "Wrong wristband scanned" });
  });

  await step("control: a manual heat that will never run can be closed — reason required, audited server-side, no start time is typed", async () => {
    await ctlPage.getByRole("button", { name: "CLOSE HEAT WITHOUT START" }).click();
    const confirm = ctlPage.getByRole("button", { name: /Confirm — close heat 03/ });
    assert.equal(await confirm.isDisabled(), true);
    await ctlPage.locator("#close-heat-reason").fill("Only two athletes showed up");
    await confirm.click();
    await ctlPage.waitForSelector("text=9 athletes are DNS");
    assert.deepEqual(callsOf("race_close_heat_without_start")[0].body, { p_event_id: LOCKED_ID, p_heat_number: 3, p_reason: "Only two athletes showed up" });
  });

  await step("control: EMERGENCY PAUSE takes an optional note and never requires one", async () => {
    await ctlPage.locator("#pause-note").fill("medical");
    await ctlPage.getByRole("button", { name: "EMERGENCY PAUSE" }).click();
    await ctlPage.waitForSelector("text=RESUME RACE");
    assert.deepEqual(callsOf("race_pause").at(-1).body, { p_event_id: LOCKED_ID, p_reason: "medical" });
    await ctlPage.getByRole("button", { name: "RESUME RACE" }).click();
    await ctlPage.waitForSelector("text=EMERGENCY PAUSE");
  });

  await step("control: the dashboard fits a landscape tablet and a phone without sideways scrolling", async () => {
    await ctlPage.setViewportSize({ width: 1024, height: 768 });
    assert.ok(await ctlPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "1024px wide");
    await ctlPage.screenshot({ path: `${shots}/15-control-tablet.png`, fullPage: true });
    await ctlPage.setViewportSize({ width: 390, height: 844 });
    const wide = await ctlPage.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => !el.closest(".overflow-x-auto") && el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 4).map((el) => `${el.tagName}.${el.className}`.slice(0, 60)));
    assert.deepEqual(wide, [], "elements wider than the phone screen");
    assert.ok(await ctlPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "390px wide");
  });

  await step("control: a user without control rights sees the refusal, not a broken screen", async () => {
    ctl.forbidden = true;
    const p = await recCtx.newPage();
    await p.goto(`${BASE}/race/control/locked-2026`);
    await p.waitForSelector("text=not allowed");
    assert.equal(await p.getByRole("button", { name: "START EVENT" }).count(), 0, "no control buttons without a snapshot");
    await p.close();
    ctl.forbidden = false;
  });


  // ---------- Judge ----------
  const jp = await recCtx.newPage();
  await seedSession(jp);
  jp.on("pageerror", (e) => errors.push(`pageerror(judge): ${e.message}`));
  const tally = () => jp.locator("[data-testid=tally]").innerText();
  const recCalls = () => callsOf("race_record_action");
  const until = async (cond, what) => { for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 100)); assert.ok(cond(), what); };

  await step("judge: the console shows the athlete, the movement, the time left and the live tally", async () => {
    await jp.goto(`${BASE}/race/judge/locked-2026/1`); await jp.waitForSelector("[data-testid=athlete]");
    const t = await jp.locator("[data-testid=athlete]").innerText();
    assert.match(t, /N001/); assert.match(t, /judge test athlete/i); assert.match(t, /Barbell Squat/);
    assert.match(await jp.locator("[data-testid=countdown]").innerText(), /2:[0-9]{2}/);
    assert.equal((await tally()).trim(), "0");
    await jp.screenshot({ path: `${shots}/16-judge.png`, fullPage: true });
  });

  await step("judge: every tap has its OWN client id, sends only the athlete/action — never a time or a score", async () => {
    const before = recCalls().length;
    await jp.getByRole("button", { name: "+ REP" }).click(); await jp.waitForFunction(() => document.querySelector("[data-testid=tally]").textContent.trim() === "1");
    await jp.getByRole("button", { name: "+ REP" }).click(); await jp.waitForFunction(() => document.querySelector("[data-testid=tally]").textContent.trim() === "2");
    const sent = recCalls().slice(before);
    assert.equal(sent.length, 2);
    assert.notEqual(sent[0].body.p_client_event_id, sent[1].body.p_client_event_id);
    assert.match(sent[0].body.p_client_event_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(sent[0].body).sort(), ["p_client_event_id", "p_device_race_ms", "p_device_recorded_at", "p_device_seq", "p_origin", "p_station_result_id", "p_type", "p_value", "p_voids_event_id", "p_device_id"].filter((k) => k in sent[0].body).sort());
    for (const k of ["server_race_ms", "score", "p_score", "p_server_race_ms"]) assert.ok(!(k in sent[0].body), `no ${k} is ever sent`);
    assert.equal(sent[0].body.p_origin, "ONLINE");
    assert.equal(sent[0].body.p_station_result_id, "res-1");
  });

  await step("judge: a tap while OFFLINE is saved, shown as waiting, and sent once — as OFFLINE_QUEUE with the SAME id — when the connection returns", async () => {
    jd.mode = "drop";
    const before = recCalls().length;
    await jp.getByRole("button", { name: "+ REP" }).click();
    await jp.waitForSelector("text=1 waiting to send");
    await until(() => recCalls().length > before, "the first attempt reached the network layer");
    const firstTry = recCalls().slice(before)[0].body;
    jd.mode = "ok";
    await jp.waitForSelector("text=All sent", { timeout: 15000 });
    const attempts = recCalls().slice(before).filter((c) => c.body.p_client_event_id === firstTry.p_client_event_id);
    assert.ok(attempts.length >= 2, "it was retried");
    assert.equal(attempts.at(-1).body.p_origin, "OFFLINE_QUEUE");
    assert.ok(attempts.at(-1).body.p_device_recorded_at && attempts.at(-1).body.p_device_seq >= 1, "a replay carries its device time and sequence number");
    assert.equal(jd.events.size, 3, "the server holds exactly 3 events");
    assert.equal((await tally()).trim(), "3");
  });

  await step("judge: a LOST RESPONSE (server recorded it, the answer never arrived) is retried with the same id and counted ONCE", async () => {
    jd.mode = "lose-response";
    await jp.getByRole("button", { name: "+ REP" }).click();
    await jp.waitForSelector("text=1 waiting to send");
    for (let i = 0; i < 50 && jd.events.size < 4; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(jd.events.size, 4, "the server already recorded it");
    jd.mode = "ok";
    await jp.waitForSelector("text=All sent", { timeout: 15000 });
    assert.equal(jd.events.size, 4, "the retry created NO second event");
    assert.equal((await tally()).trim(), "4");
  });

  await step("judge: a reload with unsent taps loses nothing (the outbox lives on the device)", async () => {
    jd.mode = "drop";
    await jp.getByRole("button", { name: "+ REP" }).click();
    await jp.waitForSelector("text=1 waiting to send");
    await jp.reload(); await jp.waitForSelector("[data-testid=athlete]"); await jp.waitForSelector("text=1 waiting to send");
    jd.mode = "ok";
    await jp.waitForSelector("text=All sent", { timeout: 15000 });
    assert.equal(jd.events.size, 5);
  });

  await step("judge: an action that arrived after the lock is shown as NOT counted", async () => {
    jd.late = true;
    await jp.getByRole("button", { name: "+ REP" }).click();
    await jp.waitForSelector("text=NOT counted");
    jd.late = false;
    assert.equal((await tally()).trim(), "5", "the rejected rep is not in the tally");
  });

  await step("judge: a refusal (not your station) is parked with its reason and never retried", async () => {
    jd.refuse = true;
    const before = recCalls().length;
    await jp.getByRole("button", { name: "+ REP" }).click();
    await jp.waitForSelector("text=Refused (not retried)");
    await jp.waitForTimeout(3500);
    assert.equal(recCalls().length - before, 1, "sent once, not retried");
    jd.refuse = false;
  });


  // ---------- Station screen (display-only, 1080 x 1920) ----------
  const tv = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  await installMock(tv);
  for (const pg of recCtx.pages()) await pg.close();                      // only the screen talks to the mock from here on
  const sp = await tv.newPage();
  await seedSession(sp);
  sp.on("pageerror", (e) => errors.push(`pageerror(screen): ${e.message}`));
  const scState = () => sp.locator("[data-testid=screen-state]").getAttribute("data-state").catch(() => null);
  // nothing may be clipped: the state's content must fit inside the 1920px stage and its own box
  const scFits = async (state) => { const r = await sp.locator("[data-testid=screen-state]").evaluate((e) => { const b = e.getBoundingClientRect(); const kids = [...e.querySelectorAll("*")].filter((k) => k.children.length === 0 && k.textContent.trim()); return { over: e.scrollHeight - e.clientHeight, low: Math.max(0, ...kids.map((k) => k.getBoundingClientRect().bottom - b.bottom)), wide: Math.max(0, ...kids.map((k) => { const r = k.getBoundingClientRect(); return Math.max(b.left - r.left, r.right - b.right); })), n: kids.length }; }); assert.ok(r.over <= 1 && r.low <= 1 && r.wide <= 1, `${state} overflows its stage by ${r.over}/${r.low}/${r.wide}px`); };
  const scText = () => sp.locator("[data-testid=screen-stage]").innerText();
  const scUntil = async (state, what) => { let last = null; for (let i = 0; i < 60; i++) { last = await scState(); if (last === state) { await scFits(state); return; } await new Promise((r) => setTimeout(r, 100)); } assert.fail(`${what}: expected ${state}, screen shows ${last}`); };
  const screenCalls = () => calls.slice(scCallsFrom).map((c) => c.fn);
  let scCallsFrom = 0;

  await step("screen: portrait 1080x1920 stage, black/red/white, and NO controls of any kind", async () => {
    scSet(0);
    scCallsFrom = calls.length;
    await sp.goto(`${BASE}/race/station/locked-2026/1`);
    await scUntil("WAITING", "before the first athlete");
    const box = await sp.locator("[data-testid=screen-stage]").boundingBox();
    assert.equal(Math.round(box.width), 1080); assert.equal(Math.round(box.height), 1920);
    assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.001, "9:16");
    assert.equal(await sp.locator("button, input, select, textarea, a, [role=button]").count(), 0, "no buttons, inputs or links on a signed-in screen");
    const bg = await sp.locator("[data-testid=screen-stage]").evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(bg, "rgb(5, 5, 5)");
    const t = await scText();
    assert.match(t, /STATION 01/); assert.match(t, /SQUAT/);
    // very large type: the countdown is at least 200px tall on the 1920px stage
    const fs = await sp.locator("[data-testid=screen-countdown]").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(fs >= 200, `countdown font ${fs}px`);
  });

  await step("screen WAITING: station number + name, athlete not yet announced -> countdown to the next athlete", async () => {
    scSet(20000);
    await scUntil("WAITING", "waiting"); await new Promise((r) => setTimeout(r, 1200));
    assert.match(await scText(), /N001/); assert.match(await scText(), /WAITING/); assert.match(await sp.locator("[data-testid=screen-countdown]").innerText(), /^(39|40)$/);
    await sp.screenshot({ path: `${shots}/17-screen-waiting.png` });
  });

  await step("screen GET READY: athlete code, GET READY, 10-second countdown", async () => {
    scSet(50500);
    await scUntil("GET_READY", "get ready");
    const t = await scText(); assert.match(t, /N001/); assert.match(t, /GET READY/);
    assert.match(await sp.locator("[data-testid=screen-countdown]").innerText(), /^(9|10)$/);
    await sp.screenshot({ path: `${shots}/18-screen-get-ready.png` });
  });

  await step("screen WORK: athlete code, station name, big remaining time, live score, clear WORK state", async () => {
    scSet(100000);
    await scUntil("WORK", "work");
    const t = await scText(); assert.match(t, /N001/); assert.match(t, /SQUAT/); assert.match(t, /WORK/);
    assert.match(await sp.locator("[data-testid=screen-countdown]").innerText(), /^2:(0[0-9]|[1-5][0-9])$/);
    assert.equal((await sp.locator("[data-testid=screen-score]").innerText()).trim(), "4", "score derived server-side (4 tens of seconds)");
    await sp.screenshot({ path: `${shots}/19-screen-work.png` });
  });

  await step("screen TRANSITION: TIME, final score, MOVE TO STATION 02, 30-second countdown", async () => {
    scSet(240500);
    await scUntil("TRANSITION", "transition");
    const t = await scText(); assert.match(t, /TIME/); assert.match(t, /MOVE TO STATION 02/);
    assert.equal((await sp.locator("[data-testid=screen-score]").innerText()).trim(), "18", "the final score is frozen at 3:00");
    assert.match(await sp.locator("[data-testid=screen-countdown]").innerText(), /^(29|30)$/);
    assert.match(await sp.locator("[data-testid=screen-strip]").innerText(), /NEXT\s+N002/i, "the incoming athlete is shown on the strip");
    await sp.screenshot({ path: `${shots}/20-screen-transition.png` });
  });

  await step("screen NEXT ATHLETE: a skipped athlete leaves an empty slot; the screen shows the honest gap, then the next athlete", async () => {
    scSet(560000);                        // N002 done at 7:30; slot 3 (N003) skipped; N004 not yet announced
    await scUntil("NEXT_ATHLETE", "gap after the skipped athlete");
    assert.match(await scText(), /NEXT ATHLETE/); assert.doesNotMatch(await scText(), /N003/, "the skipped athlete is never shown");
    scSet(645000);
    await new Promise((r) => setTimeout(r, 1200));
    assert.match(await scText(), /N004/);
    await sp.screenshot({ path: `${shots}/21-screen-next-athlete.png` });
  });

  await step("screen DNF: a withdrawn athlete disappears; EMPTY SLOT: nothing is shown for it", async () => {
    scSet(740000); await scUntil("WORK", "N004 working");
    scSet(760000); await scUntil("NEXT_ATHLETE", "N004 withdrawn"); assert.doesNotMatch(await scText(), /N004/);
    scSet(1000000); await new Promise((r) => setTimeout(r, 1200));
    assert.match(await scText(), /STATION FREE/);
  });

  await step("screen PAUSED: RACE PAUSED / PLEASE WAIT FOR OFFICIAL, and RESUME continues from the frozen moment", async () => {
    scSet(100000); await scUntil("WORK", "work");
    sc.baseMs = 100000; sc.paused = true;
    await scUntil("PAUSED", "paused");
    const t = await scText(); assert.match(t, /RACE\s+PAUSED/); assert.match(t, /PLEASE WAIT FOR OFFICIAL/);
    await sp.screenshot({ path: `${shots}/22-screen-paused.png` });
    await new Promise((r) => setTimeout(r, 2500));                       // pause for 2.5 s of real time
    scSet(100000);                                                        // resume: race time continues from the frozen moment
    await scUntil("WORK", "resumed");
    const left = await sp.locator("[data-testid=screen-countdown]").innerText();
    assert.match(left, /^2:(1[5-9]|20)$/, `no time added by the pause: ${left}`);
  });

  await step("screen RECONNECT during WORK: 30 s offline -> the correct remaining time at once, nothing restarted, score kept", async () => {
    scSet(100000); await scUntil("WORK", "work");
    const before = calls.length;
    sc.mode = "drop";
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await scState(), "WORK", "keeps counting locally while offline (display only)");
    sc.baseMs += 30000;                                                   // the race carried on for 30 s without the screen
    sc.mode = "ok";
    await scUntil("WORK", "reconnected");
    await new Promise((r) => setTimeout(r, 1200));
    const left = await sp.locator("[data-testid=screen-countdown]").innerText();
    assert.match(left, /^1:(0[0-9]|[1-5][0-9])$/, `race time ~130-133 s -> about 1:45 left, got ${left}`);
    assert.ok(parseInt(left.split(":")[1], 10) >= 40 && parseInt(left.split(":")[1], 10) <= 50, `remaining ${left}`);
    assert.ok(parseInt(await sp.locator("[data-testid=screen-score]").innerText(), 10) >= 7, "score not lost (71 s into the window = 7)");
    const fns = calls.slice(before).map((c) => c.fn); assert.deepEqual([...new Set(fns)], ["race_station_screen"], "reconnecting only READS");
  });

  await step("screen RECONNECT across the 3:00 boundary: WORK -> TRANSITION with the right countdown", async () => {
    scSet(235000); await scUntil("WORK", "work");
    sc.mode = "drop"; await new Promise((r) => setTimeout(r, 1000));
    sc.baseMs += 20000; sc.mode = "ok";                                   // offline across 4:00, back at ~4:16
    await scUntil("TRANSITION", "boundary crossed while offline");
    const left = parseInt(await sp.locator("[data-testid=screen-countdown]").innerText(), 10);
    assert.ok(left >= 12 && left <= 16, `remaining ${left}`);
    assert.equal((await sp.locator("[data-testid=screen-score]").innerText()).trim(), "18", "final score = the score at 3:00, not at reconnect time");
  });

  await step("screen RECONNECT during TRANSITION and during PAUSE", async () => {
    scSet(250000); await scUntil("TRANSITION", "transition");
    sc.mode = "drop"; await new Promise((r) => setTimeout(r, 800)); sc.baseMs += 10000; sc.mode = "ok";
    await new Promise((r) => setTimeout(r, 1300));
    assert.notEqual(await scState(), "WORK");
    scSet(100000); await scUntil("WORK", "work");
    sc.mode = "drop"; await new Promise((r) => setTimeout(r, 800));
    sc.baseMs = scRace(); sc.paused = true; sc.mode = "ok";              // paused while the screen was offline
    await scUntil("PAUSED", "pause discovered on reconnect");
    sc.paused = false; sc.baseAt = Date.now(); sc.mode = "ok";
  });

  await step("screen shows a RECONNECTING banner only after ~10 s without an answer, and it clears on reconnect", async () => {
    scSet(100000); await scUntil("WORK", "work");
    assert.equal(await sp.locator("[data-testid=screen-lost]").count(), 0);
    sc.mode = "drop"; await new Promise((r) => setTimeout(r, 11500));
    assert.equal(await sp.locator("[data-testid=screen-lost]").count(), 1, "banner after 10 s");
    await sp.screenshot({ path: `${shots}/23-screen-reconnecting.png` });
    sc.mode = "ok"; await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await sp.locator("[data-testid=screen-lost]").count(), 0, "cleared");
  });

  await step("screen SECURITY: it only reads (event lookup + race_station_screen) — no score, pause, skip or edit call exists", async () => {
    const fns = [...new Set(screenCalls())].sort();
    assert.deepEqual(fns, ["race_get_public_event", "race_station_display", "race_station_screen"]);
  });

  await step("screen signed out: only a sign-in prompt, no race data", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); await installMock(ctx);
    const p = await ctx.newPage(); await p.goto(`${BASE}/race/station/locked-2026/1`);
    await p.waitForSelector("text=SIGN IN THIS SCREEN");
    assert.equal(await p.locator("[data-testid=screen-state]").count(), 0);
    await ctx.close();
  });

  await step("screen scales the 1080x1920 stage to a smaller portrait TV without distortion", async () => {
    const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } }); await installMock(ctx);
    const p = await ctx.newPage(); await seedSession(p); scSet(100000);
    await p.goto(`${BASE}/race/station/locked-2026/3`); await p.waitForSelector("[data-testid=screen-state]");
    const box = await p.locator("[data-testid=screen-stage]").boundingBox();
    assert.equal(Math.round(box.width), 540); assert.equal(Math.round(box.height), 960);
    assert.match(await p.locator("[data-testid=screen-station-name]").innerText(), /STATION 03/i);
    await ctx.close();
  });


  // ---------- Results & rankings ----------
  const pub = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await installMock(pub);
  const rp = await pub.newPage();
  rp.on("pageerror", (e) => errors.push(`pageerror(results): ${e.message}`));
  const rkText = () => rp.locator("[data-testid=results]").innerText();

  await step("results: before the race is under way the public page says so (no data, no error)", async () => {
    await rp.goto(`${BASE}/race/e/the-ninth-2026/results`);
    await rp.waitForSelector("[data-testid=results-unavailable]");
    assert.match(await rp.locator("[data-testid=results-unavailable]").innerText(), /once the race is under way/i);
  });
  await step("results: PROVISIONAL leaderboard — places, tied places shown as T2, points, who is still racing, DNS/DNF listed", async () => {
    await rp.goto(`${BASE}/race/e/locked-2026/results`);
    await rp.waitForSelector("[data-testid=leaderboard]");
    assert.equal(await rp.locator("[data-testid=results]").getAttribute("data-official"), "false");
    const t = await rkText();
    assert.match(t, /PROVISIONAL/i); assert.match(t, /2 still racing/i); assert.match(t, /Live · provisional/i);
    const rows = await rp.locator("[data-testid=row]").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
    assert.equal(rows.length, 4);
    assert.match(rows[0], /^1 N004 Omar F\. 12/); assert.match(rows[1], /^T2 N001/); assert.match(rows[2], /^T2 N007/); assert.match(rows[3], /^4 N011 Sara M\. 21/);
    assert.match(await rp.locator("[data-testid=excluded]").innerText(), /N005 Hany S\. — DNS/); assert.match(await rp.locator("[data-testid=excluded]").innerText(), /N030 Omar Z\. — DNF/);
    await rp.screenshot({ path: `${shots}/24-results-provisional-mobile.png`, fullPage: true });
  });
  await step("results privacy: the public page shows race number + 'First L.' only — no phone, e-mail, surname or id", async () => {
    const html = await rp.content();
    assert.doesNotMatch(html, /0100\d{7}|@x\.test|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    assert.doesNotMatch(await rkText(), /Fathy|Mohamed Ali/);
  });
  await step("results: the category tabs switch the board; an empty category says 'No finishers yet'", async () => {
    await rp.getByRole("tab", { name: "Women", exact: true }).click();
    await rp.waitForSelector("text=No finishers yet");
    await rp.getByRole("tab", { name: "Men", exact: true }).click();
    await rp.waitForSelector("[data-testid=leaderboard]");
  });

  const sc2 = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await installMock(sc2);
  const rd = await sc2.newPage(); await seedSession(rd);
  rd.on("pageerror", (e) => errors.push(`pageerror(results desk): ${e.message}`));
  const publishBtn = () => rd.getByRole("button", { name: "PUBLISH OFFICIAL RESULTS" });
  await step("results desk: publishing is blocked and the blockers are named", async () => {
    await rd.goto(`${BASE}/race/control/locked-2026/results`);
    await rd.waitForSelector("[data-testid=blockers] li");
    assert.match(await rd.locator("[data-testid=blockers]").innerText(), /2 athletes are still racing/);
    assert.equal(await publishBtn().isDisabled(), true, "publish is disabled while anything is open");
    await rd.screenshot({ path: `${shots}/25-results-desk-blocked.png`, fullPage: true });
  });
  await step("results desk: once everything is confirmed, publishing needs a deliberate second click and happens ONCE", async () => {
    rk.racing = 0; rk.status = "FINISHED";
    await rd.getByRole("button", { name: "Refresh" }).click();
    await rd.waitForFunction(() => /ready to publish/i.test(document.querySelector("[data-testid=blockers]")?.textContent ?? ""));
    // the mock event is HEATS_LOCKED, so the page keeps publishing closed until the race has finished
    assert.equal(await publishBtn().isDisabled(), true, "closed until the event has finished");
    assert.match(await rd.locator("[data-testid=publish-card]").innerText(), /opens when the race has finished/i);
  });

  const fin = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await installMock(fin);
  await fin.route(`${SB}/rest/v1/rpc/race_get_public_event`, async (route) => {      // registered last = wins: this event has FINISHED
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...LOCKED, status: "FINISHED" }) });
  });
  const rf = await fin.newPage(); await seedSession(rf);
  rf.on("pageerror", (e) => errors.push(`pageerror(results desk 2): ${e.message}`));
  await step("results desk: FINISHED + nothing open → PUBLISH asks for confirmation, then publishes exactly once", async () => {
    await rf.goto(`${BASE}/race/control/locked-2026/results`);
    await rf.waitForFunction(() => /ready to publish/i.test(document.querySelector("[data-testid=blockers]")?.textContent ?? ""));
    const before = callsOf("race_publish_results").length;
    await rf.getByRole("button", { name: "PUBLISH OFFICIAL RESULTS" }).click();
    assert.equal(callsOf("race_publish_results").length, before, "the first click only asks");
    await rf.getByRole("button", { name: /YES — PUBLISH/ }).click();
    await rf.waitForSelector("[data-testid=results-msg]");
    assert.equal(callsOf("race_publish_results").length, before + 1); assert.equal(rk.published, 1);
    assert.match(await rf.locator("[data-testid=publish-card]").innerText(), /OFFICIAL/);
    await rf.screenshot({ path: `${shots}/26-results-desk-published.png`, fullPage: true });
  });
  await step("results: the public page now shows the OFFICIAL leaderboard", async () => {
    await rp.reload(); await rp.waitForSelector("[data-testid=leaderboard]");
    assert.equal(await rp.locator("[data-testid=results]").getAttribute("data-official"), "true");
    assert.match(await rkText(), /OFFICIAL/); assert.doesNotMatch(await rkText(), /still racing/);
    await rp.screenshot({ path: `${shots}/27-results-official-mobile.png`, fullPage: true });
  });
  await step("results corrections: find an athlete, a reason is mandatory, the correction is sent exactly as typed and the board moves", async () => {
    await rf.getByLabel("Race number").fill("4");
    await rf.getByRole("button", { name: "Find athlete" }).click();
    await rf.waitForSelector("[data-testid=athlete-results]");
    assert.match(await rf.locator("[data-testid=athlete-results]").innerText(), /N004 · Omar Fathy/i);
    await rf.getByRole("button", { name: "Edit score" }).nth(1).click();
    const save = rf.getByRole("button", { name: "SAVE CORRECTION" });
    await rf.getByLabel("New score").fill("40");
    assert.equal(await save.isDisabled(), true, "no reason, no save");
    await rf.getByLabel("Reason (required)").fill("judge miscounted — video review");
    await save.click();
    await rf.waitForSelector("[data-testid=correction-done]");
    const c = rk.corrections.at(-1);
    assert.deepEqual({ field: c.p_field, value: c.p_value, reason: c.p_reason, result: c.p_result_id }, { field: "official_score", value: 40, reason: "judge miscounted — video review", result: "res-4-2" });
    await rf.screenshot({ path: `${shots}/28-results-correction.png`, fullPage: true });
    await rp.reload(); await rp.waitForSelector("[data-testid=leaderboard]");
    const rows = await rp.locator("[data-testid=row]").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
    assert.match(rows[3], /N004 Omar F\. 22/, "the corrected athlete dropped to last");
  });
  await step("results corrections: an unknown race number is refused with a clear message", async () => {
    await rf.getByLabel("Race number").fill("999");
    await rf.getByRole("button", { name: "Find athlete" }).click();
    await rf.waitForSelector("text=Not found");
  });

  // ---------- Rowing (Station 09): CAPTURE -> OCR -> CONFIRM / RETAKE -> OFFICIAL ----------
  for (const c of [tv, pub, sc2, fin]) { try { await c.close(); } catch { /* already closed */ } }     // nothing else polls the mock from here on
  const rwFrom = calls.length;
  const displayPng = async (text, name) => {
    const pg = await browser.newPage();
    const url = await pg.evaluate((t) => { const c = document.createElement("canvas"); c.width = 900; c.height = 520; const x = c.getContext("2d"); x.fillStyle = "#0b0b0b"; x.fillRect(0, 0, 900, 520);
      x.fillStyle = "#f2f2f2"; x.font = "bold 250px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(t, 450, 270); return c.toDataURL("image/png"); }, text);
    await pg.close();
    const file = path.join(shots, name); fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64")); return file;
  };
  const jc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await installMock(jc);
  const jr = await jc.newPage(); await seedSession(jr);
  jr.on("pageerror", (e) => errors.push(`pageerror(rowing): ${e.message}`));
  const card = (race) => jr.locator(`[data-testid=rowing-card][data-race-number=${race}]`);
  const scripted = (text, confidence, digits = true) => jr.evaluate(([t, c, d]) => {
    window.__raceE2eOcr = { name: "scripted", recognize: async () => ({ text: t, words: d && c !== null ? [{ text: t.replace(/\D/g, ""), confidence: c }] : [], confidence: c, engine: "scripted@1" }) };
  }, [text, confidence, digits]);
  const unscripted = () => jr.evaluate(() => { delete window.__raceE2eOcr; });
  const rwUntil = async (cond, what, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end && !(await cond())) await new Promise((r) => setTimeout(r, 100)); assert.ok(await cond(), what); };
  const stateOf = (race) => card(race).locator("[data-testid=evidence-state]").innerText();

  await step("rowing judge: while the 3:00 work window is open there is NO capture control — the display is not final", async () => {
    rwSet(1800000);
    await jr.goto(`${BASE}/race/judge/locked-2026/9`); await jr.waitForSelector("[data-testid=rowing-card]");
    assert.equal(await card("N001").getAttribute("data-phase"), "WORK");
    assert.match(await card("N001").locator("[data-testid=wait]").innerText(), /3:00 WORK WINDOW IS OPEN/i);
    assert.equal(await jr.locator("[data-testid=capture-input]").count(), 0);
    assert.match(await stateOf("N001"), /PENDING EVIDENCE/i);
    await jr.screenshot({ path: `${shots}/29-rowing-work-wait.png`, fullPage: true });
  });
  await step("rowing judge: after 3:00 the CAPTURE DISPLAY PHOTO button appears; the transition clock runs", async () => {
    rwSet(1925000);
    await rwUntil(async () => (await card("N001").getAttribute("data-phase")) === "TRANSITION", "transition phase");
    assert.equal(await jr.locator("[data-testid=capture-input]").count(), 1);
    assert.match(await card("N001").innerText(), /CAPTURE DISPLAY PHOTO/i);
    assert.match(await card("N001").locator("[data-testid=phase-clock]").innerText(), /TRANSITION 0:[0-2][0-9]/);
    await jr.screenshot({ path: `${shots}/30-rowing-capture.png`, fullPage: true });
  });
  await step("rowing: a REAL OCR engine (tesseract.js, in the browser) reads '842 m' from the photo; raw output, distance and confidence are sent", async () => {
    await unscripted();
    const file = await displayPng("842 m", "display-842.png");
    await jr.setInputFiles("[data-testid=capture-input]", file);
    await jr.waitForSelector("[data-testid=ocr-distance]", { timeout: 90000 });
    assert.equal((await card("N001").locator("[data-testid=ocr-distance]").innerText()).trim().toLowerCase(), "842 m");
    await rwUntil(() => rw.submitCalls >= 1, "the OCR result was submitted");
    const a = rw.results.N001.attempts[0];
    assert.equal(a.distance, 842); assert.match(a.text, /842/); assert.equal(a.engine, "tesseract.js@7"); assert.ok(a.confidence > 0.5, `confidence ${a.confidence}`);
    assert.equal(a.submitted.p_provider, "device-ocr"); assert.ok(a.submitted.p_raw_response.text.includes("842"));
    assert.equal(a.path, rw.uploadCalls[0], "the original image was stored at the registered path");
    assert.match(a.path, new RegExp(`^${LOCKED_ID}/rowing/row-1/[0-9a-f-]{36}\\.png$`));
    assert.ok(await jr.locator("[data-testid=thumb]").count() === 1, "the judge sees the photo he took");
    assert.equal(rw.confirmCalls.length, 0, "nothing is confirmed by itself");
    assert.match(await stateOf("N001"), /PENDING EVIDENCE/i);
    assert.equal(await jr.locator("[data-testid=official-distance]").count(), 0, "no official distance before confirmation");
    await jr.screenshot({ path: `${shots}/31-rowing-ocr-result.png`, fullPage: true });
  });
  await step("rowing: the judge sees OCR RESULT with CONFIRM and RETAKE PHOTO — and nowhere to type or edit a distance", async () => {
    assert.match(await card("N001").innerText(), /OCR RESULT/i);
    const a0 = rw.results.N001.attempts[0];
    // The real engine read the right number but is only ~80% sure: below the 85% line the judge must acknowledge it (the rule working as designed)
    if (a0.ocr_status === "LOW_CONFIDENCE") {
      assert.equal(await card("N001").getByRole("button", { name: "CONFIRM" }).isDisabled(), true, "low confidence: CONFIRM waits for the acknowledgement");
      await card("N001").locator("[data-testid=ack] input").check();
    }
    assert.equal(await card("N001").getByRole("button", { name: "CONFIRM" }).isEnabled(), true, `real OCR said ${a0.distance} @ ${a0.confidence} -> ${a0.ocr_status}`);
    assert.equal(await card("N001").getByRole("button", { name: "RETAKE PHOTO" }).isEnabled(), true);
    assert.equal(await card("N001").locator("input:not([type=file]):not([type=checkbox])").count(), 0, "no input can change the number");
    assert.equal(await card("N001").locator("[contenteditable]").count(), 0);
  });
  await step("rowing: CONFIRM -> Station 09 = OFFICIAL, with the confirmed distance; one confirmation, sent once", async () => {
    await card("N001").getByRole("button", { name: "CONFIRM" }).click();
    await rwUntil(async () => /OFFICIAL/.test(await stateOf("N001")), "official after confirmation");
    assert.equal((await card("N001").locator("[data-testid=official-distance]").innerText()).trim().toLowerCase(), "842 m");
    assert.equal(rw.confirmCalls.length, 1); assert.equal(rw.confirmCalls[0].p_attempt_id, "att-N001-1");
    assert.equal(rw.confirmCalls[0].p_acknowledge_low_confidence, rw.results.N001.attempts[0].ocr_status === "LOW_CONFIDENCE");
    assert.equal(rw.results.N001.official, 842);
    await jr.screenshot({ path: `${shots}/32-rowing-official.png`, fullPage: true });
  });

  await step("rowing RETAKE: a wrong OCR reading (342) is retaken; the first attempt is KEPT; the second one is confirmed", async () => {
    rwSet(2140000);
    await rwUntil(async () => (await card("N002").count()) === 1 && (await jr.locator("[data-testid=capture-input]").count()) === 1, "N002 is on the machine");
    await scripted("342 m", 0.93);
    await jr.setInputFiles("[data-testid=capture-input]", await displayPng("861 m", "display-861.png"));
    await card("N002").locator("[data-testid=ocr-distance]").waitFor();
    assert.equal((await card("N002").locator("[data-testid=ocr-distance]").innerText()).trim().toLowerCase(), "342 m", "the engine got it wrong (the display says 861)");
    await jr.screenshot({ path: `${shots}/33-rowing-wrong-ocr.png`, fullPage: true });
    await jr.getByRole("button", { name: "RETAKE PHOTO" }).click();
    await rwUntil(() => rw.retakeCalls.length === 1, "retake sent");
    await rwUntil(async () => /CAPTURE DISPLAY PHOTO/i.test(await card("N002").innerText()), "back to CAPTURE");
    assert.equal(rw.results.N002.attempts[0].status, "RETAKEN"); assert.equal(rw.results.N002.attempts[0].distance, 342, "the wrong reading is evidence history, not deleted");
    await jr.locator("[data-testid=history] summary").click();
    assert.match(await jr.locator("[data-testid=history]").innerText(), /1 earlier attempt.*#1 · RETAKEN · OCR 342 m/is);
    await scripted("861 m", 0.95);
    await jr.setInputFiles("[data-testid=capture-input]", await displayPng("861 m", "display-861b.png"));
    await card("N002").locator("[data-testid=ocr-distance]").waitFor();
    await rwUntil(async () => (await card("N002").locator("[data-testid=ocr-distance]").innerText()).trim().toLowerCase() === "861 m", "second reading");
    await rwUntil(() => rw.results.N002.attempts[1]?.ocr_status === "SUCCEEDED", "second reading stored");
    await jr.getByRole("button", { name: "CONFIRM" }).click();
    await rwUntil(async () => /OFFICIAL/.test(await stateOf("N002")), "official after the retake");
    assert.equal(rw.results.N002.official, 861); assert.equal(rw.results.N002.attempts.length, 2);
    assert.equal(rw.results.N002.attempts[1].no, 2);
    await jr.screenshot({ path: `${shots}/34-rowing-retake-official.png`, fullPage: true });
  });

  await step("rowing: an unreadable photo cannot be confirmed (RETAKE only); a low-confidence reading needs the judge's explicit acknowledgement", async () => {
    rwSet(2350000);
    await rwUntil(async () => (await card("N003").count()) === 1 && (await jr.locator("[data-testid=capture-input]").count()) === 1, "N003 is on the machine");
    await scripted("#@ ~", 0.2, false);
    await jr.setInputFiles("[data-testid=capture-input]", await displayPng("glare", "display-glare.png"));
    await card("N003").locator("[data-testid=unreadable]").waitFor();
    assert.match(await card("N003").locator("[data-testid=ocr-distance]").innerText(), /UNREADABLE/i);
    assert.equal(await jr.getByRole("button", { name: "CONFIRM" }).isDisabled(), true, "FAILED reading cannot be confirmed");
    await jr.getByRole("button", { name: "RETAKE PHOTO" }).click();
    await rwUntil(async () => /CAPTURE DISPLAY PHOTO/i.test(await card("N003").innerText()), "back to CAPTURE");
    await scripted("700 m", 0.72);
    await jr.setInputFiles("[data-testid=capture-input]", await displayPng("700 m", "display-700.png"));
    await card("N003").locator("[data-testid=ack]").waitFor();
    assert.match(await jr.locator("[data-testid=ocr-status]").innerText(), /LOW CONFIDENCE/i);
    assert.match(await jr.locator("[data-testid=ocr-confidence]").innerText(), /72%/);
    assert.equal(await jr.getByRole("button", { name: "CONFIRM" }).isDisabled(), true, "needs the acknowledgement first");
    await jr.screenshot({ path: `${shots}/35-rowing-low-confidence.png`, fullPage: true });
    await jr.locator("[data-testid=ack] input").check();
    assert.equal(await jr.getByRole("button", { name: "CONFIRM" }).isEnabled(), true);
    await rwUntil(() => rw.results.N003.attempts[1]?.ocr_status === "LOW_CONFIDENCE", "stored as LOW_CONFIDENCE");
    await jr.getByRole("button", { name: "CONFIRM" }).click();
    await rwUntil(async () => /OFFICIAL/.test(await stateOf("N003")), "official with acknowledgement");
    assert.equal(rw.confirmCalls.at(-1).p_acknowledge_low_confidence, true); assert.equal(rw.results.N003.official, 700);
  });

  await step("rowing OFFLINE: the photo, its OCR reading and the decision are saved on the device; reload keeps them; reconnect sends each ONCE (lost response included) — late, so PENDING MASTER REVIEW", async () => {
    rwSet(2560000);
    await rwUntil(async () => (await card("N004").count()) === 1 && (await jr.locator("[data-testid=capture-input]").count()) === 1, "N004 is on the machine");
    rw.mode = "drop";                                                     // the connection dies
    await scripted("655 m", 0.9);
    await jr.setInputFiles("[data-testid=capture-input]", await displayPng("655 m", "display-655.png"));
    await card("N004").locator("[data-testid=ocr-distance]").waitFor();   // OCR runs on the device: no connection needed
    assert.equal((await card("N004").locator("[data-testid=ocr-distance]").innerText()).trim().toLowerCase(), "655 m");
    assert.match(await jr.locator("[data-testid=outbox-count]").innerText(), /1/);
    await card("N004").getByRole("button", { name: "CONFIRM" }).click();
    await jr.waitForSelector("[data-testid=decision-sent]");
    assert.match(await jr.locator("[data-testid=decision-sent]").innerText(), /CONFIRMED ON THIS DEVICE/);
    assert.equal(rw.results.N004.attempts.length, 0, "nothing reached the server yet");
    await jr.screenshot({ path: `${shots}/36-rowing-offline.png`, fullPage: true });
    await jr.reload();
    await jr.waitForSelector("[data-testid=outbox-count]");
    assert.match(await jr.locator("[data-testid=outbox-count]").innerText(), /1/, "the outbox survived the reload");
    // reconnect — after the 30-second transition (2,580,000); the answer to the FIRST capture is lost on the way back
    rwSet(2590000); rw.loseNext = true; rw.mode = "ok";
    await rwUntil(() => rw.results.N004.attempts[0]?.status === "PENDING_REVIEW", "the confirmation arrived and was held for review", 30000);
    assert.equal(rw.results.N004.attempts.length, 1, "a lost response never created a second attempt");
    assert.equal(rw.results.N004.attempts[0].origin, "OFFLINE_QUEUE"); assert.ok(rw.results.N004.attempts[0].offlineMeta.seq >= 1);
    assert.equal(rw.results.N004.attempts[0].late, true);
    assert.ok(rw.captureCalls >= 2, "the capture was retried with the same id");
    assert.equal(rw.confirmCalls.filter((c) => c.p_attempt_id === "att-N004-1").length, 1, "one confirmation, sent once");
    await rwUntil(async () => /PENDING MASTER REVIEW/i.test(await stateOf("N004")), "the judge sees PENDING MASTER REVIEW", 15000);
    await rwUntil(async () => (await jr.locator("[data-testid=outbox-count]").count()) === 0, "outbox empty");
    await jr.screenshot({ path: `${shots}/37-rowing-late-review.png`, fullPage: true });
  });

  const rwJudgeTo = calls.length;                                           // everything the judge's phone sent up to here
  const mc = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await installMock(mc);
  const mp = await mc.newPage(); await seedSession(mp);
  mp.on("pageerror", (e) => errors.push(`pageerror(evidence): ${e.message}`));
  const ecard = (race) => mp.locator(`[data-testid=evidence-card][data-race-number=${race}]`);
  await step("master evidence page: the late confirmation, its photo and reading; APPROVE needs a reason; the decision makes Station 09 official", async () => {
    await mp.goto(`${BASE}/race/control/locked-2026/evidence`); await mp.waitForSelector("[data-testid=evidence-card]");
    assert.equal(await ecard("N004").getAttribute("data-evidence"), "PENDING_MASTER_REVIEW");
    assert.deepEqual(await mp.locator("[data-testid=evidence-card]").evaluateAll((els) => els.map((e) => e.dataset.raceNumber).sort()), ["N004", "N005"], "only what needs attention is listed by default: the late confirmation and the athlete still rowing — not the three official results");
    await mp.waitForSelector("[data-testid=evidence-photo]");
    assert.match(await ecard("N004").innerText(), /655 m/); assert.match(await ecard("N004").innerText(), /late/i); assert.match(await ecard("N004").innerText(), /offline/i);
    assert.equal(await mp.locator("[data-testid=approve]").isDisabled(), true, "no reason, no decision");
    await mp.screenshot({ path: `${shots}/38-evidence-review.png`, fullPage: true });
    await mp.getByLabel("Reason").fill("photo is clear — 655 m matches the display");
    await mp.locator("[data-testid=approve]").click();
    await mp.waitForSelector("[data-testid=evidence-msg]");
    assert.equal(rw.reviews.length, 1); assert.deepEqual({ d: rw.reviews[0].p_decision, a: rw.reviews[0].p_attempt_id, r: rw.reviews[0].p_reason }, { d: "APPROVED", a: "att-N004-1", r: "photo is clear — 655 m matches the display" });
    assert.equal(rw.results.N004.official, 655);
  });
  await step("master evidence page: manual correction cites the evidence, requires a reason, never edits the OCR record; the audit trail shows every step", async () => {
    await mp.locator("[data-testid=filter-all]").click();
    await mp.waitForSelector("[data-testid=evidence-card][data-race-number=N002]");
    const c = ecard("N002");
    assert.equal(await c.locator("[data-testid=attempt]").count(), 2, "both attempts are listed");
    assert.match(await c.innerText(), /RETAKEN/); assert.match(await c.innerText(), /342 m/);
    await c.locator("[data-testid=start-correction]").click();
    await c.getByLabel("Corrected distance (m)").fill("870");
    assert.equal(await c.getByRole("button", { name: "SAVE CORRECTION" }).isDisabled(), true, "a reason is mandatory");
    await c.getByLabel("Reason (required)").fill("recount from the referee's video: 870 m");
    await mp.screenshot({ path: `${shots}/39-evidence-correction.png`, fullPage: true });
    await c.getByRole("button", { name: "SAVE CORRECTION" }).click();
    await rwUntil(() => rw.corrections.length === 1, "the correction was sent");
    await mp.locator("[data-testid=evidence-msg]").filter({ hasText: /corrected 655|corrected .* → 870/i }).waitFor();
    const k = rw.corrections.at(-1);
    assert.deepEqual({ r: k.p_result_id, d: k.p_distance_m, why: k.p_reason, ev: k.p_evidence_attempt_id }, { r: "row-2", d: 870, why: "recount from the referee's video: 870 m", ev: "att-N002-2" });
    assert.equal(rw.results.N002.attempts[1].distance, 861, "the OCR record is untouched");
    await c.locator("[data-testid=show-history]").click();
    await c.locator("[data-testid=history-panel]").waitFor();
    const h = await c.locator("[data-testid=history-panel]").innerText();
    for (const w of ["capture", "result", "retake", "confirm", "manual_correction"]) assert.match(h, new RegExp(w), `audit trail has ${w}`);
    assert.match(h, /Correction .* → 870 m/);
  });

  const tvc = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); await installMock(tvc);
  const tvp = await tvc.newPage(); await seedSession(tvp);
  await step("rowing STATION SCREEN: shows CONFIRMING… until the judge confirms, then the distance — and never receives a photo, OCR text or any evidence request", async () => {
    rwSet(2770000);
    const from = seenUrls.length; const callsFrom = calls.length;
    await jc.close(); await mc.close();                                    // the judge phone and the Master page stop polling: only the screen talks to the mock now
    await tvp.goto(`${BASE}/race/station/locked-2026/9`);
    await tvp.waitForSelector("[data-testid=screen-state][data-state=TRANSITION]");
    await tvp.waitForSelector("[data-testid=screen-pending]");
    assert.match(await tvp.locator("[data-testid=screen-stage]").innerText(), /CONFIRMING/);
    assert.equal(await tvp.locator("[data-testid=screen-score]").count(), 0, "no distance before confirmation");
    await tvp.screenshot({ path: `${shots}/40-screen-rowing-pending.png` });
    rw.results.N005.official = 780;
    await tvp.waitForSelector("[data-testid=screen-score]");
    assert.equal((await tvp.locator("[data-testid=screen-score]").innerText()).trim(), "780");
    await tvp.screenshot({ path: `${shots}/41-screen-rowing-confirmed.png` });
    const text = await tvp.locator("[data-testid=screen-stage]").innerText();
    assert.doesNotMatch(text, /photo|image|ocr|\.jpg|\.png|rowing\//i);
    assert.deepEqual([...new Set(calls.slice(callsFrom).map((c) => c.fn))].sort(), ["race_get_public_event", "race_station_display", "race_station_screen"]);
    assert.deepEqual(seenUrls.slice(from).filter((u) => /storage\/v1/.test(u)), [], "the screen made no storage request");
  });
  await step("rowing security in the UI: a signed-out device gets a sign-in prompt; an account that is not the station's judge gets the refusal and NO capture control", async () => {
    const c0 = await browser.newContext({ viewport: { width: 390, height: 844 } }); await installMock(c0);
    const p0 = await c0.newPage(); await p0.goto(`${BASE}/race/judge/locked-2026/9`); await p0.waitForSelector("text=Sign in required");
    assert.equal(await p0.locator("[data-testid=capture-input]").count(), 0); await c0.close();
    rw.forbidden = true;
    const c1 = await browser.newContext({ viewport: { width: 390, height: 844 } }); await installMock(c1);
    const p1 = await c1.newPage(); await seedSession(p1); await p1.goto(`${BASE}/race/judge/locked-2026/9`);
    await p1.waitForSelector("text=not allowed");
    assert.equal(await p1.locator("[data-testid=capture-input]").count(), 0); await c1.close();
    rw.forbidden = false;
  });
  await step("rowing: the judge page only calls the evidence RPCs (+ the storage upload) — no score, pause, skip or result-editing call exists on it", async () => {
    const used = new Set(calls.slice(rwFrom, rwJudgeTo).map((c) => c.fn));
    assert.deepEqual([...used].sort(), ["race_get_public_event", "race_ocr_capture", "race_ocr_confirm", "race_ocr_retake", "race_ocr_submit", "race_rowing_view"]);
    assert.ok(!calls.some((c) => c.fn === "race_record_action" && c.body.p_station_result_id?.startsWith("row-")), "no tap-based score on the rowing results");
  });

  // ---------- private admin: sign-in gate, Station & Exercise Settings, logout ----------
  await step("admin: a signed-out visitor to the private area sees a sign-in prompt and NO event data or admin call", async () => {
    const c = await browser.newContext({ viewport: { width: 1200, height: 800 } }); await installMock(c);
    const p = await c.newPage(); const from = calls.length;
    await p.goto(`${BASE}/race/admin`); await p.waitForSelector("text=Sign in required");
    assert.match(await p.locator("a", { hasText: "Sign in" }).first().getAttribute("href"), /\/race\/login\?next=%2Frace%2Fadmin/);
    assert.equal(calls.slice(from).filter((x) => /station_config|my_access|demo/.test(x.fn)).length, 0, "no admin RPC before signing in");
    await p.goto(`${BASE}/race/admin/${ADM_EVENT.slug}/stations`); await p.waitForSelector("text=Sign in required");
    await c.close();
  });

  const ap = await desk.newPage(); await seedSession(ap);
  ap.on("pageerror", (e) => errors.push(`pageerror(admin): ${e.message}`));
  await step("admin hub: lists the caller's events with the DEMO badge and offers the private demo form", async () => {
    await ap.goto(`${BASE}/race/admin`); await ap.waitForSelector("[data-testid=event-list]");
    const t = await ap.locator("main").innerText();
    assert.match(t, /Private demo run/); assert.match(t, /DEMO/); assert.match(t, /SUPER ADMIN/);
    await ap.screenshot({ path: `${shots}/50-admin-hub.png`, fullPage: true });
  });
  await step("admin: Station & Exercise Settings lists the nine stations; locked-rule stations cannot change type; unsupported types are marked", async () => {
    await ap.goto(`${BASE}/race/admin/${ADM_EVENT.slug}/stations`); await ap.waitForSelector("[data-testid=station-form]");
    assert.equal(await ap.locator("[role=tab]").count(), 9);
    assert.ok(await ap.locator("[data-testid=admin-sidebar]").getByText("Station & Exercise Settings").count() >= 1);
    await ap.locator("[data-testid=pick-4]").click();
    assert.equal(await ap.locator("#tpl").isDisabled(), true, "S04 keeps its technique template");
    await ap.locator("[data-testid=pick-2]").click();
    assert.match(await ap.locator("#tpl").innerText(), /UNSUPPORTED/);
    await ap.screenshot({ path: `${shots}/51-admin-stations.png`, fullPage: true });
  });
  await step("admin: renaming only the exercise sends ONLY that field (no scoring, no template) — after Preview and a mandatory reason", async () => {
    await ap.locator("[data-testid=pick-2]").click();
    const before = adm.updates.length;
    await ap.locator("#ex").fill("Incline push-up");
    assert.equal(await ap.locator("[data-testid=save]").isDisabled(), true, "no reason yet");
    await ap.locator("[data-testid=preview]").click(); await ap.waitForSelector("[data-testid=preview-panel]");
    assert.match(await ap.locator("[data-testid=preview-panel]").innerText(), /Incline push-up/);
    assert.equal(await ap.locator("[data-testid=confirm-scoring]").count(), 0, "a name change needs no scoring confirmation");
    await ap.locator("#reason").fill("demo wording");
    await ap.locator("[data-testid=save]").click(); await ap.waitForSelector("[data-testid=saved]");
    const sent = adm.updates.slice(before);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].p_patch, { exercise_name: "Incline push-up" });
    assert.equal(sent[0].p_reason, "demo wording"); assert.equal(sent[0].p_station_number, 2);
  });
  await step("admin: Cancel discards edits; a frozen (started) race shows FROZEN, is read-only, and offers no Save", async () => {
    await ap.locator("#name").fill("Something else");
    await ap.locator("[data-testid=cancel]").click();
    assert.equal(await ap.locator("#name").inputValue(), "Push-Up");
    adm.locked = true;
    await ap.reload(); await ap.waitForSelector("[data-testid=station-form]");
    assert.match(await ap.locator("main").innerText(), /FROZEN/);
    assert.equal(await ap.locator("[data-testid=save]").count(), 0);
    assert.equal(await ap.locator("#name").isDisabled(), true);
    await ap.screenshot({ path: `${shots}/52-admin-frozen.png`, fullPage: true });
    adm.locked = false;
  });
  await step("admin: the guided demo page walks the workflow and links every judge / station screen", async () => {
    await ap.goto(`${BASE}/race/admin/${ADM_EVENT.slug}`); await ap.waitForSelector("[data-testid=step-1]");
    assert.equal(await ap.locator("[data-testid^=step-]").count(), 7);
    assert.equal(await ap.locator(`a[href='/race/judge/${ADM_EVENT.slug}/9']`).count(), 1);
    assert.equal(await ap.locator(`a[href='/race/station/${ADM_EVENT.slug}/1']`).count(), 1);
    assert.match(await ap.locator("main").innerText(), /new run with this configuration/i);
  });
  await step("admin: Sign out ends the session and returns to the login page", async () => {
    await ap.locator("[data-testid=logout]").first().click(); await ap.waitForURL(/\/race\/login/);
  });
  await step("judge + station screen show the CONFIGURED exercise name and instructions (from the station display RPC)", async () => {
    adm.displayName = "Plyo box jump";
    const jc = await browser.newContext({ viewport: { width: 390, height: 844 } }); await installMock(jc);
    const jpg = await jc.newPage(); await seedSession(jpg);
    await jpg.goto(`${BASE}/race/judge/locked-2026/1`); await jpg.waitForSelector("[data-testid=judge-movement]");
    assert.match(await jpg.locator("[data-testid=judge-movement]").innerText(), /plyo box jump/i);
    assert.match(await jpg.locator("[data-testid=judge-instructions]").innerText(), /hands on the bench/i);
    assert.match(await jpg.locator("[data-testid=judge-equipment]").innerText(), /bench/i);
    await jc.close();
    const sc2 = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); await installMock(sc2);
    const sp = await sc2.newPage(); await seedSession(sp);
    await sp.goto(`${BASE}/race/station/locked-2026/1`); await sp.waitForSelector("[data-testid=screen-exercise-name]");
    assert.match(await sp.locator("[data-testid=screen-exercise-name]").innerText(), /plyo box jump/i);
    await sc2.close();
  });

  // ---------- independence from the gym system ----------
  await step("independence: THE NINTH has no gym screens, talks only to its own Supabase project, and calls only race_* functions", async () => {
    const p3 = await desk.newPage();
    const res = await p3.goto(`${BASE}/login`);
    assert.equal(res.status(), 404, "the gym login does not exist in THE NINTH's app");
    await p3.close();
    const hosts = new Set(); for (const u of seenUrls) hosts.add(new URL(u).host);
    assert.deepEqual([...hosts].filter((h) => !/^localhost(:\d+)?$/.test(h) && h !== "example.supabase.co"), [], "no request left for any other host");
    assert.ok(calls.length > 50, "the run exercised the API");
    assert.deepEqual([...new Set(calls.map((c) => c.fn))].filter((fn) => !fn.startsWith("race_")), [], "every RPC name is race_*");
  });

  await step("no uncaught page errors on any race page", async () => { assert.deepEqual(errors, []); });

  await browser.close();
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
};
main();
