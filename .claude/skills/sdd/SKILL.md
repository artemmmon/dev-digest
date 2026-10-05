---
name: sdd
description: The /sdd command — starts or continues one DevDigest feature in Spec Driven Development from whatever the user hands over (a spec path, a plan path, Figma links or design files, a free-text requirements prompt, in any mix), works out which stage the feature is in, and drives it through the feature-flow route up to the pre-PR review, including the architecture review loop that fixes CRITICAL and WARNING findings and re-reviews up to three times. Run by the user as /sdd; Claude does not start it on its own (for that, the feature-flow skill applies). Not for a one-file change, for reviewing a branch (pr-self-review) or for writing a spec by hand (spec-authoring).
argument-hint: "[spec.md | plan.md] [design paths | Figma links] [\"requirements text\"] [--only spec|plan] [--tests] [--mode multi|single] [--from <stage>] [--until <stage>]"
disable-model-invocation: true
metadata:
  version: "1.1.0"
---

# /sdd — run a feature spec-first

This command is the entry; the route is the [feature-flow](../feature-flow/SKILL.md) skill.
**Load `feature-flow` now** (Skill tool) and keep to it: its one rule (the main session routes,
it does not build), its stage table, its handoffs. This file only decides *where to start* and
*when to stop and ask*. Sources and decisions: [README.md](README.md).

Arguments: `$ARGUMENTS`

## The one rule

**Start from the latest artifact that is approved, never behind it and never past a gate.** What
the user passed decides the entry stage; the two approvals (spec, plan) are asked for every time
and are never inferred from the fact that `/sdd` was run.

## 1. Sort the arguments

| Argument looks like | It is | Goes to |
|---|---|---|
| `specs/NN-*.md`, `<package>/specs/NN-*.md` | the spec | every stage |
| `docs/plans/NN-*.md` (not `.brainstorm.md`) | the plan | execution; its `Spec:` line names the spec |
| `docs/plans/NN-*.brainstorm.md` | the brief | the planner |
| a Figma URL, a path under `client/docs/design/`, an image or PDF path | a design source | `spec-creator` |
| any other existing path (code, a doc) | a context source | `spec-creator` |
| everything else | the requirements text | `spec-creator`, or see step 3 |
| `--only spec` / `--only plan` | run one agent and stop | `spec-creator` alone, or `implementation-planner` alone (no brainstorm before it, nothing after) |
| `--tests` | turn new tests on for this feature | `test-writer` joins the review stage; the verifier gets `tests: on` |
| `--mode multi\|single` | execution mode | the planner (it then does not ask) |
| `--from <stage>` / `--until <stage>` | stage names: `spec` `brainstorm` `plan` `build` `review` `verify` `security` `docs` | overrides step 2 / stops after that stage |

A path that does not exist is a question to the user, not a guess. No arguments at all: look for
a feature in flight (`ls specs docs/plans`, statuses) and ask which one, or what to build.

## 2. Find the entry stage

`--only` skips this table: `--only spec` starts `spec-creator` (pass 1, or changes to a draft, or
`amend:` for an approved spec, after asking); `--only plan` starts `implementation-planner` with
the spec, the brief if one exists, and the text. Each ends with that agent's report. The same
holds when the requirements text itself says "only the spec" or "only the plan".

Read the `Status:` line of what was passed (and of the plan's spec and brief), then take the
first row that matches. The full status table is in feature-flow's `references/devdigest.md`.

| Found | Start at |
|---|---|
| Plan `implemented` / `partial` | review loop if it has not run, else verify |
| Plan `in progress` | build: the first group with no Implementation report and unchanged files (`git status`); ask when unsure |
| Plan `approved` | pre-flight, then build |
| Plan `draft` | plan check, then ask for approval |
| Brief `chosen` · spec `approved` | plan |
| Spec `approved`, no brief | brainstorm |
| Spec `draft` | spec: the user reviews it; new text or designs go to `spec-creator` as changes |
| No spec | spec: `spec-creator` pass 1 with the text and every design and context source |

## 3. Three cases that need a question first

Ask with `AskUserQuestion`, numbered options, the recommended one first:

- **Text or designs came with an `approved` spec.** They may change what is built. Options:
  1. amend the spec (`spec-creator` with `amend:`, re-approval) — recommended when it adds or
  changes behaviour; 2. pass it to the planner as a note on *how* to build; 3. ignore it.
- **The feature has UI and no design source was passed** (and the spec does not name one).
  Options: 1. the user gives a Figma link or a design path; 2. build from the existing screens,
  and `spec-creator` lists what is undefined.
- **`--from` skips a gate** (for example `--from build` with a draft plan). Do not skip: say which
  approval is missing and ask for it.

## 4. Run

Follow feature-flow's checklist from the entry stage. What this command adds on top:

```
- [ ] Say in one line what was understood: spec · plan · designs · text · entry stage · mode
- [ ] Planning stages: relay every question; write `approved` only on an explicit yes for that file
- [ ] After the plan is approved: write the handoff note, then ASK — continue here, or stop so the
      user runs `/sdd docs/plans/NN-name.md` in a fresh session (recommended after long planning)
- [ ] Build → review stage: architecture-reviewer + correctness in one message (+ test-writer only with `--tests`)
- [ ] Review loop (below), at most 3 rounds
- [ ] Verify → security → docs, each with its own fix rounds (feature-flow)
- [ ] Closing report: without `--tests`, say the feature has no new tests; remind the user to run /pr-self-review and, for the measured cost of the run, /workflow-retro. Never push, commit or open a PR
```

### The review loop

After `architecture-reviewer` and the correctness reviewer (and `test-writer`, with `--tests`) return:

| Round | Fix list for ONE fix-mode `implementer` | Then |
|---|---|---|
| 1 | architecture CRITICAL **and WARNING** with `in_change: true` · correctness CRITICAL, and WARNING that names a wrong result · with `--tests`, every `test-writer` "Bugs found" | `architecture-reviewer` with `recheck:` |
| 2, 3 | what the recheck reports as still `open`, plus its new CRITICAL and WARNING findings | `architecture-reviewer` with `recheck:` |

- The loop ends when a recheck returns no open and no new CRITICAL or WARNING. An empty list in
  round 1 skips the loop.
- `recheck:` gives the reviewer its earlier findings (`id` · `file:line` · `rule`) and the fix
  report's changed files; it re-reads only those. Prompt shape: feature-flow's
  `references/handoffs.md`.
- SUGGESTIONs and `in_change: false` findings are never fixed here: collect them for the closing
  report.
- **After round 3 with something still open: stop.** Show the open findings and ask: 1. change the
  plan (back to the planner); 2. accept them and go on to verify; 3. one more round.
- The verifier starts only after the loop has ended and the last fix's `check-changed.sh` passed.

## Out of scope

- The order of the stages, prompts, pre-flight, fix rounds of the later gates — `feature-flow`.
- Running `/pr-self-review`, committing, pushing, opening a PR — the user does these.
- More than one feature per run: one `/sdd`, one spec.
