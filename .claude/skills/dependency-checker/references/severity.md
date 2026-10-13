# Severity

Tiers answer one question: **what happens if nobody acts?** Size alone never raises a tier.

| Tier | Meaning | Typical wait |
|---|---|---|
| **P0** | Breaks a build, a clean install, or a rule the repo enforces | fix before merge |
| **P1** | Waste, a wrong section, or drift that can bite at runtime | next PR touching that package |
| **P2** | Hygiene and size worth a ticket | backlog |
| **Info** | The record: nothing to do now, or nothing measurable | none |

## Contents
1. The ladder the script applies
2. Why those tiers
3. Adjusting (what the script cannot know)
4. Not findings

## 1. The ladder the script applies

| Rule id | Tier | Condition |
|---|---|---|
| `cross-package-relative-import` | P0 · P1 in tests | a relative import resolving into another package's folder |
| `undeclared-dependency` | P0 · P1 test/config · Info not installed | imported, absent from every `package.json` section, yet resolvable from `node_modules` (a phantom) |
| `advisories` (`--audit`) | P0 critical/high · P1 moderate · P2 low | counts from the manager's audit [S28] |
| `no-lockfile` | P1 | a package with no lockfile |
| `unused-dependency` | P1 · P2 when not installed | in `dependencies`, no import, script, config, string or CSS reference, not a peer of an installed dependency |
| `prod-dependency-used-only-in-tests` | P1 | in `dependencies`, imported only from test files |
| `dev-dependency-imported-by-shipped-code` | P1 if the package has `main`/`bin`/`exports`/`start`, else P2 | in `devDependencies`, non-type import from non-test source |
| `version-drift` | P1 major differs, or a contract package (`zod`) resolved differently · P2 other differing ranges and versions | same name in 2+ packages |
| `duplicate-install` | P2 | one name installed in 2+ versions inside a package, ≥ 5 MB duplicated |
| `heavy-dependency` | P2 | a **runtime** dependency whose closure is ≥ 25 MB, except the package's framework (`FRAMEWORK_PKGS`: next, react, react-dom, fastify, …); the Why cell says whether a client component imports it |
| `prod-dependency-used-only-by-tooling` | P2 | in `dependencies`, referenced by scripts/config only and not by the `start` script |
| `unused-dev-dependency` | P2 | in `devDependencies`, nothing references it |
| `lockfile-skew` | Info | same range, lockfiles resolved different versions |
| `range-drift` | Info | same installed version, different range spelling |
| `mixed-package-managers` | Info | pnpm and npm side by side |
| `not-installed` | Info | no `node_modules`; sizes `n/a` |

Thresholds live at the top of `assets/dep-report.mjs` (`HEAVY_BYTES`, `DUP_WASTE_BYTES`,
`CONTRACT_PKGS`, `FRAMEWORK_PKGS`); change them there, then here.

## 2. Why those tiers

- **Undeclared is P0 in source code.** It works on this machine because the layout hoisted it;
  a fresh install, a different manager or `--prod` breaks. pnpm's strict layout hides
  undeclared packages from the package root, so a phantom mostly shows in the npm packages [S6].
- **Drift of a contract package is P1.** Two copies of `zod` make `instanceof ZodError` fail
  and schemas non-assignable across the copy boundary [S27]. The repo copies its contracts on
  purpose, so the version that parses them has to match.
- **Unused is P1, not P0.** It costs install time, patch noise and attack surface, but nothing
  breaks today. It is also the finding most likely to be a false positive, hence "confirm".
- **Heavy is P2.** Installed size is a cost, not a defect. It becomes interesting when the
  package reaches the browser bundle (check the import sites) [S18][S20].
- **Audit severities** follow npm's own action guidance: critical immediately, high as soon as
  possible, moderate as time allows, low at discretion [S28].

## 3. Adjusting

Raise one tier when:

- a heavy runtime dependency is imported by **client components** (it ships to the browser);
- a duplicated install is a **runtime** package (not a dev tool) or a contract package;
- an unused dependency has `only it pulls` ≥ 10 MB in a package that is deployed;
- the same finding repeats in three or more packages (it is a convention, not an accident).

Lower one tier when:

- the package is dev-only tooling (`private`, no `main`/`bin`/`start`, nothing deployed);
- the flagged import sits in a fixture or a string template (read the line);
- the dependency is intentionally pinned or copied and documented in
  [devdigest.md](devdigest.md).

Never lower a P0 without writing the evidence in the *Why* cell.

## 4. Not findings

Do not report: peer dependencies as unused; `@types/*` whose subject is declared; platform
binaries (`@esbuild/*`) as separate duplicates; the existence of two package managers when each
package has its own lockfile; differing ranges of the same installed version as more than Info.
