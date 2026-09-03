import { en, type Dict } from "./en";
import { ar } from "./ar";
import type { Lang } from "./config";

const DICTS: Record<Lang, Dict> = { en, ar };

/** The UI copy for a locale. Server-safe, synchronous, zero runtime cost. */
export function dict(lang: Lang): Dict {
  return DICTS[lang];
}

export type { Dict };
export * from "./config";
