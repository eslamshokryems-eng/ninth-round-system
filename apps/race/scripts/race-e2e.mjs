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
/* global document, window, localStorage, getComputedStyle, URL, setTimeout */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
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

async function installMock(context) {
  context.on("request", (r) => seenUrls.push(r.url()));
  await context.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url.pathname);
    if (rpc) {
      const fn = rpc[1];
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      calls.push({ fn, body });
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
