import type { Config } from "tailwindcss";

// Mirrors packages/ui/tokens and apps/mobile/tailwind.config.js — see
// packages/ui/tokens/index.ts for the single source of truth these values
// are copied from (Tailwind config must be static/requireable, so it can't
// import the TS token module directly).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../../packages/ui/web/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0B0B0C",
        surface: "#161616",
        ink: "#FFFFFF",
        muted: "#9A9A9A",
        gold: "#C9A227",
        "gold-soft": "#F4D976",
        // Semantic status system (2026-09 UX redesign) — additive only,
        // nothing above this line changed. One named token per meaning so
        // every page reads status the same way instead of ad hoc
        // Tailwind red/green/emerald picks. "brand" is 9th Round's actual
        // marketing-identity red (see the 9th-round skill: black/red/white,
        // "strong reds... premium"); it intentionally shares its hue family
        // with "danger" (critical/expired/unpaid) — see the redesign
        // report for how the two are kept visually distinct in practice
        // (solid fill for brand emphasis vs. soft-background+icon for
        // danger) rather than by using different colors for what a user
        // would read as the same "red" regardless.
        brand: "#DC2626",
        "brand-soft": "#F87171",
        // "success" deliberately equals gold/gold-soft, not green — the
        // brand owner asked for green out of the palette entirely; gold
        // already reads as "good" in this app (it was the sole positive
        // accent before this redesign), so Active/Paid/Completed states
        // stay gold instead of introducing a color the brand doesn't want.
        success: "#C9A227",
        "success-soft": "#F4D976",
        warning: "#F59E0B",
        "warning-soft": "#FBBF24",
        danger: "#DC2626",
        "danger-soft": "#F87171",
        info: "#3B82F6",
        "info-soft": "#60A5FA",
        "accent-purple": "#A855F7",
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

export default config;
