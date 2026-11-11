/**
 * REMOTE-BROWSER CHECK — the app as seen from a browser that can reach ONLY the
 * app's own address, which is what a remote preview is.
 *
 * Every other browser check here runs inside the same container as the local
 * stack, where http://127.0.0.1:54321 is reachable, so none of them could notice
 * that a developer's own browser cannot call that address (it means THEIR
 * machine). The symptom was a login screen answering "Incorrect Employee ID or
 * password" without a single request reaching the gateway.
 *
 * This check aborts every request the browser makes to the gateway's port, then
 * signs in and loads real screens. It passes only if the browser talks to the
 * app's own origin (NEXT_PUBLIC_SUPABASE_URL=same-origin + the local relay).
 */
import { chromium, BASE, ACCOUNTS, newSession, login, note, summarize, shot, text, realErrors } from "./common.mjs";

const browser = await chromium.launch();

async function walled(label, account, fn) {
  const s = await newSession(browser, label);
  let blocked = 0, toGateway = 0;
  // Nothing may reach the gateway directly: abort it, and count the attempts.
  await s.ctx.route((url) => url.port === "54321" || url.port === "54325", (route) => { blocked++; route.abort(); });
  s.page.on("request", (r) => { if (/:54321\b/.test(r.url())) toGateway++; });
  const landed = await login(s.page, account);
  note(`${label}: signs in with the gateway port unreachable from the browser`, !landed.includes("/login"), landed);
  await fn(s);
  note(`${label}: the browser never needed the gateway's own address`, blocked === 0 && toGateway === 0, `blocked=${blocked} direct=${toGateway}`);
  note(`${label}: no real client errors`, realErrors(s.errors).length === 0, realErrors(s.errors).slice(0, 2).join(" | "));
  await s.ctx.close();
}

await walled("member01", ACCOUNTS.member01, async ({ page }) => {
  await page.waitForTimeout(3000);
  const t = await text(page);
  await shot(page, "rb-01-member-through-the-wall");
  note("member01: sees My competitions with their display name and an open competition", /My competitions/.test(t) && (await page.locator("input").first().inputValue()) === "Desert Hawk" && /Winter Kickboxing Round Sprint/.test(t));
});

// A staff account: the device gate's code is read from the sink by the TEST
// (the container side), exactly as I read it for you.
const stub = { _: null };
await walled("manager", ACCOUNTS.manager, async ({ page }) => {
  await page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await shot(page, "rb-02-manager-competitions-through-the-wall");
  const t = await text(page);
  note("manager: Competitions list loads with data", /Nasr City Push-Up Championship/.test(t) && /All-Branch Plank Hold/.test(t));
});

await browser.close();
process.exit(summarize("REMOTE BROWSER"));
