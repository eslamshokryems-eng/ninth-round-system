#!/usr/bin/env node
/**
 * LOCAL DEV ONLY — a stand-in for Resend's POST /emails, so the REAL
 * device-verification send path runs on a developer machine with no email
 * provider. The app is pointed here by RESEND_API_URL (ignored in production
 * builds). Messages are only held in memory and in a local file.
 *
 *   POST /emails            what the app calls; stores the message
 *   GET  /last              the most recent message as JSON, with the 6-digit
 *                           code extracted from it as `code`
 *   GET  /messages          every message held
 *   POST /reset             forget everything
 *
 * The browser checks read the code from here exactly as an administrator
 * would read it from their inbox — which replaces the earlier workaround of
 * reading the code's hash out of the database and brute-forcing it. That
 * workaround stopped being possible by design when the hash became a keyed
 * HMAC.
 */
import http from "node:http";
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.MAIL_SINK_PORT ?? 54325);
const FILE = process.env.MAIL_SINK_FILE ?? "/tmp/ninth-mail-sink.json";
const messages = [];

const send = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
};
const body = (req) => new Promise((resolve) => {
  let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); } });
});

http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (req.method === "POST" && path === "/emails") {
    const m = await body(req);
    const text = String(m.text ?? "");
    const code = (/Code:\s*(\d{6})/.exec(text) ?? [])[1] ?? null;
    messages.push({ at: new Date().toISOString(), to: m.to, subject: m.subject, text, code });
    try { writeFileSync(FILE, JSON.stringify(messages, null, 2)); } catch { /* best effort */ }
    return send(res, 200, { id: `local-${messages.length}` });
  }
  if (req.method === "GET" && path === "/last") return send(res, 200, messages.at(-1) ?? null);
  if (req.method === "GET" && path === "/messages") return send(res, 200, messages);
  if (req.method === "POST" && path === "/reset") { messages.length = 0; return send(res, 200, { ok: true }); }
  if (path === "/health") return send(res, 200, { sink: "ninth-round-local", messages: messages.length });
  send(res, 404, { message: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`[mail-sink] listening on http://127.0.0.1:${PORT}`));
