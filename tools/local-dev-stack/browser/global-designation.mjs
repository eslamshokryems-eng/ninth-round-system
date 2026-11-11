/**
 * REGRESSION: a SUPER ADMIN opening a GLOBAL competition must be offered coaches for a
 * participant who joined WITHOUT choosing a branch. The coach list used to load only the
 * competition's / viewer's branch (both empty here), leaving the "Select a coach" menu empty.
 * Found on the real Supabase staging project, not by the local suites.
 * Needs a freshly seeded DB (acceptance.sh), the web app on :3000 and the gateway.
 */
import { chromium, ACCOUNTS, newSession, login, note, summarize, sql, text, shot } from "./common.mjs";

const browser = await chromium.launch();
const GLOBAL_TITLE = "Winter Kickboxing Round Sprint";

// A participant with NO branch in a GLOBAL competition, created exactly as the app does it:
// the member's own request_challenge_participation(challenge, null).
const challengeId = sql(`select id from challenges where title = '${GLOBAL_TITLE}'`).trim();
note("the GLOBAL competition exists", /^[0-9a-f-]{36}$/.test(challengeId), challengeId);

const member = await newSession(browser, "member");
await login(member.page, ACCOUNTS.member01 ?? Object.values(ACCOUNTS).find((a) => /member01/.test(a.email ?? a)));
await member.page.goto(new URL("/my-challenges", member.page.url()).toString());
const join = member.page.getByRole("button", { name: /^join/i }).first();
await join.waitFor({ timeout: 30000 }).catch(() => {});
if (await join.count()) await join.click();
await member.page.waitForTimeout(2500);
await member.ctx.close();

const noBranch = sql(`select count(*) from challenge_participants where challenge_id = '${challengeId}' and branch_id is null`).trim();
note("a participant with no branch is on the GLOBAL roster", Number(noBranch) >= 1, `no-branch participants=${noBranch}`);

const admin = await newSession(browser, "admin");
await login(admin.page, ACCOUNTS.admin ?? Object.values(ACCOUNTS).find((a) => /admin@/.test(a.email ?? a)));
await admin.page.goto(new URL(`/challenges/${challengeId}`, admin.page.url()).toString());
await admin.page.getByText("Designate coach").first().waitFor({ timeout: 30000 }).catch(() => {});
const select = admin.page.locator("select").filter({ has: admin.page.locator("option", { hasText: "Select a coach" }) }).first();
await admin.page.waitForTimeout(2500);
const options = (await select.locator("option").allTextContents()).map((t) => t.trim()).filter((t) => t && !/select a coach/i.test(t));
note("super admin is offered coaches for the branch-less participant", options.length >= 2, `options=${options.join(", ")}`);
await shot(admin.page, "global-designation-admin");

// and the designation itself goes through
await select.selectOption({ index: 1 });
await admin.page.getByLabel(/reason/i).first().fill("Assigning this athlete's coach.");
await admin.page.getByRole("button", { name: /^save$/i }).first().click();
await admin.page.waitForTimeout(2500);
const designated = sql(`select count(*) from challenge_participants where challenge_id = '${challengeId}' and branch_id is null and designated_coach_id is not null`).trim();
note("the designation persisted in the database", Number(designated) >= 1, `designated=${designated}`);
await admin.ctx.close();

await browser.close();
process.exit(summarize("GLOBAL DESIGNATION"));
