# agent-runner: `@devdigest/agent-runner`

The CI runner. `ncc` compiles it to `dist/`, the DevDigest server exports `dist/` into a
target repo (the folder `.devdigest` > `runner`), and that repo's own GitHub Actions run
`node .devdigest/runner/index.js` on each same-repository pull request. It runs outside
this repo's server, DI graph and Postgres. Root rules: `../AGENTS.md`. Spec:
`../specs/15-export-to-ci.md`.

## Commands
```sh
(cd ../reviewer-core && npm ci)   # once: the bundle resolves `openai` from reviewer-core/node_modules
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test                         # vitest, passWithNoTests
pnpm build                        # rm -rf dist && ncc build; then commit dist/
```

## Where things live
- `src/index.ts`: CLI entry, wires env, fs and the OpenRouter provider; maps the result to the exit code
- `src/run.ts`: `runCi`, the whole pipeline in one try/catch (any failure: exit 1, nothing posted)
- `src/context.ts`: PR context from env (`PR_NUMBER`, `DEVDIGEST_HEAD_SHA`, `GITHUB_RUN_ID`, `GITHUB_REPOSITORY_ID`, `GITHUB_REPOSITORY`)
- `src/artifact.ts`: builds `devdigest-result.json` (16 fields, counts and ids only)
- `src/manifest.ts`, `src/skills.ts`, `src/diff.ts`, `src/github.ts`: manifest and skill loading, diff cleanup, REST posting
- `dist/`: committed build output (flat: `index.js`, `300.index.js`, `package.json`); CI fails when it drifts

## Gotchas
- The runner reads `OPENROUTER_API_KEY` and `GITHUB_TOKEN` straight from `process.env`. The server's
  `SecretsProvider` rule does not apply here: there is no container in someone else's CI.
- `reviewer-core` and `@devdigest/shared` are raw TypeScript source through `tsconfig.json`
  `paths` (and the same aliases in `vitest.config.ts`). The `zod` alias is needed: a clean
  checkout has no `server/node_modules`, and `ncc build` fails with TS2307 without it.
- `dist/` is byte-reproducible (see `INSIGHTS.md`). Rebuild after any change to `src/`,
  `reviewer-core/` or `server/src/vendor/shared/`, and commit the result.
- The manifest and the result are validated with the shared schemas (`AgentManifest`,
  `CiResultArtifact`), never with local copies.
- The result file holds counts and ids only: no PR title or body, diff, finding text or env value.
- `.devdigest/**` and `.github/workflows/**` are dropped from the reviewed diff.
- Exit 1 when the `ci_fail_on` gate triggers (never for `never`) or the review cannot complete.

## Documentation
- `INSIGHTS.md`: build reproducibility, bundle quirks. Append via the `engineering-insights` skill
