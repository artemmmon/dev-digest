---
name: dependency-checker
description: Dependency audit for the DevDigest repo and its separate packages (server, client, reviewer-core, e2e, mcp, evals) — scans every package.json and the installed node_modules, draws a Mermaid graph of how packages and heavy dependencies relate, sizes every dependency (own, with its own deps, only-it-pulls), finds unused, undeclared, drifting and duplicated packages and cross-package relative imports, then ranks the findings P0/P1/P2/Info with a short list of actions. Use whenever the user asks to check, audit, review, clean up or visualise dependencies, package.json files, node_modules weight, install size, unused or outdated packages, version drift, "what is heavy in this repo", before adding or removing a package, or when a PR changes a package.json or a lockfile — even if the word "dependency" is never used. Not for CVE triage beyond one advisory count (see security), import-ring rules (see onion-architecture, frontend-architecture) or choosing a new library.
metadata:
  version: "1.0.0"
---

# Dependency checker (DevDigest)

Produces **one structured report** about what the repo depends on: scope, graph, sizes,
prioritised findings, summary. A script collects the facts; you verify the doubtful ones and
write the judgement. Rules and sources are in [README.md](README.md); `[S22]` marks source #22 there.

> **Always start from the script's output.** Never estimate a size, count imports or list
> versions from memory or by hand. *Why:* the numbers are the whole value of the report, and a
> guessed 120 MB looks the same as a measured one.

## The facts come from one command

```bash
node .claude/skills/dependency-checker/assets/dep-report.mjs            # sections 1-4 as markdown
node .claude/skills/dependency-checker/assets/dep-report.mjs --format json   # same data, for detail
```

Flags: `--packages server,client` (narrow what is reported; aliases and relative imports still resolve against every package) · `--top 12` (rows per table) · `--audit` (runs
`pnpm audit` / `npm audit` per package; needs the network, so ask first) · `--root <dir>`.
Node ≥ 18; the shell's default Node here can be 16, so put Node 22 first on `PATH`.
Read-only: it never installs and never edits.

## Principles

1. **A package, not "the project".** The repo has no workspace: each package has its own
   `package.json`, lockfile and `node_modules`. Report per package; never say `workspace:*` or
   "the monorepo". *Why:* the same name in two packages is two installs, and that is where
   drift comes from [S6].
2. **Say which size you mean.** The script measures **installed size** (bytes on disk, with
   what the package pulls in). It is the cost for `server/`, `mcp/`, CI and Docker layers. It is
   *not* what reaches a browser: that is bundle size, and only imports from client components
   count there [S18][S19][S20]. *Why:* "next is 277 MB" is true and irrelevant to page weight.
3. **Internal is not external.** Path aliases (`@devdigest/shared`), vendored copies
   (`src/vendor/shared`) and relative imports between packages are the repo's own coupling,
   listed apart from npm packages. A relative import that leaves its package is a finding.
4. **Rank by consequence, not by size.** P0 breaks a build or a repo rule, P1 is waste or a
   wrong section, P2 is hygiene, Info is the record. Size alone never makes a P0
   ([severity.md](references/severity.md)).
5. **Every finding names a file or package and a fix.** "Consider optimising dependencies" is
   not a finding. *Why:* a developer must be able to act on a row without re-deriving it.
6. **Candidates are not verdicts.** "Unused" is a heuristic (imports, scripts, config, strings,
   CSS, peers). Check each P1 *unused* with one search before writing it, and word it as
   "confirm, then remove" [S14][S17].
7. **Recommend; apply only what the user then asks for.** The report itself edits nothing:
   no `package.json` change, no install, update or removal. A change happens only after the
   user, having seen the report, asks for that specific change. *Why:* a removal can break a
   runtime path no static scan sees.
8. **Say what you could not measure.** Not installed → sizes are `n/a`, and some findings are
   demoted. No network → no advisories. State it in Scope, do not fill the gap with a guess.

## Workflow (copy and tick off)

```
- [ ] 1. Scope: packages = every folder with a package.json (script finds them); narrow only if asked
- [ ] 2. Run the script (markdown), keep its output as the base of the report
- [ ] 3. Anything "not installed"? say so in Scope; install only if the user agreed, then re-run
- [ ] 4. Advisories wanted? run with --audit after asking; if you cannot ask, do not run it and write "not checked"
- [ ] 5. Verify each P0/P1: open the file:line, grep the dependency name once, check peers/plugins
- [ ] 6. Fix severities the script cannot judge (see severity.md "Adjusting"), merge repeats
- [ ] 7. Write the report in the fixed format (report-format.md); Summary last, 3-5 actions
```

## Report format (fixed)

Five sections, these names, this order — details and a worked example in
[report-format.md](references/report-format.md):

| # | Section | Content |
|---|---|---|
| 1 | **Scope** | packages analysed, manager, installed or not, what was *not* measured |
| 2 | **Dependency graph** | one Mermaid `flowchart LR` [S22]: packages as boxes, heaviest dependencies inside, alias and relative-import arrows |
| 3 | **Sizes** | totals per package, heaviest dependencies, duplicated installs, version drift |
| 4 | **Findings & priorities** | P0 → P1 → P2 → Info tables: id, where, what, why, fix |
| 5 | **Summary** | 3-5 concrete actions in priority order, each with the package, the file and the expected gain |

## Check

The script is its own check: exit 0 and a report. A report is **not** done until: the graph is
a fenced `mermaid` block that renders; every P0/P1 row names a file or `package.json`; section
5 exists; nothing in it claims an action was performed.

The script's own tests (throw-away repos, no network): `node --test .claude/skills/dependency-checker/assets/tests/*.test.mjs`.

## Read next

| When you are… | Read |
|---|---|
| Writing the report, or unsure what a section needs | [report-format.md](references/report-format.md) |
| Deciding a severity, or adjusting the script's | [severity.md](references/severity.md) |
| Explaining a number, or measuring by hand when the script cannot run | [measuring.md](references/measuring.md) |
| Working in this repo (packages, managers, intentional copies, known quirks) | [devdigest.md](references/devdigest.md) |
| Checking why a rule exists or where sources disagree | [README.md](README.md) |

## Out of scope

- Which library to adopt, upgrade plans and changelog reading — advise only on what the report shows.
- Vulnerability triage beyond the advisory counts → `security`; import-ring rules → `onion-architecture` / `frontend-architecture`.
- Editing `package.json`, lockfiles, or running install/update/remove on your own initiative — recommend; do it only when the user asks for that change.
