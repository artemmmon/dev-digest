# Demo dev-digest-L05 — shooting script (HW5 PR Brief)

~2 min (filmed: 2 min 02 s; narration 1,584 chars, 14 cues). Filmed by `demo-film`
from `cues.json`; this file is the human view. Narration is Ukrainian, everything else English.

## Assumptions
- Audience: the course reviewer. Knows DevDigest, so no product intro.
- Source of truth: `hw/L05/hw5-task.md` (the course's six-step video script); the feature is `specs/12-pr-brief.md`.
- Own stack, ports 3110 (web) and 3111 (api), from this worktree; the dev stack on 3000/3001 belongs to another checkout.
- Repo `artemmmon/dev-digest`, id `0ec42231-7c58-4ab1-845d-0d8e355af9a3`. Test PR #11
  (`959c2ba2-7d4d-41a7-9bec-9298c8cfa603`, the HW3 fixture, closed, head `697ec0d`). `acme/payments-api` stays off camera.
- PR #15 was tried first (it has both Intent and a full Blast radius): its comment-only change gave a brief with
  no risks and no Review focus, so step 3 of the task could not be shown on it.
- Scene 1 clicks **Generate brief** for real (the user's decision): one paid `deepseek/deepseek-v4-flash` call per
  take, about $0.0002. Its pre-roll deletes PR #11's row in `pr_brief` so the empty state is back.
- The model's answer is not fully deterministic, so the narration quotes no counts and no wording from the brief.
  `scenes.mjs` stops a take if the new brief has no risk or no Review focus item.
- Never clicked: Run Review, Accept, Reject, Delete run, Resync index, Re-derive intent (`config.neverClick`).
- Scene 5 opens GitHub and needs the HW5 pull request: fill `config.web.prUrl` and `config.web.prBranch` first.

## Preconditions
- Web `:3110` and api `:3111` up (`config.healthUrls`), Postgres container `devdigest-postgres` running.
- PR #11 and PR #12 were opened once in DevDigest (`pr_files` is filled).
- Film scene 1 first: scenes 2, 3, 4 and 6 show the brief it generates.
- Scene 5: the HW5 branch is pushed and its PR is open; `docs/plans/08-pr-brief.verification.md` is in it.

---

## 1. Empty state and Generate brief — 40 s
**Show:** PR #11 → Overview (`/repos/<repoId>/pulls/11`). The PR Brief block: "No brief yet", the button "Generate brief".
**Do:** point at the Overview tab, the empty state and the button; click **Generate brief**; skeletons replace the
summary, Risk areas and Review focus; hold until the brief arrives (15–25 s).
**Say (s1-01):** «П’ята домашка — PR Brief. Відкриваю тестовий пул-реквест, вкладку Overview. Брифу ще немає, є кнопка Generate brief.»
**Say (s1-02):** «Натискаю її. Сервер збирає готові факти: опис, intent, blast radius і список файлів із заголовками змін — і робить один виклик моделі.»
**Say (s1-03):** «Поки триває генерація, на місці брифу скелетон, а кнопка вимкнена, тож другий виклик не піде.»
**Say (s1-04):** «Виклик моделі триває секунд двадцять. І ось бриф з’явився на місці порожнього блоку.»

## 2. The finished brief — 35 s
**Show:** the PR Brief banner (summary paragraph, verdict "Request changes", "PR SCORE"), the notice "Generated without: …",
the footer `697ec0d · openrouter · deepseek/deepseek-v4-flash · … in / … out · $…`; then the Intent and Blast radius
cards ("No indexed symbols in the changed files."); then Risk areas and "Review focus — read these first".
**Do:** glide over the banner, the notice and the footer; scroll to the two cards; scroll to the two lists.
**Say (s2-01):** «Бриф готовий. Зверху підсумок простими словами: що робить пул-реквест. Вердикт і оцінка поруч — з останнього рев’ю.»
**Say (s2-02):** «Під ним примітка, без яких даних бриф згенеровано, і рядок із комітом, моделлю, токенами та вартістю.»
**Say (s2-03):** «Нижче, як і раніше, Intent і Blast radius. У цьому пул-реквесті в змінених файлах немає індексованих символів.»
**Say (s2-04):** «Далі Risk areas: ризик із файлом, до якого він прив’язаний. І Review focus — з чого почати читати: файл, рядок і причина.»

## 3. Review focus opens Files changed — 12 s
**Show:** the Review focus list; the item for `server/src/modules/_shared/run-duration.ts` (the first item if the model names none for that file).
**Do:** click it. The tab switches to Files changed with `?tab=diff&file=…&line=…`; the "Core logic" group and the
file are open, the file card has the accent border, the line is highlighted for about two seconds.
**Say (s3-01):** «Клікаю пункт Review focus. Відкривається вкладка Files changed саме на цьому файлі: він розгорнутий і виділений рамкою, а рядок підсвічено.»

## 4. Reload — 12 s
**Show:** PR #11 → Overview with the brief.
**Do:** reload the page; the brief is back as soon as the page renders; point at the banner, then at the footer.
**Say (s4-01):** «Тепер перезавантажую сторінку. Бриф на місці одразу: він збережений у базі, і нової генерації немає — внизу той самий коміт і ті самі токени.»

## 5. Spec, plan and the verification report in the PR — 25 s
**Show:** GitHub, the HW5 branch: `specs/12-pr-brief.md`, then `docs/plans/08-pr-brief.md`, then
`docs/plans/08-pr-brief.verification.md` (rendered Markdown).
**Do:** open each file in turn, slow scroll.
**Say (s5-01):** «У пул-реквесті домашки лежать три документи. Специфікація: вимоги до брифу з критеріями приймання.»
**Say (s5-02):** «План розробки: дванадцять кроків у чотирьох групах, кожен крок посилається на критерії зі специфікації.»
**Say (s5-03):** «І звіт верифікатора: кожен критерій звірено з кодом, і невиконаних пунктів немає.»

## 6. Why facts and not the diff — 12 s
**Show:** PR #11 → Overview: the footer with tokens and cost, then a Review focus item.
**Do:** glide to the footer, then to the item.
**Say (s6-01):** «Чому модель отримує готові факти, а не код diff: запит виходить малим і дешевим, а кожен файл і рядок у відповіді сервер звіряє з реальними змінами.»

---

## Coverage

| Step (`hw5-task.md`) | Scene | Cue |
|---|---|---|
| 1 open the test PR → Overview → show and click Generate brief | 1 | s1-01 … s1-04 |
| 2 the finished brief: summary, Risk areas, Review focus, Intent, Blast radius | 2 | s2-01 … s2-04 |
| 3 click a Review focus item → Files changed on that file | 3 | s3-01 |
| 4 reload → the brief is there, no new generation | 4 | s4-01 |
| 5 spec, plan and the plan-verifier report in the PR | 5 | s5-01 … s5-03 |
| 6 one sentence: why facts and not the diff | 6 (also s1-02) | s6-01 |

## Reality check (2026-10-05, rendered text read with Playwright at :3110; API cross-checked)
- PR #11 Overview with a stored brief: "PR Brief", "Request changes 3 findings · 2 blockers", "65 PR SCORE",
  "Generated without: blast radius, linked issue, project documents", footer
  `697ec0d · openrouter · deepseek/deepseek-v4-flash · 892 in / 1670 out · $0.0002`, Intent card, Blast radius card with
  "No indexed symbols in the changed files.", Risk areas (1 risk), "Review focus — read these first" (6 items).
  These counts belong to the brief stored at 16:57 and will change when scene 1 regenerates it.
- PR #12 Overview: "No brief yet" and the button "Generate brief" (the empty state the dry run reads).
- Clicking `server/src/modules/_shared/run-duration.ts:1` gave `…/pulls/11?tab=diff&file=…run-duration.ts&line=1`; the
  file card had the accent ring, and line 1 kept its highlight for about two seconds (computed styles sampled).
- A real generation on PR #15 took 23 s and one on PR #11 produced 892 tokens in: scene 1's narration (≈ 25 s) covers
  most of the wait; the rest is held on the skeleton.
- Plan: 12 steps, groups G1–G4 (`docs/plans/08-pr-brief.md`). Verification: 177 items, none "not met".
- Blast radius on PR #11 is the "no indexed symbols" state, not a caller map: step 2 of the task says "if you have them".

## Unverified claims
- "The model call takes about twenty seconds" (s1-04): it took 20 s in the filmed take (click at 10.8 s, brief at 31.2 s) and 23 s in a trial; it varies.
- "The button is disabled, so a second call will not go" (s1-03): the button is disabled on screen; that a second
  request joins the first is true of the server code, not shown.
- "Stored in the database, no new generation" (s4-01): `scenes.mjs` compares `generated_at` before and after the
  reload and fails the take if it changed; the frame shows only the same footer.
- "Every file and line in the answer is checked against the real changes" (s6-01): true of `brief/domain.ts`, no frame proves it.
- "Each step refers to the spec's criteria" (s5-02) and "no unmet item" (s5-03): true of the files; visible only as far as the scroll reaches.
- Scene 5 as a whole: the GitHub pages do not exist until the HW5 branch is pushed.
