/**
 * LOCAL ONLY. Regression test for incident 2026-11-09 (586 duplicate leads): one Save on /sales/leads/new must create exactly ONE lead,
 * whatever the employee does while the request is pending (fast clicks, Enter held, stalled connection). Run via a stack like browser_run.sh.
 */
// LOCAL ONLY. Reproduces repeated lead creation from ONE "Save" on /sales/leads/new. Counts real rows in the local DB.
import { chromium, BASE, ACCOUNTS, newSession, login, sql } from "./common.mjs";
const ACC = { sales1: { email: "sales1@9thround.local" } };
const LABEL = process.env.LABEL ?? "run";
const rows = (phone) => Number(sql(`select count(*) from leads where phone='${phone}'`));
const out = [];
sql("truncate device_verification_codes");
const browser = await chromium.launch();
const s = await newSession(browser, "sales1"); await login(s.page, ACC.sales1);
const page = s.page;
let posts = 0;
page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/rest/v1/leads")) posts++; });
async function openForm(name, phone) {
  await page.goto(`${BASE}/sales/leads/new`, { waitUntil: "networkidle" });
  await page.getByLabel("Full Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill(phone);
  await page.waitForTimeout(600);
  return page.getByRole("button", { name: /^save/i });
}
// slow network: every lead POST is held for 3 s (like a slow mobile connection), so the page stays on the form meanwhile
async function scenario(id, what, phone, act, holdMs = 3000) {
  posts = 0;
  const handler = async (route) => { await new Promise((r) => setTimeout(r, holdMs)); await route.continue(); };
  await page.route("**/rest/v1/leads*", (route) => route.request().method() === "POST" ? handler(route) : route.continue());
  const btn = await openForm(`Repro ${id}`, phone);
  await act(btn);
  await page.waitForTimeout(holdMs + 4000);
  await page.unroute("**/rest/v1/leads*");
  out.push({ id, what, posts, rows: rows(phone) });
}
await scenario("R1", "10 fast clicks on Save while the request is pending", "0199000001", async (b) => { for (let i = 0; i < 10; i++) await b.click({ force: true, delay: 0 }).catch(() => {}); });
await scenario("R2", "Save focused, Enter held (30 auto-repeat keydowns)", "0199000002", async (b) => { await b.focus(); for (let i = 0; i < 30; i++) await page.keyboard.down("Enter"); await page.keyboard.up("Enter"); });
await scenario("R3", "one single click (control)", "0199000003", async (b) => { await b.click(); });
// stalled connection: all lead POSTs are held until one release moment, then flushed together (burst arrival like the Production log)
{
  posts = 0; const phone = "0199000004"; const held = []; let release; const gate = new Promise((r) => (release = r));
  await page.route("**/rest/v1/leads*", async (route) => { if (route.request().method() !== "POST") return route.continue(); held.push(Date.now()); await gate; await route.continue(); });
  const b = await openForm("Repro R4", phone);
  await b.focus(); for (let i = 0; i < 60; i++) await page.keyboard.down("Enter"); await page.keyboard.up("Enter");
  const t0 = Date.now(); release(); await page.waitForTimeout(6000);
  await page.unroute("**/rest/v1/leads*");
  const dbSpan = sql(`select round(extract(epoch from max(created_at)-min(created_at))::numeric,2) from leads where phone='${phone}'`);
  out.push({ id: "R4", what: "network stalled while Enter held (60 repeats), then released at once", posts, rows: rows(phone), db_insert_span_s: dbSpan });
}
console.log(JSON.stringify({ label: LABEL, results: out }, null, 1));
await browser.close();
const bad = out.filter((r) => r.rows !== 1 || r.posts !== 1);
console.log(bad.length ? `LEAD DOUBLE-SUBMIT: ${bad.length} scenario(s) FAILED` : "LEAD DOUBLE-SUBMIT: all scenarios created exactly one lead");
process.exit(bad.length ? 1 : 0);
