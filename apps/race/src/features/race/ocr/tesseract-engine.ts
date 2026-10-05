"use client";

import type { OcrEngine, OcrEngineResult, OcrWord } from "@9thround/race";

/**
 * In-browser OCR (tesseract.js, WebAssembly) — it runs ON THE JUDGE'S DEVICE, so a photo can be read with no connection. The engine's
 * files are served from THE NINTH's own origin (/race-ocr, see scripts/copy-ocr-assets.mjs). The engine only PROPOSES a number; it never
 * decides anything: the judge confirms it, and the database refuses any confirmed distance that differs from the stored proposal.
 */
import type { Worker as TessWorker } from "tesseract.js";

const BASE = "/race-ocr";

async function toCanvas(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // grayscale -> Otsu threshold (black/white) -> dark text on a light page. A rowing monitor is light digits on a dark panel, so it is inverted.
  // (Measured on synthetic displays: binarising and letting the engine find the text lines read 16/16 where plain contrast stretching misread
  // 842 as 342 with 92% confidence — which is exactly why the judge confirms every reading.)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Array<number>(256).fill(0);
  let sum = 0;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
    d[i] = g;
    hist[g] = (hist[g] ?? 0) + 1;
    sum += g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const total = d.length / 4;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * (hist[t] ?? 0);
  let sumB = 0, wB = 0, best = -1, threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  const invert = sum / total < (lo + hi) / 2;
  for (let i = 0; i < d.length; i += 4) {
    let g = d[i]! > threshold ? 255 : 0;
    if (invert) g = 255 - g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export class TesseractOcrEngine implements OcrEngine {
  readonly name = "tesseract.js@7";
  private worker: Promise<TessWorker> | null = null;

  /** Loads the engine in the background so the first photo is read at once (and so its files are in the browser cache). */
  warm(): void {
    void this.load().catch(() => undefined);
  }

  private load(): Promise<TessWorker> {
    this.worker ??= import("tesseract.js").then(async (T) => {
      const w = await T.createWorker("eng", T.OEM.LSTM_ONLY, { workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang`, workerBlobURL: false, gzip: true });
      await w.setParameters({ tessedit_char_whitelist: "0123456789m.,:/ ", tessedit_pageseg_mode: T.PSM.AUTO, user_defined_dpi: "300" });
      return w;
    });
    this.worker.catch(() => { this.worker = null; });          // a failed load can be retried by the next photo
    return this.worker;
  }

  async recognize(image: unknown): Promise<OcrEngineResult> {
    const w = await this.load();
    const canvas = await toCanvas(image as Blob);
    const { data } = await w.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const wd of l.words) words.push({ text: wd.text, confidence: Number.isFinite(wd.confidence) ? wd.confidence / 100 : null });
    return { text: data.text, words, confidence: Number.isFinite(data.confidence) ? data.confidence / 100 : null, engine: this.name };
  }
}

declare global {
  interface Window {
    /** Browser tests only: a scripted OCR engine. Compiled in only when the app is built with NEXT_PUBLIC_RACE_E2E_OCR=1. */
    __raceE2eOcr?: OcrEngine;
  }
}

let engine: TesseractOcrEngine | null = null;
export function getOcrEngine(): OcrEngine {
  if (process.env.NEXT_PUBLIC_RACE_E2E_OCR === "1" && typeof window !== "undefined" && window.__raceE2eOcr) return window.__raceE2eOcr;
  engine ??= new TesseractOcrEngine();
  return engine;
}

export function warmOcrEngine(): void {
  if (process.env.NEXT_PUBLIC_RACE_E2E_OCR === "1" && typeof window !== "undefined" && window.__raceE2eOcr) return;
  (engine ??= new TesseractOcrEngine()).warm();
}
