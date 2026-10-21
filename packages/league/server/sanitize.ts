import { PUBLIC_CHALLENGE_KEYS, PUBLIC_SEASON_KEYS, PUBLIC_STANDING_KEYS } from "../domain/public";

/**
 * Defence in depth: the database functions already return an allow-list, but the public API rebuilds every object from the allow-listed keys and primitive types
 * only. Any field the database (or a future change to it) adds is dropped here, so a private value can never reach a cache by accident.
 * Each function returns null when the shape is not what was promised — the caller then treats the upstream as broken instead of passing anything through.
 */
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const prim = (v: unknown): string | number | boolean | null | undefined => (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined);

function pick(src: unknown, keys: readonly string[]): Json | null {
  if (!isObj(src)) return null;
  const out: Json = {};
  for (const k of keys) {
    const v = src[k];
    if (k === "weeklyPoints") {
      if (!isObj(v)) return null;
      const w: Record<string, number> = {};
      for (const [wk, pts] of Object.entries(v)) if (/^[1-8]$/.test(wk) && typeof pts === "number" && Number.isFinite(pts)) w[wk] = pts;
      out[k] = w;
    } else {
      const p = prim(v);
      if (p === undefined) return null;
      out[k] = p;
    }
  }
  return out;
}
function list(src: unknown, each: (x: unknown) => Json | null, max: number): Json[] | null {
  if (!Array.isArray(src) || src.length > max) return null;
  const out: Json[] = [];
  for (const x of src) { const r = each(x); if (r === null) return null; out.push(r); }
  return out;
}

export function sanitizeSeason(src: unknown): Json | null {
  if (!isObj(src)) return null;
  if (src.available === false) return { available: false };
  if (src.available !== true) return null;
  const season = pick(src.season, PUBLIC_SEASON_KEYS);
  const challenges = list(src.challenges, (c) => pick(c, PUBLIC_CHALLENGE_KEYS), 8);
  const standings = list(src.standings, (r) => pick(r, PUBLIC_STANDING_KEYS), 1000);
  if (!season || !challenges || !standings || typeof src.generatedAt !== "string") return null;
  return { available: true, season, challenges, standings, generatedAt: src.generatedAt };
}

const RESULT_KEYS = ["rank", "publicId", "displayName", "value", "points"] as const;
const WEEK_KEYS = ["weekNumber", "challenge", "unit", "value", "rank", "points"] as const;

export function sanitizeResults(src: unknown): Json | null {
  if (!isObj(src)) return null;
  if (src.available === false) return { available: false };
  if (src.available !== true) return null;
  const head = pick(src, ["weekNumber", "name", "unit", "direction"]);
  const results = list(src.results, (r) => pick(r, RESULT_KEYS), 1000);
  if (!head || !results) return null;
  return { available: true, ...head, results };
}

export function sanitizeAthlete(src: unknown): Json | null {
  if (!isObj(src)) return null;
  if (src.available === false) return { available: false };
  if (src.available !== true) return null;
  const standing = src.standing === null || src.standing === undefined ? null : pick(src.standing, PUBLIC_STANDING_KEYS);
  if (src.standing !== null && src.standing !== undefined && standing === null) return null;
  const results = list(src.results, (r) => pick(r, WEEK_KEYS), 8);
  if (!results) return null;
  return { available: true, standing, results };
}
