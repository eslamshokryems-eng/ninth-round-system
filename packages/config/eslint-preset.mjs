// Shared ESLint flat-config preset consumed by every app/package.
// See docs/phase-1/11-coding-standards.md for the rules this encodes and why.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const basePreset = tseslint.config(
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: ["dist/**", ".next/**", ".expo/**", ".turbo/**", "coverage/**"],
  },
);

export default basePreset;
