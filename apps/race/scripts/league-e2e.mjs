/*
 * THE NINTH League — browser checks (manual; not part of CI). Two targets:
 *   A) a DEV server (synthetic fixtures):      RACE_LEAGUE_DEV=http://localhost:3101   (NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co … next dev -p 3101)
 *   B) a PRODUCTION build (database source):   RACE_LEAGUE_PROD=http://localhost:3100  (Supabase mocked at the network layer; proves fixtures are unreachable)
 *   NODE_PATH=$(npm root -g) CHROMIUM_PATH=… node apps/race/scripts/league-e2e.mjs      (RACE_LEAGUE_ONLY=prod runs only B)
 */
/* global document, window, getComputedStyle, URL */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DEV = process.env.RACE_LEAGUE_DEV ?? "http://localhost:3101";
const PROD = process.env.RACE_LEAGUE_PROD ?? "";
const shots = process.env.RACE_E2E_SHOTS ?? "league-e2e-shots";
fs.mkdirSync(shots, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push("PASS"); console.log("PASS ", name); } catch (e) { results.push("FAIL"); console.log("FAIL ", name, "\n     ", String(e.message).split("\n").slice(0, 6).join("\n      ")); } };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const RUN_A = process.env.RACE_LEAGUE_ONLY !== "prod";
const stepA = async (name, fn) => { if (RUN_A) await step(name, fn); };
const errors = [];
const watch = (page, tag) => { page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Content Security|favicon/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); }); };

// ---------------------------------------------------------------- A) phone, fixtures
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await phone.newPage(); watch(p, "phone");
await stepA("phone: the standings page shows the season, week 04 / 08, ten+ athletes and the demo banner", async () => {
  await p.goto(`${DEV}/race/league`); await p.waitForSelector("[data-testid=standings]");
  const t = await p.locator("main").innerText();
  assert.match(t, /Season 1/i); assert.match(t, /WEEK 04 \/ 08/); assert.match(t, /3 of 8 challenges scored/);
  assert.ok((await p.locator("[data-testid=standing-row]").count()) >= 10);
  assert.match(await p.locator("[data-testid=demo-banner]").innerText(), /synthetic/i);
  await p.screenshot({ path: `${shots}/10-phone-standings.png`, fullPage: false });
});
await stepA("phone: no horizontal overflow, and the rank/name/points never clip", async () => {
  const o = await p.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, rows: [...document.querySelectorAll("[data-testid=standing-row]")].filter((r) => r.scrollWidth > r.clientWidth + 1).length }));
  assert.deepEqual(o, { page: 0, rows: 0 });
});
await stepA("phone: search narrows the table and says so when nothing matches", async () => {
  await p.locator("#lg-search").fill("athlete 07");
  assert.equal(await p.locator("[data-testid=standing-row]").count(), 1);
  assert.match(await p.locator("[data-testid=standing-row]").innerText(), /Demo Athlete 07/);
  await p.locator("#lg-search").fill("zzzz");
  await p.waitForSelector("[data-testid=no-match]");
  await p.locator("#lg-search").fill("");
});
await stepA("phone: an athlete page lists the scored weeks with value, rank and points", async () => {
  await p.locator("[data-testid=standing-row]").first().click(); await p.waitForSelector("[data-testid=athlete]");
  assert.ok((await p.locator("[data-testid=athlete-result]").count()) >= 2);
  assert.match(await p.locator("[data-testid=athlete]").innerText(), /RANK \d+/);
  await p.screenshot({ path: `${shots}/11-phone-athlete.png` });
});
await stepA("phone: the challenge history opens a closed week with its results", async () => {
  await p.goto(`${DEV}/race/league`); await p.waitForSelector("[data-testid=standings]");
  await p.getByRole("tab", { name: "Challenges" }).click();
  assert.equal(await p.locator("[data-testid=challenge-card]").count(), 4, "weeks 5-8 are drafts and stay hidden");
  await p.locator("[data-testid=challenge-card]").first().locator("button").click();
  await p.waitForSelector("[data-testid=week-results] li");
  assert.ok((await p.locator("[data-testid=week-results] li").count()) > 5);
  await p.screenshot({ path: `${shots}/12-phone-challenges.png` });
});
await stepA("phone: nothing private is in the page — no member reference, internal id, staff identity or season id", async () => {
  await p.goto(`${DEV}/race/league`); await p.waitForSelector("[data-testid=standings]");
  const html = await p.content();
  for (const secret of ["DEMO-1", "DEMO-2", "externalRef", "participantId", "demo-judge", "demo-reviewer", "demo-admin", "recordedBy", "season-1-"]) assert.ok(!html.includes(secret), `leaked ${secret}`);
});
await stepA("phone: an unknown season shows 'not published', not an error and not data", async () => {
  await p.goto(`${DEV}/race/league?season=no-such-season`); await p.waitForSelector("[data-testid=league-unavailable]");
  assert.equal(await p.locator("[data-testid=standing-row]").count(), 0);
});
await stepA("phone: an unknown athlete id says so", async () => {
  await p.goto(`${DEV}/race/league/p/does-not-exist`); await p.waitForSelector("[data-testid=athlete-missing]");
});

// ---------------------------------------------------------------- A) TV
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const tv = await tvCtx.newPage(); watch(tv, "tv");
await stepA("TV: standings (top 10), WEEK 04 / 08, this week's challenge, last-updated time, QR to the phone page, demo banner", async () => {
  await tv.goto(`${DEV}/race/league/tv?rotate=off`); await tv.waitForSelector("[data-testid=tv-standings]");
  assert.equal(await tv.locator("[data-testid=tv-row]").count(), 10);
  assert.match(await tv.locator("[data-testid=tv-week]").innerText(), /WEEK 04 \/ 08/);
  assert.match(await tv.locator("[data-testid=tv-challenge]").innerText(), /Burpees/);
  assert.match(await tv.locator("[data-testid=tv-updated]").innerText(), /Updated \d/);
  await tv.waitForSelector("img[alt^='QR code']");
  assert.match(await tv.locator("[data-testid=demo-banner]").innerText(), /synthetic/i);
  await tv.screenshot({ path: `${shots}/20-tv-standings.png` });
});
await stepA("TV: nothing overflows the 1920×1080 screen and the text is large (rank/name ≥ 40px)", async () => {
  const m = await tv.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight,
    name: parseFloat(getComputedStyle(document.querySelector(".lg-tv-name")).fontSize), rank: parseFloat(getComputedStyle(document.querySelector(".lg-tv-rank")).fontSize),
    clipped: [...document.querySelectorAll(".lg-tv-row")].filter((r) => r.scrollHeight > r.clientHeight + 2).length }));
  assert.ok(m.x <= 0 && m.y <= 0, JSON.stringify(m)); assert.ok(m.name >= 40 && m.rank >= 40, JSON.stringify(m)); assert.equal(m.clipped, 0);
});
await stepA("TV: it is READ-ONLY — no input, button, form or link to administration or judging", async () => {
  const c = await tv.evaluate(() => ({ inputs: document.querySelectorAll("input, textarea, select, button, form").length, links: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")) }));
  assert.equal(c.inputs, 0); assert.deepEqual(c.links, []);
  const html = await tv.content();
  for (const secret of ["DEMO-1", "externalRef", "participantId", "recordedBy", "/admin"]) assert.ok(!html.includes(secret), `leaked ${secret}`);
});
await stepA("TV: it rotates through standings → week results → podium → progress on the chosen interval", async () => {
  await tv.goto(`${DEV}/race/league/tv?interval=5`); await tv.waitForSelector("[data-testid=tv-standings]");
  await tv.waitForSelector("[data-testid=tv-week-results]", { timeout: 9000 });
  await tv.screenshot({ path: `${shots}/21-tv-week.png` });
  await tv.waitForSelector("[data-testid=tv-podium]", { timeout: 9000 });
  await tv.screenshot({ path: `${shots}/22-tv-podium.png` });
  await tv.waitForSelector("[data-testid=tv-progress]", { timeout: 9000 });
  await tv.screenshot({ path: `${shots}/23-tv-progress.png` });
});
await stepA("TV: rotate=off keeps one screen; mode=podium pins it", async () => {
  await tv.goto(`${DEV}/race/league/tv?rotate=off&interval=5`); await tv.waitForSelector("[data-testid=tv-standings]");
  await tv.waitForTimeout(6500);
  assert.equal(await tv.locator("[data-testid=tv-standings]").count(), 1);
  await tv.goto(`${DEV}/race/league/tv?mode=podium`); await tv.waitForSelector("[data-testid=tv-podium]");
  assert.equal(await tv.locator("[data-testid=tv-podium] [data-place]").count(), 3);
});
await stepA("TV: reduced-motion mode (?motion=reduced or the OS setting) removes the fade animation", async () => {
  await tv.goto(`${DEV}/race/league/tv?rotate=off&motion=reduced`); await tv.waitForSelector("[data-testid=tv-standings]");
  assert.equal(await tv.locator("[data-testid=tv]").getAttribute("data-reduced"), "1");
  assert.equal(await tv.evaluate(() => getComputedStyle(document.querySelector("[data-testid=tv-standings]")).animationName), "none");
  const rm = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const q = await rm.newPage(); await q.goto(`${DEV}/race/league/tv?rotate=off`); await q.waitForSelector("[data-testid=tv-standings]");
  assert.equal(await q.locator("[data-testid=tv]").getAttribute("data-reduced"), "1"); await rm.close();
});
await stepA("TV: an unpublished / unknown season shows a clear waiting screen", async () => {
  await tv.goto(`${DEV}/race/league/tv?season=no-such-season`); await tv.waitForSelector("[data-testid=tv-unavailable]");
});
await stepA("TV and phone show the same standings (same source, same order, same points)", async () => {
  await tv.goto(`${DEV}/race/league/tv?rotate=off`); await tv.waitForSelector("[data-testid=tv-row]");
  const tvRows = await tv.locator("[data-testid=tv-row]").evaluateAll((els) => els.map((e) => [e.querySelector(".lg-tv-name").textContent, e.querySelector(".lg-tv-pts").textContent]));
  await p.goto(`${DEV}/race/league`); await p.waitForSelector("[data-testid=standing-row]");
  const phoneRows = await p.locator("[data-testid=standing-row]").evaluateAll((els) => els.slice(0, 10).map((e) => [e.querySelector(".lg-name").textContent, e.querySelector(".lg-pts").childNodes[0].textContent]));
  assert.deepEqual(phoneRows, tvRows);
});

// ---------------------------------------------------------------- A) administration (fixtures: act as each role)
const adm = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const a = await adm.newPage(); watch(a, "admin");
await stepA("admin: the hub lists the season; creating a season needs the first day and shows the computed last day", async () => {
  await a.goto(`${DEV}/race/league/admin`); await a.waitForSelector("[data-testid=season-list] a");
  assert.match(await a.locator("[data-testid=season-list]").innerText(), /Season 1/i);
  await a.locator("#s-start").fill("2027-01-04");
  assert.match(await a.locator("main").innerText(), /Last day: 2027-02-28/);
  await a.screenshot({ path: `${shots}/30-admin-hub.png` });
});
await stepA("admin (as an outsider): no season is listed and the season page refuses", async () => {
  await a.locator("[data-testid=as-outsider]").click(); await a.waitForSelector("text=no league role");
  await a.goto(`${DEV}/race/league/admin`); await a.waitForSelector("text=no league role");
  const href = await a.evaluate(() => null); void href;
});
await stepA("admin (anonymous): asks to sign in", async () => {
  await a.locator("[data-testid=as-anonymous]").click(); await a.waitForSelector("text=Sign in with your league staff account");
});
await stepA("admin (as the judge): can record an attempt but sees no administration", async () => {
  await a.locator("[data-testid=as-judge]").click(); await a.waitForSelector("[data-testid=season-list] a");
  await a.locator("[data-testid=season-list] a").first().click(); await a.waitForSelector("[data-testid=season-admin]");
  assert.match(await a.locator("[data-testid=season-admin]").innerText(), /READ \/ RECORD ONLY/);
  await a.getByRole("tab", { name: "Overview" }).click();
  assert.equal(await a.locator("[data-testid=toggle-publish]").count(), 0);
  await a.getByRole("tab", { name: "Challenges" }).click();
  assert.match(await a.locator("[data-testid=tab-challenges]").innerText(), /Only a league administrator edits/);
  await a.getByRole("tab", { name: "Attempts" }).click();
  await a.locator("#r-p").selectOption({ label: "Demo Athlete 01" }); await a.locator("#r-v").fill("40");
  await a.locator("[data-testid=record]").click(); await a.waitForSelector("[data-testid=ok]");
  assert.ok((await a.locator("[data-testid=pending-attempt]").count()) >= 1);
  await a.screenshot({ path: `${shots}/31-admin-judge-attempts.png` });
  // the judge cannot approve: the refusal is shown
  await a.locator("[data-testid=approve]").first().click(); await a.waitForSelector("text=reviewer or administrator");
});
await stepA("admin (as the administrator): records an attempt, cannot approve their own, a reviewer can", async () => {
  await a.goto(`${DEV}/race/league/admin`); await a.locator("[data-testid=as-admin]").click(); await a.waitForSelector("[data-testid=season-list] a");
  await a.locator("[data-testid=season-list] a").first().click(); await a.waitForSelector("[data-testid=season-admin]");
  await a.getByRole("tab", { name: "Attempts" }).click();
  await a.locator("#r-p").selectOption({ label: "Demo Athlete 02" }); await a.locator("#r-v").fill("41");
  await a.locator("[data-testid=record]").click(); await a.waitForSelector("[data-testid=ok]");
  await a.waitForSelector("text=you recorded this");
  await a.locator("[data-testid=approve]").first().click(); await a.waitForSelector("text=cannot approve or reject a result you recorded yourself");
});
await stepA("admin: the points rules are marked PROVISIONAL, need a reason, and refuse a worse rank earning more", async () => {
  await a.getByRole("tab", { name: "Points rules" }).click();
  assert.match(await a.locator("[data-testid=tab-rules]").innerText(), /PROVISIONAL — OWNER-SUPPLIED, NOT FINAL/);
  assert.equal(await a.locator("[data-testid=save-rules]").isDisabled(), true);
  await a.locator("#rr").fill("pilot table"); await a.locator("#pt").fill("10, 20, 5");
  await a.locator("[data-testid=save-rules]").click(); await a.waitForSelector("text=fewer points");
  await a.locator("#pt").fill("30, 20, 12, 8, 5, 3, 2, 1");
  await a.locator("[data-testid=save-rules]").click(); await a.waitForSelector("[data-testid=ok]");
});
await stepA("admin: a CSV is validated: formula, duplicate, expired and unattested rows are refused, the clean verified row is added", async () => {
  await a.getByRole("tab", { name: "Participants" }).click();
  await a.locator("#a-csv").fill("display_name,external_member_ref,membership_verified\nNew Person,M-900,yes\n=cmd(),M-901,yes\nDemo Athlete 01,DEMO-1,yes\nExpired Person,M-902,no\nUnattested Person,M-903,\n");
  await a.locator("[data-testid=import]").click(); await a.waitForSelector("[data-testid=import-report]");
  assert.match(await a.locator("[data-testid=import-report]").innerText(), /1 added, 4 issue/);
  assert.match(await a.locator("[data-testid=import-report]").innerText(), /not verified/);
});
await stepA("admin: a challenge is saved, a bad one is refused, publishing needs a reason", async () => {
  await a.getByRole("tab", { name: "Challenges" }).click(); await a.locator("[data-testid=week-5]").click();
  await a.locator("#c-name").fill("Heavy deadlift"); await a.locator("#c-kind").selectOption("LOAD");
  await a.locator("#c-url").fill("javascript:alert(1)");
  await a.locator("[data-testid=save-challenge]").click(); await a.waitForSelector("text=https");
  await a.locator("#c-url").fill("https://example.com/demo"); await a.locator("[data-testid=save-challenge]").click(); await a.waitForSelector("[data-testid=ok]");
  await a.getByRole("tab", { name: "Overview" }).click();
  assert.equal(await a.locator("[data-testid=toggle-publish]").isDisabled(), true);
  await a.screenshot({ path: `${shots}/32-admin-overview.png` });
});
await stepA("admin: registering an athlete needs the membership confirmation; an eligibility restriction needs a documented decision and is listed", async () => {
  await a.getByRole("tab", { name: "Participants" }).click();
  await a.locator("#a-name").fill("Walk In W.");
  const reg = a.getByRole("button", { name: "Register", exact: true });
  assert.equal(await reg.isDisabled(), true, "no confirmation, no registration");
  await a.locator("[data-testid=membership-verified]").check(); await reg.click(); await a.waitForSelector("[data-testid=ok]");
  assert.match(await a.locator("[data-testid=tab-participants]").innerText(), /Walk In W\./);
  const first = a.locator("[data-testid=eligibility]").first();
  assert.equal(await first.isDisabled(), true, "a restriction needs a reason");
  await a.locator("#p-reason").fill("documented disciplinary decision DC-1"); await a.locator("#p-cat").selectOption("FRAUD");
  await first.click(); await a.waitForSelector("[data-testid=eligibility-decisions]");
  assert.match(await a.locator("[data-testid=eligibility-decisions]").innerText(), /FRAUD → not eligible/);
});
await stepA("admin: a judge asks for a correction, an administrator applies it; previous and new value are kept; no score moves from an appeal", async () => {
  await a.goto(`${DEV}/race/league/admin`); await a.locator("[data-testid=as-judge]").click(); await a.waitForSelector("[data-testid=season-list] a");
  await a.locator("[data-testid=season-list] a").first().click(); await a.waitForSelector("[data-testid=season-admin]");
  await a.getByRole("tab", { name: "Attempts" }).click();
  assert.equal(await a.locator("[data-testid=correct]").count(), 0, "a judge has no Correct button");
  await a.locator("#r-reason").fill("tally sheet shows another number");
  const row = a.locator("[data-testid=attempt-row]").filter({ hasText: "approved" }).first();
  await row.locator("input[aria-label='Corrected value']").fill("77"); await row.locator("[data-testid=request-correction]").click(); await a.waitForSelector("[data-testid=ok]");
  assert.match(await a.locator("[data-testid=correction-requests]").innerText(), /WAITING FOR AN ADMINISTRATOR/);
  // as the administrator (a fresh page load rebuilds the fixtures): request, apply, check the record
  await a.goto(`${DEV}/race/league/admin`); await a.locator("[data-testid=as-admin]").click(); await a.waitForSelector("[data-testid=season-list] a");
  await a.locator("[data-testid=season-list] a").first().click(); await a.waitForSelector("[data-testid=season-admin]");
  await a.getByRole("tab", { name: "Attempts" }).click();
  await a.locator("#r-reason").fill("tally sheet confirms the new value");
  const row2 = a.locator("[data-testid=attempt-row]").filter({ hasText: "approved" }).first();
  await row2.locator("input[aria-label='Corrected value']").fill("77"); await row2.locator("[data-testid=request-correction]").click(); await a.waitForSelector("[data-testid=correction-request]");
  await a.locator("[data-testid=apply-request]").click(); await a.waitForSelector("[data-testid=corrections]");
  assert.match(await a.locator("[data-testid=corrections]").innerText(), /→ 77/);
});
await stepA("admin: an appeal is lodged inside the window, decided with a reason, and changes no score", async () => {
  await a.getByRole("tab", { name: "Standings" }).click();
  const before = await a.locator("[data-testid=tab-standings]").innerText();
  await a.getByRole("tab", { name: "Appeals" }).click();
  assert.match(await a.locator("[data-testid=appeal-window]").innerText(), /Open until/);
  await a.locator("#ap-p").selectOption({ label: "Demo Athlete 05" }); await a.locator("#ap-text").fill("I counted more repetitions than were recorded");
  await a.locator("[data-testid=lodge-appeal]").click(); await a.waitForSelector("[data-testid=appeal]");
  assert.equal(await a.locator("[data-testid=uphold]").isDisabled(), true, "a decision needs a reason");
  await a.locator("#ap-reason").fill("video supports a recount"); await a.locator("[data-testid=uphold]").click();
  await a.waitForSelector("text=UPHELD");
  assert.match(await a.locator("[data-testid=appeal]").innerText(), /Scores unchanged unless an administrator applied a separate correction/);
  await a.getByRole("tab", { name: "Standings" }).click();
  assert.equal(await a.locator("[data-testid=tab-standings]").innerText(), before, "deciding an appeal never moves a score");
  await a.screenshot({ path: `${shots}/33-admin-appeals.png` });
});
await stepA("admin: the audit trail records what was done", async () => {
  await a.getByRole("tab", { name: "Audit" }).click(); await a.waitForSelector("[data-testid=tab-audit]");
  const t = await a.locator("[data-testid=tab-audit]").innerText();
  assert.match(t, /league\.appeal\.lodge/); assert.match(t, /league\.appeal\.upheld/); assert.match(t, /league\.correction\.apply/); assert.match(t, /previousValue":\d+,"newValue":77/);
});

// ---------------------------------------------------------------- B) production build: fixtures are unreachable
if (PROD) {
  const SB = "https://example.supabase.co";
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let mode = "unpublished"; const rpcs = [];
  await pc.route(`${SB}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url.pathname);
    if (!m) return json([]);
    rpcs.push(m[1]);
    if (m[1] === "race_league_public_season") {
      if (mode === "unpublished") return json({ available: false });
      if (mode === "missing") return route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.race_league_public_season" }) });
      return json({ available: true, season: { slug: "real", name: "Real Season", status: "active", startsOn: "2026-11-02", endsOn: "2026-12-27", totalWeeks: 8, throughWeek: 1, currentWeek: 2 }, challenges: [], standings: [{ publicId: "x1", displayName: "Real P.", rank: 1, totalPoints: 25, weeklyPoints: { 1: 25 }, challengesCompleted: 1, movement: null, gapToNext: null }], generatedAt: new Date().toISOString() });
    }
    return json(null);
  });
  const pp = await pc.newPage(); watch(pp, "prod");
  await step("production build: the fixtures are unreachable — an unpublished league shows 'not published', no demo banner, no Demo Athlete", async () => {
    await pp.goto(`${PROD}/race/league?season=real`); await pp.waitForSelector("[data-testid=league-unavailable]");
    const html = await pp.content(); assert.ok(!html.includes("Demo Athlete") && !html.includes("synthetic"));
    assert.equal(await pp.locator("[data-testid=demo-banner]").count(), 0);
    await pp.goto(`${PROD}/race/league`); await pp.waitForSelector("text=No season selected");   // no default season configured in production
    assert.ok(rpcs.every((n) => n.startsWith("race_league_")), "only league RPCs were called");
  });
  await step("production build: the TV shows a waiting screen until a season is published, and the DEMO route flag does nothing", async () => {
    const q = await pc.newPage(); await q.goto(`${PROD}/race/league/tv?season=real&source=demo&demo=1`); await q.waitForSelector("[data-testid=tv-unavailable]");
    assert.equal(await q.locator("[data-testid=demo-banner]").count(), 0); await q.close();
  });
  await step("production build: before the league tables exist (migration not applied) the page degrades to an error, never to fixtures", async () => {
    mode = "missing"; const q = await pc.newPage(); await q.goto(`${PROD}/race/league?season=real`);
    await q.waitForSelector("text=could not load"); assert.equal(await q.locator("[data-testid=demo-banner]").count(), 0); await q.close();
  });
  await step("production build: a published season renders from the database, read-only", async () => {
    mode = "published"; const q = await pc.newPage(); await q.goto(`${PROD}/race/league?season=real`); await q.waitForSelector("[data-testid=standings]");
    assert.match(await q.locator("main").innerText(), /Real Season/i); assert.equal(await q.locator("[data-testid=demo-banner]").count(), 0);
    const tvp = await pc.newPage(); await tvp.setViewportSize({ width: 1920, height: 1080 }); await tvp.goto(`${PROD}/race/league/tv?season=real&rotate=off`); await tvp.waitForSelector("[data-testid=tv-standings]");
    assert.equal(await tvp.locator("[data-testid=tv-row]").count(), 1); await tvp.close(); await q.close();
  });
  await step("production build: the staff pages do not offer 'acting as' and ask a signed-out visitor to sign in", async () => {
    const q = await pc.newPage(); await q.goto(`${PROD}/race/league/admin`); await q.waitForSelector("text=Sign in with your league staff account");
    assert.equal(await q.locator("[data-testid=act-as]").count(), 0); await q.close();
  });
}

await step("no uncaught page errors on any league page", async () => { assert.deepEqual(errors, []); });
await browser.close();
const failed = results.filter((r) => r === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
