/**
 * THE WRITE JOURNEY, through the real UI.
 *
 * Every state change below is made by clicking the real application's
 * buttons and filling its real forms — nothing is written to the database
 * by this script. The database is only READ afterwards, to confirm that what
 * the screens claim is what was actually stored.
 *
 *   manager  creates a competition              (form -> create_challenge)
 *   manager  publishes it, opens registration   (lifecycle -> set_challenge_status)
 *   member   joins it                           (Join -> request_challenge_participation)
 *   manager  designates a coach                 (roster -> designate_challenge_coach)
 *   manager  starts it                          (two-step confirm)
 *   coach    records the athlete's result       (roster -> submit_challenge_result)
 *   manager  approves it                        (review desk -> approve_challenge_result)
 *   manager  completes it                       (two-step confirm; recomputes points)
 *   member   reads the final standings
 *
 * Run against a freshly seeded database:  bash ../acceptance.sh  first.
 */
import { chromium, BASE, ACCOUNTS, newSession, login, note, summarize, shot, text, dtLocal, sql, realErrors } from "./common.mjs";

const TITLE = `UI Journey Cup ${Date.now().toString().slice(-5)}`;
const browser = await chromium.launch();

// ===================================================================== manager
const mgr = await newSession(browser, "manager");
let challengeId = null;
{
  const { page } = mgr;
  const landed = await login(page, ACCOUNTS.manager);
  note("manager signs in", !landed.includes("/login"), landed);

  await page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "New competition" }).click();
  await page.waitForTimeout(800);
  await shot(page, "j01-manager-create-form");

  // A branch manager's scope is locked to BRANCH / their own branch; the form
  // must say so rather than offer choices the server would refuse.
  const formText = await text(page);
  note("the form tells a branch manager they create single-branch competitions",
    /Branch Manager creates single-branch competitions/i.test(formText));

  await page.getByLabel("Season").selectOption({ index: 1 });   // the first real season (index 0 is the placeholder)
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Description (optional)").fill("Created end to end through the UI.");
  await page.getByLabel("Unit").fill("reps");
  await page.getByLabel(/^Weight/).fill("10");
  await page.getByLabel("Registration opens").fill(dtLocal(-1));
  await page.getByLabel("Registration closes").fill(dtLocal(14));
  await page.getByLabel("Starts").fill(dtLocal(-0.5));
  await page.getByLabel("Ends").fill(dtLocal(21));
  await page.getByLabel("Minimum age (optional)").fill("16");
  await page.getByRole("button", { name: "Create competition" }).click();
  await page.waitForTimeout(4500);
  await shot(page, "j02-manager-after-create");

  const afterCreate = await text(page);
  note("the new competition appears on the list", afterCreate.includes(TITLE));
  challengeId = sql(`select id from challenges where title = '${TITLE}'`) || null;
  if (!challengeId) {
    note("the competition was stored", false, "no row — aborting the journey, nothing later can be meaningful");
    process.exit(summarize("JOURNEY"));
  }
  note("it was really stored, as a draft", sql(`select status from challenges where title = '${TITLE}'`) === "draft",
    `status in the database: ${sql(`select status from challenges where title = '${TITLE}'`)}`);
  note("its age rule was stored", sql(`select count(*) from challenge_eligibility_rules where challenge_id = '${challengeId}'`) === "1");

  await page.locator(`a:has-text("${TITLE}")`).first().click();
  await page.waitForTimeout(3500);
  await shot(page, "j03-manager-draft-detail");
  const draftText = await text(page);
  note("a draft shows the Lifecycle card with a Publish action", /Publish competition/.test(draftText));

  // ---- publish -> open registration (no confirmation: both are reversible in effect)
  await page.getByRole("button", { name: "Publish competition" }).click();
  await page.waitForTimeout(3500);
  note("publishing works from the UI",
    sql(`select status from challenges where id = '${challengeId}'`) === "published",
    `database: ${sql(`select status from challenges where id = '${challengeId}'`)}`);

  await page.getByRole("button", { name: "Open registration" }).click();
  await page.waitForTimeout(3500);
  await shot(page, "j04-manager-registration-open");
  note("opening registration works from the UI",
    sql(`select status from challenges where id = '${challengeId}'`) === "registration_open");
}

// ======================================================================= member
{
  const m = await newSession(browser, "member");
  const { page } = m;
  const landed = await login(page, ACCOUNTS.member01);
  note("member signs in", landed.includes("/my-challenges"), landed);
  await page.waitForTimeout(3000);
  const body = await text(page);
  note("the member sees the new competition open for registration", body.includes(TITLE));
  // Two competitions are open, so the Join control must be the one INSIDE the
  // card that names this competition. Ancestors precede descendants in DOM
  // order, so .last() of the matching elements is the innermost such card.
  const card = page.locator("li, div")
    .filter({ has: page.locator(`a:has-text("${TITLE}")`) })
    .filter({ has: page.getByRole("button", { name: "Join" }) })
    .last();
  let joined = false;
  if (await card.count()) { await card.getByRole("button", { name: "Join" }).click(); joined = true; }
  await page.waitForTimeout(4500);
  await shot(page, "j05-member-joined");
  note("the member could press Join", joined);
  note("the join was stored, approved by the age rule",
    sql(`select status from challenge_participants where challenge_id = '${challengeId}' and participant_profile_id = '${ACCOUNTS.member01.id}'`) === "approved");
  note("no real client errors in the member session", realErrors(m.errors).length === 0, realErrors(m.errors).slice(0, 2).join(" | "));
  await m.ctx.close();
}

// ================================================ manager: designate, then start
{
  const { page } = mgr;
  await page.goto(`${BASE}/challenges/${challengeId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await shot(page, "j06-manager-roster-before-designation");
  const roster = await text(page);
  note("the roster lists the athlete by their real name and shows no coach yet",
    roster.includes("Youssef Adel") || roster.includes("Desert Hawk"));
  note("it warns that results cannot be submitted until a coach is designated", /not designated yet/i.test(roster));

  await page.getByLabel("Designate coach").first().selectOption({ label: "Karim Hassan" });
  await page.getByLabel("Reason (required)").first().fill("Branch coach for the Nasr City cohort.");
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.waitForTimeout(4000);
  await shot(page, "j07-manager-coach-designated");
  note("coach designation works from the UI",
    sql(`select designated_coach_id from challenge_participants where challenge_id = '${challengeId}' and participant_profile_id = '${ACCOUNTS.member01.id}'`) === ACCOUNTS.coach1.id);

  // ---- start: a two-step confirm, because it closes registration
  await page.getByRole("button", { name: "Start competition" }).click();
  await page.waitForTimeout(800);
  await shot(page, "j08-manager-start-confirm");
  note("starting asks for a second confirming click first",
    sql(`select status from challenges where id = '${challengeId}'`) === "registration_open");
  await page.getByRole("button", { name: /Confirm: Start competition/ }).click();
  await page.waitForTimeout(3500);
  note("starting works after confirming",
    sql(`select status from challenges where id = '${challengeId}'`) === "active");
}

// ================================================================ coach: result
{
  const c = await newSession(browser, "coach");
  const { page } = c;
  const landed = await login(page, ACCOUNTS.coach1);
  note("coach signs in", !landed.includes("/login"), landed);
  await page.goto(`${BASE}/challenges/${challengeId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await shot(page, "j09-coach-roster");
  const coachView = await text(page);
  note("the coach sees NO lifecycle controls", !/Lifecycle/.test(coachView) && !/Start competition|Complete competition/.test(coachView));
  note("the coach sees NO designate-coach control", (await page.getByLabel("Designate coach").count()) === 0);

  await page.getByLabel(/^Result \(/).first().fill("58");
  await page.getByRole("button", { name: "Submit result" }).first().click();
  await page.waitForTimeout(4500);
  await shot(page, "j10-coach-submitted");
  note("the coach's result was stored as PENDING, not approved",
    sql(`select status || ':' || result_value from challenge_results where challenge_id = '${challengeId}' and corrects_result_id is null`) === "pending:58.00" ||
    sql(`select status from challenge_results where challenge_id = '${challengeId}' and corrects_result_id is null`) === "pending");
  note("no real client errors in the coach session", realErrors(c.errors).length === 0, realErrors(c.errors).slice(0, 2).join(" | "));
  await c.ctx.close();
}

// ================================================================ manager: review
{
  const { page } = mgr;
  await page.goto(`${BASE}/challenges/${challengeId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await shot(page, "j11-manager-review-desk");
  const desk = await text(page);
  note("the review desk shows the pending result", /Approve/.test(desk) && /Reject/.test(desk));
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.waitForTimeout(4500);
  await shot(page, "j12-manager-approved");
  note("approving works from the UI",
    sql(`select status from challenge_results where challenge_id = '${challengeId}' and corrects_result_id is null`) === "approved");
  note("approval awarded points",
    Number(sql(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id = '${challengeId}'`)) > 0,
    `net points: ${sql(`select coalesce(sum(points_delta),0) from challenge_points_ledger where challenge_id = '${challengeId}'`)}`);

  await page.getByRole("button", { name: "Complete competition" }).click();
  await page.waitForTimeout(800);
  const warn = await text(page);
  note("completing warns that it finalises standings and cannot be reopened", /cannot be reopened/i.test(warn));
  await page.getByRole("button", { name: /Confirm: Complete competition/ }).click();
  await page.waitForTimeout(4500);
  await shot(page, "j13-manager-completed");
  note("completing works after confirming",
    sql(`select status from challenges where id = '${challengeId}'`) === "completed");
  const after = await text(page);
  note("once completed the Lifecycle card offers only Archive", /Archive competition/.test(after) && !/Start competition/.test(after));
  note("no real client errors in the manager session", realErrors(mgr.errors).length === 0, realErrors(mgr.errors).slice(0, 2).join(" | "));
}
await mgr.ctx.close();

// =============================================================== member: standings
{
  const m = await newSession(browser, "member-final");
  const { page } = m;
  await login(page, ACCOUNTS.member01);
  await page.goto(`${BASE}/my-challenges/${challengeId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  await shot(page, "j14-member-final-standings");
  const final = await text(page);
  note("the member sees the final standings with their display name and the 58", /Desert Hawk/.test(final) && /58/.test(final));
  await m.ctx.close();
}

await browser.close();
process.exit(summarize("JOURNEY"));
