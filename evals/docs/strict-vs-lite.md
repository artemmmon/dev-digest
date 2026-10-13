# architecture-reviewer: strict against lite, in series

Two versions of one agent, run on the same cases, several times each, with the spread shown.

| | `architecture-reviewer` (strict) | `architecture-reviewer-lite` |
|---|---|---|
| Difference | a finding's `rule` is required, and the CRITICAL ladder is written by rule id | a finding's `rule` may be empty, and the ladder is written in words |
| Eval | `evals/agents/architecture-reviewer/` | `evals/agents/architecture-reviewer-lite/` (same cases, imported) |

The cases, the prompt, the practices, the threshold and `maxTurns` are the same objects for both
(`architecture-reviewer.cases.ts`): the injected agent definition is the only thing that differs.

## How it was run

```bash
cd evals
pnpm eval:repeat agents/architecture-reviewer -n 2 --label strict
pnpm eval:repeat agents/architecture-reviewer-lite -n 2 --label lite
pnpm eval:delta strict lite          # per case and per practice, paired by test id
```

`-n` is capped at 2 (token economy), so one series is two runs and the standard deviation is
indicative only; the table adds series instead of pretending n is larger. The raw series are in
[`strict-vs-lite/`](strict-vs-lite/) (`strict*.json`, `lite*.json`: the `repeat-<label>.json` files
of `eval:repeat`, copied from the git-ignored `results/`).

## Local series: Claude Code subscription, `claude-haiku-5-5`, judge `claude-sonnet-5-5`

Commit `703a59e` (working tree dirty), 2 runs per series. Mean ± standard deviation [min–max].

### Case A: finds both violations in the checkout diff, rates them, cites a documented rule

| Series | Pass | Turns | Duration, s | Output tokens |
|---|---|---|---|---|
| strict | 2/2 | 15 ± 5 [11–18] | 64 ± 32 [41–87] | 14 015 ± 7 288 [8 861–19 168] |
| lite, series 1 | 2/2 | 17 ± 2 [15–18] | 81 ± 14 [70–91] | 17 869 ± 3 202 [15 604–20 133] |
| lite, series 2 | 2/2 | 17 ± 5 [13–20] | 90 ± 53 [52–127] | 17 529 ± 8 892 [11 241–23 816] |

All six practices pass 2/2 in every series, including "the finding has a non-empty `rule` that names
a documented rule". On this case the two versions are indistinguishable; lite is not faster, its
spread is as wide as strict's.

### Case B: finds the calculation placed in the service instead of the domain (documented placement rule, WARNING)

| Series | Pass | Finding reported | `rule` names the placement row | Severity WARNING | Turns | Duration, s |
|---|---|---|---|---|---|---|
| strict | 2/2 | 2/2 | 2/2 | 2/2 | 15 ± 2 [13–16] | 52 ± 5 [48–55] |
| lite | **1/2** | 1/2 | 1/2 | 1/2 | 18 ± 1 [17–18] | 53 ± 10 [46–60] |

Where lite loses a run, it loses the finding itself (it reports nothing about the inline
arithmetic), not only the `rule` field.

### Case C (exploratory, no longer in the suite): reports nothing for a diff that breaks no documented rule

| Series | Pass | "no CRITICAL or WARNING" | "every finding has a `rule`" | Turns |
|---|---|---|---|---|
| strict | 0/2 | 0/2 | 2/2 | 15 ± 2 [13–16] |
| lite | 2/2 | 2/2 | 2/2 | 13 ± 3 [11–15] |

Run once as a false-positive control. It points the other way (strict reported a CRITICAL or
WARNING on that diff in both runs, lite in neither), and it is kept here so the comparison is not
one-sided. The case and its fixture were removed from the suite afterwards, so it is not
reproducible from the current tree.

## CI series: OpenRouter, `anthropic/claude-haiku-5.5`, judge `deepseek/deepseek-v4-flash`

GitHub Actions run 38434805516, 2 runs per case, through the LiteLLM proxy.

| Case | strict | lite |
|---|---|---|
| A: checkout diff | 2/2, every practice 2/2 | 2/2, every practice 2/2 |
| B: placement rule | 2/2, every practice 2/2 | **0/2**: finding, `rule` and WARNING all 0/2 |

## Reading the two together

Case B, strict against lite, over both environments: **strict 4/4, lite 1/4**
(local 2/2 and 1/2, CI 2/2 and 0/2). Case A: 4/4 and 4/4. The difference is confined to the case
that needs a documented rule to be *found*, not only cited.

What the series do not show:

- **Not a large sample.** Four runs per cell at most, two environments, one fixture per case; the
  standard deviation of a two-run series says the spread exists, not how wide it is.
- **The two environments are not one experiment.** Different runner, judge and provider; they agree
  on direction, which is the evidence, not a pooled rate.
- **Case C goes against strict**, and nothing here weighs the two cases against each other.

## Decision recorded

`architecture-reviewer-lite` stays an experiment that no flow uses: its description says it is used
only when named explicitly (`.claude/agents/architecture-reviewer-lite.md`), and CI leaves it out of a
run unless `skip` is set to `none` (`.github/workflows/evals.yml`).
