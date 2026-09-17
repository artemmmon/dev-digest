// Flat config, ESLint 9. Not type-aware: `npm run typecheck` already runs tsc here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "test-results/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // tsc already resolves every identifier, including Node globals.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // The runner is a CLI: its output IS the test report.
      "no-console": "off",
    },
  },
);
