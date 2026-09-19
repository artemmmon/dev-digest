# Folder structure: where components live

Sources: [S1] bulletproof-react, [S2][S3] Feature-Sliced Design, [S4] Colocation,
[S5] Wieruch, [S6] Comeau, [S7] Next.js project structure, [S8][S9] FSD + Next.js.

## 1. Grow the structure in stages

Do not start with the final architecture. Wieruch's stages [S5] match what most teams
end up with:

1. **Single file** — the component and its helpers in one file.
2. **Component folders** — `Button/{Button.tsx, index.ts, Button.test.tsx}`.
3. **Technical folders** — `components/`, `hooks/`, `utils/`, `constants/`.
4. **Feature folders** — `features/<feature>/` holding everything for one domain.
5. **Domains / packages** — group features, or extract a package when several apps share it.

Move to the next stage when the current one hurts (hard to find things, unclear ownership),
not in advance. Type-based layouts (stage 3, Comeau [S6]) work well for small and medium
apps; feature-based layouts (stage 4) scale better [S1][S5].

## 2. Feature-based layout (reference shape)

Adapted from bulletproof-react [S1]:

```
src/
  app/            # routes, layouts, providers — composes features, owns no business logic
  components/     # shared UI with no domain knowledge (buttons, modals, layout chrome)
  config/         # env + global configuration
  features/
    reviews/
      api/        # endpoint functions + queryOptions for this feature
      components/ # UI that only this feature uses
      hooks/      # glue hooks for this feature
      model/      # business rules as plain functions (optional; name varies)
      types.ts
      utils.ts
  hooks/          # shared hooks
  lib/            # preconfigured third-party libraries (api client, query client, i18n)
  types/          # shared types
  utils/          # shared generic helpers
```

Rules that make it work:

- **A feature holds only what that feature uses.** Delete the folder, delete the feature.
- **No cross-feature imports.** If feature A needs something from feature B, either lift
  it to a shared layer or compose both in the route [S1]. FSD allows a controlled
  exception for entities via `@x` notation [S2] — use it only when lifting is wrong.
- **Dependencies point one way:** shared → features → app [S1][S5].

## 3. Feature-Sliced Design (when the app is large)

FSD [S2][S3] formalises the same idea into layers, top to bottom:
`app → pages → widgets → features → entities → shared`. A module imports only from layers
below it. Each layer is split into **slices** (business domains) and each slice into
**segments** (`ui`, `api`, `model`, `lib`, `config`).

- A block used by a single page stays in that page; it becomes a feature only if it is reused [S3].
- `entities` are business concepts (user, pull request) with their schema, API and UI.
- `shared` has no business logic: `shared/ui`, `shared/api`, `shared/lib`, `shared/config`.
- With Next.js: keep Next's routing `app/` at the root and FSD layers in `src/`; rename
  FSD's own `app`/`pages` layers (e.g. `_app`, `_pages`) and re-export pages into routes [S8].
- FSD pays off for large apps with many domains; for small ones it is overhead [S9].

## 4. Next.js App Router specifics

Next.js does not prescribe a structure [S7]. What it gives you:

- **Safe colocation.** Only `page.tsx` and `route.ts` make a segment public, so other
  files inside `app/` are not routable.
- **Private folders `_name`** opt a folder out of routing entirely. Use them for
  route-local components (`app/pulls/_components/`) so intent is explicit.
- **Route groups `(name)`** group routes (and give them a shared layout) without changing the URL.
- **`src/` is optional**; it separates app code from config files at the root.
- Three documented strategies: (a) project files outside `app/`, `app/` for routing only;
  (b) project files in top-level folders inside `app/`; (c) split by feature/route, with
  shared code at the root and route-specific code inside each segment. Choose one and keep it [S7].

Keep `app/` thin: a page reads params, composes feature components, and handles its own
loading/error states. Business logic does not live in `page.tsx` [S9].

## 5. Decision checklist for a new file

1. Who uses it today? One component → next to it. One route → that route's `_components/`
   or folder. One feature → that feature.
2. Does it have domain meaning? No → `components/` / `utils/` / `lib/`. Yes → a feature or entity.
3. Would a second place need it *now*? If not, do not promote it yet [S4][S17].
4. Does the location match what the project already does? If not, follow the project.
