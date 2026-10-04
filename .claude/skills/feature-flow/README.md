# feature-flow

The route a DevDigest feature takes through the subagents, written for the main session that
coordinates it: which agent runs when, what it is handed, which stages run in parallel, the two
approvals the user owns, the bounded fix loop and the spec amendment path. Each agent's own rules
stay in `.claude/agents/<name>.md`; what a spec says stays in `spec-authoring`.

- **Version:** 1.2.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-10-04 (see "Notes on verification")
- **Related skills:** `spec-authoring` (the spec and its ids), `pr-self-review` (the gate at the
  end; its `routing.json` and check scripts are reused), `engineering-insights`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-04 | First version, from an audit of the flow. New order: `test-writer` ∥ `architecture-reviewer` ∥ correctness reviewer right after the build, one fix pass, `implementation-verifier` as the last gate with `recheck:`. `implementer` writes no new tests in multi-agent mode; `test-writer` writes one per spec id. Plan `Status: approved`; spec must be approved before brainstorm and planning. Planner and brainstorm write their own files behind `plans-guard.mjs`. `assets/check-plan.mjs` (form, spec coverage, `--implemented`) with tests, 3 evals |
| 1.1.0 | 2026-10-04 | Stage 6 is a review loop: architecture WARNINGs on changed lines are fixed too, `architecture-reviewer` rechecks after each fix (`recheck:`, finding ids), up to 3 rounds. The `/sdd` command (`sdd` skill) is the user's entry |
| 1.2.0 | 2026-10-04 | The user's token-saving choices: new tests are off by default (`test-writer` runs only with `/sdd --tests` or by name; the verifier gets `tests: off`); `architecture-reviewer` and `security-reviewer` run on sonnet. One agent on request: `spec-creator` or `implementation-planner` alone, no next stage |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule,
reference or check, **major** when the order of the stages or a gate changes. Add a changelog row
each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one rule, 8 principles, the stage table, the two-session checklist, what to do when a report comes back wrong, the check |
| [references/handoffs.md](references/handoffs.md) | The prompt of every agent call, the correctness reviewer's fields, how stage-5 findings merge, rounds, the closing report |
| [references/devdigest.md](references/devdigest.md) | Which stage a feature is in, statuses and who writes them, the pre-flight, the handoff note, the check commands, known gaps |
| [assets/check-plan.mjs](assets/check-plan.mjs) | Plan check: form, spec-id coverage, spec approved; `--implemented` for the verifier's mechanical items; `--hook` for the planner's PostToolUse hook |
| [assets/tests/check-plan.test.mjs](assets/tests/check-plan.test.mjs) | `node --test` suite for the check; runs in the `pr-self-review` workflow |
| [evals/evals.json](evals/evals.json) | 3 evaluation scenarios with expected behaviour |

## Sources

`[Sn]` in the skill files refers to the numbers below.

### Q1. How should work be split between agents?

| # | Title | Author | URL | Key recommendation | Date / version |
|---|---|---|---|---|---|
| S1 | When to use multi-agent systems | Anthropic | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them | Splitting agents by role loses context at each handoff; make the handed-over artifact self-contained and verify in a separate step | 2026-01-23 |
| S2 | Effective context engineering for AI agents | Anthropic | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | Exploration runs in an isolated context and returns a condensed result | 2025-09-29 |
| S7 | Claude Code best practices | Anthropic | https://code.claude.com/docs/en/best-practices | Writer/reviewer split: a fresh context reviews or tests what another wrote; give a runnable check | living doc |

### Q2. How do requirements stay traceable?

| # | Title | Author | URL | Key recommendation | Date / version |
|---|---|---|---|---|---|
| S5 | Feature specs · Correctness | Kiro | https://kiro.dev/docs/specs/feature-specs/ · https://kiro.dev/docs/specs/correctness/ | Each requirement translates into a test case and is tracked through implementation; tests are evidence, not proof | living doc |
| S6 | Agentic SDD reference | GitHub spec-kit | https://github.github.com/spec-kit/reference/agentic-sdd.html | A read-only coverage report between the artifacts: uncovered requirements, unplanned changes — before implementation, not only after | living doc |

### Project sources

| # | Source | Rule it grounds |
|---|---|---|
| S4 | `docs/agent-workflow-cost.md` | Cost is context length × calls; one implementer per group; no artifact copied into the main session; fresh session after a break |
| — | `.claude/agents/*.md` | The contract of every agent this skill routes to |
| — | `.claude/skills/pr-self-review/` | `routing.json`, `run-checks.mjs`, the reviewer contract and severity rubric reused by the correctness review |
| — | Audit of 2026-10-04 (this conversation's findings, recorded in root `INSIGHTS.md`) | The order of stages 5–7, the test split, the status gates |

## Conflicts and decisions

| Topic | Positions | Skill's rule |
|---|---|---|
| Verifier before or after the tests | Earlier catches missing work sooner; later verifies the final tree | After the fixes: its test items need `test-writer`'s tests, and a PASS before a fix is void. A missing criterion is caught earlier anyway — by `check-plan.mjs` at planning and by a failing `AC-n` test |
| Who writes tests | The implementer (tight loop) vs a separate agent (independent reading) vs nobody | Nobody by default, for now (the user's choice, to save tokens). With tests on: `test-writer` in multi-agent mode; the implementer in single-agent mode, where there is no second agent |
| Models | Opus for judgement vs sonnet for cost | Sonnet for `brainstorm`, `architecture-reviewer` and `security-reviewer` (the user's choice; `brainstorm` stays a required stage); `/pr-self-review` still verifies every CRITICAL on opus |
| Architecture and security reviewed twice | Agents after the build; per-skill reviewers at `/pr-self-review` | Kept: the first finds problems while a fix is cheap, the second is the push gate |
| Skills in the implementer | Load every routed skill (same rubric as the review) vs follow the plan | Follow the plan's `Practices`; `load:` marks the exceptions. The planner (opus) reads the skills once |

## Notes on verification

- S1, S2, S5, S6 and S7 are the sources already listed for the agents in
  `docs/agent-sources.md`, checked there on 2026-09-24 and 2026-10-04. They were **not fetched
  again** for this skill; the rules they ground are unchanged.
- The cost claims come from one measured run (Intent Layer). The effect of the new order and of
  the test split is an estimate until a feature is built with them and measured.

## Evaluation log

| Date | Version | Result |
|---|---|---|
| 2026-10-04 | 1.0.0 | Not run yet. `check-plan.mjs`: 9 script tests pass |
