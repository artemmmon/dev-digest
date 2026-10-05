# Handoffs: what each agent is given

Prompts carry paths and a few fields, never file contents, a diff or another agent's full report.
`<base>` is the sha noted in the pre-flight (`git merge-base HEAD main`).

## Planning

| Agent | Prompt | Comes back | You then |
|---|---|---|---|
| `spec-creator` pass 1 | The feature request in the user's words + every source (brief, Figma links, design files, code paths, related specs) | Spec discovery report | Relay questions and proposals with `AskUserQuestion` (numbered options, recommended first) |
| `spec-creator` pass 2 | `SendMessage` to the same agent: the answers, by question number | Spec report; the draft is on disk | Ask the user to review and approve it |
| `spec-creator` amendment | A **new** `spec-creator` (Agent tool, not `SendMessage` to the pass-1 agent): `amend: <spec path>` + the gap + the user's decision | Spec report; the spec is a draft again | The user approves it again |
| `brainstorm` | `Spec: <path>` (or the problem, for a fix with no spec) | Brief summary; the brief is on disk | Show the options; after the choice, edit the brief's `Status:` to `chosen: option <k>` |
| `implementation-planner` | `Spec: <path>` · `Brainstorm: <path>` · `mode:` if the user already said | Requirements review, or the Plan summary | Relay the review; answer with `SendMessage` |
| `implementation-planner` corrections | `SendMessage`: what to change. The plan must be `draft` | Plan summary with "Changed since" | Run `check-plan.mjs`; ask for approval |

Why a new agent for an amendment: it needs the spec file and the gap, not the discovery context, and the
pass-1 agent's cache has expired by then, so resuming it writes its whole context again (SPEC-11: 362K tokens
rewritten, a 211K context, the most expensive agent of the run).

Approving: the user may edit the `Status:` line, or tell you to. Write `approved` only on an
explicit yes for that file. Never infer approval from "looks good so far".

## Execution

| Stage | Agent | Prompt |
|---|---|---|
| 4 | `implementer` | `Plan: docs/plans/NN-name.md` · `group: G2` · `Handoff from G1:` the previous report's "Handoff to the next group" section, verbatim |
| 5 | `test-writer` (only with tests on) | `Plan: <path>` · `mode: after` |
| 5 | `architecture-reviewer` | `mode: diff` · `base: <base>` · `Plan: <path>` |
| 5 | `pr-skill-reviewer` | `skill: correctness` · `repo_root: <abs path>` · `merge_base: <base>` · `files:` the changed source files · `severity_rubric: .claude/skills/pr-self-review/references/severity.md` · `contract: .claude/skills/pr-self-review/references/reviewer-contract.md` |
| 6 | `implementer` | `Fix mode.` · `Plan: <path>` · the merged list, one line per item: `<id>` · `path:line` — what is wrong — what the rule or criterion requires |
| 6 | `architecture-reviewer` again | `mode: diff` · `base: <base>` · `recheck:` the findings that were sent to the fix, one line each: `<id>` · `file:line` · `rule` · `fixed_files:` the fix report's changed files |
| 7 | `implementation-verifier` | `Plan: <path>` · `base: <base>` · `tests: off` — or `tests: on` · `Not covered (test-writer):` that list |
| 7 | `implementation-verifier` again | the same + `recheck: AC-3, S4.done, …` |
| 8 | `security-reviewer` | `mode: diff` · `base: <base>` · `Plan: <path>` |
| 9 | `doc-writer` | `Plan: <path>` · `Spec: <path>` |

### Stage 4: groups

Run the groups in the order of the plan's "Step groups" table. Groups whose "Runs after" is the
same and whose packages are disjoint go out in one message. A group that is not the last runs
`check-changed.sh --quick` itself; the last one runs the full checks. Do not resume a finished
implementer for the next group: start a new one.

### One agent on request

| The user asks for | Run | Stop after |
|---|---|---|
| only the spec (`/sdd --only spec`, "run spec-creator", "just write the spec") | `spec-creator`, both passes | the Spec report: the draft is on disk, the user reviews it |
| only the plan (`/sdd --only plan`, "run the planner", "just plan this") | `implementation-planner` with the spec path or the request, and a brief only if one exists | the Plan summary and a clean `check-plan.mjs` |

No brainstorm before a standalone planner, no next stage after either. The gates hold: a spec
with a `Spec ID:` line must be approved before it is planned.

### Tests: off by default

`test-writer` is not started unless the user turned tests on (`/sdd --tests`, or said so). With
tests off: stage 5 is two agents, the fix list has no test bugs, the verifier gets `tests: off`,
and the closing report says the feature has no new tests and that `test-writer` can be run on it
later. With tests on, pass `tests: on` to a `single-agent` implementer too.

### Stage 5: one message, two agents (three with tests on)

- **Files for the correctness reviewer:** `git diff <base> --name-only` plus untracked files,
  minus tests (`*.test.ts(x)`), generated files (`server/src/db/migrations/**`,
  `client/src/vendor/shared/**`, lock files) and Markdown. More than 25 files → two reviewers.
  Tests are left out: with tests on, `test-writer` is writing them at the same moment;
  `pr-self-review` reviews them at the gate.
- `architecture-reviewer` skips test files for the same reason.

### Stage 6: the review loop

Round 1 merges the reports into one fix list:

| From | Goes to the fix list | Does not |
|---|---|---|
| `test-writer` (tests on) | every "Bugs found" line (a failing test is the evidence) | "Not covered" (goes to the verifier) |
| `architecture-reviewer` | CRITICAL and WARNING with `in_change: true`, and a failed check | SUGGESTION, `in_change: false` — list them for the user at the end |
| correctness reviewer | CRITICAL; WARNING only when it names a wrong result, not a style point | SUGGESTION |

Then, per round:

1. One `implementer` in fix mode gets the list. Keep the architecture ids (`A1` …); give the
   others a prefix (`C1` correctness, `T1` test bug).
2. `architecture-reviewer` runs with `recheck:` — the architecture findings just sent, and
   `fixed_files:` from the fix report's "Changed files". It answers `closed` or `open` per id and
   reports new CRITICAL and WARNING findings in those files.
3. Nothing open and nothing new → the loop is done. Otherwise the open and new findings are the
   next round's list.

At most **3 rounds**. After the third with something still open, stop and ask the user: change
the plan, accept the rest and go on to verify, or one more round. An empty list in round 1 skips
the loop. Two findings on the same line are one item. Do not fix anything yourself, and do not
re-argue a finding: the fix-mode implementer reports under "Deviations" when the code contradicts
one, and that finding goes to the user, not into another round.

Correctness findings and test bugs are fixed in the round they arrive and are not re-reviewed
here: the fix's `check-changed.sh` run proves the failing tests pass, and `/pr-self-review`
reviews correctness again at the gate.

### Stages 7–8: rounds

A round is: fix-mode `implementer` → the gate again (`recheck:` for the verifier; a full run for
`security-reviewer`). Count rounds per gate. After the second failed round, stop and ask the user.

## Closing report to the user

In the user's language: what was built (spec id, plan path) · that no new tests were written (when tests were off) · the verifier's verdict line · the
findings that were not fixed (warnings, `in_change: false`, `untested-requirement`) · what was
not run and why · the next steps: `/pr-self-review`, and `/workflow-retro` for the measured token spend (never quote a token total from completion notices).
