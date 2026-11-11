/**
 * Milestone-2 workflows, through the real UI, each followed by a database
 * check of what was actually persisted. Where a screen HIDES something, the
 * same call is then made straight at the server as that role (rpcAs) to
 * prove the database refuses it too — a hidden button is not a control.
 *
 * Needs a freshly seeded database:  bash ../acceptance.sh  first.
 */
import { chromium, BASE, ACCOUNTS, newSession, login, note, summarize, shot, text, dtLocal, sql, rpcAs, realErrors } from "./common.mjs";

const RUN = Date.now().toString().slice(-5);
const SEASON = `Spring 2027 ${RUN}`;
const T = {
  global: `UI Global Cup ${RUN}`,
  multi: `UI Multi Cup ${RUN}`,
  maadi: `UI Maadi Cup ${RUN}`,
  nasr: `UI Nasr Cup ${RUN}`,
  heavy: `UI Heavy ${RUN}`,
};
const id = (title) => sql(`select id from challenges where title = '${title}'`);
const val = (q) => sql(q);
const browser = await chromium.launch();

async function section(name, fn) {
  try { await fn(); }
  catch (e) {
    const msg = String(e.message ?? e);
    // The line of the call log that names the locator is what identifies the failing step.
    const where = (msg.match(/waiting for .*/) ?? [""])[0].replace(/\x1b\[[0-9;]*m/g, "").slice(0, 160);
    note(`${name}: finished without an exception`, false, `${msg.split("\n")[0].slice(0, 120)} | ${where}`);
    for (const [label, s] of [["admin", sa], ["manager", mgr], ["coach", coach]].filter(([, s]) => s)) {
      try { await shot(s.page, `fail-${name.replace(/\W+/g, "-")}-${label}`); } catch { /* page may be closed */ }
    }
  }
}

/** Fills the create form. `scope` is the visible option label. */
async function createViaForm(page, o) {
  await page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "New competition" }).click();
  await page.waitForTimeout(600);
  await page.getByLabel("Season").selectOption({ label: o.season });
  await page.getByLabel("Title").fill(o.title);
  if (o.scope) await page.getByLabel("Scope").selectOption({ label: o.scope });
  await page.waitForTimeout(300);
  if (o.branch) await page.locator("select", { has: page.locator("option", { hasText: o.branch }) }).first().selectOption({ label: o.branch });
  for (const b of o.branches ?? []) await page.getByLabel(b, { exact: true }).check();
  await page.getByLabel("Unit").fill("reps");
  await page.getByLabel(/^Weight/).fill(String(o.weight ?? 10));
  await page.getByLabel("Registration opens").fill(dtLocal(-1));
  await page.getByLabel("Registration closes").fill(dtLocal(14));
  await page.getByLabel("Starts").fill(dtLocal(-0.5));
  await page.getByLabel("Ends").fill(dtLocal(21));
  await page.getByRole("button", { name: "Create competition" }).click();
  await page.waitForTimeout(4500);
}
const open = async (page, cid) => { await page.goto(`${BASE}/challenges/${cid}`, { waitUntil: "networkidle" }); await page.waitForTimeout(4000); };
const click = async (page, name, wait = 3500) => { await page.getByRole("button", { name }).first().click(); await page.waitForTimeout(wait); };

let coach = null;
const sa = await newSession(browser, "admin");
const mgr = await newSession(browser, "manager");
await login(sa.page, ACCOUNTS.admin);
await login(mgr.page, ACCOUNTS.manager);

// ============================================================ 1. seasons
await section("season creation", async () => {
  const { page } = sa;
  await page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("link", { name: /Seasons & weight range/ }).click();
  await page.waitForTimeout(3500);
  await shot(page, "m2-01-settings");
  note("the super admin reaches Seasons & weight range from the list page", /Competition settings/.test(await text(page)));

  // invalid: ends before it starts
  await page.getByLabel("Season name").fill(`Backwards ${RUN}`);
  await page.getByLabel("Starts").fill("2027-06-01");
  await page.getByLabel("Ends").fill("2027-03-01");
  await click(page, "Create season");
  note("a season that ends before it starts is refused on screen", /end date must be after/i.test(await text(page)));
  note("…and nothing was stored", val(`select count(*) from challenge_seasons where name = 'Backwards ${RUN}'`) === "0");

  await page.getByLabel("Season name").fill(SEASON);
  await page.getByLabel("Starts").fill("2027-03-01");
  await page.getByLabel("Ends").fill("2027-06-30");
  await page.getByLabel("Description (optional)").fill("Created through the settings screen.");
  await click(page, "Create season", 4500);
  await shot(page, "m2-02-season-created");
  note("creating a season works", new RegExp(`Season "${SEASON}" created`).test(await text(page)));
  note("…and it is stored with its dates", val(`select starts_at || '..' || ends_at from challenge_seasons where name = '${SEASON}'`) === "2027-03-01..2027-06-30",
    val(`select starts_at || '..' || ends_at from challenge_seasons where name = '${SEASON}'`));
  note("…and it appears in the list on the page", (await page.locator('[data-testid="season-list"]').textContent()).includes(SEASON));
});

// ============================================================ 2. weight range
await section("weight range", async () => {
  const { page } = sa;
  await page.getByLabel("Minimum weight").fill("12");
  await page.getByLabel("Maximum weight").fill("5");
  await click(page, "Save range");
  note("a minimum above the maximum is refused", /minimum weight must be at least 1 and no greater/i.test(await text(page)));
  note("…and the stored range is unchanged", val(`select string_agg(value, ',' order by key) from challenge_settings where key in ('min_weight','max_weight')`) === "20,1",
    val(`select string_agg(key||'='||value, ',' order by key) from challenge_settings where key in ('min_weight','max_weight')`));

  await page.getByLabel("Minimum weight").fill("1");
  await page.getByLabel("Maximum weight").fill("12");
  await click(page, "Save range", 4500);
  await shot(page, "m2-03-weight-range-saved");
  note("saving a valid range works", /Weight range saved: 1–12/.test(await text(page)));
  note("…and it is stored", val(`select max(case when key='min_weight' then value end)||'-'||max(case when key='max_weight' then value end) from challenge_settings`) === "1-12");

  // The BRANCH MANAGER's form must show and enforce the CURRENT range, not packaged defaults.
  const m = mgr.page;
  await m.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await m.waitForTimeout(2500);
  await m.getByRole("button", { name: "New competition" }).click();
  await m.waitForTimeout(800);
  note("the branch manager's create form shows the CURRENT range (1–12)", await m.getByLabel("Weight (1–12)").count() === 1);
  await m.getByLabel("Season").selectOption({ label: SEASON });
  await m.getByLabel("Title").fill(T.heavy);
  await m.getByLabel("Unit").fill("reps");
  await m.getByLabel(/^Weight/).fill("15");
  await m.getByLabel("Registration opens").fill(dtLocal(-1));
  await m.getByLabel("Registration closes").fill(dtLocal(14));
  await m.getByLabel("Starts").fill(dtLocal(0));
  await m.getByLabel("Ends").fill(dtLocal(21));
  await m.getByRole("button", { name: "Create competition" }).click();
  await m.waitForTimeout(3500);
  await shot(m, "m2-04-weight-out-of-range");
  const weightMsg = await m.getByLabel(/^Weight/).evaluate((el) => el.validationMessage);
  note("a weight above the configured maximum is blocked on the branch manager's form", /less than or equal to 12/i.test(weightMsg), weightMsg);
  // …and the server would refuse it as well, if the form were bypassed
  const direct = await rpcAs(ACCOUNTS.manager, "create_challenge", {
    p_season_id: val(`select id from challenge_seasons where name='${SEASON}'`), p_title: T.heavy, p_description: null, p_category: "strength",
    p_program_type: null, p_scope: "BRANCH", p_branch_id: "11111111-1111-1111-1111-111111111111", p_measurement_type: "COUNT",
    p_measurement_unit: "reps", p_scoring_direction: "HIGHER_IS_BETTER", p_weight: 15, p_registration_start_at: new Date().toISOString(),
    p_registration_end_at: new Date(Date.now() + 864e5).toISOString(), p_starts_at: new Date().toISOString(), p_ends_at: new Date(Date.now() + 2 * 864e5).toISOString(),
  });
  note("…and the server refuses it too (current range, 1–12)", !direct.ok && /between 1 and 12/i.test(JSON.stringify(direct.body)), JSON.stringify(direct.body)?.slice(0, 100));
  note("…and nothing was stored", val(`select count(*) from challenges where title = '${T.heavy}'`) === "0");

  await page.getByLabel("Maximum weight").fill("20");
  await click(page, "Save range", 4000);
  note("the range was restored to 1–20", val(`select max(case when key='max_weight' then value end) from challenge_settings`) === "20");
});

// ============================================================ 3. GLOBAL + MULTI_BRANCH
await section("global and multi-branch creation", async () => {
  const { page } = sa;
  await createViaForm(page, { season: SEASON, title: T.global, scope: "All branches", weight: 11 });
  await shot(page, "m2-05-global-created");
  note("the super admin creates a GLOBAL competition", (await text(page)).includes(T.global));
  note("…stored as GLOBAL with no branch, as a draft, by the super admin",
    val(`select scope||'|'||coalesce(branch_id::text,'none')||'|'||status||'|'||created_by from challenges where title='${T.global}'`) ===
      `GLOBAL|none|draft|${ACCOUNTS.admin.id}`, val(`select scope||'|'||coalesce(branch_id::text,'none')||'|'||status from challenges where title='${T.global}'`));
  note("…in the season that was chosen", val(`select s.name from challenges c join challenge_seasons s on s.id=c.season_id where c.title='${T.global}'`) === SEASON);

  await createViaForm(page, { season: SEASON, title: T.multi, scope: "Selected branches", branches: ["Nasr City", "Maadi"], weight: 9 });
  await shot(page, "m2-06-multi-created");
  note("the super admin creates a MULTI_BRANCH competition", (await text(page)).includes(T.multi));
  note("…stored as MULTI_BRANCH with no single branch", val(`select scope||'|'||coalesce(branch_id::text,'none') from challenges where title='${T.multi}'`) === "MULTI_BRANCH|none");
  note("…open to exactly the two branches ticked",
    val(`select string_agg(b.name, ',' order by b.name) from challenge_branches cb join branches b on b.id=cb.branch_id join challenges c on c.id=cb.challenge_id where c.title='${T.multi}'`) === "Maadi,Nasr City",
    val(`select string_agg(b.name, ',' order by b.name) from challenge_branches cb join branches b on b.id=cb.branch_id join challenges c on c.id=cb.challenge_id where c.title='${T.multi}'`));

  // a MULTI_BRANCH competition with no branch ticked must be refused
  await createViaForm(page, { season: SEASON, title: `${T.multi} none`, scope: "Selected branches", branches: [] });
  note("a MULTI_BRANCH competition with no branch ticked is refused", /at least one/i.test(await text(page)));
  note("…and nothing was stored", val(`select count(*) from challenges where title='${T.multi} none'`) === "0");

  // a single-branch competition for the OTHER branch (used for isolation below)
  await createViaForm(page, { season: SEASON, title: T.maadi, scope: "Single branch", branch: "Maadi" });
  note("the super admin creates a competition for another branch (Maadi)",
    val(`select b.name from challenges c join branches b on b.id=c.branch_id where c.title='${T.maadi}'`) === "Maadi");
});

// ============================================================ 4. eligibility rules
await section("eligibility rules", async () => {
  const { page } = sa;
  const gid = id(T.global);
  await open(page, gid);
  await shot(page, "m2-07-rules-empty");
  const rules = () => val(`select coalesce(string_agg(rule_type||'='||(value->>'age'), ',' order by rule_type),'none') from challenge_eligibility_rules where challenge_id='${gid}'`);
  note("a draft shows the Eligibility rules card with no rules", /No rules — open to everyone/.test(await text(page)));

  await page.getByLabel("Rule").selectOption({ label: "Minimum age" });
  await page.getByLabel("Age", { exact: true }).fill("16");
  await click(page, "Add rule");
  note("adding a minimum age works", rules() === "min_age=16", rules());

  await page.getByLabel("Age", { exact: true }).fill("10");
  await click(page, "Add rule");
  await shot(page, "m2-08-rule-inverted-refused");
  note("a maximum below the minimum is refused on screen", /cannot be greater than the maximum|cannot be less than the minimum/i.test(await text(page)));
  note("…and was not stored", rules() === "min_age=16", rules());

  await page.getByLabel("Age", { exact: true }).fill("39");
  await click(page, "Add rule");
  note("adding a maximum age works", rules() === "min_age=16,max_age=39", rules());
  note("with both set the form offers no further rule", /Both a minimum and a maximum age are set/.test(await text(page)));
  await shot(page, "m2-09-rules-both");

  await page.locator('[data-testid="eligibility-card"] li', { hasText: "Maximum age" }).getByRole("button", { name: "Remove" }).click();
  await page.waitForTimeout(3500);
  note("removing a rule works", rules() === "min_age=16", rules());
  note("the audit log recorded the add and the remove",
    Number(val(`select count(*) from admin_audit_log where target_id='${gid}' and action in ('add_challenge_eligibility_rule','remove_challenge_eligibility_rule')`)) >= 3);

  await page.getByLabel("Age", { exact: true }).fill("39");
  await click(page, "Add rule");

  // a MEMBER-visible effect: after registration opens the card is gone and the server refuses
  await click(page, "Publish competition");
  note("the card is still offered while published", (await page.locator('[data-testid="eligibility-card"]').count()) === 1);
  await click(page, "Open registration");
  await shot(page, "m2-10-rules-locked");
  note("once registration opens the Eligibility rules card disappears", (await page.locator('[data-testid="eligibility-card"]').count()) === 0);
  const late = await rpcAs(ACCOUNTS.admin, "add_challenge_eligibility_rule", { p_challenge_id: gid, p_rule_type: "min_age", p_age: 18 });
  note("…and the server refuses a late rule change even from the super admin", !late.ok && /before registration opens/i.test(JSON.stringify(late.body)), JSON.stringify(late.body)?.slice(0, 120));
  note("…leaving the rules untouched", rules() === "min_age=16,max_age=39", rules());
});

// ============================================================ 5. reject + correction flow
coach = await newSession(browser, "coach");
await login(coach.page, ACCOUNTS.coach1);
let nid = null;
await section("branch competition set-up", async () => {
  const { page } = mgr;
  await createViaForm(page, { season: SEASON, title: T.nasr });
  nid = id(T.nasr);
  note("the branch manager creates a Nasr City competition", !!nid);
  await open(page, nid);
  // a branch manager manages the rules of their OWN branch's competition
  await page.getByLabel("Age", { exact: true }).fill("16");
  await click(page, "Add rule");
  await shot(page, "m2-10b-manager-own-rule");
  note("a branch manager can add a rule to their own branch's competition", val(`select count(*) from challenge_eligibility_rules where challenge_id='${nid}' and rule_type='min_age'`) === "1");
  await click(page, "Publish competition");
  await click(page, "Open registration");
  for (const a of [ACCOUNTS.member01, ACCOUNTS.member02]) {
    const m = await newSession(browser, a.email);
    await login(m.page, a);
    await m.page.waitForTimeout(2500);
    const card = m.page.locator("li, div").filter({ has: m.page.locator(`a:has-text("${T.nasr}")`) }).filter({ has: m.page.getByRole("button", { name: "Join" }) }).last();
    await card.getByRole("button", { name: "Join" }).click();
    await m.page.waitForTimeout(4000);
    await m.ctx.close();
  }
  note("two members joined through the member screen", val(`select count(*) from challenge_participants where challenge_id='${nid}' and status='approved'`) === "2");
  await open(page, nid);
  for (let guard = 0; guard < 4; guard++) {
    const row = page.locator("ul li").filter({ hasText: "not designated yet" }).first();
    if (!(await row.count())) break;
    await row.getByLabel("Designate coach").selectOption({ label: "Karim Hassan" });
    await row.getByLabel("Reason (required)").fill("Nasr City cohort coach.");
    await row.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4500);
  }
  note("both athletes were assigned to the coach", val(`select count(*) from challenge_participants where challenge_id='${nid}' and designated_coach_id='${ACCOUNTS.coach1.id}'`) === "2");
  await click(page, "Start competition");
  await click(page, /Confirm: Start competition/, 4000);
  note("the competition is active", val(`select status from challenges where id='${nid}'`) === "active");
});

await section("result rejection and corrections", async () => {
  const c = coach.page;
  await open(c, nid);
  const submit = async (name, value) => {
    const row = c.locator("ul li").filter({ hasText: name }).first();
    await row.getByLabel(/^Result \(/).fill(String(value));
    await row.getByRole("button", { name: "Submit result" }).click();
    await c.waitForTimeout(4000);
  };
  await submit("Desert Hawk", 40);   // member01
  await submit("Nile Storm", 50);    // member02
  note("the coach recorded two pending results", val(`select count(*) from challenge_results where challenge_id='${nid}' and status='pending'`) === "2");
  const deskC = await text(c);
  note("the coach cannot review the results they submitted themselves", (deskC.match(/You submitted this result, so you cannot review it/g) ?? []).length === 2);
  await shot(c, "m2-11-coach-cannot-self-review");

  // ---- manager: rejection requires a reason
  const m = mgr.page;
  await open(m, nid);
  const card = (name) => m.locator("div.rounded-lg").filter({ hasText: name }).filter({ has: m.getByRole("button", { name: "Approve" }) }).last();
  note("the Reject button is DISABLED until a reason is typed", await card("Desert Hawk").getByRole("button", { name: "Reject" }).isDisabled());
  note("…so a result cannot be rejected without a reason", val(`select status from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member01.id}'`) === "pending");
  const noNote = await rpcAs(ACCOUNTS.manager, "reject_challenge_result", { p_result_id: val(`select id from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member01.id}'`), p_notes: "" });
  note("…and the server refuses an empty reason too", !noNote.ok && /reason|note/i.test(JSON.stringify(noNote.body)), JSON.stringify(noNote.body)?.slice(0, 100));
  await card("Desert Hawk").getByPlaceholder("Why are you rejecting this?").fill("Form broke on the last ten reps.");
  await card("Desert Hawk").getByRole("button", { name: "Reject" }).click();
  await m.waitForTimeout(4000);
  await shot(m, "m2-12-result-rejected");
  note("rejecting WITH a reason works", val(`select status from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member01.id}'`) === "rejected");
  note("…and the reason was stored with the review", val(`select v.decision||':'||v.notes from challenge_result_reviews v join challenge_results r on r.id=v.result_id where r.challenge_id='${nid}' and r.participant_profile_id='${ACCOUNTS.member01.id}'`) === "rejected:Form broke on the last ten reps.");
  note("…and a rejected result scores nothing", Number(val(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member01.id}'`)) === 0);

  await card("Nile Storm").getByRole("button", { name: "Approve" }).click();
  await m.waitForTimeout(4000);
  note("the other result was approved and scored", val(`select status from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}'`) === "approved" &&
    Number(val(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}'`)) > 0);

  // ---- coach requests a correction to the APPROVED result
  await open(c, nid);
  await shot(c, "m2-13-coach-correction-form");
  const nile = c.locator("ul li").filter({ hasText: "Nile Storm" }).first();
  note("the coach is offered a correction for the approved result only",
    (await nile.getByTestId("correction-form").count()) === 1 && (await c.locator("ul li").filter({ hasText: "Desert Hawk" }).first().getByTestId("correction-form").count()) === 0);
  await nile.getByLabel(/^Correct approved result/).fill("55");
  await nile.getByRole("button", { name: "Request correction" }).click();
  await c.waitForTimeout(4000);
  await shot(c, "m2-14-correction-requested");
  const cor1 = val(`select id from challenge_results where challenge_id='${nid}' and status='correction_pending'`);
  note("requesting a correction stores a PENDING correction row pointing at the original", !!cor1 &&
    val(`select corrects_result_id from challenge_results where id='${cor1}'`) === val(`select id from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}' and corrects_result_id is null`));
  note("…while the original stays approved and live", val(`select status||':'||coalesce(superseded_by_result_id::text,'live') from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}' and corrects_result_id is null`) === "approved:live");
  note("the coach sees that a correction is already awaiting review (no second form)",
    (await nile.getByTestId("correction-pending-note").count()) === 1 && (await nile.getByTestId("correction-form").count()) === 0);

  // the author cannot review their own correction
  await open(c, nid);
  note("the coach cannot review their own correction", /You submitted this result, so you cannot review it/.test(await text(c)));

  // manager REJECTS the correction
  await open(m, nid);
  const corCard = m.locator("div.rounded-lg").filter({ hasText: "Correction Pending" }).filter({ has: m.getByRole("button", { name: "Approve" }) }).last();
  await corCard.getByPlaceholder("Why are you rejecting this?").fill("The video shows 50, not 55.");
  await corCard.getByRole("button", { name: "Reject" }).click();
  await m.waitForTimeout(4000);
  await shot(m, "m2-15-correction-rejected");
  note("the manager can REJECT a correction", val(`select status from challenge_results where id='${cor1}'`) === "rejected");
  note("…the original result is untouched (still 50, approved, live)", val(`select result_value::numeric::int||':'||status||':'||coalesce(superseded_by_result_id::text,'live') from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}' and corrects_result_id is null`) === "50:approved:live");

  // coach asks again; manager APPROVES
  await open(c, nid);
  const nile2 = c.locator("ul li").filter({ hasText: "Nile Storm" }).first();
  await nile2.getByLabel(/^Correct approved result/).fill("60");
  await nile2.getByRole("button", { name: "Request correction" }).click();
  await c.waitForTimeout(4000);
  await open(m, nid);
  const corCard2 = m.locator("div.rounded-lg").filter({ hasText: "Correction Pending" }).filter({ has: m.getByRole("button", { name: "Approve" }) }).last();
  await corCard2.getByRole("button", { name: "Approve" }).click();
  await m.waitForTimeout(4500);
  await shot(m, "m2-16-correction-approved");
  const original = val(`select id from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}' and corrects_result_id is null`);
  const approvedNew = val(`select id from challenge_results where corrects_result_id='${original}' and status='approved'`);
  note("the manager can APPROVE a second correction", !!approvedNew && Number(val(`select result_value from challenge_results where id='${approvedNew}'`)) === 60);
  note("…the original is now marked superseded by it", val(`select superseded_by_result_id from challenge_results where id='${original}'`) === approvedNew);
  // The leaderboard view requires an authenticated identity, so read it AS a member would.
  const asMember = (q) => sql(`set role authenticated; set request.jwt.claim.sub='${ACCOUNTS.member01.id}'; ${q}`).split("\n").pop().trim();
  note("…and the standings (read as a member) show 60, not 50",
    asMember(`select count(*) from challenge_leaderboard where challenge_id='${nid}' and result_value=60`) === "1" &&
    asMember(`select count(*) from challenge_leaderboard where challenge_id='${nid}' and result_value=50`) === "0");
  note("no real client errors in the manager session", realErrors(mgr.errors).length === 0, realErrors(mgr.errors).slice(0, 2).join(" | "));
  note("no real client errors in the coach session", realErrors(coach.errors).length === 0, realErrors(coach.errors).slice(0, 2).join(" | "));
});

// ============================================================ 6. members only VIEW
await section("members only view results", async () => {
  const m = await newSession(browser, "member02");
  await login(m.page, ACCOUNTS.member02);
  await m.page.waitForTimeout(3000);
  const t = await text(m.page);
  await shot(m.page, "m2-17-member-view-only");
  note("a member sees their results", /Nasr Cup|UI Nasr Cup/.test(t) && /Approved/.test(t));
  note("…with no control to submit a result or request a correction", (await m.page.getByRole("button", { name: /Submit result|Request correction|Approve|Reject/ }).count()) === 0);
  note("…and is told the coach records results", /coach records|recorded by|Entered by your coach/i.test(t));
  const asMember = await rpcAs(ACCOUNTS.member02, "submit_challenge_result", { p_challenge_id: nid, p_participant_profile_id: ACCOUNTS.member02.id, p_result_value: 999, p_measurement_unit: "reps", p_performed_at: new Date().toISOString() });
  note("the server also refuses a member submitting their own result", !asMember.ok, JSON.stringify(asMember.body)?.slice(0, 110));
  const memberCorr = await rpcAs(ACCOUNTS.member02, "request_challenge_result_correction", { p_corrects_result_id: val(`select id from challenge_results where challenge_id='${nid}' and participant_profile_id='${ACCOUNTS.member02.id}' and status='approved' and superseded_by_result_id is null`), p_result_value: 999, p_measurement_unit: "reps", p_performed_at: new Date().toISOString() });
  note("…and a member requesting a correction", !memberCorr.ok, JSON.stringify(memberCorr.body)?.slice(0, 110));
  note("nothing of 999 was stored", val(`select count(*) from challenge_results where result_value=999`) === "0");
  await m.ctx.close();
});

// ============================================================ 7. branch isolation + role access
await section("branch isolation and role access", async () => {
  const m = mgr.page;
  const mid = id(T.maadi);
  // --- a Maadi DRAFT is invisible to the Nasr City manager
  await m.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await m.waitForTimeout(3000);
  note("a Maadi DRAFT is not listed for the Nasr City branch manager", !(await text(m)).includes(T.maadi));
  await open(m, mid);
  await shot(m, "m2-18-manager-maadi-draft");
  note("…and opening it directly says it is not available", /does not exist, or it is a draft you do not have access to/i.test(await text(m)));
  const st = await rpcAs(ACCOUNTS.manager, "set_challenge_status", { p_challenge_id: mid, p_status: "published" });
  note("…and the server refuses the Nasr manager changing its status", !st.ok && /own branch/i.test(JSON.stringify(st.body)), JSON.stringify(st.body)?.slice(0, 110));
  const rr = await rpcAs(ACCOUNTS.manager, "add_challenge_eligibility_rule", { p_challenge_id: mid, p_rule_type: "min_age", p_age: 12 });
  note("…or adding a rule to it", !rr.ok && /own branch/i.test(JSON.stringify(rr.body)), JSON.stringify(rr.body)?.slice(0, 110));
  note("…and the draft is still a draft", val(`select status from challenges where id='${mid}'`) === "draft");

  // --- once PUBLISHED it is visible, but still not manageable by the Nasr manager
  await open(sa.page, mid);
  await click(sa.page, "Publish competition");
  await m.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await m.waitForTimeout(3000);
  note("once published the Maadi competition is visible to the Nasr manager", (await text(m)).includes(T.maadi));
  await open(m, mid);
  await shot(m, "m2-19-manager-maadi-published");
  const tm = await text(m);
  note("…but with NO Lifecycle and NO Eligibility card", !/Lifecycle/.test(tm) && (await m.locator('[data-testid="eligibility-card"]').count()) === 0);
  const st2 = await rpcAs(ACCOUNTS.manager, "set_challenge_status", { p_challenge_id: mid, p_status: "registration_open" });
  note("…and the server still refuses the status change", !st2.ok, JSON.stringify(st2.body)?.slice(0, 110));
  note("…the competition stayed published", val(`select status from challenges where id='${mid}'`) === "published");

  // --- GLOBAL + MULTI: the branch manager manages neither
  const gl = id(T.global), mu = id(T.multi);
  await open(m, gl);
  note("the branch manager has no Lifecycle card on a GLOBAL competition", !/Lifecycle/.test(await text(m)));
  await open(sa.page, mu);
  await click(sa.page, "Publish competition");
  await open(m, mu);
  note("…nor on a MULTI_BRANCH competition", !/Lifecycle/.test(await text(m)));
  const stm = await rpcAs(ACCOUNTS.manager, "set_challenge_status", { p_challenge_id: mu, p_status: "registration_open" });
  note("…and the server refuses a branch manager on a MULTI_BRANCH competition", !stm.ok, JSON.stringify(stm.body)?.slice(0, 110));

  // --- the settings screens
  for (const [who, acct] of [["branch manager", ACCOUNTS.manager], ["coach", ACCOUNTS.coach1]]) {
    const p = who === "coach" ? coach.page : m;
    await p.goto(`${BASE}/challenges/settings`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    await shot(p, `m2-20-settings-denied-${who.replace(" ", "-")}`);
    note(`the ${who} sees the settings screen as denied`, (await p.locator('[data-testid="settings-denied"]').count()) === 1 && (await p.getByLabel("Season name").count()) === 0);
    const sRes = await rpcAs(acct, "create_challenge_season", { p_name: `Sneaky ${who}`, p_description: null, p_starts_at: "2027-01-01", p_ends_at: "2027-02-01" });
    note(`…and the server refuses the ${who} creating a season`, !sRes.ok && /super admin/i.test(JSON.stringify(sRes.body)), JSON.stringify(sRes.body)?.slice(0, 100));
    const wRes = await rpcAs(acct, "set_challenge_weight_range", { p_min: 1, p_max: 999 });
    note(`…and changing the weight range`, !wRes.ok && /super admin/i.test(JSON.stringify(wRes.body)), JSON.stringify(wRes.body)?.slice(0, 100));
  }
  note("no season or range change leaked through", val(`select count(*) from challenge_seasons where name like 'Sneaky%'`) === "0" &&
    val(`select max(case when key='max_weight' then value end) from challenge_settings`) === "20");
  const wr = await rpcAs(ACCOUNTS.coach1, "get_challenge_weight_range");
  note("a coach cannot read the weight range (only creators may)", !wr.ok);
  const wr2 = await rpcAs(ACCOUNTS.manager, "get_challenge_weight_range");
  note("a branch manager can", wr2.ok && wr2.body?.[0]?.max_weight === 20 || wr2.ok && wr2.body?.max_weight === 20, JSON.stringify(wr2.body));

  // --- members cannot reach the staff screens at all
  const mem = await newSession(browser, "member01");
  await login(mem.page, ACCOUNTS.member01);
  for (const path of ["/challenges", "/challenges/settings"]) {
    await mem.page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await mem.page.waitForTimeout(3000);
    const body = await text(mem.page);
    note(`a member opening ${path} gets no staff controls`, !(await mem.page.getByRole("button", { name: /New competition|Create season|Save range|Publish competition/ }).count()) && !/Season name/.test(body));
  }
  await shot(mem.page, "m2-21-member-on-staff-url");
  const memRule = await rpcAs(ACCOUNTS.member01, "add_challenge_eligibility_rule", { p_challenge_id: id(T.global), p_rule_type: "min_age", p_age: 5 });
  const memStatus = await rpcAs(ACCOUNTS.member01, "set_challenge_status", { p_challenge_id: id(T.global), p_status: "archived" });
  note("the server refuses a member changing rules or status", !memRule.ok && !memStatus.ok);
  await mem.ctx.close();
});

// ============================================================ 8. staff participation stays disabled
await section("staff participation", async () => {
  const open_id = val(`select id from challenges where status='registration_open' order by created_at limit 1`);
  const before = val(`select count(*) from challenge_participants cp join profiles p on p.id=cp.participant_profile_id where p.role <> 'member'`);
  for (const [who, acct] of [["coach", ACCOUNTS.coach1], ["branch manager", ACCOUNTS.manager], ["super admin", ACCOUNTS.admin]]) {
    const r = await rpcAs(acct, "request_challenge_participation", { p_challenge_id: open_id, p_branch_id: null });
    note(`the server still refuses a ${who} entering a competition`, !r.ok && /member account|display name/i.test(JSON.stringify(r.body)), JSON.stringify(r.body)?.slice(0, 100));
  }
  note("no staff participant row exists", val(`select count(*) from challenge_participants cp join profiles p on p.id=cp.participant_profile_id where p.role <> 'member'`) === before && before === "0", before);
  // and the UI offers staff no Join control on any screen they can reach
  const c = coach.page;
  await c.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await c.waitForTimeout(3000);
  note("the staff Competitions screen has no Join control", (await c.getByRole("button", { name: "Join" }).count()) === 0);
});

await browser.close();
process.exit(summarize("M2 WORKFLOWS"));
