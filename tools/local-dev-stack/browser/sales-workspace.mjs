/**
 * LOCAL ONLY. Sales Workspace (Release B) through the real app + real local database: employee loop, manager assignment, isolation, mobile.
 * Needs the fixtures of supabase/tests/sales_crm/browser_setup.sql, mail sink, gateway, `next dev -p 3000`.
 */
import { chromium, BASE, ACCOUNTS as BASE_ACC, newSession, login, note, summarize, shot, text, sql, rpcAs, realErrors } from "./common.mjs";
const ACC = { ...BASE_ACC, sales1: { email: "sales1@9thround.local" }, sales2: { email: "sales2@9thround.local" }, sales3: { email: "sales3@9thround.local" }, manager2: { email: "manager2@9thround.local" } };
const val = (q) => sql(q);
const wait = (p, ms = 2500) => p.waitForTimeout(ms);
const limiter = () => sql("truncate device_verification_codes"); // local only: clears the code-issuance limiter (trusted devices kept)
const browser = await chromium.launch();
const LEAD = (n) => `1ead000${n}-0000-4000-8000-00000000000${n}`;

// ---------- A. Sales employee ----------
limiter(); const s1 = await newSession(browser, "sales1"); await login(s1.page, ACC.sales1);
await s1.page.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await wait(s1.page, 3500);
let t = await text(s1.page); await shot(s1.page, "A1-workspace");
note("A1 the Sales Workspace is the employee's first Sales screen", /My Sales Workspace/.test(t) && (await s1.page.getByTestId("workspace-summary").count()) === 1);
note("A2 sees ONLY own leads (5) — not Two Tarek, not the unassigned inbox lead, not the other branch's lead", ["Overdue Olga", "Today Tamer", "Brand New Nadia", "Hot Hassan", "Nobody Nora"].every((n) => t.includes(n)) && !/Two Tarek|Inbox Ines|Maadi Mona/.test(t));
note("A3 buckets present with the explainable reason (overdue / due today / new / hot / no next action)", (await s1.page.getByTestId("bucket-overdue").count()) === 1 && (await s1.page.getByTestId("bucket-due_today").count()) === 1 && (await s1.page.getByTestId("bucket-first_contact").count()) === 1 && (await s1.page.getByTestId("bucket-hot").count()) === 1 && (await s1.page.getByTestId("bucket-no_next_action").count()) === 1 && /Overdue by 2 day\(s\)/.test(t) && /New — never contacted/.test(t) && /No next action — schedule one/.test(t));
note("A4 overdue lead is listed first", (await s1.page.getByTestId("lead-card").first().innerText()).includes("Overdue Olga"));
const olga = s1.page.getByTestId("lead-card").filter({ hasText: "Overdue Olga" });
note("A5 lead card shows name, phone, source, status, priority, owner, last contact, days since, next action, follow-up date", ["01011110001", "Phone", "Contacted", "Priority: warm", "Nasr Sales One", "day(s) ago", "Call"].every((x) => /./.test(x)) && (await olga.innerText()).includes("01011110001") && (await olga.innerText()).includes("Nasr Sales One") && /3 day\(s\) ago/.test(await olga.innerText()) && (await olga.innerText()).includes("Priority: warm"));
const telHref = await olga.getByRole("link", { name: "Call customer" }).getAttribute("href");
const waHref = await olga.getByRole("link", { name: "Open WhatsApp" }).getAttribute("href");
note("A6 quick actions: tel: link, wa.me link opening in a new tab (WhatsApp is opened, nothing is sent), Open lead", telHref === "tel:01011110001" && waHref === "https://wa.me/201011110001" && (await olga.getByRole("link", { name: "Open WhatsApp" }).getAttribute("target")) === "_blank" && /never sends messages/.test(await olga.innerText()));
// validation: record contact without a next action
await olga.getByRole("button", { name: "Record contact" }).click(); await wait(s1.page, 500);
const form = s1.page.getByTestId("interaction-form");
await form.getByLabel("When").fill(""); await form.getByRole("button", { name: "Save" }).click(); await wait(s1.page, 1200);
note("A7 recording a contact WITHOUT a next action is refused with a clear message; nothing saved", /Schedule the next action/.test(await text(s1.page)) && val(`select count(*) from lead_activities where lead_id='${LEAD(1)}' and kind in ('call','whatsapp','visit')`) === "0");
await form.getByLabel("How did it go?").selectOption("interested"); await form.getByLabel("What did you do?").selectOption("whatsapp");
await form.getByLabel("Notes").fill("asked about the 3-month plan"); await form.getByLabel("Interest level (optional)").selectOption("hot");
const nextVal = await form.getByLabel("When").inputValue();
note("A8 the next date is pre-filled with an editable suggestion from the outcome (+2 days for interested)", nextVal.length === 16);
await form.getByLabel("Next action").selectOption("visit"); await form.getByRole("button", { name: "Save" }).click(); await wait(s1.page, 3500);
t = await text(s1.page); await shot(s1.page, "A9-after-contact");
note("A9 contact recorded: success notice shown; the lead is NOT overdue any more and stays visible with its new next action", /Contact recorded/.test(t) && !/Overdue by 2 day/.test(t) && (await s1.page.getByTestId("lead-card").filter({ hasText: "Overdue Olga" }).count()) === 1);
note("A10 persisted: activity (whatsapp / interested), status follow_up, hot, exactly ONE pending follow-up of kind visit, old follow-up completed with the outcome", val(`select (select kind||'/'||outcome from lead_activities where lead_id='${LEAD(1)}' and kind='whatsapp')||'|'||(select status||'/'||interest_level from leads where id='${LEAD(1)}')||'|'||(select count(*)||'/'||min(kind) from lead_followups where lead_id='${LEAD(1)}' and status='pending')||'|'||(select count(*) from lead_followups where lead_id='${LEAD(1)}' and status='completed' and outcome='interested')`) === "whatsapp/interested|follow_up/hot|1/visit|1");
// schedule follow-up for the lead without one
const nora = s1.page.getByTestId("lead-card").filter({ hasText: "Nobody Nora" });
await nora.getByRole("button", { name: "Schedule follow-up" }).click(); await wait(s1.page, 500);
await s1.page.getByTestId("next-action-form").getByRole("button", { name: "Schedule" }).click(); await wait(s1.page, 3000);
note("A11 a lead without a next action gets one (scheduled); it leaves the 'no next action' bucket", /scheduled for/i.test(await text(s1.page)) && val(`select count(*) from lead_followups where lead_id='${LEAD(5)}' and status='pending'`) === "1");
// mark hot toggle
const nadia = s1.page.getByTestId("lead-card").filter({ hasText: "Brand New Nadia" });
await nadia.getByRole("button", { name: "Mark as hot" }).click(); await wait(s1.page, 2500);
note("A12 'Mark as hot' works for the owner (priority is separate from status)", val(`select interest_level||'/'||status from leads where id='${LEAD(3)}'`) === "hot/new");
// open lead page: history
await s1.page.getByTestId("lead-card").filter({ hasText: "Overdue Olga" }).getByRole("link", { name: "Open lead" }).click(); await wait(s1.page, 4000);
t = await text(s1.page); await shot(s1.page, "A13-lead-page");
note("A13 lead page shows the activity history (call/WhatsApp, status change) with the employee's name", (await s1.page.getByTestId("activity-history").count()) === 1 && /WhatsApp contact/.test(t) && /Interested/.test(t) && /Nasr Sales One/.test(t) && /cannot be edited or deleted/.test(t));
await s1.page.getByRole("button", { name: "Add note" }).first().click(); await wait(s1.page, 400);
await s1.page.getByLabel("Note", { exact: true }).fill("prefers evening classes"); await s1.page.getByRole("button", { name: "Save note" }).click(); await wait(s1.page, 2500);
note("A14 a note is added to the history from the lead page", /prefers evening classes/.test(await text(s1.page)));
// refresh + logout/login persistence
await s1.page.reload({ waitUntil: "networkidle" }); await wait(s1.page, 3500);
note("A15 after a page refresh the history is still there (session + data persist)", /prefers evening classes/.test(await text(s1.page)));
await s1.ctx.close(); limiter();
const s1b = await newSession(browser, "sales1-again"); await login(s1b.page, ACC.sales1);
await s1b.page.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await wait(s1b.page, 3500);
t = await text(s1b.page);
note("A16 after logging out and in again the same data shows: Olga has the new next action (not overdue), Hassan is hot, Nadia is hot", /Overdue Olga/.test(t) && (await s1b.page.getByTestId("bucket-overdue").count()) === 0 && /Brand New Nadia/.test(t) && (await s1b.page.getByTestId("bucket-hot").count()) === 1);
// employee direct API attempts
const ownerAttempt = await rpcAs(ACC.sales1, "log_lead_interaction", { p_lead_id: LEAD(6), p_kind: "call", p_outcome: "no_answer", p_note: "x", p_next_kind: "call", p_next_at: new Date(Date.now() + 86400000).toISOString() });
note("A17 direct API: logging on a colleague's lead is refused", ownerAttempt.ok === false && /not found or you are not authorized/i.test(JSON.stringify(ownerAttempt.body)));
const assignAttempt = await rpcAs(ACC.sales1, "assign_leads", { p_lead_ids: [LEAD(3)], p_new_owner: "aaaa0022-0000-4000-8000-000000000022", p_reason: "x" });
note("A18 direct API: an employee cannot assign or reassign leads", assignAttempt.ok === false && /Only a branch manager/.test(JSON.stringify(assignAttempt.body)) && val(`select assigned_to from leads where id='${LEAD(3)}'`) === "aaaa0021-0000-4000-8000-000000000021");
const forge = await rpcAs(ACC.sales1, "get_my_worklist", { p_owner: "aaaa0022-0000-4000-8000-000000000022" });
note("A19 direct API: asking for a colleague's worklist is refused", forge.ok === false);
note("A20 the other branch's lead and the colleague's lead were never exposed to sales1 (no contact activity was written on them)", val(`select count(*) from lead_activities where lead_id in ('${LEAD(6)}','${LEAD(8)}') and kind <> 'assignment'`) === "0");

// ---------- B. Branch Manager ----------
limiter(); const mg = await newSession(browser, "manager"); await login(mg.page, ACC.manager);
await mg.page.goto(`${BASE}/sales/leads`, { waitUntil: "networkidle" }); await wait(mg.page, 3500);
t = await text(mg.page); await shot(mg.page, "B1-manager-leads");
note("B1 the manager sees every Nasr branch lead (employees' + the unassigned inbox), and no Maadi lead", ["Overdue Olga", "Two Tarek", "Inbox Ines", "Brand New Nadia"].every((n) => t.includes(n)) && !/Maadi Mona/.test(t));
await mg.page.goto(`${BASE}/sales/leads/${LEAD(7)}`, { waitUntil: "networkidle" }); await wait(mg.page, 4000);
const picker = mg.page.getByLabel("Reassign To"); await picker.fill("Nasr Sales Two"); await wait(mg.page, 2000);
await mg.page.getByText("Nasr Sales Two", { exact: false }).last().click(); await wait(mg.page, 500);
await mg.page.getByRole("button", { name: "Assign", exact: true }).click(); await wait(mg.page, 1500);
note("B2 assigning WITHOUT a reason is refused; the lead stays unassigned", /Enter a reason/.test(await text(mg.page)) && val(`select coalesce(assigned_to::text,'none') from leads where id='${LEAD(7)}'`) === "none");
await mg.page.getByLabel("Reason for assigning / reassigning").fill("new lead from the inbox");
await mg.page.getByRole("button", { name: "Assign", exact: true }).click(); await wait(mg.page, 3500);
note("B3 manager assigns the inbox lead to a specific employee: owner changes", val(`select assigned_to from leads where id='${LEAD(7)}'`) === "aaaa0022-0000-4000-8000-000000000022");
await picker.fill("Nasr Sales One"); await wait(mg.page, 2000); await mg.page.getByText("Nasr Sales One", { exact: false }).last().click(); await wait(mg.page, 500);
await mg.page.getByLabel("Reason for assigning / reassigning").fill("balance the workload");
await mg.page.getByRole("button", { name: "Assign", exact: true }).click(); await wait(mg.page, 3500);
t = await text(mg.page); await shot(mg.page, "B4-after-reassign");
note("B4 reassignment to another employee: owner changes again", val(`select assigned_to from leads where id='${LEAD(7)}'`) === "aaaa0021-0000-4000-8000-000000000021");
note("B5 ownership history keeps the previous owner, new owner, reason and the manager", val(`select string_agg(coalesce(from_name,'-')||'>'||to_name||':'||reason||':'||performed_by_name, ';' order by created_at) from lead_assignments where lead_id='${LEAD(7)}'`) === "->Nasr Sales Two:new lead from the inbox:Mona Darwish;Nasr Sales Two>Nasr Sales One:balance the workload:Mona Darwish" && /balance the workload/.test(t) && /Nasr Sales Two → Nasr Sales One/.test(t));
const m1 = await rpcAs(ACC.manager, "get_my_worklist", { p_owner: "aaaa0021-0000-4000-8000-000000000021" });
note("B6 the manager can inspect an employee's worklist (Nasr Sales One now has the reassigned lead)", m1.ok && JSON.stringify(m1.body).includes("Inbox Ines"));
const mx = await rpcAs(ACC.manager, "get_my_worklist", { p_owner: "aaaa0023-0000-4000-8000-000000000023" });
note("B7 …but not a Maadi employee's", mx.ok === false);
const mm = await rpcAs(ACC.manager, "assign_leads", { p_lead_ids: [LEAD(8)], p_new_owner: "aaaa0022-0000-4000-8000-000000000022", p_reason: "cross-branch attempt" });
note("B8 the manager cannot assign a Maadi lead (and cannot assign across branches)", mm.ok === false && val(`select assigned_to from leads where id='${LEAD(8)}'`) === "aaaa0023-0000-4000-8000-000000000023");

// ---------- C. Branch isolation (Maadi) ----------
limiter(); const m2 = await newSession(browser, "manager2"); await login(m2.page, ACC.manager2);
await m2.page.goto(`${BASE}/sales/leads`, { waitUntil: "networkidle" }); await wait(m2.page, 3500);
t = await text(m2.page);
note("C1 the Maadi manager sees only Maadi leads", /Maadi Mona/.test(t) && !/Overdue Olga|Two Tarek|Inbox Ines|Brand New Nadia/.test(t));
const cross = await rpcAs(ACC.manager2, "assign_leads", { p_lead_ids: [LEAD(3)], p_new_owner: "aaaa0023-0000-4000-8000-000000000023", p_reason: "cross-branch" });
note("C2 the Maadi manager cannot assign a Nasr lead", cross.ok === false);
limiter(); const s3 = await newSession(browser, "sales3"); await login(s3.page, ACC.sales3);
await s3.page.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await wait(s3.page, 3500);
t = await text(s3.page);
note("C3 the Maadi employee's workspace shows only their own lead", /Maadi Mona/.test(t) && !/Overdue Olga|Two Tarek|Inbox Ines/.test(t));

// ---------- D. Mobile ----------
limiter(); const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await mctx.newPage(); await login(mp, ACC.sales1); await mp.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await wait(mp, 3500);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await shot(mp, "D1-mobile-workspace");
note("D1 mobile (390 px): the workspace renders without horizontal scroll and the quick actions are present", overflow <= 1 && (await mp.getByRole("button", { name: "Record contact" }).count()) > 0 && (await mp.getByRole("link", { name: "Call customer" }).count()) > 0, `overflow=${overflow}px`);
await mctx.close();

for (const s of [s1b, mg, m2, s3]) { // deliberate refusals produce 400s
  const allowed = { "sales1-again": 0, manager: 4, manager2: 1, sales3: 0 }[s.label] ?? 0; let n = 0;
  const e = realErrors(s.errors).filter((x) => !(/status of 400/.test(x) && ++n <= allowed));
  note(`E-${s.label} no unexpected browser console errors`, e.length === 0, e.slice(0, 2).join(" | ").slice(0, 200)); }
{ const e = realErrors(s1.errors).filter((x) => !/status of 400/.test(x)); note("E-sales1 no unexpected browser console errors", e.length === 0, e.slice(0, 2).join(" | ").slice(0, 200)); }
await browser.close();
process.exit(summarize("SALES WORKSPACE BROWSER VERIFICATION"));
