import type { Config } from "tailwindcss";

// 9th Round — Kenpo & Fitness brand system. Exact values from the brand
// brief: red/black/bone/grey, not the earlier gold placeholder palette
// (that was draft-only, replaced now that real brand guidelines exist).
// Font families are loaded via next/font/google in app/layout.tsx and
// exposed as CSS variables there — referenced here by variable name, not
// re-declared, so there is exactly one place each font is configured.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        red: "#C1121F",
        black: "#0F0F0F",
        bone: "#F5F3EF",
        grey: "#8A8A8A",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"], // Anton — headlines, CAPS
        condensed: ["var(--font-condensed)", "sans-serif"], // Barlow Condensed — numbers, subheadings
        body: ["var(--font-body)", "sans-serif"], // Inter — English body text
        arabic: ["var(--font-arabic)", "sans-serif"], // Cairo — Arabic text
      },
      borderRadius: {
        card: "12px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

export default config;
