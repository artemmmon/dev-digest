# Workflow retro: onboarding-tour

Run: 2026-10-05T08:55:15.619Z → 2026-10-05T10:58:00.416Z · mode: deep · sessions: d1d79fed

## Totals

| Tokens | Cache read | Cache write | Input | Output | Requests | Tool calls | ≈ $ | Wall time | Agent time | Agents (max depth) | API errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 35.4M | 32.9M (93%) | 2.2M | 775 | 247K | 363 | 477 | $19.52 | 2h 03m | 2h 06m | 18 (1) | 0 |

Main session(s): 9.9M · subagents: 25.5M (72% of the run; a parent's own usage does not show them).
Output of 273 of 363 requests is estimated from the length of the response (text ÷ 4): the transcript kept only their stream-start count. Input and cache numbers are exact.

## Parallelism

Peak: 3 agents at once at 2026-10-05T10:43:08.330Z (pr-skill-reviewer:b29d, architecture-reviewer:a912, pr-skill-reviewer:7089) · mean while any agent ran: 1.2 · agent time 2h 06m inside 1h 46m of wall time.

## By role

| Role | Runs | Requests | Tool calls | Tokens | Share | Cache read | Output | Peak context | Time | ≈ $ |
|---|---|---|---|---|---|---|---|---|---|---|
| main | 1 | 61 | 55 | 9.9M | 28% | 9.6M | 63K | 251K | 2h 03m | $4.90 |
| implementer | 7 | 129 | 139 | 9.7M | 27% | 9.1M | 55K | 134K | 18m | $3.60 |
| implementation-planner | 1 | 31 | 49 | 5.0M | 14% | 4.6M | 49K | 278K | 29m | $3.62 |
| doc-writer | 1 | 33 | 39 | 2.9M | 8% | 2.7M | 11K | 113K | 3m | $0.93 |
| spec-creator | 1 | 16 | 70 | 2.7M | 8% | 2.1M | 34K | 211K | 1h 05m | $3.88 |
| implementation-verifier | 2 | 33 | 41 | 2.1M | 6% | 1.9M | 13K | 125K | 4m | $0.92 |
| brainstorm | 1 | 19 | 31 | 1.6M | 5% | 1.5M | 14K | 125K | 3m | $0.74 |
| architecture-reviewer | 2 | 15 | 20 | 592K | 2% | 511K | 3.8K | 61K | 1m | $0.33 |
| pr-skill-reviewer | 2 | 16 | 20 | 545K | 2% | 453K | 2.5K | 50K | 1m | $0.34 |
| security-reviewer | 1 | 10 | 13 | 450K | 1% | 386K | 2.5K | 64K | 1m | $0.26 |

## By agent

| Agent | Parent | Depth | Model | Requests | Tool calls (top) | Tokens | With children | Cache read | Context first → peak | Time | ≈ $ | Task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main:d1d79fed | — | 0 | opus-5-5 | 61 | 55 (Bash 23, Agent 18, AskUserQuestion 9) | 9.9M | 35.4M (+18) | 9.6M | 59K → 251K | 2h 03m | $4.90 | main session |
| implementation-planner:72b4 | main:d1d79fed | 1 | opus-5-5 | 31 | 49 (Bash 28, Edit 9, Skill 8) | 5.0M | — | 4.6M | 32K → 278K | 29m | $3.62 | Plan: onboarding tour |
| implementer:581c | main:d1d79fed | 1 | sonnet-5-5 | 37 | 39 (Bash 38, SubagentHandback 1) | 3.4M | — | 3.3M | 25K → 134K | 6m | $1.16 | Implement G3: client tour page |
| doc-writer:62ad | main:d1d79fed | 1 | sonnet-5-5 | 33 | 39 (Bash 35, Edit 2, Write 1) | 2.9M | — | 2.7M | 26K → 113K | 3m | $0.93 | Docs for onboarding tour |
| spec-creator:1c6c | main:d1d79fed | 1 | opus-5-5 | 16 | 70 (Read 36, Edit 14, Grep 13) | 2.7M | — | 2.1M | 34K → 211K | 1h 05m | $3.88 | Spec: Onboarding Generator |
| implementer:d503 | main:d1d79fed | 1 | sonnet-5-5 | 27 | 29 (Bash 26, Read 2, SubagentHandback 1) | 2.6M | — | 2.4M | 25K → 125K | 5m | $0.95 | Implement G2: server module |
| implementer:03eb | main:d1d79fed | 1 | sonnet-5-5 | 32 | 34 (Bash 33, SubagentHandback 1) | 2.3M | — | 2.2M | 26K → 98K | 4m | $0.76 | Implement G4: stub, seed, e2e |
| implementation-verifier:62e0 | main:d1d79fed | 1 | sonnet-5-5 | 19 | 26 (Bash 23, Read 2, SubagentHandback 1) | 1.7M | — | 1.5M | 11K → 125K | 2m | $0.71 | Verify SPEC-11 implementation |
| brainstorm:4903 | main:d1d79fed | 1 | sonnet-5-5 | 19 | 31 (Bash 26, Read 1, WebFetch 1) | 1.6M | — | 1.5M | 27K → 125K | 3m | $0.74 | Brainstorm: onboarding tour |
| implementer:181e | main:d1d79fed | 1 | sonnet-5-5 | 13 | 15 (Bash 13, Read 1, SubagentHandback 1) | 694K | — | 621K | 24K → 68K | 1m | $0.35 | Implement G1: contracts and schema |
| architecture-reviewer:a912 | main:d1d79fed | 1 | sonnet-5-5 | 12 | 16 (Bash 15, SubagentHandback 1) | 535K | — | 471K | 15K → 61K | 1m | $0.28 | Architecture review of SPEC-11 |
| security-reviewer:44f5 | main:d1d79fed | 1 | sonnet-5-5 | 10 | 13 (Bash 12, SubagentHandback 1) | 450K | — | 386K | 14K → 64K | 1m | $0.26 | Security review of SPEC-11 |
| implementation-verifier:36a9 | main:d1d79fed | 1 | sonnet-5-5 | 14 | 15 (Bash 14, SubagentHandback 1) | 436K | — | 391K | 12K → 47K | 1m | $0.21 | Verifier recheck after security fix |
| pr-skill-reviewer:7089 | main:d1d79fed | 1 | sonnet-5-5 | 10 | 12 (Bash 11, SubagentHandback 1) | 374K | — | 323K | 9.4K → 50K | 1m | $0.20 | Correctness review: server side |
| implementer:87cd | main:d1d79fed | 1 | sonnet-5-5 | 9 | 10 (Bash 8, Read 1, SubagentHandback 1) | 316K | — | 272K | 25K → 41K | 1m | $0.19 | Fix: block remote images in overview |
| implementer:b875 | main:d1d79fed | 1 | sonnet-5-5 | 6 | 7 (Bash 4, Read 2, SubagentHandback 1) | 179K | — | 153K | 25K → 32K | 1m | $0.11 | Fix round 1: review findings |
| pr-skill-reviewer:b29d | main:d1d79fed | 1 | sonnet-5-5 | 6 | 8 (Bash 7, SubagentHandback 1) | 171K | — | 131K | 9.8K → 39K | 1m | $0.14 | Correctness review: client side |
| implementer:8268 | main:d1d79fed | 1 | sonnet-5-5 | 5 | 5 (Bash 4, SubagentHandback 1) | 138K | — | 115K | 25K → 30K | 25s | $0.09 | Fix round 2: workflow env |
| architecture-reviewer:d0fc | main:d1d79fed | 1 | sonnet-5-5 | 3 | 4 (Bash 3, SubagentHandback 1) | 57K | — | 40K | 15K → 22K | 24s | $0.06 | Architecture recheck round 1 |

## Signals

- **cold-cache** — `spec-creator:1c6c` rewrote its context 2 time(s) after the cache expired (362K tokens written again). → Do not leave a subagent waiting: its cache lives 5 minutes.
- **cold-cache** — `implementation-planner:72b4` rewrote its context 1 time(s) after the cache expired (68K tokens written again). → Do not leave a subagent waiting: its cache lives 5 minutes.
- **duplicate-context** — `specs/11-onboarding-tour.md` was read by 9 agents (main, implementer, implementation-planner, implementation-verifier, doc-writer, spec-creator, brainstorm). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/src/modules/onboarding/tour.ts` was read by 5 agents (main, implementation-verifier, implementer, pr-skill-reviewer, doc-writer). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `.github/workflows/e2e-web.yml` was read by 5 agents (implementer, implementation-planner, pr-skill-reviewer). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/src/adapters/llm/stub.ts` was read by 5 agents (architecture-reviewer, implementation-verifier, pr-skill-reviewer, security-reviewer, doc-writer). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/AGENTS.md` was read by 5 agents (implementer, implementation-planner, spec-creator, brainstorm). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **preload** — 2 of 2 `implementation-verifier` agents read `docs/plans/07-onboarding-tour.md` in their first 6 calls. → Preload it for `implementation-verifier` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 2 separate Reads.
- **preload** — 2 of 2 `pr-skill-reviewer` agents read `.claude/skills/pr-self-review/references/severity.md` in their first 6 calls. → Preload it for `pr-skill-reviewer` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 2 separate Reads.
- **preload** — 2 of 2 `pr-skill-reviewer` agents read `.claude/skills/pr-self-review/references/reviewer-contract.md` in their first 6 calls. → Preload it for `pr-skill-reviewer` (a `skills:` entry, or the lines it needs in the prompt or plan) instead of 2 separate Reads.
- **duplicate-context** — `specs/README.md` was read more than once by the same agent: main:d1d79fed ×2, spec-creator:1c6c ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `specs/11-onboarding-tour.md` was read more than once by the same agent: implementer:581c ×3, implementer:d503 ×2, implementer:03eb ×3, implementation-planner:72b4 ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `docs/plans/07-onboarding-tour.md` was read more than once by the same agent: implementation-verifier:36a9 ×2, implementer:581c ×3, implementer:03eb ×5, implementer:181e ×3. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `e2e/specs/12-onboarding-tour.flow.json` was read more than once by the same agent: doc-writer:62ad ×3. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `e2e/fixtures/llm-stub.json` was read more than once by the same agent: doc-writer:62ad ×2. → Read a file once; use an offset or `sed -n` for a second look.

## Actions

Window: the feature flow only, from the `/sdd` start to the docs commit `84b2139` (`--until 2026-10-05T10:58:02Z`).
The same session then ran follow-up work (turning the feature on, a failed-generation diagnosis, two nav fixes):
with it the session is 44.2M tokens, 395 requests, $23.80, and the main session is 18.7M (context 59K → 294K).

1. **`.claude/agents/implementation-planner.md` (context rule 2) — read `INSIGHTS.md` by matching entries, not in
   full.** The rule says the planner is "the only agent that reads these files in full"; root `AGENTS.md` says to
   search a 40–50 KB file for the module and read the entries that match. The planner read `server/INSIGHTS.md`
   7 times, its context went 32K → 278K over 31 requests, and it cost 5.0M tokens (14% of the run, $3.62, the
   second most expensive agent). Change the rule to one `rg -n` for the touched modules plus `sed -n` of the hits.
2. **`.claude/skills/feature-flow/references/handoffs.md` (spec-creator amendment row) — start a fresh
   `spec-creator` for `amend:`, do not resume the pass-1 agent.** The agent was resumed after the user's answers
   and again for the amendment; both times its cache had expired while the user was answering
   (`cold-cache`: 2 rewrites, 362K tokens written again), and it ran 16 requests on a 211K context for $3.88, the most
   expensive agent of the run. An amendment needs the spec file and the gap, not the discovery context.
3. **`.claude/agents/implementer.md` — do not read the spec; the plan step is the brief.** Three of four group
   implementers read `specs/11-onboarding-tour.md` (×3, ×2, ×3; 77 criteria) although the plan was written to
   stand alone and its brief was already 43K characters (aim 20K). The implementer role is 9.7M tokens (27%);
   G3 alone is 3.4M with a 134K peak. Add "read the spec only for the criterion a step's `Covers` line names,
   with `rg -n 'AC-12'`", and have the planner keep the brief under its own 20K limit by making five groups.
4. **`.claude/agents/implementation-verifier.md` — return the verdict and the rows that are not `met`; write the
   full matrix to a file.** The first verifier report carried 175 rows into the main session, whose context grew
   59K → 251K over 61 requests (9.9M tokens, 28% of the run). Every later main-session call re-read that matrix.
   The same holds for the long implementer reports: the main session needs "Handoff to the next group" and
   "Deviations", not the per-step table.
5. **`.claude/agents/implementer.md` (fix mode) — a fix to a CI workflow is checked with a linter, not by
   reading.** Fix round 1 moved `runner.temp` to `jobs.<id>.env` and verified it "against the contexts table" by
   reading; it was still invalid, and a second fix agent plus an architecture recheck were needed (7 implementer
   runs for a 4-group plan: 3 were fixes). Add: for `.github/workflows/**`, run `actionlint` (the
   `rhysd/actionlint` image when it is not installed) and report its output.

Not acted on: `preload` for `pr-skill-reviewer` (`severity.md`, `reviewer-contract.md`, 2 of 2 runs) — the whole
role is 545K tokens (2%). `concurrency` did not fire (peak 3, 0 API errors): keep the parallel review stage.

## Decisions (user, 2026-10-05)

| Action | Decision |
|---|---|
| 1. Planner reads `INSIGHTS.md` by matching entries | applied — `.claude/agents/implementation-planner.md`, Step 1 item 2 |
| 2. A new `spec-creator` for `amend:` | applied — `.claude/skills/feature-flow/references/handoffs.md` |
| 3. Implementer reads only the criteria it needs | applied — `.claude/agents/implementer.md`, Step 1 item 4 |
| 4. Verifier returns only the rows that are not `met` | left as is |
| 5. Workflow fixes checked with a linter | left as is |
