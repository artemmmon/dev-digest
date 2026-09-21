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
