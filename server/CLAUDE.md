# server — `@devdigest/api`

Fastify 5 API on :3001. Owns all I/O: Postgres (Drizzle), GitHub (Octokit), git
clones, job queue, SSE run logs, the repo-intel indexer. Delegates the review
itself to `reviewer-core`. Root rules: `../CLAUDE.md`.

## Commands
```sh
pnpm dev                                          # tsx watch, :3001
pnpm typecheck
pnpm lint                                         # eslint, not type-aware
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit, no Docker
pnpm exec vitest run .it.test                     # integration, needs Docker
pnpm test                                         # both
pnpm db:generate                                  # after editing src/db/schema/
pnpm db:migrate                                   # NOT applied on boot
pnpm db:seed                                      # idempotent; API needs it (see gotchas)
```

## Where things live
- `src/app.ts` — `buildApp()`: plugins, error handler · `src/server.ts` — entry
- `src/platform/container.ts` — DI container; every adapter and service is wired here
- `src/modules/<name>/` — feature plugins; registered statically in `src/modules/index.ts`
- `src/modules/reviews/run-executor.ts` — assembles review context, runs agents, persists
- `src/adapters/` — port implementations; `adapters/mocks.ts` for tests
- `src/db/schema/` — tables for **all** lessons already exist, most are empty
- `src/vendor/shared/` — canonical Zod contracts (`@devdigest/shared`)

## Conventions
Naming is in `../CLAUDE.md`; what follows is the shape of the code.
- New module: `modules/<name>/routes.ts` default-exports a Fastify plugin, layered
  routes → service → repository; add one import + one `register` in `modules/index.ts`.
  Look in `src/db/schema/` first — the table most likely exists.
- Route `params`/`body`/response are Zod schemas (`fastify-type-provider-zod`);
  never `Schema.parse(req.body)` inside a handler.
- Errors: throw `AppError` (`platform/errors.ts`); envelope is
  `{ error: { code, message, details } }`, validation → 422.
- Secrets only through `SecretsProvider` (`~/.devdigest/secrets.json`, env fallback) —
  never in `AppConfig`, never in the DB.
- Tests: a test importing `test/helpers/pg.ts` **must** be named `*.it.test.ts`.
  Stub the outside world with `adapters/mocks.ts`; no real keys or network.
- Import review logic from `@devdigest/reviewer-core`, not from the re-export shims
  `platform/{grounding,prompt,structured}.ts`.

## Gotchas
- No seed → API fails: `LocalNoAuthProvider` looks up user `you@local` + workspace `default`.
- `reviewer-core/node_modules` must exist (`npm install` there), else `ERR_MODULE_NOT_FOUND`.
- Two zod copies at runtime (reviewer-core pins its own) → detect `ZodError` by shape,
  not only `instanceof` (see `app.ts` error handler).
- Job queue and `RunBus` (SSE) are in-memory: a single API instance is assumed,
  reviews run fire-and-forget, stale runs are reaped on boot.
- `platform/model-router.ts` is dead code — don't build on it.

## Documentation
- `README.md` — env vars, API map, request/DI flow, what goes into the review prompt
- `src/modules/repo-intel/README.md` — indexer pipeline; read before touching repo-intel
- `docs/` — server architecture notes and decisions
- `specs/` — server feature specs; check before implementing a feature
- `INSIGHTS.md` — server gotchas and open risks; `src/modules/repo-intel/INSIGHTS.md` — indexer.
  Append via the `engineering-insights` skill
- `../TESTING.md` — unit/integration split and CI lanes
