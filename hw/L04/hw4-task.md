# HW4 — Blast Radius (task as given by the course, condensed)

## Decisions taken with the user (2026-09-30)

- Branch `hm04` (PR #16). Scope: P1 + P2 + P3 except "Prior PRs touching these files".
- UI from `client/docs/design/src/blast.jsx`; degraded, empty and Resync states have no mockup and use existing tokens.
- Demo PR is a fixture: draft PR #15 (`demo/blast-radius-fixture`), a comment-only change in `server/src/modules/_shared/context.ts`. Closed after filming.
- MCP scene is filmed with the user's real Claude Code (`claude -p`, one small paid call, only for filming).
- The "index incomplete" state is filmed on `artemmmon/cs2-lineups` PR #5 (real `partial` index, reason `no_files`).

## What the feature is

The block answers "what else can this diff touch?": symbols declared in changed files, who imports or calls
them, and which HTTP endpoints and crons depend on that code. Nothing is analysed again and no model is called:
`repoIntel.getBlastRadius` reads the index that `repo-intel` built while cloning. Deliverables: the Blast radius
block on the PR Overview tab, and the `get_blast_radius` MCP tool that returns the same map.

## Acceptance criteria

P1 (blocks hand-in):
1. The Overview tab of a pull request has a Blast radius block.
2. A summary on top: symbols changed, callers, endpoints and crons affected.
3. Under each changed symbol its callers as `file:line`, and under them the endpoints that depend on it.
4. On a PR that changes a shared helper: at least two real callers and at least one HTTP endpoint.
5. Clicking `file:line` opens exactly that line on GitHub.
6. No callers → clear text instead of an empty box. Incomplete index → a separate marker with the reason.
7. `devdigest-mcp` has a working `get_blast_radius` (not the lab stub); in Claude Code it returns the same map as the block.
8. An open PR with an implementation description and a 1–3 minute demo video.

P2 (mentor comments in the PR): logs show the ready index is read, no AST/import-graph rebuild; route response
validated by the `BlastRadius` contract; unit test of the flat-callers → grouped-downstream mapping; no LLM in the
main path; the declaring file is not its own caller; limits (20 callers per symbol, depth 2) come from
`constants.ts`; `degraded` and `reason` reach the UI; `get_blast_radius` follows the lab rules; the PR names what
each subagent did.

P3 (wishes): collapsible tree, Tree/Graph switcher, Prior PRs block, crons apart from endpoints, symbols sorted
by rank, Resync button next to the incomplete-index marker, labels from `client/messages/en/blast.json`.

## Video script ("Як перевірити")

1. Open the test PR → Overview → Blast radius → show the summary: symbols, callers, endpoints, crons.
2. Show a changed symbol's callers as `file:line` and the endpoints below them.
3. Open one or two callers in code: they are files that use the changed function, not its own dependencies.
4. Click `file:line` → that line opens on GitHub.
5. Show the state with no callers and the state with an incomplete index.
6. In Claude Code ask for the blast radius of the same PR → the answer matches the block.
7. One sentence: why the map does not call a model and does not re-parse the repo.
