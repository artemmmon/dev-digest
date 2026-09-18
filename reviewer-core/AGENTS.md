# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: diff + context → prompt → LLM → structured output → grounding
gate → `Review`. No DB, GitHub, network or FS; the only side effect is the
**injected** `LLMProvider`. Consumed by the server as TypeScript source. Root rules: `../AGENTS.md`.

## Commands
Uses **npm**, not pnpm.
```sh
npm install       # required — the server imports from here and crashes without it
npm test          # vitest, stubbed LLMProvider, no keys
npm run lint      # eslint; also guards the purity contract below
npm run typecheck # this IS the build — the package never emits JS
```

## Where things live
- `src/index.ts` — the public API; export everything consumers need from here
- `src/review/run.ts` — orchestration (single-pass / map-reduce), `reduce.ts`
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/diff.ts` — `parseUnifiedDiff` (hunks + the new-side lines each covers; used by the server's git adapter and mocks)
- `src/grounding.ts` — drops findings without a real diff line (path-tolerant, bounded)
- `src/llm/` — OpenRouter provider, Zod → JSON Schema structured output with repair
- `src/output/to-review.ts` — CI payload helper (used from lesson L06)

## Rules
- Stay pure: never import from `server/src` except the shared contracts, never add
  DB / fetch / fs. New side effects come in as injected interfaces.
- Contracts come from `@devdigest/shared` → `../server/src/vendor/shared` (not a copy).
- Prompt-injection defense is the single `INJECTION_GUARD` rule plus fencing
  untrusted text — do not add keyword/denylist filtering.
- Grounding is mandatory; never trust the model's self-reported score.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are empty in the
  starter; omitted slots must leave no section in the prompt.

## Gotchas
- `tsconfig` pins `zod` to this package's own `node_modules` → the server process
  holds two zod copies (`instanceof ZodError` is unreliable there).
- Changes here trigger the server's CI lane too — run `cd ../server && pnpm typecheck`.

## Documentation
- `README.md` — pipeline diagram, public API, prompt slots
- `../docs/agent-prompts/` — the reviewer agents' system prompts
- `docs/` — engine design notes and decisions
- `specs/` — engine feature specs; check before implementing a feature
- `INSIGHTS.md` — engine gotchas; append via the `engineering-insights` skill
