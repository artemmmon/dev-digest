# DevDigest — how the security rules apply here

Paths are repo-relative; `server/…` files are under `server/src/` unless shown otherwise. State as of
2026-09-28. Reuse the guards in §1 instead of writing new ones. §2 lists gaps that already exist: a
change that merely sits near one is **not** a new finding; a change that widens one, copies its
pattern into new code, or adds a new caller of the unsafe path **is**.

## Contents
1. Guards that already exist
2. Known gaps
3. Where each rule bites
4. Open questions

## 1. Guards that already exist

| Area | Guard | Where |
|---|---|---|
| Outbound HTTP (SSRF) | `SafeHttpFetcher` (`container.httpFetcher`): https + port 443 only, no IP literals or credentials, IP checked at connect time (DNS rebinding), ≤ 3 redirects each re-validated, byte cap, timeout; `ip-guard` blocks loopback, RFC1918, link-local/metadata, CGNAT, NAT64/6to4/Teredo, ULA, multicast, fails closed | `adapters/http/safe-fetch.ts`, `ip-guard.ts`; only consumer today: skill import (`modules/skills/service.ts` via the `RemoteFileFetcher` port) |
| Fixed-host clients | Octokit default base URL; LLM SDKs without user `baseURL`; clone URL rebuilt from `owner/name` | `adapters/github/octokit.ts`, `modules/repos/helpers.ts` |
| Repo URL | anchored github.com regex + `..` check | `modules/repos/constants.ts`, `modules/repos/helpers.ts` |
| Clone paths | `insideDir()`; `readFile` re-checks after `realpath`; `listFiles` skips symlinks | `adapters/git/simple-git.ts` |
| Git token | per-command `-c http.extraheader`, never on disk; `redactToken` scrubs errors | `adapters/git/simple-git.ts` |
| SQL | query builder + parameterised `sql` template; no `sql.raw` anywhere | repositories |
| Tenancy | `getContext()` in every route; services check `workspaceId` before id-only repository calls | `modules/_shared/context.ts`, e.g. `modules/reviews/findings.ts` |
| Prompt injection | `INJECTION_GUARD` appended to every reviewer system prompt; `wrapUntrusted` fences and escapes `</untrusted>` | `reviewer-core/src/prompt.ts`; intent sources in `modules/intent/prompt.ts` |
| LLM output → UI | `Markdown` (react-markdown 9 + remark-gfm, no `rehype-raw`, default `urlTransform`) | `client/src/vendor/ui/primitives/Markdown.tsx` |
| Mermaid | `securityLevel: "strict"` | `client/src/components/mermaid-diagram/MermaidDiagram.tsx` |
| Secrets | `SecretsProvider` (`~/.devdigest/secrets.json`, env fallback); `secretsStatus` returns booleans only; keys never in `AppConfig` | `adapters/secrets/local.ts`, `modules/settings/service.ts`, `platform/config.ts` |
| Network | `API_HOST` default `localhost`; CORS `origin: [webOrigin]`; helmet defaults; rate limit 120/min global, 10/min on review and intent, 20/min on test-connection; 1 MB body limit | `server.ts`, `platform/config.ts`, `app.ts`, module `routes.ts` |
| Errors | `AppError` envelope; unmapped 5xx message only when `NODE_ENV=development`; no stack traces | `app.ts` error handler |
| CI | every workflow `permissions: contents: read`; no `pull_request_target`; no `secrets.*` | `.github/workflows/*` |
| Install scripts | `allowBuilds: false` for esbuild, ssh2, cpu-features, protobufjs (server) and esbuild, sharp (client) | `server/pnpm-workspace.yaml`, `client/pnpm-workspace.yaml` |

## 2. Known gaps

Tracked for separate fixes; report only if the change widens them or copies the pattern.

| # | Gap | Where | Rule |
|---|---|---|---|
| G1 | No auth, no Host-header allowlist, no CSRF token: a web page can try DNS rebinding or cross-site "simple" POSTs to the localhost API; `POST /settings/test-connection` skips `getContext` and can overwrite stored keys | `app.ts`, `modules/settings/routes.ts`, `modules/settings/service.ts` | 5, 11 |
| G2 | `FsRepoFiles.read()` joins paths without `realpath`; the incremental indexer feeds it `git diff` paths, which can be tracked symlinks | `adapters/repo-files/fs.ts`, `modules/repo-intel/pipeline/incremental.ts`, `modules/repo-intel/service.ts` (`readClone`) | 2 |
| G3 | `ripgrep` gets the pattern without `-e`/`--` (flag injection, `--pre`); the Node fallback builds `new RegExp(pattern)` (ReDoS). No production caller yet — a new caller with untrusted input is CRITICAL | `adapters/codeindex/ripgrep.ts` | 3 |
| G4 | Unfenced prompt text: bound skills and memory (URL-imported skills become instructions); intent header table `s.ref`; conventions layout tree, manifest summaries and the unescaped `path` attribute | `reviewer-core/src/prompt.ts`, `modules/intent/prompt.ts`, `modules/conventions/prompt.ts` | 6 |
| G5 | No pino `redact` config, and `RunLogger` mirrors every run event's `data` (LLM output, errors) to stdout | `app.ts`, `platform/run-logger.ts` | 9 |
| G6 | `testConnection` returns the provider SDK's raw `err.message` | `modules/settings/service.ts` | 9 |
| G7 | `NODE_ENV` defaults to `development`, so unmapped 5xx messages reach the client by default | `platform/config.ts` | 10 |
| G8 | Workflow actions pinned by tag (`@v4`), not SHA | `.github/workflows/*` | 12 |
| G9 | `secrets.json` gets `0o600` only on creation; `~/.devdigest` is created with default mode | `adapters/secrets/local.ts` | 9 |
| G10 | `branch` passed to `git fetch`/`reset` without `--` (value comes from GitHub's `default_branch`, low risk) | `adapters/git/simple-git.ts` | 3 |

## 3. Where each rule bites

| Diff touches | Check |
|---|---|
| `modules/*/routes.ts` | `getContext`, workspace check in the service, zod schema, rate limit if it spends LLM money or mutates |
| `src/adapters/**` | rules 1–3 and 9: host fixed or `safeFetch`, argument arrays with `--`, errors mapped and scrubbed |
| `modules/*/prompt.ts`, `reviewer-core/src/prompt.ts`, `server/src/prompts/*.md` | rule 6: every repo-, PR- or URL-derived string inside `wrapUntrusted` |
| code consuming `completeStructured` results | rule 7: zod-validated, never used as a path, URL, command or SQL |
| `client/**` rendering server data | rule 7–9: `Markdown`, no `dangerouslySetInnerHTML`, `rel="noopener noreferrer"` on external links, no secret in `NEXT_PUBLIC_*` |
| `app.ts`, `platform/config.ts`, `server.ts` | rules 10–11 |
| `.github/workflows/**`, `package.json`, lockfiles, `pnpm-workspace.yaml` | rules 12–13 |

## 4. Open questions

1. **Localhost API without auth (G1).** Sources treat missing access control as A01 [S1]; DevDigest is a
   single-user local tool by design. A Host-header allowlist (`localhost`, `127.0.0.1`) plus requiring
   `Content-Type: application/json` on every mutating route would close DNS rebinding and simple-request
   CSRF without adding login. Not decided.
2. **Skills as trusted prompt text (G4).** Skills are meant to steer the reviewer, so fencing them as
   data would defeat them; but URL-imported skills come from outside. Options: fence only imported
   skills, or show a trust warning on import. Not decided.
3. **Second prompt-injection source.** Only OWASP [S3] is official; [S5] is community. An official
   vendor guide (Anthropic/OpenAI) was not fetched successfully.
