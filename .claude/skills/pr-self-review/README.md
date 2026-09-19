# pr-self-review

Reviews the local, not-yet-pushed changes of a DevDigest branch before a pull request is opened. Maps each
changed file to the project skills that govern it, runs the package checks, runs one read-only reviewer per
skill plus a correctness reviewer, verifies every CRITICAL, and stores a PASS/BLOCK verdict that a Claude Code
hook and a git `pre-push` hook enforce. Fixing findings, reviewing other people's PRs and protecting the Merge
button on GitHub are out of scope.

- **Version:** 1.1.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-09-19
- **Related skills:** `onion-architecture`, `frontend-architecture`, `react-best-practices`, `next-best-practices`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `typescript-expert`, `security`, `react-testing-library` (the rubrics it routes to)
- **Companions outside this folder:** `.claude/agents/pr-skill-reviewer.md`, `.claude/agents/pr-finding-verifier.md`, `.claude/settings.json` (PreToolUse hook), `scripts/install-hooks.sh`, `.github/workflows/pr-self-review.yml`, `docs/pr-self-review.md`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-19 | Initial version: 30 sources, 5 references, 6 scripts + 36 script tests, 2 subagents, PreToolUse + pre-push gate, 5 evals (see Evaluation log) |
| 1.1.0 | 2026-09-19 | Review scope follows the remote: a never-pushed branch is reviewed as the whole pull request, a branch with an upstream only for what is unpushed (`scope` in `collect.json` and the verdict); 5 script tests; eval `incremental-push` |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule, reference or check,
**major** when a rule is reversed. Add a changelog row each time. Changing `routing.json` is a minor bump.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one rule, principles, the 6-step workflow, report format, Check, Read next |
| [references/severity.md](references/severity.md) | What is CRITICAL (a closed list of rule ids), WARNING, SUGGESTION; the evidence bar |
| [references/reviewer-contract.md](references/reviewer-contract.md) | Prompt and JSON for reviewers and verifier; how findings are merged |
| [references/routing.md](references/routing.md) | Why each glob maps to which skills; drift check; how to change the table |
| [references/gate.md](references/gate.md) | Hooks, verdict file, freshness, override, what the gate cannot stop |
| [references/devdigest.md](references/devdigest.md) | Repo facts, checks per package, how to run, known gaps, open questions |
| [assets/routing.json](assets/routing.json) | The routing table itself (single source of truth) |
| [assets/collect-diff.mjs](assets/collect-diff.mjs) | Step 1: change set, skill groups, checks to run, drift, suspicious generated files |
| [assets/run-checks.mjs](assets/run-checks.mjs) | Step 2: deterministic checks of the touched packages |
| [assets/write-verdict.mjs](assets/write-verdict.mjs) | Step 5: computes PASS/BLOCK, rejects incomplete findings, stores the verdict |
| [assets/gate-check.mjs](assets/gate-check.mjs) | The gate: `claude-hook`, `git-hook`, `status` |
| [assets/lib.mjs](assets/lib.mjs) | Shared: glob matcher, git helpers, content hash, verdict path |
| [assets/pre-push](assets/pre-push) | The git hook (installed by `scripts/install-hooks.sh`) |
| [assets/tests/](assets/tests) | 36 tests in throw-away git repos: routing, hashing, verdict, gate, real `git push` through the hook |
| [evals/evals.json](evals/evals.json) | 6 evaluation scenarios with expected behaviour |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **SV** severity · **RC** reviewer-contract · **RT** routing · **GT** gate · **DD** devdigest ·
**RM** this README only (background or conflicts).

### Q1. Claude Code mechanics (skills, hooks, subagents)

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S1 | Hooks reference | Anthropic (Claude Code docs) | https://code.claude.com/docs/en/hooks | `if` sits on the individual hook handler; exit code 2 blocks a PreToolUse call and the block holds even in bypass mode; `permissionDecision` values include `ask`; `if` matching is best-effort, so use the permission system for hard enforcement | living doc, no date shown | SK GT |
| S2 | Automate actions with hooks | Anthropic | https://code.claude.com/docs/en/hooks-guide | Same `if` shape, which Bash commands trigger a filtered hook (each subcommand of `&&` chains and `$()` is checked, unknown shapes run the hook anyway) | living doc | SK GT |
| S3 | Extend Claude with skills | Anthropic | https://code.claude.com/docs/en/skills | SKILL.md under 500 lines with detail in supporting files; bundled scripts via `${CLAUDE_SKILL_DIR}`; frontmatter fields; `description` + `when_to_use` truncated at 1,536 characters | living doc | RM |
| S4 | Create custom subagents | Anthropic | https://code.claude.com/docs/en/sub-agents | Restrict with `tools`/`disallowedTools`; `model` accepts `sonnet`, `opus`, `haiku`, a full id or `inherit`; independent investigations can run as parallel subagents (default cap 20) | living doc | RC RM |
| S5 | Skill authoring best practices | Anthropic | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | Concise, third-person "what + when" description (≤ 1,024 chars); references one level deep; build evaluations first; validate in a loop; prefer running scripts to generating code | living doc | SK |
| S6 | Equipping agents for the real world with Agent Skills | Barry Zhang, Keith Lazuka, Mahesh Murag (Anthropic engineering) | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | Three-tier loading (metadata, SKILL.md, bundled files); bundle scripts for deterministic work; iterate on observed agent behaviour | 2025-10-16, updated 2025-12-18 | SK |

### Q2. Code-review practice

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S7 | What to look for in a code review | Google (eng-practices) | https://google.github.io/eng-practices/review/reviewer/looking-for.html | Look at design first, then functionality, complexity, tests, naming, comments, style | no date shown | RM |
| S8 | Small CLs | Google (eng-practices) | https://google.github.io/eng-practices/review/developer/small-cls.html | One conceptual change per review; about 100 lines is reasonable, about 1000 usually too large | no date shown | SK |
| S9 | Conventional Comments | Paul Slaughter | https://conventionalcomments.org/ | Label comments; a `(blocking)` decoration means it must be resolved before acceptance, `(non-blocking)` must not prevent it | © 2025 | SK SV |
| S10 | Code Review at Cisco Systems | SmartBear (chapter of *Best Kept Secrets of Peer Code Review*) | https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf | 2,500 reviews, 3.2M LOC, 50 developers, 10 months; defect density fell as review size grew; reviewers faster than about 450 LOC/hour found below-average defect density in 87% of cases | May 2006 | SK |
| S11 | Expectations, Outcomes, and Challenges of Modern Code Review | Bacchelli and Bird (Microsoft Research, ICSE) | https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/ | Reviews deliver more knowledge transfer and awareness than defects; understanding the change is the main difficulty | May 2013 | RM |

### Q3. LLM-assisted review

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S12 | Reduce hallucinations | Anthropic | https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations | Ground claims in quotes; ask for supporting evidence per claim and retract what cannot be supported; allow "I don't know" | living doc | SK SV RC |
| S13 | Structured outputs | Anthropic | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | Constrain output to a JSON schema; range constraints (`minimum`, `minLength`) are not enforced, so validate in code | living doc | SK RC |
| S14 | Building Effective Agents | Erik Schluntz, Barry Zhang (Anthropic) | https://www.anthropic.com/engineering/building-effective-agents | Parallelization (sectioning, voting) and evaluator-optimizer loops fit when criteria are clear | 2024-12-19 | RM |
| S15 | Orchestrating AI Code Review at scale | Ryan Skidmore (Cloudflare) | https://blog.cloudflare.com/ai-code-review/ | Up to seven specialist reviewers with structured severity output; a coordinator drops speculative findings and false positives and reads the source when unsure | 2026-04-20 | SK RC |
| S16 | How CodeRabbit delivers accurate AI code reviews on massive codebases | Sahana Vijaya Prasad (CodeRabbit) | https://www.coderabbit.ai/blog/how-coderabbit-delivers-accurate-ai-code-reviews-on-massive-codebases | A verification agent confirms a claim with grep/ast-grep style checks before commenting | 2025-09-05 | SK |
| S17 | Building a better Bugbot | Jon Kaplan (Cursor) | https://cursor.com/blog/building-bugbot | Parallel passes with majority voting helped early; the larger gain came from a fully agentic design | 2026-01-15 | RM |
| S18 | Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena | Zheng et al. (NeurIPS 2023) | https://arxiv.org/abs/2306.05685 | Judges show position, verbosity and self-enhancement bias; swapping positions and requiring consistent verdicts mitigates position bias | 2023-06-09 (final 2023-12-24) | SK |

### Q4. Enforcement gates

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S19 | githooks | Git project | https://git-scm.com/docs/githooks | `pre-push` gets remote name and URL as arguments and one `<local-ref> <local-oid> <remote-ref> <remote-oid>` line per ref on stdin; a non-zero exit aborts the push | git 2.54.0 docs | GT |
| S20 | git-push (`--verify` / `--no-verify`) | Git project | https://git-scm.com/docs/git-push | `--no-verify` bypasses the pre-push hook completely | living doc | SK GT |
| S21 | Pro Git: Git Hooks | Scott Chacon, Ben Straub | https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks | Client-side hooks are not copied on clone; enforce policy with server-side hooks | 2nd ed. | SK GT |
| S22 | About protected branches | GitHub Docs | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches | Required status checks must pass before merge; admins can bypass unless disallowed | living doc | SK GT DD |
| S23 | About rulesets | GitHub Docs | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets | Rulesets layer (most restrictive wins) and carry an explicit bypass list | living doc | SK GT |
| S24 | git-config: `core.hooksPath` | Git project | https://raw.githubusercontent.com/git/git/master/Documentation/config/core.adoc | `core.hooksPath` replaces `$GIT_DIR/hooks` | master | GT |
| S25 | Troubleshooting required status checks | GitHub Docs | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks | A workflow skipped by a path filter leaves its required check Pending and blocks the merge | living doc | DD |

### Q5. Path-based routing of files to rules

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S26 | About code owners | GitHub Docs | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners | Map path patterns to owners; gitignore-like syntax without `!` and `[ ]`; last matching pattern wins | living doc | SK RT |
| S27 | Workflow syntax (`on.<event>.paths`) | GitHub Docs | https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions | `paths` / `paths-ignore` filters with glob patterns decide what runs; they cannot be combined for one event | living doc | SK RT |
| S28 | gitignore: pattern format | Git project | https://git-scm.com/docs/gitignore | `*` does not cross `/`; `**/x` any depth; `a/**` everything inside; `a/**/b` zero or more directories | living doc | RT |
| S29 | Danger JS | Danger org (Orta Therox) | https://danger.systems/js/ | Rules keyed on `modified_files`/`created_files`; `fail()` fails the build, `warn()` does not | living doc | RM |
| S30 | reviewdog | reviewdog org | https://github.com/reviewdog/reviewdog | Filter modes (`added`, `diff_context`, `file`, `nofilter`) and a fail level by severity | living doc | RM |

## Conflicts and outdated guidance

How the skill resolves the places where sources disagree or say nothing:

| Topic | Positions | Skill's rule |
|---|---|---|
| One generalist vs specialists | Cursor moved to a single agentic reviewer and credits it for the largest gain [S17]; Cloudflare runs up to seven specialists plus a coordinator [S15] | Specialists, because each project skill is already a rubric; a correctness reviewer covers what no skill does |
| Voting vs verification | Majority voting over passes [S14][S17] vs one verifier that checks a claim against the code [S15][S16] | Verification, and only for CRITICALs (the ones that block). No voting: it multiplies cost and does not check a claim against the code |
| Review-size numbers | Google: about 100 lines, 1000 is too large [S8]; SmartBear page: 200-400 LOC [S10 and its best-practices page]; the Cisco chapter itself gives 450 LOC/hour as a speed limit, not the 200-400 range; a widely quoted blog paraphrase differs again | No LOC threshold is claimed. Reviewers get at most 25 files and judge changed lines only |
| Where the gate lives | Client-side hooks are bypassable and not cloned [S20][S21]; server-side required checks are the real gate [S22][S23], but path-filtered required checks can hang [S25] | Local hooks now, as a guardrail for the author; a GitHub status is an open question (devdigest.md) |
| Hook filter as enforcement | `if` filtering is best-effort; use permissions for hard rules [S1][S2] | The hook script re-parses the command itself, and the git hook is the backstop; permissions cannot express "verdict is fresh" |
| Schema-enforced output | JSON schema outputs [S13] vs schemas cannot enforce ranges | `write-verdict.mjs` validates `file`, `line`, `rule`, `severity`, `title` in code |
| Description length | 1,536 characters truncated in Claude Code [S3]; 1,024 in the skill spec [S5] | Stay under 1,024 (this one is ~870) |
| Parallel subagents from a skill | Docs describe parallel subagents [S4] but do not say that a skill running in the main conversation can spawn them; they also say skills do not invoke subagents directly | The workflow tells Claude to spawn all reviewers in one message; the evals check that it happens |
| Custom subagents added mid-session | Not documented | Not registered at first, registered later in the same session (observed 2026-09-19); SKILL.md tries the named type and falls back to `general-purpose` |
| Scope of a re-review | Reviewing the whole PR on every push matches what a PR is, but 300+ files per small push makes the gate unusable; no source addresses gates for AI review scope | Full review at the first push, incremental afterwards (this project's decision, 2026-09-19); `gh pr create` on a pushed branch therefore trusts the last push |
| Severity vocabulary | Conventional Comments labels [S9] vs the product's own `CRITICAL / WARNING / SUGGESTION` | The product's words (they already exist in `specs/02-findings-severity.md`); "blocking" = CRITICAL |

## Notes on verification

- All URLs were fetched on 2026-09-19 by research subagents through WebFetch, which summarises pages with a small
  model: entries are paraphrases, not quotes. S15, S17 and S20 were re-fetched by hand with matching results.
- The `hooks` page is large; a first summary wrongly said `ask` and `defer` were undocumented. The raw hooks-guide text
  documents them, and the values above come from that text.
- S10 is a PDF the fetcher could not parse; the agent decompressed it locally. The 200-400 LOC / 70-90% figures
  are on SmartBear's best-practices page, not in the Cisco chapter. The Cisco data is observational.
- S11 says nothing about a review-size threshold and is not cited for one. S4's and S21's authors are attributions of the
  research agent where the fetch did not show them.
- The OWASP Code Review Guide project page is a stub and its repository is archived; it is not cited.
- Anthropic docs pages show no last-updated date. Vendor blog posts (S15, S16, S17) are vendor write-ups, not
  independent measurements; none of them gives a false-positive baseline.

## Evaluation log

Scenarios in `evals/evals.json`, run by a fresh Claude instance that had only `SKILL.md` and its references as guidance,
in an independent scratch clone (its own `origin/main`, so the diff is just the scenario).

| Date | Scenario | Result | Change made |
|---|---|---|---|
| 2026-09-19 | (script tests) | 28 tests pass on Node 22: routing, hashing, verdict, gate, command detection, real `git push` through a pre-push hook | Found and fixed while building: the command matcher treated `git push` inside quotes, commit messages and heredocs as a push (it blocked the author's own command); it now looks only at executed text (`bash -c`, `$()`, backticks) |
| 2026-09-19 | onion-violation | Pass: `pnpm arch` failed → `check-failed`; onion reviewer raised two `onion-layer-violation` CRITICALs with quoted imports; both confirmed by the opus verifier; verdict BLOCK, gate `status` exit 1 | **Gaps:** step 4 wording implied tool findings live in `findings.json` (they are derived by `write-verdict.mjs`); nothing said how to wait for reviewers (they were backgrounded) or how to build the fallback prompt. Fixed in SKILL.md steps 3-5; contract gained `repo_root` and the merge/dedup rules |
| 2026-09-19 | ui-only-diff | Pass: packages = client only; reviewers only for frontend-architecture, react-best-practices, next-best-practices, security + correctness; only client checks ran; verdict BLOCK because the scenario's raw `fetch` breaks a client lint rule and the endpoint it calls does not exist (verifier confirmed `correctness-defect`); missing `index.ts` and hardcoded strings stayed WARNING | **Gaps:** dedup of a reviewer finding that restates a failed check, `skill` field format when merged, HTML-escaped evidence, `findings.json` is a bare array, `run-checks` exit 1 is expected. All written into reviewer-contract.md and SKILL.md; eval expectations updated to match |
| 2026-09-19 | clean-diff | Pass: PASS, no invented findings, both reviewers returned `[]`, `gate-check status` = ALLOW | **Gap:** the instance backgrounded the reviewers and ended its turn early (the wording did not say otherwise) → steps 3-4 now require `run_in_background: false`. `run-checks` output stripped of ANSI codes; contract gained `rubric_read` so a reviewer that skipped its rubric is visible |
| 2026-09-19 | unmapped-skill | Pass: `api-docs` reported in `unmapped_skills`, WARNING in the report, verdict PASS, changed `page.tsx` still reviewed by client skills | **Gap:** the instance had to invent `file`/`line`/`title` for a finding about the unmapped skill. `write-verdict.mjs` now counts unmapped skills as warnings itself and SKILL.md forbids hand-made findings for them; `collect-diff` gained `reviewable` (what the correctness reviewer reads) |
| 2026-09-19 | stale-verdict | Mechanics pass, behaviour partly checked: script tests cover no-verdict, stale after edit, BLOCK, override, and a real `git push` through the hook. The live PreToolUse hook blocked a `git push --dry-run` on `lesson-02` (no verdict) in the authoring session and the block was not retried or overridden | Not run as a fresh-instance scenario: a subagent's Bash calls do not reproduce the session hook's `cwd`, so "Claude reruns the review instead of retrying" is unverified. Repeat it in a new session |

Every fresh instance found the reviewer subagents unregistered at first, then registered later in the same session (see the Conflicts table); the fallback in SKILL.md step 3 worked each time. The instances ran the earlier SKILL.md text; the fixes above were applied after their notes and are **not re-run**.
