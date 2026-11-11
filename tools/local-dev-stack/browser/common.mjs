/**
 * Shared helpers for the LOCAL DEV browser checks. Drives the real web app
 * (http://127.0.0.1:3000) in headless Chromium against the real local
 * database via tools/local-dev-stack/gateway.mjs.
 *
 * Playwright is not a dependency of the repo: Claude Code's cloud image ships
 * it under /opt/node-tools. Point PLAYWRIGHT_MODULE elsewhere to use another
 * install.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/playwright/index.js");
export const { chromium } = pw;

export const BASE = process.env.WEB_BASE ?? "http://127.0.0.1:3000";
export const DB = process.env.LOCAL_DB ?? "ninth_round_local";
export const SHOTS = process.env.SHOTS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "screenshots");

export const ACCOUNTS = {
  admin:    { email: "admin@9thround.local",     id: "aea7db27-3aaa-4701-aed2-f1b49127bdda" },
  manager:  { email: "manager@9thround.local",   id: "aaaa0001-0000-4000-8000-000000000001" },
  coach1:   { email: "coach.one@9thround.local", id: "aaaa0002-0000-4000-8000-000000000002" },
  coach2:   { email: "coach.two@9thround.local", id: "aaaa0003-0000-4000-8000-000000000003" },
  member01: { email: "member01@9thround.local",  id: "bbbb0001-0000-4000-8000-000000000001" },
  member02: { email: "member02@9thround.local",  id: "bbbb0002-0000-4000-8000-000000000002" },
};
export const PASSWORD = "demo1234";

/** Errors this LOCAL setup produces by construction (no email provider), not app defects. */
const EXPECTED_LOCAL_ERRORS = [/status of 500 .*Internal Server Error/i, /status of 429 .*Too Many Requests/i];
export const realErrors = (errors) => errors.filter((e) => !EXPECTED_LOCAL_ERRORS.some((r) => r.test(e)));

export const results = [];
export function note(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}
export function summarize(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n==============================\n${label}: ${results.length - failed.length} passed, ${failed.length} failed\n==============================`);
  for (const f of failed) console.log(`  - ${f.step}${f.detail ? " (" + f.detail + ")" : ""}`);
  return failed.length === 0 ? 0 : 1;
}

/** One-line psql helper against the local database (read-only checks and OTP recovery). */
export function sql(query) {
  const asRoot = process.getuid?.() === 0;
  const args = ["-At", "-d", DB, "-c", query];
  return (asRoot
    ? execFileSync("su", ["postgres", "-c", `psql ${args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(" ")}`], { encoding: "utf8" })
    : execFileSync("psql", args, { encoding: "utf8" })).trim();
}

/**
 * Reads the 6-digit device-verification code the way an administrator would:
 * from the message the app "emailed" to the local mail sink
 * (tools/local-dev-stack/mail-sink.mjs, which stands in for Resend).
 *
 * This replaces an earlier workaround that read the code's hash out of the
 * database and brute-forced the six digits. That stopped being possible, by
 * design, when the stored hash became a keyed HMAC (migration 20261116000001).
 */
const SINK = process.env.MAIL_SINK ?? "http://127.0.0.1:54325";
export async function sinkReset() { await fetch(`${SINK}/reset`, { method: "POST" }).catch(() => {}); }
export async function sinkLastCode(timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const m = await fetch(`${SINK}/last`).then((r) => r.json()).catch(() => null);
    if (m?.code) return m.code;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function newSession(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors, label };
}

export async function login(page, account) {
  await sinkReset();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="username"]').first().fill(account.email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4500);
  if (/New Device Verification/i.test((await page.textContent("body")) ?? "")) {
    // The gate requests a code as soon as it appears. Read it from the sink.
    let code = await sinkLastCode(8000);
    if (!code) {
      await page.locator('button:has-text("Resend code")').first().click();
      code = await sinkLastCode(15000);
    }
    if (code) {
      await page.locator("input").first().fill(code);
      await page.locator('button:has-text("Verify")').first().click();
      await page.waitForTimeout(5000);
    }
  }
  await page.waitForTimeout(1500);
  return page.url();
}

export const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
export const text = async (page) => (await page.textContent("body")) ?? "";
export const dtLocal = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Calls an RPC AS a signed-in account straight against the gateway — no UI.
 * Used to prove the SERVER refuses what the UI merely hides. Returns
 * { ok, status, body } and never throws on a refusal.
 */
export async function rpcAs(account, name, args = {}) {
  const GATEWAY = process.env.GATEWAY_BASE ?? "http://127.0.0.1:54321";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (await import("node:fs")).readFileSync(
    new URL("../../../apps/web/.env.local", import.meta.url), "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const tokenRes = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: PASSWORD }),
  });
  const { access_token } = await tokenRes.json();
  const res = await fetch(`${GATEWAY}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: anon, authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  let body = null;
  try { body = await res.json(); } catch { /* void RPC */ }
  return { ok: res.ok, status: res.status, body };
}

/** A real access token for an account, via the gateway's password grant. */
export async function tokenFor(account) {
  const GATEWAY = process.env.GATEWAY_BASE ?? "http://127.0.0.1:54321";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (await import("node:fs")).readFileSync(
    new URL("../../../apps/web/.env.local", import.meta.url), "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const res = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: PASSWORD }),
  });
  return (await res.json()).access_token;
}
