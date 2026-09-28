---
name: security
description: Security rules for the DevDigest stack (Fastify 5 API on localhost, Drizzle/Postgres, Next.js 15 client, LLM calls over untrusted PR text, git clones of third-party repos, GitHub Actions) — trust boundaries, where attacker-controlled data enters, how to handle it, and how to rate a finding. Use whenever writing or reviewing code that handles request input, outbound HTTP, git/filesystem/child processes, SQL, LLM prompts or LLM output, markdown/HTML rendering, secrets, logs, error responses, CI workflows or dependencies — even if the word "security" is never used. Not for general code quality (correctness reviewer) or architecture (onion-architecture, frontend-architecture).
metadata:
  version: "2.0.0"
---

# Security (DevDigest)

Decisions about **what an attacker can control and where it must be stopped**. Rules come from the
sources in [README.md](README.md); `[S4]` marks source #4 there.

> **Reviewing or writing DevDigest code?** Read [references/devdigest.md](references/devdigest.md)
> first — the existing guards to reuse, and the known gaps that are not new findings.

## The one question

**Can an attacker control this value, and which boundary does it cross next?** Trace it from where
it enters to where it is used before rating anything. `fetch(config.apiBase)` is safe;
`fetch(body.url)` is SSRF unless it goes through the guard.

## Where attacker-controlled data enters DevDigest

| Source | Why it is untrusted | Reaches |
|---|---|---|
| Cloned repos: file contents, paths, symlinks, branch names, `package.json` | Any public repo can be imported; its author is the attacker | fs reads, git/rg args, parsers, LLM prompts |
| PR title, body, comments, diff, linked issues | Written by the PR author | LLM prompts, intent, UI |
| LLM output (findings, summaries, skills, conventions) | Steerable by the text above (prompt injection) [S3] | DB, UI markdown, links, CI comments |
| HTTP requests to the API | No auth; any web page in the user's browser can try to reach `localhost` | every route |
| User-supplied URLs (skill import) | Can point at internal hosts | outbound HTTP |

Trusted: `AppConfig`, committed repo config (`routing.json`, workflows), seeded prompts, `SecretsProvider` values.

## Rules

1. **Outbound HTTP to a user-supplied URL goes through `SafeHttpFetcher`** (`adapters/http/safe-fetch.ts`,
   `container.httpFetcher`, injected as a port like skills' `RemoteFileFetcher`) — never a bare
   `fetch`/SDK `baseURL` built from input. *Why:* it enforces https, blocks private and metadata
   ranges at connect time (defeats DNS rebinding) and re-checks every redirect [S4].
2. **Paths from a clone stay inside the clone after `realpath`.** Reject `..`, absolute paths and
   symlinks that resolve outside (`insideDir` in `adapters/git/simple-git.ts`). *Why:* a tracked
   symlink `x.ts -> ~/.devdigest/secrets.json` turns a file read into key theft [S10].
3. **No shell; end options before input.** Use `spawn`/`execFile` or simple-git argument arrays, never
   `exec`/`shell: true` with input. Put `--` (or `-e` for a pattern) before any value an attacker can
   start with `-`. *Why:* `rg --pre=<cmd>` or `git --upload-pack=<cmd>` executes commands [S8][S9][S11].
4. **SQL only through Drizzle's query builder or the `sql` template.** `sql.raw`, `.unsafe()` or string
   concatenation with input is a finding; identifiers come from an allowlist. *Why:* `sql` binds
   parameters, `sql.raw` inlines them [S6][S7].
5. **Every route resolves the caller with `getContext` and scopes by workspace.** An id-only repository
   call is fine only when the service checks `workspaceId` first. *Why:* A01 Broken Access Control [S1].
6. **Untrusted text enters a prompt only inside `wrapUntrusted(...)`**, and the system prompt keeps
   `INJECTION_GUARD`. Don't add keyword/denylist filtering. *Why:* fencing plus an explicit
   data-not-instructions rule is the documented mitigation; filters are bypassable [S3][S5].
7. **LLM output is data, not instructions or markup.** Validate it with zod, render it through
   `Markdown` (react-markdown, no `rehype-raw`), never `dangerouslySetInnerHTML`; links from it pass
   `defaultUrlTransform`; it never chooses a command, path, URL or SQL. *Why:* LLM05 Improper Output
   Handling, LLM06 Excessive Agency [S3][S20]. (`Markdown` = `client/src/vendor/ui/primitives/Markdown.tsx`.)
8. **Mermaid stays `securityLevel: "strict"`.** *Why:* `loose`/`antiscript` allow HTML and click
   handlers from diagram text [S21].
9. **Secrets come only from `SecretsProvider`** — never `AppConfig`, the DB, a response, a log line or
   `NEXT_PUBLIC_*` (inlined into the browser bundle). Errors from a provider are mapped before they
   reach the client. *Why:* A04, secrets management [S13][S19].
10. **Error responses don't leak internals.** Throw `AppError`; unexpected errors get a generic 5xx
    message outside development. *Why:* A10 Mishandling of Exceptional Conditions [S1][S14].
11. **The API stays on `localhost` with an explicit CORS origin**; don't widen `API_HOST`, CORS
    (`origin: true`, regexp, `*` + credentials), `trustProxy`, or drop helmet/rate-limit on a route
    that mutates state or spends money (LLM calls). *Why:* A02 Security Misconfiguration [S15][S16][S17][S18].
12. **CI stays read-only:** no `pull_request_target` with a PR checkout, no secrets to PR jobs,
    `permissions` minimal; new third-party actions pinned to a commit SHA. *Why:* A03 supply chain [S12].
13. **Dependencies:** lockfiles committed and regenerated by the package manager; a new package's
    install script stays blocked (`allowBuilds: <pkg>: false` in that package's `pnpm-workspace.yaml`)
    unless the package cannot work without it. *Why:* A03 Software Supply Chain Failures [S1].

## Rating a finding

Report only what you traced. Map to the `pr-self-review` severity rubric:

| Confidence | You have | Report as |
|---|---|---|
| **High** | Vulnerable pattern + attacker-controlled input + a reachable path you can state | CRITICAL `security-vuln: <detail>` with the input that triggers it |
| **Medium** | Vulnerable pattern, input source unclear, or a hardening rule above broken without a proven path | WARNING, "verify manually" |
| **Low** | Theoretical, or best practice with no path | Don't report |

**Don't flag:** test files and fixtures; server-controlled values (`AppConfig`, constants, committed
config); framework-mitigated patterns (JSX escaping, Drizzle `sql` binding, react-markdown defaults);
the known gaps listed in `devdigest.md` unless the change widens them; lines the change didn't touch.

## Workflow: reviewing a change (copy and tick off)

```
- [ ] 1. List what the diff touches: route, outbound call, git/fs/process, SQL, prompt, LLM output, rendering, secrets/logs, CI, deps
- [ ] 2. For each, find where its inputs come from (table above) — trusted or attacker-controlled?
- [ ] 3. Check the matching rule(s); reuse the existing guard named in devdigest.md
- [ ] 4. Rate with the table; a CRITICAL states the triggering input
- [ ] 5. Scan added lines for secrets (patterns below)
```

## Secret patterns (added lines)

| Type | Pattern |
|---|---|
| OpenAI / OpenRouter / Anthropic key | `sk-[A-Za-z0-9_-]{20,}` · `sk-or-[A-Za-z0-9_-]{20,}` · `sk-ant-[A-Za-z0-9_-]{20,}` |
| GitHub token | `gh[pousr]_[A-Za-z0-9]{36,}` · `github_pat_[A-Za-z0-9_]{50,}` |
| AWS key | `AKIA[0-9A-Z]{16}` |
| Private key | `-----BEGIN [A-Z ]*PRIVATE KEY-----` |
| Generic assignment | `(secret\|token\|password\|api_?key)\s*[:=]\s*['"][^'"]{8,}` |
| Postgres URL with password | `postgres(ql)?://[^:]+:[^@]+@` (other than the documented local default) |

## Read next

| When you are… | Read |
|---|---|
| Working in DevDigest (guards to reuse, known gaps, file map) | [devdigest.md](references/devdigest.md) |
| Checking why a rule exists or where sources disagree | [README.md](README.md) |

## Out of scope

- Where code lives and which way imports point → `onion-architecture`, `frontend-architecture`.
- Fastify plugin mechanics → `fastify-best-practices`; query design → `drizzle-orm-patterns`.
- Logic bugs with no attacker → the correctness reviewer.
