// Flat config, ESLint 9. Not type-aware: `npm run typecheck` is this package's build
// and already runs tsc over the same files. What this config adds is the purity
// contract from reviewer-core/CLAUDE.md, which tsc cannot express.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
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
    },
  },
  {
    // Purity: the engine takes a diff and returns findings. Every side effect arrives
    // as an injected interface, so no module here may reach for the machine it runs on.
    // `src/llm/` is the one place allowed to talk to a provider over the network.
    files: ["src/**/*.ts"],
    ignores: ["src/llm/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["fs", "node:fs", "node:fs/*", "child_process", "node:child_process", "node:net", "node:http*"],
              message: "reviewer-core stays pure — take the side effect as an injected interface.",
            },
            {
              group: ["**/server/src/**", "../../server/**"],
              message: "Import contracts through the @devdigest/shared alias, never a relative server path.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Only src/llm/ talks to a provider; elsewhere inject an LLMProvider." },
      ],
    },
  },
);
