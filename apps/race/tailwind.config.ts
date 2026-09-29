import type { Config } from "tailwindcss";

// THE NINTH's own Tailwind setup: utilities only (the race theme lives in app/race/race.css).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
