# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## How a flow works

A spec lives in `specs/NN-name.flow.json`:

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],            "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"],    "label": "root redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],     "label": "seeded PR row visible" }
  ]
}
```

- `{BASE}` is replaced with `E2E_BASE_URL` (default `http://localhost:3000`).
- Each `cmd` is passed verbatim to `agent-browser`. A non-zero exit fails the
  step and the flow — so `wait --text` / `wait --url` **are** the assertions
  (they time out and exit non-zero if the condition never holds).
- Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check on the
  command's stdout.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  We never use the AI `chat` command, so runs are stable and key-free.

Flows 01-11 target **read-only seeded data** (the demo repo `acme/payments-api`,
PR #482, the seeded agents), so nothing triggers a model call. Flow 12 is the one
exception: it generates an onboarding tour for a separate fixture repository with a
stub model (see [Onboarding-tour flow](#onboarding-tour-flow-12)) — still no network
and no API key.

> **Precondition: a freshly-seeded DB.** Flows `02`, `04` and `05` follow the home
> redirect to the *first* repo, so they assume the seeded demo repo comes first. CI
> guarantees this — `e2e-web.yml` brings up an empty Postgres and seeds it (the
> seed adds the tour fixture repo *after* the demo repo, so the demo stays first).
> Your local dev DB usually has other imported repos, so running `npm test`
> straight against it makes flows 02/04/05 land on the wrong repo and fail.
> **Use the hermetic runner below** — it spins up its own isolated, freshly-seeded
> stack and leaves your dev DB untouched.
>
> ⚠️ **Never `docker compose down -v` to "reset" your dev DB** — `-v` deletes the
> `devdigest_pgdata` volume along with every real repo and review you've imported.

## Run locally

```sh
# 1. install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser@0.38.1 && agent-browser install
```

### Hermetic (recommended)

```sh
# Boots an isolated, freshly-seeded stack on alternate ports
# (Postgres :5433, API :3101, web :3100), runs the flows, then tears it all
# down. Safe to run while your normal dev stack is up — it never touches your
# dev DB or the devdigest_pgdata volume.
./scripts/e2e.sh
# or: cd e2e && npm install && npm run e2e:hermetic
```

The isolated Postgres is ephemeral (no persistent volume), so it's empty every
run. It holds two repos: the seeded demo repo `acme/payments-api` first, which is
what flows 02/04/05 need, and the tour fixture repo `devdigest-fixtures/tour-sample`,
which only flow 12 opens (by its fixed id).

The script also builds the fixture checkout in a throw-away clone directory, which it
removes on exit. The web server runs with its own build directory
(`NEXT_DIST_DIR=.next-e2e`), but `next dev` still rewrites two committed client files,
`client/next-env.d.ts` and `client/tsconfig.json`. `scripts/e2e.sh` snapshots them
before it starts and restores them on exit — also on failure or Ctrl-C — so a run
leaves no diff there.

### Against your own running stack

Only safe if your dev DB contains *only* the seeded repo (see precondition
above). Otherwise prefer the hermetic runner.

```sh
./scripts/dev.sh          # Postgres + API :3001 + web :3000 (seeded)
cd e2e && npm install && npm test
```

Env knobs:

- Runner: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default `agent-browser`),
  `E2E_STEP_TIMEOUT` (ms, default 60000).
- Hermetic stack (`scripts/e2e.sh`): `E2E_PG_PORT` (5433), `E2E_API_PORT` (3101),
  `E2E_WEB_PORT` (3100), `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`),
  `E2E_PG_IMAGE` (`pgvector/pgvector:pg16`).
- Onboarding-tour flow (12), set by `scripts/e2e.sh` and `e2e-web.yml` — not by you:
  `DEVDIGEST_CLONE_DIR` (the fixture checkout lives at
  `<dir>/devdigest-fixtures/tour-sample`, built by `scripts/e2e-tour-fixture.sh`),
  `SEED_E2E_FIXTURE_PATH` (the seed adds that repo, id `00000000-0000-4000-8000-0000000000e2`),
  `DEVDIGEST_LLM_STUB` (`e2e/fixtures/llm-stub.json`: the stub model's answers).

### Onboarding-tour flow (12)

Flow 12 opens `/repos/00000000-0000-4000-8000-0000000000e2/onboarding`, clicks
Generate, and checks the five cards against `e2e/fixtures/llm-stub.json`. Then it
clicks Regenerate. It is the only flow that writes data, and it is numbered 12 so it
runs last. It needs three things that the hermetic runner and `e2e-web.yml` set up
for you:

- A **fixture checkout**: `scripts/e2e-tour-fixture.sh <clone-dir>` copies
  `e2e/fixtures/tour-repo` (a tiny Python service) into
  `<clone-dir>/devdigest-fixtures/tour-sample` and commits it with a fixed author and
  date. The checkout has to sit at `<DEVDIGEST_CLONE_DIR>/<owner>/<name>`; the API
  derives the path from the repo's owner and name, not from the stored `clone_path`.
- A **seeded repo row**: `pnpm db:seed` adds the repo when `SEED_E2E_FIXTURE_PATH` is
  set.
- A **stub model**: with `DEVDIGEST_LLM_STUB` set, the API answers every structured
  LLM request from the JSON file instead of calling a provider. The file maps a
  schema name to the answer, for example `OnboardingTourDraft` to the five sections.
  The variable is test-only and the API refuses it when `NODE_ENV=production`.

To change what the tour shows in the flow, edit `e2e/fixtures/llm-stub.json` and the
matching `wait --text` steps together. A path in the stub's answer that is not in the
fixture checkout is dropped by the server, so the card would lose that row.

Failure screenshots are written to `e2e/test-results/` (git-ignored; uploaded as
a CI artifact by `.github/workflows/e2e-web.yml`).

## Coverage (typological, not exhaustive)

| Spec | Flow |
|------|------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list (incl. the FINDINGS column) → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → seeded run verdict + findings; expand → FindingCard; severity pill filters and clears |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file renders in the diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys` + `/settings/models` → section titles render |
| `08-agent-editor` | agents list → open Security Reviewer → editor Config tab renders |
| `09-pr-overview` | PR #482 → Overview tab → Description + the seeded PR body |
| `10-skills` | `/skills` → open a seeded skill's preview drawer → full page: Config and Versioning tabs → seeded Test Quality Reviewer's Skills tab lists every skill with the enabled count |
| `11-pr-intent` | PR #482 → Overview tab → the Intent card's empty state with its Derive intent button (never clicked) |
| `12-onboarding-tour` | fixture repo `devdigest-fixtures/tour-sample` → Generate onboarding tour (stub model) → five sections → Regenerate |
