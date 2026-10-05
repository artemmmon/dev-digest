# Agent sources

Where the rules of each subagent in [.claude/agents/](../.claude/agents/README.md) come from:
official documentation, practitioner articles and this repo's own files, with the date each set
was checked. The agents' contracts are their own files; this page only grounds them.

### spec-creator

Checked 2026-10-04 (URLs fetched in the main session). The full source tables are in the
[spec-authoring README](../.claude/skills/spec-authoring/README.md).

| Source | Rule it grounds |
|---|---|
| [EARS](https://alistairmavin.com/ears/) (Alistair Mavin) | The five patterns, their keywords and the fixed clause order; zero or one trigger per requirement |
| [Kiro feature specs](https://kiro.dev/docs/specs/feature-specs/) | Requirements first: user stories with EARS acceptance criteria, each one translatable into a test case and traceable through implementation |
| [spec-kit spec template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) | Edge cases as their own section; requirement ids; an explicit marker for what is unclear instead of a guess; no implementation detail in a spec |
| [INVEST](https://xp123.com/invest-in-good-stories-and-smart-tasks/) (Bill Wake, 2003) | A user story is valuable and testable |
| [Hooks reference](https://code.claude.com/docs/en/hooks) | Hooks in subagent frontmatter; matcher `*` matches every tool; `PreToolUse` exit 2 blocks the call |
| [security skill](../.claude/skills/security/SKILL.md) | The trust-boundary table behind the spec's Untrusted inputs section |
| [mermaid-diagram](../.claude/skills/mermaid-diagram/SKILL.md) | Diagram rules for Workflow and module interactions, loaded on demand |

### feature flow (order of the agents)

The order, the gates and the test split are the [feature-flow](../.claude/skills/feature-flow/SKILL.md)
skill; its sources are in the [skill's README](../.claude/skills/feature-flow/README.md).

### implementation-planner and implementer

Official Claude Code and Anthropic sources (checked 2026-09-24 by `researcher`):

| Source | Rule it grounds |
|---|---|
| [Subagents](https://code.claude.com/docs/en/sub-agents) | `tools` allowlist vs `disallowedTools`. `skills:` preloads full skill text and does not limit the Skill tool. `AskUserQuestion` is filtered for subagents. Denying `Agent` stops nesting. Short, trigger-style `description` |
| [Permission modes](https://code.claude.com/docs/en/permission-modes) | In `auto`, `acceptEdits` and `bypassPermissions` sessions, a subagent's `permissionMode` is ignored, so planner's read-only rule is enforced by leaving `Write`/`Edit` out of its tools, not by `permissionMode: plan` |
| [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Loading skills on demand (progressive disclosure) instead of preloading all of them: planner preloads the two architecture skills plus `engineering-insights`, and loads the other routed skills through the Skill tool |
| [When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) (2026-01-23) | Warns that splitting agents by role (planner → implementer) loses context at each handoff; hence the self-contained plan, the Plan deviation stop, and review as a separate verification step |
| [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09-29) | Exploration runs in an isolated context and returns a condensed result; planner returns only the plan |

Project sources:

| Source | Rule it grounds |
|---|---|
| [AGENTS.md](../AGENTS.md) | Naming, cross-package rules (shared contracts sync, migrations only via `db:generate`), "Do not touch", spec `Status` updates |
| Per-package `AGENTS.md` and `INSIGHTS.md` | Read before planning or coding a module |
| [onion-architecture](../.claude/skills/onion-architecture/SKILL.md) · [frontend-architecture](../.claude/skills/frontend-architecture/SKILL.md) | Where server and client code lives, and which way imports point |
| [routing.json](../.claude/skills/pr-self-review/assets/routing.json) | Path → skills; package → checks (`typecheck`, `lint`, tests, `pnpm arch`), `extraChecks` |
| [engineering-insights](../.claude/skills/engineering-insights/SKILL.md) | How implementer records non-obvious findings |
| [TESTING.md](../TESTING.md) | Unit tests vs `.it.test.ts` tests that need Postgres |
| [pr-self-review gate](../.claude/skills/pr-self-review/SKILL.md) | No push, PR or merge without a PASS verdict; never set `PR_SELF_REVIEW_OVERRIDE` |

### test-writer

Checked 2026-09-24 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [Claude Code best practices](https://code.claude.com/docs/en/best-practices) | Give a runnable check and show evidence; writer/reviewer split |
| [Red/green TDD for coding agents](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/) (practitioner) | Red mode; break check proves a test of existing code can fail |
| [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles) | Test like the user; no internals |
| [Vitest mocking guide](https://vitest.dev/guide/mocking) | Restore mocks, unstub globals and envs after each test |
| [Fastify testing guide](https://fastify.dev/docs/latest/Guides/Testing) | `app.inject()`, an app factory, closing the app in an after hook |
| [Flaky tests at Google](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) | No sleeps or shared state; re-run new tests for stability |
| [Stryker mutation testing](https://stryker-mutator.io/docs/stryker-js/introduction) | Mutation testing as a signal; not adopted here — the break check is the lightweight version |
| [routing.json](../.claude/skills/pr-self-review/assets/routing.json) | `server-app`'s glob ignores `**/*.test.ts`, so skills route by the file under test |
| [TESTING.md](../TESTING.md) | Behaviour at the seams; `.it.test.ts` split; `renderWithIntl` + `userEvent` |
| [onion-architecture tools.md](../.claude/skills/onion-architecture/references/tools.md) | Test style by ring: pure / service fakes / `.it.test.ts` / route + `app.inject` |

### architecture-reviewer

Checked 2026-09-24 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [Architectural fitness function](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function) (2018) | Mechanical checks first, judgement second |
| [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | What `pnpm arch` actually checks |
| [Claude Code code review guide](https://code.claude.com/docs/en/code-review) | `file:line` evidence, a small severity set, verification as a separate step |
| [claude-code-security-review](https://github.com/anthropics/claude-code-security-review) | Two-stage find → filter pattern (mirrored by `pr-finding-verifier`, not this agent) |
| [reviewer-contract.md](../.claude/skills/pr-self-review/references/reviewer-contract.md) | Finding JSON shape, reused unchanged and wrapped in `mode`/`target`/`checks` |
| [severity.md](../.claude/skills/pr-self-review/references/severity.md) | CRITICAL is a closed list (`onion-layer-violation`, `cross-package-import`, `contract-drift`, `check-failed`) |

### implementation-verifier

Checked 2026-09-24 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [FHWA systems engineering guide §3.3.6](https://ops.fhwa.dot.gov/seits/sections/section3/3_3_6.html) | Verification vs validation; one method per requirement; traceability matrix (ISO/IEC/IEEE 29148) |
| [spec-kit agentic SDD reference](https://github.github.com/spec-kit/reference/agentic-sdd.html) | Read-only coverage report; uncovered requirements and unplanned changes |
| [Kiro specs correctness](https://kiro.dev/docs/specs/correctness/) | Requirement ↔ test traceability; tests are evidence, not proof |
| [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (2026-01-09) | One dimension per judgment; allow "cannot verify" instead of guessing |
| [Developing tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) | Structured, constrained report output |

### doc-writer

Checked 2026-09-24 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [Diátaxis](https://diataxis.fr/) | One doc kind per document: tutorial, how-to, reference, explanation |
| [Docs as code](https://www.writethedocs.org/guide/docs-as-code/) | Docs live beside code, in the same repo, reviewed like code |
| [ADR GitHub](https://adr.github.io/) | ADR sections: Status, Context, Decision, Alternatives rejected, Consequences |
| [C4 model](https://c4model.com/) | Diagram levels; no deeper than container/component here |
| [Google developer documentation style guide](https://developers.google.com/style) | Active voice, present tense, second person |
| [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) | GitHub renders Mermaid natively; no diagram images |
| [Mermaid config schema](https://mermaid.js.org/config/schema-docs/config.html) | `maxTextSize` and other renderer limits |
| [server/docs/0001-latest-review-is-a-batch.md](../server/docs/0001-latest-review-is-a-batch.md) | The ADR shape doc-writer follows |
| [mermaid-diagram](../.claude/skills/mermaid-diagram/SKILL.md) | Diagram type choice, ≤ ~20 nodes, labeled edges, one direction, no colours |

### brainstorm

Checked 2026-09-28 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [Subagents](https://code.claude.com/docs/en/sub-agents) | `model` accepts a full ID like `claude-opus-5-5`; `skills:` preloads full content; nesting up to 3 layers, denying `Agent` stops it |
| [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19) | Generate several candidates, then select: "Parallelization — voting"; "Best-of-N" is this repo's name for it |
| [NASA SE Handbook §6.8 Decision Analysis](https://www.nasa.gov/reference/6-8-decision-analysis/) | Measurable, differentiating criteria; weights set before scoring; sensitivity analysis |
| [Decision-matrix method](https://en.wikipedia.org/wiki/Decision-matrix_method) (community) | Corroborates weighted scoring and the sensitivity study |
| [Claude Code best practices](https://code.claude.com/docs/en/best-practices) | Explore, then plan, then code: an options step before planning |
| [agent-workflow-cost.md](agent-workflow-cost.md) | Cost is context × calls per agent; N option-agents re-reading one context ≈ N× tokens (inferred), hence one agent |

### security-reviewer

Checked 2026-09-28 by `researcher`:

| Source | Rule it grounds |
|---|---|
| [claude-code-security-review](https://github.com/anthropics/claude-code-security-review) | Find → filter pipeline; excludes DoS, rate limiting, resource exhaustion, unproven generic validation, open redirect |
| [prompts.py](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/prompts.py) | Trace user input to sensitive operations; report only high confidence. Its HIGH/MEDIUM/LOW tiers are mapped to our severity.md labels |
| [findings_filter.py](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/findings_filter.py) | Concrete exclusion patterns; confidence-gated keep step |
| [OWASP Top 10:2025](https://top10.owasp.org/2025) | `owasp` field A01–A10 (SSRF folded into A01; A10 Mishandling of Exceptional Conditions) |
| [OWASP Top 10 for LLM Apps 2025](https://genai.owasp.org/llm-top-10/) (2025-03-12) | LLM01 Prompt Injection …: DevDigest builds prompts from PR content |
| [Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) | Untrusted PR/diff content is never instruction text |
| [severity.md](../.claude/skills/pr-self-review/references/severity.md) | CRITICAL only as `security-vuln` with a concrete exploit path |
| [security skill](../.claude/skills/security/SKILL.md) | Confidence method, "Do NOT flag"; its own severity table is not used |
