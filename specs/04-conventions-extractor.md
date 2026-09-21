# Conventions Extractor — turn a repo's habits into a skill
Status: done
Lesson: L02 (homework 2)

## Goal
Find the coding conventions a repository already follows, let the user triage them, and
turn the accepted ones into a skill an agent can review against. Every rule must be
backed by real code the user can open on GitHub — a rule the code gate cannot prove is
dropped, not shown.

## Scope
**In**
- Server module `conventions`: scan, list, accept / reject / edit, draft a skill, create a skill.
- Sampling in code only (no model): config files + top files (repo-intel rank, topped up by a
  `git ls-files` fallback so non-JS repos work) + two test files.
- One structured LLM call on the model picked in Settings → Models → Conventions
  (default `openrouter/deepseek/deepseek-v4-flash`).
- Evidence gate in code: the cited file must have been sampled and read, the snippet must
  really occur in it (whitespace-tolerant), the line number is corrected to the real one,
  and the stored snippet is sliced from the file — never the model's text.
- Client page `/repos/:repoId/conventions` (SKILLS LAB): Run Scan / ReScan, candidate cards
  (rule, evidence link to the exact GitHub lines, confidence), Accept / Reject / Edit inline,
  Create skill modal (name, description, editable body, agent to link).
- Skills side: `evidence_files` on a skill, `source: extracted`, `appendSkill` on agents.
- Bonus: import a skill from a URL (`POST /skills/import/url`).

**Out**
- Scheduled / incremental scans, a scans history table, cross-repo conventions.

## Design
Packages: server, client (contracts in `server/src/vendor/shared/contracts/knowledge.ts`).

```
POST /repos/:id/conventions/extract   sample → LLM → verify → dedup → replace pending rows
GET  /repos/:id/conventions           non-rejected candidates + last_scan
PATCH /repos/:id/conventions/:cid     { status } accept/reject/undo, or { rule } edit
POST /repos/:id/conventions/skill-draft   { convention_ids } → proposed skill (saves nothing)
POST /repos/:id/conventions/skills        { convention_ids, name, description, body, agent_id? } → 201
```
- `conventions.status` = `pending | accepted | rejected`. A rescan replaces **only** pending
  rows; accepted and rejected rules are kept, and a rule that matches one of them is never
  suggested again.
- The skill is created on the server from the accepted rows, so `source` and `evidence_files`
  cannot be forged by the client. Rejected candidates can never reach a skill.
- Scans are synchronous (10–120 s); a second scan of the same repo returns 409
  `scan_in_progress`.

## Acceptance
- A scan on a repo returns candidates with file, line, GitHub link and confidence; they
  survive a page reload.
- Reject removes a candidate for good (also after reload and after a rescan).
- ≥1 accepted → Create skill → a skill on the Skills page, linked to the chosen agent, and
  visible as its own block (with token count) in the run trace.
- A candidate whose evidence is missing or invented is dropped and counted in the scan report.
