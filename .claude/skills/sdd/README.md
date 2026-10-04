# sdd

The `/sdd` command: one entry point that takes a spec, a plan, designs and a requirements prompt
in any mix, finds the stage the feature is in and runs it through the `feature-flow` route, with
a bounded architecture review loop. It holds no route of its own — the stages, prompts and gates
are `feature-flow`'s — so there is one place to change the flow.

- **Version:** 1.1.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-10-04 (see "Notes on verification")
- **Related skills:** `feature-flow` (the route; loaded by this command), `spec-authoring`,
  `pr-self-review` (run by the user after the command ends)

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-04 | First version: argument sorting, entry-stage table, the three ask-first cases, the review loop (CRITICAL + WARNING, `architecture-reviewer` `recheck:`, 3 rounds), `--mode` / `--from` / `--until`; 3 evals |
| 1.1.0 | 2026-10-04 | `--only spec` / `--only plan` run one agent and stop; `--tests` turns `test-writer` on (off by default) |

Bump the version on every change: **patch** for wording/links, **minor** for a new argument or
rule, **major** when the entry rule or the loop's fix scope changes. Add a changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one rule, how arguments are sorted, the entry stage, when to ask first, the run checklist, the review loop |
| [references/devdigest.md](references/devdigest.md) | Example invocations and what each does, stage names, open questions |
| [evals/evals.json](evals/evals.json) | 4 evaluation scenarios with expected behaviour |

No `assets/`: the runnable checks this command relies on are `feature-flow`'s `check-plan.mjs`
and `scripts/check-changed.sh`.

## Decisions (the user's, 2026-10-04)

| Question | Chosen | Not chosen |
|---|---|---|
| What the loop fixes | Architecture CRITICAL and WARNING on changed lines; SUGGESTION goes to the closing report | Only CRITICAL · asking after every review |
| Rounds | 3, then stop and ask | 2, as on the verifier and security gates |
| Who runs execution | The main session, by this skill | A deterministic Workflow script for the build-to-docs part |
| New tests | Nobody writes them by default, for now; `--tests` turns `test-writer` on for one feature | The implementer writing them again · `test-writer` only by hand |
| Models | `brainstorm`, `architecture-reviewer` and `security-reviewer` on sonnet; `brainstorm` stays a required stage of the full flow | Keeping `security-reviewer` on opus · making `brainstorm` optional (`--brainstorm`) |
| Name | `/sdd`, a thin entry skill | `/feature` · making `feature-flow` itself the command |

Why a separate entry and not `feature-flow` itself: `feature-flow` stays model-invocable (Claude
loads it when a feature is being built, without being asked), while a command that starts agents
for a whole feature should run only when the user types it.

## Sources

| Source | Rule it grounds |
|---|---|
| [feature-flow](../feature-flow/README.md) and its sources `[S1]`–`[S7]` | The route, the gates, the handoffs, bounded fix rounds |
| `.claude/agents/architecture-reviewer.md` | `recheck:` input, finding ids, `in_change` |
| `.claude/skills/pr-self-review/references/severity.md` | What CRITICAL and WARNING mean for architecture findings |
| [Skills](https://code.claude.com/docs/en/skills) (Claude Code docs) | `$ARGUMENTS`, `argument-hint`, `disable-model-invocation` for a user-run command |

## Notes on verification

- The Claude Code skills page was not fetched for this skill; the three frontmatter fields are
  used the same way as in this repo's `pr-self-review` skill, which was checked on 2026-09-19.
- The loop's bound (3) and fix scope are decisions, not measurements.

## Evaluation log

| Date | Version | Result |
|---|---|---|
| 2026-10-04 | 1.0.0 | Not run yet |
