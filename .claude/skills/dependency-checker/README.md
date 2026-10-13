# dependency-checker

Dependency audit for the DevDigest repo: a script measures every package's declared and
installed dependencies, a fixed report format turns the facts into a graph, size tables,
prioritised findings and a short action list. Built for a repo of separate packages (no
workspace) with mixed pnpm and npm. Library choice, upgrade planning and CVE triage are out of scope.

- **Version:** 1.0.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-10-12
- **Related skills:** `security`, `onion-architecture`, `frontend-architecture`, `mermaid-diagram`, `pr-self-review`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-12 | Initial version: `assets/dep-report.mjs` (scan, sizes, graph, findings, optional audit), fixed five-section report, severity ladder, measuring and repo references, six evals on a generated fixture |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule,
reference or check, **major** when a rule is reversed or the report format changes. Add a
changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | Principles, the one command, workflow checklist, the fixed report format |
| [references/report-format.md](references/report-format.md) | What each of the five sections contains, style rules, a worked example |
| [references/severity.md](references/severity.md) | Every rule id with its tier, why, how to adjust, what is not a finding |
| [references/measuring.md](references/measuring.md) | What each number is, what the scan reads, false-positive classes, by-hand commands |
| [references/devdigest.md](references/devdigest.md) | The packages, intentional coupling, how to read numbers here, open questions |
| [assets/dep-report.mjs](assets/dep-report.mjs) | The scan: markdown / JSON / Mermaid output, `--audit` optional (Node ≥ 18, no dependencies) |
| [evals/evals.json](evals/evals.json) | 6 scenarios with expected behaviour, all on the generated `mini-repo` fixture |
| [evals/setup/make-fixture.mjs](evals/setup/make-fixture.mjs) | Generates the fixture (sparse files, exact sizes); `--no-modules`, `--with-skill` |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **SV** severity · **MS** measuring · **RF** report-format · **DD** devdigest ·
**RM** this README only. Every URL was opened by the research pass of 2026-10-12; the fetch tool
returns a model-written extract of a page, so statements are paraphrases unless quoted.

### Q1. pnpm: commands and layout

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S1 | pnpm list | https://pnpm.io/cli/list | `--depth`, `--json`, `--prod`/`--dev`, `--long`, `--lockfile-only` (v10.23) | MS |
| S2 | pnpm why | https://pnpm.io/cli/why | reverse tree of who pulls a package; `--json`, `--find-by` | MS |
| S3 | pnpm outdated | https://pnpm.io/cli/outdated | `--format table\|list\|json`, `--long`, `--prod` | MS |
| S4 | pnpm audit | https://pnpm.io/cli/audit | `--json`, `--prod`, `--audit-level`, `--ignore-registry-errors` | MS |
| S5 | pnpm dedupe | https://pnpm.io/cli/dedupe | `--check` exits non-zero if a dedupe would change the lockfile | MS |
| S6 | Symlinked node_modules structure | https://pnpm.io/symlinked-node-modules-structure | hard links into a content store, symlinks for the graph; only declared packages are visible at the root | SK SV MS |

### Q2. npm: commands and registry metadata

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S7 | npm ls | https://docs.npmjs.com/cli/v11/commands/npm-ls | `--all`, `--json`, `--omit`, `--package-lock-only` | MS |
| S8 | npm outdated | https://docs.npmjs.com/cli/v11/commands/npm-outdated | `current`/`wanted`/`latest`, `--json`; JSON fields not documented | MS |
| S9 | npm audit | https://docs.npmjs.com/cli/v11/commands/npm-audit | `--json`, `--omit`, `--audit-level` sets only the exit code | MS |
| S10 | npm explain | https://docs.npmjs.com/cli/v11/commands/npm-explain | alias `npm why`; dependency chains | MS |
| S11 | npm dedupe | https://docs.npmjs.com/cli/v11/commands/npm-dedupe | `--dry-run`, `find-dupes` | MS |
| S12 | npm view | https://docs.npmjs.com/cli/v11/commands/npm-view | dot notation for a nested field, version pinned with `@` | MS |
| S13 | Registry package metadata | https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md | `dist.unpackedSize` = total bytes of the unpacked files of one version | MS |

### Q3. Unused and undeclared detection

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S14 | knip issue types | https://knip.dev/reference/issue-types | `dependencies`, `unlisted`, `unresolved`, `binaries`, `duplicates` | SK MS |
| S15 | knip reporters | https://knip.dev/features/reporters | `--reporter json` shape | RM |
| S16 | knip CLI | https://knip.dev/reference/cli | `--dependencies`, `--production`, exit codes 0/1/2 | MS |
| S17 | depcheck | https://github.com/depcheck/depcheck | README says no longer actively maintained; repo archived 2025-06-16 | SK MS |

### Q4. What "size" means

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S18 | Bundlephobia | https://bundlephobia.com/ | cost of adding a package to a bundle: minified and min+gzip bytes | SK SV MS |
| S19 | packagephobia | https://github.com/styfle/packagephobia | size of a package before install; not real disk usage | SK MS |
| S20 | serverExternalPackages | https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages | server dependencies are bundled by default unless opted out | SK SV MS |
| S21 | optimizePackageImports | https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports | loads only the used modules of large barrel packages | MS |

### Q5. Mermaid

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S22 | Mermaid flowchart syntax | https://mermaid.js.org/syntax/flowchart.html | quote labels with special characters; lowercase `end` breaks a chart; `o`/`x` after `---` start a circle/cross edge; direction inside a subgraph is ignored when its nodes link outside | SK RF |
| S23 | Mermaid config schema | https://mermaid.js.org/config/schema-docs/config.html | `maxTextSize` 50000, `maxEdges` 500 | RM |

### Q6. Hygiene and versions

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S24 | package.json | https://docs.npmjs.com/cli/v11/configuring-npm/package-json | meaning of the four dependency sections, `overrides`, peer auto-install since npm 7 | SV |
| S25 | semver (npm v6 docs) | https://docs.npmjs.com/cli/v6/using-npm/semver | `^1.2.3` = `>=1.2.3 <2.0.0`; `^0.2.3` = `>=0.2.3 <0.3.0` | RM |
| S26 | pnpm dependency-resolution settings | https://pnpm.io/settings/dependency-resolution | `overrides` in `pnpm-workspace.yaml` | RM |
| S27 | Zod versioning | https://zod.dev/v4/versioning | separate copies of zod make `instanceof` checks likely fail | SV |

### Q7. Advisories

| # | Title | URL | Key point | Used in |
|---|---|---|---|---|
| S28 | About audit reports | https://docs.npmjs.com/about-audit-reports | critical immediately, high as soon as possible, moderate as time allows, low at discretion | SV |
| S29 | Auditing dependencies | https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities | the dependency tree is sent to the registry; peer dependencies are not audited | DD |

## Conflicts and outdated guidance

1. **depcheck.** Still widely downloaded, but its own README points to knip and the repo is
   archived [S17]. The skill neither uses nor recommends it.
2. **Where pnpm settings live.** pnpm 11 reads settings from `pnpm-workspace.yaml` and ignores
   the `pnpm` field of `package.json` [S26]; the repo's three `pnpm-workspace.yaml` files hold
   only `allowBuilds`. They do not make a workspace, so the skill reads them as policy, not as links.
3. **Size.** Registry `unpackedSize` is per package, packagephobia is install size,
   bundlephobia is browser cost [S13][S18][S19]. The report states which one it shows.

## Notes on verification

- Not verified: the JSON shape of `pnpm list/why/outdated/audit --json` and
  `npm ls/outdated/explain --json` (the pages name the flags, not the fields). `--audit` reads
  only `metadata.vulnerabilities` and degrades to "audit unavailable" when it is missing. Run it
  once against a real package before relying on it.
- Not verified: packagephobia's own definition of install size (HTTP 429 during research) and
  Next.js's package-bundling guide (HTTP 504). Section 4 of `measuring.md` states only what
  the verified pages say.
- Mermaid characters `@ . / -` in quoted labels are not individually listed by the docs; the
  generator relies on the general quoting rule and on ids made of `[A-Za-z0-9_]`.
- The unused-dependency detector is a heuristic (imports, scripts, config, quoted names, CSS,
  peers); it is not a replacement for `knip`, and `measuring.md` lists its false-positive classes.

## Evaluation log

Scenarios in `evals/evals.json`, run by a fresh Claude instance on the generated `mini-repo`
(`evals/setup/make-fixture.mjs`; add `--with-skill` for the skill arm). Results go to
`evals/workspace/` (git-ignored).

| Date | Scenario | Result | Change made |
|---|---|---|---|
| 2026-10-12 | Script on `mini-repo` (deterministic, no model) | All six planted findings reported with the intended tier: relative import P0, phantom `lodash` P0, unused `moment` P1 (4.2 MB), `zod` drift P1, mixed managers Info; `react-dom` correctly not flagged (peer of `next`); `next` (132 MB) listed in Sizes only, exempt as the framework | — |
| 2026-10-12 | Script on the real repo (5 packages + `evals/`, installed from a sibling worktree) | 95 declared dependencies, 6 packages; false positives found and fixed while building: string literals read as imports, `import(/* c */ 'x')`, tsconfig `zod` pin read as an alias, peers, `@types/*`, Tailwind CSS imports, template-literal relative imports | Statement-level import regexes, peer-of status, `@types` mapping, CSS scan, "must resolve from node_modules" for undeclared, esbuild family grouping, lockfile-skew tier |
| 2026-10-12 | Smoke run: one fresh agent, skill arm only, `mini-repo` (full-report-structure) | Followed the skill: script run, five sections in order, mermaid graph, tiers with none/not-empty, Summary of 5 ordered actions, no action claimed. Reported 8 defects of the skill itself | Fixed: Summary placeholder printed by the script (numbering 1-5 everywhere); relative imports listed in the internal-dependency table; fix text no longer assumes an alias exists; framework exempt from `heavy-dependency`, and its Why says whether a client component imports it; MB defined as 1,048,576 bytes; `peer-of <dep>` shown; "cannot ask → do not audit" |
| 2026-10-12 | Six evals with and without the skill | not run yet | — |
