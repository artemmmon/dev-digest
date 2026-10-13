# DevDigest — how the checker applies here

## Contents
1. The packages
2. Coupling that is intentional
3. Reading the numbers here
4. What to raise with the user
5. Open questions

## 1. The packages

No workspace: every package is its own install. `pnpm-workspace.yaml` files in `server/`,
`client/` and `mcp/` hold only `allowBuilds` (install-script policy), they do not link
packages.

| Folder | Manager | Lockfile | Deployed? |
|---|---|---|---|
| `server/` | pnpm | `pnpm-lock.yaml` | yes: `start` = `node dist/server.js` |
| `client/` | pnpm | `pnpm-lock.yaml` | yes: `next start` |
| `mcp/` | pnpm | `pnpm-lock.yaml` | runs from source: `start` = `tsx src/index.ts` (so `tsx` belongs in `dependencies`) |
| `reviewer-core/` | **npm** | `package-lock.json` | library, compiled into `server/` |
| `e2e/` | **npm** | `package-lock.json` | dev-only, no runtime dependencies |
| `evals/` | pnpm | `pnpm-lock.yaml` | dev-only harness (upstream `l06-evals`) |

Mixed managers are by design: report them as Info, once.

## 2. Coupling that is intentional

- **Path aliases, not packages.** `@devdigest/shared` resolves to `server/src/vendor/shared`
  from `server`, `reviewer-core` and `mcp`; `client/` has its own copy at `client/src/vendor/shared`
  (kept content-identical by `./scripts/shared-contracts.sh`); `@devdigest/reviewer-core`
  resolves to `reviewer-core/src` from `server`. These are the graph's arrows.
- **`reviewer-core` pins its own `zod`** (`paths: zod → ./node_modules/zod`) and so does `mcp`.
  Two zod copies at runtime is a known design point, errors are matched by shape. Hence `zod`
  is in `CONTRACT_PKGS`: *any* difference in its resolved versions is P1.
- **Relative imports across packages are not allowed** (root `AGENTS.md`, "Cross-package
  rules"). A hit is a real finding even when it sits in a test.
- `server/clones/` holds checkouts of other repos, including this one. The script skips it;
  never let a manual search enter it.

## 3. Reading the numbers here

- `client` dominates (`next`, `mermaid`, `lucide-react`): check *where each is imported*
  (client component or server file) before ranking; install size is not page weight.
- `@esbuild/<platform>` appears once per esbuild version that `tsx`, `vite`/`vitest` and
  `drizzle-kit` each pull; the report folds them into `esbuild`.
- `typescript`, `vitest`, `eslint`, `tsx`, `@types/node` appear in every package: drift
  between them is P2, and `lockfile-skew` (same range, different lockfile date) is only Info.
- `testcontainers` is declared next to `@testcontainers/postgresql` in `server/`, which
  already depends on it; before calling it unused, check whether any test imports it directly.

## 4. What to raise with the user

- A PR that adds a dependency: run the checker for that package only (`--packages <name>`) and
  report the *with its deps* size of the new entry next to the package's total.
- A dependency that appears in `server/` and `client/` with different majors: one row, both
  files named, and which package imports it at runtime.
- Never propose a workspace or hoisting as a "fix": the separate installs are a repo decision.

## 5. Open questions

1. **Where should size budgets live?** Per-package budgets (e.g. `client` prod ≤ N MB) would
   turn the report into a CI gate. The skill only reports; a gate needs a decision on numbers.
2. **Bundle size.** Install size is what the script can measure; the Next.js bundle needs the
   app's analyzer. Whether to wire `@next/bundle-analyzer` into the report is open.
3. **Advisories offline.** `--audit` needs the network and sends the dependency tree to the
   registry [S29]; there is no offline source in the repo.
