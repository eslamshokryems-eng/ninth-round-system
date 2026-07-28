import type { Config } from "tailwindcss";

// Theme values will extend the shared preset in packages/config/tailwind-preset
// once that package is implemented (Phase 1 build task) — see packages/config/tailwind-preset.md.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../../packages/ui/web/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
