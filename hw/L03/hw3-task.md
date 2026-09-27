# HW3 — Smart Diff (task as given by the course)

## Decisions taken with the user (2026-09-26)

- Branch `hw3` from `main`; a separate test PR in `artemmmon/dev-digest` is prepared later for manual checks.
- `e2e/README.md` (and any `.md` under test folders) → **tests**: the course's rule order is kept (tests above docs) and the case is pinned in the classifier table test.
- UI is built from `client/docs/design/` (refreshed from the user's Claude Design artifact), not from screenshots.
- "Original order" = the order GitHub returned the files (`PrFile[]` order), not alphabetical.
- Demo video is out of scope for now.
- Design gaps (the refreshed `client/docs/design/src/diff.jsx` defines only core/wiring/boilerplate) are derived, not waited for — each one is an explicit deviation in the plan:
  - `tests` role: label "Tests", description "Checks the change — skim for coverage", colour `--ok`; `docs` role: label "Docs", description "Explains the change — read if needed", colour `--info`. Order core → tests → wiring → docs → boilerplate; docs and boilerplate start collapsed.
  - Out-of-patch findings: a block at the end of the file, styled like the app's existing `OutdatedComments`.
  - Hide findings: the app's existing GitHub-comments toggle also hides finding comments.
  - Sticky group header: `position: sticky` (design has it on the PR header only).
  - Empty state "review not run yet" instead of zero counters: derived from existing empty-state styles.
  - Where the design and the task disagree, the task wins: original order = GitHub order; file expand rule = existing `AUTO_EXPAND_MAX_LINES`; the file card keeps the app's GitHub comment counter next to the new finding dot.

## Task (verbatim, Ukrainian)

📝 Домашнє завдання: Smart Diff

Що робимо. На лабораторній ми зібрали набір субагентів і побудували Intent Layer — шар, який пояснює рев’юеру, навіщо відкрито PR.
Домашнє завдання закриває сусідню проблему: у якому порядку рев’юер читає зміни і де він бачить результат рев’ю.
Зараз вкладка Files changed показує файли в тому порядку, в якому їх віддав GitHub, тому lock-файл стоїть поруч із бізнес-логікою. Знахідки агента при цьому живуть окремо, на вкладці Agent runs, і щоб зіставити знахідку з кодом, доводиться стрибати між вкладками.

Smart Diff робить дві речі
Сортує файли PR за роллю:
спочатку core (бізнес-логіка)
далі tests, wiring (конфігурація, barrel-файли), docs
в кінці boilerplate (lock-файли, згенерований код, snapshots)
Показує результат рев’ю в diff:
на заголовку групи видно, скільки файлів у ній мають знахідки
на картці файла — індикатор, що знахідки є
під потрібним рядком коду — коментар зі знахідкою, як на вкладці Agent runs

Як юзер я можу:
- Відкрити pull request, перейти на вкладку Files changed і побачити файли, згруповані за ролями core → tests → wiring → docs → boilerplate, кожна група з підписом ролі й кількістю файлів.
- Побачити, що docs і boilerplate згорнуті, а lock-файл лежить саме в boilerplate.
- Запустити Run review і після завершення побачити на заголовку групи лічильник файлів зі знахідками, а на картках самих таких файлів — крапку-індикатор.
- Розгорнути такий файл і побачити на потрібному рядку коментар до знахідки. По UI він має бути схожим до коментаря на сторінці Agent run. Можна перевикористати той же функціонал.
- Перемкнутися на Original order, коли потрібен звичний порядок GitHub.

### Що вже є в стартері
Усе нижче вже є у стартері. Але свій форк ви міняли з L01, тож дещо у вас може виглядати інакше або вже бути доробленим по-своєму — спочатку пошукайте у своєму коді. Головне: писати це з нуля не треба.

**Дані з сервера.** GET /pulls/:id повертає files[] типу PrFile: path, additions, deletions, patch (unified diff, може бути null). Цього достатньо для класифікації.
GET /pulls/:id/reviews повертає рев’ю з findings[]. У знахідки поля file, start_line, end_line, severity (CRITICAL | WARNING | SUGGESTION), title, rationale, suggestion, confidence, accepted_at, dismissed_at. Окремого поля line немає — прив’язуйтеся до start_line.
На клієнті ці дані дістають готові хуки з client/src/lib/hooks/reviews.ts: usePrReviews(prId) для знахідок і useFindingAction() для accept/dismiss. FindingsTab уже ними користується, запит кешується, тож повторне звернення з вкладки Files changed нічого не коштує.

**Контракт.** Zod-контракт SmartDiff лежить у server/src/vendor/shared/contracts/brief.ts (друга, ідентична копія — в client/src/vendor/shared/contracts/brief.ts): groups[{ role, files[{ path, additions, deletions, finding_lines[], pseudocode_summary? }] }] + split_suggestion { too_big, total_lines, proposed_splits[] }. Тип відповіді SmartDiffResponse уже оголошений у review-api.ts. Роут, який його віддає, ви створюєте самі.
Увага: SmartDiffRole у цьому файлі — z.enum(['core', 'wiring', 'boilerplate']), лише три значення. Щоб додати tests і docs, розширте enum в обох копіях brief.ts; вони мають лишитися ідентичними, інакше типи сервера і клієнта розійдуться.

**Компоненти.** Вкладка DiffTab рендерить DiffViewer з client/src/components/diff-viewer/. FileCard уже вміє згортатися, автоматично розгортає файли до 200 рядків (AUTO_EXPAND_MAX_LINES у constants.ts) і вже показує в шапці лічильник коментарів — крапка-індикатор знахідок стає поруч, за тим самим зразком.
parsePatch у helpers.ts віддає рядки з oldNo/newNo. Власний парсер diff писати не треба.
Коментарі вже вміють жити під рядком коду. У comments.ts функція keysForLine(ln) дає ключ рядка (RIGHT:<новий рядок> або LEFT:<старий>), а partitionThreads відділяє ті, що знайшли свій рядок, від тих, що ні. Далі CodeLine малює їх під рядком. Знахідку чіпляйте так само: ключ RIGHT:${finding.start_line}.
Картку теж не треба малювати з нуля. Вона вже є на вкладці Agent runs — FindingCard у теці _components/FindingCard/. Візьміть її або зробіть простішу копію: severity, заголовок, пояснення і кнопки Accept / Dismiss.
Кольори й іконки severity живуть в одному місці: SEV і SeverityBadge у client/src/vendor/ui/primitives/Badge.tsx. Для підпису на рядку достатньо кольору й слова звідти, власну палітру заводити не треба.
Рядки інтерфейсу для Smart Diff лежать у client/messages/en/prReview.json, ключ smartDiff: coreLabel, wiringLabel, boilerplateLabel, groupedByRole, filesCount, findingLines. Для нових ролей додайте testsLabel і docsLabel.

**Стартові патерни класифікації.** Порядок перевірки важить більше за самі патерни: перше правило, що збіглося, виграє.
- boilerplate — *.lock, pnpm-lock.yaml, package-lock.json, yarn.lock, dist/**, build/**, **/__snapshots__/**, *.snap, *.generated.*, *.min.js.
- tests — **/*.test.ts(x), **/*.it.test.ts, **/*.spec.ts, **/test/**, **/tests/**, **/__tests__/**, e2e/**.
- wiring — index.ts/index.js (barrel-файли), *.config.*, tsconfig*.json, .eslintrc*, .env*, docker-compose*.yml, .github/**, .claude/**.
- docs — **/*.md, docs/**, README*, CHANGELOG*, LICENSE.
- core — усе інше.

Три випадки, на яких порядок видно найкраще; занесіть їх у таблицю тестів. __snapshots__/x.snap усередині __tests__ потрапляє в boilerplate, бо правило снапшотів стоїть вище за правило тестів. .claude/skills/security/SKILL.md потрапляє в wiring: markdown тут задає поведінку агента, тому правило .claude/** стоїть вище за правило документації. e2e/README.md за цим порядком потрапляє в tests — якщо вважаєте інакше, змініть правило і зафіксуйте своє рішення в тесті.

**Тестовий PR.** Smart Diff перевіряємо на PR у вашому форку DevDigest, доданому в DevDigest як репозиторій. PR має містити щонайменше один lock-файл, один файл із логікою в server/src/ або client/src/, один тест і один конфігураційний або barrel-файл. Після Run review в цьому PR має бути хоча б одна знахідка у файлі з групи core.

### Як знахідки показані в diff
- заголовок групи — крапка з числом справа, перед «N files». Число — це скільки файлів у групі мають знахідки, а не скільки знахідок усього. Два файли зі знахідками дають ● 2, навіть якщо знахідок у них п’ять;
- картка файла — крапка поруч зі шляхом, без числа. Поруч із нею вже стоїть лічильник коментарів з іконкою повідомлення — це інша річ: він рахує коментарі людей із GitHub. Дві різні позначки, не плутайте;
- рядок коду — під ним коментар зі знахідкою: severity, заголовок, пояснення і кнопки Accept / Dismiss. Виглядає так само, як картка знахідки на вкладці Agent runs. Сам рядок додатково позначений кольоровою смужкою зліва й підписом справа: CRITICAL → blocker, WARNING → warning, SUGGESTION → suggestion.
Вкладка Agent runs лишається як була.

### Можлива реалізація
- Класифікатор. Чиста функція classifyFile(path): SmartDiffRole у server/src/modules/reviews/smart-diff/ (або окремому модулі smart-diff/), патерни й порядок ролей — у constants.ts. Спочатку таблиця тестів «шлях → роль», потім реалізація. Функція незалежна від роута: на L08 цей класифікатор стане фільтром перед збіркою промпта, тому має імпортуватися й працювати без HTTP-запиту.
- Контракт. Розширте SmartDiffRole до п’яти значень в обох копіях brief.ts. Додайте testsLabel і docsLabel у prReview.json.
- Роут GET /pulls/:id/smart-diff. Бере файли PR і знахідки останнього рев’ю, розкладає файли по групах у фіксованому порядку ролей, збирає finding_lines з start_line, віддає SmartDiff. split_suggestion мінімально: too_big: false, total_lines = сума additions + deletions, proposed_splits: [].
- Групи на вкладці Files changed. Заголовок ролі з кількістю файлів; docs і boilerplate згорнуті за замовчуванням, решта — за наявним правилом AUTO_EXPAND_MAX_LINES.
- Знахідки в diff. usePrReviews(prId) у DiffTab → прокинути в FileCard поруч із commenting. Три місця: лічильник файлів у заголовку групи, крапка в шапці файла, коментар під рядком (keysForLine, картка з FindingCard).
- Конвеєр: planner → implementer → (architecture-reviewer ∥ plan-verifier). В описі PR — який субагент що зробив і що знайшов plan-verifier.

### Критерії приймання
P1 — блокують здачу:
1. Files changed показує п’ять груп у порядку core → tests → wiring → docs → boilerplate, кожна з підписом ролі й кількістю файлів.
2. Lock-файл класифіковано як boilerplate; docs і boilerplate при відкритті згорнуті.
3. Після Run review на заголовку групи видно лічильник файлів зі знахідками.
4. На картці файла зі знахідками видно крапку-індикатор.
5. У розгорнутому файлі під потрібним рядком видно коментар зі знахідкою: severity, заголовок і пояснення.
6. Перемикач Original order повертає звичний порядок GitHub.
7. Є відкритий PR з описом реалізації та демо-відео.

P2 — не блокують:
1. Патерни й порядок ролей в одному файлі констант; юніт-тест класифікатора на таблицю «шлях → роль», включно з трьома спірними випадками.
2. Роут віддає відповідь, що проходить валідацію контрактом SmartDiff; enum розширено в обох копіях brief.ts.
3. У логах перегляду Smart Diff немає нового виклику моделі; групування працює ще до першого рев’ю.
4. Рядок зі знахідкою позначений кольоровою смужкою й підписом severity.
5. Кнопки Accept / Dismiss у коментарі працюють і змінюють стан знахідки.
6. Знахідка, чий рядок не потрапив у патч, показана окремим блоком у кінці файла, а не зникає.
7. Коментарі зі знахідками можна сховати тим самим перемикачем, що й коментарі GitHub.
8. Опис PR містить, які субагенти використано і що перевірив plan-verifier.

P3 — побажання:
1. Заголовок групи липне до верху при прокручуванні.
2. Коментар зі знахідкою можна згорнути в один рядок.
3. Порожній стан «рев’ю ще не запускали» замість нульових лічильників.
4. Лічильники й індикатори оновлюються після Run review без перезавантаження сторінки.
5. Назви груп і підписи — з client/messages/en/prReview.json, ключ smartDiff (testsLabel, docsLabel для нових груп).

### Як перевірити (сценарій відео)
1. Тестовий PR → Files changed → п’ять груп із підписами й лічильниками, згорнуті docs і boilerplate.
2. Розгорнути boilerplate — видно lock-файл.
3. Run review → Files changed → лічильник на заголовку групи й крапка на картці файла.
4. Розгорнути файл зі знахідкою → коментар під рядком. Перемкнути Original order і назад.
5. Одним реченням: чому групування не викликає модель.
