# Demo dev-digest-L03 — shooting script (HW3 Smart Diff)

~2.3 min (narration 1,575 chars ≈ 1.9 min + gaps and the cut wait). Filmed by `demo-film` from `cues.json`; this file is
the human view. Narration is Ukrainian, everything else English.

## Assumptions
- Audience: the course reviewer. Knows DevDigest, so no product intro.
- Source of truth: `hw/L03/hw3-task.md` → P1 criteria and the "Як перевірити" video script (1–3 min).
- **Run Review is clicked on camera** (deviation from `devdigest-demo` "never click"): the criteria ask
  to run the review and show the counters afterwards. It is clicked only on the fixture PR #11, with
  "all agents". `config.neverClick` keeps `Delete run`; the pre-roll deletes old runs through the API.
- The review round takes 1–2 minutes. Scene 3 ends after the click and a few seconds of the running
  state; the wait is cut between scenes 3 and 4, and the narration says so.
- Which lines get findings is decided by the model on the day. The narration names no finding count,
  no line number and no finding title; scene 5 expands the first file card that has a dot.

## Preconditions
- hw3 worktree stack up: web `:3030`, api `:3031` (`config.healthUrls`).
- Repo `artemmmon/dev-digest`, id `0ec42231-7c58-4ab1-845d-0d8e355af9a3`; fixture PR #11
  (`959c2ba2-7d4d-41a7-9bec-9298c8cfa603`), branch `hw3-smart-diff-demo`, 6 files, `+56 −0`.
- **OpenRouter has credits.** On 2026-09-26 every agent failed with `402 … requires more credits`.
- Pre-roll (every take): delete all runs of PR #11 —
  `curl -s localhost:3031/pulls/959c2ba2-7d4d-41a7-9bec-9298c8cfa603/runs` → `DELETE /runs/:id` each —
  so the tab starts in the "Run a review to see findings inline" state. Open
  `/repos/<repoId>/pulls/11?tab=diff` by URL, never through the repo switcher.

---

## 1. Five groups — 30 s
**Show:** PR #11 → Files changed, Smart order. Toolbar "6 files · +56 −0"; the empty-state line
"Run a review to see findings inline in Files changed."; group headers Core logic (1), Tests (1),
Wiring (2), Docs (1), Boilerplate (1); Docs and Boilerplate collapsed.
**Do:** slow scroll down past the open groups to the two collapsed headers.
**Say (s1-01):** «Третя домашка — Smart Diff. Це тестовий пул-реквест: шість файлів, і на вкладці Files changed вони вже не в порядку GitHub, а згруповані за роллю.»
**Say (s1-02):** «Спочатку core — бізнес-логіка, далі тести, wiring — конфігурація і barrel-файли, потім документація і в кінці boilerplate. У кожної групи є підпис ролі й кількість файлів.»
**Say (s1-03):** «Документація і boilerplate при відкритті згорнуті: їх рев’юер зазвичай лише переглядає.»

## 2. Lock file in boilerplate — 15 s
**Show:** Boilerplate group.
**Do:** click the Boilerplate header; the card `server/pnpm-lock.yaml` appears.
**Say (s2-01):** «Розгортаю boilerplate — тут pnpm-lock.yaml. Lock-файл змінився, бо в пул-реквесті додано нову залежність, але читати його рядок за рядком не потрібно.»

## 3. Run review — 15 s (+ cut)
**Show:** PR header, Run Review dropdown.
**Do:** open the Run Review dropdown → click "Run all enabled agents"; hold on the running state ~3 s.
**Say (s3-01):** «Тепер запускаю рев’ю всіма агентами. Поки воно триває, групи вже на місці — групування не чекає на модель.»
**Say (s3-02):** «Рев’ю займає хвилину-дві, тож цей відрізок я пропускаю.»

## 4. Counters and dots — 25 s
**Show:** Files changed after the round settled — no reload. Group headers now carry a red `● N`
next to "N files"; file cards with findings have a red dot next to the path.
**Do:** hover the Core logic `● N` counter, then a file card's dot.
**Say (s4-01):** «Рев’ю завершилось, і вкладка оновилась сама, без перезавантаження сторінки. На заголовку групи з’явився червоний лічильник.»
**Say (s4-02):** «Він рахує файли зі знахідками, а не самі знахідки. А на картці кожного такого файлу — крапка поруч зі шляхом.»

## 5. Finding under the line — 30 s
**Show:** the first file card with a dot (expected: `server/src/modules/_shared/run-duration.ts`), expanded.
**Do:** scroll to the line with the coloured stripe and severity label; hold on the finding card.
**Say (s5-01):** «Розгортаю файл зі знахідкою. Рядок, до якого вона прив’язана, позначено кольоровою смужкою зліва й підписом severity справа.»
**Say (s5-02):** «Одразу під рядком — сама знахідка, та сама картка, що й на вкладці Agent runs: severity, заголовок, пояснення, запропоноване виправлення і кнопки Accept та Reject.»
**Say (s5-03):** «Код і пояснення тепер в одному місці — не треба стрибати між вкладками.»

## 6. Original order — 15 s
**Do:** click "Original order" (flat list in GitHub's order), then "Smart order" again.
**Say (s6-01):** «Перемикач Original order повертає звичний порядок, у якому файли віддає GitHub. І назад — Smart order.»

## 7. Why no model — 15 s
**Show:** Smart order, groups visible.
**Say (s7-01):** «Групування не викликає модель: сервер розкладає файли за фіксованими glob-правилами з одного файла констант, тож воно безкоштовне, миттєве й працює ще до першого рев’ю.»

---

## Coverage
| Criterion (hw3-task.md) | Scene | Cue |
|---|---|---|
| P1.1 five groups core → tests → wiring → docs → boilerplate, label + file count | 1 | s1-01, s1-02 |
| P1.2 lock file in boilerplate; docs and boilerplate collapsed on open | 1, 2 | s1-03, s2-01 |
| P1.3 after Run review, group header counts files with findings | 3, 4 | s3-01, s4-01, s4-02 |
| P1.4 dot on the file card | 4 | s4-02 |
| P1.5 finding under the line: severity, title, rationale | 5 | s5-01, s5-02 |
| P1.6 Original order returns GitHub order | 6 | s6-01 |
| Video: one sentence on why grouping calls no model | 7 | s7-01 |
| P2.3 grouping works before the first review | 1, 3 | s1-01, s3-01 |
| P2.4 stripe + severity label on the line | 5 | s5-01 |
| P2.5 Accept / Reject buttons | 5 | s5-02 (shown, not clicked) |
| P3.3 empty state instead of zero counters | 1 | on screen only |
| P3.4 counters update without reload | 4 | s4-01 |

Not covered on camera: P2.6 (out-of-patch block — only if the model cites a line outside the patch),
P2.7 (hiding findings with the comments toggle), P3.1 sticky header, P3.2 collapsing a finding. Add a
10-second scene after 5 if the reviewer should see them.

## Unverified claims
- s4-01 "оновилась сама, без перезавантаження" — implemented (`usePrRunTracking` settle refresh, unit-tested)
  but not yet watched live in a browser; check it on the first take.
- s5 — the first file with a dot and its line depend on the model's findings on the day. Rehearsal on
  2026-09-26 (5 agents, deepseek-v4-flash, ~$0.003, ~60 s): Core logic `● 1` and Tests `● 1`; in
  `run-duration.ts` a CRITICAL "Unit mismatch: seconds passed as milliseconds to pretty-ms" under line 6
  (`blocker`) and a WARNING on line 7; two CRITICAL "missing test" findings in the test file. The rehearsal
  runs were deleted afterwards.
- s7-01 "безкоштовне, миттєве" — true by construction (no LLM, GitHub or git call in `smart-diff`), but no
  frame proves it.
