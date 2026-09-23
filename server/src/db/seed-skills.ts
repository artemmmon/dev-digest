/**
 * Built-in skills used by the seed, bound to the two lesson-L02 agents.
 *
 * A skill is text: a directive `description` (the skill's interface — it says WHEN to
 * apply it) and a markdown `body` (HOW). The import sample `boundary-cases` is not here
 * on purpose: it lives in `docs/skill-samples/` and enters through the import flow.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  /** Glob patterns over a PR's changed files (`AppliesTo`); omitted = always applies. */
  appliesTo?: string[];
}

export const BRANCH_COVERAGE_RUBRIC: SeedSkill = {
  name: 'branch-coverage-rubric',
  type: 'rubric',
  description:
    'Use when reviewing tests: for every branch, guard and error path in the changed source, require a test that reaches it, and flag each one no test reaches.',
  body: `# Branch coverage

Read the changed source first, then the tests. For every \`if\`/\`else\`, ternary,
early return, \`catch\`, \`??\`/\`||\` fallback and thrown error the diff adds or changes,
find the test that reaches it.

## Report
- A branch that no test in the diff reaches. Name the branch (file:line) and the input
  that would reach it.
- A test suite that only exercises the successful path of code that can fail.
- An \`else\` or error path that is asserted only by "does not throw".

## Do not report
- Branches the type system makes unreachable.
- Trivial glue with no logic.

## Severity
CRITICAL when the uncovered branch is the main failure path of new behaviour. WARNING
for a secondary branch.`,
};

export const MOCKING_DISCIPLINE: SeedSkill = {
  name: 'mocking-discipline',
  type: 'convention',
  description:
    'Use when a test replaces collaborators with mocks: flag tests that mock the unit under test, assert only on the mock, or mock what a real in-memory fake would cover.',
  body: `# Mocking discipline

A mock is acceptable at the edge of the system (network, clock, LLM, filesystem). It is
a smell when it replaces the logic the test claims to verify.

## Flag
- The unit under test is itself mocked or partially mocked.
- The only assertion is that a mock was called with some arguments, and nothing checks
  the resulting behaviour or return value.
- A mock returns the exact value the assertion later expects, so the test cannot fail.
- Three or more layers of mocks for one call; prefer a small in-memory fake.
- Mocks that are not reset between tests and leak state.

## Prefer
- Real pure helpers, an in-memory fake of a port, or the project's \`adapters/mocks.ts\`.
- Assertions on observable output: return value, persisted state, emitted event.`,
};

export const FLAKY_TEST_PATTERNS: SeedSkill = {
  name: 'flaky-test-patterns',
  type: 'rubric',
  description:
    'Use when reviewing tests: flag patterns that make a test pass or fail depending on time, order, randomness, the network or shared state.',
  body: `# Flaky test patterns

## Flag
- \`setTimeout\`/sleep used to wait for an outcome instead of awaiting it or using fake timers.
- Assertions on \`Date.now()\`, \`new Date()\` or elapsed time without a controlled clock.
- \`Math.random()\`, uuid or ordering of an unordered collection inside an assertion.
- Real network or a real API key; tests that need a service that may not be running.
- Tests that share a database row, global, or module-level state and depend on run order.
- A fire-and-forget promise that is never awaited before the assertion.

## Report
Name the pattern, the line, and the input that makes it nondeterministic. Suggest the fix
(fake timers, injected clock, seeded value, awaiting the promise, a fresh fixture per test).

## Severity
WARNING by default; CRITICAL only when the flake would hide a real regression in a
release-blocking test.`,
};

export const ROUTE_BREAKING_CHANGE_RUBRIC: SeedSkill = {
  name: 'route-breaking-change-rubric',
  type: 'rubric',
  description:
    'Use when a diff changes an HTTP route or its schema: compare the old and new signature and flag every change an existing caller would notice — path, method, params, required fields, response shape, status code.',
  body: `# Breaking changes in a route

Compare the route before and after. A change is **breaking** when a caller written
against the old contract now fails or reads wrong data.

## Breaking
- Path, method or prefix changed, or the route removed.
- A request field renamed, removed, retyped, or a new field made **required**.
- A response field removed, renamed, retyped, or an existing one made nullable.
- Status code or error envelope changed (\`200\` → \`201\`, \`404\` → \`422\`).
- Pagination, ordering or default limit changed.

## Not breaking
- A new **optional** request field, a new response field, a new route.

## Report
Name the field or route, the old and the new shape, and what an old caller now sees.
Say whether any caller in the diff was updated. If none was, that raises the severity.

## Severity
CRITICAL for a breaking change with no migration or versioning in the diff. WARNING for
a fragile but compatible change.`,
};

export const ZOD_CONTRACT_CONVENTIONS: SeedSkill = {
  name: 'zod-contract-conventions',
  type: 'convention',
  description:
    'Use when a diff touches a zod contract or a route schema in this repo: check that the shared copies stay in sync, wire names stay snake_case, and added fields are nullish where old data exists.',
  body: `# Zod contract conventions (DevDigest)

## Rules
- The canonical contracts are in \`server/src/vendor/shared\`; \`client/src/vendor/shared\` is a
  byte-identical copy. A diff that edits only one of them is a defect.
- Wire names are \`snake_case\`; only React props and locals are \`camelCase\`.
- A field added to a contract that already has stored data (for example the run trace jsonb)
  must be \`.nullish()\`, because stored documents are returned without a parse.
- Route \`params\`, \`body\` and \`response\` are zod schemas; a handler must not call
  \`Schema.parse(req.body)\` itself.
- Narrowing a schema (a stricter regex, a shorter max, an enum value removed) is a breaking
  change for existing callers.

## Report
The contract, the rule it breaks, and the caller-visible effect.`,
};

/** Skills bound to Test Quality Reviewer, in prompt order. */
export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  BRANCH_COVERAGE_RUBRIC,
  MOCKING_DISCIPLINE,
  FLAKY_TEST_PATTERNS,
];

/** Skills bound to API Contract Reviewer, in prompt order. */
export const API_CONTRACT_SKILLS: SeedSkill[] = [
  ROUTE_BREAKING_CHANGE_RUBRIC,
  ZOD_CONTRACT_CONVENTIONS,
];

// ============================================================================
// Flutter-first pack. Scoped with `appliesTo` (spec 07) so none of these ever
// reach a non-Dart PR's prompt. Bloc/Cubit is the assumed state-management
// pattern where one is needed; everything else stays state-management-neutral.
// ============================================================================

const DART_GLOBS = ['*.dart'];

export const FLUTTER_ASYNC_CONTEXT_SAFETY: SeedSkill = {
  name: 'flutter-async-context-safety',
  type: 'rubric',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart/Flutter diffs: flag a BuildContext used after an await without a mounted check, and setState/Navigator/ScaffoldMessenger calls that can fire after the widget is gone.',
  body: `# Async + BuildContext safety

A widget can be disposed while an \`await\` is pending. Using its \`context\`, calling
\`setState\`, or reaching \`Navigator\`/\`ScaffoldMessenger\` after that throws or acts on a
dead tree.

## Flag
- \`context\` (or anything derived from it — \`Theme.of(context)\`, \`Navigator.of(context)\`)
  used after an \`await\` with no \`if (!context.mounted) return;\` (or \`if (!mounted)\` in a
  \`State\`) between the await and the use.
- \`setState(...)\` called after an \`await\` with no mounted guard.
- A \`BuildContext\` captured in a closure, callback, or passed into an async function and
  used later without re-checking \`mounted\`.
- \`Navigator.pop\`/\`push\`, \`ScaffoldMessenger.of(context).showSnackBar\` after async work,
  ungated.

## Do not report
- Synchronous use of \`context\` (no \`await\` in between).
- A guard already present, however it's spelled (\`mounted\`, \`context.mounted\`, an early
  return checking a cancellation token before touching \`context\`).

## Severity
CRITICAL when the missing guard is on the main flow of new behaviour (a common user
action: submit, navigate, load). WARNING for a secondary/rare path.`,
};

export const FLUTTER_RESOURCE_DISPOSAL: SeedSkill = {
  name: 'flutter-resource-disposal',
  type: 'rubric',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart/Flutter diffs: flag a controller, subscription, timer or Bloc/Cubit created without a matching dispose/close/cancel.',
  body: `# Resource disposal

Every controller, subscription and timer a widget or a Bloc/Cubit creates must be
released, or it leaks and can fire callbacks against a disposed tree.

## Flag
- A \`TextEditingController\`, \`AnimationController\`, \`ScrollController\`, \`PageController\`
  or \`FocusNode\` created in \`initState\`/a field without a matching \`.dispose()\` in
  \`dispose()\`.
- A \`StreamSubscription\` from \`.listen(...)\` with no \`.cancel()\`.
- A \`Timer\`/\`Timer.periodic\` with no \`.cancel()\`.
- A \`Bloc\`/\`Cubit\` instantiated directly (\`MyCubit()\`, not via \`BlocProvider(create: ...)\`)
  with no \`.close()\` — or a \`BlocProvider.value\` that closes a bloc it does not own.
- A \`ChangeNotifier\` subclass with a missing \`super.dispose()\` or a listener added
  without \`removeListener\`.

## Do not report
- A controller passed in from a parent and NOT created by this widget — the owner
  disposes it, not this one. Same for \`BlocProvider.value\`'s bloc.
- Disposal already present under a different but equivalent method name/pattern.

## Severity
CRITICAL for a leak on a screen that is created/destroyed often (a list item, a
dialog, a route pushed repeatedly). WARNING for a singleton-lifetime screen.`,
};

export const BLOC_CUBIT_CONVENTIONS: SeedSkill = {
  name: 'bloc-cubit-conventions',
  type: 'convention',
  appliesTo: DART_GLOBS,
  description:
    'Use ONLY when the diff touches a Bloc or Cubit (extends Bloc/Cubit, BlocBuilder/BlocListener/BlocConsumer, or an Event/State for one). Do not apply to Provider/Riverpod/GetX-only code.',
  body: `# Bloc/Cubit conventions

## Flag
- A state class that is mutable (no \`Equatable\`/\`freezed\` value equality, or a
  \`copyWith\` that forgets a field) — \`BlocBuilder\` then skips rebuilds it shouldn't.
- \`BuildContext\` or any widget type held inside a Bloc/Cubit or its state/event.
- \`emit(...)\` called after an \`await\` with no \`if (isClosed) return;\` guard, or after
  \`close()\` could plausibly have run.
- A \`Bloc\`'s \`on<Event>\` handler with no event transformer (\`droppable()\`/\`restartable()\`/
  \`sequential()\`) on a handler that starts async work and can be re-triggered rapidly
  (search-as-you-type, submit button) — the default is unbounded concurrent processing.
- Business logic or a repository call inside \`BlocListener\`/\`BlocConsumer\`'s listener when
  it belongs in the Bloc/Cubit; conversely, navigation or a SnackBar inside \`BlocBuilder\`'s
  builder (a builder must be a pure function of state — side effects belong in the listener).
- \`context.read<X>()\` inside \`build()\` instead of \`context.watch<X>()\`/\`BlocBuilder\` (misses
  rebuilds), or the reverse: \`context.watch\` inside a callback (rebuilds needlessly, and
  can throw outside the widget tree's build phase).
- A repository/service instantiated directly inside a Bloc/Cubit instead of injected via
  its constructor — makes the Bloc untestable without a real backend.

## Do not report
- Provider/Riverpod/GetX/MobX state management with no Bloc/Cubit in the diff — this
  skill does not apply.

## Severity
CRITICAL for emit-after-close or a BuildContext leak into state. WARNING for the rest.`,
};

export const DART_NULL_SAFETY_AND_TYPES: SeedSkill = {
  name: 'dart-null-safety-and-types',
  type: 'rubric',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart diffs: flag unsafe null-assertion (!), late fields that may read before assignment, unchecked dynamic/as casts on JSON, and non-exhaustive switches on sealed types.',
  body: `# Null safety and types

## Flag
- \`x!\` where nothing above proves \`x\` is non-null (no preceding \`if (x != null)\`,
  no just-assigned value) — a null there is a runtime crash, not a compile error.
- \`late\` on a field that can plausibly be read before it is set (no clear
  always-initialize-first call path, e.g. set only inside a conditional branch).
- \`dynamic\`, or an unchecked \`as Type\` / \`as Map<String, dynamic>\`, on data decoded from
  JSON, a platform channel, or a query param — prefer a generated/checked model
  (\`fromJson\`) or a runtime type check with a clear error.
- A \`switch\` over a sealed class / enum with a \`default\` that silently swallows a case a
  future addition would need to handle, where exhaustiveness would have caught it.
- A class holding meaningful value data with no \`==\`/\`hashCode\` (or \`Equatable\`/\`freezed\`)
  — breaks equality-dependent code (Bloc state comparison, \`Set\`/\`Map\` keys, tests).

## Do not report
- \`!\` immediately after a null check in the same expression/statement, or on a value
  the type system already proved non-null.

## Severity
CRITICAL when the unsafe cast/assertion sits on data from an external source
(network, platform channel, deep link). WARNING for internal, well-controlled data.`,
};

export const DART_ASYNC_CORRECTNESS: SeedSkill = {
  name: 'dart-async-correctness',
  type: 'rubric',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart diffs: flag unawaited futures, async forEach, a future/stream recreated on every build, and heavy synchronous work on the UI isolate.',
  body: `# Dart async correctness

## Flag
- A \`Future\` started and not awaited, stored, or wrapped in \`unawaited(...)\` — its
  error is silently dropped and its side effect races the surrounding code.
- \`list.forEach((x) async { await ... })\` — \`forEach\` does not await its callback; the
  futures run unordered and the caller moves on before they finish. Use a \`for\` loop
  (sequential) or \`Future.wait\` (parallel).
- \`FutureBuilder\`/\`StreamBuilder\` whose \`future\`/\`stream\` argument is created inline in
  \`build()\` (e.g. \`future: fetchData()\`) — a new future starts on every rebuild.
- A \`Stream\` subscription or controller with no \`onError\`, silently dropping errors.
- \`Future.wait\` on futures where one failing should not cancel the others, used without
  \`eagerError: false\` when that is the intent.
- CPU-heavy synchronous work (JSON parsing/decoding a large payload, image processing)
  run directly on the UI isolate instead of via \`compute()\`/an isolate — causes jank.

## Do not report
- A fire-and-forget future that is a deliberate, explicit \`unawaited(...)\` with a comment
  or an error handler attached (\`.catchError\`).

## Severity
CRITICAL when a dropped error can hide a failed write/payment/critical action.
WARNING for jank or a cosmetic race.`,
};

export const FLUTTER_PLATFORM_AND_ASSETS: SeedSkill = {
  name: 'flutter-platform-and-assets',
  type: 'convention',
  appliesTo: ['*.dart', 'pubspec.yaml', '*.arb', '**/AndroidManifest.xml', '**/Info.plist', '*.gradle', '*.kts'],
  description:
    'Use on Dart/Flutter diffs that add an asset, a plugin, a platform channel, or a user-facing string: check pubspec declarations, platform permissions, channel names, and .arb completeness.',
  body: `# Platform, assets and localization

## Flag
- An asset (image, font) referenced in Dart code (\`Image.asset\`, \`rootBundle.load\`) with
  no matching entry under \`flutter: assets:\`/\`fonts:\` in \`pubspec.yaml\`.
- A new plugin that needs a permission (camera, location, notifications, bluetooth) with
  no corresponding entry in \`AndroidManifest.xml\` (\`<uses-permission>\`) or \`Info.plist\`
  (an \`NSXxxUsageDescription\` key) in the same diff.
- A \`MethodChannel\`/\`EventChannel\` name or method name that changed on one platform side
  (Dart) without the matching native side, or vice versa — a channel mismatch fails
  silently at runtime (\`MissingPluginException\`).
- A new user-facing string hardcoded in a widget instead of added to the app's \`.arb\`
  files, when the repo has a localization setup (an \`l10n.yaml\` or \`AppLocalizations\` in
  the diff/repo).
- A key added to one locale's \`.arb\` file but not the app's other locale files (when more
  than one \`.arb\` exists in the repo).

## Do not report
- An asset/permission already present before this diff and merely referenced again.
- Repos with no localization setup at all — don't invent the requirement.

## Severity
WARNING — these fail at runtime, not compile time, but rarely corrupt data or leak
information. CRITICAL only if the missing permission would crash the app on launch.`,
};

export const DART_CODEGEN_SOURCES: SeedSkill = {
  name: 'dart-codegen-sources',
  type: 'convention',
  appliesTo: ['*.dart', 'build.yaml', 'pubspec.yaml'],
  description:
    'Use on Dart diffs that touch a build_runner source file (a class with part/@JsonKey/freezed annotations) or build.yaml: the generated output itself is excluded from review, so check the SOURCE stays consistent with what build_runner will produce.',
  body: `# Codegen source hygiene

Generated files (\`*.g.dart\`, \`*.freezed.dart\`, …) never reach this review — only the
source that drives them does. Judge whether the source will still generate correctly
and consistently.

## Flag
- A \`part '<name>.g.dart';\` / \`part '<name>.freezed.dart';\` directive whose name does not
  match the current file's name (build_runner generates from the file name).
- A \`@freezed\` class that gained a hand-written method or getter without the
  \`const ClassName._();\` private constructor freezed requires to allow it.
- A field renamed or retyped in a \`@JsonSerializable\`/\`@freezed\` class with a
  \`@JsonKey(name: ...)\` that still points at the OLD wire name when the wire format
  should not have changed, or a missing \`@JsonKey\` when it should have been added.
- A new default value or required-ness added to a generated model's field without
  considering existing serialized/cached data that lacks it.
- A change to \`build.yaml\` (builder options, generated file extensions) with no mention
  of re-running \`build_runner\` in the PR description, when it would invalidate cached
  generated output.

## Do not report
- The generated file's own content — it is not in the diff you can see, and it is not
  the source of truth; the source class is.

## Severity
WARNING for a naming/consistency slip that build_runner will simply fail loudly on
(caught at build time, not runtime). CRITICAL only when it would silently change the
wire format of already-serialized/cached data.`,
};

export const FLUTTER_UI_ACCESSIBILITY_AND_THEMING: SeedSkill = {
  name: 'flutter-ui-accessibility-and-theming',
  type: 'convention',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart/Flutter diffs that add or change a widget\'s UI: check for missing Semantics on icon-only controls, tap targets below 48dp, hardcoded colors/text styles instead of Theme, and layouts that break under larger text scale.',
  body: `# UI accessibility and theming

## Flag
- An icon-only, tappable control (\`IconButton\`, a bare \`GestureDetector\` around an
  \`Icon\`) with no \`tooltip\`/\`Semantics(label: ...)\` — a screen reader has nothing to
  announce.
- A tappable target smaller than ~48x48 logical pixels with no extra hit-area padding.
- A hardcoded \`Color(0x...)\`/named color or a hardcoded \`TextStyle\`/font size where the
  repo has a \`ThemeData\`/\`ColorScheme\` already in use nearby — breaks dark mode and
  custom themes.
- A fixed-height container wrapping text with no overflow handling
  (\`overflow\`/\`maxLines\`/a scrollable) — clips or overflows when the user's text-scale
  setting is increased.
- A \`Row\`/\`Column\` of text and controls with no \`Flexible\`/\`Expanded\` where content can
  grow, risking a render overflow.

## Do not report
- Intentional brand colors that don't come from the theme, when the surrounding code
  already establishes that pattern consistently.

## Severity
WARNING throughout — these are usability/accessibility regressions, not correctness
bugs, unless the overflow would visually hide a critical action (then CRITICAL).`,
};

export const FLUTTER_REBUILD_PERFORMANCE: SeedSkill = {
  name: 'flutter-rebuild-performance',
  type: 'rubric',
  appliesTo: DART_GLOBS,
  description:
    'Use on Dart/Flutter diffs: flag widgets that could be const but aren\'t, side effects or heavy work inside build(), unbounded lists without a builder constructor, and missing buildWhen/keys that cause extra rebuilds.',
  body: `# Flutter rebuild performance

## Flag
- A widget constructor that could be \`const\` (all fields are compile-time constant, no
  \`const\` modifier) — every parent rebuild reallocates it.
- I/O, a network/DB call, heavy computation, or object allocation inside \`build()\`
  instead of \`initState\`/a memoized field — runs on every rebuild, not once.
- \`ListView(children: [...])\`/\`Column(children: [...])\` built from a collection of
  unknown or unbounded size instead of \`ListView.builder\`/\`GridView.builder\`, which
  builds only visible items.
- A list of stateful/reorderable widgets built without a \`key\` (or a widget built with
  \`index\` as its key when items can be inserted/removed/reordered) — Flutter's diffing
  then reuses the wrong element's state.
- \`MediaQuery.of(context)\` used where only one property (size, padding) is needed instead
  of \`MediaQuery.sizeOf(context)\`/\`.paddingOf(context)\` — rebuilds on ANY MediaQuery
  change, not just the one that matters.
- A \`BlocBuilder\`/\`Consumer\`/\`Selector\` with no \`buildWhen\`/selector narrowing when only
  part of the state is used in \`build()\`, causing a rebuild on every state change.
- Decoding a large image at its native resolution and letting the widget scale it down,
  instead of \`cacheWidth\`/\`cacheHeight\` or a pre-sized asset.

## Do not report
- A widget that legitimately needs to rebuild often (an animation frame, a live value)
  and is already scoped narrowly (its own small widget, not the whole screen).

## Severity
WARNING — rebuild waste is a UX/jank issue, not data loss; CRITICAL only when it makes a
list with realistic production size (hundreds+ items) unusable.`,
};

export const FLUTTER_WIDGET_TESTING: SeedSkill = {
  name: 'flutter-widget-testing',
  type: 'rubric',
  appliesTo: ['*_test.dart', 'test/**', 'integration_test/**'],
  description:
    'Use when reviewing Dart/Flutter tests: flag a missing pump/pumpAndSettle around an async widget action, an untested loading/error state, a real network/backend call in a widget test, and bloc_test/mocktail misuse.',
  body: `# Flutter widget & Bloc testing

## Flag
- A widget action that triggers a rebuild or an animation (a tap, \`setState\`, a Bloc
  \`emit\`) with no \`await tester.pump()\`/\`pumpAndSettle()\` before the following assertion
  — the assertion runs against the pre-update frame.
  \`pumpAndSettle()\` used with a widget that has a continuous/endless animation — it
  times out; use \`pump(duration)\` with an explicit duration instead.
- A \`bloc_test\` whose \`act\` does not match what \`build\` seeds (state assumptions drift),
  or whose \`expect\` list is missing the initial emission an operation actually produces.
- \`mocktail\`: a fallback value not registered via \`registerFallbackValue\` for a custom
  type used with \`any()\`/\`captureAny()\` in an argument matcher — throws at test run time,
  not compile time.
- A widget test that performs a REAL HTTP call, hits a real backend, or waits on a real
  timer/clock instead of injecting a fake repository/clock — flaky and slow by
  construction.
- A new loading state, error state, or empty state added to a widget/Bloc with no test
  pumping it and asserting what's shown.
- A golden test added with no note on which platform/font it was generated for — golden
  tests are platform/font-rendering-dependent and flake across machines/CI otherwise.

## Do not report
- \`pump()\` omitted when the assertion only checks static, already-built content that
  needs no frame to settle.

## Severity
CRITICAL when the untested path is the main success/failure flow of new behaviour.
WARNING for a secondary state or a flaky-by-construction pattern that mostly passes.`,
};

const NODE_TS_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs'];

export const NODE_TS_CORRECTNESS: SeedSkill = {
  name: 'node-ts-correctness',
  type: 'rubric',
  appliesTo: NODE_TS_GLOBS,
  description:
    'Use on TypeScript/JavaScript diffs: flag Node/TS-specific correctness bugs — truthiness traps, ?? vs || confusion, forEach with an async callback, and unhandled promise rejections.',
  body: `# Node/TypeScript correctness

## Flag
- Truthiness traps: \`[]\`, \`0\`, \`''\` treated as "absent"; checking an array with \`if
  (!arr)\` to detect "empty" (an empty array is truthy — use \`arr.length === 0\`).
- \`??\` vs \`||\` confusion: \`||\` used where \`0\`/\`''\`/\`false\` is a valid, intended value
  (a fallback then wrongly overrides it), or \`??\` used where any falsy value SHOULD
  fall back.
- \`array.forEach(async (x) => { await ... })\` — \`forEach\` does not await its callback;
  errors are unhandled and the calls race instead of running in order. Use a \`for...of\`
  loop or \`Promise.all(array.map(...))\`.
- A missing \`await\` on a promise whose result or error matters to the caller.
- An \`async\` function whose promise is never awaited, stored, or explicitly handled at
  the call site, dropping its rejection.
- A tenant/workspace-scoping filter present on a similar existing query but missing from
  a new one in the same diff (cross-tenant data leak/mixup).

## Do not report
- Framework/library specifics unrelated to the diff's own logic (leave DB/HTTP-framework
  performance concerns to the Performance reviewer's own skills).

## Severity
CRITICAL when the bug can corrupt data, mix up tenants, or silently drop an error the
caller depends on. WARNING for a logic slip with a narrower blast radius.`,
};

export const NODE_FASTIFY_DRIZZLE_PERFORMANCE: SeedSkill = {
  name: 'node-fastify-drizzle-performance',
  type: 'rubric',
  appliesTo: NODE_TS_GLOBS,
  description:
    'Use on TypeScript/JavaScript diffs in a Node service using Fastify/Drizzle/Postgres: flag N+1 queries, connection-pool starvation, missing indexes, and unbounded external-API fan-out.',
  body: `# Node/Fastify/Drizzle performance

## Flag
- N+1 queries: a Drizzle query run inside a loop, \`.map\`, or per item instead of
  batched with \`inArray(...)\`, a join, or \`with\` relations.
- Missing index: filtering/joining/ordering on a column with no supporting index,
  especially on a table expected to grow.
- Holding a DB connection or an open transaction across slow, non-DB work (an LLM call,
  an external HTTP request, a git/subprocess call) — with a small connection pool this
  stalls the whole service.
- Sequential \`await\` in a loop for independent external calls where bounded concurrency
  (\`p-queue\`, \`Promise.all\`) would do, or the opposite: unbounded fan-out that can
  exhaust the pool or hit a third-party rate limit.
- A vector similarity (pgvector) query with no ANN index (HNSW/IVFFlat), no
  pre-filtering before the distance sort, or no \`limit\`.
- Buffering an entire response in memory instead of streaming it, especially over SSE.

## Do not report
- Dart/Flutter-side performance (rebuilds, isolates) — that's the Flutter skills' job.

## Severity
CRITICAL when it hits a hot path AND grows with load/data (N+1 on PR files, pool
starvation, an unbounded fan-out). WARNING for a warm/occasional path.`,
};

/** Skills bound only to the Flutter Reviewer, in prompt order. */
export const FLUTTER_REVIEWER_SKILLS: SeedSkill[] = [
  FLUTTER_ASYNC_CONTEXT_SAFETY,
  FLUTTER_RESOURCE_DISPOSAL,
  BLOC_CUBIT_CONVENTIONS,
  DART_NULL_SAFETY_AND_TYPES,
  DART_ASYNC_CORRECTNESS,
  FLUTTER_PLATFORM_AND_ASSETS,
  DART_CODEGEN_SOURCES,
  FLUTTER_UI_ACCESSIBILITY_AND_THEMING,
];
