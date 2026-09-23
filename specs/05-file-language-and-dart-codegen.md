# Per-file language chip + Dart codegen exclusion
Status: done

## Goal
DevDigest is stack-agnostic today, but gives the reviewer (human or LLM) no signal about
what language a changed file is in, and doesn't know that a Flutter/Dart repo has its own
class of build-step output. Two small, independent fixes toward a Flutter-first fork that
still supports every other stack:
1. A short language label on each changed file in the diff viewer.
2. Dart/Flutter codegen (`build_runner`, protobuf, gen-l10n, platform tool output) excluded
   from the review diff, the same way the design-export mock data already is.

## Scope
**In**
- One shared `ext → language` table (`@devdigest/shared`), used by the client chip and,
  later, the server repo-stack detector (spec 06) — one source of truth, not two guesses.
- A generalized glob matcher in `modules/reviews/diff-filter.ts` (`matchesAny`), replacing
  the four hardcoded pattern forms with a small gitignore-like compiler, so a pattern can
  combine a fixed directory with a wildcard filename (`**/l10n/app_localizations*.dart`) —
  needed for the codegen list below and reused by `applies_to` gating later (spec 07).
- `REVIEW_EXCLUDED_PATHS` additions for Dart/Flutter codegen and platform-tool output.
- `FileCard` renders a small mono chip (label + tooltip) between the file icon and path;
  a generated file shows `<label> · gen` and starts collapsed.

**Out**
- Syntax highlighting (no highlighter exists in the client; out of scope here).
- The repo-level stack label (spec 06) and skill/agent `applies_to` gating (spec 07) —
  this spec only lays the shared table and matcher they both build on.

## Design
Packages: server, client. Contract in `server/src/vendor/shared/contracts/languages.ts`
(synced to the client copy via `./scripts/shared-contracts.sh sync`):
```ts
type LanguageKind = 'code' | 'markup' | 'config' | 'data' | 'doc';
interface LanguageInfo { label: string; name: string; kind: LanguageKind }
languageOf(path): LanguageInfo | null      // by exact filename, else by extension
isGeneratedPath(path): boolean             // GENERATED_FILE_PATTERN
```
`GENERATED_FILE_PATTERN`, `JUNK_DIR_PATTERN`, `LOCKFILE_PATTERN`, `SCAFFOLD_DIR_PATTERN`
moved here from `modules/conventions/constants.ts` (which now re-exports them) — a constant
needed by more than one module belongs in the core (onion-architecture).

`matchesAny(path, patterns)` (`modules/reviews/diff-filter.ts`) now compiles each pattern to
a `RegExp` (cached): no `/` and no wildcard → exact full-path match; everything else is a
glob, anchored to the root unless it starts with `**/`, with an optional trailing `/**` and
`*`/`?` wildcards within a segment. All previously-supported forms behave identically
(covered by existing + new unit tests).

Client: `components/diff-viewer/helpers.ts` → `fileChip(path)`; colour map in `constants.ts`
(`LANGUAGE_CHIP_COLOR`, grey fallback); rendered in `FileCard.tsx` as a `mono` chip with a
`title` tooltip (`shell.diffViewer.languageTitle` / `generatedTitle`); generated files start
collapsed (`open` state).

## Acceptance
- A `.g.dart`/`.freezed.dart`/gen-l10n/protobuf/Flutter-tool-output file changed in a PR is
  dropped from both `diff.files` and `diff.raw` before the prompt is built.
- Every changed file in the diff viewer shows a language chip when recognised; an
  unrecognised path (e.g. `LICENSE`) shows none.
- A generated file's chip reads `<label> · gen`, its card starts collapsed, and it can still
  be expanded by clicking.
- `matchesAny` unit tests cover every existing `REVIEW_EXCLUDED_PATHS` entry unchanged plus
  the new Dart/Flutter ones, including the two-level and wildcard-filename forms.

## Open questions
- e2e coverage for the chip was skipped: the seeded demo repo (`acme/payments-api`) has only
  `.ts` files, and `ts` is too short/generic a substring for `wait --text` to assert
  reliably (agent-browser's `wait --text` is a page-wide substring match — see
  `e2e/docs/authoring-a-flow.md`). Component tests (`FileCard.test.tsx`) cover it precisely
  instead; revisit once a Flutter demo repo/PR is seeded.
