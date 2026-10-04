# /sdd in DevDigest

Examples of what the command does with typical input, and what is still open.

## Examples

| Command | Entry stage | First action |
|---|---|---|
| `/sdd "Let the user re-run a failed agent run from the PR page" client/docs/design/pr-detail.jsx` | spec | `spec-creator` pass 1 with the text and the design file |
| `/sdd https://www.figma.com/design/…?node-id=12-34 "re-run button"` | spec | `spec-creator` pass 1; if no Figma read tool is available it asks for an export |
| `/sdd specs/10-rerun-agent.md` (draft) | spec | Show the open questions, ask the user to review and approve |
| `/sdd specs/10-rerun-agent.md` (approved) | brainstorm | `brainstorm` with the spec path |
| `/sdd specs/10-rerun-agent.md "also keep the old result visible while re-running"` (approved) | — | Ask: amend the spec, note for the planner, or ignore |
| `/sdd specs/10-rerun-agent.md --mode multi --until plan` | brainstorm | Runs brainstorm and the planner, stops at the plan approval |
| `/sdd docs/plans/06-rerun-agent.md` (approved) | build | Pre-flight, then group G1 |
| `/sdd docs/plans/06-rerun-agent.md` (in progress) | build | Finds the first unfinished group |
| `/sdd docs/plans/06-rerun-agent.md --from review` | review | `architecture-reviewer` and the correctness reviewer, then the loop |
| `/sdd docs/plans/06-rerun-agent.md --tests` | build | As above, and `test-writer` joins the review stage |
| `/sdd --only spec "re-run a failed agent run" client/docs/design/pr-detail.jsx` | spec | `spec-creator` both passes, then stops at the draft |
| `/sdd --only plan specs/10-rerun-agent.md` | plan | `implementation-planner` alone (no brainstorm), stops at the plan summary |
| `/sdd` | — | Lists features in flight and asks |

Design sources in this repo: `client/docs/design/` (find the screen in its `artboards.md`) and
Figma through the read tools (`get_*`). They are inputs of the spec only; later stages read the
spec, not the designs, except the implementer where a plan step names a design file.

## Stage names for `--from` / `--until`

`spec` · `brainstorm` · `plan` · `build` · `review` (the review agents and the loop) · `verify` ·
`security` · `docs`.

## Open questions

1. **Not run end to end yet.** The command was written from the agent contracts; the first real
   feature should confirm the entry-stage table and the loop's stop condition.
2. **Recheck ids across rounds.** `architecture-reviewer` numbers findings `A1`, `A2`, … per run
   and continues the numbering in a recheck. If two rounds renumber, match findings by
   `file` + `rule` instead.
3. **Correctness findings are fixed but not re-reviewed** in the loop; `/pr-self-review` reviews
   correctness again at the gate. If that proves too late, add a correctness recheck to round 2.
