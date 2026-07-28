import { basePreset } from "@9thround/config/eslint-preset";

export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.expo/**", "**/.turbo/**", "**/coverage/**"],
  },
  ...basePreset,
  {
    files: ["**/*.config.js", "**/*.config.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", process: "readonly", __dirname: "readonly" },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // typescript-eslint's Project Service auto-discovers the right
        // tsconfig.json per file across the monorepo's many packages —
        // required for type-aware rules like no-floating-promises.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
