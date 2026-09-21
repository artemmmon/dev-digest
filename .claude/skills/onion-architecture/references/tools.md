# Backend tools through the onion lens

Sources: [S12]–[S15] Fastify, [S16]–[S19] Drizzle and repositories, [S20] Parse, don't validate,
[S21][S22] anti-corruption layer. Each tool belongs to exactly one ring.

## Contents
1. Fastify 5 — driving adapter
2. Drizzle ORM — driven adapter
3. zod 3 — core
4. SDKs — anti-corruption adapters
5. p-queue / JobRunner / RunBus
6. reviewer-core
7. Vitest + Testcontainers

## 1. Fastify 5 — outer ring (driving adapter)

- `routes.ts` is a **translator**, not a controller with logic: validate (zod schema on
  `params`/`body`/`querystring`/`response` via `fastify-type-provider-zod`), resolve tenancy
  with `getContext`, call **one** service method, set the status code [S12][S13].
- Nothing Fastify-typed (`FastifyRequest`, `FastifyReply`, `app`) crosses into a service.
  Pass plain values (`workspaceId`, parsed body). `_shared/context.ts` is the only helper
  allowed to read the request.
- Use Fastify's encapsulation as the module boundary: each module is one plugin registered
  in `modules/index.ts`; module-private hooks/decorators stay inside it. Only root-level
  singletons (`container`) are decorated through the root — that is the one place
  `fastify-plugin`-style unencapsulated decoration is justified [S12][S14].
- Error mapping belongs to the root error handler in `app.ts`, not to `try/catch` in routes.
  When failure is a *valid answer* (a connection test returning `ok: false`), the service catches
  only that call's failure and returns a value. Everything else still propagates as `AppError`.
- New routes declare a `response` schema too; it also strips unknown keys. Existing routes
  have none; don't retrofit them unless you touch the route.
- DI plugins such as `@fastify/awilix` exist [S15]; we deliberately keep the hand-written
  `Container` (explicit, no magic resolution) — don't introduce a second DI mechanism.

## 2. Drizzle ORM (+ `postgres`) — outer ring (driven adapter)

- One repository per aggregate/table group in `modules/<m>/repository.ts` or `repository/`.
  It `implements` a port from `ports.ts` and is the **only** code that imports `drizzle-orm`
  or `db/schema` for that module [S18][S19].
- Map at the boundary: `toDomain(row)` / `toRow(entity)` live in the repository. Row types
  (`typeof t.x.$inferSelect`, `db/rows.ts`) do not appear in port signatures.
- Every query takes `workspaceId` (tenancy guard), plus `userId` for per-user tables such as
  `settings`. Enforce it in the port signature.
- A repository may **read** other modules' tables for a read model (joins, aggregates). It
  **writes** only its own module's tables. Writes elsewhere go through that module's port.
- **Transactions:** `db.transaction(async (tx) => …)` [S16]. The service decides the
  boundary and the repository never commits on its own [S17]. S17 passes `tx` down through
  use cases. We instead build repositories over an executor (`Db | Tx`) and expose a
  unit-of-work port whose callback receives transaction-bound repositories. That keeps
  Drizzle types out of application code (patterns.md §6).
- Translate driver errors (unique violation `23505`, FK `23503`) into `AppError`
  subclasses inside the repository.
- Schema lives in `src/db/schema/` (outer ring); migrations are generated.

## 3. zod 3 — core

- Contracts in `vendor/shared` are the domain vocabulary: entities, value objects and
  port payloads. They import nothing but `zod`.
- **Parse, don't validate** [S20]: parse once at each edge — HTTP (route schema), third-party
  responses (adapter), jsonb columns if their shape is not guaranteed (repository). Inside,
  functions take `z.infer<>` types and never re-parse.
- Branded/refined types (`z.string().uuid()`, enums) make illegal states unrepresentable
  in the core instead of `if` checks in services.

## 4. Octokit, OpenAI, Anthropic, simple-git, ast-grep, ripgrep, js-tiktoken, dependency-cruiser — outer ring (ACL)

- Each SDK is imported **only** in `src/adapters/<name>/` [S21][S22].
- The adapter is three things in one file: protocol (auth, pagination, retry via
  `platform/resilience.ts`, timeouts), translator (SDK payload → `@devdigest/shared`
  contract, e.g. `mapStatus` in `adapters/github/octokit.ts`), facade (methods named in our
  language: `listPullRequests`, not `pulls.list`).
- Construction from secrets happens in the container (`container.github()`, `llm(id)`),
  never in a service. Secrets (tokens) come only via `SecretsProvider`; non-secret settings
  (a channel id, a base URL) go in `AppConfig` (`platform/config.ts`).
- **New SDK:** add its package to `SDK_PKGS` in `assets/dependency-cruiser.cjs`. Application code
  is already fail-closed: it may import only the allowlisted pure packages.
- **Best-effort side effects** (notifications, audit, webhooks) must not fail the main flow.
  When unconfigured, the container returns a no-op adapter instead of throwing `ConfigError`.
  The application catches and logs the port call.
- Parsers that are pure computations (diff parsing, symbol extraction) may be core helpers;
  if they wrap a native SDK (ast-grep napi) they are adapters behind a port.

## 5. p-queue / JobRunner / RunBus — outer ring

- `platform/jobs.ts` (p-queue + `jobs` table) and `platform/sse.ts` are outer ring (driven adapters).
- The service exposes the job's *work* as a plain method (`runCloneJob(payload)`) and
  enqueues through a narrow `JobQueue` port (`enqueue(kind, payload)`); registering the
  handler (`jobs.register(kind, p => service.runCloneJob(p))`) is wiring — do it in the
  routes plugin or container, not inside the service.
- Payloads crossing the queue are parsed back with zod in the handler (they come from JSON).
- p-queue used as an in-memory concurrency limiter inside a pure pipeline is fine; the
  durable queue is not.

## 6. reviewer-core — application/core

Imported only via `@devdigest/reviewer-core`. It receives an `LLMProvider` and returns
findings; persistence of findings is the server repository's job.

## 7. Vitest + Testcontainers — outer ring (tests may import anything)

Server tests live in `server/test/` (the repo's practice, despite the root "next to the
subject" rule). Name them after the subject.

| Ring under test | Test style | File |
|---|---|---|
| core / pure helpers | plain inputs → outputs, no mocks | `*.test.ts` |
| application service | constructor-injected in-memory fakes of ports | `*.test.ts` |
| repository | real Postgres (Testcontainers, `test/helpers/pg.ts`) | `*.it.test.ts` |
| route + wiring | `buildApp({ overrides })` + `app.inject` | `*.it.test.ts` |

Adapter mocks (`adapters/mocks.ts`) are fakes of **ports**, which is what keeps unit tests
off the network.
