# Retro ledger

One row per pipeline run, appended by the `workflow-retro` skill (`retro.mjs --write`). Read it top to bottom for the trend; the full report of a run is the file `<date>-<label>.md` beside this one. Dollars are list-price estimates.

| Date | Label | Sessions | Agents (depth) | Requests | Tool calls | Tokens | Cache read | Output | ≈ $ | Wall time | Agent time | Peak parallel | Top action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-29 | hw4-blast-radius-baseline | 23b989a6 | 53 (1) | 673 | 823 | 92.6M | 96% | 332K | $39.04 | 11h 01m | 52m | 14 | main session: split planning and execution into two sessions (context 58K → 527K, 74% of the run) |
| 2026-10-04 | spec-10-project-context | 315f8657 | 7 (2) | 172 | 182 | 18.4M | 93% | 143K | — | 47m | 41m | 5 | spec-creator guard: default-deny hook blocked SubagentHandback 7 times, 3.6M tokens (20% of the run) spent re-sending a report; fixed in this session (tools allowlist + narrow matcher) |
