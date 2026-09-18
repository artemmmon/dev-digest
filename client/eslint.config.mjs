// Flat config, ESLint 9. Deliberately NOT type-aware: `pnpm typecheck` already runs
// tsc over the same files in the same CI lane, so type-aware linting would only pay
// for that twice. Rules here are the ones tsc cannot see.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Vendored, not ours: the UI kit and the copied Zod contracts.
      "src/vendor/**",
      // Generated Claude Design export.
      "docs/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs["recommended-latest"],
  {
    // Node config files at the package root (next.config.mjs, vitest.config.ts).
    files: ["*.mjs", "*.ts"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    rules: {
      // `_` prefix is the house signal for "deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // Components never call fetch directly — every request goes through a hook in
      // src/lib/hooks/ (client/CLAUDE.md, "Conventions").
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use apiFetch or a hook from src/lib/hooks/ instead." },
      ],
    },
  },
);
