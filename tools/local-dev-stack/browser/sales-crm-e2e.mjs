/**
 * LOCAL ONLY. Sales CRM end-to-end journeys through the real app + real local database (runs after sales-workspace.mjs, same database):
 * follow-ups page (record contact, reschedule), lost -> reopen, conversion (owner credited), retry safety, refusal paths, manager
 * conversion of an employee's lead, unassigned-lead block, team dashboard, reception / unauthorized access, forged direct writes.
 * Needs supabase/tests/sales_crm/browser_setup.sql fixtures, mail sink, gateway, `next dev -p 3000`.
 */
import { chromium, BASE, ACCOUNTS as BASE_ACC, PASSWORD, newSession, login, note, summarize, shot, text, sql, rpcAs, realErrors } from "./common.mjs";
const ACC = { ...BASE_ACC, sales1: { email: "sales1@9thround.local" }, sales2: { email: "sales2@9thround.local" }, reception1: { email: "reception1@9thround.local" } };
const val = (q) => sql(q);
const wait = (p, ms = 2500) => p.waitForTimeout(ms);
const limiter = () => sql("truncate device_verification_codes");
const SALES1 = "aaaa0021-0000-4000-8000-000000000021", SALES2 = "aaaa0022-0000-4000-8000-000000000022", MANAGER = "aaaa0001-0000-4000-8000-000000000001";
const L = { tamer: "1ead0002-0000-4000-8000-000000000002", laila: "1ead0011-0000-4000-8000-000000000011", karim: "1ead0012-0000-4000-8000-000000000012", pete: "1ead0013-0000-4000-8000-000000000013", tina: "1ead0014-0000-4000-8000-000000000014", lina: "1ead0015-0000-4000-8000-000000000015" };

/** A forged direct table write through the API gateway as `account` (what a tampered browser could send). */
async function restAs(account, method, path, body) {
  const GATEWAY = process.env.GATEWAY_BASE ?? "http://127.0.0.1:54321";
  const anon = (await import("node:fs")).readFileSync(new URL("../../../apps/web/.env.local", import.meta.url), "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const tok = await (await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email: account.email, password: PASSWORD }) })).json();
  const res = await fetch(`${GATEWAY}/rest/v1/${path}`, { method, headers: { apikey: anon, authorization: `Bearer ${tok.access_token}`, "content-type": "application/json", prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  let parsed = null; try { parsed = await res.json(); } catch { parsed = null; }
  return { ok: res.ok, status: res.status, body: parsed };
}

// an overdue lead for the follow-ups page (inserted as the database owner, like the other fixtures)
sql(`insert into leads (id, full_name, phone, branch_id, assigned_to, created_by, status, source, interest_level, last_contacted_at) values ('${L.lina}','Late Lina','01011110015','11111111-1111-1111-1111-111111111111','${SALES1}','${MANAGER}','contacted','phone','warm', now() - interval '4 days') on conflict do nothing`);
sql(`insert into lead_followups (lead_id, branch_id, due_at, status, created_by, kind) select '${L.lina}','11111111-1111-1111-1111-111111111111', now() - interval '1 day', 'pending','${MANAGER}','call' where not exists (select 1 from lead_followups where lead_id='${L.lina}')`);

const browser = await chromium.launch();
/** Login; if the local device-verification gate is still showing (code-issuance limiter timing in this local setup), clear the limiter and retry once. */
async function loginReliably(page, account) {
  await login(page, account);
  if (/New Device Verification/i.test(await text(page))) {
    limiter();
    await page.getByRole("button", { name: "Sign out" }).click().catch(() => {});
    await page.waitForTimeout(2000);
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } });
    await login(page, account);
  }
}

// ---------- G. Sales employee journeys ----------
limiter(); const s1 = await newSession(browser, "sales1"); await loginReliably(s1.page, ACC.sales1);
await s1.page.goto(`${BASE}/sales/followups?tab=overdue`, { waitUntil: "networkidle" }); await wait(s1.page, 3500);
let t = await text(s1.page); await shot(s1.page, "G1-followups-overdue");
note("G1 follow-ups page (Overdue) lists the employee's overdue follow-up", /Late Lina/.test(t) && !/Two Tarek|Team Tina/.test(t));
await s1.page.getByRole("row").filter({ hasText: "Late Lina" }).getByRole("button", { name: "Record contact" }).click(); await wait(s1.page, 600);
const f = s1.page.getByTestId("interaction-form");
await f.getByLabel("What did you do?").selectOption("call"); await f.getByLabel("How did it go?").selectOption("no_answer"); await f.getByLabel("Notes").fill("no answer, try tomorrow");
await f.getByRole("button", { name: "Save" }).click(); await wait(s1.page, 3500);
t = await text(s1.page);
note("G2 'Record contact' from the follow-ups page completes the overdue follow-up and schedules the next one (exactly one pending, in the future)",
  /Contact recorded/.test(t) && !/Late Lina/.test(t) && val(`select (select count(*) from lead_followups where lead_id='${L.lina}' and status='pending')||'/'||(select bool_and(due_at > now()) from lead_followups where lead_id='${L.lina}' and status='pending')||'/'||(select count(*) from lead_followups where lead_id='${L.lina}' and status='completed' and outcome='no_answer')||'/'||(select count(*) from lead_activities where lead_id='${L.lina}' and kind='call')`) === "1/true/1/1");
await s1.page.getByRole("button", { name: "Due Today" }).click(); await wait(s1.page, 2500);
await s1.page.getByRole("row").filter({ hasText: "Today Tamer" }).getByRole("button", { name: "Reschedule" }).click(); await wait(s1.page, 500);
await s1.page.getByRole("button", { name: "Save" }).click(); await wait(s1.page, 3000);
t = await text(s1.page); await shot(s1.page, "G3-rescheduled");
note("G3 'Reschedule' moves the follow-up (one pending, ~tomorrow) and records it in the history", /rescheduled/.test(t)
  && val(`select (select count(*) from lead_followups where lead_id='${L.tamer}' and status='pending')||'/'||(select bool_and(due_at > now() + interval '20 hours') from lead_followups where lead_id='${L.tamer}' and status='pending')||'/'||(select count(*) from lead_activities where lead_id='${L.tamer}' and kind='follow_up')`) === "1/true/1");

// lost -> reopen
await s1.page.goto(`${BASE}/sales/leads/${L.laila}`, { waitUntil: "networkidle" }); await wait(s1.page, 4000);
await s1.page.getByRole("button", { name: "Mark as Lost" }).click(); await wait(s1.page, 500);
note("G4 'Confirm Mark as Lost' stays disabled until a reason is chosen", await s1.page.getByRole("button", { name: "Confirm Mark as Lost" }).isDisabled());
await s1.page.getByLabel("Reason").selectOption("too_expensive"); await s1.page.getByLabel("Note (optional)").first().fill("budget next month");
await s1.page.getByRole("button", { name: "Confirm Mark as Lost" }).click(); await wait(s1.page, 3500);
t = await text(s1.page);
note("G5 marked lost: status lost, reason kept, its pending follow-up closed, history records the change; Convert is hidden for a lost lead",
  val(`select status||'/'||lost_reason||'/'||(select count(*) from lead_followups where lead_id='${L.laila}' and status='pending')||'/'||(select count(*) from lead_activities where lead_id='${L.laila}' and kind='status_change') from leads where id='${L.laila}'`) === "lost/too_expensive/0/1"
  && (await s1.page.getByRole("button", { name: "Convert to Member" }).count()) === 0);
await s1.page.getByRole("button", { name: "Reopen lead" }).click(); await wait(s1.page, 500);
note("G6 reopening asks for the next action (what + when)", (await s1.page.getByTestId("reopen-form").count()) === 1);
await s1.page.getByTestId("reopen-form").getByLabel("Next action").selectOption("whatsapp");
await s1.page.getByRole("button", { name: "Reopen and schedule" }).click(); await wait(s1.page, 3500);
await shot(s1.page, "G7-reopened");
note("G7 reopened: follow-up status, lost fields cleared, exactly one pending WhatsApp follow-up, second history row",
  val(`select status||'/'||coalesce(lost_reason::text,'none')||'/'||(select count(*)||':'||min(kind) from lead_followups where lead_id='${L.laila}' and status='pending')||'/'||(select count(*) from lead_activities where lead_id='${L.laila}' and kind='status_change') from leads where id='${L.laila}'`) === "follow_up/none/1:whatsapp/2");

// conversion by the owner
await s1.page.goto(`${BASE}/sales/leads/${L.karim}`, { waitUntil: "networkidle" }); await wait(s1.page, 4000);
await s1.page.getByRole("button", { name: "Convert to Member" }).click(); await wait(s1.page, 800);
t = await text(s1.page);
note("G8 the conversion form says who is credited (Sold by = the lead owner) and who is recorded as registering it", (await s1.page.getByTestId("convert-credit").innerText()).includes("Nasr Sales One") && /recorded as the\s+employee who registered/.test(t));
await s1.page.getByText("E2E Monthly", { exact: true }).first().click(); await wait(s1.page, 300);
await s1.page.getByLabel("Receipt Number").fill("E2E-0001");
await s1.page.getByText("Cash", { exact: true }).first().click(); await wait(s1.page, 300);
note("G9 price is pre-filled from the membership type", (await s1.page.getByLabel("Price").inputValue()) === "1500");
await s1.page.getByText("Boxing", { exact: true }).first().click();
await s1.page.getByRole("button", { name: "Confirm Conversion" }).click(); await wait(s1.page, 5000);
t = await text(s1.page); await shot(s1.page, "G10-converted");
note("G10 conversion succeeds in the UI with the membership number", (await s1.page.getByTestId("convert-success").count()) === 1 && /Converted — membership/.test(t));
note("G11 database: ONE member + membership + payment; sold_by = owner (sales1), created_by = received_by = sales1, amount 1500, program boxing; lead converted & linked; follow-up closed; conversion row + history",
  val(`select (select count(*) from members where phone='01011110012')||'/'||ms.sold_by||'/'||ms.created_by||'/'||p.received_by||'/'||p.amount::int||'/'||ms.program_type||'/'||l.status||'/'||(l.converted_member_id=ms.member_id)||'/'||(select count(*) from lead_followups where lead_id=l.id and status='pending')||'/'||(select count(*) from lead_conversions where lead_id=l.id)||'/'||(select count(*) from lead_activities where lead_id=l.id and kind='conversion')
       from memberships ms join membership_payments p on p.membership_id=ms.id join leads l on l.id='${L.karim}' where ms.receipt_number='E2E-0001'`)
  === `1/${SALES1}/${SALES1}/${SALES1}/1500/boxing/converted/true/0/1/1`);
await s1.page.reload({ waitUntil: "networkidle" }); await wait(s1.page, 4000);
t = await text(s1.page);
note("G12 after reload the converted lead shows the conversion details (membership, sold by, registered by) and no Convert button",
  (await s1.page.getByTestId("conversion-details").count()) === 1 && (await s1.page.getByTestId("sold-by").innerText()) === "Nasr Sales One" && (await s1.page.getByRole("button", { name: "Convert to Member" }).count()) === 0);
const retry = await rpcAs(ACC.sales1, "convert_lead", { p_lead_id: L.karim, p_membership_type_id: "e2e00001-0000-4000-8000-000000000001", p_receipt_number: "E2E-RETRY", p_price: 1500, p_discount: 0, p_start_date: new Date().toISOString().slice(0, 10), p_payment_method: "cash" });
note("G13 retrying the conversion (network retry / double submit) returns the same membership with already_converted; nothing new is created",
  retry.ok && JSON.stringify(retry.body).includes('"already_converted":true') && val(`select (select count(*) from memberships where receipt_number='E2E-RETRY')||'/'||(select count(*) from members where phone='01011110012')`) === "0/1");
// refusal path: receipt already used
await s1.page.goto(`${BASE}/sales/leads/${L.tamer}`, { waitUntil: "networkidle" }); await wait(s1.page, 4000);
await s1.page.getByRole("button", { name: "Convert to Member" }).click(); await wait(s1.page, 800);
await s1.page.getByText("E2E Monthly", { exact: true }).first().click(); await s1.page.getByLabel("Receipt Number").fill("E2E-0001"); await s1.page.getByText("Cash", { exact: true }).first().click();
await s1.page.getByRole("button", { name: "Confirm Conversion" }).click(); await wait(s1.page, 4000);
t = await text(s1.page); await shot(s1.page, "G14-receipt-used");
note("G14 a receipt number already used is refused with a clear message; nothing is created and the lead stays active",
  /Receipt number E2E-0001 is already used/.test(t) && val(`select (select count(*) from members where phone='01011110002')||'/'||(select status from leads where id='${L.tamer}')`) === "0/follow_up");
// unauthorized (employee)
await s1.page.goto(`${BASE}/sales/team`, { waitUntil: "networkidle" }); await wait(s1.page, 3000);
note("G15 the team dashboard is refused to a sales employee", /available to Branch Managers and Super Admin only/.test(await text(s1.page)));
const idor = await rpcAs(ACC.sales1, "convert_lead", { p_lead_id: L.tina, p_membership_type_id: "e2e00001-0000-4000-8000-000000000001", p_receipt_number: "E2E-IDOR", p_price: 1500, p_discount: 0, p_start_date: new Date().toISOString().slice(0, 10), p_payment_method: "cash" });
note("G16 API: converting a colleague's lead by id is refused; nothing created", idor.ok === false && val(`select count(*) from memberships where receipt_number='E2E-IDOR'`) === "0");
const forgedStatus = await restAs(ACC.sales1, "PATCH", `leads?id=eq.${L.tamer}`, { status: "converted" });
const forgedFollow = await restAs(ACC.sales1, "PATCH", `lead_followups?lead_id=eq.${L.tamer}`, { status: "completed" });
const forgedOwner = await restAs(ACC.sales1, "PATCH", `leads?id=eq.${L.tamer}`, { assigned_to: SALES2 });
note("G17 API: forged direct writes are refused (fake conversion, completing a follow-up without a next action, giving a lead away); data unchanged",
  !forgedStatus.ok && !forgedFollow.ok && !forgedOwner.ok && val(`select status||'/'||assigned_to||'/'||(select count(*) from lead_followups where lead_id='${L.tamer}' and status='pending') from leads where id='${L.tamer}'`) === `follow_up/${SALES1}/1`,
  `${forgedStatus.status}/${forgedFollow.status}/${forgedOwner.status}`);
const profileEdit = await restAs(ACC.sales1, "PATCH", `leads?id=eq.${L.tamer}`, { interest_notes: "prefers mornings" });
note("G18 API: ordinary profile edits on an own lead still work", profileEdit.ok && val(`select interest_notes from leads where id='${L.tamer}'`) === "prefers mornings");

// ---------- H. Branch manager ----------
limiter(); const mg = await newSession(browser, "manager"); await loginReliably(mg.page, ACC.manager);
await mg.page.goto(`${BASE}/sales/leads/${L.pete}`, { waitUntil: "networkidle" }); await wait(mg.page, 4000);
await mg.page.getByRole("button", { name: "Convert to Member" }).click(); await wait(mg.page, 800);
note("H1 an unassigned inbox lead cannot be converted: the form explains it must be assigned first and Confirm is disabled",
  /has no owner/.test(await text(mg.page)) && (await mg.page.getByRole("button", { name: "Confirm Conversion" }).isDisabled()));
await mg.page.goto(`${BASE}/sales/leads/${L.tina}`, { waitUntil: "networkidle" }); await wait(mg.page, 4000);
await mg.page.getByRole("button", { name: "Convert to Member" }).click(); await wait(mg.page, 800);
note("H2 manager converting an employee's lead: the form credits the owner (Nasr Sales Two)", (await mg.page.getByTestId("convert-credit").innerText()).includes("Nasr Sales Two"));
await mg.page.getByText("E2E Monthly", { exact: true }).first().click(); await mg.page.getByLabel("Receipt Number").fill("E2E-0002");
await mg.page.getByLabel("Discount").fill("200"); await mg.page.getByText("Visa", { exact: true }).first().click();
await mg.page.getByRole("button", { name: "Confirm Conversion" }).click(); await wait(mg.page, 5000);
await shot(mg.page, "H3-manager-converted");
note("H3 sold_by = the lead owner (sales2), created_by = received_by = the manager, payment = price - discount (1300)",
  val(`select ms.sold_by||'/'||ms.created_by||'/'||p.received_by||'/'||p.amount::int||'/'||(select status from leads where id='${L.tina}') from memberships ms join membership_payments p on p.membership_id=ms.id where ms.receipt_number='E2E-0002'`) === `${SALES2}/${MANAGER}/${MANAGER}/1300/converted`);
await mg.page.goto(`${BASE}/sales/team`, { waitUntil: "networkidle" }); await wait(mg.page, 5000);
t = await text(mg.page); await shot(mg.page, "H4-team");
const summary = await rpcAs(ACC.manager, "get_sales_team_summary", {});
const conv = summary.ok ? summary.body[0].converted_in_period : -1;
note("H4 team dashboard shows conversions in the period and the conversion-rate definitions (numerator / denominator)", conv >= 2 && /converted ÷ \(converted \+ lost\)/.test(t) && /converted ÷ leads created in the period/.test(t), `converted_in_period=${conv}`);
note("H5 team summary 'converted' equals an independent count of branch conversions this Cairo month",
  String(conv) === val(`select count(*) from leads where branch_id='11111111-1111-1111-1111-111111111111' and status='converted' and (converted_at at time zone 'Africa/Cairo')::date >= date_trunc('month', (now() at time zone 'Africa/Cairo'))::date`));

// ---------- R. Reception / unauthorized ----------
limiter(); const rc = await newSession(browser, "reception1"); await loginReliably(rc.page, ACC.reception1);
await rc.page.goto(`${BASE}/sales`, { waitUntil: "networkidle" }); await wait(rc.page, 3500); await shot(rc.page, "R1-reception-sales");
note("R1 reception cannot open Sales", /Sales is only available to Sales, Branch Manager, and Super Admin/.test(await text(rc.page)));
const rconv = await rpcAs(ACC.reception1, "convert_lead", { p_lead_id: L.tamer, p_membership_type_id: "e2e00001-0000-4000-8000-000000000001", p_receipt_number: "E2E-RC", p_price: 1500, p_discount: 0, p_start_date: new Date().toISOString().slice(0, 10), p_payment_method: "cash" });
const rlist = await restAs(ACC.reception1, "GET", "leads?select=id");
note("R2 API: reception cannot convert a lead and reads no leads", rconv.ok === false && rlist.ok && Array.isArray(rlist.body) && rlist.body.length === 0);

for (const s of [s1, mg, rc]) {
  const allowed = { sales1: 2, manager: 1, reception1: 1 }[s.label] ?? 0; let n = 0; // G14 is a deliberate refusal (one 4xx)
  const e = realErrors(s.errors).filter((x) => !(/status of 4\d\d/.test(x) && ++n <= allowed));
  note(`E-${s.label} no unexpected browser console errors`, e.length === 0, e.slice(0, 2).join(" | ").slice(0, 200));
}
await browser.close();
process.exit(summarize("SALES CRM E2E VERIFICATION"));
