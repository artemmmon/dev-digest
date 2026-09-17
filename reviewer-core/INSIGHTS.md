# Insights — reviewer-core

Non-obvious findings about the review engine. Cross-package findings go to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-15 — Not a real package
No build output: `build` is a type-check and the server consumes `src/` through a
tsconfig alias. Installed with **npm** (`package-lock.json`) while the rest uses
pnpm. Without `reviewer-core/node_modules` the API fails with
`ERR_MODULE_NOT_FOUND` — that's why `scripts/dev.sh` installs it separately.
Where: `package.json:10` (`build` is a type-check), `../scripts/dev.sh:80`.

### 2026-09-15 — Contracts live in the server
`@devdigest/shared` resolves to `../server/src/vendor/shared` — changing a
contract there changes the engine's types too; typecheck both packages.
Where: `tsconfig.json:22`.

## Tool & Library Notes

### 2026-09-15 — Two zod copies in the server process
`tsconfig.json` maps `zod` to this package's own `node_modules`, so the server
runs two zod instances. `instanceof ZodError` can miss errors from here; the
server's error handler also matches by shape.
Where: `tsconfig.json:24`, `../server/src/app.ts:139` (`isZodError`).

## Recurring Errors & Fixes

## Open Questions

## Session Notes
