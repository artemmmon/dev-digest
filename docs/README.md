# Docs — cross-package

Reference material that spans packages. Package-specific docs live in
`<package>/docs/`.

## Index
- [agent-prompts/](agent-prompts/README.md) — system prompts of the seeded reviewer agents and how to choose a model
- [agent-sources.md](agent-sources.md) — the outside and project sources each subagent's rules come from, with the date they were checked
- [agent-workflow-cost.md](agent-workflow-cost.md) — where the tokens of a planner → implementer → reviewers run go (measured on Intent Layer) and the rules that keep it down
- `plans/` — development plans `NN-short-name.md` written by the `implementation-planner` agent, executed by `implementer`, checked by `implementation-verifier` and `security-reviewer` (`.claude/agents/`); `Status:` draft → approved (set on your word) → in progress → implemented / partial; check one with `node .claude/skills/feature-flow/assets/check-plan.mjs docs/plans/NN-name.md`. `NN-short-name.brainstorm.md` briefs from `brainstorm` (same NN as the plan) come first, with `Status: awaiting choice` → `chosen: option <k>`. Both agents write their own file; the route between the agents is the `feature-flow` skill
- `retros/` — retrospectives of agent-pipeline runs from the `workflow-retro` skill: [ledger.md](retros/ledger.md) has one row per run (the trend), `<date>-<label>.md` the full report of a run
- [devdigest-mcp.md](devdigest-mcp.md) — the local stdio MCP server (`mcp/`): connect from Claude Code, env vars, the five tools, the measured token budget, the blast-radius stub
- [pr-self-review.md](pr-self-review.md) — review your branch against the project skills before opening a PR; the push gate and how to override it
- [smart-diff-classifier.md](smart-diff-classifier.md) — the Smart Diff file classifier's rule table and check order, how to add a rule or import `classifyFile` without HTTP (L08), and how the Files changed tab combines server role groups with the client's one findings source
