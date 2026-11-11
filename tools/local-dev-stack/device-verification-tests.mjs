#!/usr/bin/env node
/**
 * Device-verification tests against the REAL route handlers
 * (/api/auth/device/request-code and /verify-code) running on the local web
 * app, with codes delivered through the local mail sink exactly as an
 * administrator would receive them.
 *
 * This is the same experiment that exposed the original race — N parallel
 * wrong guesses against one code — now run against the fixed implementation.
 * Before the fix, 40 parallel wrong guesses against a code limited to 5 caused
 * 29 guesses to be evaluated and logged.
 *
 * Needs the stack up (postgres, gateway, mail sink, web app) and a freshly
 * seeded database:   bash acceptance.sh
 */
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { ACCOUNTS, note, summarize, sql, tokenFor, sinkReset, sinkLastCode } from "./browser/common.mjs";

const WEB = process.env.WEB_BASE ?? "http://127.0.0.1:3000";
const PARALLEL = Number(process.env.PARALLEL ?? 40);
const MAX_ATTEMPTS = 5;
const acct = ACCOUNTS.coach2;            // a staff account with no other role in these tests
const pepper = readFileSync(new URL("../../apps/web/.env.local", import.meta.url), "utf8").match(/DEVICE_VERIFICATION_PEPPER=(.*)/)[1].trim();
let token = await tokenFor(acct);

const post = (path, body) => fetch(`${WEB}${path}`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const errCode = async (r) => (await r.clone().json().catch(() => ({})))?.error?.code ?? null;
const reset = async () => { sql(`delete from device_verification_codes where user_id='${acct.id}'`); await sinkReset(); };
const rows = () => sql(`select id||'|'||attempts||'|'||(consumed_at is not null)||'|'||succeeded||'|'||code_hash from device_verification_codes where user_id='${acct.id}' order by created_at desc limit 1`).split("|");
const audit = (action, since) => Number(sql(`select count(*) from admin_audit_log where action='${action}' and target_id='${acct.id}' and created_at >= '${since}'`));
const now = () => sql("select now()");
const tally = (xs) => xs.reduce((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
async function issue() { // a fresh live code, delivered through the sink
  await reset();
  const r = await post("/api/auth/device/request-code");
  const code = await sinkLastCode(10000);
  return { r, code };
}
const wrongCodes = (real, n) => Array.from({ length: n }, (_, i) => String((Number(real) + 1 + i) % 1000000).padStart(6, "0")).filter((c) => c !== real);

// ================================================================ 1. success
{
  const { r, code } = await issue();
  note("a code is issued and delivered through the mail sink", r.status === 200 && /^\d{6}$/.test(code ?? ""), `status ${r.status}`);
  const bad = await post("/api/auth/device/verify-code", { code: wrongCodes(code, 1)[0] });
  note("a wrong code is refused (INVALID_CODE)", bad.status === 400 && (await errCode(bad)) === "INVALID_CODE");
  const since = now();
  const good = await post("/api/auth/device/verify-code", { code });
  note("the correct code verifies", good.status === 200 && (await good.json()).ok === true, `status ${good.status}`);
  const [, attempts, consumed, succeeded] = rows();
  note("…the code is consumed and recorded as succeeded", consumed === "true" && succeeded === "true", `consumed=${consumed} succeeded=${succeeded} attempts=${attempts}`);
  note("…and the success was audited", audit("device_verification_succeeded", since) === 1);
}

// ================================================================ 2. HMAC hashing
{
  const { code } = await issue();
  const [codeId, , , , stored] = rows();
  const sha = createHash("sha256").update(code).digest("hex");
  note("the stored hash is NOT a bare SHA-256 of the code", stored !== sha);
  const hmac = createHmac("sha256", pepper).update(`${acct.id}:${codeId}:${code}`).digest("hex");
  note("…it is HMAC-SHA256(pepper, user:codeId:code)", stored === hmac);
  note("…bound to the user: the same digits for another user hash differently",
    createHmac("sha256", pepper).update(`${ACCOUNTS.coach1.id}:${codeId}:${code}`).digest("hex") !== stored);
  note("…bound to the code: the same digits under another code id hash differently",
    createHmac("sha256", pepper).update(`${acct.id}:00000000-0000-0000-0000-000000000000:${code}`).digest("hex") !== stored);
  note("…and a wrong pepper does not reproduce it",
    createHmac("sha256", "x".repeat(40)).update(`${acct.id}:${codeId}:${code}`).digest("hex") !== stored);
  // The workaround this replaces: try all 10^6 codes against the stored hash.
  let recovered = null;
  const t0 = Date.now();
  for (let i = 0; i < 1_000_000; i++) {
    const c = String(i).padStart(6, "0");
    if (createHash("sha256").update(c).digest("hex") === stored) { recovered = c; break; }
  }
  note("the old brute force (SHA-256 of all 10^6 codes) can NO LONGER recover the code from the table", recovered === null, `${Date.now() - t0} ms, no match`);
}

// ================================================================ 3. 40 parallel invalid attempts
for (const round of [1, 2, 3]) {
  const { code } = await issue();
  const since = now();
  const guesses = wrongCodes(code, PARALLEL);
  const res = await Promise.all(guesses.map((g) => post("/api/auth/device/verify-code", { code: g })));
  const codes = await Promise.all(res.map(errCode));
  const by = tally(codes);
  const [, attempts, consumed] = rows();
  const evaluated = audit("device_verification_failed", since);
  note(`round ${round}: ${PARALLEL} parallel WRONG guesses evaluated at most ${MAX_ATTEMPTS}`, evaluated <= MAX_ATTEMPTS && Number(attempts) <= MAX_ATTEMPTS,
    `evaluated & logged=${evaluated}, attempts column=${attempts}, responses=${JSON.stringify(by)}`);
  note(`round ${round}: …and the limit was actually reached, not merely undershot`, evaluated === MAX_ATTEMPTS && Number(attempts) === MAX_ATTEMPTS);
  note(`round ${round}: …every other request was refused without being evaluated`, (by.TOO_MANY_ATTEMPTS ?? 0) + (by.CODE_NOT_FOUND ?? 0) + (by.INVALID_CODE ?? 0) === PARALLEL);
  note(`round ${round}: …the exhausted code is consumed`, consumed === "true");
  const real = await post("/api/auth/device/verify-code", { code });
  note(`round ${round}: …so even the CORRECT code can no longer be used after the lockout`, real.status !== 200, `status ${real.status} ${await errCode(real)}`);
}

// ================================================================ 4. parallel CORRECT submissions
{
  const { r: issueRes, code } = await issue();
  const res = await Promise.all(Array.from({ length: PARALLEL }, () => post("/api/auth/device/verify-code", { code })));
  const ok = res.filter((r) => r.status === 200).length;
  const [, , consumed, succeeded] = rows();
  note(`exactly ONE of ${PARALLEL} simultaneous correct submissions verifies`, ok === 1, `successes=${ok}, statuses=${JSON.stringify(tally(res.map((r) => r.status)))}`);
  note("…and the code is marked succeeded once", consumed === "true" && succeeded === "true");
}

// ================================================================ 5. expiry
{
  const { code } = await issue();
  sql(`update device_verification_codes set expires_at = now() - interval '1 second' where user_id='${acct.id}'`);
  const r = await post("/api/auth/device/verify-code", { code });
  note("an EXPIRED code is refused even when it is correct", r.status === 400 && (await errCode(r)) === "CODE_EXPIRED", `${r.status} ${await errCode(r)}`);
  note("…and is consumed so it cannot be tried again", rows()[2] === "true");
  const again = await post("/api/auth/device/verify-code", { code });
  note("…a second try finds no pending code", (await errCode(again)) === "CODE_NOT_FOUND");
}

// ================================================================ 6. replay
{
  const { code } = await issue();
  const first = await post("/api/auth/device/verify-code", { code });
  const replay = await post("/api/auth/device/verify-code", { code });
  note("the correct code verifies once", first.status === 200);
  note("REPLAYING the same code is refused", replay.status === 400 && (await errCode(replay)) === "CODE_NOT_FOUND", `${replay.status} ${await errCode(replay)}`);
}

// ================================================================ 7. issuance limits
{
  await reset();
  const a = await post("/api/auth/device/request-code"); await sinkLastCode(8000);
  const b = await post("/api/auth/device/request-code");
  note("a second code inside the cooldown is refused (429 RATE_LIMITED)", a.status === 200 && b.status === 429 && (await errCode(b)) === "RATE_LIMITED", `${a.status} then ${b.status}`);

  await reset();
  const burst = await Promise.all(Array.from({ length: PARALLEL }, () => post("/api/auth/device/request-code")));
  const issued = burst.filter((r) => r.status === 200).length;
  note(`${PARALLEL} simultaneous code requests issue exactly ONE code`, issued === 1 && Number(sql(`select count(*) from device_verification_codes where user_id='${acct.id}'`)) === 1,
    `issued=${issued}, rows=${sql(`select count(*) from device_verification_codes where user_id='${acct.id}'`)}`);

  await reset();
  const st = [];
  for (let i = 0; i < 4; i++) {
    st.push((await post("/api/auth/device/request-code")).status);
    sql(`update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='${acct.id}'`);
  }
  note("the FOURTH code within an hour is refused (hourly cap 3)", JSON.stringify(st) === "[200,200,200,429]", JSON.stringify(st));

  // supersession: only the newest code works
  await reset();
  await post("/api/auth/device/request-code"); const oldCode = await sinkLastCode(8000);
  sql(`update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='${acct.id}'`);
  await sinkReset();
  await post("/api/auth/device/request-code"); const newCode = await sinkLastCode(8000);
  const useOld = await post("/api/auth/device/verify-code", { code: oldCode });
  note("an earlier code is superseded by a newer one", oldCode !== newCode && useOld.status === 400 && (await errCode(useOld)) === "INVALID_CODE");
  note("…and only one code is live", Number(sql(`select count(*) from device_verification_codes where user_id='${acct.id}' and consumed_at is null`)) === 1);
}

// ================================================================ 8. cumulative lockout across codes
{
  await reset();
  for (let i = 0; i < 3; i++) {
    await post("/api/auth/device/request-code"); const c = await sinkLastCode(8000);
    for (const g of wrongCodes(c, MAX_ATTEMPTS)) await post("/api/auth/device/verify-code", { code: g });
    sql(`update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='${acct.id}'`);
    await sinkReset();
  }
  const since = now();
  const r = await post("/api/auth/device/request-code");
  note("after 15 failed guesses across codes no new code is issued (429 TOO_MANY_ATTEMPTS)", r.status === 429 && (await errCode(r)) === "TOO_MANY_ATTEMPTS", `${r.status} ${await errCode(r)}`);
  note("…and the lockout was audited for the administrator", audit("device_verification_locked", since) >= 1);
}

// ================================================================ 9. auth + input
{
  const noAuth = await fetch(`${WEB}/api/auth/device/verify-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "123456" }) });
  note("verify-code requires a session (401 without one)", noAuth.status === 401);
  const noAuth2 = await fetch(`${WEB}/api/auth/device/request-code`, { method: "POST" });
  note("request-code requires a session (401 without one)", noAuth2.status === 401);
  await reset();
  const bad = await post("/api/auth/device/verify-code", { code: "12345" });
  note("a malformed code is rejected before touching the database", bad.status === 400 && (await errCode(bad)) === "INVALID_INPUT");
}

// ================================================================ 10. fail closed without a pepper
// The running server's environment cannot be toggled mid-test, so exercise the
// real module (apps/web/src/lib/device-verification-crypto.ts) in a child
// process under each configuration, using Node's built-in TypeScript stripping.
{
  const { execFileSync } = await import("node:child_process");
  const mod = new URL("../../apps/web/src/lib/device-verification-crypto.ts", import.meta.url).pathname;
  const run = (env, js) => {
    try {
      return execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "-e",
        `import("${mod}").then(async (m) => { ${js} }).catch((e) => console.log("THREW:" + e.name))`],
        { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" }).trim();
    } catch (e) { return `ERR:${String(e.stderr ?? e.message).split("\n")[0]}`; }
  };
  const probe = 'console.log(m.hasDeviceCodePepper()); try { m.hashDeviceCode("u","c","123456"); console.log("HASHED"); } catch (e) { console.log("THREW:" + e.name); }';
  const none = run({}, probe).split("\n");
  note("with NO pepper the module reports it is unusable", none[0] === "false", none.join(" / "));
  note("…and refuses to hash rather than fall back to an unkeyed hash", none[1] === "THREW:DeviceVerificationMisconfiguredError", none.join(" / "));
  const short = run({ DEVICE_VERIFICATION_PEPPER: "too-short" }, probe).split("\n");
  note("a placeholder-length pepper (<32 chars) is refused as well", short[0] === "false" && short[1] === "THREW:DeviceVerificationMisconfiguredError", short.join(" / "));
  const good = run({ DEVICE_VERIFICATION_PEPPER: "p".repeat(40) }, probe).split("\n");
  note("a proper pepper is accepted", good[0] === "true" && good[1] === "HASHED", good.join(" / "));
  const a = run({ DEVICE_VERIFICATION_PEPPER: "p".repeat(40) }, 'console.log(m.hashDeviceCode("u","c","123456"))');
  const b = run({ DEVICE_VERIFICATION_PEPPER: "q".repeat(40) }, 'console.log(m.hashDeviceCode("u","c","123456"))');
  note("the hash depends on the pepper", /^[0-9a-f]{64}$/.test(a) && a !== b);
}

await reset();
process.exit(summarize("DEVICE VERIFICATION (HTTP)"));
