# Component design: how to split components

Sources: [S10] Thinking in React, [S11] custom hooks, [S12] context, [S13][S14]
container/presentational, [S15][S16] compound components, [S17] AHA,
[S18][S19][S20] Next.js server/client components.

## 1. One component, one job

A component should ideally do one thing [S10]. Test it by naming it: if the honest name
needs "and" (`FilterBarAndTable`), split it. Shape the tree after the data it shows: one
component per meaningful piece of the data model.

Do not split just because a file is long. A 200-line component that does one thing is
fine; three 60-line components that pass 15 props between them are worse.

## 2. Extract logic into custom hooks, not container components

The 2015 container/presentational split is **retired**: Dan Abramov added a note in 2019
saying he no longer suggests it, because hooks give the same separation without an extra
component layer [S13][S14].

Instead:

- Move data wiring (queries, mutations, subscriptions, effects) into a `useX` hook next to
  the component. The component calls the hook and renders.
- Move pure business rules out of the hook into plain functions (see
  [logic-and-data.md](logic-and-data.md)); the hook only connects them to React.
- Name only functions that call hooks `useX`; plain functions never get the `use` prefix [S11].
- Do not extract every tiny duplication into a hook — extract when the logic is reused or
  when it hides a noisy detail behind a clear name [S11][S17].

## 3. Composition before context

When props are passed through many levels, try in this order [S12]:

1. Pass props — explicit data flow is easier to follow.
2. **Compose with `children` / slot props** — the parent renders `<Layout sidebar={<Nav/>}>`
   so middle components never see the data.
3. Only then, context — for truly cross-cutting values (theme, current user, active repo).

## 4. Compound components for related pieces

When several components share implicit state (Tabs + Tab + Panel, Select + Option), use
the compound pattern: a parent owns the state and exposes it via context, children read
it [S15][S16]. The API stays flexible (consumers arrange the pieces) without prop explosions.

## 5. Keep abstractions honest (AHA)

"Avoid Hasty Abstractions" [S17]: prefer a little duplication over the wrong abstraction.
Signs of a wrong one: boolean props that switch between two unrelated behaviours, props
used by only one caller, wrappers that only forward props. When you see them, inline the
abstraction back into its callers and re-extract along the real seam.

## 6. Server and Client Components (Next.js App Router)

- `"use client"` marks a **module-graph boundary**: that file and everything it imports
  become client code. Put it on small interactive leaves, not on layouts or whole pages [S18].
- A Client Component cannot import a Server Component, but it can **receive one as
  `children` or a prop**. Use this to keep static parts on the server [S18][S19].
- Wrap third-party components that need client features in your own `'use client'` file.
- Mark modules that must never reach the browser with `import "server-only"` [S18].
- Common mistakes: `"use client"` everywhere, providers not split into their own client
  file, Suspense boundaries placed inside the async component instead of around it [S20].

If a project deliberately renders pages as Client Components (all data from a client-side
query cache), follow that choice; the rules above still apply to *new* server-rendered code.
