# Flutter-first review: applies_to gating + the Flutter pack
Status: in progress (part 1 — applies_to gating — done; part 2 — Flutter skill pack, Flutter Reviewer, neutral prompts — pending)

## Goal
Make skills and agents stack-aware. Today every enabled skill is injected into every
agent's prompt on every PR, and "Run all" always runs every enabled agent, regardless of
what stack the PR actually touches — a Flutter rubric fires on a TS-only PR, a
Node/Fastify-specific prompt runs on a Flutter PR. Part 1 (this entry) adds the gate; part
2 uses it to ship a Flutter/Dart skill pack and a dedicated Flutter Reviewer agent without
polluting other stacks' reviews.

## Scope — part 1 (done)
**In**
- `applies_to: string[] | null` on both `skills` and `agents` — path globs (the same
  matcher `modules/reviews/diff-filter.ts` uses for `REVIEW_EXCLUDED_PATHS`) over a PR's
  changed files. `null`/empty = always applies.
- Skill-level gate: a skill whose `applies_to` matches none of the PR's (post-exclusion)
  changed files is left out of the prompt, logged as skipped in the run trace.
- Agent-level gate: a "Run all" review skips an enabled agent in the same way; an
  explicitly chosen agent always runs. The skipped list is returned in the response and
  toasted in the UI.
- Fails OPEN throughout: no `pr_files` yet (a PR nobody has opened) never drops anything.
- Editing UI: an "Applies to" glob field with Flutter/TypeScript/Python presets, on the
  Skill form, the Skill detail Config tab, and the Agent editor Config tab; a chip on
  `SkillCard`/`AgentCard` showing the first glob (+N).

**Out (part 2)**
- The actual Flutter/Dart skill pack, the Flutter Reviewer agent, and neutralising the
  Node/Fastify assumptions baked into the General/Performance prompts.

## Design
Packages: server, client. Contracts (`server/src/vendor/shared/contracts/knowledge.ts`):
```ts
AppliesTo = z.array(z.string().trim().min(1).max(200)).max(30)
Skill.applies_to / SkillInput.applies_to / SkillImportPreview.applies_to: AppliesTo.nullish()
Agent.applies_to / AgentVersionConfig.applies_to: AppliesTo.nullish()
```
`server/src/db/schema/{skills,agents}.ts` gain `appliesTo: jsonb('applies_to').$type<string[]>()`
(migration `0017`, two plain `ADD COLUMN`s). `review-api.ts` adds `SkippedAgent` and
`ReviewRunResponse.skipped_agents`.

**Gating** (`modules/reviews/applicability.ts`, pure):
- `effectivePaths(paths)` — the changed paths minus `REVIEW_EXCLUDED_PATHS`.
- `matchesAppliesTo(appliesTo, paths)` — null/empty → true; empty `paths` → true (fail
  open); else any path matching any glob.
- `partitionSkills(skills, changedPaths)` — `{applicable, skipped}` for the run trace.

**Wiring**:
- `ReviewService.resolveTargets(workspaceId, prId, opts)` now takes `prId`; for `all:
  true` it reads `this.repo.getPrFiles(prId)`, computes `effectivePaths`, and splits
  enabled agents into `{targets, skipped}`. An explicit `agentId` always returns that
  agent, ungated.
- `ReviewRunExecutor.buildSkillBlocks(agentId, changedPaths, runLog)` now takes the
  loaded diff's (already-excluded) file paths and calls `partitionSkills`; a skipped
  skill logs `skill "x" skipped — applies to *.dart; no changed file matches` instead of
  being attached.
- Skill/agent services normalise `applies_to` on write (`normalizeAppliesTo`: trim,
  dedupe, `[]` → `null`) — small, duplicated 4-line helper in each module rather than a
  shared port (onion-architecture: not worth a cross-module dependency).
- Import frontmatter (`modules/skills/import-parser.ts`) reads `applies_to:` as a comma
  list, with `globs:` as an alias (Cursor `.mdc`-style rule files import cleanly).
- `AgentsRepository.isConfigChange` compares `applies_to` element-wise (not by reference)
  so re-saving the same globs doesn't spuriously bump the agent's version.

**Client**: the glob field is a single comma-text input (`SkillDraft.appliesTo` /
component-local state), converted to the wire's `string[] | null` only at the request
boundary (`@/lib/applies-to-presets`'s `parseAppliesTo`, shared by skills and agents).
`RunReviewDropdown` toasts the skipped agents' names after a "Run all".

## Acceptance
- A Dart-scoped skill bound to an agent does not appear in that agent's prompt (or run
  trace `skill_blocks`) on a TS-only PR, and is logged as skipped.
- An enabled, Dart-scoped agent is left out of "Run all" on a TS-only PR, reported in
  `skipped_agents`, and gets no run — but running it explicitly by id still works.
- A PR with no `pr_files` yet still runs every enabled agent (fail open).
- Saving a skill/agent form without touching "Applies to" never bumps the agent version.

## Open questions
- None outstanding for part 1.
