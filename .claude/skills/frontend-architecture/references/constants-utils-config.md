# Constants, helpers, utils, lib, config, types

Sources: [S1] bulletproof-react, [S2][S3] FSD segments, [S4] Colocation, [S6] Comeau,
[S17] AHA, [S21] Next.js environment variables.

## Vocabulary (use it consistently)

| Folder / file | Holds | Example |
|---|---|---|
| `constants.ts` | Fixed values: enums-as-objects, limits, option lists, key names | `SEVERITY_ORDER`, `PAGE_SIZE` |
| `helpers.ts` | Pure functions specific to **this project / feature** | `formatRunCost(run)` |
| `utils/` or `utils.ts` | Pure, generic functions that would fit **any project** | `clamp`, `groupBy`, `sleep` |
| `lib/` | **Configured third-party libraries** and app-wide infrastructure | API client, query client, i18n setup |
| `config/` | Environment + global configuration, read and validated in one place | `config/env.ts` |
| `types.ts` / `types/` | Types without a runtime; shared ones at the root | `ReviewRow` |

Comeau's split of `helpers` (project-specific) vs `utils` (generic) [S6] and bulletproof's
`lib` (preconfigured libraries) vs `utils` (shared helpers) [S1] fit together without
conflict. FSD calls the same things segments: `lib`, `config`, `api` inside a slice, and
`shared/lib`, `shared/config` for the business-agnostic ones [S2][S3].

## Where each lives

1. **Used by one module** → in that module (top of the file), or a sibling `constants.ts` /
   `helpers.ts` once the component file gets noisy [S4].
2. **Used by one feature** → that feature's `constants.ts` / `utils.ts` / `types.ts` [S1].
3. **Used by two or more features** → the shared level (`constants/`, `utils/`, `lib/`, `types/`).
4. Move up only when the second consumer exists [S17]. A "shared" folder full of things one
   component uses hides ownership and makes deletion risky.

## Constants

- Name as `SCREAMING_SNAKE_CASE` for true constants; freeze shapes with `as const` so the
  type is literal and unions can be derived from them.
- Keep UI **strings** out of constants: they belong in i18n message files.
- Keep styling tokens in the design system, not in feature constants.
- Magic numbers in logic (timeouts, thresholds, page sizes) get a named constant next to
  the logic that uses them.

## Helpers and utils

- Pure: input → output, no React, no I/O. That makes them testable with plain unit tests
  (put the test next to it).
- If a helper needs hooks, it is a hook; if it calls the API, it belongs to the API layer.
- Avoid a single giant `utils.ts`; split by topic (`format-date.ts`, `github-urls.ts`).

## Environment and config (Next.js)

- Variables without the `NEXT_PUBLIC_` prefix are **server-only** [S21].
- `NEXT_PUBLIC_*` values are **inlined at build time**: one Docker image promoted across
  environments keeps the values it was built with. For runtime values, read them on the
  server during dynamic rendering [S21].
- Read `process.env` in **one** module (`config/env.ts`, or the API client module), validate
  it (e.g. with Zod), and export typed values. Everything else imports from there.
- `.env*` files live at the project root, even with a `src/` folder [S21].
