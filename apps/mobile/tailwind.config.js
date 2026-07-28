/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    // packages/ui/native's className usage must be scanned too, or its
    // Tailwind classes never make it into the generated stylesheet.
    "../../packages/ui/native/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Mirrors packages/ui/tokens — see that file for the single source of
      // truth these values are copied from (Tailwind config must be static/
      // requireable, so it can't import the TS token module directly).
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
