# Spec authoring in DevDigest

How the rules in [SKILL.md](../SKILL.md) map onto this repository.

## Where a spec lives

| Feature touches | Folder | Index |
|---|---|---|
| One package | `<package>/specs/` (`server`, `client`, `reviewer-core`, `e2e`, `mcp`) | that folder's `README.md` |
| Several packages | `specs/` | `specs/README.md` |

Add the spec's line to the folder's `README.md` index in the format that index already uses.

## Number and name

- **Number.** `NN` is one sequence across all spec folders: the highest of the root
  `specs/NN-*.md` numbers and every `Spec ID: SPEC-NN` found in any spec folder, plus one. The
  header carries it as `Spec ID: SPEC-NN`. Package folders also hold legacy specs numbered from
  `01` in their own sequence; those numbers do not count.
- **Name.** The spec is named after the feature: the title is `# Spec: <feature name>`, the name a
  user would call it ("Smart Diff", "Run Cost Badge"), not a task or a ticket ("Add column",
  "Lesson 5 homework"). The file is `NN-<feature-name>.md`: the same name in kebab-case, shortened
  only by dropping filler words, e.g. `10-smart-diff.md`.
- **Language.** English, like every file in the repo.

## Two templates

| | Current | Legacy |
|---|---|---|
| Which specs | SPEC-10 onward, every spec folder | Root specs 01–09 and the older package specs |
| Marker | Has a `Spec ID:` line | No `Spec ID:` line |
| Sections | The ten in [assets/spec-template.md](../assets/spec-template.md) | Goal / Scope / Design / Acceptance / Open questions |
| `Status` | `draft \| approved \| implemented` | `draft \| in progress \| done \| dropped` |
| Checked by `check-spec.mjs` | Yes | Skipped |

Do not convert a legacy spec. To change what one says, write a new spec with `Supersedes:`.

## Who touches a spec

| Who | Does what | Enforced by |
|---|---|---|
| `spec-creator` | Writes the spec as `Status: draft`, updates the folder index. Amends an approved spec by reopening it as a draft (`Amended:` line, new ids only) | `.claude/hooks/spec-creator-guard.mjs` blocks every other path, tool and status, and on an approved spec every edit except the one that makes it a draft again; the PostToolUse hook runs `check-spec.mjs --hook` on each write |
| The user | Reviews the draft and sets `Status: approved` | Nobody else may |
| `brainstorm` | Reads the approved spec, compares ways to build it. Stops on a draft | Read-only for specs |
| `implementation-planner` | Cites every `AC-n`, `EC-n` and `NFR-n` on a step's `Covers` line. Stops on a draft. Never edits the spec; a gap becomes a recommended amendment | Read-only for specs; `.claude/skills/feature-flow/assets/check-plan.mjs` fails a plan with an id no step cites, or a spec that is not approved |
| `implementer` | Sets `Status: implemented` with the plan's last group; changes nothing else in the spec | — |
| `test-writer` | When tests are on (`/sdd --tests`; off by default for now): writes at least one test per `AC-n` and `EC-n`, with the id first in the test name (`it('AC-3: …')`) | — |
| `implementation-verifier` | One matrix row per `AC-n`, `EC-n` and `NFR-n`, under the spec's own ids; finds each id's tests by searching for the id | Read-only |

This is why ids never change after approval, and why each criterion has exactly one response: the
verifier gives one verdict per id.

## Sources a spec is written from

- **Design:** `client/docs/design/` — find the screen in `artboards.md`, then read its source for
  layout, states and copy text. `client/docs/design/README.md` lists known gaps between the
  mockups and the product; mock data in the design is not a contract.
- **Figma:** read tools only (`get_*`). No link, or no tool available → ask for an export or a
  screenshot; do not guess.
- **Contracts between packages:** `server/src/vendor/shared` is the canonical copy. A spec may
  list the fields that cross a boundary, in wire spelling (`snake_case`), without naming the file.
- **Lessons:** each touched package's `AGENTS.md`, and `INSIGHTS.md` only where it is about the
  feature: the module folders it touches (today only `server/src/modules/repo-intel/` has its
  own), the touched packages, and the matching entries of the root file. Not all of them.
- **Research:** `spec-creator` may start `researcher` agents, one concrete question each, several
  in parallel, for what reading does not settle. Repository findings are facts with `path:line`;
  outside findings support a question or a proposal.
- **Related specs:** every spec folder — one that overlaps, that this one extends, or that it
  replaces.

Always exclude `server/clones/`, `node_modules/`, `.next/`, `dist/` and `temp/` from searches.

## Provenance in this product

DevDigest already computes a lot before any new model call. Look here first:

| What exists | Tag to use |
|---|---|
| Stored results of earlier lessons' features: intent, findings and their severity, run cost and tokens, conventions, repo stack | `[reused: <feature or lesson>]`, e.g. `[reused: L03 intent]` |
| Facts code derives without a model: file roles and languages, the repo index, diff structure | `[deterministic: <module>]`, e.g. `[deterministic: repo-intel]` |
| Nothing above serves | `[new: N LLM call]`, with the reason in Notes and the cost as an `NFR` |

Check the module's code before you tag: name the stored result in the discovery report with
`path:line` as evidence, then keep the path out of the spec itself.

## Untrusted inputs in this product

The `security` skill's table "Where attacker-controlled data enters DevDigest" is the list to
check against: cloned repository contents and names, pull-request title, body, comments and diff,
model output, HTTP requests to the API, user-supplied URLs. A feature that shows, stores or
forwards any of these lists it under **Untrusted inputs** with the required handling.

## The check

- By hand or in a session: `node .claude/skills/spec-authoring/assets/check-spec.mjs [spec.md …]`.
- For `spec-creator`: a PostToolUse hook in the agent's frontmatter runs it with `--hook` after
  each Write or Edit and hands the errors back to the agent (it has no shell).
- In CI: the `pr-self-review` workflow runs the script's tests, the guard's tests and the check
  itself whenever a spec folder or `.claude/` changes.

## Open questions

1. `pr-self-review`'s `routing.json` routes no skill to `specs/**`, so a changed spec is checked
   mechanically (the check above) but not reviewed against this skill by `pr-skill-reviewer`.
2. Priority per story or criterion (must / should) and a verification method per criterion (test /
   inspection / e2e) are not in the template. spec-kit prioritises stories [S3]; add them here only
   when `brainstorm` or `implementation-verifier` starts to need them.
3. The legacy root specs 01–09 stay in their old shape; nothing reads their Acceptance bullets by
   id.
