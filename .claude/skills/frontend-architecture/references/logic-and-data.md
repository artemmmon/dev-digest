# Business logic, state and data fetching

Sources: [S22] Modularizing React apps, [S23]–[S26] react.dev + state colocation,
[S27] app state management, [S28][S29] bulletproof state + API layer, [S30]–[S37]
TanStack Query + TkDodo, [S38]–[S44] Next.js data fetching, security, actions, route handlers.

## Contents
1. Layers
2. State: kinds and placement
3. API layer
4. Queries: `queryOptions` and key factories
5. Next.js: where data fetching happens
6. Server Actions and Route Handlers

## 1. Layers

Juntao Qiu's layering on martinfowler.com [S22], simplified:

```
View (components)      → renders, handles events, holds local UI state
  ↓
Hooks                  → connect view to data + domain (useQuery, useMutation, local logic)
  ↓
Domain / model         → plain TS: business rules, calculations, validations, mappers
  ↓
Gateway / API          → network calls through one API client; DTO ↔ domain mapping
```

- Business rules (how a verdict is computed, which findings count as blocking, how cost is
  summed) are **plain functions** — no React, no fetch. They are easy to unit test and to
  reuse on server and client.
- Replace scattered `if (type === ...)` branches with a lookup object / strategy map in the
  domain layer [S22].
- Scale the layering to the complexity: for CRUD screens, hooks + API is enough;
  add a domain layer when rules appear in more than one place [S17].

## 2. State: kinds and placement

Five kinds of state, each with its own tool [S28]:

| Kind | Tool | Where |
|---|---|---|
| Component / UI state | `useState`, `useReducer` | the lowest component that needs it [S25][S26] |
| Server cache | TanStack Query (or SWR) | query cache — never copied elsewhere [S31] |
| URL state (filters, tabs, pagination) | router search params | the URL — shareable and survives reload |
| Form state | form library + schema validation | the form component |
| App-wide client state (theme, active workspace) | context or a small store | provider near the top |

Rules:

- **Lift state to the closest common parent**, no higher; each piece of state has one
  owner [S25]. Move state down when only one child uses it [S26].
- **Do not duplicate server data** into `useState`/context. Treat it as a snapshot owned by
  the cache and control freshness with `staleTime` [S31][S32].
- After moving server data into TanStack Query, what is left of "global state" is usually
  tiny — often no store is needed [S30].
- Avoid redundant, contradictory or deeply nested state; derive during render [S23][S24].
- Logic triggered by a user action goes into the event handler, not into an effect that
  watches state [S23].

## 3. API layer

- **One preconfigured API client** (base URL, headers, error normalisation). Every call goes
  through it; components never call `fetch` directly [S29].
- Each endpoint is a small function with typed input/output, living with its feature
  (`features/<f>/api/`) [S29]. Validate responses with the shared schema when the backend
  is outside your control.
- Map transport DTOs to domain types at this boundary if they differ [S22].

## 4. Queries: `queryOptions` and key factories

The 2024 guidance supersedes "one custom hook per query" [S34][S35]:

```ts
// features/reviews/api/queries.ts
export const reviewQueries = {
  all: () => ["reviews"] as const,
  byPr: (prId: string) =>
    queryOptions({
      queryKey: [...reviewQueries.all(), "pr", prId],
      queryFn: () => api.get<Review[]>(`/pulls/${prId}/reviews`),
    }),
};

// usage: useQuery(reviewQueries.byPr(id)), queryClient.invalidateQueries({ queryKey: reviewQueries.all() })
```

- Keep key and `queryFn` together; the same object works with `useQuery`,
  `useSuspenseQuery`, `prefetchQuery` and `invalidateQueries`, fully typed [S34][S35].
- Hierarchical keys per feature (`all → list → detail`) make invalidation precise [S33].
- Keep the factory **in the feature**, not in a global `queryKeys.ts` [S33].
- Every variable the `queryFn` uses must be in the key [S32][S36].
- A custom hook that only wraps `useQuery` adds little; write one when it adds real logic
  (combining queries, derived data, a mutation + invalidation pair) [S34].

## 5. Next.js: where data fetching happens

- **Default for App Router:** fetch in Server Components, stream with `loading.tsx` or
  `<Suspense>`, parallelise with `Promise.all`, deduplicate with `React.cache` [S38].
- **Client fetching** (TanStack Query) fits polling, live updates, user-driven refetches
  and browser-only APIs [S39].
- **Mixing both:** prefetch in a Server Component, pass `dehydrate(queryClient)` through
  `<HydrationBoundary>`, read with `useQuery` in the client. Create the QueryClient per
  request on the server and once in the browser; set `staleTime > 0`. Do not render the
  same query both in a Server Component and a Client Component [S37].
- **Separate backend (REST API):** Next's security guide calls this the *HTTP APIs* model —
  treat the backend as the authority, call it from the server with forwarded auth [S40].
  If you add a server-side data layer, make it `server-only`, return DTOs, and make it the
  only place that reads secrets [S40][S41].
- Server Components should call the data source directly, not your own Route Handlers [S39][S20].

## 6. Server Actions and Route Handlers

- **Server Actions** are mutations (they are effectively POST endpoints). Put them in a
  `'use server'` file (`features/<f>/actions.ts` or `app/actions.ts`); keep them thin and
  delegate to the data layer; they cannot be defined inside Client Components. Do not use
  them for reads — they run sequentially [S39][S42][S43].
- **Route Handlers** (`route.ts`) are for non-UI responses: webhooks, auth callbacks, a BFF
  proxy (e.g. streaming or adding auth to SSE). A `route.ts` cannot share a segment with
  `page.tsx`. Treat them as public endpoints [S43][S44].
- If both an action and a public API need the same logic, put it in the data layer and
  call it from both [S43].
