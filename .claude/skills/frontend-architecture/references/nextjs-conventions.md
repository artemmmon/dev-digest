# Next.js App Router conventions (architecture view)

Sources: [S7] project structure, [S18] server/client components, [S37] TanStack SSR,
[S45] layouts and pages, [S46] error handling, [S52]–[S55] next-intl.
API-level details (metadata, images, fonts, runtimes) live in `next-best-practices`.

## Version warning

Unversioned `nextjs.org/docs/...` URLs now show **Next.js 16**. For a v15 project read
`nextjs.org/docs/15/...`. Differences that affect structure:

| Topic | Next 15 | Next 16 |
|---|---|---|
| `params`, `searchParams`, `cookies()`, `headers()` | async (sync access warns) | async only |
| Request interception file | `middleware.ts` | `proxy.ts` (`middleware.ts` deprecated) |
| GET Route Handlers | uncached by default | uncached; opt in with `use cache` |
| `default.js` for parallel slots | optional | required |

Articles from the Next 14 era (e.g. [S20], [S40]) have valid principles but outdated
API details (sync `cookies()`, cached GET handlers).

## Layouts, pages, special files

- **Layouts persist** across navigation and do not re-render; do not put per-request auth
  checks or per-page data logic there [S45].
- The root layout owns `<html>` and `<body>` [S45].
- `page.tsx` stays thin: read params, compose feature components [S7].
- `loading.tsx` wraps the page in Suspense; prefer an explicit `<Suspense>` close to the
  data that suspends [S38].
- `error.tsx` must be a Client Component and catches uncaught errors of its segment;
  `global-error.tsx` covers the root layout and renders its own `<html>/<body>` [S46].
- Expected errors (validation, "not found" in a form) are **returned as values**, not thrown;
  use `notFound()` + `not-found.tsx` for missing resources [S46].

## Providers

- Put all context providers in one `'use client'` `providers.tsx` that accepts `children`,
  and render it from the root layout [S18].
- Render providers as deep as possible — wrap `{children}`, not `<html>` — so static parts
  stay server-rendered [S18].
- TanStack Query: `providers.tsx` creates the client once per browser session
  (`useState(() => new QueryClient(...))`), and a `get-query-client.ts` is shared by server
  prefetching and the client [S37].

## Internationalisation (next-intl)

- Structure (v3 with i18n routing) [S52]: `src/i18n/{routing,navigation,request}.ts`,
  `src/middleware.ts`, `src/app/[locale]/layout.tsx`, `messages/<locale>.json` (or one file
  per namespace). Without locale routing only `i18n/request.ts` is needed.
- Translate in Server Components where possible and pass strings down as props; scope the
  messages sent to the client with `NextIntlClientProvider` [S53].
- One namespace per feature keeps ownership clear and lets unused namespaces be found.
- Upgrading to v4 (required provider, ESM-only, `proxy.ts` on Next 16): see [S54][S55].
