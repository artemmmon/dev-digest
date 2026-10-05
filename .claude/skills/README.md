# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion rings for `server/`: inward-only imports, ports/adapters per tool, where code lives; runnable dependency-cruiser check |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | React + Next.js architecture: where components, constants, helpers, logic and data live; component splitting; import boundaries |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | DevDigest trust boundaries: SSRF guard, clone paths, no-shell processes, SQL, prompt fencing, LLM output rendering, secrets/logs, CI; known gaps and finding rating |
| [spec-authoring](spec-authoring/SKILL.md) | Shared | Feature specs: the template, EARS acceptance criteria, `US/AC/EC/NFR/OQ` ids, provenance tags, untrusted inputs, the draft → approved → implemented lifecycle; runnable `check-spec.mjs` |
| [feature-flow](feature-flow/SKILL.md) | Shared | The route of a feature through the subagents, for the main session: stages and their inputs, what runs in parallel, the spec and plan approval gates, the bounded fix loop, spec amendments; runnable `check-plan.mjs` |
| [sdd](sdd/SKILL.md) | Shared | The `/sdd` command: takes a spec, a plan, designs and a requirements prompt in any mix, finds the feature's stage and runs it through `feature-flow`, with the architecture review loop (CRITICAL + WARNING, up to 3 rounds). Run by the user |
| [workflow-retro](workflow-retro/SKILL.md) | Shared | The `/workflow-retro` command: measures a finished pipeline run from the transcripts on disk (tokens, cache read, tool calls, duration, parallelism, nested subagents), proposes concrete actions and appends a row to `docs/retros/ledger.md`. Run by the user |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Shared | Appends non-obvious findings to the module's `INSIGHTS.md` (append-only, 7 sections) |
| [pr-self-review](pr-self-review/SKILL.md) | Shared | Pre-PR review of local changes: routes changed files to the matching skills, runs checks, verifies CRITICALs, and blocks push / `gh pr create` / `gh pr merge` on BLOCK (Claude hook + git `pre-push`; `scripts/install-hooks.sh`) |
| [devdigest-demo](devdigest-demo/SKILL.md) | Shared | Project conventions for lesson demo videos; needs the [`screencast-demo-maker`](https://github.com/artemmmon/screencast-demo-maker) plugin (see `docs/demo-video.md`) |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via the Agent tool | Subagent orchestration |

## Creating New Skills

Project-authored skills follow the layout of `onion-architecture` / `frontend-architecture`:

- `SKILL.md` — the rules, short (~150 lines), with `metadata.version`
- `README.md` — version, sources-verified date, changelog (bump on every change), file map, sources `[Sn]`, evaluation log
- `references/` — topic files, plus `devdigest.md` mapping the rules onto this repo and its open questions
- `assets/` — runnable checks or scripts, wired into CI where possible
- `evals/evals.json` — `id, skills, query, files, expected_behavior`, run by a fresh instance

Vendored third-party skills keep their upstream layout. Add every new skill to the catalog above.
