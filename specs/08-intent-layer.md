# Intent layer: derive a PR's intent, show it before review, scope findings to it
Status: done
Lesson: L03

## Goal
Reviewers judge a diff better when they know what it is for. A cheap, separate model derives
`Intent { summary, in_scope[], out_of_scope[] }` from the PR title and body, the linked
issue/ticket, any linked or added plan/spec, and the changed-file list with hunk headers
(never diff bodies). The intent is stored per PR, shown on the PR page before the review
results so the user can check the system understood the task, and fed into every review
agent's prompt. Minor out-of-scope findings are removed; serious ones leave exactly one
signal. Missing context is flagged, never invented.

## Scope
**In**
- Sources: title, body, GitHub closing issues (GraphQL `closingIssuesReferences`, then regex
  `#N` / same-repo `owner/repo#N` / issue URLs), Jira/Linear-style keys (status `unreachable`),
  same-repo plan/spec docs at the PR head SHA (relative path or
  `github.com/<owner>/<repo>/blob/<ref>/<path>`, 64 KB cap; also docs the PR adds under
  `specs/**`, `docs/plans/**`), changed files + hunk headers.
- Per-source status `used | unreachable | not_found | too_large`; confidence tier from
  evidence (documented → high, inferred → low, each non-used linked source −1 step) — never
  the model's self-report; `missing_context` flag.
- Stored once per PR (`pr_intent`) with the head SHA; `stale` when the PR head moved; manual
  re-derive; a review run derives only when none exists.
- Reviewer prompt: fenced `pr-intent` section + a trusted scope rule; after grounding,
  out-of-scope findings below WARNING are dropped and WARNING+ ones are folded into ONE
  `kind: out_of_scope` signal (max severity, lists every folded finding). Filter only when
  tier ≥ medium and not stale.
- PR Overview "INTENT" card: quoted summary, IN SCOPE / OUT OF SCOPE columns, RISK AREAS chips,
  confidence + missing-context marker, stale note, "Re-derive intent".
- Settings: `review_intent` model picker (existing) defaults to
  `openrouter / deepseek/deepseek-v4-flash`; must support structured outputs.
- Observability: prompt sections + sizes, model, token estimate, sources with status.
- Risk areas come from BOTH a server rule helper (changed paths / manifest lines) AND a
  `risk_areas[]` field in the classifier output; merged and deduplicated by `kind` + label,
  rule chips first, at most 6 total, each carrying `origin: 'rule' | 'model'`.

**Out**
- Smart Diff, Blast Radius (L04), PR Brief (L05), Jira/Linear/other ticket APIs, non-GitHub
  hosts, auto re-derive on PR update, agent system-prompt edits.

## Design
Packages: server, reviewer-core, client, e2e.

**Contracts** (`server/src/vendor/shared`, synced): `Intent { summary, in_scope, out_of_scope }`
(renamed from `intent`), `IntentSource`, `IntentSourceStatus`, `RiskArea`, `PrIntent`,
`PrIntentResponse { intent, stale, current_head_sha }`, `INTENT_LIMITS`;
`Finding.scope` (nullish) and `FindingKind` `out_of_scope`; `PromptAssembly.intent`;
`GitHubClient.closingIssues`, `GitHubClient.getFileContent`; `review_intent` default.

**Data**: `pr_intent` gains `confidence_tier`, `basis`, `missing_context`, `sources`,
`risk_areas`, `head_sha`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`,
`derived_at` (generated migration).

**API**: `GET /pulls/:id/intent` (stored intent + stale), `POST /pulls/:id/intent`
(derive / re-derive, rate-limited).

**Server**: module `modules/intent/` (links, hunks, risk-areas, prompt, confidence, service,
repository, routes) + `src/prompts/intent.system.md`. The review executor reuses the stored
intent (or derives once) as shared pre-work and passes the intent block and scope filter to
reviewer-core.

**reviewer-core**: `intent` slot after the PR description, trusted `INTENT_SCOPE_RULE`,
`applyScopePolicy` after grounding (`src/scope.ts`).

**Client**: `keys.pr.intent`, `lib/hooks/intent.ts`, `OverviewTab/_components/IntentCard`,
"Outside PR scope" badge on `FindingCard`, `messages/en/intent.json`.

**Security**: all untrusted text fenced in both prompts; docs only from the PR's repo via the
GitHub API at the head SHA (no URL fetching → no SSRF); fail-closed path normalisation; size
caps; logs carry metadata only; intent never suppresses a grounded serious finding
(`docs/agent-prompts/general-reviewer.md:5`).

## Acceptance
- A PR targeting the default branch whose body says "Closes #12" and links `docs/plans/x.md`
  lists both as `used`, tier `high`, basis `documented`.
- A link to another host or repo, or a Jira key, is listed `unreachable`, never fetched, and
  lowers the tier; the card shows the missing-context marker.
- An empty body gives `inferred` / `low` from title, files and hunk headers only; no diff body
  line appears in the classifier prompt.
- After a new push the card shows "stale"; a new review reuses the stored intent without a
  classifier call and without scope filtering; "Re-derive intent" refreshes it.
- With a fresh, medium-or-higher intent, an out-of-scope SUGGESTION is dropped and two
  out-of-scope WARNINGs become one `out_of_scope` finding that names both.
- An intent failure leaves the review `done`, without an intent section, with the reason in
  the Live Log.
- The Live Log shows prompt sections and sizes, model, token estimate and source statuses —
  no secrets, bodies or diff content.
- Settings → Feature Models shows the intent picker with the cheap default; a pick is used
  by the next derivation.

## Decisions (resolved 2026-09-24)
- Risk areas: rule-derived chips + `risk_areas[]` from the classifier, merged (≤ 6).
- One-signal policy: fold WARNING+ into one `out_of_scope` signal per agent run.
- No auto-derive on first PR-page view.
- No `supports_structured_outputs` flag in this feature.
- Classifier cost is not added to the PR-list COST.
