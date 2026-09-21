---
name: frontend-architecture
description: Architecture rules for React + Next.js App Router frontends — where components, hooks, constants, utils/helpers, types, business logic, data fetching, providers and i18n strings live; how to split a component; import boundaries, public APIs and naming. Use whenever creating a new component, feature, page or route; deciding where a file, constant, helper or hook should go; extracting logic out of a component; reviewing or restructuring folder layout; or answering "where does this belong?" in client code — even if the word "architecture" is never used. Not for performance tuning (see react-best-practices / next-best-practices).
metadata:
  version: "1.0.0"
---

# Frontend Architecture (React + Next.js)

Decisions about **where code lives and how it is split** — not how fast it runs.
Rules are distilled from the sources in [README.md](README.md); `[S12]` marks source #12 there.

> **Working in DevDigest `client/`?** Read [references/devdigest.md](references/devdigest.md)
> first. The existing conventions of that codebase win over the generic advice below —
> consistency inside one repo is worth more than any single "best" practice [S7].

## Core principles

1. **Colocate first.** Put code next to its only consumer — component, hook, constant,
   helper, test, styles. *Why:* what changes together stays together, and deleting a
   feature deletes all of it [S4].
2. **Promote on the second consumer, not before.** Move something to a shared place only
   when a second, real use appears. *Why:* a wrong abstraction costs more than duplication
   (AHA) [S17]. Moving it later is a cheap, mechanical refactor.
3. **Dependencies flow one way:** `shared` → `features` → `app/routes`. Features do not
   import each other; the route composes them. *Why:* no cycles, and each feature can be
   understood and removed on its own [S1][S2][S5].
4. **Components render; logic lives elsewhere.** Components hold JSX and local UI state.
   Business rules sit in plain TS functions; data access sits in a query layer; the glue
   between them is a custom hook [S11][S22]. *Why:* plain functions are trivial to test and
   reuse; React stays "a humble library for building views".
5. **Server state is not UI state.** Data from the API belongs to the query cache
   (TanStack Query), never copied into `useState`/context/stores. What is left for client
   state is usually tiny [S27][S30][S31].
6. **Derive, don't store.** Anything computable from props/state is computed during render,
   not synced with an effect [S23][S24].
7. **Pick one structure strategy per project and apply it consistently.** Next.js is
   unopinionated; the value comes from consistency, not from the specific choice [S7].

## Where does X go?

| Thing | Default home | Promote to (on 2nd consumer) |
|---|---|---|
| Route-only component | `app/<route>/_components/<Name>/` | feature folder or `components/` |
| Reusable UI primitive (no business meaning) | `components/ui/` or the design-system package | — |
| Feature component (knows a domain) | `features/<feature>/components/` or route `_components/` | stays in its feature; route composes |
| Custom hook used by one component | beside that component | `features/<f>/hooks/` → `hooks/` |
| Constant used by one module | top of that file, or sibling `constants.ts` | feature `constants.ts` → `config/` / `constants/` |
| Env / runtime config | one `config/env.ts` (validated) | — |
| Project-specific pure helper | sibling `helpers.ts` | feature `utils/` → `lib/` / `utils/` |
| Generic helper (would fit any project) | `utils/` (or `lib/utils.ts`) | — |
| Configured third-party client (fetch, query client, i18n) | `lib/` | — |
| API call (endpoint + types) | feature `api/` built on one shared API client | — |
| Query key + queryFn | `queryOptions` factory beside the feature's API | — |
| Business rule / domain calculation | plain function in feature `model/` or `domain/` | `lib/` if cross-feature |
| Type only one module uses | in that module | feature `types.ts` → `types/` |
| API contract types (Zod) | shared contracts package | — |
| Context provider | `'use client'` `providers.tsx`, rendered from root layout, as deep as possible | — |
| UI strings | i18n message file per feature | — |

Details and trade-offs: [folder-structure](references/folder-structure.md),
[constants-utils-config](references/constants-utils-config.md),
[logic-and-data](references/logic-and-data.md).

## When to split a component

Split when any of these is true — otherwise leave it alone [S10][S17]:

- It does two things you can name separately ("filter bar **and** results table").
- A block has its own state that the rest of the component does not use → move the state
  down with the block [S26].
- It mixes data wiring (queries, mutations, effects) with a lot of markup → extract a
  custom hook, not a "container" component [S11][S13].
- The same JSX + logic appears a second time (not the first).
- Several parts share implicit state (tabs, select + options) → compound component [S15].
- A large client component contains static parts → keep `"use client"` on the
  interactive leaf only, pass the rest as `children` [S18].

Avoid: container/presentational splits by rule (retired by its author) [S13]; render
factories (`renderX()` helpers) instead of real components; wrappers that only forward props;
reaching for context before trying props and composition via `children` [S12].
Full guide: [references/component-design.md](references/component-design.md).

## Read next

| When you are… | Read |
|---|---|
| Creating a feature/route, moving files, choosing folder layout | [folder-structure.md](references/folder-structure.md) |
| Splitting a big component, designing a component API, placing `"use client"` | [component-design.md](references/component-design.md) |
| Unsure where a constant, helper, util, type or env value goes | [constants-utils-config.md](references/constants-utils-config.md) |
| Placing business logic, state, API calls, queries, Server Actions, Route Handlers | [logic-and-data.md](references/logic-and-data.md) |
| Adding `index.ts` files, deciding import rules, naming files | [boundaries-and-naming.md](references/boundaries-and-naming.md) |
| Adding layouts, error/loading files, providers, i18n, or reading Next docs for v15 | [nextjs-conventions.md](references/nextjs-conventions.md) |
| Working in DevDigest `client/` | [devdigest.md](references/devdigest.md) |

## Out of scope

- Rendering performance, memoization, bundle size → `react-best-practices`, `next-best-practices`.
- Hook rules, effects misuse, key props, accessibility → `react-best-practices`.
- Next.js file-convention API details (metadata, images, fonts, runtimes) → `next-best-practices`.
