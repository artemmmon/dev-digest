# frontend-architecture

Architecture rules for React + Next.js App Router frontends: where components, hooks,
constants, helpers/utils, business logic, data fetching and providers live; how to split
components; import boundaries and naming. Performance is out of scope.

- **Version:** 1.0.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-09-18
- **Related skills:** `react-best-practices`, `next-best-practices`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-18 | Initial version: 55 sources, 6 topic references + DevDigest mapping |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule or
reference, **major** when a rule is reversed. Add a changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | Principles, "where does X go?" table, when to split, pointers |
| [references/folder-structure.md](references/folder-structure.md) | Where components live; feature vs type layout; FSD; Next.js `app/` organisation |
| [references/component-design.md](references/component-design.md) | How to split components; hooks vs containers; composition; `"use client"` placement |
| [references/constants-utils-config.md](references/constants-utils-config.md) | Constants, helpers, utils, lib, config, types, env |
| [references/logic-and-data.md](references/logic-and-data.md) | Business logic layers, state placement, API layer, queries, Next data fetching, actions, route handlers |
| [references/boundaries-and-naming.md](references/boundaries-and-naming.md) | Import rules, public API, barrel files, naming |
| [references/nextjs-conventions.md](references/nextjs-conventions.md) | Layouts/error/loading, providers, next-intl, Next 15 vs 16 |
| [references/devdigest.md](references/devdigest.md) | How the rules map to DevDigest `client/` + open questions |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **FS** folder-structure · **CD** component-design ·
**CU** constants-utils-config · **LD** logic-and-data · **BN** boundaries-and-naming ·
**NC** nextjs-conventions · **DD** devdigest.

### Q1. Where components live / folder structure

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S1 | Project Structure | Alan Alickovic (bulletproof-react) | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | `src/{app,components,config,features,hooks,lib,stores,types,utils}`; features own `api/components/hooks/stores/types/utils`; no cross-feature imports; shared → features → app; avoid barrels | living doc | SK FS CU BN |
| S2 | Overview | Feature-Sliced Design | https://feature-sliced.design/docs/get-started/overview | Layers → slices → segments (`ui/api/model/lib/config`); import only from lower layers | living doc | FS CU BN |
| S3 | Layers (reference) | Feature-Sliced Design | https://feature-sliced.design/docs/reference/layers | What each layer holds; a feature exists only if reused; page-only blocks stay in the page | living doc | FS CU |
| S4 | Colocation | Kent C. Dodds | https://kentcdodds.com/blog/colocation | Keep code (incl. tests, styles) as close as possible to where it is relevant | — | SK FS CU |
| S5 | React Folder Structure in 8 Steps | Robin Wieruch | https://www.robinwieruch.de/react-folder-structure/ | Grow structure in stages: file → folders → technical → features → domains → packages; one-way flow; kebab-case | updated May 2026 | FS BN |
| S6 | Delightful React File/Directory Structure | Josh W. Comeau | https://www.joshwcomeau.com/react/file-structure/ | Type-based layout; `components/X/{X.tsx,index.ts}`; `helpers` (project) vs `utils` (generic); `constants.ts` | 2022, updated Dec 2025 | FS CU BN |
| S7 | Project structure and organization (v15) | Next.js / Vercel | https://nextjs.org/docs/15/app/getting-started/project-structure | Unopinionated; safe colocation; `_private` folders; `(route groups)`; optional `src/`; three strategies — pick one | Next 15 | SK FS NC |
| S8 | Usage with Next.js | Feature-Sliced Design | https://feature-sliced.design/docs/guides/tech/with-nextjs | Next `app/` at root, FSD layers in `src/`; rename FSD `app`/`pages` layers; re-export pages | living doc | FS |
| S9 | The Ultimate Next.js App Router Architecture | Evan Carter (FSD blog) | https://feature-sliced.design/blog/nextjs-app-router-guide | Thin `app/`; server reads, slice-owned actions; FSD pays off only for large apps (community article) | Jan 2026 | FS |

### Q2. How to split components

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S10 | Thinking in React | React team | https://react.dev/learn/thinking-in-react | A component ideally does one thing; tree follows the data model; minimal state | living doc | SK CD |
| S11 | Reusing Logic with Custom Hooks | React team | https://react.dev/learn/reusing-logic-with-custom-hooks | Extract repeated/effectful logic to `useX`; `use` prefix only for hook callers | living doc | SK CD BN |
| S12 | Passing Data Deeply with Context | React team | https://react.dev/learn/passing-data-deeply-with-context | Props → composition via `children` → context, in that order | living doc | SK CD |
| S13 | Presentational and Container Components | Dan Abramov | https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 | 2019 note: no longer recommends this split; hooks replace it (**outdated as a rule**) | 2015, note 2019 | SK CD |
| S14 | Container/Presentational Pattern | patterns.dev (Lydia Hallie, Addy Osmani) | https://www.patterns.dev/react/presentational-container-pattern/ | Explains the pattern; hooks achieve the same separation without wrappers | living doc | CD |
| S15 | Compound Pattern | patterns.dev | https://www.patterns.dev/react/compound-pattern/ | Components sharing implicit state via context (Select/Option style) | living doc | SK CD |
| S16 | React Hooks: Compound Components | Kent C. Dodds | https://kentcdodds.com/blog/compound-components-with-react-hooks | Context + hooks for flexible compound APIs without prop drilling | Feb 2019 | CD |
| S17 | AHA Programming | Kent C. Dodds | https://kentcdodds.com/blog/aha-programming | Avoid Hasty Abstractions: prefer duplication over the wrong abstraction | — | SK CD CU LD |
| S18 | Server and Client Components | Next.js | https://nextjs.org/docs/app/getting-started/server-and-client-components | `"use client"` is a module boundary; keep it on leaves; pass server components as `children`; `server-only`; providers deep | v16 page, same in v15 | SK CD NC |
| S19 | Server and Client Composition Patterns | Next.js | https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns | Supported vs unsupported server/client nesting; move client components down | Next 14 (merged into S18 later) | CD |
| S20 | Common mistakes with the Next.js App Router | Lee Robinson (Vercel) | https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them | Don't call own Route Handlers from RSC; don't `"use client"` everywhere; providers in own file | Jan 2024 — caching claims outdated for 15 | CD LD NC |

### Q3. Constants, utils, helpers, lib, config

Also covered by S1, S2, S3, S4, S6.

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S21 | How to use environment variables (v15) | Next.js | https://nextjs.org/docs/15/app/guides/environment-variables | Server-only by default; `NEXT_PUBLIC_*` inlined at build; `.env` at root even with `src/` | Next 15 | CU |

### Q4. Business logic, state, data fetching

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S22 | Modularizing React Applications with Established UI Patterns | Juntao Qiu (martinfowler.com) | https://martinfowler.com/articles/modularizing-react-apps.html | View → hooks → domain model → gateway; strategy objects over scattered conditionals | Feb 2023 | SK LD |
| S23 | You Might Not Need an Effect | React team | https://react.dev/learn/you-might-not-need-an-effect | Derive during render; user-action logic in handlers; effects only for external sync | living doc | SK LD |
| S24 | Choosing the State Structure | React team | https://react.dev/learn/choosing-the-state-structure | Avoid redundant, contradictory, duplicated, deeply nested state | living doc | SK LD |
| S25 | Sharing State Between Components | React team | https://react.dev/learn/sharing-state-between-components | Lift to closest common parent; single source of truth | living doc | LD |
| S26 | State Colocation will make your React app faster | Kent C. Dodds | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster | Move state down to where it is used | — | SK LD |
| S27 | Application State Management with React | Kent C. Dodds | https://kentcdodds.com/blog/application-state-management-with-react | Separate server cache from UI state; keep UI state local | — | SK LD |
| S28 | State Management | Alan Alickovic (bulletproof-react) | https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md | Five state kinds (component, app, server cache, form, URL), a tool for each | living doc | LD |
| S29 | API Layer | Alan Alickovic (bulletproof-react) | https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md | One configured API client; per-endpoint fetcher + types + hook inside the feature | living doc | LD |
| S30 | Does TanStack Query replace Redux, MobX…? | TanStack | https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state | After moving server state to the cache, remaining client state is tiny | TanStack Query v5 | SK LD |
| S31 | React Query as a State Manager | Dominik Dorfmeister (TkDodo) | https://tkdodo.eu/blog/react-query-as-a-state-manager | Don't copy server data into other state; control freshness with `staleTime` | Aug 2021 | SK LD |
| S32 | Practical React Query | TkDodo | https://tkdodo.eu/blog/practical-react-query | Separate queries from UI; never put query data in local state; key = dependency array | 2020, updated Oct 2023 | LD |
| S33 | Effective React Query Keys | TkDodo | https://tkdodo.eu/blog/effective-react-query-keys | Hierarchical key factory per feature, colocated with the feature | 2021, updated 2022 | LD DD |
| S34 | The Query Options API | TkDodo | https://tkdodo.eu/blog/the-query-options-api | `queryOptions` factories keep key + fn together; hook-only wrappers add little | Jan 2024 | LD DD |
| S35 | Query Options guide | TanStack | https://tanstack.com/query/latest/docs/framework/react/guides/query-options | Official way to share key + fn across `useQuery`, `prefetchQuery`, etc. | TanStack Query v5 | LD |
| S36 | Query Keys guide | TanStack | https://tanstack.com/query/latest/docs/framework/react/guides/query-keys | Every variable used in `queryFn` belongs in the key | TanStack Query v5 | LD |
| S37 | Advanced Server Rendering | TanStack | https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr | `getQueryClient()` per request, `providers.tsx`, prefetch + `HydrationBoundary`, `staleTime > 0` | TanStack Query v5 | LD NC DD |
| S38 | Fetching Data | Next.js | https://nextjs.org/docs/app/getting-started/fetching-data | Fetch in Server Components; stream with Suspense; `Promise.all`; `React.cache`; client via React Query/SWR | v16 page (mentions `use cache`) | LD NC |
| S39 | How to use Next.js as a backend for your frontend (v15) | Next.js | https://nextjs.org/docs/15/app/guides/backend-for-frontend | RSC call sources directly, not own Route Handlers; client fetch for polling; actions not for reads | Next 15 | LD |
| S40 | How to Think About Security in Next.js | Sebastian Markbåge (Next.js blog) | https://nextjs.org/blog/security-nextjs-server-components-actions | Pick one model; "HTTP APIs" model for an existing backend; DAL returning DTOs otherwise | Oct 2023 (14-era APIs) | LD NC |
| S41 | How to think about data security in Next.js | Next.js | https://nextjs.org/docs/app/guides/data-security | `server-only` data access layer, DTOs, thin actions | v16 page | LD |
| S42 | Updating Data (v15) | Next.js | https://nextjs.org/docs/15/app/getting-started/updating-data | Server Actions in `'use server'` files; not defined inside Client Components; `useActionState` | Next 15 | LD |
| S43 | Building APIs with Next.js | Lee Robinson (Next.js blog) | https://nextjs.org/blog/building-apis-with-nextjs | Actions ≈ POST endpoints for mutations; shared logic in the data layer | Feb 2025 | LD |
| S44 | Route Handlers | Next.js | https://nextjs.org/docs/app/getting-started/route-handlers | `route.ts` can't share a segment with `page.ts`; uncached by default | v16 page | LD |
| S45 | Layouts and Pages (v15) | Next.js | https://nextjs.org/docs/15/app/getting-started/layouts-and-pages | Layouts persist and don't re-render; root layout owns html/body; async params | Next 15 | NC |
| S46 | Error Handling (v15) | Next.js | https://nextjs.org/docs/15/app/getting-started/error-handling | Expected errors as values; `error.tsx` is a Client Component; `global-error.tsx`; `notFound()` | Next 15 | NC |

### Q5. Import boundaries, public API, barrels, naming

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S47 | Public API | Feature-Sliced Design | https://feature-sliced.design/docs/reference/public-api | Index as contract, no `export *`; relative inside a slice, absolute across; per-component index in shared | living doc | BN |
| S48 | eslint-plugin-boundaries | Javier Brea | https://github.com/javierbrea/eslint-plugin-boundaries | Element types + allow/deny dependency rules; enforce entry points | v7.2 | BN DD |
| S49 | Please Stop Using Barrel Files | TkDodo | https://tkdodo.eu/blog/please-stop-using-barrel-files | Barrels cause cycles and slow dev; 11k → 3.5k modules after removal; OK only for libraries | Jul 2024 | BN DD |
| S50 | Speeding up the JavaScript ecosystem, part 7: barrel files | Marvin Hagemeister | https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/ | Barrels inflate module graph; removing them speeds tooling 60–80% | Oct 2023 | BN DD |
| S51 | How we optimized package imports in Next.js | Vercel | https://vercel.com/blog/how-we-optimized-package-imports-in-next-js | `optimizePackageImports` for third-party barrels (not app structure) | Oct 2023 | BN |

### Q6. Internationalisation (next-intl)

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S52 | App Router with i18n routing | next-intl (Jan Amann) | https://v3.next-intl.dev/docs/getting-started/app-router/with-i18n-routing | `src/i18n/{routing,navigation,request}.ts`, `middleware.ts`, `app/[locale]/` | next-intl v3 | NC |
| S53 | Server & Client Components | next-intl | https://next-intl.dev/docs/environments/server-client-components | Translate on the server, pass strings down; scope client messages | v4 docs, principle holds for v3 | NC |
| S54 | Setup locale-based routing | next-intl | https://next-intl.dev/docs/routing/setup | Same structure with `proxy.ts` on Next 16 | next-intl v4 | NC |
| S55 | next-intl 4.0 | Jan Amann | https://next-intl.dev/blog/next-intl-4-0 | v3 → v4 breaking changes (required provider, ESM-only, typed `AppConfig`) | Mar 2025 | NC |

## Conflicts and outdated guidance

How the skill resolves the places where sources disagree:

| Topic | Positions | Skill's rule |
|---|---|---|
| Barrel / `index.ts` files | Against: S1, S49, S50. For a curated public API: S5, S6, S47 | Thin named `index.ts` per component/feature is fine; no `export *` aggregators or root barrels; internal files import directly |
| Feature- vs type-based folders | Type: S6. Feature: S1, S2, S5. Next: pick one (S7) | Grow in stages (S5); follow the project's existing choice |
| Container / presentational | Retired by its author (S13), echoed by S14 | Extract a custom hook instead |
| Hook per query vs `queryOptions` | TkDodo 2020–21 (S32) vs 2024 (S34) + TanStack (S35) | Prefer `queryOptions` factories colocated with the feature |
| Cross-feature imports | Banned (S1) vs controlled `@x` exception (S2/S47) | Lift or compose in the route; `@x`-style only for entities in FSD projects |
| Depth of layering | Domain models + strategies (S22) vs AHA / colocation (S4, S17) | Add a domain layer only when rules repeat or grow complex |
| File-name case | kebab-case (S5) vs PascalCase components (S6) | No standard; follow the project |
| Next.js versions | Unversioned docs = v16; 14-era posts (S19, S20, S40) | Cite `/docs/15/` for v15 projects; trust principles, re-check APIs |

## Notes on verification

- All URLs were fetched on 2026-09-18 and loaded.
- S13 (Medium) returns HTTP 403 to automated fetches; its content was confirmed via a mirror. The original URL is kept.
- `nextjs.org/docs/...` without a version shows the latest major (16 at the time of writing);
  pages marked "v16 page" had the same guidance in v15 for the parts used here.
