# Verification report: PR Brief (SPEC-12)

Plan: [08-pr-brief.md](08-pr-brief.md) · Spec: [SPEC-12](../../specs/12-pr-brief.md) · base `e38899f` · 2026-10-05

Condensed from the `implementation-verifier` agent's report (run after the review loop, on a tree that
no longer moved), with the two follow-up checks the main session ran afterwards. Tests were off for
this run: every spec id was verified by reading the code, not by a test that names it.

## Verdict

**INCOMPLETE** as returned by the verifier — no item is "not met" or "partially met".

| | Count |
|---|---|
| Items checked | 177 |
| Met | 174 |
| Partially met | 0 |
| Not met | 0 |
| Cannot verify (needs a running stack) | 2 |
| Coverage gap (`unplanned-change`) | 1 |

Both "cannot verify" items were then checked by hand against this worktree's own stack
(api `:3111`, web `:3110`) — see [Follow-up checks](#follow-up-checks).

## Traceability matrix (grouped)

Every id below has its own row in the verifier's matrix; rows are grouped here by spec section.
`B/` = `server/src/modules/brief/` · `O/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/` ·
`D/` = `client/src/components/diff-viewer/`.

| Ids | What they require | Verdict | Main evidence |
|---|---|---|---|
| AC-1 – AC-4 | Block on Overview, empty state, Intent and Blast side by side, "Risk signals" label | met | `O/OverviewTab.tsx:59-69` · `O/_components/PrBriefBlock/PrBriefBlock.tsx:94-118` · `client/messages/en/{brief,intent}.json` |
| AC-5 – AC-12 | Generate on request only, skeleton, controls disabled in flight, one call for concurrent requests, one stored brief, shown without reload, any PR status | met | `B/service.ts:64-91,160-165` · `B/repository.ts:62-68` · `client/src/lib/hooks/brief.ts:41-43` |
| AC-13 – AC-33 | The request holds facts only: title, description, intent, blast, file rows with hunk headers, one linked issue, project documents; each absent fact lands in `missing` | met | `B/service.ts:198-307` · `B/prompt.ts:13-174` · `server/src/modules/_shared/hunks.ts:15-23` · `server/src/modules/project-context/service.ts:101-125` |
| AC-34 – AC-38 | Count the whole request, remove in a fixed order down to 8,000 tokens, never fail for input size | met | `B/budget.ts:27-95` · `B/constants.ts` |
| AC-39 – AC-43 | One structured call, model from the `risk_brief` setting (default openrouter / `deepseek/deepseek-v4-flash`), answer must match the contract | met | `B/service.ts:102-126` · `B/domain.ts:21-25` · `server/src/vendor/shared/contracts/{brief,platform}.ts` · `settings-models.it.test.ts` (2 passed) |
| AC-44 – AC-52 | Drop file references and focus lines that are not in the PR, caps 5 / 7 / 3, text cuts, stored metadata | met | `B/domain.ts:6-14,71-101` · `B/service.ts:160-172` |
| AC-53 – AC-58 | Read without a model call, `stale` when the head SHA differs, stale note, off-contract stored value reads as no brief | met | `B/service.ts:64-71` · `B/repository.ts:20-23,58` · `PrBriefBlock.tsx:122-123,194` |
| AC-59 – AC-67 | Banner: plain-text summary, refresh control, verdict / findings / score of the latest round, missing-data notice, footer | met | `PrBriefBlock.tsx:126-214` · `client/src/lib/latest-round-findings.ts` |
| AC-68 – AC-76 | Risk areas list, Review focus list, jump to Files changed, "File not in this PR's diff" | met | `O/_components/RiskAreas/RiskAreas.tsx` · `O/_components/ReviewFocus/ReviewFocus.tsx` · `O/OverviewTab.tsx:52-55` · `pulls/[number]/use-diff-jump.ts:14-23` |
| AC-77 – AC-82 | Arrival on Files changed: group and file open, line scrolled and highlighted ~2 s, accent border, Back returns | met | `D/FileCard/FileCard.tsx:56-84,120-124` · `DiffTab/_components/RoleGroup/RoleGroup.tsx:43-47` |
| AC-83 – AC-88 | Failure states: Retry, stored brief kept, missing key names the provider and links to Settings | met | `PrBriefBlock.tsx:32-44,80-92,196-204` · `B/service.ts:139-145,173,189-192` |
| EC-1 – EC-28 | Edge cases: missing or stale intent, degraded blast, invented paths, budget overflow, GitHub down, double click, reload, failures, prompt injection | met | as for the AC they rest on; `B/prompt.ts:152-174` (`wrapUntrusted`) for EC-28 |
| NFR-1 – NFR-13 | One call per generation, budgets, untrusted data fenced, workspace scoping, 10/min, no internals in errors, i18n, one log line, keyboard, contract copies identical, one stored brief | met | `B/routes.ts:19-38` · `B/service.ts:31-54,98-100,176-182` · `./scripts/shared-contracts.sh check` |
| S1 – S12 `.change` | Each plan step's change is in the code | met | per step, see the plan |
| S1 – S7, S9 – S11 `.done` | Step checks | met | `./scripts/check-changed.sh` 11 of 11 |
| S8.done | `curl …/pulls/<id>/brief` answers `{"brief":null,…}` | cannot verify → checked by hand | see below |
| S12.done | Opening `…?tab=diff&file=…&line=…` shows the file open with the accent border | cannot verify → partly checked by hand | see below |
| M1, M2, V1 – V4 | Contracts in sync, no schema change, package checks | met | `check-changed.sh`; no change under `server/src/db/` |
| P1, P2, S*.files, I1 – I3 | Status lines, planned files, planned INSIGHTS entries | met | `check-plan.mjs --implemented` |
| unplanned-change | No changed file outside the plan | gap | see below |

## Coverage gaps

| Kind | What |
|---|---|
| unplanned-change | `pulls/[number]/constants.ts` (moved from `VerdictBanner/constants.ts`), `VerdictBanner.tsx`, `pulls/[number]/helpers.ts` — from the review-loop fix (A1, A2) |
| unplanned-change | `O/_components/RiskAreas/constants.ts`, `D/focus.ts` — added by the implementers |
| unplanned-change | `specs/README.md` — the index line for SPEC-12 |
| untested-requirement | 129 spec ids (88 AC, 28 EC, 13 NFR) verified by inspection only; no test names an id |

## Checks run

| Package | Command | Result |
|---|---|---|
| all | `./scripts/check-changed.sh` | 11 of 11 passed (server typecheck · lint · test:unit · arch; client typecheck · lint · test; mcp typecheck · lint · test; shared-contracts) |
| all | `check-plan.mjs docs/plans/08-pr-brief.md` | 0 errors, no uncovered requirement |
| all | `check-plan.mjs … --implemented --base e38899f` | every P / S.files / I line passes; the only failures are the `unplanned-change` lines above |
| server | `vitest run test/settings-models.it.test.ts` (Postgres) | 2 passed |
| client | `vitest run src/lib 'src/app/repos/[repoId]/pulls'` | 25 files, 113 tests passed |

## Follow-up checks

Run by the main session after the verifier, against this worktree's stack.

| Item | Check | Result |
|---|---|---|
| S8.done | `GET /pulls/<PR #16 id>/brief` | `{"brief":null,"stale":false,"current_head_sha":"09ab00c…"}`, 200; a non-uuid id answers `validation_error`; an unknown id answers 404 `not_found` |
| AC-5, AC-9, AC-52 | `POST /pulls/<PR #15 id>/brief` (one real call) | 200 with a stored brief: `deepseek/deepseek-v4-flash`, 1,322 tokens in, `missing: ["issue","specs"]` |
| S12.done, AC-76, AC-77 | Headless Chrome on PR #11: click the Review focus item `run-duration.ts:1` | URL becomes `…/pulls/11?tab=diff&file=server%2Fsrc%2Fmodules%2F_shared%2Frun-duration.ts&line=1`; the "Core logic" group and the file card are expanded |
| AC-80 | Computed style of the focused file card after the jump | accent border and `0 0 0 1px` accent ring (`rgb(59, 130, 246)`) |
| AC-81 | Computed style of line 1's row, sampled for 3 s after the jump | accent background and inset ring at 0.2 s, 0.7 s and 1.5 s; back to the plain added-line background at 2.3 s |

With these, S8.done and S12.done are both observed on a running stack.
