# Design reference

The DevDigest product design, exported from Claude Design. It is the visual source of
truth for the UI — including screens the starter does not have yet (they come back in
lessons). **Reference, not code**: never copy from it into `src/`.

## What's here

| Path | What | Edited by |
|---|---|---|
| `design.html` | Local copy of the standalone export — open in a browser to see the pan/zoom canvas (theme / density / accent tweaks in the panel). Git-ignored: appears after running the unpack script | re-export |
| `artboards.md` | Index: every artboard → which component and props render it → source file | generated |
| `src/*.jsx` | Screen and component sources the canvas renders | generated |
| `src/tokens.css` | Colour and density tokens, dark + light | generated |
| `src/canvas.jsx` | Canvas layout: sections, artboards, props per screen | generated |

## How to use it for a feature

1. Find the screen in `artboards.md` (search by label or `N<number>`), open its source file.
2. Read the layout, states (empty / loading / live / error) and copy text from the JSX;
   `src/data*.jsx` shows the shape of the data each screen expects.
3. Build it with `@devdigest/ui` (`src/vendor/ui`) — it is the production version of the
   design kit: `primitives.jsx` → `primitives/`, `kit2.jsx` → `kit/`, `charts.jsx` →
   `charts/`, `chrome.jsx` → `shell/`, `icons.jsx` → `icons.tsx`, and
   `components2.jsx` → the standalone kit components. Missing piece → add it to the kit.
4. Translate, don't transcribe: follow the conventions in `../../AGENTS.md` — inline
   style objects move to the component's `styles.ts`, hard-coded strings become
   `messages/en/*.json` keys, mock data becomes a TanStack Query hook.

## Design ↔ app

Tokens in `src/tokens.css` match `src/vendor/ui/styles.css` one-to-one (the app also
adds Tailwind `--color-*` aliases). If they ever diverge, the app's stylesheet wins
until the design is re-exported.

| Design screen | App route / component |
|---|---|
| `ScreenDashboard` | `/repos/[repoId]/pulls` |
| `ScreenPRDetail` (overview · runs · files · compose) | `/repos/[repoId]/pulls/[number]` |
| `ScreenTrace` | `RunTraceDrawer` inside PR detail |
| `ScreenAgents`, agents empty state | `/agents`, `/agents/[id]` |
| `ScreenSettings` | `/settings/[section]` |
| `ScreenOnboarding` | `/onboarding` |
| Memory, Multi-Agent, Eval case, Agent perf, Export to CI, CI runs, Tour, Context, Conventions, Conformance, Blast radius | not in the starter yet |

Known gaps between the mockups and the product: mock models are OpenAI (`gpt-4.1`,
`gpt-4o`) and onboarding asks for an "OpenAI key", while the app defaults to OpenRouter.
`src/screen_skills.jsx` (Skills Lab, Eval Dashboard) is in the export but on no artboard.
Product behaviour follows `specs/` and the API contracts, not the mock data.

## Updating

Re-export the design from Claude Design as a standalone HTML, then from the repo root:

```sh
node scripts/unpack-design.mjs "<path to export>.html"
```

It replaces `src/`, `artboards.md` and `design.html`. This README is hand-written — update
the tables above if screens are added or renamed.
