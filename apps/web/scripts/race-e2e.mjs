/*
 * THE NINTH — Phase 4 browser check (manual; not part of CI).
 *
 * Drives the BUILT web app in Chromium with Supabase mocked at the network
 * layer (no backend needed): registration form rules, exact RPC arguments,
 * token handling, staff console, double-click protection, phone-width
 * overflow, and theme isolation from the gym app.
 *
 *   pnpm --filter @9thround/web build          # with NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
 *   pnpm --filter @9thround/web exec next start -p 3100
 *   node apps/web/scripts/race-e2e.mjs         # needs `playwright` resolvable (e.g. NODE_PATH=$(npm root -g))
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
let registerMode = "ok"; // "ok" | "dup"
let confirmDelay = 400;

async function installMock(context) {
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
        case "race_get_public_event": return body.p_slug === "the-ninth-2026" ? json(200, EVENT) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null });
        case "race_register_athlete":
        case "race_staff_register_athlete":
          if (registerMode === "dup") return json(400, { code: "P0001", message: "RACE_ALREADY_REGISTERED: this athlete is already registered for the event", details: null, hint: null });
          return json(200, { registration_id: "r1", race_number: "N007", access_token: "a1b2c3d4".repeat(8), status: "PENDING_PAYMENT", amount_due: 750, currency: "EGP" });
        case "race_get_registration": return body.p_token === "a1b2c3d4".repeat(8) ? json(200, ME) : json(406, { code: "PGRST116", message: "0 rows", details: "The result contains 0 rows", hint: null });
        case "race_update_pushup_style": return json(200, body.p_style);
        case "race_list_registrations": {
          const q = (body.p_query || "").toLowerCase();
          const list = q === "" ? ROWS : ROWS.filter((r) => r.full_name.toLowerCase().includes(q) || r.race_number.toLowerCase() === q.toLowerCase());
          return json(200, list);
        }
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

  // ---------- isolation from the gym app ----------
  await step("theme isolation: /login (gym app) has no race theme and keeps its own", async () => {
    const p3 = await desk.newPage();
    await p3.goto(`${BASE}/login`); await p3.waitForSelector("text=Staff sign in");
    assert.equal(await p3.locator(".race-root").count(), 0);
    const btn = await p3.evaluate(() => getComputedStyle(document.querySelector("button[type=submit]")).backgroundColor);
    assert.equal(btn, "rgb(201, 162, 39)", "the gym login's gold button is unchanged");
    await p3.screenshot({ path: `${shots}/08-gym-login-unchanged.png` });
    await p3.close();
  });

  await step("no uncaught page errors on any race page", async () => { assert.deepEqual(errors, []); });

  await browser.close();
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
};
main();
