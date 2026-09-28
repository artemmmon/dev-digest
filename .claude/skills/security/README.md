# security

Security rules for the DevDigest stack: a Fastify 5 API bound to localhost with no login, Drizzle on
Postgres, a Next.js 15 client, LLM calls over untrusted PR text and third-party repo contents, git
clones, and GitHub Actions. Covers where attacker-controlled data enters, the guards that already
exist, the known gaps, and how to rate a finding for `pr-self-review`. General code quality and
architecture are out of scope.

- **Version:** 2.0.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-09-28
- **Related skills:** `onion-architecture`, `frontend-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `pr-self-review` (severity rubric)

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | — | Vendored generic skill for React + Express + MongoDB + JWT (`SKILL.md`, `examples.md`, `checklists.md`, `references.md`) |
| 2.0.0 | 2026-09-28 | Rewritten for DevDigest: trust-boundary table, 13 stack-specific rules, rating mapped to `pr-self-review` severities, `references/devdigest.md` (existing guards, known gaps G1–G10, open questions), 3 evals, sources re-verified (OWASP Top 10:2025, LLM Top 10 2025). Removed Express/Mongo/JWT/multer/Vite guidance and the three old reference files |

Bump the version on every change: **patch** for wording/links, **minor** for a new rule,
reference or check, **major** when a rule is reversed. Add a changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one question, where untrusted data enters, the 13 rules, rating, review workflow, secret patterns |
| [references/devdigest.md](references/devdigest.md) | Guards to reuse, known gaps (not new findings), which rule applies to which files, open questions |
| [evals/evals.json](evals/evals.json) | 3 evaluation scenarios with expected behaviour |

## Sources

`[Sn]` in the skill files refers to the numbers below. "Used in" abbreviations:
**SK** SKILL.md · **DD** devdigest · **RM** this README only.

### Q1. Risk categories

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S1 | OWASP Top 10:2025 | OWASP | https://top10.owasp.org/2025/ | A01 Broken Access Control · A02 Security Misconfiguration · A03 Software Supply Chain Failures · A04 Cryptographic Failures · A05 Injection · A06 Insecure Design · A07 Authentication Failures · A08 Software or Data Integrity Failures · A09 Security Logging & Alerting Failures · A10 Mishandling of Exceptional Conditions | 2025 | SK DD |
| S2 | Application Security Verification Standard | OWASP | https://owasp.org/www-project-application-security-verification-standard/ | Verifiable requirements, IDs like `v5.0.0-1.2.5` | 5.0.0 | RM |

### Q2. LLM and prompt injection

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S3 | OWASP Top 10 for LLM Applications 2025 | OWASP GenAI Security Project | https://genai.owasp.org/llm-top-10/ | LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM05 Improper Output Handling, LLM06 Excessive Agency | Mar 2025 | SK DD |
| S5 | The Dual LLM pattern | Simon Willison (community) | https://simonwillison.net/2023/Apr/25/dual-llm-pattern/ | Keep untrusted content away from privileged actions; least privilege for any model that reads it; filters are not a defence | Apr 2023 | SK |

### Q3. Outbound requests

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S4 | SSRF Prevention Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html | Prefer allowlists; block private, loopback and metadata ranges; don't follow redirects blindly; beware DNS rebinding | living doc | SK |

### Q4. Injection, processes and files

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S6 | SQL Injection Prevention Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html | Parameterised queries; allowlist identifiers; escaping discouraged | living doc | SK |
| S7 | Magic `sql` operator | Drizzle ORM | https://orm.drizzle.team/docs/sql | `sql` template binds parameters; `sql.raw` inlines unescaped | living doc | SK |
| S8 | OS Command Injection Defense Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html | Avoid the shell; pass arguments separately; allowlist | living doc | SK |
| S9 | Child process | Node.js | https://nodejs.org/api/child_process.html | `exec` runs a shell; `execFile`/`spawn` don't unless `shell: true` | v23 docs | SK |
| S10 | Path Traversal | OWASP | https://owasp.org/www-community/attacks/Path_Traversal | Normalise, then confine to a base directory | living doc | SK |
| S11 | git(1) | git-scm | https://git-scm.com/docs/git | `--` ends option parsing so a value starting with `-` is not a flag | living doc | SK |

### Q5. Framework configuration

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S14 | Errors | Fastify | https://fastify.dev/docs/latest/Reference/Errors/ | In `setErrorHandler`, pass deliberate 4xx through and mask unexpected 5xx | v5 | SK |
| S15 | @fastify/helmet | Fastify | https://github.com/fastify/fastify-helmet | Security headers with default CSP; nonces available | v12 (Fastify 5) | SK |
| S16 | @fastify/rate-limit | Fastify | https://github.com/fastify/fastify-rate-limit | Global limit plus per-route `config.rateLimit` | v10 (Fastify 5) | SK |
| S17 | @fastify/cors | Fastify | https://github.com/fastify/fastify-cors | Explicit origins; regexp/function origins are risky; no `*` with credentials | v11 (Fastify 5) | SK |
| S18 | Server → trustProxy | Fastify | https://fastify.dev/docs/latest/Reference/Server/#trustproxy | Off by default; `X-Forwarded-*` is untrusted unless the proxy is known | v5 | SK |
| S19 | Environment variables | Next.js | https://nextjs.org/docs/app/guides/environment-variables | Only `NEXT_PUBLIC_*` is inlined into the browser bundle | Aug 2026 | SK |
| S20 | react-markdown → Security | remarkjs | https://github.com/remarkjs/react-markdown#security | Safe by default; `rehype-raw` only for trusted input; `defaultUrlTransform` blocks `javascript:` | v9 | SK DD |
| S21 | Config → securityLevel | Mermaid | https://mermaid.js.org/config/schema-docs/config.html#securitylevel | `strict` (default) encodes HTML and disables clicks; `loose` allows both | 11.x | SK |

### Q6. Secrets and CI

| # | Title | Author | URL | Key recommendation | Date / version | Used in |
|---|---|---|---|---|---|---|
| S12 | Security hardening for GitHub Actions | GitHub | https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions | No `pull_request_target` with untrusted checkout; pin actions to a full SHA; least-privilege `GITHUB_TOKEN` | living doc | SK DD |
| S13 | Secrets Management Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html | No hardcoded secrets; least privilege; never in logs | living doc | SK |

## Conflicts and outdated guidance

| Topic | Positions | Skill's rule |
|---|---|---|
| SSRF defence | Allowlist first (S4) vs DevDigest's denylist of private ranges in `ip-guard` | Keep the existing guard for user URLs (any public https host is the feature); allowlist only when a feature has a fixed host set |
| CSP vs sanitisation | Helmet's CSP (S15) vs render-time safety (S20, S21) | Complementary: CSP is defence in depth, never a reason to allow raw HTML |
| Access control on a local tool | Missing authn/authz is A01 (S1) vs a single-user localhost app by design | Recorded as known gap G1 and open question 1 in devdigest.md, not re-reported per PR |
| Old skill (v1) | OWASP Top 10:2021-era Express/Mongo/JWT checklist | Replaced; Top 10:2025 names used verbatim |

## Notes on verification

- All URLs were fetched on 2026-09-28 except as noted.
- S10 redirects to `community.owasp.org`; the redirect target was not re-fetched.
- S11: the `--end-of-options` anchor did not resolve; the general git(1) page was used.
- Exact publication dates of S1 and S2 came from search results, not the fetched pages.
- pnpm's build-script settings (`allowBuilds`, `onlyBuiltDependencies`) were not confirmed from a
  primary source; rule 13 relies on the repo's own `pnpm-workspace.yaml` instead.
- An official vendor guide on indirect prompt injection (Microsoft) returned 404; S5 is a community source.

## Evaluation log

| Date | Eval | Result | Changes |
|---|---|---|---|
| 2026-09-28 | ssrf-bypass | Pass (sonnet, fresh instance): CRITICAL SSRF with metadata/localhost inputs, reuse `SafeHttpFetcher` via a port, no Express/JWT advice | Minor: also raised "fetched spec may reach a prompt unfenced" as WARNING although the specs slot is already fenced — no change, `devdigest.md` lists specs as fenced |
| 2026-09-28 | llm-output-html | Pass: CRITICAL stored XSS with an `<img onerror>` payload, keep the vendored `Markdown` (remark-gfm already renders tables), cites rule 7 | — |
| 2026-09-28 | clean-change | Pass: no findings; did not re-report known gaps; noted zod params only as below the evidence bar | — |
