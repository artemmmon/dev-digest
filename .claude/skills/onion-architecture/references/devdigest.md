# DevDigest `server/` — how the rules apply here

Inside `server/` the **existing conventions win**: file names stay as the root `AGENTS.md`
defines them (`routes.ts` → `service.ts` → `repository/`), and the rings are expressed through
**imports**, not new folders. New code follows the rules below. Don't refactor existing code
toward them unless the task asks for it. The exception is a known-debt file you are already
changing: leave it cleaner than you found it. Divergences from the sources are listed at the
end as open questions. Raise them rather than silently "fixing" them.

Also read `server/AGENTS.md` (commands, conventions) and `server/INSIGHTS.md` (gotchas)
before changing code.

## Contents
1. Ports that already exist
2. The Container
3. Adding to a module whose service is debt
4. reviewer-core is the reference core
5. Known debt
6. Repo reminders
7. Open questions

## 1. Ports that already exist

`server/src/vendor/shared/adapters.ts` (core, zod-only):

| Port | Real adapter (`server/src/adapters/`) | Test double (`adapters/mocks.ts`) |
|---|---|---|
| `LLMProvider` | `llm/openai.ts`, `llm/anthropic.ts`, `OpenRouterProvider` (reviewer-core) | `MockLLMProvider` |
| `GitHubClient` | `github/octokit.ts` — the model ACL: maps Octokit payloads to `PrMeta`/`PrDetail` | `MockGitHubClient` |
| `GitClient` | `git/simple-git.ts` | `MockGitClient` |
| `CodeIndex` | `codeindex/ripgrep.ts` | `MockCodeIndex` |
| `Embedder` | `embedder/openai.ts` | `MockEmbedder` |
| `AuthProvider` / `SecretsProvider` | `auth/local.ts` / `secrets/local.ts` | `MockAuthProvider` / `MockSecretsProvider` |

Also port-shaped: `RepoIntel` (`modules/repo-intel/types.ts`), `DepGraph`, `Tokenizer`.
Missing and worth adding when you touch the area: **repository ports** (`ReviewStore`,
`AgentStore`, …), a **`JobQueue`** port over `platform/jobs.ts`, and parser ports for
`adapters/astgrep` + `adapters/codeindex/extract` (repo-intel calls them directly today).

## 2. The Container

- `platform/container.ts` builds adapters lazily and honours `ContainerOverrides`
  (`github`, `git`, `llm`, `repoIntel`, …) — that is how tests inject mocks via
  `buildApp({ config, db, overrides })`.
- **Target shape:** routes (or the container) assemble a service from parts:
  `new RepoService({ repos: container.reposStore, git: container.git, jobs: container.jobs })`.
  The service type-imports only the port interfaces, never `Container`.
- **Every** store and adapter gets a lazy container getter, module-local ones included
  (`agentsRepo`, `reviewRepo` are the precedent). Routes never build a store from
  `container.db` themselves.
- Adapters built from a secret are async (`await container.github()`, `llm(id)`). Pass them to a
  service as a lazy factory port, `() => Promise<GitHubClient>`, so the plugin can build the
  service synchronously.
- A service that builds its own collaborators (`ReviewService` → `ReviewRunExecutor`) forwards a
  new port through its constructor. Don't reach into the container from the inner object.

## 3. Adding to a module whose service is debt

- **Small change** (new method, one new dependency): add the port as a constructor argument
  next to the existing `Container` and use only the port in the new code. Don't widen the
  Container usage.
- **New feature with its own dependencies:** add a sibling port-based service in the same module
  (`<feature>-service.ts`, kebab-case) rather than refactoring the old one.
- **Cleanup budget:** fix only the violations that block your change or sit in the lines you
  touch. A full migration of a debt module is its own task.

## 4. reviewer-core is the reference core

`reviewer-core/` already obeys the onion: pure engine, the only side effect is an injected
`LLMProvider`, enforced by `no-restricted-imports` in `reviewer-core/eslint.config.mjs`.
Copy its style; never let it import `server/src` except via `@devdigest/shared`.

## 5. Worked examples (no known debt)

The Check finds zero violations and there is no baseline, so any violation is new. Copy the shape of
these modules — ports → repository → service → thin routes:

| Module | What it shows |
|---|---|
| `modules/pulls/` | `PullStore` port, Drizzle repository returning domain records, service with GitHub sync + rollups, response schemas |
| `modules/settings/` | small module: store port, service, secrets, connection test |
| `modules/repos/` | records instead of rows, job queue port, service unit-tested with fakes |
| `modules/agents/` | store port + `types.ts` public surface for other modules (`AgentRecord`) |
| `modules/reviews/` | `ReviewDeps` (store, agents, git, llm, repo-intel, run bus), executor without the Container |
| `modules/repo-intel/` | ports for parser / fs / import graph / tokenizer; adapters in `adapters/{astgrep,repo-files,depgraph,tokenizer}` |

Cross-module contracts live in `modules/_shared/ports.ts` (`JobQueue`, `RunBusPort`, job kinds,
`repoJobKey`): a `ports.ts` file is core, so both ring sides may import it. A module hands its own
types to others through `index.ts` / `types.ts` (`agents/types.ts`, `repos/types.ts`).

Still not covered by the Check (review these by hand): `import` of `platform/resilience.ts` and
`platform/run-logger.ts` from application code (pure helpers in the outer folder), and the concrete
`RepoIntelRepository` class that `RepoIntelService` receives by constructor.

## 6. Repo reminders that interact with the rings

- Contract change → edit **both** `server/src/vendor/shared` and `client/src/vendor/shared`,
  including server-only ports in `adapters.ts` (the client has a copy; keep them in step).
- Errors: throw `AppError` subclasses from `platform/errors.ts`; the app error handler
  renders the envelope.
- Tests touching Postgres end in `.it.test.ts` (Testcontainers); service tests with fakes
  are plain `.test.ts`. Don't monkey-patch private fields — pass the fake to the constructor
  (`test/repo-intel-resync.test.ts` does).
- `server/src/db/migrations/` is generated — never hand-edit.

## 7. Open questions (divergences from the sources)

1. **Where the rules run.** Sources run dependency rules on every commit or in CI, next to ESLint [S23][S24][S25].
   Here the config lives in the skill and `pnpm arch` runs it in CI (`server-unit.yml`); with zero
   violations it could move into `pnpm lint` (dependency-cruiser as an ESLint step), but a separate
   script keeps the rule names readable.
2. **Repository ports everywhere?** Palermo puts an interface in front of every repository [S1];
   pragmatic guides add ports only where I/O or test substitution needs them [S8][S9].
   Existing repositories are concrete classes. Add ports for new code, and for old code only when you touch it.
3. **A `JobQueue` port.** Services reach `container.jobs` (`JobRunner`) directly today. A narrow
   `enqueue` port (patterns.md §1) would decouple them. Nothing uses one yet.
4. **Home for `repo-intel/constants.ts`.** Adapters (`astgrep`, `depgraph`) and `repos` import it.
   It belongs in core (`vendor/shared`), but moving it changes both contract copies.
