# evals — INSIGHTS

## What Works

### 2026-10-15 — AC-62 evidence: breaking the Amend rule turned spec-authoring case 4 red (second-hand, one case, gate only)
Plan 09 AC-62 ("removing a rule from the skill makes at least one case fail") was proven on a scratch copy of `evals/` + `.claude/skills/spec-authoring/` (layout and `node_modules` symlinked), not on the real skill. In the copy, the `SKILL.md` lifecycle row "Amend it … `Amended:` header line, next free ids" became "Edit it in place." and the `Amended:` / amend wording was removed from `references/devdigest.md`. Case 4 ("an approved spec is amended") went red: `grounded 0.33`, `missing concrete evidence ... expected 0.333… to be 1`; the model answer said to edit the file in place and keep the status approved. The scratch skill was then restored (`diff -r` against the real skill identical) and the scratch folder deleted; the real skill was never modified (`git status --short .claude` empty).
Limits: one case, gate failure only (no judge call); the scratch copy no longer exists; the green after the revert was not re-run on the scratch (green on the unmodified skill is the real-skill case 4 result, 4/4 in run 20261015T091005). The figures come from the implementer's report of that run, so this is second-hand evidence **(unverified by a re-run)**. To reproduce: copy `evals/` and `.claude/skills/spec-authoring/` to a scratch folder, remove the `Amended:` rule wording, run `pnpm exec vitest run skills/spec-authoring/spec-authoring.eval.ts -t "approved spec is amended"` there, expect `grounded < 1`.
Where: skills/spec-authoring/spec-authoring.cases.ts:91

## What Doesn't Work

## Codebase Patterns

### 2026-10-15 — prove "removing a rule fails a case" on a scratch layout, never on the real skill
`SKILLS_DIR` is `<evals>/../.claude/skills`, and `skillContent` injects `SKILL.md` plus every `references/*.md`. To break a skill on purpose, copy `evals/` (symlink its `node_modules`) and `.claude/skills/<name>` into a scratch folder with the same relative layout, edit the copy (every mention of the rule, references included), and run one case with `pnpm exec vitest run <file> -t "<case name>"` there. The real skill stays untouched.
Where: src/artifacts/paths.ts:12

### 2026-10-15 — a grounding string must be a rule of the skill, not a guess at the answer
A grounding gate that needs an id the model has no reason to pick (for example `AC-4`) fails a case on a good answer; check each string against the saved outputs in `results/outputs/` before paying for a second run. Matching is case-insensitive substring, so `WHEN`/`IF` alone prove nothing.
Where: src/scoring/pattern-match.ts:6

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions

## Session Notes
