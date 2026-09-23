# Repo stack label
Status: done

## Goal
Show what technology stack a repo actually is — framework, dominant languages, key
packages — the moment you look at it. Today DevDigest gives no signal at all: a Next.js
repo, a Flutter app and a Python service all look identical in the UI, and there's no
programmatic way to know either. A Flutter-first workflow especially needs this to
recognise Flutter/Dart repos at a glance and (in spec 07) to gate stack-specific skills.

## Scope
**In**
- A pure detector (`modules/repos/stack.ts` + `manifests.ts`): given a repo's tracked
  file list and the text of whatever manifests it has, produce `{frameworks, languages,
  packages}`. Manifests read: `pubspec.yaml`, `package.json`, `pyproject.toml` /
  `requirements.txt`, `go.mod`, `Cargo.toml`, `build.gradle(.kts)`, `Package.swift`.
- Detection wired into the existing clone job (covers Add + Refresh) plus a fire-and-
  forget boot-time backfill for repos cloned before this existed.
- `Repo.stack: RepoStack | null` in the wire contract; a new nullable `repos.stack`
  jsonb column.
- Client: a shared `RepoStackLabel` in the PR list header and the PR detail header, and
  the primary framework in the repo switcher's subline.

**Out**
- Dart/Flutter support in repo-intel (ast-grep has no built-in Dart grammar) — the
  repo skeleton/callers digest stays JS/TS-only regardless of this spec.
- Re-detecting on every PR poll or on resync — only clone/refresh and the one-time
  backfill trigger it (see Open questions).

## Design
Packages: server, client. Contract additions in `server/src/vendor/shared/contracts/platform.ts`:
```ts
RepoStackFramework = { name: string; path: string }        // path '' = repo root
RepoStackLanguage  = { name: string; share: number }        // 0..1, code files only
RepoStack = { frameworks: RepoStackFramework[]; languages: RepoStackLanguage[];
              packages: string[]; detected_at: string }
Repo.stack: RepoStack.nullish()   // null = not detected yet; never omitted from the wire shape
```
`server/src/db/schema/repos.ts` gains `stack: jsonb('stack')` (migration `0016`, a plain
`ADD COLUMN`, nullable — no backfill migration needed).

**Detection** (`modules/repos/`):
- `manifests.ts` — pure readers: `parsePubspec` (a 2-space-indent line reader, not a
  YAML parser; `isFlutter` = presence of `sdk: flutter` anywhere), `parsePackageJson`
  (real `JSON.parse`), `pythonFramework` (substring match for django/fastapi/flask).
- `stack.ts` — `findManifestPaths(files)` picks recognised filenames, shallow enough
  and capped (`MANIFEST_MAX_DEPTH`, `MAX_MANIFESTS`); `detectStack(files, manifests)`
  is pure and does all the actual reasoning:
  - **Frameworks**: one entry per manifest (pubspec → Flutter/Dart, package.json → the
    first of `NODE_FRAMEWORK_DEPS` found else Node.js, …); an Android `build.gradle`
    under a Flutter root's `android/` is skipped (it's the app's own scaffolding, not a
    second project). Ranked by code-file count under each manifest's folder, so
    `frameworks[0]` is "the app" and a monorepo's other manifests trail behind it.
  - **Languages**: junk/lockfile/generated paths dropped, then each Flutter root's
    `android|ios|macos|windows|linux/` scaffold dropped too (so a small app's
    Kotlin/Swift runner shell can't outweigh its own Dart), grouped by language name
    (`.ts`/`.tsx` collapse to one "TypeScript" bucket), top `MAX_LANGUAGES` kept above
    `MIN_LANGUAGE_SHARE`.
  - **Packages**: per-ecosystem allowlist (`KEY_PACKAGES.flutter` / `.node`) in
    priority order, with `PACKAGE_ALIASES` collapsing pub.dev variants
    (`hooks_riverpod`/`flutter_riverpod` → `riverpod`, every `firebase_*` → `firebase`).
- `RepoService.detectAndStoreStack(repoId, ref)` does the I/O (`GitClient.listFiles` +
  `readFile` per manifest) and is best-effort: any failure leaves `stack` as it was,
  never fails the clone/refresh it rides on. Called at the end of `runCloneJob`.
  `backfillMissingStacks()` calls it for every repo with a clone but no stack yet;
  fired (not awaited) from `repos/routes.ts` at boot, skipped under `NODE_ENV=test`.
- `RepoRepository.toRecord` parses the stored jsonb with `RepoStack.safeParse`,
  falling back to `null` — an old or malformed row can never break `GET /repos`'s
  response schema.

**Client**: `components/repo-stack/` — `formatStack` (one line, e.g. `"Flutter · Dart
92% Kotlin 5% · flutter_bloc, freezed, dio"`, `+N` on the framework when there's more
than one), `primaryFramework`, `otherFrameworks`. `RepoStackLabel` renders it (or "Stack
not detected yet" for `stack === null`, or nothing for `undefined`/empty). Wired into
the PR list header, the PR detail header (`PrDetailHeader`'s new `repoStack` prop), and
`RepoSwitcher`'s subline via `toShellRepo`.

## Acceptance
- Adding or refreshing a Flutter repo shows `Flutter · Dart …` in the PR list header
  within moments of the clone finishing (no manual action needed).
- A monorepo like DevDigest itself shows its primary app first (`Next.js +1` etc.),
  ranked by code volume, not manifest order.
- A repo cloned before this shipped gets a stack from the boot-time backfill without
  needing a manual Refresh.
- `GET /repos` never 500s regardless of what's in the `stack` column.

## Open questions
- Refresh doesn't move local HEAD (only `git fetch`; `resync` does), so a re-detect
  after Refresh reflects whatever commit is currently checked out, not necessarily
  origin's latest — acceptable since a repo's stack rarely changes PR-to-PR
  (`server/INSIGHTS.md`, 2026-09-23).
