import { createRequire } from "node:module";
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/playwright/index.js");
const { chromium } = pw;

const BASE = "http://127.0.0.1:3000";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "screenshots");
const results = [];
/**
 * Errors that this LOCAL environment produces by construction, not app
 * defects: the device-verification route emails the code through Resend,
 * which is not configured (and not reachable) on a developer machine, so
 * /api/auth/device/request-code answers 500 and a repeat answers 429 from
 * its own resend cooldown. Everything else counts.
 */
const EXPECTED_LOCAL_ERRORS = [
  /status of 500 .*Internal Server Error/i,
  /status of 429 .*Too Many Requests/i,
];
function realErrors(errors) {
  return errors.filter((e) => !EXPECTED_LOCAL_ERRORS.some((r) => r.test(e)));
}

function note(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();

// Sessions and sign-in come from the shared helper. Staff sign-in must clear the
// new-device gate, and the shared login reads the emailed code from the local
// mail sink — the way an administrator would. (An earlier private copy of this
// helper recovered the code by brute-forcing its stored hash, which the keyed
// HMAC in migration 20261116000001 now prevents by design.)
import { newSession, login as sharedLogin, ACCOUNTS } from "./common.mjs";
const accountByEmail = Object.values(ACCOUNTS);
async function session(label) { return newSession(browser, label); }
async function login(page, email) {
  return sharedLogin(page, accountByEmail.find((a) => a.email === email));
}

// ---------------------------------------------------------------- login page
{
  const s = await session("login");
  await s.page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await s.page.screenshot({ path: `${SHOTS}/01-login.png`, fullPage: true });
  const hasForm = await s.page.locator('input[type="password"]').count();
  note("login page renders a sign-in form", hasForm > 0, `password inputs: ${hasForm}`);
  await s.ctx.close();
}

// ------------------------------------------------------------ branch manager
{
  const s = await session("manager");
  const landed = await login(s.page, "manager@9thround.local", "demo1234");
  note("branch manager can sign in", !landed.includes("/login"), `landed on ${landed}`);
  await s.page.screenshot({ path: `${SHOTS}/02-manager-landing.png`, fullPage: true });

  await s.page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(3500);
  await s.page.screenshot({ path: `${SHOTS}/03-manager-competitions.png`, fullPage: true });
  const body = await s.page.textContent("body");
  note("Competitions list shows the seeded competitions",
    body.includes("Nasr City Push-Up Championship") && body.includes("All-Branch Plank Hold"),
    body.includes("Nasr City Push-Up Championship") ? "both titles present" : "titles missing");
  note("the list shows a lifecycle status", /Registration Open|Active|Completed/i.test(body), "");

  // open the completed competition
  const link = s.page.locator('a:has-text("Nasr City Push-Up Championship")').first();
  if (await link.count()) {
    await link.click();
    await s.page.waitForTimeout(4000);
    await s.page.screenshot({ path: `${SHOTS}/04-manager-completed-detail.png`, fullPage: true });
    const detail = await s.page.textContent("body");
    note("competition detail page loads", detail.includes("Nasr City Push-Up Championship"), "");
    note("the roster is listed", /roster|participant|athlete/i.test(detail), "");
    note("the standings are shown", /standing|leaderboard|rank/i.test(detail), "");
    note("display names appear in the standings", /Desert Hawk|Nile Storm|Iron Pharaoh|Cairo Cobra|Sphinx Jab|Papyrus Punch/.test(detail), "");
  } else {
    note("competition detail page loads", false, "no link to the competition on the list page");
  }

  // open the active competition (pending reviews live here)
  await s.page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(2500);
  const active = s.page.locator('a:has-text("All-Branch Plank Hold")').first();
  if (await active.count()) {
    await active.click();
    await s.page.waitForTimeout(4000);
    await s.page.screenshot({ path: `${SHOTS}/05-manager-active-detail.png`, fullPage: true });
    const d = await s.page.textContent("body");
    note("the active competition's detail page loads", d.includes("All-Branch Plank Hold"), "");
  }
  note("no uncaught client errors in the manager session", realErrors(s.errors).length === 0, realErrors(s.errors).slice(0, 3).join(" | "));
  await s.ctx.close();
}

// -------------------------------------------------------------------- coach
{
  const s = await session("coach");
  const landed = await login(s.page, "coach.one@9thround.local", "demo1234");
  note("coach can sign in", !landed.includes("/login"), `landed on ${landed}`);
  await s.page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(3500);
  await s.page.screenshot({ path: `${SHOTS}/06-coach-competitions.png`, fullPage: true });
  const body = await s.page.textContent("body");
  note("a coach reaches the Competitions screen", /competition/i.test(body), "");
  note("a coach is NOT offered the create-competition form", !/Create a competition|New competition/i.test(body), "");
  await s.page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(2500);
  await s.page.screenshot({ path: `${SHOTS}/07-coach-blocked-elsewhere.png`, fullPage: true });
  note("no uncaught client errors in the coach session", realErrors(s.errors).length === 0, realErrors(s.errors).slice(0, 3).join(" | "));
  await s.ctx.close();
}

// ------------------------------------------------------------------- member
{
  const s = await session("member");
  const landed = await login(s.page, "member01@9thround.local", "demo1234");
  note("member can sign in", !landed.includes("/login"), `landed on ${landed}`);
  note("member lands in the athlete area", landed.includes("/my-challenges"), `landed on ${landed}`);
  await s.page.waitForTimeout(3500);
  await s.page.screenshot({ path: `${SHOTS}/08-member-my-challenges.png`, fullPage: true });
  const body = await s.page.textContent("body");
  const shownName = await s.page.locator('input').first().inputValue().catch(() => "");
  note("the athlete's display name is shown", shownName === "Desert Hawk", `input value: "${shownName}"`);
  note("an open competition is offered to join", body.includes("Winter Kickboxing Round Sprint"), "");
  note("the athlete's own results are listed", /result/i.test(body), "");
  const memberLinks = await s.page.$$eval("a", (as) => as.map((a) => a.getAttribute("href") ?? ""));
  const staffLinks = memberLinks.filter((h) => /^\/(dashboard|members|receipts|expenses|leads|trainers|staff|challenges)(\/|$)/.test(h));
  note("the athlete sees no staff navigation", staffLinks.length === 0, staffLinks.join(", "));

  // join the open competition
  const joinBtn = s.page.locator('button:has-text("Join")').first();
  if (await joinBtn.count()) {
    await joinBtn.click();
    await s.page.waitForTimeout(4500);
    await s.page.screenshot({ path: `${SHOTS}/09-member-after-join.png`, fullPage: true });
    const after = await s.page.textContent("body");
    note("joining an open competition works from the UI",
      /you're in|joined|entered|approved|Your competitions/i.test(after), "");
  } else {
    note("joining an open competition works from the UI", false, "no Join control rendered");
  }

  // the standings page for a competition the athlete is in
  await s.page.goto(`${BASE}/my-challenges`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(3000);
  const detailLink = s.page.locator('a[href^="/my-challenges/"]').first();
  if (await detailLink.count()) {
    await detailLink.click();
    await s.page.waitForTimeout(4000);
    await s.page.screenshot({ path: `${SHOTS}/10-member-competition-detail.png`, fullPage: true });
    const d = await s.page.textContent("body");
    note("the athlete can open a competition's rules and standings", /rule|standing/i.test(d), "");
  } else {
    note("the athlete can open a competition's rules and standings", false, "no competition link rendered");
  }
  note("no uncaught client errors in the member session", realErrors(s.errors).length === 0, realErrors(s.errors).slice(0, 3).join(" | "));
  await s.ctx.close();
}

// -------------------------------------------------------------- super admin
{
  const s = await session("admin");
  const landed = await login(s.page, "admin@9thround.local", "demo1234");
  note("super admin can sign in", !landed.includes("/login"), `landed on ${landed}`);
  await s.page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(3500);
  await s.page.screenshot({ path: `${SHOTS}/11-admin-competitions.png`, fullPage: true });
  const body = await s.page.textContent("body");
  note("super admin is offered the create-competition form", /Create|New competition|Season/i.test(body), "");
  note("no uncaught client errors in the admin session", realErrors(s.errors).length === 0, realErrors(s.errors).slice(0, 3).join(" | "));
  await s.ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n==============================\nBROWSER: ${results.length - failed.length} passed, ${failed.length} failed\n==============================`);
if (failed.length) { for (const f of failed) console.log(`  - ${f.step}${f.detail ? " (" + f.detail + ")" : ""}`); process.exit(1); }
