# Measuring

What every number in the report is, how it is computed, and how to get it by hand when the
script cannot run.

## Contents
1. The three size columns
2. What the scan reads
3. Limits and false-positive classes
4. Install size, publish size, bundle size
5. By hand (fallbacks)

## 1. The three size columns

| Column | Meaning |
|---|---|
| **Own** | apparent bytes of the package's own files (nested `node_modules` excluded) |
| **With its deps** | own + every package it pulls in (`dependencies` and installed `optionalDependencies`, resolved the way Node resolves), each counted once |
| **Only it pulls** | the part of *with its deps* that no other declared dependency of the same package also pulls: roughly what removing it frees |

Package totals (**prod footprint**, **total footprint**) are the union of those closures, so a
package shared by two dependencies is counted once. "Prod" = `dependencies` +
`optionalDependencies`; "total" adds `devDependencies`.

Sizes are **apparent file bytes**, not disk blocks, and `MB` means 1,048,576 bytes (what `du -h`
prints as `M`); registry `unpackedSize` is in plain bytes, so divide by 1,048,576 to compare.
Apparent bytes also are not disk blocks. pnpm hard-links files from one content
store, so the real disk cost of several packages is lower than the sum shown [S6]. Compare
numbers inside one report; do not compare them with `du` output.

## 2. What the scan reads

| Signal | Source |
|---|---|
| declared dependencies, ranges, sections | each `package.json` |
| manager | lockfile name (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock*`) |
| installed version, size, closure | `<package>/node_modules` |
| imports | `import … from`, `export … from`, `import 'x'`, `import('x')`, `require('x')` at statement level in `.ts/.tsx/.js/.jsx/.mjs/.cjs` |
| tooling use | package scripts (the name or one of its `bin` names), root config files, quoted names in source (`target: 'pino-pretty'`), CSS `@import` |
| internal edges | `compilerOptions.paths` in `tsconfig.json`, relative imports that resolve outside the package |

Skipped folders: `node_modules`, `.next`, `dist`, `build`, `coverage`, `clones`, `results`,
`out`, `.turbo`, `docs`, and every dot-folder.

## 3. Limits and false-positive classes

| Class | What happens | What to do |
|---|---|---|
| Peer of another dependency (`react-dom` for `next`) | looks unused | script marks `peer-of` when installed; when not installed it demotes to P2 |
| Plugin loaded by name from config | may look unused | grep the config; keep if loaded |
| Used only by a CLI in a non-script (CI workflow, Docker) | looks unused | grep `.github/` and `Dockerfile` |
| Import inside a template literal or sample string | can look undeclared | the script only reports names that resolve from `node_modules`; read the line |
| Dynamic specifier (`import(name)`) | invisible | cannot be found statically; say so if the package has plugins |
| Type-only use of a dev dependency | not a runtime use | the script excludes `import type` |

A second opinion exists: `knip` reports unused, unlisted and unresolved dependencies from the
project's real entry points [S14][S16]. It needs the registry to install, so run it only when
the user agrees. `depcheck` is archived; do not suggest it [S17].

## 4. Install size, publish size, bundle size

| Kind | What it answers | Where it comes from |
|---|---|---|
| **Install size** (this report) | what `node_modules` costs a machine, CI cache or Docker layer | the installed tree [S19] |
| **Publish size** | the unpacked size of one package version, no dependencies | registry `dist.unpackedSize` [S12][S13] |
| **Bundle size** | what a browser downloads: minified, gzipped, tree-shaken | a bundler or bundlephobia's `size`/`gzip` [S18] |

In a Next.js app, server-only dependencies add nothing to the browser bundle; heavy client
imports are reduced with dynamic import or `optimizePackageImports` [S20][S21]. The report
cannot see bundle size: when a heavy dependency is imported by client components, say that the
bundle needs measuring with the app's own analyzer and do not quote the install size as page weight.

## 5. By hand (fallbacks)

```bash
pnpm list --depth 0 --json            # direct deps and installed versions        [S1]
pnpm why <name>                       # who pulls it                              [S2]
pnpm outdated --format json           # behind latest (network)                   [S3]
pnpm audit --json --prod              # advisories (network)                      [S4]
pnpm dedupe --check                   # would a dedupe change the lockfile        [S5]
npm ls --all --json --omit=dev        # npm packages' tree                        [S7]
npm outdated --json                   # behind latest (network)                   [S8]
npm audit --json --omit=dev           # advisories (network)                      [S9]
npm view <name>@<ver> dist.unpackedSize   # publish size of one version           [S12]
```

The JSON field names of the audit and list commands are not documented on the CLI pages; run
a command once in a package before writing a parser around it.
