/**
 * MANUAL VALIDATION — the whole competition lifecycle through the real UI, as
 * the four roles, with a screenshot and a DATABASE assertion after every
 * important operation. Nothing is written to the database by this script; it
 * is only READ, to confirm that what the screens claim is what was stored.
 *
 *    1  Super Admin   creates the competition            (New competition form)
 *    2  Branch Mgr    publishes it
 *    3  Branch Mgr    opens registration
 *    4  Member        joins it
 *    5  Branch Mgr    assigns the coach
 *    6  Branch Mgr    starts it                           (two-step confirm)
 *    7  Coach         submits a result
 *    8  Branch Mgr    REJECTS it, with a reason
 *    9  Coach         sees the reason, RESUBMITS a corrected result
 *   10  Branch Mgr    approves it
 *   11  Coach         requests a CORRECTION; Branch Mgr approves it
 *   12  Branch Mgr    completes the competition           (two-step confirm)
 *   13  Member        views the final standings
 *   14  Super Admin   reads the complete history in the Audit Log
 *
 * Run against a freshly seeded database:   bash ../acceptance.sh
 */
import { chromium, BASE, ACCOUNTS, newSession, login, note, summarize, shot, text, dtLocal, sql, realErrors } from "./common.mjs";

const RUN = Date.now().toString().slice(-5);
const TITLE = `Manual Validation Cup ${RUN}`;
const browser = await chromium.launch();
const val = (q) => sql(q);
const open = async (page, cid) => { await page.goto(`${BASE}/challenges/${cid}`, { waitUntil: "networkidle" }); await page.waitForTimeout(4000); };
const click = async (page, name, wait = 3800) => { await page.getByRole("button", { name }).first().click(); await page.waitForTimeout(wait); };

let cid = null;
async function stage(name, fn) {
  try { await fn(); }
  catch (e) { note(`${name}: completed without an exception`, false, String(e.message ?? e).split("\n")[0].slice(0, 200)); }
}
const sa = await newSession(browser, "admin");
const mgr = await newSession(browser, "manager");
const coach = await newSession(browser, "coach");
const mem = await newSession(browser, "member");
for (const [s, a] of [[sa, ACCOUNTS.admin], [mgr, ACCOUNTS.manager], [coach, ACCOUNTS.coach1], [mem, ACCOUNTS.member01]]) {
  const landed = await login(s.page, a);
  note(`${s.label} signs in`, !landed.includes("/login"), landed);
}
const resultRow = (page, name) => page.locator("ul li").filter({ hasText: name }).first();
const deskCard = (page, name) => page.locator("div.rounded-lg").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
const originals = () => val(`select coalesce(string_agg(status||':'||result_value::numeric::int, ',' order by created_at), 'none') from challenge_results where challenge_id='${cid}' and corrects_result_id is null`);

// ------------------------------------------------------------ 1. SUPER ADMIN creates
await stage("1 create", async () => {
  const p = sa.page;
  await p.goto(`${BASE}/challenges`, { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
  await p.getByRole("button", { name: "New competition" }).click(); await p.waitForTimeout(600);
  await p.getByLabel("Season").selectOption({ label: "Winter 2026" });
  await p.getByLabel("Title").fill(TITLE);
  await p.getByLabel("Description (optional)").fill("Created by the manual validation run.");
  await p.getByLabel("Scope").selectOption({ label: "Single branch" });
  await p.locator("select", { has: p.locator("option", { hasText: "Nasr City" }) }).first().selectOption({ label: "Nasr City" });
  await p.getByLabel("Unit").fill("reps");
  await p.getByLabel(/^Weight/).fill("10");
  await p.getByLabel("Registration opens").fill(dtLocal(-1));
  await p.getByLabel("Registration closes").fill(dtLocal(14));
  await p.getByLabel("Starts").fill(dtLocal(-0.5));
  await p.getByLabel("Ends").fill(dtLocal(21));
  await p.getByLabel("Minimum age (optional)").fill("16");
  await shot(p, "mv-01-admin-create-form");
  await p.getByRole("button", { name: "Create competition" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-02-admin-created");
  cid = val(`select id from challenges where title='${TITLE}'`);
  note("1  the Super Admin created the competition", !!cid);
  if (!cid) { console.log("cannot continue without a competition"); process.exit(summarize("MANUAL VALIDATION")); }
  note("1  …stored as a Nasr City draft created by the Super Admin",
    val(`select c.status||'|'||b.name||'|'||c.created_by from challenges c join branches b on b.id=c.branch_id where c.id='${cid}'`) === `draft|Nasr City|${ACCOUNTS.admin.id}`);
});

// ------------------------------------------------------------ 2-3. BRANCH MANAGER publishes and opens
await stage("2-3 publish and open", async () => {
  const p = mgr.page;
  await open(p, cid);
  await shot(p, "mv-03-manager-draft");
  note("2  the Branch Manager sees the Super Admin's draft for their own branch", /Publish competition/.test(await text(p)));
  await click(p, "Publish competition");
  note("2  publishing works", val(`select status from challenges where id='${cid}'`) === "published");
  await shot(p, "mv-04-manager-published");
  await click(p, "Open registration");
  note("3  opening registration works", val(`select status from challenges where id='${cid}'`) === "registration_open");
  await shot(p, "mv-05-manager-registration-open");
});

// ------------------------------------------------------------ 4. MEMBER joins
await stage("4 join", async () => {
  const p = mem.page;
  await p.goto(`${BASE}/my-challenges`, { waitUntil: "networkidle" }); await p.waitForTimeout(3500);
  note("4  the member sees the competition open for registration", (await text(p)).includes(TITLE));
  const card = p.locator("li, div").filter({ has: p.locator(`a:has-text("${TITLE}")`) }).filter({ has: p.getByRole("button", { name: "Join" }) }).last();
  await shot(p, "mv-06-member-before-join");
  await card.getByRole("button", { name: "Join" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-07-member-joined");
  note("4  the member joined and was approved by the age rule",
    val(`select status from challenge_participants where challenge_id='${cid}' and participant_profile_id='${ACCOUNTS.member01.id}'`) === "approved");
});

// ------------------------------------------------------------ 5-6. assign coach, start
await stage("5-6 assign and start", async () => {
  const p = mgr.page;
  await open(p, cid);
  const row = resultRow(p, "Desert Hawk");
  await row.getByLabel("Designate coach").selectOption({ label: "Karim Hassan" });
  await row.getByLabel("Reason (required)").fill("Nasr City cohort coach.");
  await shot(p, "mv-08-manager-assign-coach");
  await row.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(4000);
  note("5  the coach was assigned", val(`select designated_coach_id from challenge_participants where challenge_id='${cid}' and participant_profile_id='${ACCOUNTS.member01.id}'`) === ACCOUNTS.coach1.id);
  await click(p, "Start competition", 900);
  await shot(p, "mv-09-manager-start-confirm");
  note("6  starting asks for confirmation first", val(`select status from challenges where id='${cid}'`) === "registration_open");
  await click(p, /Confirm: Start competition/);
  note("6  the competition is active", val(`select status from challenges where id='${cid}'`) === "active");
});

// ------------------------------------------------------------ 7. COACH submits
await stage("7 submit", async () => {
  const p = coach.page;
  await open(p, cid);
  const row = resultRow(p, "Desert Hawk");
  await row.getByLabel(/^Result \(/).fill("40");
  await shot(p, "mv-10-coach-submit-form");
  await row.getByRole("button", { name: "Submit result" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-11-coach-submitted");
  note("7  the coach's result is stored PENDING, entered by the coach", originals() === "pending:40" &&
    val(`select entered_by_profile_id from challenge_results where challenge_id='${cid}' and corrects_result_id is null`) === ACCOUNTS.coach1.id, originals());
  const t = await text(p);
  note("7  the coach is told it awaits review and gets no second submit form", /awaiting review/.test(t) && (await resultRow(p, "Desert Hawk").getByRole("button", { name: /Submit result|Resubmit result/ }).count()) === 0);
});

// ------------------------------------------------------------ 8. REJECT
await stage("8 reject", async () => {
  const p = mgr.page;
  await open(p, cid);
  await shot(p, "mv-12-manager-review-desk");
  const card = deskCard(p, "Desert Hawk");
  note("8  the Reject button is disabled until a reason is typed", await card.getByRole("button", { name: "Reject" }).isDisabled());
  await card.getByPlaceholder("Why are you rejecting this?").fill("Form broke on the last ten reps.");
  await card.getByRole("button", { name: "Reject" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-13-manager-rejected");
  note("8  the result is REJECTED", originals() === "rejected:40", originals());
  note("8  …the reason was stored with the review", val(`select v.notes from challenge_result_reviews v join challenge_results r on r.id=v.result_id where r.challenge_id='${cid}'`) === "Form broke on the last ten reps.");
  note("8  …and a rejected result scored nothing", Number(val(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id='${cid}'`)) === 0);
});

// ------------------------------------------------------------ 9. COACH sees the reason and RESUBMITS
await stage("9 resubmit", async () => {
  const p = coach.page;
  await open(p, cid);
  await shot(p, "mv-14-coach-sees-rejection");
  const row = resultRow(p, "Desert Hawk");
  const reason = await row.getByTestId("rejection-note").textContent().catch(() => "");
  note("9  the coach is shown the rejection reason", /Form broke on the last ten reps/.test(reason ?? ""), reason?.slice(0, 80));
  note("9  …and the button now says Resubmit", (await row.getByRole("button", { name: "Resubmit result" }).count()) === 1);
  await row.getByLabel(/^Result \(/).fill("45");
  await row.getByRole("button", { name: "Resubmit result" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-15-coach-resubmitted");
  note("9  the corrected result was accepted: the rejected one is KEPT and a new one is pending", originals() === "rejected:40,pending:45", originals());
  const m = mgr.page;
  await open(m, cid);
  await shot(m, "mv-16-manager-sees-resubmission");
  note("9  the manager's review desk marks it as a resubmission after a rejection", (await m.getByTestId("resubmission-tag").count()) === 1);
});

// ------------------------------------------------------------ 10. APPROVE
await stage("10 approve", async () => {
  const p = mgr.page;
  await deskCard(p, "Desert Hawk").getByRole("button", { name: "Approve" }).click(); await p.waitForTimeout(4500);
  await shot(p, "mv-17-manager-approved");
  note("10 the resubmitted result is APPROVED", originals() === "rejected:40,approved:45", originals());
  note("10 …and points were awarded", Number(val(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id='${cid}'`)) > 0);
  const c = coach.page;
  await open(c, cid);
  const row = resultRow(c, "Desert Hawk");
  note("10 with an approved result the coach is offered a CORRECTION, not a new submission",
    (await row.getByTestId("correction-form").count()) === 1 && (await row.getByRole("button", { name: /Submit result|Resubmit result/ }).count()) === 0);
});

// ------------------------------------------------------------ 11. CORRECT
await stage("11 correct", async () => {
  const c = coach.page;
  const row = resultRow(c, "Desert Hawk");
  await row.getByLabel(/^Correct approved result/).fill("48");
  await shot(c, "mv-18-coach-correction-form");
  await row.getByRole("button", { name: "Request correction" }).click(); await c.waitForTimeout(4500);
  await shot(c, "mv-19-coach-correction-requested");
  note("11 the correction is stored PENDING and the approved result stays live",
    val(`select count(*) from challenge_results where challenge_id='${cid}' and status='correction_pending' and result_value=48`) === "1" &&
    val(`select count(*) from challenge_results where challenge_id='${cid}' and corrects_result_id is null and status='approved' and superseded_by_result_id is null`) === "1");
  const m = mgr.page;
  await open(m, cid);
  const card = m.locator("div.rounded-lg").filter({ hasText: "Correction Pending" }).filter({ has: m.getByRole("button", { name: "Approve" }) }).last();
  await shot(m, "mv-20-manager-correction-desk");
  await card.getByRole("button", { name: "Approve" }).click(); await m.waitForTimeout(4500);
  await shot(m, "mv-21-manager-correction-approved");
  note("11 the correction is APPROVED and supersedes the original",
    val(`select count(*) from challenge_results where challenge_id='${cid}' and corrects_result_id is not null and status='approved' and result_value=48`) === "1" &&
    val(`select count(*) from challenge_results where challenge_id='${cid}' and corrects_result_id is null and superseded_by_result_id is not null`) === "1");
});

// ------------------------------------------------------------ 12. COMPLETE
await stage("12 complete", async () => {
  const p = mgr.page;
  await click(p, "Complete competition", 900);
  await shot(p, "mv-22-manager-complete-confirm");
  note("12 completing warns it cannot be reopened", /cannot be reopened/i.test(await text(p)));
  await click(p, /Confirm: Complete competition/, 4500);
  await shot(p, "mv-23-manager-completed");
  note("12 the competition is COMPLETED", val(`select status from challenges where id='${cid}'`) === "completed");
  note("12 …and the Lifecycle card now offers only Archive", /Archive competition/.test(await text(p)) && !/Start competition/.test(await text(p)));
});

// ------------------------------------------------------------ 13. MEMBER views standings
await stage("13 standings", async () => {
  const p = mem.page;
  await p.goto(`${BASE}/my-challenges/${cid}`, { waitUntil: "networkidle" }); await p.waitForTimeout(4000);
  await shot(p, "mv-24-member-standings");
  const t = await text(p);
  note("13 the member sees the final standings: their display name with the CORRECTED 48", /Desert Hawk/.test(t) && /48/.test(t) && !/\b45 reps\b/.test(t), "");
  await p.goto(`${BASE}/my-challenges`, { waitUntil: "networkidle" }); await p.waitForTimeout(3500);
  await shot(p, "mv-25-member-results-history");
  const mine = await text(p);
  note("13 …and their own results list keeps the rejected attempt visible", /Rejected/.test(mine) && /Approved/.test(mine));
  note("13 …with no control to submit or change a result", (await p.getByRole("button", { name: /Submit result|Resubmit result|Request correction/ }).count()) === 0);
  note("13 no real client errors in the member session", realErrors(mem.errors).length === 0, realErrors(mem.errors).slice(0, 2).join(" | "));
});

// ------------------------------------------------------------ 14. AUDIT HISTORY
await stage("14 audit", async () => {
  const ids = val(`select string_agg(id::text, ',') from challenge_results where challenge_id='${cid}'`).split(",");
  const inList = ids.map((i) => `'${i}'`).join(",");
  const rows = val(`select action||'|'||target_id||'|'||coalesce(admin_id::text,'none')||'|'||coalesce(after->>'decision','')||'|'||coalesce(after->>'status','') from admin_audit_log where target_id in (${inList}) order by created_at, id`).split("\n");
  const byTx = rows.map((r) => r.split("|"));
  const first = (pred) => byTx.findIndex(pred);
  const r1 = val(`select id from challenge_results where challenge_id='${cid}' and corrects_result_id is null and result_value=40`);
  const r2 = val(`select id from challenge_results where challenge_id='${cid}' and corrects_result_id is null and result_value=45`);
  const r3 = val(`select id from challenge_results where challenge_id='${cid}' and corrects_result_id is not null`);
  const seq = [
    first(([a, t]) => a === "challenge_result_submitted" && t === r1),
    first(([a, t, , d]) => a === "challenge_result_reviewed" && t === r1 && d === "rejected"),
    first(([a, t]) => a === "challenge_result_submitted" && t === r2),
    first(([a, t, , d]) => a === "challenge_result_reviewed" && t === r2 && d === "approved"),
    first(([a, t]) => a === "challenge_result_correction_requested" && t === r3),
    first(([a, t, , d]) => a === "challenge_result_reviewed" && t === r3 && d === "approved"),
  ];
  note("14 every step of the result history is in the audit log", seq.every((i) => i >= 0), `positions ${seq.join(",")}`);
  note("14 …in the order it happened: submitted, rejected, resubmitted, approved, correction requested, correction approved",
    seq.every((v, i) => i === 0 || v > seq[i - 1]), `positions ${seq.join(",")}`);
  note("14 …submissions attributed to the coach, reviews to the branch manager",
    byTx.filter(([a]) => /submitted|correction_requested/.test(a)).every(([, , who]) => who === ACCOUNTS.coach1.id) &&
    byTx.filter(([a]) => a === "challenge_result_reviewed").every(([, , who]) => who === ACCOUNTS.manager.id));
  note("14 …the supersession of the original by the correction is recorded", byTx.some(([a, t]) => a === "challenge_result_superseded" && t === r2));

  const p = sa.page;
  await p.goto(`${BASE}/audit-log`, { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
  await p.locator("select", { has: p.locator("option", { hasText: "All entities" }) }).selectOption({ label: "challenge result" });   // the screen humanises underscores
  await p.waitForTimeout(3500);
  await shot(p, "mv-26-admin-audit-log");
  const t = await text(p);
  // The screen title-cases action names ("Challenge Result Submitted").
  note("14 the Super Admin sees the result history on the Audit Log screen: submissions, reviews, status changes, correction and supersession",
    ["Challenge Result Submitted", "Challenge Result Reviewed", "Challenge Result Status Changed", "Challenge Result Correction Requested", "Challenge Result Superseded"].every((s) => t.toLowerCase().includes(s.toLowerCase())));
  note("14 …attributed to the coach and the branch manager by name and role", /Karim Hassan/.test(t) && /Mona Darwish/.test(t) && /coach/i.test(t) && /branch manager/i.test(t));
  // the reviewer's note lives in the row's detail ("View")
  await p.locator("select", { has: p.locator("option", { hasText: "All actions" }) }).selectOption({ label: "challenge result reviewed" });
  await p.waitForTimeout(3000);
  let reason = false;
  const views = p.getByText("View", { exact: true });
  for (let i = 0; i < Math.min(await views.count(), 12) && !reason; i++) {
    await views.nth(i).click(); await p.waitForTimeout(500);
    reason = /Form broke on the last ten reps/.test(await text(p));
  }
  await shot(p, "mv-27-admin-audit-detail");
  note("14 …and opening a review shows the rejection reason", reason);
  note("14 no real client errors in the Super Admin session", realErrors(sa.errors).length === 0, realErrors(sa.errors).slice(0, 2).join(" | "));
});

note("no real client errors in the branch manager session", realErrors(mgr.errors).length === 0, realErrors(mgr.errors).slice(0, 2).join(" | "));
note("no real client errors in the coach session", realErrors(coach.errors).length === 0, realErrors(coach.errors).slice(0, 2).join(" | "));
await browser.close();
process.exit(summarize("MANUAL VALIDATION"));
