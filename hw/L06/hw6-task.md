# HW6 — Eval Pipeline for DevDigest + export of your own agent (as given by the course)

Source: the GoIT homework page of L06 "Evals & Plan Verifier & Export to CI", read on 2026-10-14,
translated from Ukrainian. Core ≈ 5 h — the largest homework of the course. Deadline on the page:
23:45, 11 Oct. The feature itself is specified in `specs/eval-pipeline.md`.

## What we build

Regression protection for the review agent. In the lab you used a ready-made eval module for the
harness; at home you build the same system from scratch for the product itself: change the system
prompt, the model or a linked skill → run the evals → see in numbers whether the agent got worse or
better. This is Experiment 3 of the lab, moved to the product plane.

Cases live in Postgres next to the findings they are born from. Your accept/dismiss decisions from
L01–L05 are the dataset — no invented test scenarios.

## As a user I can

- create an eval case from a real finding in one click: from an *accepted* one — "must find X at
  file:line", from a *dismissed* one — "must NOT comment on Y"
- see all cases of an agent's set
- run the agent on all cases
- see the run metrics: recall / precision / citation_accuracy
- open the run history and compare two runs side by side — "old prompt vs new"

## Possible implementation — Eval Pipeline

1. Tables `eval_cases` and `eval_runs` — the course gives the schema and the Zod contracts ready.
2. A **Turn into eval case** button on `FindingCard`: stores the diff fragment + the expectation.
   The expectation type depends on the decision: accepted → `must_find`, dismissed → `must_not_flag`.
3. Route `POST /agents/:id/eval-runs` — runs the agent on all cases of the set. The inputs are
   fixed so that runs of different agent versions are comparable.
4. Scoring — **entirely in code, no model**: a finding counts when the file matches and the line
   ranges intersect. From that: recall (share of expected that was found), precision (share of
   findings that are not noise — dismissed cases work exactly here) and citation_accuracy (share of
   findings that survived the grounding gate).
5. UI: an **Evals** tab in `AgentEditor` — case list, run history.
6. A separate page in the left sidebar — **Eval Dashboard** for agents. Show the latest evals run.
7. Experiment: a pair of runs with the old and the new system prompt → metrics visibly move. Then
   break the prompt on purpose → precision drops (the same sensitivity test as with SKILL.md and the
   agent definition in the lab).

Design links: PR detail / Overview page · Eval dashboard page, agent runs comparison · Agents page,
Evals tab. In the repo: `client/docs/design` (`agent-evals`, `evalcase`, `agent-perf`, `pr-overview`).

In the lab a judge was needed because "explained the reason" is not countable by substring. Here the
expectation is `file:line` and the match is counted by code, so there is **no LLM call in scoring**.

The homework goes through Claude Code with the L05 SDD discipline: first `specs/eval-pipeline.md`
with your acceptance, then the plan, then the code.

## Acceptance criteria

- the set has ≥ 8 cases
- a case is created from a finding in one click; both expectation types (`must_find` / `must_not_flag`) work
- a system-prompt change visibly moves recall/precision between two runs
- scoring makes no LLM call
- `pnpm verify:l06` is green

## Hand-in checklist

- `specs/eval-pipeline.md` created and sits in the specs
- `pnpm verify:l06` green
- screenshot comparing two runs with different prompts
- **video — mandatory.** Short screencast of the end-to-end scenario: create a case from a finding →
  run → metrics → second run with a changed prompt → compare the two runs. Say what you do and why —
  the video replaces the written report.

## Stretch (no deadline)

- **Eval of your own skill in `evals/`** — `skills/<skill>/<skill>.eval.ts` with 3–4 cases, in the
  lab's pattern (`skillTask` + judge practices; `patternMatch` first for concrete facts). Break the
  skill on purpose → red → revert → green.
- **Case Editor** — manual create/edit of a case: paste a diff fragment (DiffView preview), set the
  expectation type, file and line range. Lives in the same set, runs through the same route.
- **Metric trend charts** — recall / precision / citation_accuracy over all runs of an agent on the
  Evals tab; point = run, tooltip = prompt version and cost.
- **PreToolUse hook** — one deterministic gate in `.claude/settings.json` (test gate before commit);
  document one really caught case.
- **Mutation testing on one file** — run a mutation tool on one DevDigest module, kill one surviving
  mutant with a new test.
