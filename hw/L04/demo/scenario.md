# Demo dev-digest-L04 — shooting script (HW4 Blast Radius)

~2.5 min (narration 1,596 chars ≈ 1.9 min + gaps, the GitHub tab and the Claude Code answer). Filmed by `demo-film`
from `cues.json`; this file is the human view. Narration is Ukrainian, everything else English.

## Assumptions
- Audience: the course reviewer. Knows DevDigest, so no product intro.
- Source of truth: `hw/L04/hw4-task.md` → P1 criteria and the "Як перевірити" video script (1–3 min).
- Own stack, ports 3100 (web) and 3101 (api), from the `hm04` worktree; the dev stack on 3000/3001 belongs to other checkouts.
- Repo `artemmmon/dev-digest`, id `0ec42231-7c58-4ab1-845d-0d8e355af9a3`. Fixture PR #15
  (`8f6ba605-f003-47f3-b858-957b67e5acdb`, draft, "do not merge"), head `14eff01`. Second repo only in scene 6:
  `artemmmon/cs2-lineups` (id `12e3f5b1-6c8d-45a9-9fca-1801eb6c2b32`), PR #5 — deviation from "film one
  repository only"; it is needed because that repo has a real `partial` index. `acme/payments-api` stays off camera.
- Scene 7 runs the user's real Claude Code once (`claude -p`, MCP config `.mcp.json` with `DEVDIGEST_API_URL=http://localhost:3101`);
  it is a small paid call and only for filming. The wording of the model's answer is not deterministic, so the
  narration quotes only the tool's numbers.
- Never clicked: Run Review, Accept, Reject, Delete run, Resync index (`config.neverClick`). Resync is only hovered.
- The two GitHub tabs open from a click (scene 3) load from the network; if GitHub is slow, retry the take.

## Preconditions
- Web `:3100` and api `:3101` up (`config.healthUrls`). `curl localhost:3101/repos/0ec42231-7c58-4ab1-845d-0d8e355af9a3/index-state`
  → `status: full`, `lastIndexedSha: 9a0452c…` (refreshed on 2026-09-30 with `POST /repos/:id/refresh`; before
  that it was at `c6af1e4` and the caller lines did not match the PR head).
- PR #15 and PR #3 were opened once in DevDigest, so `pr_files` is filled (the block waits for `pr_files`).
- `claude` is on PATH in Terminal; Node 22 first on PATH (`config.terminal.init` does it).

---

## 1. The block and its summary — 20 s
**Show:** PR #15 → Overview (`/repos/<repoId>/pulls/15`). The Blast radius card beside Intent; stats row
"2 symbols · 12 callers · 19 endpoints · 0 cron/jobs".
**Do:** none, hold on the card.
**Say (s1-01):** «Четверта домашка — Blast radius. Тестовий пул-реквест змінює лише коментар у getContext — спільному хелпері, який використовують роути.»
**Say (s1-02):** «На вкладці Overview з’явився блок Blast radius. Зверху підсумок: два змінені символи, дванадцять викликачів, дев’ятнадцять ендпоінтів і нуль кронів.»

## 2. Callers and endpoints — 20 s
**Show:** the open `getContext` row: twelve callers as name + `file:line` (repoIntelRoutes, agentsRoutes, conventionsRoutes, …),
then the endpoint chips (GET/POST/DELETE …).
**Do:** slow scroll over the callers, then over the chips.
**Say (s2-01):** «Під символом getContext — його викликачі у форматі файл і рядок: роути repo-intel, agents, pulls, reviews та інші.»
**Say (s2-02):** «Нижче — HTTP-ендпоінти, які залежать від цих файлів. Крони показуються окремо, у цьому пул-реквесті їх немає.»

## 3. A click opens the line on GitHub — 25 s
**Show:** the `pullsRoutes` link `server/src/modules/pulls/routes.ts:45`.
**Do:** click it; GitHub opens in a new tab at `…/blob/14eff01…/server/src/modules/pulls/routes.ts#L45` with line 45
highlighted (`const { workspaceId } = await getContext(container, req);`). Hold ~4 s, close the tab.
**Say (s3-01):** «Клікаю на pullsRoutes: відкривається саме цей рядок у GitHub, і там справді викликається getContext.»
**Say (s3-02):** «Ці файли не входять у diff, тому лінк веде у код на головному коміті пул-реквесту.»

## 4. Graph view — 12 s
**Show:** Tree / Graph switcher.
**Do:** click "graph" (SVG: symbol → callers → endpoints), hold ~3 s, click "tree".
**Say (s4-01):** «Другий вигляд — граф: обраний символ, його викликачі й ендпоінти. Повертаюсь до дерева.»

## 5. No callers — 15 s
**Show:** PR #3 ("docs: move demo engine to the screencast-demo-maker plugin", `/pulls/3`) → Overview.
Card text: "1 changed symbol, no downstream callers found." with the stats "1 symbols · 0 callers · 0 endpoints · 0 cron/jobs".
**Do:** none, hold.
**Say (s5-01):** «Коли викликачів немає, замість порожнього блоку — текст. Ось пул-реквест із документацією: змінено один символ, і залежних викликачів не знайдено.»

## 6. Incomplete index — 22 s
**Show:** `artemmmon/cs2-lineups` PR #5 (`/repos/12e3f5b1-…/pulls/5`) → Overview. The warn notice
"Blast radius may be incomplete — The index is partial: some files were skipped, so callers may be missing." and the button "Resync index".
**Do:** hover "Resync index"; do not click.
**Say (s6-01):** «Якщо індекс неповний, блок показує окрему позначку з причиною: індекс partial, частину файлів пропущено, викликачів може бракувати. Це інший репозиторій, у ньому індекс справді partial.»
**Say (s6-02):** «Поруч кнопка Resync, вона перебудовує індекс. Я її не натискаю.»

## 7. The same map in Claude Code — 35 s
**Show:** Terminal.
**Do:** type and run
`claude -p "Show the blast radius of PR 15 in artemmmon/dev-digest: use the devdigest get_blast_radius tool and summarize the counts." --mcp-config .mcp.json --strict-mcp-config --allowedTools mcp__devdigest__get_blast_radius --max-turns 4`;
wait for the answer (~10 s). The counts in the answer: 2 changed symbols, 12 callers, 19 endpoints, 0 crons.
**Say (s7-01):** «Тепер Claude Code. Прошу показати карту впливу для пул-реквесту п’ятнадцять.»
**Say (s7-02):** «Інструмент get_blast_radius із MCP-сервера викликає той самий роут, і у відповіді ті самі числа: два символи, дванадцять викликачів, дев’ятнадцять ендпоінтів.»
**Say (s7-03):** «Модель тут лише переказує результат. Сама фіча її не викликає.»

## 8. No model, no re-parse — 10 s
**Show:** back on PR #15 Overview, the Blast radius card.
**Do:** none.
**Say (s8-01):** «Чому карта не викликає модель і не парсить репозиторій заново: вона лише читає індекс, який repo-intel збудував під час клонування.»

---

## Coverage

| Criterion (`hw4-task.md`) | Scene | Cue |
|---|---|---|
| P1-1 block on Overview | 1 | s1-01, s1-02 |
| P1-2 summary row | 1 | s1-02 |
| P1-3 callers `file:line` and endpoints under the symbol | 2 | s2-01, s2-02 |
| P1-4 shared helper: ≥2 callers, ≥1 endpoint | 1–2 (12 callers, 19 endpoints) | s1-02 |
| P1-5 click opens the line on GitHub | 3 | s3-01, s3-02 |
| P1-6 no callers text / incomplete index marker | 5 / 6 | s5-01 / s6-01 |
| P1-7 MCP tool returns the same map | 7 | s7-01…s7-03 |
| P1-8 open PR with description and video | outside the video (PR #16) | — |
| P2 no LLM, no re-parse | 8 | s8-01 |
| P3 Tree/Graph, crons apart, Resync button | 4, 2, 6 | s4-01, s2-02, s6-02 |
| Video script: open callers in code | 3 (GitHub blob shows the call) | s3-01 |

## Reality check (2026-09-30, rendered text read with Playwright at :3100; API cross-checked)
- PR #15 Overview: "2 symbols · 12 callers · 19 endpoints · 0 cron/jobs", `getContext` open with 12 callers, "Endpoints affected" group; first three links point to `…/blob/14eff01…/…#L37`, `#L214`, `#L64`.
- Every caller line was checked in `git show 14eff01:<file>`: each is a real `getContext(` call (repo-intel/routes.ts:37, pulls/routes.ts:45, …).
- PR #3: "1 changed symbol, no downstream callers found."; PR #5 of cs2-lineups: notice text above, `index.reason: index_partial`.
- The UI label reads "1 symbols" (no plural) on PR #3; narration does not read the label.
- `claude -p` with the MCP config returned the table 2 / 8 / 27 / 0 before the re-index; after it the same route returns 2 / 12 / 19 / 0.
- Before the re-index (index at `c6af1e4`, twelve commits behind) the caller lines did not match the PR head; that is why `POST /repos/:id/refresh` ran.

## Unverified claims
- The model's wording in scene 7: only the numbers are deterministic. If the answer misses a number, retake the scene.
- "The index that repo-intel built while cloning" (s8-01) is true of the code, but nothing in the frames proves it.
- "Caller files are not in the diff" (s3-02): true for PR #15 (one changed file), not shown on screen.
- Timings of the GitHub tab and the Claude Code answer.
