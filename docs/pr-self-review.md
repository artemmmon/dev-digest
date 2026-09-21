# PR self-review

Before a pull request is opened, the `pr-self-review` skill reviews your local changes against the project's
own skills and stores a verdict. A hook checks that verdict before `git push`, `gh pr create` and
`gh pr merge`. One confirmed CRITICAL finding means BLOCK.

Design, sources and the evaluation log: [`.claude/skills/pr-self-review/README.md`](../.claude/skills/pr-self-review/README.md).

## Use it

1. Once per clone, install the git hook:

   ```bash
   ./scripts/install-hooks.sh
   ```

   The Claude Code hook needs no install; it ships in `.claude/settings.json`.

2. In Claude Code, run `/pr-self-review` (add `--base <ref>` to look at a different range; the gate still uses its own scope). Claude never starts it on its own (`disable-model-invocation`): when a push is blocked, it asks you to run it.

3. Read the report. On **PASS** open the PR. On **BLOCK** fix every CRITICAL and run the review again.

**What is reviewed.** A branch that was never pushed is reviewed as the whole pull request (everything since it left
`main`). Once the branch is on the remote, only the commits and edits the remote does not have yet are reviewed, so a
small follow-up push gets a small review.

The verdict is tied to the content of your change. Editing a file, or moving the base branch, makes it stale, and
the next push asks for a new review. Committing files you already reviewed does not.

## What it checks

| Step | What | Where |
|---|---|---|
| Checks | `typecheck`, `lint`, unit tests of the packages you touched; `pnpm arch` for `server/`; `shared-contracts.sh check` for `vendor/shared` | `assets/run-checks.mjs` |
| Skill review | One reviewer per skill on the files that skill governs (UI files → frontend skills, `server/src/modules/**` → onion + Fastify, …) | `assets/routing.json` |
| Correctness | One reviewer reads every changed file for logic bugs | `references/severity.md` |
| Verification | A stronger model tries to refute each CRITICAL; unconfirmed ones become WARNING | `references/reviewer-contract.md` |

What counts as CRITICAL is a closed list: failed checks, layer violations, contract drift, exploitable security
issues, hand-edited generated files, cross-package relative imports, DB tests outside `.it.test.ts`, and demonstrable
defects. Everything else is a WARNING or SUGGESTION and never blocks.

`.it.test.ts` files and the e2e flows are not run (they need Postgres and browsers); CI runs them.

## When a push is blocked

```
pr-self-review: no verdict for branch "lesson-03". Run /pr-self-review …
pr-self-review: the verdict is stale — files changed after the review …
pr-self-review: BLOCK — 2 critical issue(s): …
```

Run the review. To see what would happen without pushing:

```bash
node .claude/skills/pr-self-review/assets/gate-check.mjs status
```

### Override (you, not Claude)

If you decide a BLOCK is wrong or the change is urgent, push from your own terminal with a reason:

```bash
PR_SELF_REVIEW_OVERRIDE="hotfix: reviewed by hand" git push
```

The reason is stored in the verdict and in `.git/pr-self-review/overrides.log`; quote it in the PR description.
Claude never sets this variable: if a command it runs contains it, the hook asks you to approve.

## Limits

- It cannot stop the Merge button on github.com. Only branch protection with a required status check can.
- `git push --no-verify` and clones without the installed hook skip the git layer.
- Only the checked-out branch is gated.
- `gh pr create` on an already pushed branch finds nothing unpushed and passes: the review that counts is the one at the first push.
- Subagent definitions added in the middle of a session register late; the skill falls back to `general-purpose`.

## Maintain it

| Change | Do |
|---|---|
| New skill in `.claude/skills/` | Add it to `assets/routing.json` (`rules` or `nonReviewSkills`); the review warns about unmapped skills |
| New package or check | Add it to `routing.json` → `packages` |
| Any script change | `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'` (CI runs it too) |
| Any rule or routing change | Bump the version and add a changelog row in the skill's README |
