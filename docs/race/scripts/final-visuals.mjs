#!/usr/bin/env node
// Renders the FINAL simulation's exported results (system.json from supabase-race/tests/harness/final_validation.sh with FINAL_ARTIFACTS=<dir>)
// into two screenshots: the race schedule actually executed (every 3:00 + 0:30 window, pauses, SKIP, DNF) and the official leaderboards.
// Usage: NODE_PATH=$(npm root -g) node docs/race/scripts/final-visuals.mjs <system.json> <out-dir>
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/usr/lib/node_modules/x.js");
const { chromium } = require("playwright");
const [src, out] = process.argv.slice(2);
const s = JSON.parse(readFileSync(src, "utf8"));
mkdirSync(out, { recursive: true });
const cat = new Map(s.athletes.map((a) => [a.n, a]));
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const heatColor = { 1: "#3b82f6", 2: "#10b981", 3: "#f59e0b", 4: "#ec4899", 5: "#9ca3af", 6: "#8b5cf6" };
const total = Math.max(...s.windows.map((w) => w.locked_ms ?? w.end)) + 60000;
const X = (ms) => (ms / total) * 1500;
const rows = [...Array(9)].map((_, i) => i + 1);
let svg = `<svg width="1620" height="${rows.length * 44 + 120}" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial" font-size="12">`;
svg += `<rect width="100%" height="100%" fill="#0b0f14"/>`;
let cum = 0;
for (const p of s.pauses) { const x = X(p.race_ms); svg += `<rect x="${60 + x}" y="30" width="3" height="${rows.length * 44 + 20}" fill="#ef4444" opacity="0.9"/>`; svg += `<text x="${60 + x + 5}" y="26" fill="#ef4444">pause ${Math.round(p.wall_ms / 1000)}s</text>`; }
for (const st of rows) {
  const y = 40 + (st - 1) * 44;
  svg += `<text x="8" y="${y + 22}" fill="#cbd5e1">S${String(st).padStart(2, "0")}</text>`;
  for (const w of s.windows.filter((x) => x.station === st)) {
    const heat = cat.get(w.n).heat; const x = 60 + X(w.start); const wd = Math.max(1, X(w.end - w.start));
    const dead = ["NOT_REACHED", "VOID_DNS"].includes(w.status);
    svg += `<rect x="${x}" y="${y}" width="${wd}" height="30" rx="2" fill="${dead ? "#374151" : heatColor[heat]}" opacity="${dead ? 0.6 : 0.9}"><title>N${w.n} S${st} ${mmss(w.start)}–${mmss(w.end)} ${w.status}</title></rect>`;
    svg += `<rect x="${60 + X(w.end)}" y="${y + 12}" width="${Math.max(1, X(30000))}" height="6" fill="#64748b"/>`;
  }
}
for (const a of s.script_log) {
  const x = 60 + X(a.at);
  svg += `<text x="${x}" y="${rows.length * 44 + 70}" fill="#fbbf24" font-size="13">▲ ${a.action.toUpperCase()} N${String(a.n).padStart(3, "0")} @ ${mmss(a.at)}</text>`;
}
for (let m = 0; m <= total; m += 600000) svg += `<text x="${60 + X(m)}" y="${rows.length * 44 + 50}" fill="#94a3b8">${mmss(m)}</text>`;
svg += `</svg>`;
const legend = Object.entries(heatColor).map(([h, c]) => `<span style="color:${c}">■ Heat ${h}${h === "5" ? " (cancelled)" : ""}</span>`).join(" &nbsp; ");
const ganttHtml = `<body style="margin:0;background:#0b0f14;color:#e2e8f0;font-family:Inter,Arial"><div style="padding:14px 20px"><b style="font-size:20px">THE NINTH — final simulation: the schedule that actually ran</b><br><span style="color:#94a3b8">${s.athletes.length} registered · ${s.slots.filter((x) => x.status === "STARTED").length} started · ${s.pauses.length} pause/resume cycles (red) · every bar is a 3:00 work window followed by its 0:30 transition (grey) · ${legend}</span></div>${svg}</body>`;
const boards = Object.entries(s.rankings).map(([c, r]) => `<div style="flex:1;min-width:480px"><h3 style="margin:0 0 6px">${c} — ${r.length} ranked</h3><table style="border-collapse:collapse;width:100%;font-size:12px"><tr style="color:#94a3b8"><td>Rank</td><td>Athlete</td><td>Pts</td>${rows.map((i) => `<td>S${i}</td>`).join("")}</tr>${r.map((x) => `<tr style="border-top:1px solid #1f2937"><td><b>${x.rank}</b></td><td>N${String(x.n).padStart(3, "0")}</td><td><b>${x.total}</b></td>${rows.map((i) => `<td>${x.placements[i] ?? "–"}</td>`).join("")}</tr>`).join("")}</table></div>`).join("");
const boardHtml = `<body style="margin:0;background:#0b0f14;color:#e2e8f0;font-family:Inter,Arial;padding:18px"><b style="font-size:20px">THE NINTH — OFFICIAL RESULTS (final simulation)</b><div style="color:#94a3b8;margin:4px 0 12px">Total placement points: lower is better · 1,2,2,4 competition ranking · DNS/DNF excluded · per-station placements shown</div><div style="display:flex;gap:28px;flex-wrap:wrap">${boards}</div></body>`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let p = await b.newPage({ viewport: { width: 1640, height: 560 } });
await p.setContent(ganttHtml); await p.screenshot({ path: `${out}/01-final-schedule-executed.png` });
p = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p.setContent(boardHtml); await p.screenshot({ path: `${out}/02-final-official-leaderboards.png`, fullPage: true });
await b.close();
console.log("wrote", out);
