---
name: engineering-insights
description: Appends non-obvious engineering findings to the INSIGHTS.md of the module being worked on. Use proactively in any session, without being asked, the moment you hit a dead end, a library or tool quirk, an error and its fix, an unwritten codebase convention, a decision with a tradeoff or an unresolved question, and before finishing a session where any of these happened.
---

# Engineering insights

1. **Filter.** Skip routine edits, trivial fixes and anything obvious to someone
   reading the code or already in a `CLAUDE.md`, `docs/` or the target `INSIGHTS.md`.
   For a tradeoff decision, record why the rejected option lost.
2. **File.** The `INSIGHTS.md` of the module the finding is about; most specific wins:
   `server/src/modules/repo-intel/` · `server/` · `client/` · `reviewer-core/` · `e2e/` ·
   repo root (spans modules). Missing → create it with the headings below.
3. **Section.** Exactly one, as `##` headings in this order: What Works ·
   What Doesn't Work · Codebase Patterns · Tool & Library Notes ·
   Recurring Errors & Fixes · Open Questions · Session Notes
   (one dated summary, only for sessions that added other entries).
4. **Append-only.** Add at the end of the section. Never edit, reorder or delete
   entries. Proven wrong → a new entry titled `Supersedes "<old title>"`. This governs
   the *claim*, not its pointers: a `Where:` whose file moved or whose line drifted is
   stale metadata — repair it in place.
5. **Entry.** `### YYYY-MM-DD — short title`, then 1–4 lines: context → problem →
   what to do, closing with `Where: <path>:<line>`. Every entry has one, Session Notes
   included, and at least one anchor carries a line number — open the file and read it
   off, never guess. A bare path is for a finding about the file or directory as a
   whole. Paths are relative to the `INSIGHTS.md`'s own package (repo-root-relative in
   the root file). It must be actionable cold: name the file, function or command and
   the concrete action. Mark unchecked claims **(unverified)**.
6. **Report.** Tell the user in one line: file + section. If it will bite every task
   in that module, suggest promoting a one-liner to its `CLAUDE.md` Gotchas; don't edit it.

## Bad vs good

❌ Be careful with zod errors.
✅ `instanceof ZodError` misses errors thrown in reviewer-core: the server runs two
zod copies. Match by shape (`issues` array). Where: `server/src/app.ts`.

❌ Background jobs can be flaky.
✅ `JobRunner.enqueue()` returns a `done` promise nobody catches; on Node 22 a failed
job may exit the process **(unverified)**. Where: `server/src/platform/jobs.ts`.
