# Insights — cross-package

Non-obvious findings that span packages. Package-local findings go to `<package>/INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-15 — Docs drift from code
- README: "two built-in reviewers" — seed creates three (General, Security, Performance).
- README recommends `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — default provider is OpenRouter.
- README troubleshooting suggests `docker compose down -v`; `e2e/README.md` warns it wipes real data.
- TESTING.md says `server/package.json` is `skip-worktree` — locally it is not (`git ls-files -v` → `H`).
- `agent-runner` (lesson L06) is referenced in `.gitignore`, comments and `server-unit.yml`, but the folder doesn't exist.
Where: `README.md:73` ("two built-in reviewers"), `TESTING.md:96` (the `skip-worktree`
claim), `.gitignore:5` (`agent-runner/dist/`).

### 2026-09-16 — `client/docs/design/**` in the diff poisons a review run
The design export is ~30 JSX files of MOCK data (a fake PR #482 "Add rate limiting…" with
`file_refs: ["src/middleware/ratelimit.ts:12-18"]`). When a PR touches it, the reviewer sees
91 changed files / 137k input tokens and reports findings about files that exist only inside
those fixtures — grounding then drops them (`file '…' not present in diff`), so the run
costs full price and persists zero findings. Exclude vendored/fixture paths from the review
diff before blaming the model. Seen on PR #1 (`0/2 passed`, run `0d14f36c`).
Where: `client/docs/design/src/data.jsx`, `reviewer-core/src/grounding.ts:61`.

### 2026-09-19 — Supersedes "Docs drift from code"
The README items (three reviewers, OpenRouter key, `down -v` warning) and the `skip-worktree`
claim in TESTING.md are fixed. The `agent-runner` mentions are intentional forward references
to lesson L06 — leave them; the `server/docker-compose.yml` duplicate of the root compose file
is gone. To catch new drift, re-read README claims against `server/src/db/seed.ts` and
`.env.example` after every lesson merge.
Where: `README.md:73`, `.gitignore:5`.

## Codebase Patterns

### 2026-09-15 — `vendor/shared` copies have diverged
`server/src/vendor/shared` and `client/src/vendor/shared` differ in `adapters.ts`,
`contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. The server
copy has `AgentManifest`, `AgentVersion`, `commitFiles`, `sync`, `diffNameOnly` and
`'openrouter'` in `LLMProvider.id`. `reviewer-core` reads the server copy.
Check with `diff -rq server/src/vendor/shared client/src/vendor/shared`.
Where: `client/src/vendor/shared/adapters.ts:77` vs `server/src/vendor/shared/adapters.ts:83`
(`LLMProvider.id`).

### 2026-09-15 — `server/clones/` contains this repo
`DEVDIGEST_CLONE_DIR=./clones` → `server/clones/artemmmon/dev-digest/` is a full
checkout of the project. Git ignores it, grep/search does not — results get doubled.
Where: `server/src/platform/config.ts:67` (the clone-dir default).

### 2026-09-15 — Two identical compose files
`docker-compose.yml` and `server/docker-compose.yml` are byte-identical; `scripts/dev.sh` uses the root one.
Where: `scripts/dev.sh:57` (`docker compose up -d`, run from the repo root).

### 2026-09-16 — Grounding gate 1 is an exact string match on the diff's file path
`groundFindings` first checks `filesInDiff.has(finding.file)` — no normalisation, no suffix
match — and only then checks the line range. A model that writes `src/server/cost.ts` for
`server/src/modules/pulls/cost.ts` loses an otherwise valid finding, and the trace reason
reads "file '…' not present in diff" (vs the line-range reason). When a run reports
`0/N passed`, read the drop reasons in the trace log before assuming the model hallucinated
the issue itself — it may only have hallucinated the path.
Where: `reviewer-core/src/grounding.ts:52-84`.

### 2026-09-17 — The PR-list COST is rounded for display, so it never matches the stored sum
`formatCost` uses adaptive precision: a stored `0.01259424466` renders as `$0.013`, not `$0.0126`.
Anything quoting the cost outside the UI (a demo narration, a test, a doc) has to quote the
rendered string or the raw number, not mix them. The same trap sits one level up: `COST`, `SCORE`
and `FINDINGS` in the list describe the latest review *round*, while the severity pills on a single
run card describe that one agent — two different numbers with the same shape.
Where: `client/src/lib/format-cost.ts:1`, `server/docs/0001-latest-review-is-a-batch.md:1`.

### 2026-09-18 — Agent instructions live in AGENTS.md; CLAUDE.md is a symlink to it
Root and all four packages keep their agent map in `AGENTS.md` (read by Codex, Cursor and
others); `CLAUDE.md` beside it is a relative symlink (git mode 120000) so Claude Code loads the
same file. Edit `AGENTS.md` only — an editor that "saves as copy" silently forks the two. The
`@AGENTS.md` import stub was rejected: it works on Windows without symlink support, but the team
is on macOS and wanted one file. `hw/L01/**` and older entries still say `CLAUDE.md` on purpose.
Where: `AGENTS.md:69`.

### 2026-09-18 — Supersedes "Grounding gate 1 is an exact string match on the diff's file path"
`groundFindings` now resolves the model's `file` before the line check: exact, then normalised
(`./`, `/`, `a/`, `b/`, `\`), then a unique whole-segment suffix match either way. It never guesses
between two candidates, and the line range must still intersect a hunk. Rewrites show up in the trace
as `grounding matched "…": 'x' → 'y'` (`GroundingResult.remapped`). A path with a different middle
(`src/server/cost.ts` for `server/src/modules/pulls/cost.ts`) is still dropped.
Where: `reviewer-core/src/grounding.ts:41`.

### 2026-09-18 — Supersedes "`vendor/shared` copies have diverged"
The copies are now byte-identical (server → client sync of the 5 drifted files) and
`./scripts/shared-contracts.sh check` fails CI (`shared-contracts.yml`) on any difference. Edit
only the server copy, then run `./scripts/shared-contracts.sh sync`. Comment-only drift counts
too — identical files are what makes the check a plain `diff -r`.
Where: `scripts/shared-contracts.sh:17`.

### 2026-09-23 — One ext→language table in `vendor/shared`, not a client guess plus a server guess
The Flutter-first work needs "what language/format is this file" in two unrelated places: the
client diff-viewer chip (`FileCard`) and the server repo-stack detector (spec 06, language-share
computation). Put it once in `server/src/vendor/shared/contracts/languages.ts`
(`languageOf`/`isGeneratedPath`, synced to the client copy as usual) instead of a per-package
extension map that would drift the moment someone adds a language to only one side.
Where: `server/src/vendor/shared/contracts/languages.ts:1`.

### 2026-09-23 — Supersedes "`vendor/shared` copies have diverged" and "Supersedes 'vendor/shared copies have diverged'"
The two copies are no longer literally byte-identical: `sync` now also strips the `.js` extension
from every relative import/export in the CLIENT copy only (server keeps it — Node's `NodeNext` ESM
requires it). Root cause: Next's webpack/Turbopack, in this project's version, cannot resolve a
`.js`-extension relative import to a `.ts` file for a client runtime import reaching `vendor/shared`
for the first time (`client/INSIGHTS.md`, 2026-09-23) — `tsc`/vitest handle it fine, which is why
nobody hit this until a client file first imported a real value (not just a type) from the barrel.
`check` now diffs the client copy against a NORMALISED (same stripping applied) copy of the
server's, so it still fails on any REAL content drift while tolerating this one intentional,
mechanical difference.
Where: `scripts/shared-contracts.sh` (`strip_js_extensions`).

### 2026-09-24 — routing.json maps no skill to server test files
`server-app`'s glob (`server/src/{modules,platform,adapters}/**/*.ts`) ignores `**/*.test.ts`, and
server tests live in `server/test/` rather than beside the subject, so no `routing.json` rule ever
matches a server test path. An agent writing or reviewing server tests must route skills by the
file *under test*, not the test file itself.
Where: `.claude/skills/pr-self-review/assets/routing.json:103` (`server-app` rule, `ignore` list),
`.claude/skills/onion-architecture/references/tools.md:101` ("Server tests live in `server/test/`").

### 2026-09-24 — Module-wide architecture findings cannot go through pr-finding-verifier
severity.md's evidence bar only accepts a finding whose `line` is a changed line, and
`pr-finding-verifier` is spawned by `pr-self-review` only and refutes anything outside the diff. So
`architecture-reviewer`'s `mode: module` findings that fall outside the requested diff are marked
`"in_change": false` and stay informational — they cannot be sent through the same verification
path as a `pr-self-review` CRITICAL.
Where: `.claude/skills/pr-self-review/references/severity.md:48` (evidence bar, "Pre-existing
problems... are not reported"), `.claude/agents/pr-finding-verifier.md:3` ("Spawned by
pr-self-review only"), `.claude/agents/pr-finding-verifier.md:14-16` (checks the line is inside the
change; `refuted` when "not caused by this change").

### 2026-09-28 — The security skill's severity table is not the project's
`.claude/skills/security/SKILL.md:251-258` has its own CRITICAL/HIGH/MEDIUM/LOW table, and
claude-code-security-review uses HIGH/MEDIUM/LOW. Security findings in this repo use `severity.md`
(CRITICAL only as `security-vuln` with a concrete exploit path); the skill's HIGH/MEDIUM/LOW is
used only as the *confidence* tier that decides whether a finding is reported at all.
Where: `.claude/skills/pr-self-review/references/severity.md:26`,
`.claude/agents/security-reviewer.md:69` (the Severity section).

### 2026-09-29 — A second process must start reviews through the API, never its own Container
`RunBus` and `JobRunner` exist once per process (`Container`). A review started from another process
(e.g. a stdio MCP server that built its own `Container`) would be invisible in the UI Live Log, could
not be cancelled from the UI, and the API's boot reaper would mark it failed. `mcp/` therefore calls
the running API over REST (`POST /pulls/:id/review`) and holds no secrets or DB pool. Do the same for
any future out-of-process entry point (CLI, bot, other MCP host).
Where: `server/src/platform/container.ts:127` (`runBus`) and `:128` (`new JobRunner`), `mcp/src/api/http.ts:134` (`startReview`).

### 2026-10-04 — Feature flow: tests leave the implementer, the verifier goes last, bugs are looked for early
An audit of the agent flow found three things the agent files did not say. (1) `implementer` and
`test-writer` both took their cases from the same plan lines, so tests were written twice, and
`test-writer` never read the spec. Now the implementer only repairs tests it breaks (multi-agent
mode) and `test-writer` writes one test per `AC-n`/`EC-n` with the id in the name. (2) Nobody
looked for logic bugs until `/pr-self-review`: `architecture-reviewer` judges structure only. A
`pr-skill-reviewer` in `correctness` mode now runs beside it and `test-writer`. (3) The verifier
stays last, after one merged fix pass: moving it earlier (the option rejected) would fail every
test item and void its PASS on the next fix; the static part, a spec id no step covers, moved to
`check-plan.mjs`, before any code. The route is the `feature-flow` skill.
Where: .claude/skills/feature-flow/SKILL.md:53, .claude/agents/implementer.md:46, .claude/agents/implementation-verifier.md:41, .claude/skills/feature-flow/assets/check-plan.mjs:175

### 2026-10-04 — An agent that produces a file writes it itself, behind a guard hook
`implementation-planner` and `brainstorm` used to return the plan or brief as their final message
and the main session saved it: the same 14K-token text was output twice and then re-read on every
later call of the main session. Both now have Write/Edit limited by `plans-guard.mjs` to their
own file in `docs/plans/` and their own status (`draft`, `awaiting choice`), and return a
ten-line summary. Give a new producing agent the same shape: a path-and-status guard, a
PostToolUse form check, a summary as the final message.
Where: .claude/hooks/plans-guard.mjs:14, .claude/agents/implementation-planner.md:8

## Tool & Library Notes

### 2026-09-17 — Lint was removed from the starter on purpose, and history is not a source
`c6af1e4` ("revert: restore main to the starter state") discarded three merged student
PRs and with them `eslint.config.mjs` in client/server/reviewer-core, `.dependency-cruiser.cjs`
and the `pnpm lint` / `pnpm arch` CI steps. `git show c6af1e4^:server/eslint.config.mjs`
still shows them — do not restore those files, they are someone else's homework. Write a
config for the package you are in instead.
Where: `.github/workflows/server-unit.yml:69` (this branch's own lint step).

### 2026-09-17 — `no-undef` must be off for TypeScript, or every Node global errors
Without the `globals` package, `js.configs.recommended` reports `'process' is not defined`
across a Node package. typescript-eslint's own guidance is to disable the rule for TS: tsc
already resolves every identifier. The client keeps it on and declares globals for its two
root config files instead, because `next.config.mjs` is plain JS.
Where: `server/eslint.config.mjs:25`, `client/eslint.config.mjs:26` (the globals block).

### 2026-09-17 — Demo videos are recorded by a skill, not by hand
`/demo-film` (personal skill) drives an isolated VS Code, the staged Terminal and Chrome to
record `hw/LNN/demo-LNN.mp4` from `hw/LNN/demo/{cues.json,scenes.mjs,config.json}`; repo-specific
rules (URLs, the seeded second repo to keep off camera, controls that must never be clicked) live
in the project skill. Filming needs a second display and the app stack up.
Where: `.claude/skills/devdigest-demo/SKILL.md:1`, `hw/L01/demo/scenes.mjs:1`.

### 2026-09-18 — The demo engine is a plugin, the repo keeps only its conventions
`demo-scenario`, `demo-film` and `frame-checker` moved from `~/.claude` into the `screencast-demo-maker`
plugin (github.com/artemmmon/screencast-demo-maker), so a clone of this repo can install them
instead of finding a skill that points at files nobody else has. The plugin must stay generic:
no DevDigest paths in it — the project skill names the worked example. Plugin skills are
namespaced (`/screencast-demo-maker:demo-film`), and an update replaces the plugin folder, so Playwright
is re-installed by the skill on first use.
Where: `.claude/skills/devdigest-demo/SKILL.md:1`, `docs/demo-video.md:9`.

### 2026-09-18 — Supersedes "Lint was removed from the starter on purpose, and history is not a source"
Lint is back: every package has `eslint.config.mjs` and every workflow runs it, and the server's
onion layering runs in CI as `pnpm arch` (config + baseline stay in the skill). The history note
still holds — don't restore configs from `c6af1e4^`; the current ones were written fresh.
Where: `.github/workflows/server-unit.yml:74`.

### 2026-09-19 — Claude Code registers subagents created mid-session late, not at once
A file added to `.claude/agents/` while a session is running fails to spawn with
`Agent type '<name>' not found`; it appeared in the session's agent list only some minutes later. Don't rely on a
new agent in the same session: fall back to `general-purpose` with the agent body (without its frontmatter) as the
prompt and `model` set by hand. `pr-self-review` documents this.
Where: `.claude/skills/pr-self-review/SKILL.md:68` (step 3), `.claude/agents/pr-skill-reviewer.md:1`.

### 2026-09-19 — `git rev-parse --git-path <file>` resolves our own symlink
`git rev-parse --path-format=absolute --git-path hooks/pre-push` returns the symlink's *target*, so an
installer that symlinks the hook then believes "a different hook already exists". Ask for the `hooks`
directory and append `/pre-push`. Also `pwd -P`, or `/var` vs `/private/var` paths never compare equal on macOS.
Where: `scripts/install-hooks.sh:14`.

### 2026-09-22 — An installed plugin runs from the cache, not the marketplace clone
`~/.claude/plugins/marketplaces/screencast-demo-maker/` is only the marketplace's git clone; skills
run from `~/.claude/plugins/cache/screencast-demo-maker/screencast-demo-maker/<version>/`. Playwright
installed into the clone is invisible to the running skill, and every version bump makes a fresh
cache folder. Never hard-code a plugin path in docs: let the skill run `doctor.mjs --fix` from its
own copy. Claude Code re-installs only when `plugin.json` `version` changes, so bump it (and the
`marketplace.json` entry) every release; `claude plugin tag` checks the two agree.
Where: docs/demo-video.md:36

### 2026-09-26 — Subagent cost is context length × calls, not the model
Cache reads were 98% of the Intent Layer run's 168.6M tokens, and Opus 5.5 and Sonnet 5 read cache
at the same $0.20/M (Sonnet's rate assumed), so a cheaper model only saves on output and cache writes.
One implementer ran 290 calls up to a 535K context (101.7M tokens, 60%); replayed as three fresh step
groups it is 45M. Split long work into step groups and start a new main session after an hour's break:
its 1h cache is rewritten at 2× input price (216K–312K tokens each time).
Where: docs/agent-workflow-cost.md:28, .claude/agents/README.md:88

### 2026-09-26 — A second worktree's dev servers need their own ports, set in two places
Other checkouts (main on :3000/:3001, `.claude/worktrees/*` on :3010/:3011) often run at once; a Next or Fastify
process that loses the bind race is silent, and `localhost` then reaches the other checkout's server. Pick free ports
(`lsof -iTCP -sTCP:LISTEN -n -P`), set `API_PORT`/`WEB_PORT` in that worktree's `server/.env` (CORS origin is derived
from `WEB_PORT`) and start the web with `NEXT_PUBLIC_API_BASE=http://localhost:<api> next dev -p <web>`.
Where: `server/src/platform/config.ts:85`, `scripts/e2e.sh:32`.

### 2026-09-26 — `claude plugin update --scope project` can miss a stale project install
In this worktree `installed_plugins.json` had the project-scope entry of `screencast-demo-maker` at 1.1.0 while the
user scope was 1.2.0; `claude plugin update … --scope project` answered "already at the latest version (1.2.0)"
and changed nothing, although `install` itself reported "installed: 1.1.0". What worked: `claude plugin uninstall
… --scope project` then `install … --scope project` — it rewrites `.claude/settings.json` (moves `enabledPlugins`),
so `git checkout .claude/settings.json` afterwards — then `doctor.mjs --fix` from the new cache folder for Playwright.
Where: `.claude/settings.json:24`, `docs/demo-video.md:36`.

### 2026-09-28 — Subagents can nest; brainstorm stays one agent for cost
Claude Code subagents may spawn subagents, up to 3 layers (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`);
denying `Agent` stops it. Best-of-N (Anthropic calls it "parallelization — voting") as N parallel
agents would cost about N× tokens. That is an estimate, not a measurement: cost is context × calls
per agent, and each option-agent would re-read the same repo context. So `brainstorm` generates
all options in one context instead of spawning one agent per option. Revisit only if option
quality suffers.
Where: `.claude/agents/brainstorm.md:5` (`disallowedTools` denies `Agent`),
`docs/agent-workflow-cost.md:28` (context × calls per agent; the N× figure is inferred from it).

### 2026-10-04 — `disallowedTools` without `tools` is a denylist; a guard hook must deny by default
`spec-creator` cannot use a `tools` allowlist (it must reach Figma MCP read tools), so it gets
every tool the session has: `Artifact`, `CronCreate`, `RemoteTrigger`. Its guard matched only
`Write|Edit|mcp__.*` and let the rest through. For such an agent set the hook matcher to `*` and
block every tool the script does not name. Second hole in the same guard: it looked for a
`Status:` line in the Edit's `new_string`, so `old_string: "draft"` → `new_string: "approved"`
passed. A guard on Edit must apply the replacement to the file in memory and check the result.
Where: .claude/hooks/spec-creator-guard.mjs:17 (allowlist), .claude/hooks/spec-creator-guard.mjs:45 (`afterEdit`), .claude/hooks/spec-creator-guard.test.mjs

### 2026-10-04 — `check-changed.sh`: `--quick`, `--check <id>`, and a package stops at its first failure
`run-checks.mjs` ran lint, tests and arch even after typecheck failed, so one type error put up to
four 30-line failure tails into an agent's context; and to re-run one check an agent had to call
the raw `pnpm typecheck`, with its full output. `check-changed.sh` now passes `--fail-fast` (later
checks of the package show as `SKIP`; `--all` turns it off), takes `--check <id>` (`test` also
matches `test:unit`), and `--quick` swaps the test check for `vitest related --run <changed
files>` and drops lint and arch, for step groups that are not the last. `pr-self-review` calls
`run-checks.mjs` without the flag and still runs everything.
Where: scripts/check-changed.sh:77, .claude/skills/pr-self-review/assets/run-checks.mjs:68

### 2026-10-04 — Claude Code transcripts: a subagent's cost is in its own file, and `output_tokens` is final only on the `stop_reason` line
Measuring a run from `~/.claude/projects/<slug>/<session>.jsonl`: each subagent has its own
`<session>/subagents/agent-<id>.jsonl` plus `.meta.json` (`agentType`, `toolUseId`, `spawnDepth`),
and nothing of its usage is in the parent's transcript (on HW4, 24.2M of 92.6M tokens). One API
response is stored as several lines sharing a `requestId`; they repeat the usage, so count once
per request. Only the line with a `stop_reason` carries the final `output_tokens`; the others hold
the stream-start value (8–30), and 441 of 673 requests had no final line. `retro.mjs` takes the
maximum per request and otherwise estimates output as characters ÷ 4. The format is internal and
undocumented: re-check after a Claude Code update.
Where: .claude/skills/workflow-retro/assets/retro.mjs:90, .claude/skills/workflow-retro/references/reading.md:37

## Recurring Errors & Fixes

### 2026-09-17 — `eslint --fix` leaves a whitespace-only line when it drops a disable directive
Removing an "unused eslint-disable directive" deletes the comment text but keeps the
indentation, so the file ends up with a `   ` line that no linter then complains about.
After a `--fix` run that reported unused directives, grep the diff for whitespace-only
lines (`git diff | grep -n '^+[[:space:]]\+$'`) before committing.
Where: `server/test/integration.it.test.ts:13` and
`server/test/agents-versions.it.test.ts:17` (the `console.warn` the directive sat above).


### 2026-09-15 — `ERR_PNPM_IGNORED_BUILDS` on `pnpm install`
Local pnpm 12 (CI pins pnpm 10) fails install until every dependency with an install
script is listed under `allowBuilds`, and writes a placeholder `pnpm-workspace.yaml`.
A new such dependency → add it there with an explicit `true`/`false`; all current ones are
`false` (prebuilt binaries / optional addons).
Where: `client/pnpm-workspace.yaml:3` and `server/pnpm-workspace.yaml:3` (`allowBuilds`).

### 2026-09-16 — A glob pattern in a block comment can close the comment
Documenting a basename glob inside `/** … */` breaks the file: the pattern contains
`*` followed by `*/`, which terminates the comment mid-sentence. `tsc` then reports
something unrelated and far away (`TS1443: Module declaration names may only use ' or "
quoted strings`, `TS1160: Unterminated template literal`). Write it as `**` + `/name`,
or use `//`. A directory pattern like `dir/**` is safe — no `*/` in it.
Where: `server/src/modules/reviews/diff-filter.ts:17` (the pattern-forms comment),
`server/src/modules/reviews/constants.ts:28` (`REVIEW_EXCLUDED_PATHS`).

### 2026-09-19 — A regex over a whole Bash command blocks commands that only mention `git push`
The first `pr-self-review` hook matched `git push` anywhere in the command string, so a heredoc or a commit
message that merely mentions it was blocked with exit 2 (the author's own `cat <<EOF` with eval data). The
gate now drops heredoc bodies and quoted strings, and re-scans only text that really executes (`bash -c '…'`,
`eval`, `$(…)`, backticks). Any new hook matcher needs the same tests: quoted, heredoc, nested shell.
Where: `.claude/skills/pr-self-review/assets/gate-check.mjs:39` (`commandLayers`),
`.claude/skills/pr-self-review/assets/tests/command-detection.test.mjs:1`.

### 2026-09-19 — Strip shell quotes with one alternation, never two passes
`stripQuotes` first removed `'…'` and then `"…"`; in `git commit -m "fix: don't crash" && git push && echo 'ok'` the apostrophe in
`don't` paired with the quote before `'ok'` and swallowed the push, so the Claude hook let it through. Found by the
`pr-self-review` correctness reviewer on its own code. One regex `'[^']*'|"(?:[^"\\]|\\.)*"` lets the quote that opens first own the span.
Where: `.claude/skills/pr-self-review/assets/gate-check.mjs:37`.

### 2026-09-19 — `import.meta.url === \`file://${process.argv[1]}\`` makes a script a silent no-op on some paths
`import.meta.url` is percent-encoded and symlink-resolved, `process.argv[1]` is neither, so the "run only as a script" guard
is false for a checkout path with a space or behind a symlink, and a hook script then exits 0 having checked nothing (a
gate that fails open). Compare `realpathSync(process.argv[1])` with `realpathSync(fileURLToPath(import.meta.url))`; `isMain`
in `lib.mjs` does. Related: a Claude Code `if` filter on a hook is best-effort and skips `bash -c "…"`; drop it when the
script can decide cheaply.
Where: `.claude/skills/pr-self-review/assets/lib.mjs:15`, `.claude/settings.json:1`.

### 2026-09-22 — `claude plugin eval` rejects `target:` and cannot auth from inside a session
In the plugin repo's `evals/*/graders/*.md`, an `llm` grader with `target: trace` fails to load
(`Unrecognized key(s) in object: 'target'`), although the eval reference lists the key; judge the
last message instead. Run from a Claude Code Bash tool, every child failed with "OAuth session
expired" — run `claude plugin eval . --no-publish` from your own terminal.
Where: .claude/skills/devdigest-demo/SKILL.md:18

### 2026-09-23 — Second checkout on alternate ports: "Can't reach DevDigest" with the API up
The API's CORS allows only `http://localhost:${WEB_PORT}`, so moving the web port without
also setting `WEB_PORT` in `server/.env` drops `access-control-allow-origin` and the UI errors.
`client`'s `pnpm dev` hardcodes `-p 3000` (ignores `client/.env` WEB_PORT) — use
`pnpm exec next dev -p <port>`; `tsx watch` does not reload `.env`, restart the API after edits.
Where: `server/src/platform/config.ts:85`, `client/package.json:6`.

### 2026-09-23 — Worktree sharing the DB: no stack label, missing seeded agents
A worktree's `DEVDIGEST_CLONE_DIR=./clones` is empty, so stack detection (which resolves the
clone by owner/name, not `repos.clone_path`) fails silently → "Stack not detected yet". Point it
at the main checkout's absolute `server/clones` and restart the API (boot backfill re-detects).
New agents/skills from a branch arrive only via `pnpm db:seed` — `--no-seed` hides them.
Where: `server/src/modules/repos/service.ts:93`, `server/src/modules/repos/routes.ts:36`.

### 2026-09-26 — `PR_SELF_REVIEW_OVERRIDE` does nothing when the branch has no verdict at all
The override only turns an existing BLOCK verdict into a pass; with no verdict file the pre-push hook refuses
before it ever reads the variable ("no verdict for branch …"), so `git push` fails and a following `gh pr create`
reports "No commits between main and <branch>". For a throwaway fixture branch either run `/pr-self-review` on it
first (then override a BLOCK) or push it from your own terminal with `git push --no-verify`.
Where: `.claude/skills/pr-self-review/assets/gate-check.mjs:62`, `.claude/skills/pr-self-review/assets/gate-check.mjs:76`.

## Open Questions

### 2026-09-15 — Undocumented task IDs in comments
Comments reference internal IDs (F1, A2, A6, T1.3, T2.2, T3) with no legend anywhere.
Where: `server/src/platform/model-router.ts:2` ("A6 — Cost discipline (§11)").

### 2026-09-26 — Should the planner write its own plan file?
Giving `planner` `Write`/`Edit` in its frontmatter (so it saves `docs/plans/NN-*.md` and returns a
short summary) was denied by the auto-mode classifier as self-modification. So the planner still
returns the full plan, and the main session keeps it in context (~13K tokens × every later call,
~$1 on Intent Layer). The user decides whether to make that change by hand.
Where: .claude/agents/implementation-planner.md:4 (agent renamed from `planner` on 2026-10-04)

### 2026-10-04 — Do spec-creator's frontmatter hooks fire in a live run?
The guard (`PreToolUse`, matcher `*`) and the spec check (`PostToolUse`, matcher `Write|Edit`) are
tested as scripts with `node --test`, but not inside a running subagent **(unverified)**: an agent
file changed mid-session registers late, and frontmatter hooks need the workspace trust dialog
accepted. On the next real spec run, confirm that a blocked tool returns the guard's message and
that a spec with a form error returns `path:line: error: …` to the agent.
Where: .claude/agents/spec-creator.md:9, .claude/skills/spec-authoring/assets/check-spec.mjs:8

### 2026-10-04 — Do `--quick` and the planner's and brainstorm's hooks work in a live run?
Added without a live run **(unverified)**: the worktree had no `node_modules`, so
`vitest related --run --passWithNoTests --exclude '**/*.it.test.ts' <files>` was built and
printed by `--quick --plan` but never executed; and the `plans-guard.mjs` / `check-plan.mjs --hook`
frontmatter hooks are tested only as scripts, like spec-creator's. On the next feature: run
`./scripts/check-changed.sh --quick` once by hand after the first group, and confirm that the
planner's plan check error (`path:line: error: …`) reaches the agent.
Where: scripts/check-changed.sh:77, .claude/agents/implementation-planner.md:8, .claude/agents/brainstorm.md:1

## Session Notes

### 2026-09-17 — Closing the HW1 documentation criteria (L01)
Added ESLint to all four packages and wired it into CI, wrote the naming conventions and
the lock-file do-not-touch rule into the root `CLAUDE.md`, gave all 39 existing INSIGHTS
entries a verified `file:line` anchor, and filled the eight empty per-package `docs/` and
`specs/` folders with one doc + one spec each. The PR-list COST stays scoped to the latest
review round; the reasoning now lives in an ADR instead of only in a commit message.
Where: `server/docs/0001-latest-review-is-a-batch.md`, `.claude/skills/engineering-insights/SKILL.md:5`.

### 2026-09-26 — Token-cost rules for the agent workflow
Measured where Intent Layer's tokens went and turned it into rules: step groups with a brief marker
in plans, implementer fix mode, `implementation-verifier` on sonnet, narrow diffs, and
`scripts/check-changed.sh` (one line per check, output only on failure).
Where: docs/agent-workflow-cost.md:1, scripts/check-changed.sh:1

### 2026-10-04 — spec-authoring skill, guard hardening, spec ids through the flow
The spec rules moved from the `spec-creator` agent into the `spec-authoring` skill (one template,
EARS references, a runnable check); the guard hook became default-deny; planner and verifier now
keep the spec's `AC-n` / `EC-n` / `NFR-n` ids. Entries added: one in Tool & Library Notes, one in
Open Questions.
Where: .claude/skills/spec-authoring/SKILL.md:1, .claude/agents/implementation-verifier.md:36

### 2026-10-04 — Feature-flow audit applied
Audited the Spec Driven Development flow and applied the findings: the `feature-flow` skill
(route, handoffs, `check-plan.mjs`), a new stage order, the test split between `implementer` and
`test-writer`, spec and plan approval gates, spec amendments, self-writing planner and brainstorm,
and cheaper check runs. Entries added: two in Codebase Patterns, one in Tool & Library Notes, one
in Open Questions.
Where: .claude/skills/feature-flow/SKILL.md:1, .claude/agents/README.md:69

### 2026-10-04 — `/sdd` command and the architecture review loop
Added the `sdd` skill (user-run, `disable-model-invocation`): it sorts a spec, a plan, designs and
a requirements text, picks the entry stage from the `Status:` lines and runs `feature-flow`. The
review stage became a loop: architecture CRITICAL and WARNING findings on changed lines are fixed,
`architecture-reviewer` rechecks only the fixed files by finding id, up to 3 rounds, then the main
session asks. A Workflow script for the execution part was considered and not chosen for now: the
hooks and `--quick` are still unverified in a live run. Not run end to end yet **(unverified)**.
Where: .claude/skills/sdd/SKILL.md:1, .claude/agents/architecture-reviewer.md:32, .claude/skills/feature-flow/references/handoffs.md:51

### 2026-10-04 — Token-saving choices: tests off, review agents on sonnet, one agent on request
The user chose, to save tokens for now: nobody writes new tests in the default flow (`test-writer`
runs only with `/sdd --tests` or by name; `implementer` still repairs what it breaks; the verifier
gets `tests: off` and checks criteria by reading code), and `architecture-reviewer` and
`security-reviewer` run on sonnet, and so does `brainstorm`, which stays a required stage of the
full flow (opus stays on `spec-creator`, `implementation-planner`, `pr-finding-verifier`). The tradeoff accepted: features ship without new
tests, and the security trace is done by the weaker model, with `/pr-self-review`'s opus verifier
as the backstop. Also: `spec-creator` or `implementation-planner` runs alone on request
(`/sdd --only spec|plan`), with no next stage.
Where: .claude/skills/feature-flow/SKILL.md:37, .claude/agents/architecture-reviewer.md:6, .claude/agents/security-reviewer.md:6, .claude/skills/sdd/SKILL.md:4

### 2026-10-04 — `/workflow-retro` skill and the first ledger row
Added the `workflow-retro` skill for the lab's run retrospective: `retro.mjs` measures tokens,
cache read, tool calls, duration and parallelism per agent from the transcripts (deep by default),
flags duplicated context, preload candidates, overloaded roles and concurrency, and appends a row
to `docs/retros/ledger.md`. The baseline row is the HW4 session. One open action from it:
`pr-skill-reviewer` reads `severity.md` and `reviewer-contract.md` in all 38 runs. Entry added: one
in Tool & Library Notes.
Where: .claude/skills/workflow-retro/SKILL.md:1, docs/retros/ledger.md:5
