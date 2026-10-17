import type { SkillCase } from "../../src/index.js";

// "quality" cases run with no tools: skillTask injects SKILL.md plus references/*.md as the system
// prompt and nothing else, so every prompt is self-contained and every grounding string comes from
// a concrete rule written in SKILL.md — remove the rule and the case goes red.
//   - id formats `AC-n (US-n)`, `EC-n`, `OQ-n`        → "Sections" table
//   - `shall`, WHILE / IF … THEN                       → principle 2 + "EARS patterns"
//   - `[reused: …]`, `[deterministic: …]`, `[new: …]`  → "Provenance tags"
//   - `Required handling`, `Who controls it`           → "Untrusted inputs" row
//   - `Status: draft`, `Amended:`                      → "Lifecycle"

export const cases: SkillCase[] = [
  {
    name: "a vague brief becomes EARS criteria with ids, one shall each, and an open question instead of an invented number",
    kind: "quality",
    prompt: `Write the User stories, Acceptance criteria and Edge cases sections of a DevDigest spec from this brief only:

"On the pull-request page the developer should be able to re-run a failed agent run with one click. It should be quick and handle errors properly. While it is re-running the old result should stay visible. If GitHub is down, tell the user. Build it with a React Query mutation in RerunButton.tsx."

Produce the three sections directly; do not ask me questions.`,
    grounding: ["AC-1 (US-", "EC-1", "OQ-1", "shall"],
    practices: [
      "every acceptance criterion carries an id and names the story it serves, in the shape `AC-n (US-n)`",
      "every acceptance criterion uses exactly one `shall` and one observable response; the EARS keyword (WHEN, WHILE, IF … THEN) is in capitals",
      "the 'while it is re-running' requirement is worded with WHILE and the 'GitHub is down' requirement with IF … THEN",
      "'quick' and 'properly' are not copied into a criterion as adjectives: the answer either states a concrete value that the brief gives or raises an open question (OQ-n) with a default, because the brief gives no number",
      "every edge case has the shape `EC-n: <situation> → <behaviour> (AC-n)` and names a criterion that exists in the answer",
      "no criterion names a file, component, hook or library (RerunButton.tsx and React Query stay out of the spec, or are called out as belonging in the plan, not the spec)",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    name: "a flawed spec fragment is reviewed rule by rule and each criterion is corrected",
    kind: "quality",
    prompt: `Review this draft DevDigest spec fragment and list every rule it breaks, with a corrected version of each criterion:

## User stories
- US-1: As a user, I want better summaries.
- US-2: As a developer, I want to filter findings by severity, so that I can read the critical ones first.

## Acceptance criteria (EARS)
- AC-1 (US-2): When the user picks a severity, \`FindingsList\` shall filter with \`useMemo\` and update the URL.
- AC-2: The system shall be fast.
- AC-3 (US-2): The filter should remember the last choice.

## Edge cases
- EC-1: no findings match → show an empty state

## Inputs and provenance
| Input | Provenance | Notes |
|---|---|---|
| Finding severity | from the database | |
| Summary text | [new: 1 LLM call] | |`,
    grounding: ["[reused:"],
    practices: [
      "flags US-1: it has no 'so that' benefit clause and a vague role and capability, and no acceptance criterion serves it",
      "flags AC-1 for two responses (filter and update the URL) and for implementation details (a component name and a React hook)",
      "flags AC-2 for naming no story and for 'fast' not being checkable; flags AC-3 for using 'should' instead of `shall`",
      "flags EC-1 for naming no covering criterion and says a criterion for the empty state must be added or an open question raised",
      "flags 'from the database' as not being a provenance tag and proposes a `[reused: …]` or `[deterministic: …]` tag instead",
      "flags the `[new: 1 LLM call]` row because its Notes give no reason why nothing existing can serve",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
  {
    name: "inputs get exactly one provenance tag and third-party data gets a required handling, not code",
    kind: "quality",
    prompt: `Fill in the "Inputs and provenance" and "Untrusted inputs" sections of a DevDigest spec for this feature: "Suggest a better title for a pull request". Facts you may use:

- the PR's diff, fetched from GitHub; the PR author controls it
- the PR's current title and description, also from GitHub, written by the PR author
- the one-sentence intent summary of the PR that an earlier feature (L03 intent) already produced and stored
- the list of changed files and their languages, which the repo-intel module already computes without a model
- the suggestion itself, which needs a new model call; nothing existing writes titles

Produce both tables directly; do not ask me questions.`,
    grounding: ["[reused:", "[deterministic:", "[new: 1 LLM call]", "Who controls it", "Required handling"],
    practices: [
      "the Inputs table has the columns Input, Provenance and Notes, and every input row carries exactly one provenance tag",
      "the L03 intent summary is tagged `[reused: …]` and the repo-intel file list is tagged `[deterministic: repo-intel]`",
      "the new model call is tagged `[new: 1 LLM call]` and its Notes say why nothing existing can serve",
      "the Untrusted inputs table has the columns Input, Who controls it, Where it goes and Required handling, and lists the diff and the PR title/description as attacker-controlled",
      "the Required handling cells state a requirement in words (for example 'treated as data, never as instructions' or 'rendered as text, never as HTML'), not code or a library call",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
  {
    name: "a gap found in an approved spec is amended back to draft under new ids",
    kind: "quality",
    prompt: `SPEC-12 is \`Status: approved\`. It has US-1 and US-2, AC-1 to AC-5 and EC-1 to EC-2. While planning, we found that nothing says what happens when a pull request has more than 200 findings: the list should show the first 50 and a "Show more" control. Also AC-3 says "within 2 s" but the user confirmed it must be 3 s.

What exactly do you change in the spec? Show the header lines, the new items with their ids, and what happens next.`,
    grounding: ["Status: draft", "Amended:", "AC-6"],
    practices: [
      "the spec is set back to `Status: draft` instead of being edited silently while still approved",
      "an `Amended: <date> — <ids> (<who found it>)` header line is added",
      "the new requirement is added under the next free id (AC-6, and a new EC if an edge case is needed) and no existing id is renumbered, reused or deleted",
      "AC-3 is reworded under its own id (AC-3 stays AC-3, now with 3 s) rather than replaced by a new id",
      "the answer says the user must approve the spec again: the author does not set `Status: approved` itself",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
];
