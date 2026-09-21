# Import boundaries, public APIs, barrels and naming

Sources: [S1] bulletproof-react, [S5] Wieruch, [S6] Comeau, [S11] hook naming,
[S47] FSD public API, [S48] eslint-plugin-boundaries, [S49]–[S51] barrel files.

## 1. One-way dependencies

- Shared code does not import features; features do not import each other; routes compose
  features [S1][S2].
- Enforce it with lint instead of review comments:
  - `import/no-restricted-paths` zones (bulletproof-react's approach) [S1], or
  - `eslint-plugin-boundaries`: classify folders into element types and allow/deny
    dependencies between them, including "only via the public entry" [S48].
  - FSD projects can use its Steiger linter [S47].
- Inside a slice use relative imports; across slices use the path alias (`@/…`) — this
  keeps cycles visible [S47].

## 2. Public API of a module

A feature or component folder may expose a small `index.ts` as its contract [S47][S5][S6].

- Export **named items explicitly**; no `export *` — you see exactly what is public and
  avoid accidental name clashes [S47].
- Everything not exported from the index is private to the folder.
- One index per component in shared UI (`components/Button/index.ts`), not one giant
  `components/index.ts` [S47].

## 3. Barrel files: the debate and the middle ground

- **Against:** barrels in app code inflate the module graph, create import cycles and slow
  dev start-up, tests and lint. Removing them has cut loaded modules from ~11k to ~3.5k in
  a Next.js app [S49] and sped up tooling by 60–80% [S50]. bulletproof-react advises direct
  imports [S1].
- **For:** a curated index as a deliberate public API [S47][S5][S6].
- Third-party library barrels are a different problem; Next's `optimizePackageImports`
  handles them [S51].

**Middle ground used by this skill:**
- A *thin* `index.ts` per component or feature that re-exports its public items by name — OK.
- `export *` aggregators over many modules, or a root barrel that re-exports the app — avoid.
- Internal files import each other directly, never through their own folder's index (cycle risk).
- If a project already has a convention, follow it and note the risk instead of rewriting.

## 4. Naming

There is no official standard beyond hooks [S11]; consistency matters more than the choice.

- Hooks start with `use` + capital letter; plain functions never do [S11].
- Pick one file-name case per kind and keep it: common choices are `PascalCase.tsx` for a
  component file and `kebab-case.ts` for everything else [S6][S5].
- Folder of a component matches its component name; singular domain names
  (`features/review`, not `features/reviews-stuff`) [S5].
- Consistent suffixes: `*.test.ts(x)`, `*.helpers.ts` / `helpers.ts`, `constants.ts`,
  `types.ts`, `queries.ts`, `actions.ts`.
- Name by domain meaning, not by technical role: `FindingCard`, not `ItemWrapper2`.
