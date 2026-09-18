# Testing & CI strategy

DevDigest is four independent packages (no workspace), so testing is organised
as **one suite per package**, each with its own CI workflow, runner, and path
filter. A package's suite runs only when that package (or a package it depends
on at type-check time) changes.

## Philosophy — typological, not exhaustive

We do **not** chase line coverage. Each suite covers the *kinds* of things that
can break in that layer — one happy path plus the edge that actually matters per
workflow — and deliberately skips the rest. Concretely:

- **Test behaviour at the seams**, not implementation details. Routes, adapters,
  contracts, the review pipeline, the rendered component.
- **Mock the outside world.** LLMs, GitHub, and git are stubbed via
  `server/src/adapters/mocks.ts` so unit tests are hermetic and key-free.
- **One real integration per data-backed workflow**, against a real Postgres —
  not a mock DB — because the bugs there live in SQL, migrations, and wiring.
- **A few end-to-end browser flows** over the *main* user journeys, on seeded
  data, with no LLM in the loop.

If a test wouldn't catch a class of regression we care about, we don't write it.

## Suite map

| Suite | Package | Kind | Runner | Workflow | Docker? |
|-------|---------|------|--------|----------|---------|
| client | `client/` | component / unit (jsdom) | vitest | `client.yml` | no |
| server-unit | `server/` | unit (hermetic) | vitest | `server-unit.yml` | no |
| server-integration | `server/` | integration (real Postgres) | vitest | `server-integration.yml` | **yes** |
| reviewer-core | `reviewer-core/` | unit (engine) | vitest | `reviewer-core.yml` | no |
| e2e web | `e2e/` | browser e2e (deterministic) | agent-browser + `run.ts` | `e2e-web.yml` | yes (stack) |

## What each suite covers

**client** — components render and react to interaction (React Testing Library
+ jsdom). `fetch` is mocked; no API, DB, or browser. Covers the PR-review
surface (list, diff, findings, run controls) and the agent editor.

**server-unit** — the DB-free majority: adapters, prompt assembly, grounding,
repo-intel ranking & indexing, pricing, route smoke. The `typecheck` job also
runs on Windows, which doubles as the `@ast-grep/napi` prebuilt gate (install
fails there if the win32 prebuilt is missing).

**server-integration** — the `*.it.test.ts` files. Each starts a real Postgres
(pgvector) via testcontainers, builds the Fastify app, migrates + seeds, and
drives routes end-to-end: reviews + run lifecycle (incl. grounding), agents CRUD,
repo-intel symbol clamping, pulls comments, settings models. They self-skip when
Docker is unavailable.

**reviewer-core** — the pure engine: `toReview` selection, prompt construction,
and a `run` with a stubbed model → grounded findings. No DB / GitHub / FS.

**e2e web** — see `e2e/README.md`. Deterministic agent-browser flows over the
main journeys (boot → PR list → PR detail; agents) against a real seeded stack.
No `chat`, no model key.

## Running locally

```sh
# per package
cd client        && pnpm typecheck && pnpm lint && pnpm test
cd reviewer-core && npm run typecheck && npm run lint && npm test

# server — the unit/integration split (see note below)
cd server && pnpm test:unit                                     # unit, no Docker
cd server && pnpm test:integration                              # integration, needs Docker
cd server && pnpm arch                                          # onion layering (depcruise)
cd server && pnpm test                                          # both

# browser e2e (needs the full stack + agent-browser CLI)
./scripts/dev.sh
npm i -g agent-browser && agent-browser install
cd e2e && npm install && npm test
```

## Static gates

Every package runs two static gates before its tests, both wired into its workflow:

- **`typecheck`** — `tsc --noEmit`. For `reviewer-core` this *is* the build.
- **`lint`** — `eslint .` against the package's own `eslint.config.mjs` (flat config,
  ESLint 9). The configs are deliberately **not** type-aware: tsc already walks the
  same files in the same lane, so the linter only carries what tsc cannot see —
  unused code, `any`, import style, and a few architectural rules (`client`: no bare
  `fetch` outside `src/lib/api.ts`, shared code never imports `src/app`, Next.js and
  jsx-a11y rules; `reviewer-core`: no fs/child_process/network outside `src/llm/`).
  Vendored and generated trees are ignored: `client/src/vendor`, `client/docs`,
  `server/src/vendor`, `server/src/db/migrations`, `server/clones`.
- **`arch`** (server only) — `pnpm arch`, the onion layering check (dependency-cruiser
  `onion-architecture` skill; no baseline, any violation fails).

## Conventions

- **Integration tests end in `*.it.test.ts`.** The unit lane (`pnpm test:unit`)
  excludes that glob; the integration lane (`pnpm test:integration`) selects only
  it. A DB-backed test that imports `test/helpers/pg.ts` must use the `.it.test.ts`
  suffix.
- **Contract copies stay identical.** `./scripts/shared-contracts.sh check` runs in
  CI (`shared-contracts.yml`); after editing `server/src/vendor/shared`, run `sync`.
- **Hermetic by default.** Reach for `src/adapters/mocks.ts` (MockLLMProvider,
  MockGitClient) rather than real network/keys.
- **Client component tests** render through `renderWithIntl` (`client/src/test/render.tsx`:
  the real message catalogue, a QueryClient and the toast host) and drive the UI with
  `userEvent`, not `fireEvent`.
- **E2E specs are deterministic batch JSON** (`e2e/specs/*.flow.json`) using
  only `--url` / `--text` / `find` locators — never the AI `chat` command.
- **CI is path-filtered per package.** Cross-package source aliases are encoded
  in each workflow's `paths:` (e.g. `reviewer-core/**` triggers `server-unit`
  because the server type-checks against `../reviewer-core/src`).
- **`server/clones/**` is runtime data** (git-ignored) and never collected by
  any suite.
