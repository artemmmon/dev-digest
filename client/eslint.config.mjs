// Flat config, ESLint 9. Deliberately NOT type-aware: `pnpm typecheck` already runs
// tsc over the same files in the same CI lane, so type-aware linting would only pay
// for that twice. Rules here are the ones tsc cannot see.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
  // Next.js rules (<Link> over <a>, next/image, sync scripts…) — `next build` warns
  // when this plugin is missing.
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  jsxA11y.flatConfigs.recommended,
  {
    // Known a11y debt: clickable <div>/<span> that should be <button>/<Link>.
    // Warn here so the rules stay errors everywhere else; remove a file from the
    // list when it is fixed (plan: skills audit, phase 4 → a11y).
    files: [
      "src/app/agents/_components/AgentCard/AgentCard.tsx",
      "src/app/repos/[[]repoId]/pulls/[[]number]/_components/FindingCard/FindingCard.tsx",
      "src/app/repos/[[]repoId]/pulls/[[]number]/_components/RunHistory/RunHistory.tsx",
      "src/app/repos/[[]repoId]/pulls/[[]number]/_components/RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx",
      "src/app/repos/[[]repoId]/pulls/[[]number]/_components/RunTraceDrawer/_components/ToolCallRow/ToolCallRow.tsx",
      "src/app/repos/[[]repoId]/pulls/[[]number]/_components/RunTraceDrawer/_components/TraceSection/TraceSection.tsx",
      "src/app/repos/[[]repoId]/pulls/_components/FindingsCell/FindingsCell.tsx",
      "src/app/repos/[[]repoId]/pulls/_components/PRRow/PRRow.tsx",
      "src/components/diff-viewer/FileCard/FileCard.tsx",
    ],
    rules: {
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
    },
  },
  {
    // Dependencies point one way: shared → features → routes (frontend-architecture
    // skill, boundaries-and-naming.md). Shared code never reaches into a route.
    files: ["src/components/**", "src/lib/**", "src/i18n/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*", "**/app/*"],
              message: "Shared code must not import from src/app. Move what you need into src/lib or src/components.",
            },
          ],
        },
      ],
    },
  },
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
      // src/lib/hooks/ (client/AGENTS.md, "Conventions").
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use apiFetch or a hook from src/lib/hooks/ instead." },
      ],
    },
  },
);
