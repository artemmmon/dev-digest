# 0001 — Eval runs are their own module, started with a claim, stored per run and per case

Status: accepted · 2026-10-15 · Lesson L06

## Context

The eval pipeline (SPEC-13) replays a set of cases through the same review engine a pull
request uses, scores the answers by code and keeps the history per agent. Three server
questions had more than one defensible answer:

- **Where it lives and how it reuses the review rules.** A case must get the same
  deterministic preparation as a pull request: the excluded-path filter, the skill
  applicability rule, the skill block text and the review-rules text. Those pieces are
  internals of `modules/reviews/`, and the `no-cross-module-internals` rule forbids
  importing them from another module.
- **Who runs it.** A run takes minutes, must answer `202` before any case ends, and
  must allow one running run per agent.
- **What it stores.** A run keeps its metrics when a case is deleted later, and a
  compare must say which cases flipped.

## Decision

1. **A separate `server/src/modules/eval/` module.** It reaches the review rules only
   through `server/src/modules/reviews/index.ts`, a public surface that re-exports six
   pure names (`excludeFromReview`, `partitionSkills`, `skillBlockText`,
   `reviewRulesText`, `REVIEW_STRATEGY`, `REVIEW_EXCLUDED_PATHS`) and nothing else. The
   one new helper is `reviewRulesText`, split out of `taskLine` so both the review and
   the eval build the same rules sentence. Reviews learns about eval cases only
   through a structural port (`ReviewDeps.evalCases`) that the container fills with the
   eval repository, so `reviews` never imports `modules/eval`.
2. **A fire-and-forget run with a database claim and a boot reaper.** `startRun`
   inserts a `running` row, answers `202`, and calls `void executor.run(...)`. A
   partial unique index on `eval_runs (agent_id) WHERE status = 'running'` is the
   claim: a unique violation is a 409. `buildApp` marks leftover `running` rows
   `failed` on boot. This is the shape the onboarding tour and the review runs
   already use. The run is not a `JobRunner` job.
3. **A run-level table plus a per-case results table.** `eval_runs` holds the version
   snapshot, the counters and the metrics. `eval_case_results` holds one row per case
   per run, with a cascade from the case. Deleting a case drops only its own result
   rows. The run keeps its metrics.
4. **One provider request per case, behind a wrapper.** The review engine's input has
   no transport slot, so the executor wraps the `LLMProvider` and forces
   `maxRetries: 0`, `transportRetries: 0` and a 120 s request timeout on every
   structured call. `reviewer-core` does not change.

## Alternatives rejected

| Option | Why not |
|---|---|
| Move the review helpers to `modules/_shared/` and run eval as a `JobRunner` job with results in one jsonb column | Edits `platform/jobs.ts`, which clone and index also use. A long eval would hold one of three queue slots. A missed per-job override would re-run a whole eval after 120 s and bill it twice. "Latest outcome per case" and the flipped list become scans over jsonb. `serializeBy` queues a second start instead of rejecting it, so the 409 still needs its own check. |
| Put eval inside the `reviews` module | No cross-module question, but `reviews` already holds a large run executor and service. Eval has its own aggregate (cases, runs, scoring, compare) that is not a review, and every later eval change would touch the hot review module. |
| Extract one shared "prepare agent run" function used by both the review executor and eval | One code path by construction, but it refactors the production review path, which interleaves logging, trace and cancellation through the same steps. A regression there breaks real reviews. It is the largest effort of the real options. |
| Do nothing | Fails every goal of the spec. |

## Consequences

- **The "same preparation" guarantee rests on shared helpers and tests, not on one code
  path.** Eval assembles the skill blocks in a few lines of its own, from the same
  `skillBlockText` and `partitionSkills` the review uses. If the review path gains a
  step, eval does not get it until someone adds it to `case-rules.ts`.
- **`reviews/index.ts` is now a public surface.** Widening it is a deliberate act.
  Anything a future module wants from `reviews` goes through this file.
- **A run lives in the process that started it.** A restart ends it as `failed`, and
  there is no cancel route. This is the same limit as an onboarding generation.
- **One request per case holds for `single-pass` agents.** A `map-reduce` agent sends
  one request per file, still under the 120 s case deadline.
- **The migration is a rewrite.** `eval_runs` changed from a case-keyed row to a
  run-level row. No code read the old table, so no data moved.
- **The module deletes as a unit.** The only edits outside `modules/eval/` are the
  `reviews/index.ts` file, the `reviewRulesText` split, the finding markers, the
  `ResolvedSkill.version` field, the container getters and the boot reaper call.

See [`eval-pipeline.md`](eval-pipeline.md) for how the pieces work and what they limit.
