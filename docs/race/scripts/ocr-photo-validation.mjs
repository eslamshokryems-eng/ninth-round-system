#!/usr/bin/env node
/* global window, document, createImageBitmap, atob, Blob, Tesseract */
// REAL-WORLD OCR VALIDATION for THE NINTH's Rowing (Station 09) reader.
//
//   node docs/race/scripts/ocr-photo-validation.mjs <photos-dir> <truth.csv> [--out report.json] [--min-accuracy 0.9]
//   node docs/race/scripts/ocr-photo-validation.mjs --synthetic          (self-check of the harness ONLY — never counts as real-world validation)
//
// <photos-dir>  photos of REAL rowing-machine displays, taken the way a judge takes them (phone, gym lighting, glare, angles)
// <truth.csv>   one line per photo:  file,distance_m   (what a human reads on the display; use "none" for an unreadable photo)
//
// It runs the SAME pipeline the judge's phone runs: Otsu binarisation -> tesseract.js (LSTM, PSM AUTO, digit whitelist, served from public/race-ocr) ->
// parseRowingDistance -> classifyOcr (SUCCEEDED >= 0.85 / LOW_CONFIDENCE 0.60-0.85 / FAILED). The report answers the only questions that matter:
//   * accuracy of the proposed number, and above all
//   * the DANGEROUS cases: a WRONG number classified SUCCEEDED (the judge sees no warning). That count must be 0 for the evidence workflow to be trusted
//     (the judge still confirms every reading — but a confident wrong number is the case a tired judge taps through).
// Exit code 0 only when: >= <min-accuracy> of the readable photos are read exactly, and 0 confident-wrong readings.
//
// With no photos the honest status is:  REAL-WORLD OCR VALIDATION = PENDING  (exit code 2). Synthetic images are labelled SYNTHETIC and never replace it.

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP = join(ROOT, "apps", "race");
// dependencies resolve from the web app (playwright, tesseract.js) and the workspace root (esbuild)
const require = createRequire(join(APP, "package.json"));
const rootRequire = createRequire(join(ROOT, "package.json"));
const globalRequire = createRequire(join(process.env.NODE_PATH?.split(":")[0] || "/usr/lib/node_modules", "noop.js"));   // `playwright` is usually installed globally (NODE_PATH=$(npm root -g))
const load = (name) => { for (const r of [require, rootRequire, globalRequire]) { try { return r(name); } catch { /* next */ } } throw new Error(`cannot load ${name}`); };
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const synthetic = args.includes("--synthetic");
const minAcc = Number(flag("--min-accuracy", "0.9"));
const outFile = flag("--out");
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--out", "--min-accuracy"].includes(args[i - 1])));

if (!synthetic && positional.length < 2) {
  console.log("REAL-WORLD OCR VALIDATION = PENDING");
  console.log("No photos supplied. Usage: ocr-photo-validation.mjs <photos-dir> <truth.csv>   (see the header of this file)");
  process.exit(2);
}

const { build } = load("esbuild");
const { chromium } = load("playwright");
// the domain code the app uses (parse + classify), bundled from source so this script cannot drift from the app ---------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "ocrval-"));
const domainOut = join(tmp, "rowing.mjs");
await build({ entryPoints: [join(ROOT, "packages", "race", "domain", "rowing.ts")], bundle: true, format: "esm", platform: "node", outfile: domainOut, logLevel: "silent" });
const { parseRowingDistance, classifyOcr, DEFAULT_OCR_LIMITS } = await import(pathToFileURL(domainOut).href);

// a static server for the engine files, exactly as the app serves them (/race-ocr/...) --------------------------------------------------------------
const tessDir = dirname(require.resolve("tesseract.js/package.json"));
const MIME = { ".js": "text/javascript", ".wasm": "application/wasm", ".gz": "application/gzip", ".html": "text/html" };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = url === "/" ? null : url === "/tesseract.min.js" ? join(tessDir, "dist", "tesseract.min.js") : url.startsWith("/race-ocr/") ? join(APP, "public", url) : null;
  if (url === "/") { res.setHeader("content-type", "text/html"); res.end("<!doctype html><title>ocr</title>"); return; }
  if (!file || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  if (file.endsWith(".gz") && !file.includes("traineddata")) res.setHeader("content-encoding", "gzip");
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// cases ---------------------------------------------------------------------------------------------------------------------------------------------
let cases = [];
if (synthetic) {
  const dists = [0, 7, 59, 120, 305, 480, 655, 700, 842, 905, 1010, 1180, 1260, 1499];
  cases = dists.map((d) => ({ name: `synthetic-${d}`, truth: d, synthetic: true }));
} else {
  const [dir, csv] = positional;
  const truth = new Map(readFileSync(csv, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^file\s*,/i.test(l)).map((l) => { const [f, d] = l.split(","); return [f.trim(), d.trim().toLowerCase() === "none" ? null : Number(d)]; }));
  for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png|webp|heic)$/i.test(x)).sort()) {
    if (!truth.has(f)) { console.warn(`  (no truth line for ${f}; skipped)`); continue; }
    cases.push({ name: f, truth: truth.get(f), bytes: readFileSync(join(dir, f)).toString("base64"), mime: extname(f).toLowerCase() === ".png" ? "image/png" : "image/jpeg" });
  }
  if (cases.length === 0) { console.log("REAL-WORLD OCR VALIDATION = PENDING"); console.log("The folder had no photo with a truth line."); server.close(); process.exit(2); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(`${base}/`);
await page.addScriptTag({ url: `${base}/tesseract.min.js` });

// the same preprocessing + engine settings as apps/race/src/features/race/ocr/tesseract-engine.ts --------------------------------------------------
await page.evaluate((fresh) => {
  window.__fresh = fresh;
  window.__psm = null;
  window.__ocr = async (b64, mime, syntheticDistance) => {
    let bitmap;
    if (syntheticDistance !== null) {
      const c = document.createElement("canvas"); c.width = 900; c.height = 420;
      const x = c.getContext("2d"); x.fillStyle = "#101418"; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "#e8ffe8"; x.font = "bold 150px monospace"; x.textAlign = "center"; x.fillText(String(syntheticDistance), 450, 220);
      x.font = "40px monospace"; x.fillText("METERS", 450, 330);
      bitmap = await createImageBitmap(c);
    } else {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      bitmap = await createImageBitmap(new Blob([u8], { type: mime }));
    }
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height); const d = img.data; const hist = new Array(256).fill(0); let sum = 0, lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) { const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); d[i] = g; hist[g]++; sum += g; if (g < lo) lo = g; if (g > hi) hi = g; }
    const total = d.length / 4; let sumAll = 0; for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let sumB = 0, wB = 0, best = -1, threshold = 128;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break; sumB += t * hist[t]; const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2; if (between > best) { best = between; threshold = t; } }
    const invert = sum / total < (lo + hi) / 2;
    for (let i = 0; i < d.length; i += 4) { let g = d[i] > threshold ? 255 : 0; if (invert) g = 255 - g; d[i] = d[i + 1] = d[i + 2] = g; }
    ctx.putImageData(img, 0, 0);
    if (!window.__worker) {
      window.__worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, { workerPath: "/race-ocr/worker.min.js", corePath: "/race-ocr/core", langPath: "/race-ocr/lang", workerBlobURL: false, gzip: true });
      await window.__worker.setParameters({ tessedit_char_whitelist: "0123456789m.,:/ ", tessedit_pageseg_mode: window.__psm || Tesseract.PSM.AUTO, user_defined_dpi: "300" });
    }
    const { data } = await window.__worker.recognize(canvas, {}, { blocks: true });
    if (window.__fresh) { await window.__worker.terminate(); window.__worker = null; }
    const words = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, confidence: Number.isFinite(w.confidence) ? w.confidence / 100 : null });
    return { text: data.text, words, confidence: Number.isFinite(data.confidence) ? data.confidence / 100 : null };
  };
}, process.env.OCR_FRESH_WORKER === "1");
if (process.env.OCR_PSM) await page.evaluate((v) => { window.__psm = v; }, process.env.OCR_PSM);   // experiments only: the app ships PSM AUTO

const rows = [];
for (const c of cases) {
  const r = await page.evaluate(([b, m, s]) => window.__ocr(b, m, s), [c.bytes ?? "", c.mime ?? "", c.synthetic ? c.truth : null]);
  const parsed = parseRowingDistance(r.text, DEFAULT_OCR_LIMITS.maxDistanceM);
  const digitWords = r.words.filter((w) => /[0-9]/.test(w.text) && w.confidence !== null);
  const confidence = parsed.distanceM === null ? r.confidence : digitWords.length > 0 ? Math.min(...digitWords.map((w) => w.confidence)) : r.confidence;
  const status = classifyOcr(parsed.distanceM, confidence, DEFAULT_OCR_LIMITS);
  rows.push({ photo: c.name, truth: c.truth, read: parsed.distanceM, confidence, status, exact: parsed.distanceM === c.truth, rawText: r.text.trim() });
}
await browser.close(); server.close();

const readable = rows.filter((r) => r.truth !== null);
const exact = readable.filter((r) => r.exact).length;
const confidentWrong = rows.filter((r) => r.status === "SUCCEEDED" && r.read !== null && r.read !== r.truth);
const unreadableButRead = rows.filter((r) => r.truth === null && r.status === "SUCCEEDED");
const failedOrLow = rows.filter((r) => r.status !== "SUCCEEDED").length;
const accuracy = readable.length ? exact / readable.length : 0;
const label = synthetic ? "SYNTHETIC (harness self-check — NOT real-world validation)" : "REAL PHOTOS";
const verdict = synthetic ? "REAL-WORLD OCR VALIDATION = PENDING (synthetic only)" : confidentWrong.length === 0 && unreadableButRead.length === 0 && accuracy >= minAcc ? "REAL-WORLD OCR VALIDATION = PASSED" : "REAL-WORLD OCR VALIDATION = FAILED";

for (const r of rows) console.log(`${r.exact ? "ok " : "MISS"}  ${String(r.photo).padEnd(28)} truth=${String(r.truth).padEnd(5)} read=${String(r.read).padEnd(5)} conf=${r.confidence === null ? "null" : r.confidence.toFixed(2)} ${r.status}`);
console.log(`\n${label}\n  photos: ${rows.length}   exact: ${exact}/${readable.length} (${(accuracy * 100).toFixed(1)}%)   needs-judge-attention (LOW_CONFIDENCE/FAILED): ${failedOrLow}`);
console.log(`  CONFIDENT-WRONG (wrong number classified SUCCEEDED): ${confidentWrong.length}   unreadable photo read with confidence: ${unreadableButRead.length}`);
console.log(verdict);
if (outFile) writeFileSync(outFile, JSON.stringify({ label, verdict, photos: rows.length, exact, readable: readable.length, accuracy, confidentWrong: confidentWrong.length, rows }, null, 2));
process.exit(synthetic ? 0 : verdict.endsWith("PASSED") ? 0 : 1);
