# client — `@devdigest/web`

Next.js 15 studio on :3000: repos, PR list, diff, findings, agent editor,
settings. Talks to the API only over HTTP (`NEXT_PUBLIC_API_BASE`, default
`http://localhost:3001`): REST for data, SSE for live run logs. Root rules: `../AGENTS.md`.

## Commands
```sh
pnpm dev          # :3000 (needs the API for real data)
pnpm test         # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
pnpm lint         # eslint + react-hooks; src/vendor and docs/design are ignored
pnpm build
```

## Where things live
- `src/app/**/page.tsx` — routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature components (see conventions)
- `src/lib/hooks/*` — every TanStack Query hook; `src/lib/api.ts` — `apiFetch`
- `src/components/` — cross-cutting chrome (app-shell, diff-viewer, page-shell…)
- `src/vendor/ui/` — vendored UI kit (`@devdigest/ui`)
- `src/vendor/shared/` — **copy** of the Zod contracts (`@devdigest/shared`)
- `messages/en/*.json` — all UI strings (next-intl), one file per feature

## Conventions
Naming is in `../AGENTS.md`; what follows is the shape of the code.
- A feature component is a folder `_components/<Name>/` with `<Name>.tsx`,
  `index.ts`, and as needed `constants.ts`, `helpers.ts`, `styles.ts`,
  `<Name>.test.tsx`, nested `_components/`.
- Components never call `fetch` directly — add or reuse a hook in `src/lib/hooks/`.
- No hardcoded UI text: add keys to `messages/en/<feature>.json`, read via `useTranslations`.
- Reach for `@devdigest/ui` primitives before writing new ones.
- Import alias `@/*` → `src/*`.

## Gotchas
- `src/vendor/shared` diverges from `server/src/vendor/shared` (server is canonical).
  When a contract changes on the server, mirror it here.
- `messages/en/` already has namespaces for future lessons (eval, blast, memory…) —
  unused until the lesson lands; don't delete them.
- `pnpm build` and `pnpm dev` share `.next`: building while dev runs makes every page 500
  (`Cannot find module './vendor-chunks/…'`). Stop dev, `rm -rf .next`, restart.

## Documentation
- `README.md` — UI route map and which API endpoints each page uses
- `src/vendor/ui/README.md` — UI kit contents; read before building new UI
- `docs/design/` — product design (Claude Design export); before building or changing
  a screen, find it in `docs/design/artboards.md` and read its source. Reference only
- `docs/` — client architecture notes and decisions
- `specs/` — client feature specs; check before implementing a feature
- `INSIGHTS.md` — client gotchas; append via the `engineering-insights` skill
- `../TESTING.md` — test strategy; browser journeys live in `../e2e`
