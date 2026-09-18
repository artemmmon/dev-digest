---
name: onion-architecture
description: Onion Architecture rules for the DevDigest backend (Fastify 5 + Drizzle + zod + Octokit/LLM SDKs + p-queue) — which ring a file belongs to, which way imports may point, where a query, an SDK call, a job handler, a zod parse or a business rule lives, how services get their dependencies (ports via constructor), transactions, error mapping, and a runnable dependency-cruiser check. Use whenever creating or changing anything under server/src/modules/**, adding a route, service, repository, adapter, job or third-party SDK, wiring platform/container.ts, reviewing backend code, or answering "where does this belong?" on the server — even if the word "architecture" is never used. Not for client code (see frontend-architecture) or query tuning (see drizzle-orm-patterns).
metadata:
  version: "1.1.0"
---

# Onion Architecture (DevDigest server)

Decisions about **which ring code lives in and which way it may import**. Rules come from the sources in [README.md](README.md); `[S6]` marks source #6 there.

> **Working in DevDigest `server/`?** Read [references/devdigest.md](references/devdigest.md)
> first — the real ports, the Container, and the **known debt** you must not copy.

## The one rule

**Source-code dependencies point inward only.** An inner ring never names anything in an
outer ring — not a type, not a function, not a package [S1][S6].

| Ring | Files | May import |
|---|---|---|
| **Core — domain** | `src/vendor/shared/contracts/*`, `modules/<m>/domain.ts` | `zod`, other core |
| **Core — ports** | `src/vendor/shared/adapters.ts`, `modules/<m>/ports.ts` | domain |
| **Application** | `modules/<m>/service.ts`, `run-executor.ts`, pure helpers, `@devdigest/reviewer-core` | core, `platform/errors.ts` |
| **Outer ring** | driving adapters: `routes.ts`, job handlers · driven adapters: `repository(.ts\|/)`, `src/adapters/**` · plus `src/db/**`, `src/platform/**`, `test/**` | anything inward |

`platform/container.ts` is the **composition root**: the only file that knows every ring [S2][S5][S9].

## Principles

1. **The database is in the outer ring.** Drizzle tables and row types stay in the
   repository; it returns domain types. *Why:* the schema changes without touching rules [S1][S18].
2. **Core declares ports; the outer ring implements them.** *Why:* dependency inversion is
   what turns layers into an onion [S1][S7].
3. **Services get narrow ports through the constructor** — never the whole `Container`, never
   `new XRepository(db)` inside. *Why:* visible dependencies, fakes without hacks [S9][S11].
4. **Parse at the edge, trust inside.** zod schemas on routes; adapters parse SDK payloads;
   core and application take typed values [S20].
5. **One anti-corruption layer per SDK.** SDK types never leave `src/adapters/<name>/`; the
   adapter owns retry, timeout, auth and translation to contracts [S21][S22].
6. **The application service owns the transaction boundary** [S17]; a unit-of-work port
   keeps Drizzle's `tx` in the outer ring [S16] (why not pass `tx`: README → Conflicts).
7. **Errors cross rings as `AppError`.** Driven adapters map SDK/Postgres failures [S8].
8. **Modules are vertical slices** that meet only through `index.ts`/`types.ts` or a port
   in the container [S5].

## Where does X go?

| You need… | Put it in |
|---|---|
| business rule / calculation | `domain.ts` or a pure helper beside the service |
| new SQL query | module repository + a method on its port in `ports.ts` |
| external service (GitHub, LLM, git, Slack…) | port in `adapters.ts` + `src/adapters/<name>/`; payload types beside the port |
| new request field | zod contract in `vendor/shared` (**both** copies) + route schema |
| background work | service method; register the job handler in the route plugin |
| type mirroring a DB row | the repository file, never exported past the port |
| constant an adapter needs | core (`vendor/shared` or `domain.ts`), not a module |

## Workflow: new or changed module (copy and tick off)

```
- [ ] 1. Domain types (zod) + the port the service needs
- [ ] 2. Service against ports only; unit test with in-memory fakes
- [ ] 3. Driven adapter implements the port (repository / src/adapters), maps to domain
- [ ] 4. Wire it in platform/container.ts; routes.ts builds the service from container parts
- [ ] 5. routes.ts stays thin: schema → getContext → one service call → status
- [ ] 6. Register in modules/index.ts; .it.test.ts for repository + route
- [ ] 7. Run the Check below — zero new violations; if not, fix and re-run
```

Review checklist: no DB/Fastify/SDK/`adapters/*` import in application code · no query or
business branch in `routes.ts` · zod on params/body/response · constructor takes ports, not `Container` · repository returns domain types ·
SDK errors mapped to `AppError` · transaction in the service · no cross-module internals or
cycles · both contract copies updated · a touched debt file leaves cleaner.

## Check

Run from `server/` as `pnpm arch` (the same command runs in CI, `server-unit.yml`):

```bash
pnpm exec depcruise src --config ../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs --ignore-known ../.claude/skills/onion-architecture/assets/known-violations.json --output-type err
```

Pass = `no dependency violations found`; exit ≠ 0 = new errors, each naming its rule. It sees
**imports only**: logic in routes or a missing transaction needs the checklist. Reviewing a debt
file? Drop `--ignore-known` and grep its path. Regenerate the baseline only after **fixing** debt.

## Read next

| When you are… | Read |
|---|---|
| Working in `server/`, touching a known-debt file | [devdigest.md](references/devdigest.md) |
| Using Fastify, Drizzle, zod, an SDK, the job queue or writing tests | [tools.md](references/tools.md) |
| Writing a port, repository, service, unit of work, ACL adapter or fake | [patterns.md](references/patterns.md) |
| Checking why a rule exists or where sources disagree | [README.md](README.md) |

## Out of scope

- Queries, relations, migrations → `drizzle-orm-patterns`; table design → `postgresql-table-design`.
- Fastify plugins, hooks, security, performance → `fastify-best-practices`; zod API → `zod`; client → `frontend-architecture`.
