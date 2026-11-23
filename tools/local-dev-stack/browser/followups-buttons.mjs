/**
 * LOCAL ONLY. Sales Workspace header buttons "Today's Follow-ups" / "Overdue Follow-ups" (staff complaint 2026-11-23: the old dashboard
 * links to /sales/followups disappeared for employees in Release B). Checks: the buttons exist, open the right tab, the employee sees only
 * follow-ups of their own leads, the manager still reaches the same pages from the dashboard and sees the branch, mobile layout.
 * Adds its own pending follow-ups (unique notes) to the local throw-away DB. Run via browser_run.sh.
 */
import { chromium, BASE, ACCOUNTS, newSession, login, sql, note, summarize, shot, text } from "./common.mjs";
const ACC = { ...ACCOUNTS, sales1: { email: "sales1@9thround.local" } };
const S1 = "aaaa0021-0000-4000-8000-000000000021", S2 = "aaaa0022-0000-4000-8000-000000000022", NASR = "11111111-1111-1111-1111-111111111111";
const lead = (owner) => sql(`select id from leads where assigned_to='${owner}' and branch_id='${NASR}' order by created_at limit 1`).trim();
const own = lead(S1), other = lead(S2);
const todayLater = `(date_trunc('day', now() at time zone 'Africa/Cairo') + interval '23 hours 50 minutes') at time zone 'Africa/Cairo'`;
sql(`truncate device_verification_codes`);
sql(`insert into lead_followups (lead_id, branch_id, due_at, status, created_by, kind, note) values
 ('${own}','${NASR}', now() - interval '1 day','pending','${S1}','call','FUB own overdue'),
 ('${own}','${NASR}', ${todayLater},'pending','${S1}','call','FUB own today'),
 ('${other}','${NASR}', now() - interval '1 day','pending','${S2}','call','FUB other overdue'),
 ('${other}','${NASR}', ${todayLater},'pending','${S2}','call','FUB other today')`);

const browser = await chromium.launch();
// ---- employee ----
const s1 = await newSession(browser, "sales1"); await login(s1.page, ACC.sales1); const p = s1.page;
await p.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
await p.getByTestId("sales-workspace").waitFor();
const today = p.getByTestId("workspace-followups-today"), overdue = p.getByTestId("workspace-followups-overdue");
note("F01 employee workspace shows both buttons next to + New Lead", (await today.isVisible()) && (await overdue.isVisible()) && /Today's Follow-ups/.test(await today.innerText()) && /Overdue Follow-ups/.test(await overdue.innerText()));
await shot(p, "F01-workspace-header");
await today.click(); await p.waitForURL(/\/sales\/followups\?tab=today/); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
let t = await text(p);
note("F02 Today's Follow-ups opens /sales/followups?tab=today", p.url().endsWith("/sales/followups?tab=today"));
note("F03 today tab lists the employee's own follow-up due today", t.includes("FUB own today") && !t.includes("FUB own overdue"));
note("F04 employee does NOT see a colleague's follow-up (today)", !t.includes("FUB other today"));
await shot(p, "F03-employee-today");
await p.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await p.getByTestId("workspace-followups-overdue").click();
await p.waitForURL(/\/sales\/followups\?tab=overdue/); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
t = await text(p);
note("F05 Overdue Follow-ups opens /sales/followups?tab=overdue", p.url().endsWith("/sales/followups?tab=overdue"));
note("F06 overdue tab lists the employee's own overdue follow-up", t.includes("FUB own overdue") && !t.includes("FUB own today"));
note("F07 employee does NOT see a colleague's follow-up (overdue)", !t.includes("FUB other overdue"));
await shot(p, "F06-employee-overdue");
// mobile 390 px
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await s1.ctx.storageState() });
const mp = m ? await m.newPage() : null;
if (mp) {
  await mp.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
  const ok = await mp.getByTestId("workspace-followups-today").isVisible().catch(() => false);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  note("F08 mobile 390 px: buttons visible, no horizontal page scroll", ok && overflow <= 1, `overflow=${overflow}px`);
  await shot(mp, "F08-mobile-header");
}
// ---- manager (Nasr branch) ----
const mg = await newSession(browser, "manager"); await login(mg.page, ACC.manager); const q = mg.page;
await q.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await q.waitForTimeout(800);
note("F09 manager /sales is the branch dashboard (no employee workspace)", (await q.getByTestId("sales-workspace").count()) === 0 && /Today's Follow-ups/.test(await text(q)));
await q.getByText("Today's Follow-ups").first().click(); await q.waitForURL(/tab=today/); await q.waitForLoadState("networkidle"); await q.waitForTimeout(800);
t = await text(q);
note("F10 manager today tab shows the whole branch (own + colleague)", t.includes("FUB own today") && t.includes("FUB other today"));
await q.goto(`${BASE}/sales/followups?tab=overdue`, { waitUntil: "networkidle" }); await q.waitForTimeout(800);
t = await text(q);
note("F11 manager overdue tab shows the whole branch", t.includes("FUB own overdue") && t.includes("FUB other overdue"));
await shot(q, "F11-manager-overdue");
await browser.close();
process.exit(summarize("Follow-ups buttons"));
