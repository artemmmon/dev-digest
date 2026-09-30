# Docs — cross-package

Reference material that spans packages. Package-specific docs live in
`<package>/docs/`.

## Index
- [agent-prompts/](agent-prompts/README.md) — system prompts of the seeded reviewer agents and how to choose a model
- [agent-workflow-cost.md](agent-workflow-cost.md) — where the tokens of a planner → implementer → reviewers run go (measured on Intent Layer) and the rules that keep it down
- `plans/` — development plans `NN-short-name.md` written by the `planner` agent, executed by `implementer`, checked by `implementation-verifier` and `security-reviewer` (`.claude/agents/`); `Status:` draft → in progress → implemented / partial. `NN-short-name.brainstorm.md` briefs from `brainstorm` (same NN as the plan) come first, with `Status: awaiting choice` → `chosen: option <k>`
- [devdigest-mcp.md](devdigest-mcp.md) — the local stdio MCP server (`mcp/`): connect from Claude Code, env vars, the five tools, the measured token budget, how `get_blast_radius` shapes and caps its result
- [blast-radius.md](blast-radius.md) — the PR Blast radius map (`GET /pulls/:id/blast`, Overview card, MCP tool): data flow, response envelope, degraded reasons, the 20-callers-per-symbol cap, and the known limits
- [pr-self-review.md](pr-self-review.md) — review your branch against the project skills before opening a PR; the push gate and how to override it
- [smart-diff-classifier.md](smart-diff-classifier.md) — the Smart Diff file classifier's rule table and check order, how to add a rule or import `classifyFile` without HTTP (L08), and how the Files changed tab combines server role groups with the client's one findings source
