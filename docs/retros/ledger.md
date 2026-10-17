# Retro ledger

One row per pipeline run, appended by the `workflow-retro` skill (`retro.mjs --write`). Read it top to bottom for the trend; the full report of a run is the file `<date>-<label>.md` beside this one. Dollars are list-price estimates.

| Date | Label | Sessions | Agents (depth) | Requests | Tool calls | Tokens | Cache read | Output | ≈ $ | Wall time | Agent time | Peak parallel | Top action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-29 | hw4-blast-radius-baseline | 23b989a6 | 53 (1) | 673 | 823 | 92.6M | 96% | 332K | $39.04 | 11h 01m | 52m | 14 | main session: split planning and execution into two sessions (context 58K → 527K, 74% of the run) |
| 2026-10-04 | spec-10-project-context | 315f8657 | 7 (2) | 172 | 182 | 18.4M | 93% | 143K | — | 47m | 41m | 5 | spec-creator guard: default-deny hook blocked SubagentHandback 7 times, 3.6M tokens (20% of the run) spent re-sending a report; fixed in this session (tools allowlist + narrow matcher) |
| 2026-10-05 | onboarding-tour | d1d79fed | 18 (1) | 363 | 477 | 35.4M | 93% | 247K | $19.52 | 2h 03m | 2h 06m | 3 | implementation-planner: read INSIGHTS.md by matching entries, not in full (server/INSIGHTS.md read 7 times, context 32K → 278K, 5.0M tokens, 14% of the run) |
| 2026-10-17 | multi-agent-review | 9d247a0b | 13 (2) | 447 | 522 | 51.6M | 96% | 262K | $19.56 | 2h 51m | 1h 11m | 3 | brainstorm: read INSIGHTS.md by matching entries once, not 7 times (62 requests, 60 Bash, 10.0M tokens = 20% of the run; the planner's agent file already has the rule, brainstorm's does not) |
