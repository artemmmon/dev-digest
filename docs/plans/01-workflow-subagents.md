# Development Plan: Four workflow subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer)
Status: implemented
Note: `plan-verifier` was later renamed `implementation-verifier` (2026-09-24): it checks code against the plan, not the plan itself. This plan keeps the original name.
Spec: none

## Goal
Add four Claude Code subagents to `.claude/agents/`: `test-writer`, `architecture-reviewer`, `plan-verifier` and `doc-writer`. Each follows the conventions of the existing agents and the "Adding an agent" rules. Then update `.claude/agents/README.md` (catalog, inputs/outputs, feature flow, sources) so the chain researcher → planner → implementer → test-writer → plan-verifier / architecture-reviewer → doc-writer → pr-self-review is documented.

In scope: the four new `.claude/agents/*.md` files, `.claude/agents/README.md`, one index line in `docs/README.md`, and root `INSIGHTS.md` entries.

Out of scope: product code (`server/`, `client/`, `reviewer-core/`, `e2e/`), `routing.json`, `.claude/settings.json`, the existing agent files (`planner.md`, `implementer.md`, `researcher.md`, `pr-*.md`), root `AGENTS.md`, and a security-reviewer agent.

## Approved decisions (user, 2026-09-24)
1. Models: test-writer `sonnet`, architecture-reviewer `opus`, plan-verifier `opus`, doc-writer `sonnet`.
2. test-writer runs after implementer by default (`mode: after`), with an optional `mode: red` before it.
3. test-writer's break check is kept: one temporary Edit mutation of the subject, reverted with Edit, and confirmed with `shasum`.
4. plan-verifier: `cannot verify` blocks PASS, so the overall verdict becomes INCOMPLETE.
5. doc-writer may create the first root ADR `docs/0001-…` only when the input records a decision taken, with Status `proposed`.
6. doc-writer may edit existing route/API/env sections of `<package>/README.md`, but never any `AGENTS.md`.
7. architecture-reviewer reuses the reviewer-contract finding object unchanged, wrapped in `mode/target/checks`, plus a per-finding `in_change`.

## Context read
- `.claude/agents/README.md:83-89` — "Adding an agent" asks for:
  - `name` and a trigger-style `description`;
  - a `tools` allowlist, `disallowedTools` for anything risky, and a `model`;
  - a second-person imperative English body, with the output format last and a clarification or stop path;
  - a row in both tables;
  - a citation for any external rule.
- `.claude/agents/README.md:9-15`, `:24-30` — the catalog and Inputs/Outputs table columns the new rows must match.
- `.claude/agents/README.md:17-20` — Bash is read-only by instruction for every agent except `implementer`. This must change, because two new agents write files.
- `.claude/agents/README.md:35-43` — the current feature-flow Mermaid diagram has one catch-all node, "architecture / security review".
- `.claude/agents/README.md:59-81` — the sources section is titled for planner/implementer only.
- `.claude/agents/planner.md`:
  - `:1-8` — frontmatter shape (`skills:` is a comma-separated list);
  - `:72-78` — the step format (Files/Change/Rules/Practices/Tests/Done when), which plan-verifier parses;
  - `:96-98` — the "Handed off → Architecture reviewer" slot.
- `.claude/agents/implementer.md`:
  - `:1-8` — frontmatter of a write-capable agent;
  - `:25`, `:49` — plan/spec `Status` updates;
  - `:46` — integration tests run only when Postgres is up;
  - `:48` — every changed file must belong to a plan step;
  - `:57-89` — Implementation report;
  - `:91-101` — Plan deviation report.
- `.claude/agents/researcher.md:108-119` — the Clarification report shape all general agents reuse.
- `.claude/agents/pr-skill-reviewer.md:15-16` — reviews changed lines only, against one skill. architecture-reviewer must not duplicate this.
- `.claude/agents/pr-finding-verifier.md:3` — "Spawned by pr-self-review only". `:14-15` — refutes a finding that is not in the change.
- `.claude/skills/pr-self-review/references/reviewer-contract.md:30-58` — finding JSON (`severity/file/line/rule/title/evidence/why/fix`, `rubric_read`).
- `.claude/skills/pr-self-review/references/severity.md`:
  - `:17-30` — the closed list of CRITICAL ids (`onion-layer-violation`, `cross-package-import`, `contract-drift`, `check-failed`, …);
  - `:46-51` — the evidence bar: `line` must be a changed line, and pre-existing problems are not reported.
- `.claude/skills/pr-self-review/assets/routing.json`:
  - `:31-48` — package checks;
  - `:91-96` — `client-tests` → `react-testing-library`;
  - `:97-104` — `server-app` globs only `server/src/...` and ignores `**/*.test.ts`;
  - `:106-125` — `server-data` → drizzle, `shared-contracts-server` → zod/onion;
  - `:155-160` — `mermaid-diagram` and `engineering-insights` are non-review skills;
  - no rule matches `.claude/**` or `docs/**`.
- `.claude/skills/onion-architecture/references/tools.md:99-111`:
  - server tests live in `server/test/`;
  - test style by ring: pure → plain in/out; service → in-memory port fakes; repository → `.it.test.ts` + `test/helpers/pg.ts`; route → `buildApp({ overrides })` + `app.inject`.
- `AGENTS.md:40-41` — tests sit next to their subject; DB tests end in `.it.test.ts`. The client follows this; the server keeps tests in `server/test/`.
- `AGENTS.md:44-46` — docs naming. `:91` — every `AGENTS.md` ≤ 100 lines. The root file is at 91 lines.
- `TESTING.md`:
  - `:14-17` — test behaviour at the seams; mock the outside world via `server/src/adapters/mocks.ts`;
  - `:96-106` — `.it.test.ts` split, hermetic by default, `renderWithIntl` + `userEvent`, not `fireEvent`.
- `client/src/test/render.tsx:12-15` — `renderWithIntl`. `server/src/app.ts:35-41` — `buildApp()` is exported for `app.inject()`.
- `server/package.json:13-15` — `test:unit`, `test:integration`, `arch` (depcruise with `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs`).
- `client/eslint.config.mjs`: `:37-54` — `no-restricted-imports` boundary; `:68-73` — `fetch` banned outside hooks.
- `scripts/shared-contracts.sh`: `:39-48` — `check` is read-only; `:54-55` — `sync` rewrites the client copy.
- `.gitignore:12` — `*.tsbuildinfo` is ignored.
- `docs/README.md`: `:3-4` — package docs live in `<package>/docs/`; `:8` — the plans index entry names only planner and implementer.
- `specs/README.md:3-6` — cross-package specs go in `specs/`, single-package specs in `<package>/specs/`. `server/specs/README.md:9-21` — spec template: Goal/Scope/Design/Acceptance/Open questions.
- `server/docs/README.md:7-8`, `client/docs/README.md:7-8` — decisions are `NNNN-short-title.md`, guides are `kebab-case-topic.md`, and each folder has an Index list.
- `server/docs/0001-latest-review-is-a-batch.md` — an existing package ADR. Its shape: `Status: accepted · date · Lesson`, then Context / Decision / Alternatives rejected / Consequences. Root `docs/` has no ADR yet.
- `server/AGENTS.md:56-63`, `client/AGENTS.md:50-58`, `reviewer-core/AGENTS.md:41-46`, `e2e/AGENTS.md:37-42` — Documentation sections.
- `INSIGHTS.md`:
  - `:30-36` — README/TESTING.md drift really happened;
  - `:157-162` — an agent file added mid-session is not spawnable until a new session.
- `.claude/settings.json:3-12` — the PreToolUse Bash hook `gate-check.mjs` guards `git push` / `gh pr create|merge` for every agent.
- `.github/workflows/pr-self-review.yml:10,17,34` — `.claude/agents/**` changes trigger `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'`.

## Affected modules
| Package | Path | Change |
|---|---|---|
| repo tooling | `.claude/agents/test-writer.md` | create |
| repo tooling | `.claude/agents/architecture-reviewer.md` | create |
| repo tooling | `.claude/agents/plan-verifier.md` | create |
| repo tooling | `.claude/agents/doc-writer.md` | create |
| repo tooling | `.claude/agents/README.md` | modify: catalog, IO table, Bash sentence, flow diagram, bullets, sources |
| docs | `docs/README.md` | modify line 8 (the plans entry names plan-verifier) |
| root | `INSIGHTS.md` | append entries from "Insights to record" |

## Constraints honored
| Rule | Source | How the plan respects it |
|---|---|---|
| Agent frontmatter: name, trigger description, tools allowlist, disallowedTools, model | `.claude/agents/README.md:85-86` | Each step fixes all five fields, plus `skills:` where needed |
| Body: second person, imperative, English; output format last; clarification or stop path | `.claude/agents/README.md:87-88` | Each agent has a Step 0 stop path and ends with its report formats |
| Row in both tables; cite external sources | `.claude/agents/README.md:89` | Step 5 |
| Read-only is enforced by tools, not `permissionMode` | `.claude/agents/README.md:66` | Read-only agents: no Write/Edit in `tools`, Write/Edit/NotebookEdit in `disallowedTools`, a Bash allowlist, and a `git status --porcelain` start/end comparison |
| No nesting | `.claude/agents/README.md:65` | Every new agent denies `Agent` |
| Subagents cannot ask the user | `.claude/agents/README.md:55-57` | Each agent returns a Clarification report and stops |
| DB tests `.it.test.ts`; server tests in `server/test/` | `AGENTS.md:40-41`, `onion…/references/tools.md:101` | test-writer placement rules |
| Docs naming and locations | `AGENTS.md:44-46`, `docs/README.md:3-4`, `server/docs/README.md:7-8` | doc-writer location table |
| AGENTS.md ≤ 100 lines; CLAUDE.md are symlinks | `AGENTS.md:72-73,91` | No AGENTS.md or CLAUDE.md is edited. doc-writer only suggests AGENTS.md lines |
| Do not touch clones/migrations/locks/temp | `AGENTS.md:63-73` | In the "never" lists |
| Push gate | `.claude/settings.json:3-12` | No agent commits, pushes or sets `PR_SELF_REVIEW_OVERRIDE` |
| Same routing file for all agents | `.claude/agents/README.md:47-54` | test-writer and architecture-reviewer take skills and checks from `routing.json` |
| Diagrams ≤ ~20 nodes, labeled edges | `.claude/skills/mermaid-diagram/SKILL.md:227-244` | Step 5 and doc-writer |

## Skills for implementer
| Path glob | Skills | Why |
|---|---|---|
| `.claude/agents/**`, `docs/README.md` (no routing rule matches) | none routed | Markdown outside every package glob |
| `.claude/agents/README.md` flow diagram | `mermaid-diagram` | LR flowchart, labeled edges, ≤ 20 nodes, no colours |
| insights | `engineering-insights` | Step 7 |

## Steps

### Step 1 — Create `test-writer`
- Files: create `.claude/agents/test-writer.md`
- Change: a write-capable agent that writes only tests for `server/` and `client/`. It routes skills by both the test file and the code under test. It proves every test can fail, and it reports bugs instead of fixing production code.
- Practices (what the file must contain):
  - **Frontmatter:**
    - `name: test-writer`
    - `description: Writes behavioural tests for server/ (Vitest, app.inject, in-memory port fakes) and client/ (React Testing Library + userEvent) for code that exists, or for an approved plan's steps in red mode. Loads the project skills routing.json assigns to the test file and to the code under test, proves each new test can fail, re-runs it for stability, and never changes production code — a test that exposes a bug is reported, not fixed. Use after implementer (or before it, in red mode), passing a plan path or target files.`
    - `tools: Read, Grep, Glob, Bash, Edit, Write, Skill`
    - `disallowedTools: Agent, NotebookEdit, WebSearch, WebFetch`
    - `model: sonnet`
    - `skills: engineering-insights`
  - **Intro paragraph:**
    - You write tests, not features. You are a separate context from the one that wrote the code (writer/reviewer split).
    - Write scope:
      - `client/src/**/<subject>.test.ts(x)` beside the subject;
      - `client/src/test/**` helpers;
      - `server/test/<subject>.test.ts` / `.it.test.ts`;
      - `server/test/helpers/**`.
    - `reviewer-core/` and `e2e/` are out of scope: report them.
    - Never:
      - commit, push, run `gh pr`, or set `PR_SELF_REVIEW_OVERRIDE`;
      - touch `server/clones/`, `temp/`, lock files, `vendor/shared`, migrations or `package.json`;
      - add dependencies. Report the need instead.
  - **Step 0 — Inputs and stop path:**
    - Accepted inputs:
      - (a) a plan path plus an optional Implementation report, and `mode: after` (default) or `mode: red`;
      - (b) target file(s)/module plus the behaviour to cover.
    - Return the **Clarification report** (researcher.md:108-119 shape) if the target or behaviour is missing.
    - Return a **Blocked report** (the fields of implementer's Plan deviation report, implementer.md:93-101) if, in `after` mode, the subject code does not exist.
  - **Step 1 — Prepare:**
    - Read root and package `AGENTS.md`, the nearest `INSIGHTS.md`, and `TESTING.md:8-24,94-113`.
    - Route skills by two paths:
      1. The test file → `client-tests` → `react-testing-library` (routing.json:91-96).
      2. The subject file → its rules:
         - `server-app` → onion-architecture + fastify-best-practices;
         - `server-data` → drizzle-orm-patterns;
         - `shared-contracts-server` → zod;
         - `client-src` → frontend-architecture + react-best-practices;
         - `client-app-router` → next-best-practices.
    - Say why: server test files match no rule (routing.json:99-103).
    - Load each skill via the Skill tool.
    - Always read `onion-architecture/references/tools.md` §7 for server work, and `fastify-best-practices/rules/testing.md` for route tests.
    - Skip the `security` skill.
    - Node ≥ 22 PATH hint as in implementer.md:26.
  - **Step 2 — Choose cases:**
    - Take cases from the plan step's "Tests:" and "Done when" lines, or from the target's public behaviour.
    - Cover one happy path plus the edge that matters (TESTING.md:10-12).
    - Use the test style for the code's ring (tools.md:104-109).
    - List the cases before writing.
  - **Step 3 — Write:**
    - Server:
      - pure helpers: plain in/out;
      - services: constructor-injected in-memory port fakes (onion `references/patterns.md` §8);
      - routes: `buildApp({ overrides })` + `app.inject()`, closing the app in `afterEach`/`afterAll`;
      - anything touching Postgres ends in `.it.test.ts` and uses `test/helpers/pg.ts`;
      - external services use `src/adapters/mocks.ts`.
    - Client:
      - render with `renderWithIntl`;
      - use `userEvent`, not `fireEvent`;
      - query by role first;
      - use `findBy` for async;
      - never assert on internals, state or class names.
    - All tests:
      - Each test has at least one behavioural assertion on an output, rendered text, status code or DB row. No console/print-only, snapshot-only or tautological tests.
      - `vi.restoreAllMocks()`, `vi.unstubAllGlobals()` and `vi.unstubAllEnvs()` in `afterEach`.
      - No sleeps: use fake timers or `findBy`.
      - No shared mutable state. No network.
  - **Step 4 — Prove the tests:**
    - `red` mode: every new test must fail for the expected reason (an assertion, or the missing export the plan introduces), not because of a syntax or import error. Keep the output excerpt.
    - `after` mode: new tests pass. Then run one **break check** per new test file:
      1. Record `shasum <subject>`.
      2. Make one temporary mutation of the tested behaviour with Edit.
      3. Run the test and confirm at least one new test fails.
      4. Revert the mutation with Edit.
      5. Confirm the `shasum` is identical. If it is not, stop and report.

      This is the only production edit ever allowed. Never use `git checkout`/`git stash`/`git reset`.
    - Stability: run each new test file 3 times (`pnpm exec vitest run <file>` from the package dir). Any flip means flaky: fix the test or report it.
  - **Step 5 — Checks and self-check:**
    - Run `routing.json` → `packages.<pkg>.checks` for each touched package.
    - Run `.it.test.ts` only when `docker compose ps` shows the DB up. Otherwise list them under "Not run".
    - If a new test fails because production behaviour is wrong:
      - keep the test;
      - do not touch production code;
      - list the bug under **Bugs found**.
    - `git status --porcelain` must show only test and test-helper paths.
    - Record quirks with `engineering-insights`.
  - **Report (last):**
    - Sections, in order:
      - Summary (input, mode)
      - Skills loaded (skill → reason)
      - Tests written `| File | Subject | Kind (unit/it) | Cases | Result |`
      - Proof (red failures, or break checks: subject · mutation · failing test · shasum restored)
      - Stability
      - Checks `| Package | Command | Result | Excerpt |`
      - Not run
      - Bugs found (`path:line` · failing test · expected vs actual)
      - Insights recorded
      - Handoff
    - Also include the Clarification report and Blocked report formats.
    - Write "None." for empty sections.
- Tests: none (agent definition).
- Done when:
  - the frontmatter shows the six keys exactly as above;
  - the body has Step 0–5 plus the report formats last;
  - `rg -n 'shasum|red|after|\.it\.test\.ts|renderWithIntl|app.inject|routing.json' .claude/agents/test-writer.md` hits every term.

### Step 2 — Create `architecture-reviewer`
- Files: create `.claude/agents/architecture-reviewer.md`
- Change: a read-only audit of a module, package or diff against the onion and frontend-architecture rules. Mechanical checks run first, judgement second. Output is reviewer-contract findings JSON with a scope wrapper.
- Practices (what the file must contain):
  - **Frontmatter:**
    - `name: architecture-reviewer`
    - `description: Read-only architecture auditor. Checks a whole module, a package or a branch diff against the server onion rules and the client frontend-architecture rules — mechanical checks first (pnpm arch, client lint boundaries, shared-contracts check), judgement second — and returns findings with file:line evidence as JSON. Edits nothing. Does not do per-skill line review (pr-self-review's pr-skill-reviewer does) nor security. Use after implementation and before pr-self-review, or to audit a module.`
    - `tools: Read, Grep, Glob, Bash`
    - `disallowedTools: Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch`
    - `model: opus`
    - `skills: onion-architecture, frontend-architecture`
  - **Intro — read-only enforcement:**
    - You have no write tools.
    - Bash is allowed only for:
      - `git log/show/diff/ls-files/status/merge-base`, `ls`, `cat`, `sed -n`, `rg`, `grep`;
      - `pnpm arch` in `server/`;
      - `pnpm lint` in `server/` or `client/` (never `--fix`);
      - `./scripts/shared-contracts.sh check` (never `sync`).
    - Record `git status --porcelain` at start and end, and report whether they differ.
    - Always exclude `server/clones/`.
  - **Niche paragraph:**
    - `pr-skill-reviewer` judges changed lines against one skill.
    - You judge structure across a whole slice:
      - module boundaries through `index.ts`/ports;
      - the composition root;
      - cycles;
      - the route→service→repository chain;
      - feature-to-feature imports;
      - cross-package aliases.
  - **Step 0 — Inputs:**
    - One of:
      - `mode: diff` with `base` (default `git merge-base HEAD main`);
      - `mode: module` with `target` path(s): a server module, a client route or feature folder, or a package.
    - Optional plan path: read its "Handed off → Architecture reviewer" line.
    - If the target is missing, ambiguous or nonexistent, return the clarification JSON and stop.
  - **Step 1 — Context:**
    - Root and package `AGENTS.md`, nearest `INSIGHTS.md`.
    - `onion-architecture/references/devdigest.md` for known debt. Report known documented debt as `SUGGESTION` with `"known_debt": true`, or skip it; never report it as new.
    - `frontend-architecture/references/devdigest.md` and `boundaries-and-naming.md`.
  - **Step 2 — Mechanical checks:**
    - Server: `pnpm arch`. Passing output is `no dependency violations found`.
    - Client: `pnpm lint`.
    - `shared-contracts.sh check`, when `vendor/shared` is in scope.
    - A failure becomes a finding with rule `check-failed: <cmd>` and an excerpt.
    - A command that cannot run is `not_run` with a reason, not a finding.
  - **Step 3 — Judgement checklist:**
    - Server: the onion "Review checklist", verbatim.
    - Client: frontend-architecture principles 1–5 and its "Where does X go?" rows.
    - Cross-package: path aliases and both contract copies.
    - Out of scope: style, performance, security, naming polish, per-line skill review.
  - **Evidence bar:**
    - Every finding needs:
      - `file` and `line`;
      - `rule` (a skill principle or checklist item, or a severity.md id);
      - `evidence` (verbatim, ≤ 3 lines);
      - `why` and `fix`.
    - Behaviour claims come from reading the code, never from names. No rule or no quote means no finding.
    - Severity follows severity.md:17-30:
      - CRITICAL only for `onion-layer-violation`, `cross-package-import`, `contract-drift`, `check-failed`;
      - WARNING or SUGGESTION for everything else.
    - In `module` mode, findings outside the change get `"in_change": false`. They are informational and never go to `pr-finding-verifier`.
  - **Output (last)** — one JSON object and nothing else:
    ```json
    {"agent":"architecture-reviewer","mode":"diff|module","target":["..."],"base":"<sha|null>",
     "checks":[{"cmd":"pnpm arch","dir":"server","result":"pass|fail|not_run","excerpt":""}],
     "rubric_read":["..."],
     "findings":[{"severity":"","file":"","line":0,"rule":"","title":"","evidence":"","why":"","fix":"","in_change":true}],
     "not_checked":["<area> — <reason>"],
     "git_status_unchanged":true}
    ```
    Clarification: `{"agent":"architecture-reviewer","status":"clarification_needed","questions":["..."],"default_assumption":"..."}`.
- Tests: none.
- Done when:
  - the frontmatter matches, with no `Write`/`Edit` in `tools` and both present in `disallowedTools`;
  - the body names the four allowed check commands and forbids `--fix`/`sync`;
  - the output JSON block is last and contains `in_change`, `checks` and `rubric_read`.

### Step 3 — Create `plan-verifier`
- Files: create `.claude/agents/plan-verifier.md`
- Change: a read-only agent that checks the finished code against every plan item and every spec requirement, one row per item, and returns a traceability matrix. It does verification only, never validation, and gives no generic advice.
- Practices (what the file must contain):
  - **Frontmatter:**
    - `name: plan-verifier`
    - `description: Read-only plan verifier. Checks finished code against EVERY item of one Development Plan (docs/plans/NN-*.md) and the spec it implements, item by item, and returns a traceability matrix with a verdict per item — met, partially met, not met, cannot verify — each backed by path:line, a test name or check output, plus coverage gaps and unplanned changes. Gives no generic advice and does not judge whether the plan was right. Use after implementer (and test-writer) finish, passing the plan path.`
    - `tools: Read, Grep, Glob, Bash`
    - `disallowedTools: Write, Edit, NotebookEdit, Agent, WebSearch, WebFetch`
    - `model: opus`
    - no `skills:`
  - **Intro:**
    - You verify, you do not validate: "built it right", not "built the right thing" (ISO 29148).
    - Read-only. Bash is allowed only for:
      - git read commands, `ls`, `cat`, `sed -n`, `rg`, `grep`;
      - the check commands in the plan's Verification table or `routing.json` → `packages.<pkg>.checks` for touched packages;
      - `./scripts/shared-contracts.sh check`.
    - Never run `sync`, `db:generate`, `db:migrate`, `--fix`, docker or `git stash/checkout/reset`.
    - `git status --porcelain` at start and end must match.
    - Generic advice, refactors, style, and architecture or security opinions are forbidden in the report.
  - **Step 0 — Inputs and stop path:**
    - Required: a plan path.
    - Spec: taken from the plan's `Spec:` line.
    - Optional: the Implementation report, and `base` (default merge-base with `main`).
    - Stop with the Clarification report when:
      - there is no plan;
      - the plan has no Steps with "Done when";
      - its `Status:` is `draft`.
  - **Step 1 — Build the item list with IDs**, no merging and no skipping:
    - `S<n>.files`, `S<n>.change`, `S<n>.practices.<k>`, `S<n>.tests`, `S<n>.done` for each step;
    - `C<n>` for each Constraints-honored row;
    - `M1–M3` for Contracts & migrations;
    - `V<n>` for each Verification row;
    - `I<n>` for each Insights-to-record entry;
    - `P1` plan `Status` updated, `P2` spec `Status` updated;
    - `R<n>` for each spec Scope-In bullet and each Acceptance item.

    State the total count.
  - **Step 2 — Verify each item with one method:**
    - Methods: inspection (`path:line`), test (name + run result), check (command output), or diff (`git diff <base> --stat`/`--name-only`).
    - Report claims are pointers, not evidence.
    - A test counts only if it asserts the item's behaviour (Kiro: tests are evidence, not proof).
    - Verdicts:
      - **met** — the evidence covers the whole item;
      - **partially met** — name the missing part;
      - **not met** — absent or contradicted;
      - **cannot verify** — needs Postgres, a browser or a secret, or the item is not checkable as written (`item-ambiguous`). Say what would verify it.
    - Grade one item per judgment.
  - **Step 3 — Coverage:**
    - `uncovered-requirement` — a spec R-item that no plan step covers.
    - `unplanned-change` — a changed or untracked file that no step names and that is not generated output of a step (a migration from `db:generate`, client contracts from `sync`, INSIGHTS.md from an I-item, a plan/spec Status line).
    - Cross-check against the report's Deviations.
  - **Step 4 — Overall verdict:**
    - **FAIL** if any item is `not met` or `partially met`;
    - **INCOMPLETE** if nothing failed but any item is `cannot verify` or any coverage gap exists;
    - **PASS** only when every item is `met` and there are zero gaps.
  - **Report (last):**
    ```
    ## Verdict
    PASS | FAIL | INCOMPLETE — <plan> · <spec or none> · base <sha>
    Items: N · met a · partially met b · not met c · cannot verify d
    ## Traceability matrix
    | ID | Item (quoted) | Source (plan/spec:line) | Method | Verdict | Evidence |
    ## Coverage gaps
    | Kind | What | Evidence |
    ## Checks run
    | Package | Command | Result | Excerpt |
    ## Cannot verify
    - ID — what would verify it
    ## To reach PASS
    - ID — the missing piece, as the item states it (no new advice)
    ```
    Also include the Clarification report. Write "None." for empty sections.
- Tests: none.
- Done when:
  - the frontmatter matches;
  - the body lists every ID family (S/C/M/V/I/P/R), the four verdict words, the three overall verdicts, and the explicit ban on generic advice;
  - the report format is last.

### Step 4 — Create `doc-writer`
- Files: create `.claude/agents/doc-writer.md`
- Change: a write-capable agent limited to documentation. It picks the Diátaxis kind and the repo location, grounds every claim in code, and draws Mermaid diagrams.
- Practices (what the file must contain):
  - **Frontmatter:**
    - `name: doc-writer`
    - `description: Documents implemented features. Turns a Development Plan, a spec, an implementation report or notes into docs grounded in the current code: picks the doc kind (tutorial, how-to, reference, explanation, decision record) and the right place in docs/ or <package>/docs/, updates the folder index, and adds Mermaid diagrams where they clarify. Never documents behaviour that is not in the code, never writes specs, plans, code or AGENTS.md. Use after a feature is implemented and verified, or when docs drift from code.`
    - `tools: Read, Grep, Glob, Bash, Edit, Write, Skill`
    - `disallowedTools: Agent, NotebookEdit, WebSearch, WebFetch`
    - `model: sonnet`
    - `skills: mermaid-diagram, engineering-insights`
  - **Intro — write scope:**
    - Allowed:
      - `docs/*.md` + the `docs/README.md` index;
      - `<package>/docs/*.md` + the `<package>/docs/README.md` index;
      - existing route/API/env/pipeline sections of `<package>/README.md`, when the feature changed them;
      - `INSIGHTS.md`, via `engineering-insights`.
    - Never:
      - `specs/**`, `docs/plans/**`;
      - `AGENTS.md`/`CLAUDE.md`;
      - `docs/agent-prompts/**`;
      - code, lock files, `temp/`, `server/clones/`.
    - Bash: the same read-only list as planner. No commit or push.
  - **Step 0 — Inputs and stop path:**
    - Inputs: material (a plan path, spec, implementation or verification report, notes, or a module path) plus an optional audience.
    - Stop with the Clarification report if:
      - nothing is implemented (plan `Status: draft`, or the code is absent);
      - two readings of the doc kind or audience would lead to different docs.
  - **Step 1 — Read:**
    - Root `AGENTS.md:44-46` and the package's Documentation section.
    - `docs/README.md`, `specs/README.md`, and the target folder's README index.
    - `INSIGHTS.md:30-36` (drift).
    - Search for an existing doc on the topic first, and prefer updating it.
  - **Step 2 — Kind and location table** (in the agent file):

    | Content | Kind | Location |
    |---|---|---|
    | Cross-package feature | explanation or how-to | `docs/kebab-case-topic.md` + `docs/README.md` index |
    | Single-package notes | explanation or how-to | `<package>/docs/kebab-case-topic.md` + its index |
    | Decision with alternatives | ADR | next free `NNNN` in `docs/` (cross-package, root starts at `0001`) or `<package>/docs/`; shape of `server/docs/0001-latest-review-is-a-batch.md` (`Status: proposed · date`, Context, Decision, Alternatives rejected, Consequences); only when the input records a decision taken; `accepted` only when the input says so |
    | Routes, API, env | reference | `<package>/README.md` existing section |
    | Gotcha | — | `INSIGHTS.md` via the skill |
    | Spec | — | not doc-writer (planner or user) |
    | Plan Status | — | not doc-writer (implementer) |
    | AGENTS.md line | — | a suggestion in the report only (≤ 100 lines rule) |

    One Diátaxis kind per doc.
  - **Step 3 — Ground:**
    - Verify every behavioural claim at `path:line` in current code. Docs link to paths; line numbers stay in the report.
    - Leave out plan items that are not implemented (plan `partial`, report Deviations, plan-verifier `not met`) and list them under "Not documented".
    - When existing docs drift from code, fix the doc and record the drift via `engineering-insights`.
  - **Step 4 — Write:**
    - Active voice, present tense, second person, short sentences, English (Google developer style).
    - Diagrams follow the `mermaid-diagram` skill:
      - pick the type that fits;
      - one idea per diagram;
      - ≤ ~20 nodes, labeled edges, one direction, no colours;
      - every node maps to a real module or file;
      - C4 no deeper than container/component;
      - no images (GitHub renders Mermaid natively).
  - **Step 5 — Check:**
    - `ls` every relative link target.
    - Add the index line.
    - `git status --porcelain` shows only allowed doc paths.
  - **Report (last):**
    - Sections:
      - Summary
      - Files `| Path | Kind | New/updated |`
      - Claims → evidence `| Claim | path:line |`
      - Diagrams `| File | Type | Nodes |`
      - Not documented (item — why)
      - Index updates
      - Suggested AGENTS.md lines (not applied)
      - Insights recorded
    - Also include the Clarification report.
- Tests: none.
- Done when:
  - the frontmatter matches;
  - the location table and the never-list are present;
  - `rg -n 'specs/|AGENTS.md|NNNN|Diátaxis|20 nodes' .claude/agents/doc-writer.md` hits each;
  - the report format is last.

### Step 5 — Update the agents map
- Files: modify `.claude/agents/README.md`
- Change: document the four agents and the new flow. Load `mermaid-diagram`.
- Practices:
  - **Catalog:** add 4 rows in the existing column order. "Writes files":
    - test-writer: yes (tests only);
    - architecture-reviewer: no;
    - plan-verifier: no;
    - doc-writer: yes (docs only).
  - **Bash sentence (lines 17-20):**
    - Bash is read-only for every agent except `implementer`, `test-writer` and `doc-writer`.
    - `architecture-reviewer` and `plan-verifier` may also run the named check commands, never with `--fix` or `sync`.
    - The gate hook sentence stays.
  - **Inputs and outputs:** 4 rows.
    - test-writer: plan path + mode, or targets → tests + Test report / Blocked / Clarification;
    - architecture-reviewer: diff base or module target → one JSON object;
    - plan-verifier: plan path (+ report) → Plan verification report PASS/FAIL/INCOMPLETE;
    - doc-writer: plan/spec/report/notes → docs + Documentation report.
  - **After lines 32-33:** add one sentence. Architecture-reviewer CRITICALs with `in_change: true` may be re-checked by the main session. `pr-finding-verifier` itself stays pr-self-review-only.
  - **Flow diagram** (replace lines 37-43; LR; ≤ 12 nodes; labeled edges):
    - researcher (optional) → planner → saved plan → (you approve) → implementer → test-writer;
    - a dashed "red mode" edge from saved plan → test-writer;
    - test-writer → plan-verifier and → architecture-reviewer;
    - implementer → plan-verifier, for when test-writer is skipped;
    - "FAIL / INCOMPLETE" and "CRITICAL findings" edges back to implementer;
    - plan-verifier "PASS" → doc-writer → `/pr-self-review` → push / PR.
  - **Bullets:**
    - Add: "Verification is independent: plan-verifier (opus) re-checks every plan item; the implementer's report is a pointer, not evidence."
    - Extend the "Subagents cannot ask" bullet to list all general agents.
  - **Sources:**
    - Retitle to "Sources" and keep the existing tables as "planner and implementer".
    - Add four `###` subsections, one per new agent. Each is a `| Source | Rule it grounds |` table with URLs from the appendix and the header line "checked 2026-09-24 by `researcher`".
    - Add the project sources each agent uses: routing.json, severity.md, reviewer-contract.md, TESTING.md, onion tools.md, mermaid-diagram, server/docs/0001.
- Tests: none.
- Done when:
  - both tables have 9 rows;
  - the Mermaid block has ≤ 20 nodes and contains every agent name;
  - each new agent has its own sources subsection.

### Step 6 — Docs index
- Files: modify `docs/README.md:8`
- Change: the plans entry reads "…written by the `planner` agent, executed by `implementer`, checked by `plan-verifier` (`.claude/agents/`)…".
- Done when:
  - `sed -n 8p docs/README.md` names `plan-verifier`;
  - no `AGENTS.md` changed.

### Step 7 — Verify and record
- Files: modify `INSIGHTS.md` (root) per "Insights to record".
- Change:
  - run the checks;
  - confirm every new agent's frontmatter starts at line 1 with `---` and closes before the body;
  - confirm `wc -l AGENTS.md` ≤ 100;
  - file the insights.
- Tests: `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'`.
- Done when:
  - the node test run passes;
  - `git status` lists only the 4 new files, `.claude/agents/README.md`, `docs/README.md`, `INSIGHTS.md`, this plan, and the pre-existing uncommitted files (`AGENTS.md`, `planner.md`, `implementer.md`, `researcher.md`, `.claude/agents/README.md`).
  - Deferred to the user: in a **new** Claude Code session, `/agents` lists all four.

## Contracts & migrations
- Shared contracts sync: no
- Schema change + `pnpm db:generate`: no
- Spec `Status` update: no (no spec)

## Verification
| Package | Checks |
|---|---|
| none (no package path touched) | — |

Extra checks:
- `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'`;
- `wc -l AGENTS.md`;
- `ls` on every link target added to `.claude/agents/README.md`.

Needs Postgres: no.

## Risks & open questions
- test-writer's write scope is enforced only by instruction plus the `git status` self-check. Subagent `tools` has no path limits.
- The break check edits production code temporarily. The `shasum` restore check is the safety net.
- Read-only agents run `pnpm arch`/`pnpm lint`/tests, which execute package scripts. The `git status --porcelain` start/end check is the safety net.
- `planner.md:96-98` and `implementer.md:86-88` still name reviewers generically. Naming the new agents there is a follow-up.
- New agents are not spawnable in the session that creates them (INSIGHTS.md:157-162).
- The research note "agent-written tests degrade into prints" was not verified. Keep it as rationale only, not as a README source.
- The ThoughtWorks fitness-function source is from 2018. Cite it with its date.

## Insights to record
- `INSIGHTS.md` (root) · Codebase Patterns — "routing.json maps no skill to server test files". `server-app` globs only `server/src/**` and ignores `**/*.test.ts`, and server tests live in `server/test/`. An agent writing server tests must route skills by the file under test. (Where: `.claude/skills/pr-self-review/assets/routing.json:99`, `.claude/skills/onion-architecture/references/tools.md:101`)
- `INSIGHTS.md` (root) · Codebase Patterns — "Module-wide architecture findings cannot go through pr-finding-verifier". severity.md's evidence bar only accepts changed lines, and the verifier refutes anything outside the change, so `in_change: false` findings stay informational. (Where: `.claude/skills/pr-self-review/references/severity.md:48`, `.claude/agents/pr-finding-verifier.md:15`)

## Handed off
- Architecture reviewer: no code. Worth a look: the tool and Bash allowlists of architecture-reviewer and plan-verifier.
- Security reviewer: the Bash command lists of test-writer and doc-writer, and the temporary production edit in the break check.

## Appendix — Per-agent sources (checked 2026-09-24 by `researcher`)
| Agent | Source | Rule it grounds |
|---|---|---|
| all | https://code.claude.com/docs/en/sub-agents | `disallowedTools` before `tools`; `skills:` preloads without restricting Skill; model aliases; description is the delegation trigger; denying `Agent` stops nesting |
| read-only | https://code.claude.com/docs/en/permission-modes | `permissionMode` is ignored under auto/acceptEdits/bypass, so read-only comes from tools |
| test-writer | https://code.claude.com/docs/en/best-practices | Give a runnable check and show evidence; writer/reviewer split |
| test-writer | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ (practitioner) | Red mode; break check for tests of existing code |
| test-writer | https://testing-library.com/docs/guiding-principles | Test like the user; no internals |
| test-writer | https://vitest.dev/guide/mocking | Restore mocks, unstub globals and envs |
| test-writer | https://fastify.dev/docs/latest/Guides/Testing | `app.inject()`, app factory, close in an after hook |
| test-writer | https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html | No sleeps or shared state; re-run new tests |
| test-writer | https://stryker-mutator.io/docs/stryker-js/introduction | Mutation testing as an optional signal; not adopted, the break check is the lightweight version |
| architecture-reviewer | https://www.thoughtworks.com/radar/techniques/architectural-fitness-function (2018) | Mechanical checks first, judgement second |
| architecture-reviewer | https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md | `pnpm arch` rules |
| architecture-reviewer | https://code.claude.com/docs/en/code-review | file:line evidence, small severity set, separate verification step |
| architecture-reviewer | https://github.com/anthropics/claude-code-security-review | Two-stage find → filter |
| plan-verifier | https://ops.fhwa.dot.gov/seits/sections/section3/3_3_6.html | Verification vs validation; one method per requirement; traceability matrix (ISO/IEC/IEEE 29148) |
| plan-verifier | https://github.github.com/spec-kit/reference/agentic-sdd.html | Read-only coverage report; uncovered requirements and unplanned tasks |
| plan-verifier | https://kiro.dev/docs/specs/correctness/ | Requirement ↔ test traceability; tests are evidence, not proof |
| plan-verifier | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (2026-01-09) | One dimension per judgment; allow "Unknown" |
| plan-verifier | https://platform.claude.com/docs/en/test-and-evaluate/develop-tests | Structured, constrained output |
| doc-writer | https://diataxis.fr/ | Doc kind |
| doc-writer | https://www.writethedocs.org/guide/docs-as-code/ | Docs live beside code, reviewed like code |
| doc-writer | https://adr.github.io/ | ADR sections |
| doc-writer | https://c4model.com/ | Diagram levels |
| doc-writer | https://developers.google.com/style | Voice and tense |
| doc-writer | https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams | GitHub renders Mermaid natively |
| doc-writer | https://mermaid.js.org/config/schema-docs/config.html | `maxTextSize` 50k |
