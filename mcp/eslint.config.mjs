// Flat config, ESLint 9. Not type-aware: `pnpm typecheck` already runs tsc over the
// same files. This adds the contracts tsc cannot express: stdout stays
// protocol-only (stdio MCP), @devdigest/shared is imported as types only, and the
// rings point inward (see the RINGS block below and mcp/AGENTS.md).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// ---- RINGS ------------------------------------------------------------------
// core        domain.ts, api/port.ts, api/schemas.ts, api/errors.ts: types, zod and
//             the ApiError class only
// application service.ts, resolve.ts, wait.ts, format.ts, errors.ts, config.ts, log.ts:
//             know the core and the port, never the MCP edge or the HTTP adapter.
//             config.ts and log.ts are leaves; service.ts imports log.ts (allowed).
// edge        tools/*, server.ts: MCP SDK + application
// adapter     api/http.ts: only the composition root (index.ts) may import it
// Uses the base `no-restricted-imports` rule; the type-only @devdigest/shared rule
// below is a different rule and keeps applying to every file.
const group = (names, message) => ({
  group: names.flatMap((n) => [`**/${n}`, `**/${n}.js`]),
  message,
});
const SDK = { group: ["@modelcontextprotocol/*"], message: "Only the MCP edge (tools/*, server.ts, index.ts) uses the SDK." };
const TOOLS = group(["tools/*"], "Inner rings must not import the MCP tool handlers.");
const SERVER = {
  group: ["./server", "./server.js", "../server", "../server.js", "./index", "./index.js", "../index", "../index.js"],
  message: "Inner rings must not import server.ts or index.ts.",
};
const HTTP = group(["api/http"], "Only index.ts (composition root) may import the HTTP adapter.");
const APPLICATION = group(
  ["service", "resolve", "wait", "format", "errors", "config", "log"],
  "The core (domain, port, schemas) must not import application code.",
);
const rings = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

export default tseslint.config(
  { ignores: ["node_modules/**", "**/__snapshots__/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // tsc already resolves every identifier, including Node globals.
      "no-undef": "off",
      // stdout carries the MCP protocol; a stray console.log corrupts the stream.
      "no-console": ["error", { allow: ["error", "warn"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // At runtime the server's copy would load the server's zod, not this package's.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@devdigest/shared",
              message: "Import types only: `import type { X } from '@devdigest/shared'`.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["**/server/src/**", "../../server/**"],
              message: "Import contracts through the @devdigest/shared alias, never a relative server path.",
            },
          ],
        },
      ],
    },
  },
  // Everything except the composition root and the HTTP adapter's own test: no api/http.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/index.ts", "src/api/http.test.ts"],
    rules: rings(HTTP),
  },
  // Application ring: no MCP edge, no SDK.
  {
    files: [
      "src/service.ts",
      "src/resolve.ts",
      "src/wait.ts",
      "src/format.ts",
      "src/errors.ts",
      "src/config.ts",
      "src/log.ts",
    ],
    rules: rings(TOOLS, SERVER, HTTP, SDK),
  },
  // Core ring: types and zod only (api/errors.ts is the ApiError class, no imports at all).
  {
    files: ["src/domain.ts", "src/api/port.ts", "src/api/schemas.ts", "src/api/errors.ts"],
    rules: rings(TOOLS, SERVER, HTTP, SDK, APPLICATION),
  },
  // domain.ts depends on nothing at all.
  {
    files: ["src/domain.ts"],
    rules: rings({ group: ["./*", "../*", "@devdigest/*", "zod"], message: "domain.ts is types only and imports nothing." }),
  },
  {
    // The measurement script prints its table to stdout on purpose.
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
