/**
 * LOCAL ONLY. Smart Reminders P3 end-to-end through the real app: PWA manifest + service worker, device registration from the
 * Sales Workspace (Android and iPhone Home Screen flows, push service stubbed in the page), the real dispatch route with real
 * VAPID / aes128gcm encryption to a local fake push service that DECRYPTS what it receives, duplicates, concurrency,
 * cancel / reschedule before sending, transient 500 retry and 410 device removal. Run via browser_run.sh (it sets the env).
 */
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import { chromium, BASE, login, sql, note, summarize } from "./common.mjs";

const SECRET = process.env.REMINDER_DISPATCH_SECRET;
const MOCK_PORT = 54330;
const S1 = "aaaa0021-0000-4000-8000-000000000021";
const b64u = (b) => Buffer.from(b).toString("base64url");

// ---- a device key pair, like a browser's push subscription ----
const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
const DEVICE = { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)) };
function hmac(key, data) { return crypto.createHmac("sha256", key).update(data).digest(); }
/** RFC 8291 / RFC 8188 aes128gcm decryption with the device's private key. */
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPublic);
  const prkKey = hmac(Buffer.from(DEVICE.auth, "base64url"), shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1; while (end > 0 && plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString("utf8")); // strip the 0x02 padding delimiter
}

// ---- fake push service ----
const received = []; let mode = 201;
const tls = { key: fs.readFileSync(`${process.env.PUSH_MOCK_TLS_DIR}/key.pem`), cert: fs.readFileSync(`${process.env.PUSH_MOCK_TLS_DIR}/cert.pem`) };
const server = https.createServer(tls, (req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
    const body = Buffer.concat(chunks);
    let payload = null; try { payload = decrypt(body); } catch { payload = { undecryptable: true }; }
    received.push({ path: req.url, auth: req.headers.authorization ?? "", encoding: req.headers["content-encoding"], ttl: req.headers.ttl, payload });
    res.writeHead(mode); res.end();
  });
});
await new Promise((r) => server.listen(MOCK_PORT, "127.0.0.1", r));
const dispatch = (auth) => fetch(`${BASE}/api/reminders/dispatch`, { method: "POST", headers: auth ? { Authorization: auth } : {} });
const dueFollowup = (note, minutes = 10) => sql(`insert into lead_followups (lead_id, branch_id, due_at, status, created_by, note)
  select id, branch_id, now() + interval '${minutes} minutes', 'pending', '${S1}', '${note}' from leads where assigned_to='${S1}' and status in ('new','contacted','follow_up') order by created_at limit 1 returning lead_id`).trim().split("\n")[0];
const reminderOf = (note) => sql(`select r.status||'/'||r.attempts||'/'||coalesce(r.last_error,'-') from sales_reminders r join lead_followups f on f.id=r.followup_id where f.note='${note}'`).trim();

// ---- page stubs: a push-capable browser whose subscription is our device key pair ----
const stub = (endpoint, extra = "") => `
  ${extra}
  (() => {
    let current = null;
    const fake = { endpoint: ${JSON.stringify(endpoint)}, toJSON() { return { endpoint: this.endpoint, keys: ${JSON.stringify(DEVICE)} }; }, unsubscribe: async () => { current = null; return true; } };
    if (!window.PushManager) window.PushManager = function () {};
    PushManager.prototype.subscribe = async function () { current = fake; return fake; };
    PushManager.prototype.getSubscription = async function () { return current; };
    Notification.requestPermission = async () => "granted";
    Object.defineProperty(Notification, "permission", { get: () => "granted" }); // headless Chromium always reports "denied"
  })();`;

sql("truncate device_verification_codes");
sql("delete from push_subscriptions");
const browser = await chromium.launch();

// ===== PWA basics =====
const man = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
const iconsOk = (await Promise.all(man.icons.map((i) => fetch(`${BASE}${i.src}`).then((r) => r.status)))).every((s) => s === 200);
note("W01 manifest: installable (standalone, start /sales, icons 192/512/maskable reachable)", man.display === "standalone" && man.start_url === "/sales" && man.icons.length === 3 && iconsOk);
const swRes = await fetch(`${BASE}/sw.js`);
note("W02 service worker served as JavaScript", swRes.status === 200 && /javascript/.test(swRes.headers.get("content-type") ?? ""));

// ===== Android flow: enable reminders from the Workspace =====
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const actx = await browser.newContext({ viewport: { width: 412, height: 915 }, userAgent: ANDROID_UA });
await actx.grantPermissions(["notifications"], { origin: BASE });
await actx.addInitScript(stub("https://fcm.googleapis.com/fcm/send/e2e-android"));
const ap = await actx.newPage(); await login(ap, { email: "sales1@9thround.local" });
await ap.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
const enableBtn = ap.getByTestId("push-enable");
note("W03 Android: the Workspace offers 'Turn on reminders'", await enableBtn.isVisible().catch(() => false));
await enableBtn.click(); await ap.getByText("Follow-up reminders are on for this device.").waitFor({ timeout: 10000 }).catch(() => {});
note("W04 Android: device registered for the signed-in employee (platform android)",
  sql(`select user_id||'/'||platform||'/'||(revoked_at is null) from push_subscriptions where endpoint like '%e2e-android'`).trim() === `${S1}/android/true`);

// ===== iPhone flows =====
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ictx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });
await ictx.addInitScript(() => { delete window.PushManager; });
const ip = await ictx.newPage(); await login(ip, { email: "sales1@9thround.local" });
await ip.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
note("W05 iPhone in Safari (not installed): shows 'Add to Home Screen' guidance instead of a broken button",
  await ip.getByTestId("push-ios-install").isVisible().catch(() => false) && !(await ip.getByTestId("push-enable").isVisible().catch(() => false)));
const hctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });
await hctx.grantPermissions(["notifications"], { origin: BASE });
await hctx.addInitScript(stub("https://web.push.apple.com/e2e-iphone", "Object.defineProperty(navigator, 'standalone', { get: () => true });"));
const hp = await hctx.newPage(); await login(hp, { email: "sales1@9thround.local" });
await hp.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
await hp.getByTestId("push-enable").click().catch(() => {}); await hp.waitForTimeout(2500);
note("W06 iPhone Home Screen app (iOS 16.4+): device registered (platform ios)",
  sql(`select platform||'/'||(revoked_at is null) from push_subscriptions where endpoint like '%e2e-iphone'`).trim() === "ios/true");
await hp.getByTestId("push-disable").click().catch(() => {}); await hp.waitForTimeout(2000);
note("W07 'Turn off' revokes this device only", sql(`select string_agg(right(endpoint,7)||':'||(revoked_at is not null), ',' order by endpoint) from push_subscriptions`).trim() === "android:false,-iphone:true");

// ===== service worker shows a pushed notification (full Chromium, new headless: DevTools push delivery) =====
const full = await chromium.launch({ channel: "chromium" });
const nctx = await full.newContext({ userAgent: ANDROID_UA }); await nctx.grantPermissions(["notifications"], { origin: BASE });
const np = await nctx.newPage(); await login(np, { email: "sales1@9thround.local" });
await np.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
await np.evaluate(async () => { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready; });
const cdp = await nctx.newCDPSession(np);
const regId = await new Promise(async (resolve) => {
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => { const r = e.registrations.find((x) => x.scopeURL.startsWith(BASE)); if (r) resolve(r.registrationId); });
  await cdp.send("ServiceWorker.enable"); setTimeout(() => resolve(null), 5000);
});
if (regId) {
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId: regId, data: JSON.stringify({ title: "9th Round · Follow-up reminder", body: "Call follow-up in 15 min. Open the CRM for details.", url: "/sales/leads/x", tag: "reminder-test" }) });
  await np.waitForTimeout(1500);
}
const shown = await np.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title}|${n.body}|${n.tag}`)).catch(() => []);
note("W08 service worker displays the reminder notification (title, body, tag)", shown.some((s) => s === "9th Round · Follow-up reminder|Call follow-up in 15 min. Open the CRM for details.|reminder-test"), JSON.stringify(shown));

// ===== dispatch route =====
sql(`update push_subscriptions set endpoint = 'https://127.0.0.1:${MOCK_PORT}/dev/android' where endpoint like '%e2e-android'`);
note("D01 dispatch without the secret is refused", (await dispatch()).status === 401);
note("D02 dispatch with a wrong secret is refused", (await dispatch("Bearer wrong-secret-wrong-secret-wrong-secret")).status === 401);
const leadId = dueFollowup("e2e one");
let r = await dispatch(`Bearer ${SECRET}`); let summary = await r.json();
const first = received.at(-1);
note("D03 one due reminder -> exactly one push, encrypted (aes128gcm), VAPID-signed", r.status === 200 && received.length === 1 && first.encoding === "aes128gcm" && /^vapid t=/.test(first.auth), JSON.stringify(summary));
const leadText = sql(`select full_name||'|'||phone from leads where id='${leadId}'`).trim().split("|");
const plainText = JSON.stringify(first.payload);
note("D04 decrypted payload: title + kind + minutes + link to the lead page; NO customer name or phone",
  first.payload.title === "9th Round · Follow-up reminder" && /follow-up in 1?\d min/.test(first.payload.body) && first.payload.url === `/sales/leads/${leadId}` && !plainText.includes(leadText[0]) && !plainText.includes(leadText[1]), plainText);
note("D05 reminder recorded as sent, device marked healthy", reminderOf("e2e one") === "sent/1/-" && sql(`select (last_success_at is not null) from push_subscriptions where endpoint like '%/dev/android'`).trim() === "t");
await dispatch(`Bearer ${SECRET}`);
note("D06 dispatching again sends nothing new (no duplicate)", received.length === 1);
for (let i = 1; i <= 5; i++) dueFollowup(`e2e batch ${i}`);
const rs = await Promise.all([1, 2, 3].map(() => dispatch(`Bearer ${SECRET}`).then((x) => x.json())));
note("D07 three dispatchers in parallel, 5 due reminders -> exactly 5 pushes, each once", received.length === 6 &&
  new Set(received.slice(1).map((x) => x.payload.tag)).size === 5 && sql(`select count(*) from sales_reminders r join lead_followups f on f.id=r.followup_id where f.note like 'e2e batch%' and r.status='sent'`).trim() === "5", JSON.stringify(rs));
dueFollowup("e2e cancelled"); sql(`update lead_followups set status='cancelled' where note='e2e cancelled'`);
dueFollowup("e2e moved"); sql(`update lead_followups set due_at = now() + interval '3 hours' where note='e2e moved'`);
await dispatch(`Bearer ${SECRET}`);
note("D08 cancelled and rescheduled follow-ups are not sent", received.length === 6 && reminderOf("e2e cancelled").startsWith("cancelled") && reminderOf("e2e moved").startsWith("scheduled/0"));
mode = 500; dueFollowup("e2e transient"); await dispatch(`Bearer ${SECRET}`);
note("D09 push service 500 -> reminder kept for retry (attempt 1, backoff), not marked sent", received.length === 7 && reminderOf("e2e transient") === "scheduled/1/push_transient_500");
mode = 410; sql(`update sales_reminders set claimed_until = now() - interval '1 second' where followup_id = (select id from lead_followups where note='e2e transient')`);
await dispatch(`Bearer ${SECRET}`);
note("D10 push service 410 (device gone) -> device revoked, reminder failed, nothing retried",
  received.length === 8 && sql(`select (revoked_at is not null) from push_subscriptions where endpoint like '%/dev/android'`).trim() === "t" && reminderOf("e2e transient") === "failed/2/all_devices_gone");
await full.close(); await browser.close(); server.close();
process.exit(summarize("Smart Reminders push (P3)"));
