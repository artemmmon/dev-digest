---
name: pr-self-review
description: Pre-PR self-review of the local changes on the current DevDigest branch. Maps every changed file to the project skills that apply (frontend-architecture, react-best-practices, next-best-practices, onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, security, ...), runs typecheck/lint/unit tests/arch checks, runs one read-only reviewer per skill plus a correctness reviewer, verifies every CRITICAL finding, and records a PASS or BLOCK verdict that a hook checks before git push, gh pr create and gh pr merge. Use before opening a pull request or pushing a branch for review, when the user says "self-review", "review my changes", "ready for PR" or "check before PR", and when the gate reports a missing or stale verdict, even if the user never names the skill. Not for reviewing someone else's PR (use code-review) and not for fixing the findings.
argument-hint: "[--base <ref>]"
metadata:
  version: "1.0.0"
---

# PR Self Review

Reviews **your own unpushed work** against the project's skills, then writes a verdict the gate enforces.
Rules come from the sources in [README.md](README.md); `[S12]` marks source #12 there.

> **In DevDigest?** Read [references/devdigest.md](references/devdigest.md) once: real checks per package,
> Node 22 requirement, known gaps.

## The one rule

**A push, PR or merge needs a fresh PASS verdict. PASS means: no failed check, no confirmed CRITICAL finding.**
One confirmed CRITICAL is BLOCK, and you do not open the PR. Never work around the gate, and never set
`PR_SELF_REVIEW_OVERRIDE` yourself; only the user overrides, in their own terminal.

## Principles

1. **Deterministic checks first.** Typecheck, lint, tests and `pnpm arch` run as a script before any model judges
   anything. *Why:* they are cheap, repeatable and cannot hallucinate; models handle what tools cannot [S5][S6].
2. **Route by path; one rubric per reviewer.** Each reviewer gets one skill and only the files that skill governs
   (`assets/routing.json`). *Why:* focused context beats one generalist, and path-scoped rules are how teams already
   assign conventions [S15][S26][S27].
3. **CRITICAL is a closed list, and every finding carries evidence.** File, changed line, rule, quoted code
   ([severity.md](references/severity.md)). *Why:* a blocking comment must be unambiguous and reviewers must
   ground claims in quotes [S9][S12]; schemas cannot enforce line ranges, so code validates them [S13].
4. **Verify before you block.** A separate, stronger verifier tries to refute each CRITICAL; unconfirmed ones drop to
   WARNING. *Why:* a coordinator pass that removes speculative findings is what keeps AI review usable [S15][S16], and
   judges are biased, so the verifier starts from doubt [S18].
5. **Judge only what changed, and keep the unit small.** Findings must sit on changed lines; large groups are split.
   *Why:* review quality drops as change size grows [S8][S10].
6. **Code computes the verdict and binds it to the content.** `write-verdict.mjs` decides PASS/BLOCK; the gate compares a
   content hash. *Why:* a gate that a model can talk its way past is not a gate; layered client-side hooks are bypassable,
   so state exactly what they cover [S1][S20][S21][S22].
7. **Only a human overrides.** *Why:* a bypass list is a deliberate, named exception, not something the reviewed party grants itself [S23].
8. **Say what was not verified.** A check that could not run, files only one reviewer read, an unmapped skill: all go in the report.

## Workflow (copy and tick off)

Scratch files go in the session scratchpad (or a temp dir), never in the repo. `A` = `${CLAUDE_SKILL_DIR}/assets`.
Use Node ≥ 22 for step 2 (`run-checks.mjs` exits 4 otherwise; put a Node 22 bin first on PATH).

```
- [ ] 1. Collect     node A/collect-diff.mjs $ARGUMENTS > collect.json
- [ ] 2. Checks      node A/run-checks.mjs < collect.json > checks.json
- [ ] 3. Review      one pr-skill-reviewer per skill_groups entry + one `correctness`, ALL in one message
- [ ] 4. Verify      one pr-finding-verifier per reviewer CRITICAL, ALL in one message
- [ ] 5. Verdict     merge findings → findings.json; node A/write-verdict.mjs --collect … --checks … --findings …
- [ ] 6. Report      in the user's language; PASS → carry on, BLOCK → stop
```

1. **Collect.** `empty: true` → say there is nothing to review and stop. Exit code 3 means `routing.json` names a
   skill that is not installed: report it and stop. Note `unmapped_skills`, `suspicious_generated`, `correctness_only`.
2. **Checks.** Runs only the touched packages' checks. Exit 1 means a check failed: expected, keep going, the review
   still runs so the report is complete. `fail` blocks; `error` (could not run) is reported as not verified. Do not fix
   and rerun silently: report failures, let the user decide.
3. **Review.** Prompt shape and JSON contract: [reviewer-contract.md](references/reviewer-contract.md). Spawn all reviewers
   (`pr-skill-reviewer`) in a **single message** so they run in parallel, with `run_in_background: false`: step 4 needs every
   result, and stopping to wait on a backgrounded reviewer ends your turn early. Split a skill's files into chunks of 25.
   Give each reviewer its `skill` (the SKILL.md path), `repo_root`, `merge_base`, `files` and the two reference paths.
   The `correctness` reviewer gets `reviewable` from `collect.json` (added or modified, not generated).
   Definitions added during the current session can register late: if the harness says "not found", fall back to
   `general-purpose` with `model` `sonnet` (reviewers) or `opus` (verifier) and a prompt made of the agent file's body
   **without its YAML frontmatter**, a `--- TASK ---` line, then the task fields. The fallback loses the agents'
   `disallowedTools`: say "read-only, edit nothing" in the prompt and check `git status` afterwards.
4. **Verify.** Same rules: one message, `run_in_background: false`. Skip findings that come from tools (`check-failed`,
   `hand-edited-generated`). Merge verdicts per the contract: confirmed stays CRITICAL; downgrade and refuted do not block.
5. **Verdict.** `findings.json` is a bare JSON array of reviewer findings; `[]` is valid. Do not create findings for
   failed checks, `unmapped_skills` or `suspicious_generated`: `write-verdict.mjs` reads them from `collect.json` (suspicious generated files
   block by themselves; unmapped skills are stored and reported as a WARNING). It rejects findings missing `file`, `line`,
   `rule` or `title`: fix them, do not delete the check. Exit 1 = BLOCK, 0 = PASS.
6. **Report** (short, no praise padding):
   - verdict line and counts; the skill → files table; not verified;
   - each CRITICAL: `file:line`, rule, quoted code, fix;
   - WARNINGs grouped by skill, one line each; SUGGESTIONs only as a count;
   - "N findings refuted by the verifier", unmapped skills, files only the correctness reviewer read;
   - if the verdict file holds an `override`, say so and quote the reason (it also goes in the PR description).

## Before opening a PR

Asked to open a PR (or push for review)? Run this workflow first. PASS: open the PR, and remind the user the verdict
is bound to the current content, so a later edit needs a rerun. BLOCK: show the CRITICALs and stop. The hooks enforce
the same thing: if one blocks you, run the review instead of retrying the command ([gate.md](references/gate.md)).

## Check

Whether a push would pass right now, and the script tests (no network, temp repos):

```bash
node ${CLAUDE_SKILL_DIR}/assets/gate-check.mjs status
node --test '${CLAUDE_SKILL_DIR}/assets/tests/*.test.mjs'
```

## Read next

| When you are… | Read |
|---|---|
| Sending a prompt to a reviewer or verifier, or merging their output | [reviewer-contract.md](references/reviewer-contract.md) |
| Unsure whether something is CRITICAL | [severity.md](references/severity.md) |
| Wondering why a file went to (or missed) a skill, or adding a skill | [routing.md](references/routing.md) |
| Explaining a block, an override, or what the gate cannot stop | [gate.md](references/gate.md) |
| Working in this repo (checks, Node, known gaps, open questions) | [devdigest.md](references/devdigest.md) |
| Checking why a rule exists or where sources disagree | [README.md](README.md) |

## Out of scope

- Fixing findings: this skill only reports. Editing code, committing and pushing stay with the user.
- Someone else's PR or a general bug hunt → `code-review`. Security deep-dives → `security-review`.
- Posting a GitHub status or protecting the Merge button (see devdigest.md, open question 1).
- Running `.it.test.ts` files or the e2e flows (they need Postgres and browsers; CI runs them).
