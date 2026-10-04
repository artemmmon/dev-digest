---
name: feature-flow
description: How the main session runs a DevDigest feature through the subagent pipeline (Spec Driven Development) — spec-creator → brainstorm → implementation-planner → implementer per step group → architecture-reviewer ∥ correctness reviewer (test-writer only when tests are on) → the review loop (fix, architecture recheck, up to 3 rounds) → implementation-verifier → security-reviewer → doc-writer → /pr-self-review — which agent gets which input, what runs in parallel, the status gates (spec approved, plan approved), the pre-flight, the bounded fix loops, spec amendments, and the token rules. Use whenever starting, continuing or resuming a feature or a multi-file fix, executing an approved plan in docs/plans/, deciding which agent runs next or what to pass it, or handling a FAIL, INCOMPLETE, CRITICAL or Plan deviation report — even if the user only says "build this" or "continue". Not for what a spec says (spec-authoring), the review gate itself (pr-self-review), or a one-file change that needs no plan.
argument-hint: "[spec | plan path]"
metadata:
  version: "1.2.0"
---

# Feature flow (DevDigest)

The order of the agents, what each one is handed, and what the main session does between them.
Each agent's own contract is its file in `.claude/agents/`; this skill is only the route.
Rules come from the sources in [README.md](README.md); `[S1]` marks source #1 there.

> **Where am I?** `ls specs docs/plans`, then the `Status:` line of the spec, the brief and the
> plan tell you the stage: [references/devdigest.md](references/devdigest.md) has the table.

## The one rule

**The main session routes; it does not build.** It passes paths, relays questions, records the
user's decisions in `Status:` lines and starts the next agent. It never writes feature code,
never pastes a plan, a diff or a report into a prompt, and never skips a gate the user owns.

## Principles

1. **Files are the handoff.** Spec, brief and plan are written by their agents straight to disk;
   an agent gets a path and reads what it needs. *Why:* a role split loses context at each
   handoff unless the artifact stands on its own, and every pasted copy is re-read on every later
   call of whoever holds it [S1][S2][S4].
2. **Two gates belong to the user.** `Status: approved` on the spec and on the plan. Nothing is
   planned from a draft spec or built from a draft plan; agents and `check-plan.mjs` stop on one.
   *Why:* a wrong requirement is cheapest to fix before it becomes steps, and a wrong step before
   it becomes code [S5][S6].
3. **Requirements trace by id.** A spec id (`AC-n`, `EC-n`, `NFR-n`) appears on a plan step's
   `Covers` line, in a test name and in the verifier's matrix. *Why:* coverage becomes a search,
   not a judgement, and a missing id is caught by a script before any code exists [S5].
4. **New tests are off by default; when on, the writer does not test its own code.**
   `implementer` only repairs tests it breaks. With `tests: on` (the user's `/sdd --tests`, or
   their word) `test-writer` writes the feature's tests from the spec in a fresh context.
   *Why:* test writing was the largest share of implementer calls, and the user chose to save
   it for now; tests written by the code's author confirm the author's reading [S4][S7].
   Say in the closing report that the feature has no new tests.
5. **Reviews run together, fixes are merged, architecture is re-reviewed.**
   `architecture-reviewer` and the correctness reviewer (plus `test-writer` when tests are on)
   start in one message; their findings go
   to one fix-mode `implementer` per round, and `architecture-reviewer` then rechecks only what
   the fix touched. *Why:* they are independent readers of the same diff, so one merged fix beats
   three; and an architecture fix moves code between layers, which is where new violations
   appear [S4].
6. **The verifier is the last gate, on a tree that no longer moves.** It runs after the fixes,
   and any later fix is followed by `recheck:`. *Why:* a PASS on code that then changes is not a
   PASS.
7. **Fix loops are bounded.** Three rounds in the review loop, two per later gate, then stop and
   show the user what is left.
   *Why:* a loop that does not converge is a plan or spec problem, and more rounds only cost.
8. **Fresh context where it is cheap.** One `implementer` per step group; a new main session for
   execution, started from a short handoff note. *Why:* cost is context length × calls [S4].

## Stages

| # | Stage | Agent(s) | Hand it | Gate before the next stage |
|---|---|---|---|---|
| 1 | Spec | `spec-creator`, 2 passes | the request + its sources; then the answers by `SendMessage` | **user sets the spec `approved`** |
| 2 | Options | `brainstorm` | the spec path | user picks; you set the brief `Status: chosen: option <k>` |
| 3 | Plan | `implementation-planner` | spec + brief paths; then the answers and the mode by `SendMessage` | `check-plan.mjs` clean; **user approves; you set the plan `approved`** |
| 4 | Build | `implementer`, one per step group | plan path · `group: G<n>` · the previous group's handoff | every group reports its checks |
| 5 | Review | `architecture-reviewer` ∥ `pr-skill-reviewer` (`correctness`) · with `tests: on` also `test-writer` | plan path · `base` | — |
| 6 | Review loop | one `implementer` in fix mode → `architecture-reviewer` `recheck:`; up to 3 rounds | the merged list (architecture CRITICAL + WARNING, correctness, test bugs); then what is still open | no open CRITICAL or WARNING; `./scripts/check-changed.sh` passes |
| 7 | Verify | `implementation-verifier` | plan path · `base` · `tests: off` (or `on` + the Test report's "Not covered") | **PASS** |
| 8 | Security | `security-reviewer` | `mode: diff` · `base` · plan path | no CRITICAL |
| 9 | Close | `doc-writer`, then the user runs `/pr-self-review` | plan path | PASS verdict |

`single-agent` plans skip stages 5–8: one `implementer` does group `G1`, then
`./scripts/check-changed.sh` and `/pr-self-review`.

**One agent on request.** When the user asks for one agent by name — "only the spec", "run
spec-creator", "just plan this", `/sdd --only spec|plan` — run that agent alone: relay its
questions, let it write its file, report, and stop. Do not go on to the next stage and do not
insist on the stages before it: a standalone `implementation-planner` needs no brainstorm brief
(it plans from an approved spec or from the request). The status gates still hold.

## Workflow (copy and tick off)

```
Planning session
- [ ] 1. spec-creator pass 1 → relay questions (AskUserQuestion, options 1/2/3) → SendMessage → draft spec
- [ ] 2. User approves the spec (their edit, or yours on their word)
- [ ] 3. brainstorm → relay its summary → user picks → set `Status: chosen: option <k>` in the brief
- [ ] 4. implementation-planner → relay the Requirements review → SendMessage → plan file
- [ ] 5. node A/check-plan.mjs <plan>  → no errors
- [ ] 6. User approves the plan → set `Status: approved` → write the handoff note → new session

Execution session
- [ ] 7. Pre-flight (references/devdigest.md): plan approved · deps installed · Postgres up if the plan needs it · note `base`
- [ ] 8. implementer per group, in order; disjoint packages in one message. Plan deviation → stop, back to the planner
- [ ] 9. ONE message: architecture-reviewer + pr-skill-reviewer(correctness)  (+ test-writer only with tests on)
- [ ] 10. Review loop, max 3 rounds: merge architecture CRITICAL/WARNING with `in_change: true` + correctness
          findings (+ test-writer "Bugs found") → ONE implementer in fix mode → architecture-reviewer
          `recheck:` → repeat with what is still open or new. Still open after round 3 → stop and ask
- [ ] 11. implementation-verifier → FAIL: fix mode with "To reach PASS", then verifier `recheck: <ids>` (max 2 rounds)
- [ ] 12. security-reviewer → CRITICAL: fix mode, then verifier `recheck:` for the touched items (max 2 rounds)
- [ ] 13. doc-writer → tell the user to run /pr-self-review → report the token spend
```

The user starts all of this with the `/sdd` command ([sdd](../sdd/SKILL.md)), which sorts what
they passed and picks the entry stage. `A` = `.claude/skills/feature-flow/assets`. Prompts for each stage, the correctness reviewer's
fields and the merge rules: [references/handoffs.md](references/handoffs.md).

## When something comes back wrong

| Report | Do |
|---|---|
| Clarification / Spec discovery / Requirements review | Relay with `AskUserQuestion`; answer the **same** agent with `SendMessage` (it keeps what it read) |
| Plan deviation (implementer, test-writer) | Stop the groups. Set the plan back to `draft` on the user's word, send the deviation to the planner, re-approve |
| A gap in the approved spec (planner recommendation, deviation, a criterion that cannot be met) | The user decides it → `spec-creator` with `amend: <spec>` → user approves again → planner adds the new ids |
| Verifier INCOMPLETE | Show the "Cannot verify" list. Postgres down → start it and `recheck:`; otherwise the user decides |
| The round limit is reached (3 in the review loop, 2 at the verifier and security gates) | Stop. Show what is left and ask: change the plan, amend the spec, or accept |

## Check

```sh
node .claude/skills/feature-flow/assets/check-plan.mjs docs/plans/NN-name.md                 # form + spec coverage
node .claude/skills/feature-flow/assets/check-plan.mjs docs/plans/NN-name.md --implemented   # after the build
node --test '.claude/skills/feature-flow/assets/tests/*.test.mjs'
```

The first is the planner's PostToolUse hook; the second is what `implementation-verifier` runs
for its mechanical items. Both check form and traceability only.

## Read next

| Question | File |
|---|---|
| What exactly do I put in each agent's prompt? How do the stage-5 findings merge? | [references/handoffs.md](references/handoffs.md) |
| Which stage is this feature in? Pre-flight, statuses, the handoff note, known gaps | [references/devdigest.md](references/devdigest.md) |
| Why this order, and what was measured | [README.md](README.md) · `docs/agent-workflow-cost.md` |

## Out of scope

- What a spec says and how it is worded — `spec-authoring`.
- The pre-PR review and the push gate — `pr-self-review` (run by the user, not by this flow).
- Each agent's rules — its file in `.claude/agents/`; the map is `.claude/agents/README.md`.
- A change to one file with nothing to decide: do it directly.
