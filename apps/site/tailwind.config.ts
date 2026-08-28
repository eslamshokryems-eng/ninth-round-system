import type { Config } from "tailwindcss";

/**
 * PUBLIC SITE Tailwind config — content globs are scoped to `apps/site`
 * ONLY. It never scans `apps/web` or `packages/*`, and no other app scans
 * `apps/site`. A change here cannot affect the internal Web App's styles.
 *
 * Colour/radii/motion values mirror the internal design system
 * (`packages/ui/tokens/index.ts`) so the two products feel related, but
 * they are copied in, not imported — zero coupling. The marketing palette
 * leads with RED as the energy accent (per the 9th Round brand system);
 * `steel`/`gold` are restrained secondary tones.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Grounds — near-black with a faint warm bias, not pure #000.
        ink: {
          950: "#0B0B0C",
          900: "#111113",
          850: "#161618",
          800: "#1D1D20",
          700: "#2A2A2E",
        },
        paper: "#F7F6F4",
        // Text
        bone: "#F4F3F1",
        ash: "#A2A0A0",
        // Brand accent — 9th Round red (matches the emblem mark).
        blood: {
          DEFAULT: "#E4141B",
          bright: "#FF2E2E",
          deep: "#B00E14",
        },
        // Restrained premium secondary (carried from the internal app).
        gold: "#C9A227",
      },
      fontFamily: {
        display: ["var(--font-display)", "Oswald", "Arial Narrow", "sans-serif"],
        sans: ["var(--font-sans)", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
      maxWidth: {
        prose: "68ch",
        wrap: "1200px",
      },
      transitionDuration: {
        DEFAULT: "250ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 500ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
