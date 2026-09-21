# Demo dev-digest-L02 — shooting script (HW2)

~7 min (narration 4,884 chars ≈ 5.8 min + gaps). Filmed by `demo-film` from `cues.json`; this file is the human view. Narration is
Ukrainian, everything else English.

## Assumptions
- Audience: the course reviewer. Knows DevDigest, so no product intro.
- Source of truth: `hw/L02/hw2-criteria.md` (53 criteria) + the homework's acceptance list
  (video: Extractor from scan to a linked skill + the API Contract experiment).
- Length: ~7 min, over the 4–6 min default, because the homework asks for two features and an
  experiment in one video. Scenes 10–11 are the cut candidates if it must be shorter.
- **Mutating clicks on camera (deviation from `devdigest-demo` "never click").** HW2 is about
  Run Scan / Accept / Reject / Edit / Create skill, so these are clicked for real. They are cheap
  (DB writes; the scan is ~$0.001) and every scene's pre-roll resets the state, so a retake
  starts clean. **Run Review is still never clicked:** reviews are triggered through the API in
  pre-roll (off camera), and the video shows the finished run and its trace.
- The scan takes 2–3 minutes. Scene 3 ends right after the click; the wait happens between
  scenes, off camera, and the narration says so.
- One repo on camera: `artemmmon/cs2-lineups` (id `12e3f5b1-6c8d-45a9-9fca-1801eb6c2b32`).
  `acme/payments-api` stays off camera — navigate by URL, never through the repo switcher.

## Preconditions
- Stack up: web :3000, api :3001. Clone of cs2-lineups resynced (HEAD `e150ea2`).
- Reset before each take (pre-roll): delete `conventions` rows of the repo; delete skill
  `repo-conventions` if present (API `DELETE /skills/:id`).
- Existing data used as-is:
  - PR #6 (`c0a45274-de90-4fb1-a281-f0ab2b9f2f45`): 6 API Contract runs — 3 without skills
    (1,958 / 4,527 / 4,050 tok), 3 with the 4 skills (9,287 / 11,568 / 7,837 tok).
    Baseline that missed a change: run `00184697-44ce-4300-a794-dff9f2cc47da` (8:35 PM, 2 findings).
    With skills: run `0c7a7b39-01db-44cf-96b0-5c778250b859` (8:36 PM, 5 findings).
  - PR #1: Test Quality runs — with 4 skills `ff52c401-6a26-4a22-85f4-0eb32e4abe0c` (5 findings),
    without `d7c2b910-3074-4d5b-9364-9a5493eeb0cb` (3 findings).
- API Contract Reviewer: all 6 skills enabled (as now).

---

## 1. Intro — 20 s
**Show:** `/repos/<repoId>/conventions`, empty state ("No conventions extracted yet").
**Say (s1-01):** «Друга домашка. Дві частини: Conventions Extractor, який знаходить правила коду в репозиторії й перетворює їх на скіл, і API Contract Reviewer з чотирма скілами.»
**Say (s1-02):** «Показую все на одному репозиторії — cs2-lineups, це Flutter-застосунок із маленьким сервером на Dart.»

## 2. Model setting — 15 s
**Show:** `/settings/models`, row "Conventions" (default `deepseek/deepseek-v4-flash`).
**Do:** open the Conventions model dropdown, type "deepseek", close with Escape (no change).
**Say (s2-01):** «Модель для аналізу обирається в налаштуваннях, окремим рядком Conventions. Список моделей і ціни приходять з OpenRouter, нічого не захардкожено. За замовчуванням — дешевий DeepSeek.»

## 3. Run Scan — 40 s
**Show:** sidebar SKILLS LAB → Conventions; empty state; header button "Run Scan".
**Do:** hover the SKILLS LAB section; click **Run Scan**; the loading state "Scanning the repository…" appears. `stop()` a few seconds later.
**Say (s3-01):** «Сторінка Conventions живе в секції Skills Lab. Перший запуск — кнопка Run Scan.»
**Say (s3-02):** «Скан іде в три кроки. Спершу код без жодної моделі вибирає зразки: конфіги — pubspec, analysis_options — і дванадцять найважливіших файлів.»
**Say (s3-03):** «Потім один виклик моделі повертає кандидатів: категорія, правило, доказ — файл, рядок і шматок коду — і впевненість.»
**Say (s3-04):** «І нарешті код перевіряє кожен доказ: файл має існувати, а цей рядок має справді бути в ньому. Без доказу кандидат відкидається. Скан триває дві-три хвилини, очікування я вирізав.»

*(off camera: wait until `POST …/extract` finishes)*

## 4. Candidates — 45 s
**Show:** the list: "Pending review", cards with category chip, rule, `path:line` link, snippet, "Confidence NN%".
**Do:** scroll through; expand "Scan report"; click the evidence link of one card → GitHub opens on the exact lines (new tab); return.
**Say (s4-01):** «Ось кандидати. У кожної картки — категорія, саме правило, файл із номером рядка, фрагмент коду і впевненість у відсотках.»
**Say (s4-02):** «Фрагмент вирізаний із самого файлу, а не взятий із відповіді моделі. Тому він не може бути вигаданим.»
**Say (s4-03):** «Посилання веде на GitHub, прямо на ці рядки, і прив'язане до коміту, на якому робився скан.»
**Say (s4-04):** «У звіті скану видно, скільки файлів прочитано, скільки кандидатів запропоновано і скільки відкинуто, а також модель і вартість — десяті частки цента.»

## 5. Triage — 45 s
**Do:** Accept three cards; Reject one weak card (a rule about a single file); on another card click **Edit**, reword the rule inline, **Save**, then Accept it. Reload the page.
**Say (s5-01):** «Далі сортую. Accept — правило годиться. Reject — ні: наприклад, це правило описує один файл, а не звичку всього репозиторію.»
**Say (s5-02):** «Edit редагує правило прямо в картці, без переходу на іншу сторінку. Уточнюю формулювання і приймаю.»
**Say (s5-03):** «Після перезавантаження відхилене правило не повертається. Воно не потрапить у скіл і не з'явиться знову при повторному скані.»
**Say (s5-04):** «Тепер замість Run Scan у шапці кнопка ReScan: вона перезапускає аналіз і замінює тільки ті кандидати, що ще чекають рішення.»
*(s5-04: hover ReScan, do not click.)*

## 6. Create skill — 50 s
**Show:** "Create skill" button in the header (appears once something is accepted).
**Do:** click **Create skill** → modal "Create skill from conventions"; scroll the Body; add one line to the body; switch Write → Preview; pick agent **General Reviewer** in "Link to an agent"; click **Create skill**.
**Say (s6-01):** «Щойно є хоча б один прийнятий кандидат, з'являється кнопка Create skill.»
**Say (s6-02):** «Модалка пояснює, що скіл збирається з прийнятих конвенцій. Ім'я за замовчуванням — repo-conventions. Можна змінити назву й опис.»
**Say (s6-03):** «Тіло скіла — це markdown, його можна редагувати: правила згруповані за категоріями, і в кожного є доказ. Тип і джерело видно як метадані.»
**Say (s6-04):** «Вибираю агента, до якого одразу прив'язати скіл, — General Reviewer. Відхилені кандидати сюди потрапити не можуть: скіл збирає сервер тільки з прийнятих.»

## 7. Skills Lab — 55 s
**Show:** `/skills` grid.
**Do:** find the `repo-conventions` card; click it → side preview drawer; "Open" → `/skills/<id>`; tabs Config / Preview / Versioning. On Config change one line and save (makes v2); Versioning → **Diff**; hover **Restore**. Back to grid; click **Delete** on `repo-conventions` → confirm modal → **Cancel**.
**Say (s7-01):** «Новий скіл одразу є на сторінці Skills. Кожна картка — назва, тип, опис, перемикач, версія і кількість агентів.»
**Say (s7-02):** «Клік відкриває прев'ю збоку — markdown уже відрендерений.»
**Say (s7-03):** «На сторінці скіла є вкладки Config, Preview і Versioning. Змінюю один рядок і зберігаю — з'являється друга версія.»
**Say (s7-04):** «Diff показує різницю з поточною версією, Restore повертає стару.»
**Say (s7-05):** «Видалення завжди через підтвердження — скасовую.»

## 8. The skill in a review — 45 s
*(pre-roll, off camera: `POST /pulls/<PR #1 id>/review {agentId: General Reviewer}`; wait until done)*
**Show:** `/agents/<General Reviewer id>?tab=skills` → `repo-conventions` enabled; then PR #1 → Agent runs → the General Reviewer run → trace drawer → "Prompt assembly".
**Do:** hover **Run Review** (do not click); open the trace; scroll to "Skill blocks in the prompt".
**Say (s8-01):** «Скіл прив'язаний до General Reviewer і увімкнений — ось він на вкладці Skills агента.»
**Say (s8-02):** «Я запустив рев'ю цим агентом на PR номер один. У трейсі прогону є окремий блок repo-conventions із власною кількістю токенів.»
**Say (s8-03):** «Тобто згенерований скіл справді доходить до промпта і працює на рев'ю.»

## 9. API Contract skills — 45 s
**Show:** `/skills`, cards `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy` (source "Imported file"); preview of `breaking-change` scrolled to Good / Bad; then `/agents/<API Contract id>?tab=skills`.
**Do:** type "semver" in the agent's skill search, clear it; hover the drag grip of an enabled row, then of a disabled one.
**Say (s9-01):** «Для API Contract Reviewer — чотири скіли: breaking-change, response-schema, semver-discipline і deprecation-policy.»
**Say (s9-02):** «Опис кожного — директива: коли застосовувати і коли ні. У тілі — чекліст і приклади «добре» та «погано».»
**Say (s9-03):** «Три я створив через форму, а deprecation-policy — імпортом zip-архіву, тому в нього джерело Imported file.»
**Say (s9-04):** «На вкладці Skills агента видно всі скіли системи, з пошуком. Перетягувати можна лише увімкнені — порядок тут це порядок блоків у промпті.»

## 10. Experiment — 75 s
**Show:** PR #6 → "Files changed" (the `_toJson` diff); then Agent runs → timeline of 6 runs; trace of the baseline run, then of a with-skills run.
**Do:** scroll the diff; point at token counts in the timeline; open baseline trace (log "skills: none attached", 2 findings); open with-skills trace ("Skill blocks in the prompt", 4 rows, "Skills add … tokens").
**Say (s10-01):** «Експеримент. PR номер шість виглядає як рефакторинг серіалізації, але тихо ламає контракт: throw_style стає throwStyle, steps — рядком замість масиву, а hard — expert.»
**Say (s10-02):** «Я прогнав агента тричі без скілів і тричі зі скілами. Прогони без скілів видно одразу — у них у два-три рази менше токенів.»
**Say (s10-03):** «Ось прогін без скілів: у лозі — skills none attached, і дві знахідки. Перейменування throw_style агент пропустив.»
**Say (s10-04):** «А ось зі скілами: чотири окремі блоки з токенами. Знайдено всі три зміни, і агент прямо пише — перейменовано без deprecation, без підняття версії.»
**Say (s10-05):** «Чесний результат: без скілів агент зловив усе у двох прогонах із трьох. Скіли зробили результат стабільним — три з трьох — і додали політику версіонування. Повного «пропускає без скілів» на цій моделі не вийшло, і я описав це в PR.»

## 11. Test Quality control — 35 s
**Show:** PR #1 → Agent runs → trace of the Test Quality run with skills, then without.
**Say (s11-01):** «Для порівняння — Test Quality Reviewer із минулої лабораторної, PR із тестами лише на щасливий шлях.»
**Say (s11-02):** «Зі скілами він флагує непокриту гілку видалення з обраного і неперевірені статуси помилок. Без скілів гілку видалення він не помічає, а помилки опускає до підказки.»

## 12. Wrap-up — 30 s
**Show:** GitHub PR `artemmmon/dev-digest#5`, scroll to "Extractor quality report" and "Self-review".
**Say (s12-01):** «Усе це — в одному pull request. В описі — звіт про якість знахідок екстрактора: усі кандидати мали справжній доказ, але частина правил слабка, а кількість між сканами коливається.»
**Say (s12-02):** «Перед пушем гілку перевірив pr-self-review: двадцять сім рев'юерів за скілами проєкту, критичних знахідок нуль, попередження перелічені в описі.»

---

## Coverage
| Criterion | Scene | Cue |
|---|---|---|
| 6 Agents in SKILLS LAB · 44 Conventions in SKILLS LAB | 3 | s3-01 |
| 7 Agents page grid · 32 tile fields | 8 (agent page is passed through) | — (on screen only) |
| 9 Skills cards · 22 version + agent_count | 7 | s7-01 |
| 10 side preview | 7 | s7-02 |
| 11 Add → create/import · 12 create form | — | **not filmed** (see below) |
| 13 agent Skills tab · 30 search · 31 drag only enabled · 37 all skills + type | 9 | s9-04 |
| 14 drag order changes the prompt | — | **not filmed** |
| 15 import zip/md with preview · 16 one imported skill | 9 | s9-03 (result only, not the import flow) |
| 17 Test Quality experiment | 11 | s11-02 |
| 18 API Contract experiment | 10 | s10-03…05 (**partial: baseline caught all in 2/3 runs**) |
| 19 skills block + tokens in trace | 8, 10 | s8-02, s10-04 |
| 20 disabled skill absent from trace | 10 | s10-03 |
| 23 Delete on card · 24 confirm modal | 7 | s7-05 |
| 25 tabs · 26 rendered preview · 27 versions · 28 Diff · 29 Restore | 7 | s7-02…04 |
| 33/34 agent delete + confirm | — | not filmed (same ConfirmDialog as 24) |
| 35 agent tabs · 36 Config fields | — | not filmed |
| 38 extract route persists | 3, 5 | s3-01, s5-03 |
| 39 sampling without a model | 3 | s3-02 |
| 40 candidate format | 3 | s3-03 |
| 41 modal edits body + metadata · 51 modal text, Name/Description, Cancel/Create | 6 | s6-02, s6-03 |
| 42 accepted → repo-conventions linked to an agent | 6, 8 | s6-04, s8-01 |
| 43 four API skills with good/bad | 9 | s9-01, s9-02 |
| 45 Run Scan / ReScan | 3, 5 | s3-01, s5-04 |
| 46 card fields · 47 Accept/Reject/Edit | 4, 5 | s4-01, s5-01 |
| 48 reject persists · 49 inline edit · 50 Create skill appears | 5, 6 | s5-03, s5-02, s6-01 |
| 52 new skill on Skills page | 7 | s7-01 |
| 53 Settings → Models → Conventions | 2 | s2-01 |
| Acceptance: evidence clickable → GitHub | 4 | s4-03 |
| Acceptance: generated skill runs on review | 8 | s8-02 |
| 1–5, 8, 21 (AGENTS.md, skills files, CRUD in Postgres, pr-self-review) | 12 (21 only) | s12-02 |

Not filmed (fit into ~20 s if wanted): 11/12 (Add → Create modal), 14 (reorder → prompt order),
15 (import flow), 33–36 (agent delete/tabs/Config). They are checkable in the app and repo.

## Unverified claims
- s4-04 "десяті частки цента": three live scans cost $0.0008–$0.0014. Next scan may differ.
- s4 / s5 card contents: the model's output differs between scans (15, 8 and 11 candidates so
  far). Lines name no specific rule or count; the "single-file rule" to reject is picked live.
- s8: the General Reviewer run on PR #1 does not exist yet; it is created in pre-roll.
- s10-02 "у два-три рази менше токенів": 1,958 / 4,527 / 4,050 vs 7,837 / 9,287 / 11,568 — true on
  average, not pairwise (4,527 vs 7,837 is 1.7×).
- s12-02 numbers are from the self-review run on commit `85ca70b`.
- **UI contradiction:** the loading state and the ReScan dialog say "A scan can take up to a
  minute"; measured scans took 111–178 s. Either fix the string or keep s3-04's "дві-три хвилини"
  and accept the mismatch on screen.
