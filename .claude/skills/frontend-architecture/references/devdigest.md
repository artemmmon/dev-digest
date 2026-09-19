# DevDigest `client/` — how the rules apply here

Inside `client/` the **existing conventions win**. Follow them for new code; do not refactor
existing code toward the generic advice unless the task asks for it. Divergences are listed
at the end as open questions — raise them, do not silently "fix" them.

Also read `client/AGENTS.md` (rules, commands) and `client/INSIGHTS.md` (gotchas) before
changing code, and the root `AGENTS.md` "Naming" section.

## Shape of the app

- Next.js 15 App Router, React 19, TanStack Query 5, next-intl 3, Tailwind 4.
- Talks to the Fastify API (`:3001`) over **REST + SSE only** — no DB, no Server Actions,
  no Route Handlers today.
- Pages are **Client Components** (`"use client"` in `page.tsx`); all data comes from the
  client-side query cache. This is a deliberate choice — do not convert pages to
  server-side fetching as a side effect of another task.

## Where things go

| Thing | DevDigest location |
|---|---|
| Route-only component | `src/app/<route>/_components/<PascalName>/<PascalName>.tsx` + `index.ts` |
| Its constants / helpers / styles / test | siblings: `constants.ts`, `helpers.ts`, `styles.ts`, `<PascalName>.test.tsx` |
| Sub-component used by one component | nested `_components/<PascalName>/` inside the parent's folder |
| Route-level shared bits | `src/app/<route>/{constants,helpers,styles}.ts` (see `repos/[repoId]/pulls/`) |
| Cross-route / chrome component | `src/components/<kebab-name>/` (e.g. `run-cost-badge/`, `diff-viewer/`) |
| UI primitives | `@devdigest/ui` (`src/vendor/ui/`) — check it before writing a new primitive |
| API client | `src/lib/api.ts` → `apiFetch` / `api.get…`; the **only** `fetch` (enforced by `no-restricted-globals`) |
| Query / mutation hooks | `src/lib/hooks/<domain>.ts` (`reviews.ts`, `agents.ts`, …), re-exported from `src/lib/hooks/index.ts` |
| Hooks private to one chrome component | its own `hooks/` folder (see `components/app-shell/hooks/`) |
| Shared pure helpers | flat in `src/lib/` as `kebab-case.ts` with a sibling test (`format-cost.ts`, `github-urls.ts`) |
| Context providers | `src/lib/providers.tsx` (React Query + theme + repo + toast), rendered from `app/layout.tsx` |
| Wire types / Zod contracts | `@devdigest/shared` (`src/vendor/shared/`) — a copy that lags `server/src/vendor/shared`; change both |
| UI strings | `messages/en/<camelCaseFeature>.json`, read with `useTranslations("<ns>")` — no hardcoded text |
| Env | `NEXT_PUBLIC_API_BASE`, read in `src/lib/api.ts` |

Names: files `kebab-case.ts`, component files `PascalCase.tsx`, folders `kebab-case` except a
component's own folder; wire-contract fields stay `snake_case`, props and locals `camelCase`.

## Applying the generic rules here

- **Colocate / promote on second consumer** — same as generic: start in the route's
  `_components/`, move to `src/components/` only when a second route needs it.
- **Business logic** — keep calculations as pure functions (`src/lib/severity-counts.ts` is
  the model) and test them in isolation; components call them, hooks wire data.
- **Server state** — never copy query data into `useState`; derive during render.
- **New query** — add it to the matching `src/lib/hooks/<domain>.ts` next to its siblings,
  following the local style (inline `queryKey` arrays, `api.*` calls).

## Open questions (divergences from the sources)

1. **Centralised hooks vs per-feature `queryOptions`.** The sources recommend `queryOptions`
   factories colocated with the feature [S33][S34]; DevDigest centralises hooks in
   `src/lib/hooks/`, but every key now comes from one hierarchical factory, `src/lib/query-keys.ts`
   (`keys.pr.scope(id)` covers a PR's reviews, runs, comments…). Keep hooks central; new keys go
   in the factory.
2. **`export *` barrel in `src/lib/hooks/index.ts`.** The sources warn against aggregator
   barrels [S49][S50]; the per-component `index.ts` files are thin named re-exports and fit
   the middle ground in [boundaries-and-naming.md](boundaries-and-naming.md).
3. **Partial boundary linting.** `no-restricted-imports` in `client/eslint.config.mjs` stops
   shared code (`components/`, `lib/`, `i18n/`) importing `src/app`. "Routes don't import each
   other's `_components/`" is not enforced — it needs path resolution (`eslint-plugin-boundaries`
   [S48]); no violation exists today.
4. **Client-rendered pages.** Deliberate for now; if server rendering is ever wanted, follow
   the prefetch + `HydrationBoundary` pattern [S37].
