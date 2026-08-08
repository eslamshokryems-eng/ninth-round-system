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
