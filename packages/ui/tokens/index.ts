import type { LocaleCode } from "@9thround/shared-kernel";
import { textDirection } from "@9thround/shared-kernel";

/**
 * The black/white/gold system from docs/06-ui-flow-and-wireframes.md §6.1,
 * as real values for the first time — everything downstream (NativeWind
 * config, shadcn/ui theme, the components in ./native and ./web) reads from
 * here so the two apps can never drift into two different "golds."
 */
export const colors = {
  background: "#0B0B0C",
  surface: "#161616",
  surfaceGlass: "rgba(255,255,255,0.06)",
  foreground: "#FFFFFF",
  muted: "#9A9A9A",
  gold: "#C9A227",
  goldSoft: "#F4D976",
} as const;

export const radii = {
  card: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typeScale = {
  display: { fontSize: 32, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  caption: { fontSize: 13, fontWeight: "400" },
} as const;

export const motion = {
  standardMs: 250,
} as const;

/**
 * Every screen must support RTL (Arabic) alongside LTR (English) — see
 * docs/11-internationalization.md. Components read layout direction from
 * this helper rather than hardcoding "left"/"right", so a mirrored layout is
 * a locale change, not a per-component special case.
 */
export function layoutDirection(locale: LocaleCode): "rtl" | "ltr" {
  return textDirection(locale);
}

export const tokens = { colors, radii, spacing, typeScale, motion } as const;
