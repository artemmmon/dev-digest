# spec-authoring

Rules for a DevDigest feature specification in Spec Driven Development: what a spec contains, how
each requirement is worded (user stories, EARS acceptance criteria, edge cases), the ids that
plans and verification trace to, provenance tags for inputs, required handling for untrusted
inputs, and the `draft → approved → implemented` lifecycle. The `spec-creator` agent holds the
process (two passes, reports); this skill holds the rules, so the planner, the verifier and a
human reviewer read the same ones. Choosing a solution and planning the work are out of scope.

- **Version:** 1.1.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-10-04
- **Related skills:** `security` (trust boundaries behind Untrusted inputs), `mermaid-diagram`
  (workflow diagrams), `engineering-insights`, `pr-self-review`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-04 | First version. Template and section rules moved out of `.claude/agents/spec-creator.md` unchanged; added `references/ears.md` (pattern choice, bad → good pairs), `references/design-gaps.md`, `references/devdigest.md`, a worked example, `assets/check-spec.mjs` with tests, 3 evals. After the first eval run: an undecided edge case is an open question, never an `EC` line |
| 1.0.1 | 2026-10-04 | `devdigest.md`: read only the `INSIGHTS.md` files of the touched modules and packages; `spec-creator` may delegate questions to `researcher` agents |
| 1.1.0 | 2026-10-04 | Lifecycle: an approved spec can be amended (reopened as a draft, `Amended:` header line, new ids only, approved again) instead of superseded; the guard hook allows only that reopening edit. Nothing is planned or built from a draft: `brainstorm`, `implementation-planner` and the plan check stop on one. `devdigest.md`: `test-writer` writes one test per `AC-n`/`EC-n` with the id in its name |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule,
reference or check, **major** when a rule is reversed. Add a changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one rule, 8 principles, the ten sections and their item formats, EARS patterns, provenance tags, lifecycle, the writing checklist, the check |
| [references/ears.md](references/ears.md) | Which pattern fits; bad → good criteria; wording rules; from edge case to criterion; user stories |
| [references/design-gaps.md](references/design-gaps.md) | What to look for in a design before writing: states, extremes, edge cases, module interactions, UX, inputs; what each gap becomes |
| [references/devdigest.md](references/devdigest.md) | Spec folders, numbering and naming, the legacy template, who touches a spec, sources, provenance and untrusted inputs in this product, open questions |
| [references/example-spec.md](references/example-spec.md) | A finished spec (Run Cost Badge retold); also the fixture of the check's tests |
| [assets/spec-template.md](assets/spec-template.md) | The one copy of the template |
| [assets/check-spec.mjs](assets/check-spec.mjs) | Runnable form check; `--hook` mode for `spec-creator`'s PostToolUse hook |
| [assets/tests/check-spec.test.mjs](assets/tests/check-spec.test.mjs) | `node --test` suite for the check; runs in the `pr-self-review` workflow |
| [evals/evals.json](evals/evals.json) | 3 evaluation scenarios with expected behaviour |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **EA** ears · **DD** devdigest · **RM** this README only.

### Q1. How is a requirement worded?

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S1 | EARS — Easy Approach to Requirements Syntax | Alistair Mavin | https://alistairmavin.com/ears/ | Five patterns (ubiquitous, state-driven `While`, event-driven `When`, optional feature `Where`, unwanted behaviour `If … then`) plus complex combinations; clauses always in the same order; zero or many preconditions, zero or one trigger, one system name, one or many responses | living page | SK EA |
| S4 | INVEST in Good Stories, and SMART Tasks | Bill Wake | https://xp123.com/invest-in-good-stories-and-smart-tasks/ | A story is Independent, Negotiable, Valuable, Estimable, Small, Testable — "I understand what I want well enough that I could write a test for it" | 2003-08-17 | SK EA |

### Q2. What does a spec contain, and what stays out?

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S2 | Feature specs | Kiro | https://kiro.dev/docs/specs/feature-specs/ | Requirements as user stories with EARS acceptance criteria (`WHEN [condition/event] THE SYSTEM SHALL [expected behavior]`); each requirement "can be directly translated into test cases" and "tracked through implementation"; requirements-first vs design-first | living doc | SK |
| S3 | spec-template.md | GitHub spec-kit | https://github.com/github/spec-kit/blob/main/templates/spec-template.md | Prioritised user stories, a dedicated Edge Cases block, requirement ids (`FR-001`), `[NEEDS CLARIFICATION: …]` for what is not specified, measurable success criteria, entities described "without implementation" | `main`, fetched 2026-10-04 | SK DD |
| S5 | Specs | Kiro | https://kiro.dev/docs/specs/ | Three phases — requirements, design, tasks — in separate files | living doc | RM |

### Project sources

| Source | Rule it grounds |
|---|---|
| `.claude/agents/spec-creator.md` (before 2026-10-04) | The template, the section rules and the provenance tags, moved here unchanged |
| [security skill](../security/SKILL.md) | "Where attacker-controlled data enters DevDigest" — the list behind Untrusted inputs |
| [agents README](../../agents/README.md) | Who reads the spec next; the spec says what, the plan says how |
| `specs/README.md`, `server/specs/README.md` | Folders, the index format, the legacy template and its statuses |
| `docs/agent-workflow-cost.md` | Why a model call is the cost a spec should look at first |

## Conflicts and decisions

| Topic | Positions | Skill's rule |
|---|---|---|
| Responses per requirement | EARS allows "one or many system responses" (S1) | One response per criterion: one criterion is one test and one verifier verdict |
| Keyword case | EARS writes `While`, `When`, `If … then` (S1); Kiro writes them in capitals (S2) | Capitals, so the clauses stand out in a line of prose and the check can tell a keyword from a word |
| Design in the spec | Kiro and spec-kit keep design in a separate file (S5, S3) | Same split, across agents: the spec stops at module boundaries; `brainstorm` and the plan own the design. Boundary contracts and workflow diagrams are allowed, because both later agents need them |
| Unknowns | spec-kit marks them inline with `[NEEDS CLARIFICATION]` (S3) | A numbered open question with a default, so an unanswered question still yields a reviewable assumption |
| Acceptance format | spec-kit uses Given/When/Then scenarios (S3); Kiro uses EARS (S2) | EARS only: one notation, checkable mechanically |
| Story priority | spec-kit ranks stories P1, P2, P3 (S3) | Not adopted yet — open question 2 in `devdigest.md` |

## Notes on verification

- S1–S5 were fetched on 2026-10-04 through a summarising fetch, not read raw; quotes above are as
  that summary returned them.
- The Kiro overview page (S5) says only "structured notation"; the EARS format is on the feature
  specs page (S2).
- ISO/IEC/IEEE 29148 (characteristics of a good requirement) is behind a paywall and was not
  consulted; nothing here cites it.
- No external source grounds the provenance tags or the design-gap checklist: both are this
  project's own rules, taken from the agent file.

## Evaluation log

| Date | Eval | Result | Changes |
|---|---|---|---|
| 2026-10-04 | vague-brief-to-ears | Pass (sonnet, fresh instance, read the skill files by path): 4 stories, 10 criteria each with one pattern and one `shall`; `IF … THEN` for GitHub, `WHILE` for the re-run; "quick" became `within 1 s` marked as awaiting an open question; no code names | It wrote four edge cases as `EC-n: … → not decided (OQ-n)`, which the check rejects. Rule made explicit in `SKILL.md` and `ears.md`: an undecided case is an open question, never an `EC` line |
| 2026-10-04 | review-flawed-spec | Pass: flagged every seeded fault (story without benefit or criterion, lowercase keyword, two responses, component and hook names, `should`, criterion without a story, "fast", edge case without a criterion, invalid tag, `new` without a reason); also caught the unsourced "update the URL" and the missing Untrusted inputs | — |
| 2026-10-04 | what-not-how-and-placement | Pass: `client/specs/10-copy-as-markdown.md`, `SPEC-10`, full header as `draft`, all three inputs `[reused: …]`, rationale and title as untrusted model output with a requirement-level handling, refused `navigator.clipboard` and `FindingCard.tsx` | — |
