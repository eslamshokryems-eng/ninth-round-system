/**
 * Records short VIDEO walkthroughs of the real local app, for someone who
 * cannot open the local preview. Output: browser/videos/*.webm
 *   1-member.webm   a member signs in and reads their competitions
 *   2-manager.webm  the branch manager signs in (device code) and opens the
 *                   competitions, a competition's review desk and its standings
 * Needs a freshly seeded DB:  bash ../acceptance.sh
 */
import { chromium, BASE, ACCOUNTS, PASSWORD, sinkReset, sinkLastCode } from "./common.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renameSync } from "node:fs";

const VID = join(dirname(fileURLToPath(import.meta.url)), "videos");
const browser = await chromium.launch();
const pause = (p, ms = 1800) => p.waitForTimeout(ms);

async function record(name, account, steps) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: VID, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  await sinkReset();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }); await pause(page, 2000);
  await page.locator('input[autocomplete="username"]').first().type(account.email, { delay: 60 }); await pause(page, 500);
  await page.locator('input[type="password"]').first().type(PASSWORD, { delay: 60 }); await pause(page, 800);
  await page.locator('button[type="submit"]').first().click(); await pause(page, 4500);
  if (/New Device Verification/i.test((await page.textContent("body")) ?? "")) {
    await pause(page, 2500);                       // let the viewer read the screen
    const code = await sinkLastCode(15000);
    await page.locator("input").first().type(code, { delay: 150 }); await pause(page, 1000);
    await page.locator('button:has-text("Verify")').first().click(); await pause(page, 5000);
  }
  await steps(page);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), join(VID, name));
}

await record("1-member.webm", ACCOUNTS.member01, async (p) => {
  await pause(p, 3500);
  await p.mouse.wheel(0, 700); await pause(p, 2500);
  await p.mouse.wheel(0, 700); await pause(p, 2500);
  await p.locator('a[href^="/my-challenges/"]').first().click(); await pause(p, 4500);
  await p.mouse.wheel(0, 500); await pause(p, 3000);
});

await record("2-manager.webm", ACCOUNTS.manager, async (p) => {
  await pause(p, 2000);
  await p.goto(`${BASE}/challenges`, { waitUntil: "networkidle" }); await pause(p, 4000);
  await p.locator('a:has-text("All-Branch Plank Hold")').first().click(); await pause(p, 4500);
  await p.mouse.wheel(0, 650); await pause(p, 3000);
  await p.mouse.wheel(0, 650); await pause(p, 3000);
  await p.mouse.wheel(0, 650); await pause(p, 3000);
});

await browser.close();
console.log("videos written to", VID);
