# DevDigest `server/` — how the rules apply here

Inside `server/` the **existing conventions win**: file names stay as the root `AGENTS.md`
defines them (`routes.ts` → `service.ts` → `repository/`), and the rings are expressed through
**imports**, not new folders. New code follows the rules below. Don't refactor existing code
toward them unless the task asks for it. Divergences from the sources are listed at the
end as open questions. Raise them rather than silently "fixing" them.

Also read `server/AGENTS.md` (commands, conventions) and `server/INSIGHTS.md` (gotchas)
before changing code.

## Contents
1. Ports that already exist
2. The Container
3. reviewer-core is the reference core
4. Worked examples
5. Repo reminders
6. Open questions

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
Cross-module ports (`JobQueue`, `RunBusPort`) live in `modules/_shared/ports.ts`; each module's
store and other ports sit in its own `ports.ts` (§4). Reuse them before adding a new one.

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

## 3. reviewer-core is the reference core

`reviewer-core/` already obeys the onion: pure engine, the only side effect is an injected
`LLMProvider`, enforced by `no-restricted-imports` in `reviewer-core/eslint.config.mjs`.
Copy its style; never let it import `server/src` except via `@devdigest/shared`.

## 4. Worked examples (no known debt)

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

## 5. Repo reminders that interact with the rings

- Contract change → edit `server/src/vendor/shared` (server-only ports in `adapters.ts`
  included), then run `./scripts/shared-contracts.sh sync` from the repo root; never edit the
  client copy by hand.
- Errors: throw `AppError` subclasses from `platform/errors.ts`; the app error handler
  renders the envelope.
- Tests touching Postgres end in `.it.test.ts` (Testcontainers); service tests with fakes
  are plain `.test.ts`. Don't monkey-patch private fields — pass the fake to the constructor
  (`test/repo-intel-resync.test.ts` does).
- `server/src/db/migrations/` is generated — never hand-edit.

## 6. Open questions (divergences from the sources)

1. **Where the rules run.** Sources run dependency rules on every commit or in CI, next to ESLint [S23][S24][S25].
   Here the config lives in the skill and `pnpm arch` runs it in CI (`server-unit.yml`); with zero
   violations it could move into `pnpm lint` (dependency-cruiser as an ESLint step), but a separate
   script keeps the rule names readable.
2. **Repository ports everywhere?** Palermo puts an interface in front of every repository [S1];
   pragmatic guides add ports only where I/O or test substitution needs them [S8][S9].
   Existing repositories are concrete classes. Add ports for new code, and for old code only when you touch it.
3. **Home for `repo-intel/constants.ts`.** Adapters (`astgrep`, `depgraph`) and `repos` import it.
   It belongs in core (`vendor/shared`), but moving it is a contract change (server copy + sync).
