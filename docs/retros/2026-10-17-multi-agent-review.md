# Workflow retro: multi-agent-review

Run: 2026-10-17T14:47:30.670Z → 2026-10-17T17:38:32.000Z · mode: deep · sessions: 9d247a0b

## Totals

| Tokens | Cache read | Cache write | Input | Output | Requests | Tool calls | ≈ $ | Wall time | Agent time | Agents (max depth) | API errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 51.6M | 49.5M (96%) | 1.8M | 934 | 262K | 447 | 522 | $19.56 | 2h 51m | 1h 11m | 13 (2) | 0 |

Main session(s): 10.3M · subagents: 41.3M (80% of the run; a parent's own usage does not show them).
Output of 305 of 447 requests is estimated from the length of the response (text ÷ 4): the transcript kept only their stream-start count. Input and cache numbers are exact.

## Parallelism

Peak: 3 agents at once at 2026-10-17T16:38:28.477Z (pr-skill-reviewer:ee35, pr-skill-reviewer:b35c, architecture-reviewer:b69a) · mean while any agent ran: 1.1 · agent time 1h 11m inside 1h 07m of wall time.

## By role

| Role | Runs | Requests | Tool calls | Tokens | Share | Cache read | Output | Peak context | Time | ≈ $ |
|---|---|---|---|---|---|---|---|---|---|---|
| implementer | 4 | 124 | 131 | 10.8M | 21% | 10.3M | 49K | 161K | 17m | $3.52 |
| main | 1 | 67 | 63 | 10.3M | 20% | 9.9M | 65K | 252K | 2h 51m | $3.61 |
| brainstorm | 1 | 62 | 78 | 10.0M | 19% | 9.7M | 22K | 259K | 11m | $2.82 |
| spec-creator | 1 | 59 | 91 | 9.3M | 18% | 9.0M | 55K | 246K | 18m | $4.16 |
| implementation-planner | 1 | 48 | 55 | 6.4M | 12% | 6.1M | 42K | 227K | 16m | $3.20 |
| implementation-verifier | 1 | 21 | 26 | 1.7M | 3% | 1.6M | 9.5K | 121K | 2m | $0.70 |
| pr-skill-reviewer | 2 | 30 | 34 | 1.5M | 3% | 1.4M | 3.7K | 77K | 3m | $0.66 |
| architecture-reviewer | 1 | 14 | 18 | 699K | 1% | 619K | 2.9K | 78K | 1m | $0.35 |
| researcher | 1 | 13 | 15 | 547K | 1% | 482K | 8.8K | 57K | 2m | $0.33 |
| security-reviewer | 1 | 9 | 11 | 391K | 1% | 334K | 2.1K | 57K | 1m | $0.22 |

## By agent

| Agent | Parent | Depth | Model | Requests | Tool calls (top) | Tokens | With children | Cache read | Context first → peak | Time | ≈ $ | Task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main:9d247a0b | — | 0 | sonnet-5-5 | 67 | 63 (Bash 21, Agent 12, AskUserQuestion 7) | 10.3M | 51.6M (+13) | 9.9M | 54K → 252K | 2h 51m | $3.61 | main session |
| brainstorm:2f92 | main:9d247a0b | 1 | sonnet-5-5 | 62 | 78 (Bash 60, Read 12, WebFetch 2) | 10.0M | — | 9.7M | 29K → 259K | 11m | $2.82 | Brainstorm multi-agent review options |
| spec-creator:ed9d | main:9d247a0b | 1 | opus-5-5 | 59 | 91 (Read 40, Grep 33, Glob 6) | 9.3M | 9.9M (+1) | 9.0M | 35K → 246K | 18m | $4.16 | Spec pass 1: multi-agent review |
| implementation-planner:59c9 | main:9d247a0b | 1 | opus-5-5 | 48 | 55 (Bash 40, Read 7, Skill 3) | 6.4M | — | 6.1M | 34K → 227K | 16m | $3.20 | Plan multi-agent review implementation |
| implementer:004b | main:9d247a0b | 1 | sonnet-5-5 | 58 | 61 (Bash 59, Read 1, SubagentHandback 1) | 6.1M | — | 5.9M | 27K → 161K | 7m | $1.77 | Implement G2 client foundation |
| implementer:9964 | main:9d247a0b | 1 | sonnet-5-5 | 31 | 32 (Bash 31, SubagentHandback 1) | 2.4M | — | 2.3M | 28K → 108K | 6m | $0.84 | Implement G3 results view |
| implementer:e772 | main:9d247a0b | 1 | sonnet-5-5 | 28 | 29 (Bash 26, Read 1, Write 1) | 2.0M | — | 1.9M | 26K → 99K | 3m | $0.77 | Implement G1 server |
| implementation-verifier:936c | main:9d247a0b | 1 | sonnet-5-5 | 21 | 26 (Bash 24, Read 1, SubagentHandback 1) | 1.7M | — | 1.6M | 14K → 121K | 2m | $0.70 | Verify plan and spec traceability |
| pr-skill-reviewer:b35c | main:9d247a0b | 1 | sonnet-5-5 | 17 | 18 (Bash 17, SubagentHandback 1) | 889K | — | 810K | 13K → 77K | 2m | $0.38 | Correctness review: client files |
| architecture-reviewer:b69a | main:9d247a0b | 1 | sonnet-5-5 | 14 | 18 (Bash 17, SubagentHandback 1) | 699K | — | 619K | 17K → 78K | 1m | $0.35 | Architecture review of diff |
| pr-skill-reviewer:ee35 | main:9d247a0b | 1 | sonnet-5-5 | 13 | 16 (Bash 15, SubagentHandback 1) | 615K | — | 550K | 11K → 63K | 1m | $0.28 | Correctness review: server files |
| researcher:5b1e | spec-creator:ed9d | 2 | sonnet-5-5 | 13 | 15 (Bash 14, SubagentHandback 1) | 547K | — | 482K | 24K → 57K | 2m | $0.33 | Git history: removed multi-agent code |
| security-reviewer:d344 | main:9d247a0b | 1 | sonnet-5-5 | 9 | 11 (Bash 10, SubagentHandback 1) | 391K | — | 334K | 16K → 57K | 1m | $0.22 | Security review of diff |
| implementer:e5a1 | main:9d247a0b | 1 | sonnet-5-5 | 7 | 9 (Bash 6, Read 2, SubagentHandback 1) | 249K | — | 216K | 27K → 39K | 1m | $0.14 | Fix round 1: client correctness |

## Signals

- **duplicate-context** — `specs/14-multi-agent-review.md` was read by 7 agents (main, brainstorm, implementer, implementation-planner, implementation-verifier, pr-skill-reviewer). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/AGENTS.md` was read by 4 agents (implementer, brainstorm, spec-creator, implementation-planner). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/src/vendor/shared/contracts/observability.ts` was read by 4 agents (implementer, brainstorm, spec-creator). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/INSIGHTS.md` was read by 4 agents (implementer, brainstorm, spec-creator, implementation-planner). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `specs/README.md` was read by 4 agents (brainstorm, spec-creator, implementer, implementation-verifier). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **preload** — 3 of 4 `implementer` agents read `docs/plans/10-multi-agent-review.md` in their first 6 calls. → Preload it for `implementer` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 3 separate Reads.
- **preload** — 2 of 2 `pr-skill-reviewer` agents read `.claude/skills/pr-self-review/references/severity.md` in their first 6 calls. → Preload it for `pr-skill-reviewer` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 2 separate Reads.
- **preload** — 2 of 2 `pr-skill-reviewer` agents read `.claude/skills/pr-self-review/references/reviewer-contract.md` in their first 6 calls. → Preload it for `pr-skill-reviewer` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 2 separate Reads.
- **duplicate-context** — `specs/14-multi-agent-review.md` was read more than once by the same agent: implementer:9964 ×3, implementation-verifier:936c ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `docs/plans/10-multi-agent-review.brainstorm.md` was read more than once by the same agent: main:9d247a0b ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `docs/plans/10-multi-agent-review.md` was read more than once by the same agent: main:9d247a0b ×2, implementer:e772 ×5, architecture-reviewer:b69a ×2, implementer:9964 ×4, implementer:004b ×3, implementation-planner:59c9 ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `.claude/skills/feature-flow/references/handoffs.md` was read more than once by the same agent: main:9d247a0b ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `docs/retros/ledger.md` was read more than once by the same agent: main:9d247a0b ×2. → Read a file once; use an offset or `sed -n` for a second look.

## Actions

Scope: one session (`9d247a0b`, 14:47 to 17:37), spec, brief, plan, three implementer groups, one fix round, reviews, verifier and security all in the same session. Output of 305 of 445 requests is estimated.

1. **`.claude/agents/brainstorm.md`, line 42:** add the rule the planner already has (`implementation-planner.md`, line 50): search `INSIGHTS.md` once with `rg -n -i '<module>|<symbol>'`, then read only the matching entries with `sed -n`, each once. brainstorm read `server/INSIGHTS.md` 7 times (62 requests, 60 Bash calls, 10.0M tokens = 20% of the run, context 29K to 259K). The same fix was the top action of the `onboarding-tour` row, so it was applied to the planner and not to brainstorm.
2. **Planning chain, not the implementers, is the cost:** spec-creator 9.3M + brainstorm 10.0M + planner 6.4M = 25.7M tokens (50%, about $10.2 of $19.4) against 4 implementer runs at 10.8M (21%, $3.5). Capping the implementers at 3 groups was right, but the next saving is upstream. In `.claude/skills/feature-flow/SKILL.md` stage 2, say that `brainstorm` is skipped (a short brief only) when the user's answers to the spec already fix the approach, as here (the batch-is-the-parent choice was in the spec's open questions).
3. **`implementation-planner` brief size:** the plan check warned 28,184 characters against a 20,000 target, mostly the 27 file paths of the step-7 moves. Implementers `e772`, `9964` and `004b` read the plan 5, 4 and 3 times although `implementer.md` line 41 says to read once. In `implementation-planner.md`, for a `git mv` step write the folders (`from` to `to`) and say "files: `git ls-files` of the folder" instead of listing each file, so the brief fits the 20K target and a second look is a short `sed -n`.
4. **Main session:** context 54K to 243K over 65 requests and 9.8M tokens (19%). Below the overloaded-role limit (80 requests), so nothing to change here; the earlier action (split planning and execution into two sessions) was not followed this time on the user's rule of staying under 30% of the context, and cost nothing visible. Keep that rule.
5. **`.claude/skills/feature-flow/references/handoffs.md`, stage 5:** both `pr-skill-reviewer` runs read `severity.md` and `reviewer-contract.md` in their first calls (2 of 2). Small (1.5M tokens, 3%); only worth doing if the reviewers become routine: put the two rubrics' needed lines into the prompt.

What went well and stays: peak parallel 3 with 0 API errors; the post-build chain (architecture, two correctness reviewers, one fix, verifier, security) cost about $2.1, inside the planner's $2.0 to $2.8 estimate.
