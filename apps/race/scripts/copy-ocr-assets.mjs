// Copies the OCR engine's files (worker, WebAssembly core, English model) from node_modules into public/race-ocr so the judge's
// device loads them from THE NINTH's own origin — no CDN, no third party, and the browser can cache them for offline use.
// Generated output (git-ignored); runs before build / dev.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(APP, "public", "race-ocr");
const require = createRequire(join(APP, "package.json"));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

try {
  const tess = pkgDir("tesseract.js");
  const core = pkgDir("tesseract.js-core");
  const data = pkgDir("@tesseract.js-data/eng");
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "core"), { recursive: true });
  mkdirSync(join(OUT, "lang"), { recursive: true });
  cpSync(join(tess, "dist", "worker.min.js"), join(OUT, "worker.min.js"));
  for (const f of readdirSync(core)) if (/^tesseract-core.*lstm.*\.(wasm|js)$/.test(f)) cpSync(join(core, f), join(OUT, "core", f));
  const model = join(data, "4.0.0_best_int", "eng.traineddata.gz");
  cpSync(existsSync(model) ? model : join(data, "4.0.0", "eng.traineddata.gz"), join(OUT, "lang", "eng.traineddata.gz"));
  console.log("[race-web] OCR engine files copied to public/race-ocr");
} catch (e) {
  console.warn(`[race-web] OCR engine files not copied (${e instanceof Error ? e.message : e}) — the judge screen will report that OCR is unavailable and offer RETAKE / a Master Control correction`);
}
