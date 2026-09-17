# Authoring a flow

A flow is a JSON list of `agent-browser` commands run in one browser session. There
is no test framework underneath: `run.ts` shells out to a CLI, and a command that
exits non-zero fails the step and stops the flow. That is the entire mechanism —
which is why the rules below are about *what makes a command deterministic*, not
about assertions.

## The shape

`specs/NN-name.flow.json`, picked up by lexical filename order
(`run.ts:55` filters `*.flow.json`, so `*.md` in the same folder is ignored):

```jsonc
{
  "name": "What this journey proves",
  "description": "Why these steps, and what seeded data it assumes.",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "land on the PR list" },
    { "cmd": ["find", "role", "button", "click", "--name", "Agent runs"], "label": "open the tab" }
  ]
}
```

`{BASE}` is substituted with `E2E_BASE_URL` (`lib/assert.ts:37`). `label` is what
the console prints; without one the argv is printed instead. `assert.stdoutIncludes`
adds a substring check on the command's stdout — use it only when the exit code
cannot express the check.

## The rules that keep a flow deterministic

**`wait` *is* the assertion.** `wait --url /pulls/482` and `wait --text "request
changes"` fail by timing out, which fails the step. A flow reads as a sequence of
facts that must become true; no expect() needed.

**Deterministic locators only** — `wait --url`, `wait --text`, `find role|text|label`.
Never the AI `chat` command: it re-decides on every run and turns a red flow into a
coin flip.

**Target the accessible name, and check it exists.** `find role button --name "1
Critical"` matches the computed name. A button rendering a count next to a label
computes `"1Critical"` — no separator — so the component needs an explicit
`aria-label`. The severity pills carry one for exactly this reason; see
`../client/docs/overlay-ui-without-a-kit-primitive.md`.

**Read-only, seeded data only.** Flows must not trigger a model call or mutate
anything: the suite runs with no API key. Use `acme/payments-api`, PR #482 and the
seeded agents.

**Add a `wait --load networkidle` after a route change** before asserting on
fetched content, or the step races the request.

## Debugging a failure

1. Read the console: each step prints `✓`/`✗` with the first line of the error, and
   the flow stops at the first failure (`run.ts:runFlow`).
2. Look at `test-results/<flow-id>-fail.png` — the runner screenshots on failure and
   CI uploads the folder as an artifact.
3. Reproduce the single step by hand: `agent-browser find role button --name "…"`
   against a running stack. The daemon keeps the page between invocations, which is
   what makes step-by-step debugging possible.
4. If it passes by hand and fails in the flow, suspect state from an earlier step,
   not the locator.

## Before you commit

- Run the hermetic stack: `../scripts/e2e.sh` (own Postgres :5433, API :3101, web
  :3100). Stop your dev web server first — both write `client/.next`, and the e2e
  run leaves the dev server serving stale chunks.
- `npm run lint && npm run typecheck` — the runner is TypeScript too.
- Keep coverage typological: one flow per main journey. A new edge case usually
  belongs in a component test, not here.
