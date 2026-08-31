import type { Config } from "tailwindcss";

// Values copied from packages/ui/tokens/index.ts (the black/white/gold
// system — same convention apps/web/tailwind.config.ts already follows,
// since Tailwind config must be static/requireable, not a TS import).
// This is a read of shared values only, at author time — apps/site has
// no runtime dependency on packages/ui or apps/web.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
