# e2e — `@devdigest/e2e`

Deterministic browser flows over the real stack (client + API + seeded DB),
driven by the Vercel `agent-browser` CLI. No Playwright, no LLM, no API key.
Root rules: `../AGENTS.md`.

## Commands
Uses **npm**, not pnpm.
```sh
npm i -g agent-browser && agent-browser install   # once
../scripts/e2e.sh     # hermetic: own Postgres :5433, API :3101, web :3100 — preferred
npm test              # against your running stack (only if DB has just the seed)
npm run lint          # eslint
npm run typecheck
```

## Where things live
- `run.ts` — runner: executes each flow's commands in one browser session
- `specs/NN-name.flow.json` — the flows (runner picks up only `*.flow.json`)
- `lib/assert.ts` — arg resolution and step assertions
- `test-results/` — failure screenshots (git-ignored)

## Rules
- Locators are deterministic only: `wait --url`, `wait --text`, `find role|text|label`.
  **Never** the AI `chat` command.
- `wait` commands are the assertions; extra checks go in `"assert": { "stdoutIncludes" }`.
- Flows use read-only seeded data (`acme/payments-api`, PR #482, seeded agents)
  and must never trigger a model call or mutate data.
- Keep coverage typological: one flow per main journey, not per edge case.

## Gotchas
- Flows 02/04/05 follow the redirect to the *first* repo — they fail on a dev DB
  with other imported repos. Use the hermetic runner.
- `specs/` holds both flow files and feature spec docs (`*.md`); only `*.flow.json`
  are executed.

## Documentation
- `README.md` — flow format, env knobs, coverage table
- `docs/` — e2e notes and decisions
- `specs/` — flows + feature specs for the e2e suite
- `INSIGHTS.md` — flakiness causes and gotchas; append via the `engineering-insights` skill
- `../TESTING.md` — where e2e fits in the overall strategy
