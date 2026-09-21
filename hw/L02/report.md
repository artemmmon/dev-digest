# HW2 report — Conventions Extractor and API Contract Reviewer

## 1. Conventions Extractor — quality of findings

Model: `openrouter/deepseek/deepseek-v4-flash` (chosen in Settings → Models → Conventions).
Repo scanned: `artemmmon/cs2-lineups` (Dart/Flutter, so repo-intel returned nothing and the
`git ls-files` fallback sampler did all the work — `sample_source: fallback`).

| Run | Sampled files | Raw candidates | Kept | Dropped by evidence gate | Cost | Time |
|---|---|---|---|---|---|---|
| 1 (before sampler fix) | 14 (6 of them `android/`, `ios/` boilerplate) | 15 | 15 | 0 | $0.0013 | 124 s |
| 2 (after sampler fix)  | 14 (`lib/` first) | 8 | 8 | 0 | $0.0008 | 111 s |

What the numbers say, honestly:
- **The evidence gate never rejected anything.** 23 of 23 candidates cited a real snippet at a real
  line. That is a good sign for grounding, but it also means the gate has not yet been shown to
  catch a hallucination on a live run. It is covered by unit tests (invented snippet, unsampled
  file, wrong line number, trivial snippet), not by this data.
- **Line numbers were right on the first try** (`line_corrected: 0` in both runs).
- **Two runs on the same repo gave 15 and 8 candidates.** The model is not deterministic; the count
  is not a quality measure on its own.
- **Quality is mixed.** Useful: "relative imports", "flutter_lints is configured", "enums carry
  data". Weak: "Repository returns unmodifiable lists" (0.50), and several rules that describe
  one file rather than a repo-wide habit. Confidence is clumpy (0.95 / 0.85 / 0.70), so it ranks
  candidates but is not calibrated.
- A sampler bug was found by this run and fixed: half of the sample slots went to platform
  scaffolding (`android/`, `ios/`). Scaffolding is now sampled only after hand-written code.
- The local clone of the repo was stale (initial commit), so a newer file (`server/lineups_server.dart`)
  was never sampled. That is a clone-freshness issue, not an extractor bug.

## 2. API Contract Reviewer — experiment

Agent: **API Contract Reviewer** (seeded prompt, `deepseek-v4-flash`). Skills: `breaking-change`,
`response-schema`, `semver-discipline` (created in the UI form), `deprecation-policy` (imported
from a `.zip`). The two older seeded skills were switched off for both modes.

### PR #5 — "Add pagination to lineups list" (overt breaking changes)
Renames `items`→`data`, `total`→`count`, route `/v1/lineups/:id`→`/v1/lineup/:id`, makes `map` required.
**Baseline (no skills) caught all three** as CRITICAL — with the seeded prompt and even with a
deliberately generic prompt. So this PR does **not** demonstrate the effect of skills.

### PR #6 — "Simplify lineup JSON serialization" (contract changes hidden in a refactor)
Changes `difficulty` `hard`→`expert`, key `throw_style`→`throwStyle`, `steps` array→string.

| Mode | Run | Caught `hard→expert` | Caught `steps` type | Caught `throw_style` rename |
|---|---|---|---|---|
| No skills | 1 | yes | yes | **no** |
| No skills | 2 | yes | yes | yes |
| No skills | 3 | yes | yes | yes |
| 4 skills | 1 | yes | yes | yes |
| 4 skills | 2 | yes | yes | yes |
| 4 skills | 3 | yes | yes | yes |

- With skills, the trace shows four separate skill blocks (917 / 809 / 820 / 838 tokens, ~3.4k total).
- With skills, findings talk about deprecation ("renamed … without deprecation"; 5–11 mentions per
  run vs 0–2 without) — the skills change *what the reviewer says*, not only *whether it spots* a change.
- Cost: ~$0.0003–0.0004 per run without skills, ~$0.0006–0.0008 with them.

### Conclusion
Skills made the result **more consistent** (3/3 vs 2/3 full detection) and added policy findings, but
on this model the baseline is not reliably blind: it missed one change in one of three runs. That is
weaker than "the agent skips it without skills". Sample size is 3 per mode, so this is an
observation, not a statistically supported claim.
