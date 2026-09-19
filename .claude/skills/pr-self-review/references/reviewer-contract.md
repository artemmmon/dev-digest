# Reviewer contract

What the orchestrator sends to `pr-skill-reviewer` and `pr-finding-verifier`, and what they must return.
Both agents are defined in `.claude/agents/`; this file is the interface.

## Contents
- [Reviewer prompt](#reviewer-prompt) · [Reviewer output](#reviewer-output) · [Verifier prompt](#verifier-prompt) · [Verifier output](#verifier-output) · [Merging](#merging)

## Reviewer prompt

One reviewer per entry in `collect-diff.mjs` → `skill_groups`, plus one `correctness` reviewer over all
reviewable files. Spawn them **in a single message** so they run in parallel.

```
skill: .claude/skills/onion-architecture/SKILL.md      # or the literal word: correctness
repo_root: <absolute path of the repository>
merge_base: <sha from collect-diff>
files:
  - server/src/modules/pulls/service.ts
  - ...
severity_rubric: .claude/skills/pr-self-review/references/severity.md
contract: .claude/skills/pr-self-review/references/reviewer-contract.md
```

More than ~25 files for one skill: split the list into chunks of ≤ 25 and spawn one reviewer per chunk
(same `skill`), so no reviewer's context fills up with diffs.

## Reviewer output

Exactly one JSON object, nothing else:

```json
{
  "skill": "onion-architecture",
  "files_reviewed": ["server/src/modules/pulls/service.ts"],
  "rubric_read": [".claude/skills/onion-architecture/SKILL.md", ".claude/skills/onion-architecture/references/devdigest.md"],
  "findings": [
    {
      "severity": "CRITICAL",
      "file": "server/src/modules/pulls/service.ts",
      "line": 42,
      "rule": "onion-layer-violation: application code imports drizzle-orm",
      "title": "Service queries the database directly",
      "evidence": "import { eq } from 'drizzle-orm';",
      "why": "SKILL.md principle 1: the database is in the outer ring; services take a port.",
      "fix": "Add a method to PullStore in ports.ts, implement it in repository.ts, call the port."
    }
  ]
}
```

- `severity`: `CRITICAL` | `WARNING` | `SUGGESTION` — by [severity.md](severity.md).
- `line`: a 1-based line **in the current file** that the change added or modified.
- `rule`: for CRITICAL a rule id from severity.md, then `: detail`; otherwise the skill principle or
  checklist item, quoted or paraphrased closely enough to find in the skill.
- `rubric_read`: the SKILL.md and reference files the reviewer actually opened (`[]` for `correctness`). The orchestrator
  treats an empty list on a skill reviewer as a reviewer that skipped its rubric and spawns it again once.
- `skill` is added by the orchestrator when the reviewer omits it.

## Verifier prompt

One `pr-finding-verifier` per CRITICAL finding, all in one message.

```
finding: { file, line, rule, title, evidence, why, fix }
repo_root: <absolute path>
merge_base: <sha>
severity_rubric: .claude/skills/pr-self-review/references/severity.md
contract: .claude/skills/pr-self-review/references/reviewer-contract.md
```

Skip verification for findings the tools produced: `check-failed` and `hand-edited-generated` are facts.

## Verifier output

```json
{ "verdict": "confirmed", "reason": "server/src/modules/pulls/service.ts:42 imports drizzle-orm; added in this diff; onion Principle 1.", "line": 42 }
```

`verdict` is `confirmed` | `downgrade` | `refuted`. `line` is set only if the reported line was off.

## Merging

1. `confirmed` → keep CRITICAL (apply corrected `line`).
2. `downgrade` → severity WARNING, add `"downgraded_from": "CRITICAL"` and the verifier's reason.
3. `refuted` → drop it, but mention it in the chat report ("N findings refuted by the verifier").
4. Deduplicate: same `file`, lines within 2 and the same underlying cause (for example a raw `fetch` reported by
   two skills) → keep one, highest severity, `skill` becomes a string joined with `", "`. A finding that only restates a
   failed check at the same `file:line` is dropped: the check already blocks and is named in the report.
   Different causes at nearby lines stay separate.
5. Decode HTML entities (`&lt;`, `&gt;`, `&amp;`) that transport added to `evidence` or `rule`, then write the merged list
   to `findings.json`: a bare JSON array of finding objects, as `write-verdict.mjs` reads it. Findings for failed checks,
   unmapped skills and suspicious generated files are not written by hand; the script derives them.
