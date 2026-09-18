# onion-architecture

Onion Architecture rules for the DevDigest backend (Fastify 5, Drizzle, zod, Octokit/LLM SDKs,
p-queue). Covers which ring a file belongs to, which way imports may point, where queries, SDK
calls, jobs, parsing and business rules live, and a runnable dependency-cruiser check. Query
tuning, Fastify internals and client code are out of scope.

- **Version:** 1.1.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-09-18
- **Related skills:** `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `frontend-architecture`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-18 | Initial version: 25 sources, 3 references, depcruise config + known-violations baseline |
| 1.1.0 | 2026-09-18 | Aligned with `frontend-architecture` (README format, Read next, Out of scope, open questions, contents in long references); one term set (core / application / outer ring); rule `application-no-infrastructure` split into `application-no-outer-ring` + fail-closed `application-allowed-packages`; 3 evals and the gaps they exposed (see Evaluation log) |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule,
reference or check, **major** when a rule is reversed. Add a changelog row each time. If a rule
in `assets/dependency-cruiser.cjs` is renamed, regenerate `assets/known-violations.json`.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The dependency rule, rings table, principles, "where does X go?", workflow, Check command |
| [references/devdigest.md](references/devdigest.md) | Existing ports and mocks, the Container, known debt, open questions |
| [references/tools.md](references/tools.md) | Fastify, Drizzle, zod, SDKs, p-queue/jobs, reviewer-core, tests: each tool's ring and rules |
| [references/patterns.md](references/patterns.md) | Code shapes: port, repository, service, wiring, route, unit of work, ACL adapter, fakes, pulls before/after |
| [assets/dependency-cruiser.cjs](assets/dependency-cruiser.cjs) | The 9 enforceable rules, `SDK_PKGS` and the application allowlist (run it; edit the lists when adding a package) |
| [assets/known-violations.json](assets/known-violations.json) | Baseline of existing debt ignored by the Check |
| [evals/evals.json](evals/evals.json) | 3 evaluation scenarios with expected behaviour |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **DD** devdigest · **TL** tools · **PT** patterns · **RM** this README only
(background or conflicts).

### Q1. Onion Architecture and its relatives

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S1 | The Onion Architecture: part 1 | Jeffrey Palermo | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ | Domain model at the centre; all coupling points inward; infrastructure (incl. the database) is outside | Jul 2008 | SK DD |
| S2 | The Onion Architecture: part 2 | Jeffrey Palermo | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/ | Core defines interfaces, outer layers implement them, an IoC container wires them at runtime | Jul 2008 | SK |
| S3 | Jeffrey-Palermo-Onion-Architecture (mirror of the original sample) | Jordiag | https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture | Core / Infrastructure / UI / Tests project split as a reference implementation | repo 2020, last push May 2023 | RM |
| S4 | Onion Architecture | Herberto Graça | https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85 | Ports & adapters plus internal layers around the domain; dependencies only toward the centre | Sep 2017 | RM |
| S5 | Sliced Onion Architecture | Oliver Drotbohm | http://odrotbohm.github.io/2023/07/sliced-onion-architecture/ | Slice the onion vertically into functional modules aligned with business capabilities | Jul 2023 | SK PT |
| S6 | The Clean Architecture | Robert C. Martin | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html | The Dependency Rule: source dependencies point only inward | Aug 2012 | SK |
| S7 | Hexagonal architecture (software) | Wikipedia (pattern by Alistair Cockburn) | https://en.wikipedia.org/wiki/Hexagonal_architecture_(software) | Components talk to the outside through ports and swappable adapters | living doc | SK PT |

### Q2. TypeScript / Node.js practice

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S8 | Domain-Driven Hexagon | Sairyss | https://dev.to/sairyss/domain-driven-hexagon-18g5 | Combine DDD, hexagonal, onion and clean architecture in TS; the linked guide says use only the layers you need | Feb 2021, edited Dec 2022 | SK DD |
| S9 | Clean Node.js Architecture | Khalil Stemmler | https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/ | Separate policy from details via dependency inversion; invest in flexibility in proportion to complexity | Jun 2019 | SK DD PT |
| S10 | Clean architecture with TypeScript: DDD, Onion | André Bazaglia | https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/ | Folders per ring (`domain/`, `app/`, `infra/`, `api/`); domain functions get injected infrastructure | Sep 2019 | RM |
| S11 | Ports and Adapters, explained with two real codebases | Md Nasimul Hasan | https://saadh393.github.io/blog/adapter-port-architecture-two-cases | Application imports ports, never adapters; use them where a dependency may be swapped or faked | May 2026 | SK PT |

### Q3. Fastify

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S12 | Encapsulation | Fastify docs | https://fastify.dev/docs/latest/Reference/Encapsulation/ | Each plugin is its own context; share with parents only deliberately via `fastify-plugin` | v5 docs | TL PT |
| S13 | The hitchhiker's guide to plugins | Fastify docs | https://fastify.dev/docs/latest/Guides/Plugins-Guide/ | Wrap features in registered plugins; break encapsulation only for app-wide utilities | v5 docs | TL |
| S14 | Decorators | Fastify docs | https://fastify.dev/docs/latest/Reference/Decorators/ | Declare decorations up front with the decorators API | v5 docs | TL |
| S15 | @fastify/awilix | Fastify org | https://github.com/fastify/fastify-awilix | Awilix DI with app- and request-scoped resolution | v8 | TL |

### Q4. Drizzle and repositories

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S16 | Transactions | Drizzle ORM docs | https://orm.drizzle.team/docs/transactions | `db.transaction(tx => …)`, nested savepoints, `tx.rollback()`, isolation config | living doc | SK TL PT |
| S17 | Atomic Repositories in Clean Architecture and TypeScript | Lazar Nikolov (Sentry) | https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/ | A transaction manager starts the tx; use cases pass it down; repositories use `tx ?? db` | Oct 2024 | SK TL PT |
| S18 | Architecture Patterns with Python, ch. 2: Repository Pattern | Harry Percival & Bob Gregory | https://www.cosmicpython.com/book/chapter_02_repository.html | Hide persistence behind a repository so the domain is decoupled and tests use fakes; skip it for simple CRUD | living doc | SK TL PT |
| S19 | Drizzle ORM Best Practices | Paul Serban | https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/ | SQL-first and explicitly typed; repositories and domain types over magic abstractions | Jun 2023 | TL PT |

### Q5. Boundaries and anti-corruption

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S20 | Parse, don't validate | Alexis King | https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ | Parse input into precise types at the boundary so invalid states are unrepresentable | Nov 2019 | SK TL |
| S21 | Anti-Corruption Layer pattern | Microsoft (Azure Architecture Center) | https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer | A translating facade between systems with different semantics; no business rules in it | living doc | SK TL PT |
| S22 | Anti-Corruption Layer | DevIQ | https://deviq.com/domain-driven-design/anti-corruption-layer/ | A defensive translation boundary keeps foreign models out of the domain | — | SK TL |

### Q6. Enforcing the rule

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S23 | Validate Dependencies According to Clean Architecture | Ken Miyashita | https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c | Enforce the one-way rule with dependency-cruiser on pre-commit | Feb 2023 | DD |
| S24 | Taking Frontend Architecture Serious with dependency-cruiser | Ruben Oostinga (Xebia) | https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/ | Run dependency-cruiser next to ESLint to enforce module boundaries | updated Jun 2026 | DD |
| S25 | How to maintain clean architecture with dependency rules | Alex Mercer (cubic) | https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase | Check dependency rules automatically so architecture doesn't erode | Feb 2026 | DD |

## Conflicts and outdated guidance

How the skill resolves the places where sources disagree:

| Topic | Positions | Skill's rule |
|---|---|---|
| Interface for everything | Every repository/service behind an interface (S1, S2) vs only when complexity or substitution warrants it (S8, S9, S18) | Port wherever there is I/O or a test fake is needed; pure helpers need none |
| Folders per ring | `domain/ app/ infra/ api/` (S10) vs rings inside vertical modules (S5) | Keep DevDigest's file names; express rings through imports (devdigest.md) |
| DI mechanism | Container library (S15, S2's IoC) vs hand-written composition root (S9) | Keep the hand-written `platform/container.ts`; no second DI system |
| Transactions | Pass `tx` down through use cases, repositories use `tx ?? db` (S17) vs unit of work (S18's book, later chapters) | Service owns the boundary (S17) through a unit-of-work port, so Drizzle's `tx` type never reaches application code |
| Repository for simple CRUD | Skip it (S18) vs baseline practice (S19) | Any module that touches the DB gets a repository; routes never query (the starter routes are debt) |
| Where rules are enforced | Pre-commit / CI (S23, S24, S25) | CI via `pnpm arch`, config + baseline in the skill; open question 1 in devdigest.md |

## Notes on verification

- All URLs were fetched on 2026-09-18 and loaded.
- S4 and S23 (Medium hosts) return HTTP 403 to automated fetches. Authors were confirmed through
  search results; S4's date comes from the author's own blog mirror.
- S19 moved to `blog.paulserban.eu`; the new URL is used. S18 points at the current online book.
- S3's date is the GitHub mirror's, not the 2008 original's. S22 shows no date.
- The known-violations baseline was generated on 2026-09-18 with 45 entries. Re-run the Check
  without `--ignore-known` for the current list.

## Evaluation log

Scenarios in `evals/evals.json`, run by a fresh Claude instance with only the skill as guidance
(read-only, plan + code sketch).

| Date | Scenario | Result | Change made |
|---|---|---|---|
| 2026-09-18 | new-endpoint | Pass: port + repository + thin route, ports via constructor, container getter, Check run | Added: adding to a debt service (devdigest §3); every store gets a container getter; cross-table reads vs writes; where port payload types live; response schemas for new routes; tests live in `server/test/`; Check command in the config header now matches SKILL.md |
| 2026-09-18 | new-sdk | Pass: port in core, SDK only in `adapters/slack/`, errors → `ExternalServiceError`, mock + override | **Gap:** the Check missed an unknown SDK in a service (static `SDK_PKGS`). Application imports are now fail-closed (`application-allowed-packages`), which surfaced 5 more debt entries (`fs/promises`, `os`). Added: best-effort side effects, config vs secret, lazy async ports, forwarding a port through nested services, cleanup budget |
| 2026-09-18 | review-debt | Pass: found DB in route, recognised known debt, flagged `feature-models.ts`, proposed service + repository | Added: failure-as-a-valid-answer endpoints, Check sees imports only + how to review a debt file, user-scoped tenancy |
